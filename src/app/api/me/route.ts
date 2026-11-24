export const maxDuration = 30;

import { NextResponse } from "next/server";
import { requireSession, apiAuthErrorResponse, normalizeRole } from "@/lib/api-auth";
import { getDb } from "@/lib/db";

/**
 * GET /api/me — returns the caller's identity from the HttpOnly session cookie.
 *
 * The frontend should use this INSTEAD of localStorage `fp_*_id` keys to know
 * who is logged in (ROLE_UI_AUDIT items C1 / S3 / E1). The profile object is
 * fetched fresh from the DB, so a stale localStorage snapshot can never render
 * another user's dashboard.
 */

const PROFILE_TABLES: Record<string, string> = {
  admin: "admin_users",
  kam: "kam_users",
  cm: "campus_managers",
  cam: "campus_managers",
  mentor: "mentors",
  student: "students",
  sme: "sme_users",
  fee_manager: "users",
  hr: "users",
  "L and D": "users",
  program_ops: "users"
};

const PRIVATE_PROFILE_FIELD = /password|secret|token|aadhar|pan_number/i;

function toSafeProfile(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null;
  return Object.fromEntries(Object.entries(profile).filter(([key]) => !PRIVATE_PROFILE_FIELD.test(key)));
}

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const role = normalizeRole(session.role);
    const userId = session.userId;

    let profile: Record<string, unknown> | null = null;
    let campus: Record<string, unknown> | null = null;
    let portfolioCampuses: Record<string, unknown>[] = [];
    let classInchargeAssignments: Record<string, unknown>[] = [];
    const table = PROFILE_TABLES[role];

    if (table && userId) {
      try {
        const db = await getDb();
        // Session userId is the role-profile id (reference_id) at login; fall back
        // to email match for legacy accounts whose reference_id differs.
        profile = await db.get(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, userId) || null;
        if (!profile && session.email) {
          profile = await db.get(`SELECT * FROM ${table} WHERE email = ? LIMIT 1`, session.email) || null;
        }
        if (!profile && (role === "fee_manager" || role === "hr" || role === "L and D" || role === "program_ops")) {
          profile = await db.get("SELECT * FROM users WHERE id = ? OR email = ? LIMIT 1", userId, session.email || "") || null;
        }
        if (profile?.college_id) {
          campus = await db.get("SELECT id, name, code, kam_id FROM colleges WHERE id = ?", profile.college_id) || null;
          const kamId = profile.kam_id || (campus as any)?.kam_id;
          if (kamId) {
            const kam = await db.get("SELECT id, name, title FROM kam_users WHERE id = ?", kamId).catch(() => null);
            if (campus && kam) campus = { ...campus, kam_name: kam.name, kam_title: kam.title };
          }
        }
        if (profile && role === "kam" && profile.id) {
          portfolioCampuses = await db.all(
            "SELECT id, name, code FROM colleges WHERE kam_id = ? ORDER BY name",
            profile.id
          ).catch(() => []);
        }
        if (profile && role === "mentor" && profile.id && profile.college_id) {
          classInchargeAssignments = await db.all(
            `SELECT id, year, department, classGroup, updated_at
             FROM class_mentor_assignments
             WHERE mentor_id = ? AND college_id = ?
             ORDER BY year ASC, classGroup ASC`,
            profile.id,
            profile.college_id
          ).catch(() => []);
        }
      } catch (err) {
        console.error("[/api/me] profile lookup failed:", err);
      }
    }

    return NextResponse.json({
      success: true,
      session: {
        userId,
        role,
        email: session.email || null,
        collegeId: session.collegeId || null,
        name: session.name || null,
        exp: session.exp
      },
      profile: toSafeProfile(profile),
      campus,
      portfolioCampuses,
      classInchargeAssignments
    });
  } catch (err) {
    const authRes = apiAuthErrorResponse(err);
    if (authRes) return authRes;
    return NextResponse.json({ success: false, message: "Failed to resolve session." }, { status: 500 });
  }
}
