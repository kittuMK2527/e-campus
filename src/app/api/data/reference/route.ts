export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
// Cold cache fans out six full-slice reads at once; 60s keeps it under the
// pool's statement_timeout while leaving the 5-minute cache do the real work.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";

const REF_TTL_MS = 5 * 60_000;
type RefEntry = { at: number; payload: any; etag: string };
const refCache = new Map<string, RefEntry>();
const refInFlight = new Map<string, Promise<RefEntry>>();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("college_id") || searchParams.get("collegeId");
    const cacheKey = collegeId || "__all__";

    let entry = refCache.get(cacheKey);
    if (!entry || Date.now() - entry.at >= REF_TTL_MS) {
      let pending = refInFlight.get(cacheKey);
      if (!pending) {
        // Share the load and cache write, not the request-specific response.
        pending = (async () => {
          const db = await getDb();
          const scope = collegeId ? "college_id = ? OR college_id IS NULL" : "1=1";
          const scopedArgs = collegeId ? [collegeId] : [];
          const [colleges, subjects, courses, departments, academicYears, settingsRows] = await Promise.all([
            db.all("SELECT * FROM colleges ORDER BY name ASC"),
            db.all(`SELECT * FROM subjects WHERE ${scope} ORDER BY department, name LIMIT 5000`, ...scopedArgs),
            db.all(`SELECT * FROM courses WHERE ${scope} ORDER BY name LIMIT 2000`, ...scopedArgs),
            db.all(`SELECT * FROM departments WHERE ${scope} ORDER BY name LIMIT 2000`, ...scopedArgs),
            db.all("SELECT * FROM academic_years").catch(() => []),
            db.all("SELECT key, value FROM system_settings").catch(() => [])
          ]);

          const systemSettings: Record<string, any> = {
            mailing_enabled: true,
            attendance_lock_enabled: true
          };
          (settingsRows || []).forEach((row: any) => {
            if (row.key !== "mailing_enabled" && row.key !== "attendance_lock_enabled") return;
            try {
              systemSettings[row.key] = JSON.parse(row.value);
            } catch {
              systemSettings[row.key] = row.value === "true" ? true : row.value === "false" ? false : row.value;
            }
          });

          const payload = {
            success: true,
            colleges: colleges || [],
            subjects: subjects || [],
            courses: courses || [],
            departments: (departments && departments.length > 0) ? departments : (courses || []),
            academicYears: (academicYears || []).map((ay: any) => typeof ay === "string" ? ay : ay.year || ay.year_name || ay.name || String(ay)),
            systemSettings
          };
          const etag = `"${crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex")}"`;
          const loaded = { at: Date.now(), payload, etag };
          refCache.set(cacheKey, loaded);
          if (refCache.size > 100) refCache.clear();
          return loaded;
        })().finally(() => {
          // Failed loads must not prevent a later request from retrying.
          refInFlight.delete(cacheKey);
        });
        refInFlight.set(cacheKey, pending);
      }
      entry = await pending;
    }

    const cacheHeaders = {
      "ETag": entry.etag,
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300"
    };
    if (request.headers.get("if-none-match") === entry.etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    return NextResponse.json(entry.payload, { status: 200, headers: cacheHeaders });
  } catch (error: any) {
    console.error("API GET data/reference error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
