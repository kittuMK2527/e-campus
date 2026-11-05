export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { ensureMigration } from "@/lib/migrations";
import { normalizeRole, requireAuth } from "@/lib/authGuard";
import { getInstitutionDateStrOffset } from "@/lib/localDate";

const SECRET_COLUMNS = [
  "password_hash",
  "password",
  "plain_password",
  "temp_password",
  "reset_token",
  "reset_token_expires",
  "otp",
  "otp_expires"
];

function stripSecrets(rows: any[]): any[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of SECRET_COLUMNS) {
      if (key in row) delete row[key];
    }
  }
  return rows;
}

// Attendance is the largest section of the payload; send it as positional rows
// (keys are stripped) and let the client rehydrate the objects.
const ATTENDANCE_WIRE_FIELDS = [
  "id",
  "studentId",
  "slotId",
  "dateStr",
  "status",
  "type",
  "mode",
  "markedBy",
  "timestamp",
  "attendanceTypeSub",
  "coveredSubject"
] as const;

function compactAttendance(rows: any[]): any[][] {
  return (rows || []).map((a: any) => ATTENDANCE_WIRE_FIELDS.map((field) => a?.[field] ?? null));
}

/** Names the slice that failed so the client can report it without seeing raw SQL. */
function sliceSection(sql: string): string {
  return sql.match(/FROM\s+([a-zA-Z0-9_"]+)/i)?.[1] || "unknown";
}

export async function GET(request: Request) {
  try {
    // Role and scope come from the verified session, never from the query string.
    const { auth, errorResponse } = await requireAuth(request, { checkCsrf: false });
    if (errorResponse || !auth) {
      return errorResponse || NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await ensureMigration("audit_logs_extended_columns").catch(() => {});
    await ensureMigration("student_attendance_extended_columns").catch(() => {});
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const role = normalizeRole(auth.user.role);
    const userId = auth.user.reference_id || auth.user.id;
    const fields = searchParams.get("fields"); // e.g. "attendance" for surgical re-fetch

    // Only admin and KAM may pick another campus; everyone else is pinned to their own.
    let collegeId: string | null = (role === "admin" || role === "kam")
      ? (searchParams.get("college_id") || searchParams.get("collegeId") || null)
      : (auth.user.college_id || null);
    // KAM: resolve all assigned college IDs for multi-college scoping
    let kamCollegeIds: string[] = [];
    if (role === "kam" && userId) {
      const kamRow = await db.get(
        "SELECT id FROM kam_users WHERE id = ? OR email = ? OR id IN (SELECT reference_id FROM users WHERE id = ? OR email = ?)",
        userId, userId, userId, userId
      );
      if (kamRow?.id) {
        const kamColleges = await db.all("SELECT id FROM colleges WHERE kam_id = ?", kamRow.id);
        kamCollegeIds = kamColleges.map((c: any) => c.id);
      }
    }

    // Attendance history windows. Institution-day based, not UTC-day based: the
    // Vercel clock is UTC and the campuses are IST (UTC+5:30), so a UTC-derived
    // "today" is still yesterday between 00:00 and 05:29 IST and would cut the
    // window off a day early.
    // Full academic semester coverage: 180 days.
    const fullDateThreshold = getInstitutionDateStrOffset(-180);
    // Mentors used to get 30 days while the week picker lets them page back
    // further — older marked slots came back unmarked and could be re-submitted.
    const mentorDateThreshold = getInstitutionDateStrOffset(-90);

    // ── FAST PATH: attendance-only re-fetch (used after bulk import / mentor mark) ──
    if (fields === "attendance") {
      let attSql: string;
      let attParams: any[];
      if (role === "student" && userId) {
        attSql = "SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE studentId = ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT 2000";
        attParams = [userId];
      } else if (role === "mentor" && userId) {
        attSql = "SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa WHERE (sa.slotId IN (SELECT id FROM slots WHERE mentorId = ?) OR sa.markedBy = ?) AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr ASC LIMIT 20000";
        attParams = [userId, userId, mentorDateThreshold];
      } else if (collegeId) {
        attSql = "SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id = ? AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr ASC LIMIT 60000";
        attParams = [collegeId, fullDateThreshold];
      } else {
        attSql = "SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE dateStr >= ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT 60000";
        attParams = [fullDateThreshold];
      }
      const att = await db.all(attSql, ...attParams);
      return NextResponse.json({
        success: true,
        studentAttendance: compactAttendance(att),
        studentAttendanceFormat: "compact"
      });
    }

    // ── Optimized Query Constraints based on Role & Scope ──
    const isMentor = role === "mentor";
    const isStudent = role === "student";
    const isCM = role === "cm";
    const isAdmin = role === "admin" || (role as string) === "superadmin";
    const isKAM = role === "kam";
    const isAdminOrKAM = isAdmin || isKAM;

    // Dynamic queries — for KAM with multiple colleges, build IN-clause helpers
    const kamHasColleges = isKAM && kamCollegeIds.length > 0;
    const kamInClause = kamHasColleges ? `(${kamCollegeIds.map(() => "?").join(",")})` : null;

    // Unscoped (institution-wide) reads carry a ceiling: a growing table must not
    // turn the dashboard load into an out-of-memory function. Any slice that comes
    // back exactly full is reported as truncated below, so short data is never
    // presented as complete data.
    const CAPS = {
      mentors: 5000, slots: 40000, students: 5000, users: 5000, subjectGroups: 2000,
      colleges: 1000, academicEvents: 5000, facultyLeaves: 5000,
      demoSessions: 1000, demoSwaps: 200
    };

    const mentorSql = kamHasColleges
      ? `SELECT * FROM mentors WHERE college_id IN ${kamInClause}`
      : collegeId ? "SELECT * FROM mentors WHERE college_id = ?" : `SELECT * FROM mentors LIMIT ${CAPS.mentors}`;
    const mentorParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const slotSql = kamHasColleges
      ? `SELECT * FROM slots WHERE college_id IN ${kamInClause}`
      : collegeId ? "SELECT * FROM slots WHERE college_id = ?" : `SELECT * FROM slots LIMIT ${CAPS.slots}`;
    const slotParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const studentSql = isStudent && userId
      ? "SELECT * FROM students WHERE id = ?"
      : kamHasColleges
        ? `SELECT * FROM students WHERE college_id IN ${kamInClause}`
        : collegeId
          ? "SELECT * FROM students WHERE college_id = ?"
          : `SELECT * FROM students LIMIT ${CAPS.students}`;
    const studentParams = (isStudent && userId) ? [userId] : kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const subjectSql = kamHasColleges
      ? `SELECT * FROM subjects WHERE college_id IN ${kamInClause} OR college_id IS NULL`
      : collegeId ? "SELECT * FROM subjects WHERE college_id = ? OR college_id IS NULL" : "SELECT * FROM subjects";
    const subjectParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const courseSql = kamHasColleges
      ? `SELECT * FROM courses WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY name`
      : collegeId ? "SELECT * FROM courses WHERE college_id = ? OR college_id IS NULL ORDER BY name" : "SELECT * FROM courses ORDER BY name";
    const courseParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const departmentSql = kamHasColleges
      ? `SELECT * FROM departments WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY name`
      : collegeId ? "SELECT * FROM departments WHERE college_id = ? OR college_id IS NULL ORDER BY name" : "SELECT * FROM departments ORDER BY name";
    const departmentParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const holidaySql = kamHasColleges
      ? `SELECT * FROM holidays WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY date`
      : collegeId ? "SELECT * FROM holidays WHERE college_id = ? OR college_id IS NULL ORDER BY date" : "SELECT * FROM holidays ORDER BY date";
    const holidayParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const announcementSql = kamHasColleges
      ? `SELECT * FROM announcements WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY created_at DESC LIMIT 30`
      : collegeId ? "SELECT * FROM announcements WHERE college_id = ? OR college_id IS NULL ORDER BY created_at DESC LIMIT 30" : "SELECT * FROM announcements ORDER BY created_at DESC LIMIT 30";
    const announcementParams = kamHasColleges ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    // Role-optimized attendance query (Role-scoped date windows to prevent memory & transfer bloat)
    let attendanceSql = "SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE dateStr >= ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr ASC LIMIT 60000";
    let attendanceParams: any[] = [fullDateThreshold];

    if (isStudent && userId) {
      attendanceSql = "SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE studentId = ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT 2000";
      attendanceParams = [userId];
    } else if (kamHasColleges) {
      attendanceSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id IN ${kamInClause} AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr ASC LIMIT 60000`;
      attendanceParams = [...kamCollegeIds, fullDateThreshold];
    } else if (isMentor && userId) {
      // Mentor only needs attendance for their assigned slots or where they marked attendance
      attendanceSql = "SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa WHERE (sa.slotId IN (SELECT id FROM slots WHERE mentorId = ?) OR sa.markedBy = ?) AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr ASC LIMIT 20000";
      attendanceParams = [userId, userId, mentorDateThreshold];
    } else if (isCM && collegeId) {
      // CAM monitoring view scopes to full semester window for college
      attendanceSql = "SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id = ? AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr ASC LIMIT 60000";
      attendanceParams = [collegeId, fullDateThreshold];
    } else if (collegeId) {
      attendanceSql = "SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id = ? AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr ASC LIMIT 60000";
      attendanceParams = [collegeId, fullDateThreshold];
    }

    // Attendance is by far the heaviest slice here: on the local snapshot 23 000 rows is
    // 3.4 MB of the ~4.2 MB admin payload, more than every other slice combined. Only four
    // surfaces read it — admin's monitoring and insight tabs plus the CAM, mentor and
    // student dashboards (the only isExamDate() callers are those same three). A KAM, SME,
    // L&D or fee manager was downloading every attendance row of their campuses, or of the
    // whole institution, into an array no component touches. /api/data?fields=attendance
    // stays open for any of them if a KAM view starts needing it.
    if (!(isStudent || isMentor || isCM || isAdmin)) {
      attendanceSql = "SELECT 1 WHERE 1=0";
      attendanceParams = [];
    }

    const isSME = role === "sme";
    const isLnd = role === "L and D";
    const needsDemo = isAdmin || isSME || isLnd || isCM || isMentor;

    // Demo reads are per-role: a mentor only needs their own sessions, an SME only
    // the ones they assess, a CM their campus (demo_sessions has no college_id, so
    // scope via its mentors), and admin/L&D the institution. Unscoped slices used to
    // send every campus's demos to every mentor.
    let demoSessionSql: string;
    let demoSessionParams: any[];
    let demoSwapSql: string;
    let demoSwapParams: any[];
    if (isMentor && userId) {
      demoSessionSql = `SELECT * FROM demo_sessions WHERE mentorId = ? ORDER BY created_at DESC LIMIT ${CAPS.demoSessions}`;
      demoSessionParams = [userId];
      demoSwapSql = `SELECT * FROM demo_swap_requests WHERE mentorId = ? OR proposedMentorId = ? ORDER BY created_at DESC LIMIT ${CAPS.demoSwaps}`;
      demoSwapParams = [userId, userId];
    } else if (isSME && userId) {
      demoSessionSql = `SELECT * FROM demo_sessions WHERE smeId = ? ORDER BY created_at DESC LIMIT ${CAPS.demoSessions}`;
      demoSessionParams = [userId];
      demoSwapSql = `SELECT * FROM demo_swap_requests WHERE smeId = ? OR proposedSmeId = ? ORDER BY created_at DESC LIMIT ${CAPS.demoSwaps}`;
      demoSwapParams = [userId, userId];
    } else if (isCM) {
      demoSessionSql = collegeId
        ? `SELECT * FROM demo_sessions WHERE mentorId IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY created_at DESC LIMIT ${CAPS.demoSessions}`
        : "SELECT 1 WHERE 1=0";
      demoSessionParams = collegeId ? [collegeId] : [];
      demoSwapSql = collegeId
        ? `SELECT * FROM demo_swap_requests WHERE mentorId IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY created_at DESC LIMIT ${CAPS.demoSwaps}`
        : "SELECT 1 WHERE 1=0";
      demoSwapParams = collegeId ? [collegeId] : [];
    } else if (needsDemo) {
      demoSessionSql = `SELECT * FROM demo_sessions ORDER BY created_at DESC LIMIT ${CAPS.demoSessions}`;
      demoSessionParams = [];
      demoSwapSql = `SELECT * FROM demo_swap_requests ORDER BY created_at DESC LIMIT ${CAPS.demoSwaps}`;
      demoSwapParams = [];
    } else {
      demoSessionSql = "SELECT 1 WHERE 1=0";
      demoSessionParams = [];
      demoSwapSql = "SELECT 1 WHERE 1=0";
      demoSwapParams = [];
    }

    // Leave requests scoping
    let leaveSql: string;
    let leaveParams: any[] = [];
    if (isStudent && userId) {
      leaveSql = "SELECT * FROM leave_requests WHERE studentId = ? OR studentId IN (SELECT id FROM students WHERE id = ? OR email = ?) ORDER BY timestamp DESC LIMIT 100";
      leaveParams = [userId, userId, userId];
    } else if (kamHasColleges && !isStudent) {
      leaveSql = `SELECT * FROM leave_requests WHERE studentId IN (SELECT id FROM students WHERE college_id IN ${kamInClause}) ORDER BY timestamp DESC LIMIT 100`;
      leaveParams = [...kamCollegeIds];
    } else if (collegeId && !isStudent) {
      leaveSql = "SELECT lr.* FROM leave_requests lr LEFT JOIN students s ON lr.studentId = s.id WHERE LOWER(TRIM(s.college_id)) = LOWER(TRIM(?)) OR LOWER(TRIM(lr.classGroup)) IN (SELECT LOWER(TRIM(classGroup)) FROM class_mentor_assignments WHERE LOWER(TRIM(college_id)) = LOWER(TRIM(?))) OR LOWER(TRIM(lr.classGroup)) IN (SELECT LOWER(TRIM(mentor_group)) FROM mentors WHERE LOWER(TRIM(college_id)) = LOWER(TRIM(?))) ORDER BY lr.timestamp DESC LIMIT 100";
      leaveParams = [collegeId, collegeId, collegeId];
    } else if (!isStudent && (isCM || isAdminOrKAM)) {
      leaveSql = "SELECT * FROM leave_requests ORDER BY timestamp DESC LIMIT 100";
      leaveParams = [];
    } else {
      leaveSql = "SELECT 1 WHERE 1=0";
      leaveParams = [];
    }

    const queryDefs = [
      { sql: mentorSql, params: mentorParams },
      { sql: slotSql, params: slotParams },
      { sql: (!isStudent && (isMentor || isCM || isAdminOrKAM)) ? (collegeId ? "SELECT * FROM handover_requests WHERE requestorId IN (SELECT id FROM mentors WHERE college_id = ?) OR targetStaffId IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY timestamp DESC LIMIT 60" : "SELECT * FROM handover_requests ORDER BY timestamp DESC LIMIT 60") : "SELECT 1 WHERE 1=0", params: (!isStudent && (isMentor || isCM || isAdminOrKAM) && collegeId) ? [collegeId, collegeId] : [] },
      { sql: (!isStudent && (isMentor || isCM || isAdminOrKAM)) ? "SELECT * FROM approved_handovers LIMIT 60" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: (isAdminOrKAM || isCM) ? "SELECT id, type, description, actorName, actorRole, timestamp, old_status, new_status, reason, changed_by FROM audit_logs ORDER BY timestamp DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: subjectSql, params: subjectParams },
      { sql: courseSql, params: courseParams },
      { sql: studentSql, params: studentParams },
      { sql: attendanceSql, params: attendanceParams },
      { sql: leaveSql, params: leaveParams },
      { sql: kamHasColleges ? `SELECT * FROM colleges WHERE id IN ${kamInClause}` : (isKAM && kamCollegeIds.length === 0 ? "SELECT 1 WHERE 1=0" : `SELECT * FROM colleges LIMIT ${CAPS.colleges}`), params: kamHasColleges ? [...kamCollegeIds] : [] },
      { sql: (userId && (isAdminOrKAM || isCM)) ? "SELECT id, user_id, title, message, is_read, link, type, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 15" : "SELECT 1 WHERE 1=0", params: (userId && (isAdminOrKAM || isCM)) ? [userId] : [] },
      { sql: announcementSql, params: announcementParams },
      { sql: holidaySql, params: holidayParams },
      { sql: isAdmin ? "SELECT id, user_id, login_time, logout_time, ip, device FROM login_history ORDER BY login_time DESC LIMIT 30" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdmin ? `SELECT id, email, role, reference_id, status, must_change_password, last_login, created_at, updated_at FROM users LIMIT ${CAPS.users}` : "SELECT 1 WHERE 1=0", params: [] },
      { sql: (isStudent && collegeId) ? "SELECT * FROM weekly_tasks WHERE mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?) ORDER BY week_number ASC LIMIT 200" : (collegeId && (isCM || isMentor) ? "SELECT * FROM weekly_tasks WHERE mentor_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?) ORDER BY week_number ASC LIMIT 200" : (isAdminOrKAM ? "SELECT * FROM weekly_tasks ORDER BY week_number ASC LIMIT 200" : "SELECT 1 WHERE 1=0")), params: (isStudent && collegeId) ? [collegeId, collegeId] : (collegeId && (isCM || isMentor) ? [userId || "", collegeId, collegeId] : []) },
      { sql: (isStudent && userId) ? "SELECT * FROM student_tracker WHERE student_id = ? OR student_id IN (SELECT id FROM students WHERE id = ? OR email = ?) ORDER BY updated_at DESC LIMIT 500" : (collegeId && (isCM || isMentor) ? "SELECT * FROM student_tracker WHERE student_id IN (SELECT id FROM students WHERE college_id = ?) OR graded_by = ? ORDER BY updated_at DESC LIMIT 500" : (isAdminOrKAM ? "SELECT * FROM student_tracker ORDER BY updated_at DESC LIMIT 500" : "SELECT 1 WHERE 1=0")), params: (isStudent && userId) ? [userId, userId, userId] : (collegeId && (isCM || isMentor) ? [collegeId, userId || ""] : []) },
      { sql: needsDemo ? "SELECT * FROM sme_users" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: demoSessionSql, params: demoSessionParams },
      { sql: !isStudent ? `SELECT * FROM subject_groups ORDER BY name ASC LIMIT ${CAPS.subjectGroups}` : "SELECT 1 WHERE 1=0", params: [] },
      { sql: needsDemo ? "SELECT * FROM demo_rules ORDER BY created_at DESC" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdmin ? "SELECT * FROM signup_requests ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: demoSwapSql, params: demoSwapParams },
      { sql: isAdminOrKAM ? "SELECT * FROM kam_tasks ORDER BY created_at DESC LIMIT 50" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdminOrKAM ? "SELECT * FROM campus_issues ORDER BY created_at DESC LIMIT 50" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: !isStudent ? "SELECT * FROM academic_years" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: (isAdminOrKAM || isCM || isMentor) ? `SELECT * FROM academic_events ORDER BY date ASC LIMIT ${CAPS.academicEvents}` : "SELECT 1 WHERE 1=0", params: [] },
      { sql: (!isStudent && kamHasColleges) ? `SELECT * FROM student_interviews WHERE origin_college_id IN ${kamInClause} OR target_college_id IN ${kamInClause} OR college_id IN ${kamInClause} ORDER BY created_at DESC LIMIT 100` : ((!isStudent && collegeId && (isCM || isMentor || isAdminOrKAM)) ? "SELECT * FROM student_interviews WHERE origin_college_id = ? OR target_college_id = ? OR college_id = ? ORDER BY created_at DESC LIMIT 40" : (!isStudent && isAdminOrKAM ? "SELECT * FROM student_interviews ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0")), params: (!isStudent && kamHasColleges) ? [...kamCollegeIds, ...kamCollegeIds, ...kamCollegeIds] : ((!isStudent && collegeId && (isCM || isMentor || isAdminOrKAM)) ? [collegeId, collegeId, collegeId] : []) },
      { sql: (!isStudent && (isAdminOrKAM || isCM)) ? "SELECT * FROM interview_evaluations ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdminOrKAM ? "SELECT * FROM approvals ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: (!isStudent && (isAdminOrKAM || isCM)) ? "SELECT * FROM leave_balances LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: departmentSql, params: departmentParams },
      { sql: isStudent ? (collegeId ? "SELECT * FROM academic_tracker WHERE college_id = ? OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ? OR id = ? OR email = ?) ORDER BY date DESC, period_slot ASC LIMIT 500" : "SELECT * FROM academic_tracker WHERE class_group IN (SELECT classGroup FROM students WHERE id = ? OR email = ?) ORDER BY date DESC, period_slot ASC LIMIT 500") : ((collegeId && (isCM || isMentor)) ? "SELECT * FROM academic_tracker WHERE college_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY date DESC, period_slot ASC LIMIT 500" : (isAdminOrKAM ? "SELECT * FROM academic_tracker ORDER BY date DESC, period_slot ASC LIMIT 500" : "SELECT 1 WHERE 1=0")), params: isStudent ? (collegeId ? [collegeId, collegeId, userId || "", userId || ""] : [userId || "", userId || ""]) : ((collegeId && (isCM || isMentor)) ? [collegeId, collegeId] : []) },
      // SQLite/libSQL: use only ? placeholders. The $4::text PostgreSQL cast
      // syntax that was here before silently returned [] for student weekly tasks.
      { sql: isStudent ? "SELECT * FROM weekly_academic_tasks WHERE (class_group IN (SELECT DISTINCT classGroup FROM students WHERE id = ? OR email = ? OR (college_id = ? AND college_id IS NOT NULL))) OR (? IS NOT NULL AND mentor_id IN (SELECT id FROM mentors WHERE college_id = ?)) ORDER BY week_number ASC LIMIT 500" : (collegeId && (isCM || isMentor) ? "SELECT * FROM weekly_academic_tasks WHERE mentor_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?) ORDER BY week_number ASC LIMIT 500" : (isAdminOrKAM ? "SELECT * FROM weekly_academic_tasks ORDER BY week_number ASC LIMIT 500" : "SELECT 1 WHERE 1=0")), params: isStudent ? [userId || "", userId || "", collegeId, collegeId, collegeId] : (collegeId && (isCM || isMentor) ? [userId || "", collegeId, collegeId] : []) },
      { sql: (isStudent && userId) ? "SELECT * FROM student_academic_tracker WHERE student_id = ? OR LOWER(student_email) = LOWER(?) OR student_email IN (SELECT email FROM students WHERE id = ? OR email = ?) ORDER BY updated_at DESC LIMIT 500" : (collegeId && (isCM || isMentor) ? "SELECT * FROM student_academic_tracker WHERE student_id IN (SELECT id FROM students WHERE college_id = ?) OR student_email IN (SELECT email FROM students WHERE college_id = ?) OR graded_by = ? ORDER BY updated_at DESC LIMIT 3000" : (isAdminOrKAM ? "SELECT * FROM student_academic_tracker ORDER BY updated_at DESC LIMIT 3000" : "SELECT 1 WHERE 1=0")), params: (isStudent && userId) ? [userId, userId, userId, userId] : (collegeId && (isCM || isMentor) ? [collegeId, collegeId, userId || ""] : []) },
      { sql: needsDemo ? "SELECT * FROM sme_availability ORDER BY day_of_week, start_time" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdmin ? "SELECT * FROM campus_managers" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdmin ? "SELECT * FROM kam_users" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: !isStudent ? `SELECT id, mentor_id, college_id, request_type, leave_category, start_date, end_date, reason, status FROM faculty_leave_requests WHERE status = 'approved' ORDER BY start_date DESC LIMIT ${CAPS.facultyLeaves}` : "SELECT 1 WHERE 1=0", params: [] },
      { sql: "SELECT key, value FROM system_settings", params: [] }
    ];

    const failedSlices: QueryFailure[] = [];
    const [
      mentors, slots, requests, approvedHandovers, auditLogs, subjects,
      courses, students, studentAttendance, leaveRequests, colleges,
      notifications, announcements, holidays, loginHistory, users,
      weeklyTasks, studentTracker, smes, demoSessions, subjectGroups, demoRules,
      signupRequests, demoSwapRequests, kamTasks, campusIssues, academicYears, academicEvents,
      studentInterviews,
      interviewEvaluations,
      approvals,
      leaveBalances,
      departmentsData,
      academicTracker,
      weeklyAcademicTasks,
      studentAcademicTracker,
      smeAvailability,
      campusManagers,
      kamUsers,
      facultyLeaves,
      systemSettingsRows
    ] = await db.multiQuery(queryDefs, failedSlices);

    const systemSettings: { mailing_enabled: boolean; attendance_lock_enabled: boolean;[key: string]: any } = {
      mailing_enabled: true,
      attendance_lock_enabled: true
    };
    if (Array.isArray(systemSettingsRows)) {
      systemSettingsRows.forEach((row: any) => {
        if (row.key === "mailing_enabled") {
          systemSettings.mailing_enabled = row.value === "true" || row.value === "1";
        } else if (row.key === "attendance_lock_enabled") {
          systemSettings.attendance_lock_enabled = row.value === "true" || row.value === "1";
        } else {
          systemSettings[row.key] = row.value;
        }
      });
    }

    let filteredColleges = colleges;
    let filteredCourses = courses;
    let filteredMentors = mentors;
    let filteredSlots = slots;
    let filteredSubjects = subjects;
    let filteredStudents = students;
    let filteredStudentAttendance = studentAttendance;
    let filteredLeaveRequests = leaveRequests;
    let filteredRequests = requests;
    let filteredApprovedHandovers = approvedHandovers;
    let filteredHolidays = holidays;
    let filteredAnnouncements = announcements;
    let filteredWeeklyTasks = weeklyTasks;
    let filteredStudentTracker = studentTracker;
    let filteredWeeklyAcademicTasks = weeklyAcademicTasks || [];
    let filteredStudentAcademicTracker = studentAcademicTracker || [];

    if (collegeId && !isStudent) {
      const mentorIds = new Set(filteredMentors.map((m: any) => m.id));
      if (userId) mentorIds.add(userId);
      const studentIds = new Set(filteredStudents.map((s: any) => s.id));
      const studentEmails = new Set(filteredStudents.map((s: any) => s.email?.toLowerCase().trim()).filter(Boolean));
      const studentCohortNames = new Set(filteredStudents.map((s: any) => s.classGroup?.toLowerCase().trim()).filter(Boolean));

      filteredStudentAttendance = studentAttendance.filter((sa: any) => studentIds.has(sa.studentId));
      filteredLeaveRequests = leaveRequests.filter((lr: any) => studentIds.has(lr.studentId) || studentCohortNames.has(lr.classGroup?.toLowerCase().trim()) || !lr.studentId);
      filteredWeeklyTasks = weeklyTasks.filter((t: any) => mentorIds.has(t.mentor_id) || studentCohortNames.has(t.class_group?.toLowerCase().trim()) || (t.mentor_id && t.mentor_id === userId));
      filteredStudentTracker = studentTracker.filter((e: any) => studentIds.has(e.student_id) || (e.graded_by && e.graded_by === userId));
      filteredWeeklyAcademicTasks = (weeklyAcademicTasks || []).filter((t: any) => mentorIds.has(t.mentor_id) || studentCohortNames.has(t.class_group?.toLowerCase().trim()) || (t.mentor_id && t.mentor_id === userId));
      filteredStudentAcademicTracker = (studentAcademicTracker || []).filter((e: any) => studentIds.has(e.student_id) || studentEmails.has(e.student_email?.toLowerCase().trim()) || (e.graded_by && e.graded_by === userId));
      filteredRequests = requests.filter((r: any) => mentorIds.has(r.requestorId) || mentorIds.has(r.targetStaffId));
      filteredApprovedHandovers = approvedHandovers.filter((h: any) => mentorIds.has(h.originalMentorId) || mentorIds.has(h.coverStaffId));
    }

    // A capped slice that comes back exactly full had more rows behind it that were not
    // sent. That is a size guard, not an outage: folding it into `partial` made every
    // institution with 30 announcements look like a database that could not be reached.
    // It is reported in its own field so the client can say "some lists are capped"
    // instead. The numbers mirror the LIMIT of each slice above.
    const truncatedSections: string[] = [];
    const truncated = (rows: any[] | undefined, cap: number, name: string) => {
      if (Array.isArray(rows) && rows.length >= cap) truncatedSections.push(name);
    };
    truncated(slots, CAPS.slots, "slots");
    truncated(students, CAPS.students, "students");
    truncated(mentors, CAPS.mentors, "mentors");
    truncated(users, CAPS.users, "users");
    truncated(studentAttendance, isStudent ? 2000 : isMentor ? 20000 : 60000, "studentAttendance");
    truncated(announcements, 30, "announcements");
    truncated(leaveRequests, 100, "leaveRequests");
    truncated(signupRequests, 40, "signupRequests");
    truncated(kamTasks, 50, "kamTasks");
    truncated(campusIssues, 50, "campusIssues");
    truncated(studentInterviews, isKAM && kamHasColleges ? 100 : 40, "studentInterviews");
    truncated(interviewEvaluations, 40, "interviewEvaluations");
    truncated(approvals, 40, "approvals");
    truncated(leaveBalances, 40, "leaveBalances");
    truncated(weeklyTasks, 200, "weeklyTasks");
    truncated(studentTracker, 500, "studentTracker");
    truncated(academicTracker, 500, "academicTracker");
    truncated(weeklyAcademicTasks, 500, "weeklyAcademicTasks");
    truncated(studentAcademicTracker, 3000, "studentAcademicTracker");
    truncated(demoSessions, CAPS.demoSessions, "demoSessions");
    truncated(demoSwapRequests, CAPS.demoSwaps, "demoSwapRequests");

    return NextResponse.json({
      success: true,
      partial: failedSlices.length > 0,
      failedSections: failedSlices.map((f) => sliceSection(f.sql)),
      truncatedSections,
      mentors: filteredMentors.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: "mentor",
        avatar: m.avatar,
        department: m.department || m.mentor_group || "General",
        subjects: m.subjects,
        classes: m.classes,
        college_id: m.college_id,
        employee_id: m.employee_id,
        phone: m.phone,
        qualification: m.qualification,
        experience: m.experience,
        specialization: m.specialization,
        designation: m.designation,
        joining_date: m.joining_date,
        status: m.status,
        last_login: m.last_login,
        created_at: m.created_at,
        updated_at: m.updated_at,
        mentor_group: m.mentor_group || m.department || null,
        subject_group: m.subject_group || null
      })),
      slots: filteredSlots,
      requests: filteredRequests,
      approvedHandovers: filteredApprovedHandovers,
      auditLogs,
      subjects: filteredSubjects,
      // `departments` is the courses table (the two are one concept to this app —
      // AppContext aliases coursesList to departmentsList), with the legacy
      // `departments` rows only as a fallback for campuses that never migrated.
      departments: (filteredCourses && filteredCourses.length > 0) ? filteredCourses : ((departmentsData && departmentsData.length > 0) ? departmentsData : []),
      students: stripSecrets(filteredStudents),
      studentAttendance: compactAttendance(filteredStudentAttendance),
      studentAttendanceFormat: "compact",
      leaveRequests: filteredLeaveRequests,
      colleges: filteredColleges,
      notifications,
      announcements: filteredAnnouncements,
      holidays: filteredHolidays,
      loginHistory,
      users,
      weeklyTasks: filteredWeeklyTasks,
      studentTracker: filteredStudentTracker,
      weeklyAcademicTasks: filteredWeeklyAcademicTasks,
      studentAcademicTracker: filteredStudentAcademicTracker,
      smes: stripSecrets(smes),
      demoSessions,
      subjectGroups,
      demoRules,
      signupRequests: stripSecrets(signupRequests),
      demoSwapRequests,
      kamTasks,
      campusIssues,
      academicYears: academicYears.map((ay: any) => typeof ay === "string" ? ay : ay.year || ay.year_name || ay.name || String(ay)),
      academicEvents,
      interviews: studentInterviews || [],
      interviewEvaluations: interviewEvaluations || [],
      approvals: approvals || [],
      leaveBalances: leaveBalances || [],
      academicTracker: academicTracker || [],
      smeAvailability: smeAvailability || [],
      campusManagers: stripSecrets(campusManagers || []),
      kamUsers: stripSecrets(kamUsers || []),
      facultyLeaves: facultyLeaves || [],
      systemSettings
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
      }
    });
  } catch (error: any) {
    console.error("API GET Data error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to load database state"
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    return NextResponse.json({
      success: false,
      message: "Database mutation via /api/data is disabled in production. Use dedicated domain API endpoints."
    }, { status: 403 });
  } catch (error: any) {
    console.error("API POST Data error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
