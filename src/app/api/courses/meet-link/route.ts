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

    // Find course record
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
    if (!course) {
      course = await db.get("SELECT * FROM courses LIMIT 1");
    }

    // If SME, verify subject match or allow head SME
    let resolvedSmeSubject = "";
    if (user.role === "sme") {
      const smeProfile = await db.get(
        "SELECT * FROM smes WHERE id = ? OR user_id = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [user.reference_id || user.id, user.id, user.email]
      );
      resolvedSmeSubject = (smeProfile?.subject || subject || "").toLowerCase().trim();
      const courseMatch = course ? (course.name || "").toLowerCase().trim() : "";
      const courseCodeMatch = course ? (course.code || "").toLowerCase().trim() : "";
      const isMatch = !resolvedSmeSubject || !courseMatch || courseMatch.includes(resolvedSmeSubject) || resolvedSmeSubject.includes(courseMatch) || (courseCodeMatch && (courseCodeMatch === resolvedSmeSubject || courseCodeMatch.includes(resolvedSmeSubject))) || Boolean(smeProfile?.is_head_sme);
      if (!isMatch) {
        return NextResponse.json({ success: false, message: "Unauthorized: You can only set the Google Meet link for courses within your assigned subject domain." }, { status: 403 });
      }
    }

    if (course) {
      await db.run("UPDATE courses SET google_meet_link = ? WHERE id = ?", [normalizedLink, course.id]);
    }

    if (user.role === "sme" && resolvedSmeSubject) {
      await db.run(
        "UPDATE courses SET google_meet_link = ? WHERE LOWER(TRIM(name)) LIKE ? OR LOWER(TRIM(code)) = ?",
        [normalizedLink, `%${resolvedSmeSubject}%`, resolvedSmeSubject]
      ).catch(() => {});
    }

    // Propagate constant link to upcoming demo sessions for this course / subject and for this SME
    if (normalizedLink) {
      await db.run(
        `UPDATE demo_sessions
         SET meet_link = ?
         WHERE (
           LOWER(TRIM(subject)) = LOWER(TRIM(?))
           OR LOWER(TRIM(subject)) = LOWER(TRIM(?))
           OR (? != '' AND LOWER(TRIM(subject)) = LOWER(TRIM(?)))
           OR smeId = ?
           OR smeId = ?
         )
         AND status IN ('scheduled', 'confirmed')`,
        [
          normalizedLink,
          course ? course.name : "",
          course ? (course.code || course.name) : "",
          subject || "",
          subject || "",
          user.reference_id || user.id,
          user.id
        ]
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
