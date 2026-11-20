export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth, Role } from "@/lib/authGuard";
import { normalizeGoogleMeetLink } from "@/lib/google-calendar";

const ALLOWED_ROLES: Role[] = ["admin", "cm", "kam", "sme"];

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ALLOWED_ROLES });
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const user = auth.user;

    const body = await request.json().catch(() => ({}));
    const { courseId, courseName, subject, meetLink } = body;

    const trimmedLink = String(meetLink || "").trim();
    if (trimmedLink && !trimmedLink.includes("meet.google.com/")) {
      return NextResponse.json({
        success: false,
        message: "Invalid Google Meet link. It must start with https://meet.google.com/ followed by the meeting code."
      }, { status: 400 });
    }

    const normalizedLink = trimmedLink ? normalizeGoogleMeetLink(trimmedLink) : null;
    const db = await getDb();

    // Ensure google_meet_link column exists across sme_users, courses, and demo_sessions
    await db.exec(`
      ALTER TABLE sme_users ADD COLUMN IF NOT EXISTS google_meet_link TEXT;
      ALTER TABLE courses ADD COLUMN IF NOT EXISTS google_meet_link TEXT;
      ALTER TABLE demo_sessions ADD COLUMN IF NOT EXISTS meet_link TEXT;
    `).catch(() => {});

    // SME Role: Permanent link for SME's own subject domain and scheduled demo sessions
    if (user.role === "sme") {
      const smeProfile = await db.get(
        "SELECT * FROM sme_users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [user.reference_id || user.id, user.email]
      ).catch(() => null);

      const resolvedSmeSubject = (smeProfile?.subject || subject || "").trim();

      // 1. Save on SME user profile
      await db.run(
        "UPDATE sme_users SET google_meet_link = ? WHERE id = ? OR LOWER(email) = LOWER(?)",
        [normalizedLink, user.reference_id || user.id, user.email]
      ).catch(() => {});

      // 2. Update courses matching SME's subject domain (if any)
      if (resolvedSmeSubject) {
        await db.run(
          "UPDATE courses SET google_meet_link = ? WHERE LOWER(TRIM(name)) LIKE ? OR LOWER(TRIM(code)) = ? OR LOWER(TRIM(name)) = LOWER(TRIM(?))",
          [normalizedLink, `%${resolvedSmeSubject.toLowerCase()}%`, resolvedSmeSubject.toLowerCase(), resolvedSmeSubject.toLowerCase()]
        ).catch(() => {});
      }

      // 3. If a specific courseId was passed, update that course as well
      if (courseId) {
        await db.run("UPDATE courses SET google_meet_link = ? WHERE id = ?", [normalizedLink, courseId]).catch(() => {});
      }

      // 4. Propagate permanent meet link to all upcoming demo sessions for this SME or subject
      await db.run(
        `UPDATE demo_sessions
         SET meet_link = ?
         WHERE (
           smeId = ?
           OR smeId = ?
           OR (? != '' AND LOWER(TRIM(subject)) = LOWER(TRIM(?)))
         )
         AND status IN ('scheduled', 'confirmed')`,
        [
          normalizedLink,
          user.reference_id || user.id,
          user.id,
          resolvedSmeSubject,
          resolvedSmeSubject
        ]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: "Permanent Google Meet link saved successfully.",
        subject: resolvedSmeSubject,
        google_meet_link: normalizedLink
      });
    }

    // Admin, CM, or KAM role updating course-specific links
    let course = null;
    if (courseId) {
      course = await db.get("SELECT * FROM courses WHERE id = ?", [courseId]);
    }
    if (!course && courseName) {
      course = await db.get("SELECT * FROM courses WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1", [courseName]);
    }
    if (!course && subject) {
      course = await db.get("SELECT * FROM courses WHERE LOWER(TRIM(name)) LIKE ? OR LOWER(TRIM(code)) = ? LIMIT 1", [`%${String(subject).toLowerCase().trim()}%`, String(subject).toLowerCase().trim()]);
    }

    if (course) {
      await db.run("UPDATE courses SET google_meet_link = ? WHERE id = ?", [normalizedLink, course.id]);
    }

    if (normalizedLink && (course || subject)) {
      const matchName = course ? course.name : (subject || "");
      const matchCode = course ? (course.code || course.name) : (subject || "");
      await db.run(
        `UPDATE demo_sessions
         SET meet_link = ?
         WHERE (LOWER(TRIM(subject)) = LOWER(TRIM(?)) OR LOWER(TRIM(subject)) = LOWER(TRIM(?)))
           AND status IN ('scheduled', 'confirmed')`,
        [normalizedLink, matchName, matchCode]
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: "Constant course Google Meet link saved successfully.",
      courseId: course?.id || null,
      google_meet_link: normalizedLink
    });
  } catch (err: any) {
    console.error("[POST /api/courses/meet-link] error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Internal server error" }, { status: 500 });
  }
}
