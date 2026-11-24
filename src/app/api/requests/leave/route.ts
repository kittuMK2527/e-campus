export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { dispatchSystemNotification } from "@/lib/notifications";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";

type OdAction = "mentor_approve" | "cm_approve" | "reject";

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const d = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` === value;
}

function dateList(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && result.length <= 31) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    result.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

async function getAssignedMentor(db: any, student: any) {
  return db.get(
    `SELECT m.id, m.name, m.email
     FROM class_mentor_assignments cma
     JOIN mentors m ON m.id = cma.mentor_id
     WHERE LOWER(TRIM(cma.college_id)) = LOWER(TRIM(?))
       AND LOWER(TRIM(cma.classGroup)) = LOWER(TRIM(?))
     ORDER BY cma.updated_at DESC NULLS LAST
     LIMIT 1`,
    [student.college_id, student.classGroup]
  );
}

async function notify(db: any, input: { users?: string[]; roles?: string[]; collegeId?: string; title: string; message: string; link: string; dedupeKey: string }) {
  return dispatchSystemNotification(db, {
    userIds: input.users,
    roles: input.roles,
    collegeId: input.collegeId,
    title: input.title,
    message: input.message,
    link: input.link,
    type: "approval",
    domain: "student_od",
    action: "updated",
    dedupeKey: input.dedupeKey,
    push: false,
  });
}

async function listForUser(db: any, user: any) {
  const role = String(user.role || "").toLowerCase();
  const profileId = user.reference_id || user.id;
  if (role === "student") {
    return db.all(
      `SELECT lr.*, COALESCE(lr.start_date, lr.dateStr) AS start_date,
              COALESCE(lr.end_date, lr.dateStr) AS end_date
       FROM leave_requests lr
       WHERE lr.type = 'OD' AND lr.studentId IN (
         SELECT id FROM students WHERE id = ? OR LOWER(email) = LOWER(?)
       )
       ORDER BY lr.timestamp DESC LIMIT 100`,
      [profileId, user.email]
    );
  }
  if (role === "mentor") {
    return db.all(
      `SELECT lr.*, COALESCE(lr.start_date, lr.dateStr) AS start_date,
              COALESCE(lr.end_date, lr.dateStr) AS end_date
       FROM leave_requests lr
       JOIN students s ON s.id = lr.studentId
       JOIN class_mentor_assignments cma
         ON LOWER(TRIM(cma.classGroup)) = LOWER(TRIM(s.classGroup))
        AND LOWER(TRIM(cma.college_id)) = LOWER(TRIM(s.college_id))
       WHERE lr.type = 'OD' AND cma.mentor_id = ? AND lr.status IN ('pending_mentor', 'pending_cm', 'approved', 'rejected')
       ORDER BY lr.timestamp DESC LIMIT 200`,
      [profileId]
    );
  }
  if (role === "cm" && user.college_id) {
    return db.all(
      `SELECT lr.*, COALESCE(lr.start_date, lr.dateStr) AS start_date,
              COALESCE(lr.end_date, lr.dateStr) AS end_date
       FROM leave_requests lr JOIN students s ON s.id = lr.studentId
       WHERE lr.type = 'OD' AND LOWER(TRIM(s.college_id)) = LOWER(TRIM(?))
         AND lr.status IN ('pending_cm', 'approved', 'rejected')
       ORDER BY lr.timestamp DESC LIMIT 200`,
      [user.college_id]
    );
  }
  return [];
}

export async function GET(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["student", "mentor", "cm"] });
  if (errorResponse) return errorResponse;
  try {
    await ensureMigration("student_od_approval_flow");
    const db = await getDb();
    const requests = await listForUser(db, auth!.user);
    return NextResponse.json({ success: true, requests });
  } catch (error: any) {
    console.error("GET /api/requests/leave error:", error);
    return NextResponse.json({ success: false, message: "OD requests could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["student"], checkCsrf: true });
  if (errorResponse) return errorResponse;
  try {
    await ensureMigration("student_od_approval_flow");
    const db = await getDb();
    const actor = auth!.user;
    const body = await request.json();
    const startDate = body.startDate || body.dateStr;
    const endDate = body.endDate || startDate;
    const reason = String(body.reason || "").trim();
    if (!validDate(startDate) || !validDate(endDate) || endDate < startDate || dateList(startDate, endDate).length > 31) {
      return NextResponse.json({ success: false, message: "Choose a valid OD date range of 31 days or less." }, { status: 400 });
    }
    if (startDate < getInstitutionDateStr()) {
      return NextResponse.json({ success: false, message: "OD requests must start today or on a future date." }, { status: 400 });
    }
    if (reason.length < 8 || reason.length > 500) {
      return NextResponse.json({ success: false, message: "Add a reason between 8 and 500 characters." }, { status: 400 });
    }
    const student = await db.get("SELECT id, name, classGroup, college_id FROM students WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1", [actor.reference_id || actor.id, actor.email]);
    if (!student) return NextResponse.json({ success: false, message: "Student profile was not found." }, { status: 404 });
    const mentor = await getAssignedMentor(db, student);
    if (!mentor) return NextResponse.json({ success: false, message: "No class mentor is assigned to your class yet. Contact your campus office." }, { status: 409 });

    const overlap = await db.get(
      `SELECT id FROM leave_requests
       WHERE studentId = ? AND type = 'OD'
         AND status IN ('pending_mentor', 'pending_cm', 'approved')
         AND COALESCE(start_date, dateStr) <= ? AND COALESCE(end_date, dateStr) >= ?
       LIMIT 1`,
      [student.id, endDate, startDate]
    );
    if (overlap) return NextResponse.json({ success: false, message: "An OD request already exists for part of this date range." }, { status: 409 });

    const id = generateId("od");
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO leave_requests
       (id, studentId, studentName, classGroup, type, dateStr, start_date, end_date, college_id, mentor_id, reason, status, timestamp)
       VALUES (?, ?, ?, ?, 'OD', ?, ?, ?, ?, ?, ?, 'pending_mentor', ?)`,
      [id, student.id, student.name, student.classGroup, startDate, startDate, endDate, student.college_id, mentor.id, reason, now]
    );
    await notify(db, {
      users: [mentor.id], title: "Student OD request", message: `${student.name} submitted an OD request for ${startDate}${endDate !== startDate ? ` to ${endDate}` : ""}.`,
      link: "/mentor/student_od", dedupeKey: `student_od:${id}:mentor_review`,
    });
    notifyRealtimeEvent({ domain: "student_od", action: "created", collegeId: student.college_id, targetUserIds: [mentor.id, student.id], payload: { requestId: id } });
    return NextResponse.json({ success: true, request: { id, studentId: student.id, studentName: student.name, classGroup: student.classGroup, type: "OD", dateStr: startDate, start_date: startDate, end_date: endDate, reason, status: "pending_mentor", timestamp: now } });
  } catch (error: any) {
    console.error("POST /api/requests/leave error:", error);
    return NextResponse.json({ success: false, message: "OD request could not be submitted." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return PATCH(request);
}

export async function PATCH(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["mentor", "cm"], checkCsrf: true });
  if (errorResponse) return errorResponse;
  try {
    await ensureMigration("student_od_approval_flow");
    const db = await getDb();
    const actor = auth!.user;
    const role = String(actor.role || "").toLowerCase();
    const { requestId, action, reason = "" } = await request.json() as { requestId?: string; action?: OdAction; reason?: string };
    if (!requestId || !["mentor_approve", "cm_approve", "reject"].includes(String(action))) {
      return NextResponse.json({ success: false, message: "Choose a valid OD review action." }, { status: 400 });
    }
    const od = await db.get(
      `SELECT lr.*, s.name AS current_student_name, s.classGroup AS current_class_group,
              s.college_id AS current_college_id
       FROM leave_requests lr JOIN students s ON s.id = lr.studentId WHERE lr.id = ? AND lr.type = 'OD'`,
      [requestId]
    );
    if (!od) return NextResponse.json({ success: false, message: "OD request not found." }, { status: 404 });

    const nextStatus = action === "reject" ? "rejected" : action === "mentor_approve" ? "pending_cm" : "approved";
    const expectedStatus = action === "mentor_approve" || (action === "reject" && role === "mentor")
      ? "pending_mentor"
      : action === "cm_approve" || (action === "reject" && role === "cm") ? "pending_cm" : null;
    if (action === "mentor_approve" && role !== "mentor") return NextResponse.json({ success: false, message: "Only the assigned mentor can review this step." }, { status: 403 });
    if (action === "cm_approve" && role !== "cm") return NextResponse.json({ success: false, message: "Only the campus manager can complete this approval." }, { status: 403 });
    if (action === "reject" && !["mentor", "cm"].includes(role)) return NextResponse.json({ success: false, message: "You cannot reject this request." }, { status: 403 });

    if (role === "mentor") {
      const assignment = await getAssignedMentor(db, { college_id: od.current_college_id, classGroup: od.current_class_group });
      if (!assignment || assignment.id !== (actor.reference_id || actor.id)) return NextResponse.json({ success: false, message: "Only the student's assigned class mentor can review this request." }, { status: 403 });
    } else if (role === "cm" && (!actor.college_id || String(actor.college_id).toLowerCase() !== String(od.current_college_id || "").toLowerCase())) {
      return NextResponse.json({ success: false, message: "This OD request belongs to another campus." }, { status: 403 });
    }
    if (expectedStatus && od.status !== expectedStatus) return NextResponse.json({ success: false, message: "This request is not waiting for your approval step." }, { status: 409 });
    if (!expectedStatus) return NextResponse.json({ success: false, message: "This review action is not available to your role." }, { status: 403 });
    if (action === "reject" && String(reason).trim().length > 500) return NextResponse.json({ success: false, message: "Rejection note must be 500 characters or fewer." }, { status: 400 });

    const approverName = actor.name || actor.email || "Reviewer";
    await db.transaction(async (tx: any) => {
      const update = action === "mentor_approve"
        ? await tx.run("UPDATE leave_requests SET status = ?, mentor_approved_by = ?, mentor_approved_at = ? WHERE id = ? AND status = 'pending_mentor'", [nextStatus, approverName, new Date().toISOString(), requestId])
        : action === "cm_approve"
          ? await tx.run("UPDATE leave_requests SET status = ?, approvedBy = ?, cm_approved_by = ?, cm_approved_at = ? WHERE id = ? AND status = 'pending_cm'", [nextStatus, approverName, approverName, new Date().toISOString(), requestId])
          : await tx.run("UPDATE leave_requests SET status = 'rejected', approvedBy = ?, rejection_reason = ? WHERE id = ? AND status = ?", [approverName, String(reason).trim() || null, requestId, expectedStatus]);
      if (update.changes !== 1) throw new Error("OD request changed while it was being reviewed. Refresh and try again.");

      if (action === "cm_approve") {
        const startDate = String(od.start_date || od.dateStr).slice(0, 10);
        const endDate = String(od.end_date || od.dateStr).slice(0, 10);
        const existingPeriodRows = await tx.all(
          `SELECT sa.id FROM student_attendance sa
           JOIN slots sl ON sl.id = sa.slotId
           WHERE sa.studentId = ? AND LOWER(TRIM(sl.classGroup)) = LOWER(TRIM(?))
             AND sa.dateStr >= ? AND sa.dateStr <= ?`,
          [od.studentId, od.current_class_group, startDate, endDate]
        );
        for (const row of existingPeriodRows) {
          await tx.run(
            "UPDATE student_attendance SET status = 'od', markedBy = ?, timestamp = ? WHERE id = ?",
            [`Approved OD: ${approverName}`, new Date().toISOString(), row.id]
          );
        }
      }

    });

    if (action === "mentor_approve") {
      await notify(db, { roles: ["cm"], collegeId: od.current_college_id, title: "OD request needs campus approval", message: `${od.current_student_name}’s OD request has mentor approval and is ready for your review.`, link: "/cm/approvals?tab=student_od", dedupeKey: `student_od:${requestId}:cm_review` });
    } else {
      await notify(db, { users: [od.studentId], title: action === "cm_approve" ? "OD request approved" : "OD request update", message: action === "cm_approve" ? `Your OD request for ${od.start_date || od.dateStr}${od.end_date && od.end_date !== (od.start_date || od.dateStr) ? ` to ${od.end_date}` : ""} was approved.` : `Your OD request was rejected.${String(reason).trim() ? ` Note: ${String(reason).trim()}` : ""}`, link: "/student/on_duty", dedupeKey: `student_od:${requestId}:${nextStatus}` });
    }
    notifyRealtimeEvent({ domain: "student_od", action: "updated", collegeId: od.current_college_id, targetUserIds: [od.studentId, od.mentor_id, actor.reference_id || actor.id], payload: { requestId, status: nextStatus } });
    if (action === "cm_approve") notifyRealtimeEvent({ domain: "attendance", action: "student_od_approved", collegeId: od.current_college_id, targetRoles: ["student", "mentor", "cm"], payload: { studentId: od.studentId, startDate: od.start_date || od.dateStr, endDate: od.end_date || od.dateStr } });
    return NextResponse.json({ success: true, status: nextStatus, requestId });
  } catch (error: any) {
    console.error("PATCH /api/requests/leave error:", error);
    const isConflict = String(error?.message || "").includes("changed while");
    return NextResponse.json({ success: false, message: error?.message || "OD request could not be updated." }, { status: isConflict ? 409 : 500 });
  }
}
