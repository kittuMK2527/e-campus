export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { CLASSROOM_SNAPS, sbRest, sbHeaders, normCollegeName } from "@/lib/audit-sources";
import { fetchWithTimeout, UPLOAD_FETCH_TIMEOUT_MS } from "@/lib/net";
import { generateId } from "@/lib/id";

// ── Classroom Observation Log — proxied from the legacy classroom_snaps table ──
// GET  ?college=<name>            → list observations for a college (or all if omitted & allowed)
// POST { formData multipart }     → upload photo to storage bucket + insert row (+ escalation mail)

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const { searchParams } = new URL(request.url);
    const college = (searchParams.get("college") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "60", 10) || 60, 200);

    let path = `${CLASSROOM_SNAPS.table}?select=*&order=created_at.desc&limit=${limit}`;
    if (college) {
      // Legacy rows store the college verbatim — fetch a superset then fuzzy-match server-side
      path += `&college=ilike.${encodeURIComponent("%" + college.replace(/[%_]/g, "") + "%")}`;
    }

    const rows: any[] = await sbRest(CLASSROOM_SNAPS.url, CLASSROOM_SNAPS.key, path);

    // Extra safety: fuzzy filter client-side-invisible matching (server does the scoping)
    const scoped = college
      ? rows.filter(r => {
          const a = normCollegeName(String(r.college || ""));
          const b = normCollegeName(college);
          return a === b || a.includes(b) || b.includes(a);
        })
      : rows;

    return NextResponse.json({ success: true, count: scoped.length, observations: scoped });
  } catch (err: any) {
    console.error("Observations GET error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load classroom observations" },
      { status: 500 }
    );
  }
}

interface ObsPayload {
  college: string;
  manager_name?: string | null;
  class_name?: string | null;
  department?: string | null;
  subject?: string | null;
  course_name?: string | null;
  course_type?: string | null;
  teacher_name?: string | null;
  mentor_name?: string | null;
  notes?: string | null;
  comments?: string | null;
  observation_date?: string | null;
  photo_url?: string | null;
  photo_lat?: number | null;
  photo_lng?: number | null;
  photo_location_accuracy?: number | null;
  /** Session-end evidence. Needs the additive `photo_end_url` column (scripts/classroom_snaps_capture_stage.sql). */
  photo_end_url?: string | null;
  rating_professionalism?: number | null;
  rating_class_handling?: number | null;
  rating_skill_development?: number | null;
  rating_student_engagement?: number | null;
  rating_tasks_followup?: number | null;
  rating_session_plan_adherence?: number | null;
  rating_study_material_sharing?: number | null;
  overall_rating?: number | null;
  satisfaction_status?: string | null;
  satisfaction_remarks?: string | null;
}

const RATING_FIELDS = [
  "rating_professionalism",
  "rating_class_handling",
  "rating_skill_development",
  "rating_student_engagement",
  "rating_tasks_followup",
  "rating_session_plan_adherence",
  "rating_study_material_sharing"
] as const;

class PhotoUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** One evidence photo into the legacy storage bucket; returns its public URL. */
async function uploadSnapPhoto(file: File, college: string, stage: "start" | "end"): Promise<string> {
  const label = stage === "start" ? "Session start" : "Session end";
  if (file.size > 8 * 1024 * 1024) {
    throw new PhotoUploadError(`${label} photo must be under 8MB`, 400);
  }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const objectPath = `${college || "unknown"}/${generateId("obs")}.${ext}`;
  let upRes: Response;
  try {
    upRes = await fetchWithTimeout(
      `${CLASSROOM_SNAPS.url}/storage/v1/object/${CLASSROOM_SNAPS.bucket}/${encodeURIComponent(objectPath)}`,
      {
        method: "POST",
        headers: { ...sbHeaders(CLASSROOM_SNAPS.key), "cache-control": "3600", "x-upsert": "false" },
        body: await file.arrayBuffer()
      },
      UPLOAD_FETCH_TIMEOUT_MS
    );
  } catch (e: any) {
    console.error(`${label} photo upload timed out:`, e?.message);
    throw new PhotoUploadError(`${label} photo upload timed out. Please retry.`, 502);
  }
  if (!upRes.ok) {
    const t = await upRes.text().catch(() => "");
    console.error(`${label} photo upload failed:`, upRes.status, t.slice(0, 200));
    throw new PhotoUploadError(`${label} photo upload failed (${upRes.status}). Check bucket write policy.`, 502);
  }
  return `${CLASSROOM_SNAPS.url}/storage/v1/object/public/${CLASSROOM_SNAPS.bucket}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const contentType = request.headers.get("content-type") || "";

    let payload: ObsPayload;
    let photoFile: File | null = null;
    let endPhotoFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      photoFile = form.get("photo") instanceof File ? (form.get("photo") as File) : null;
      endPhotoFile = form.get("photo_end") instanceof File ? (form.get("photo_end") as File) : null;
      const raw = form.get("payload");
      if (!raw) return NextResponse.json({ success: false, message: "Missing payload field" }, { status: 400 });
      payload = JSON.parse(String(raw));
    } else {
      payload = await request.json();
    }

    if (!payload.college) {
      return NextResponse.json({ success: false, message: "Missing college" }, { status: 400 });
    }
    if (!payload.overall_rating || Number(payload.overall_rating) < 1) {
      return NextResponse.json({ success: false, message: "Overall rating is required" }, { status: 400 });
    }
    const remarks = String(payload.satisfaction_remarks || payload.notes || "").trim();
    if (payload.satisfaction_status === "not_satisfied" && remarks.split(/\s+/).filter(Boolean).length < 20) {
      return NextResponse.json(
        { success: false, message: "Remarks must be at least 20 words when not satisfied" },
        { status: 400 }
      );
    }

    // ── Optional evidence photos to the legacy storage bucket (server-side creds).
    // Both stages go up concurrently; a session that records start and end keeps
    // one row with two URLs rather than two half-observations.
    if ((photoFile && photoFile.size > 0) || (endPhotoFile && endPhotoFile.size > 0)) {
      try {
        const [startUrl, endUrl] = await Promise.all([
          photoFile && photoFile.size > 0
            ? uploadSnapPhoto(photoFile, payload.college, "start")
            : Promise.resolve<string | null>(null),
          endPhotoFile && endPhotoFile.size > 0
            ? uploadSnapPhoto(endPhotoFile, payload.college, "end")
            : Promise.resolve<string | null>(null)
        ]);
        if (startUrl) payload.photo_url = startUrl;
        if (endUrl) payload.photo_end_url = endUrl;
      } catch (err: any) {
        if (!(err instanceof PhotoUploadError)) throw err;
        return NextResponse.json({ success: false, message: err.message }, { status: err.status });
      }
    }

    // Normalize fields to match the legacy table shape (both aliases populated)
    const row: ObsPayload = {
      ...payload,
      class_name: payload.class_name ?? payload.department ?? null,
      subject: payload.subject ?? payload.course_name ?? null,
      teacher_name: payload.teacher_name ?? payload.mentor_name ?? null,
      mentor_name: payload.mentor_name ?? payload.teacher_name ?? null,
      comments: payload.comments ?? payload.notes ?? null,
      notes: payload.notes ?? payload.comments ?? null
    };

    let endPhotoStored = !row.photo_end_url;
    try {
      await sbRest(CLASSROOM_SNAPS.url, CLASSROOM_SNAPS.key, CLASSROOM_SNAPS.table, {
        method: "POST",
        headers: sbHeaders(CLASSROOM_SNAPS.key, { Prefer: "return=minimal" }),
        body: JSON.stringify(row)
      });
      endPhotoStored = true;
    } catch (err: any) {
      // A deployment that has not applied scripts/classroom_snaps_capture_stage.sql
      // rejects the new column. The observation must survive that, so retry once
      // without the session-end evidence rather than losing the whole visit.
      if (!row.photo_end_url) throw err;
      const legacyRow = { ...row };
      delete legacyRow.photo_end_url;
      await sbRest(CLASSROOM_SNAPS.url, CLASSROOM_SNAPS.key, CLASSROOM_SNAPS.table, {
        method: "POST",
        headers: sbHeaders(CLASSROOM_SNAPS.key, { Prefer: "return=minimal" }),
        body: JSON.stringify(legacyRow)
      });
      endPhotoStored = false;
    }

    return NextResponse.json({
      success: true,
      photo_url: payload.photo_url || null,
      photo_end_url: endPhotoStored ? payload.photo_end_url || null : null,
      capture_stage_saved: endPhotoStored
    });
  } catch (err: any) {
    console.error("Observations POST error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to save classroom observation" },
      { status: 500 }
    );
  }
}
