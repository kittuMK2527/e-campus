export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { ensureMigration } from "@/lib/migrations";
import { normalizeRole, requireAuth } from "@/lib/authGuard";
import { getInstitutionDateStrOffset } from "@/lib/localDate";

// Run migrations at most once per process lifetime — not on every GET request.
// The two checks below are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
// but still cost one DB round-trip each time /api/data is called. A module-level
// promise means the first request pays the cost and every subsequent request skips it.
let _migrationsApplied: Promise<void> | null = null;
function applyDataMigrations(): Promise<void> {
  if (_migrationsApplied) return _migrationsApplied;
  _migrationsApplied = (async () => {
    await ensureMigration("audit_logs_extended_columns").catch(() => { });
    await ensureMigration("student_attendance_extended_columns").catch(() => { });
  })().catch((err) => {
    // Reset so the next request retries — don't permanently cache a failure.
    _migrationsApplied = null;
    console.warn("[/api/data] migration check failed:", err?.message);
  }) as Promise<void>;
  return _migrationsApplied;
}

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

    await applyDataMigrations();
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const role = normalizeRole(auth.user.role);
    const userId = auth.user.reference_id || auth.user.id;
    const fields = searchParams.get("fields"); // e.g. "attendance" for surgical re-fetch

    // Only admin and KAM may pick another campus; everyone else is pinned to their own.
    let collegeId: string | null = (role === "admin" || role === "kam")
      ? (searchParams.get("college_id") || searchParams.get("collegeId") || null)
      : (auth.user.college_id || null);

    if (!collegeId && role === "student" && userId) {
      const studentRow = await db.get(
        "SELECT college_id FROM students WHERE id = ? OR email = ?",
        userId, auth.user.email || userId
      ).catch(() => null);
      if (studentRow?.college_id) collegeId = studentRow.college_id;
    }
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
        if (kamCollegeIds.length === 0) {
          const allColleges = await db.all("SELECT id FROM colleges");
          kamCollegeIds = allColleges.map((c: any) => c.id);
        }
      }
    }
    if (role === "kam" && collegeId) {
      if (!kamCollegeIds.includes(collegeId)) {
        return NextResponse.json({ success: false, message: "Campus is outside your assigned portfolio." }, { status: 403 });
      }
      kamCollegeIds = [collegeId];
    }
    // Fail-closed: a KAM with no assigned campuses matches nothing, never the whole institution.
    const kamInClause = `(${kamCollegeIds.map(() => "?").join(",") || "NULL"})`;

    // Attendance history windows. Institution-day based, not UTC-day based: the
    // Vercel clock is UTC and the campuses are IST (UTC+5:30), so a UTC-derived
    // "today" is still yesterday between 00:00 and 05:29 IST and would cut the
    // window off a day early.
    // Default initial window is bounded to 45 days (or 90 for surgical re-fetch) to prevent
    // 4MB+ JSON payloads and browser memory spikes (PERF-02). Clients can pass ?attendanceDays=N
    // up to 180 when loading deep history.
    const requestedDays = parseInt(searchParams.get("attendanceDays") || "", 10);
    const attendanceWindowDays = Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(requestedDays, 180)
      : (fields === "attendance" ? 60 : 30);
    const fullDateThreshold = getInstitutionDateStrOffset(-attendanceWindowDays);
    const mentorDateThreshold = getInstitutionDateStrOffset(-Math.min(attendanceWindowDays, 30));

    // Dynamic tight limits per query (honors client-requested limit if specified)
    const clientAttLimit = parseInt(searchParams.get("attendanceLimit") || searchParams.get("limit") || "", 10);
    const ATTENDANCE_LIMIT = Number.isFinite(clientAttLimit) && clientAttLimit > 0
      ? Math.min(clientAttLimit, 5000)
      : (role === "student" ? 500 : role === "mentor" ? 1000 : 2000);

    // ── FAST PATH: attendance-only re-fetch (used after bulk import / mentor mark) ──
    if (fields === "attendance") {
      let attSql: string;
      let attParams: any[];
      if (role === "student" && userId) {
        attSql = `SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE studentId = ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
        attParams = [userId];
      } else if (role === "mentor" && userId) {
        attSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa WHERE (sa.slotId IN (SELECT id FROM slots WHERE mentorId = ?) OR sa.markedBy = ?) AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
        attParams = [userId, userId, mentorDateThreshold];
      } else if (role === "kam") {
        attSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id IN ${kamInClause} AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
        attParams = [...kamCollegeIds, fullDateThreshold];
      } else if (collegeId) {
        attSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id = ? AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
        attParams = [collegeId, fullDateThreshold];
      } else {
        attSql = `SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE dateStr >= ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
        attParams = [fullDateThreshold];
      }
      const att = await db.all(attSql, ...attParams);
      return NextResponse.json({
        success: true,
        studentAttendance: compactAttendance(att),
        studentAttendanceFormat: "compact",
        attendanceLimit: ATTENDANCE_LIMIT
      });
    }

    // ── Optimized Query Constraints based on Role & Scope ──
    const isMentor = role === "mentor";
    const isStudent = role === "student";
    const isCM = role === "cm";
    const isAdmin = role === "admin" || (role as string) === "superadmin";
    const isKAM = role === "kam";
    const isAdminOrKAM = isAdmin || isKAM;

    const isFeeManager = role === "fee_manager";

    // Unscoped (institution-wide) reads carry a ceiling: a growing table must not
    // turn the dashboard load into an out-of-memory function. Any slice that comes
    // back exactly full is reported as truncated below, so short data is never
    // presented as complete data.
    const CAPS = {
      mentors: 1000, slots: 2500, students: 2000, subjectGroups: 500,
      colleges: 200, academicEvents: 300, facultyLeaves: 300,
      demoSessions: 200, demoSwaps: 100
    };

    // The fee dashboard reads its roster from /api/fees; the shared bundle only
    // supplies colleges and courses to that role.
    const mentorSql = isFeeManager ? "SELECT 1 WHERE 1=0" : isKAM
      ? `SELECT * FROM mentors WHERE college_id IN ${kamInClause}`
      : collegeId ? "SELECT * FROM mentors WHERE college_id = ?" : `SELECT * FROM mentors LIMIT ${CAPS.mentors}`;
    const mentorParams = isFeeManager ? [] : isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const slotSql = isFeeManager ? "SELECT 1 WHERE 1=0" : isKAM
      ? `SELECT * FROM slots WHERE college_id IN ${kamInClause}`
      : collegeId ? "SELECT * FROM slots WHERE college_id = ?" : `SELECT * FROM slots LIMIT ${CAPS.slots}`;
    const slotParams = isFeeManager ? [] : isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const studentSql = isFeeManager ? "SELECT 1 WHERE 1=0" : isStudent && userId
      ? "SELECT * FROM students WHERE id = ?"
      : isKAM
        ? `SELECT * FROM students WHERE college_id IN ${kamInClause}`
        : collegeId
          ? "SELECT * FROM students WHERE college_id = ?"
          : `SELECT * FROM students LIMIT ${CAPS.students}`;
    const studentParams = isFeeManager ? [] : (isStudent && userId) ? [userId] : isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const subjectSql = isFeeManager ? "SELECT 1 WHERE 1=0" : isKAM
      ? `SELECT * FROM subjects WHERE college_id IN ${kamInClause} OR college_id IS NULL`
      : collegeId ? "SELECT * FROM subjects WHERE college_id = ? OR college_id IS NULL" : "SELECT * FROM subjects";
    const subjectParams = isFeeManager ? [] : isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const courseSql = isKAM
      ? `SELECT * FROM courses WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY name`
      : collegeId ? "SELECT * FROM courses WHERE college_id = ? OR college_id IS NULL ORDER BY name" : "SELECT * FROM courses ORDER BY name";
    const courseParams = isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const departmentSql = isKAM
      ? `SELECT * FROM departments WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY name`
      : collegeId ? "SELECT * FROM departments WHERE college_id = ? OR college_id IS NULL ORDER BY name" : "SELECT * FROM departments ORDER BY name";
    const departmentParams = isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    const holidaySql = isKAM
      ? `SELECT * FROM holidays WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY date`
      : collegeId ? "SELECT * FROM holidays WHERE college_id = ? OR college_id IS NULL ORDER BY date" : "SELECT * FROM holidays ORDER BY date";
    const holidayParams = isKAM ? [...kamCollegeIds] : collegeId ? [collegeId] : [];

    // Role-optimized attendance query with strict query limits (User requirement & PERF-02)
    let attendanceSql = `SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE dateStr >= ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
    let attendanceParams: any[] = [fullDateThreshold];

    if (isStudent && userId) {
      attendanceSql = `SELECT id, studentId, slotId, dateStr, status, type, mode, markedBy, timestamp, attendanceTypeSub, coveredSubject FROM student_attendance WHERE studentId = ? AND strftime('%w', dateStr) != '0' ORDER BY dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
      attendanceParams = [userId];
    } else if (isKAM) {
      attendanceSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id IN ${kamInClause} AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
      attendanceParams = [...kamCollegeIds, fullDateThreshold];
    } else if (isMentor && userId) {
      // Mentor only needs attendance for their assigned slots or where they marked attendance
      attendanceSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa WHERE (sa.slotId IN (SELECT id FROM slots WHERE mentorId = ?) OR sa.markedBy = ?) AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
      attendanceParams = [userId, userId, mentorDateThreshold];
    } else if (isCM && collegeId) {
      // CAM monitoring view scopes to attendance window for college
      attendanceSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id = ? AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
      attendanceParams = [collegeId, fullDateThreshold];
    } else if (collegeId) {
      attendanceSql = `SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode, sa.markedBy, sa.timestamp, sa.attendanceTypeSub, sa.coveredSubject FROM student_attendance sa JOIN students st ON sa.studentId = st.id WHERE st.college_id = ? AND sa.dateStr >= ? AND strftime('%w', sa.dateStr) != '0' ORDER BY sa.dateStr DESC LIMIT ${ATTENDANCE_LIMIT}`;
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
    } else if (isKAM && !isStudent) {
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

    // KAM portfolio subqueries. Each embedding needs its own copy of the id params.
    const kamMentors = `SELECT id FROM mentors WHERE college_id IN ${kamInClause}`;
    const kamStudents = `SELECT id FROM students WHERE college_id IN ${kamInClause}`;
    const kamInterviews = `SELECT id FROM student_interviews WHERE origin_college_id IN ${kamInClause} OR target_college_id IN ${kamInClause} OR college_id IN ${kamInClause}`;

    const queryDefs = [
      { sql: mentorSql, params: mentorParams },
      { sql: slotSql, params: slotParams },
      {
        sql: (!isStudent && (isMentor || isCM || isAdminOrKAM))
          ? (isMentor && userId
            ? (collegeId ? "SELECT * FROM handover_requests WHERE requestorId = ? OR targetStaffId = ? OR requestorId IN (SELECT id FROM mentors WHERE college_id = ?) OR targetStaffId IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY timestamp DESC LIMIT 100" : "SELECT * FROM handover_requests WHERE requestorId = ? OR targetStaffId = ? ORDER BY timestamp DESC LIMIT 100")
            : collegeId
              ? "SELECT * FROM handover_requests WHERE requestorId IN (SELECT id FROM mentors WHERE college_id = ?) OR targetStaffId IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY timestamp DESC LIMIT 100"
              : isKAM
                ? `SELECT * FROM handover_requests WHERE requestorId IN (${kamMentors}) OR targetStaffId IN (${kamMentors}) ORDER BY timestamp DESC LIMIT 100`
                : "SELECT * FROM handover_requests ORDER BY timestamp DESC LIMIT 100")
          : "SELECT 1 WHERE 1=0",
        params: (!isStudent && (isMentor || isCM || isAdminOrKAM))
          ? (isMentor && userId ? (collegeId ? [userId, userId, collegeId, collegeId] : [userId, userId]) : (collegeId ? [collegeId, collegeId] : (isKAM ? [...kamCollegeIds, ...kamCollegeIds] : [])))
          : []
      },
      {
        sql: (!isStudent && (isMentor || isCM || isAdminOrKAM))
          ? (isMentor && userId
            ? "SELECT * FROM approved_handovers WHERE originalMentorId = ? OR coverStaffId = ? ORDER BY dateStr DESC LIMIT 100"
            : isKAM
              ? `SELECT * FROM approved_handovers WHERE originalMentorId IN (${kamMentors}) OR coverStaffId IN (${kamMentors}) ORDER BY dateStr DESC LIMIT 100`
              : "SELECT * FROM approved_handovers ORDER BY dateStr DESC LIMIT 100")
          : "SELECT 1 WHERE 1=0",
        params: (!isStudent && isMentor && userId) ? [userId, userId] : (isKAM && !isStudent ? [...kamCollegeIds, ...kamCollegeIds] : [])
      },
      { sql: isAdmin ? "SELECT id, type, description, actorName, actorRole, timestamp, old_status, new_status, reason, changed_by FROM audit_logs ORDER BY timestamp DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: subjectSql, params: subjectParams },
      { sql: courseSql, params: courseParams },
      { sql: studentSql, params: studentParams },
      { sql: attendanceSql, params: attendanceParams },
      { sql: leaveSql, params: leaveParams },
      { sql: isKAM ? `SELECT * FROM colleges WHERE id IN ${kamInClause}` : `SELECT * FROM colleges LIMIT ${CAPS.colleges}`, params: isKAM ? [...kamCollegeIds] : [] },
      // AppContext never consumes these six slices: notifications come from
      // /api/notifications, and the admin people/system tabs use their own endpoints.
      // Keep the response keys (empty) so the bundle contract stays unchanged.
      { sql: "SELECT 1 WHERE 1=0", params: [] },
      { sql: "SELECT 1 WHERE 1=0", params: [] },
      { sql: holidaySql, params: holidayParams },
      { sql: "SELECT 1 WHERE 1=0", params: [] },
      { sql: "SELECT 1 WHERE 1=0", params: [] },
      {
        sql: (isStudent && collegeId) ? "SELECT * FROM weekly_tasks WHERE mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?) ORDER BY week_number ASC LIMIT 150"
          : (collegeId && (isCM || isMentor)) ? "SELECT * FROM weekly_tasks WHERE mentor_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?) ORDER BY week_number ASC LIMIT 150"
          : isKAM ? `SELECT * FROM weekly_tasks WHERE mentor_id IN (${kamMentors}) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id IN ${kamInClause}) ORDER BY week_number ASC LIMIT 150`
          : isAdmin ? "SELECT * FROM weekly_tasks ORDER BY week_number ASC LIMIT 150" : "SELECT 1 WHERE 1=0",
        params: (isStudent && collegeId) ? [collegeId, collegeId] : (collegeId && (isCM || isMentor)) ? [userId || "", collegeId, collegeId] : isKAM ? [...kamCollegeIds, ...kamCollegeIds] : []
      },
      {
        sql: (isStudent && userId) ? "SELECT * FROM student_tracker WHERE student_id = ? OR student_id IN (SELECT id FROM students WHERE id = ? OR email = ?) ORDER BY updated_at DESC LIMIT 250"
          : (collegeId && (isCM || isMentor)) ? "SELECT * FROM student_tracker WHERE student_id IN (SELECT id FROM students WHERE college_id = ?) OR graded_by = ? ORDER BY updated_at DESC LIMIT 250"
          : isKAM ? `SELECT * FROM student_tracker WHERE student_id IN (${kamStudents}) ORDER BY updated_at DESC LIMIT 250`
          : isAdmin ? "SELECT * FROM student_tracker ORDER BY updated_at DESC LIMIT 250" : "SELECT 1 WHERE 1=0",
        params: (isStudent && userId) ? [userId, userId, userId] : (collegeId && (isCM || isMentor)) ? [collegeId, userId || ""] : isKAM ? [...kamCollegeIds] : []
      },
      { sql: needsDemo ? "SELECT * FROM sme_users" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: demoSessionSql, params: demoSessionParams },
      { sql: !isStudent ? `SELECT * FROM subject_groups ORDER BY name ASC LIMIT ${CAPS.subjectGroups}` : "SELECT 1 WHERE 1=0", params: [] },
      { sql: needsDemo ? "SELECT * FROM demo_rules ORDER BY created_at DESC" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isAdmin ? "SELECT * FROM signup_requests ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: demoSwapSql, params: demoSwapParams },
      { sql: isKAM ? `SELECT * FROM kam_tasks WHERE collegeId IN ${kamInClause} ORDER BY created_at DESC LIMIT 50` : isAdmin ? "SELECT * FROM kam_tasks ORDER BY created_at DESC LIMIT 50" : "SELECT 1 WHERE 1=0", params: isKAM ? [...kamCollegeIds] : [] },
      { sql: isKAM ? `SELECT * FROM campus_issues WHERE collegeId IN ${kamInClause} ORDER BY created_at DESC LIMIT 50` : isAdmin ? "SELECT * FROM campus_issues ORDER BY created_at DESC LIMIT 50" : "SELECT 1 WHERE 1=0", params: isKAM ? [...kamCollegeIds] : [] },
      { sql: !isStudent ? "SELECT * FROM academic_years" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: isKAM ? `SELECT * FROM academic_events WHERE college_id IN ${kamInClause} OR college_id IS NULL ORDER BY date ASC LIMIT ${CAPS.academicEvents}` : (isAdminOrKAM || isCM || isMentor) ? `SELECT * FROM academic_events ORDER BY date ASC LIMIT ${CAPS.academicEvents}` : "SELECT 1 WHERE 1=0", params: isKAM ? [...kamCollegeIds] : [] },
      { sql: (!isStudent && isKAM) ? `SELECT * FROM student_interviews WHERE origin_college_id IN ${kamInClause} OR target_college_id IN ${kamInClause} OR college_id IN ${kamInClause} ORDER BY created_at DESC LIMIT 100` : ((!isStudent && collegeId && (isCM || isMentor || isAdminOrKAM)) ? "SELECT * FROM student_interviews WHERE origin_college_id = ? OR target_college_id = ? OR college_id = ? ORDER BY created_at DESC LIMIT 40" : (!isStudent && isAdminOrKAM ? "SELECT * FROM student_interviews ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0")), params: (!isStudent && isKAM) ? [...kamCollegeIds, ...kamCollegeIds, ...kamCollegeIds] : ((!isStudent && collegeId && (isCM || isMentor || isAdminOrKAM)) ? [collegeId, collegeId, collegeId] : []) },
      { sql: isKAM ? `SELECT * FROM interview_evaluations WHERE interview_id IN (${kamInterviews}) ORDER BY created_at DESC LIMIT 40` : (!isStudent && (isAdminOrKAM || isCM)) ? "SELECT * FROM interview_evaluations ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: isKAM ? [...kamCollegeIds, ...kamCollegeIds, ...kamCollegeIds] : [] },
      { sql: isKAM ? `SELECT * FROM approvals WHERE college_id IN ${kamInClause} ORDER BY created_at DESC LIMIT 40` : isAdmin ? "SELECT * FROM approvals ORDER BY created_at DESC LIMIT 40" : "SELECT 1 WHERE 1=0", params: isKAM ? [...kamCollegeIds] : [] },
      { sql: isKAM ? `SELECT * FROM leave_balances WHERE user_id IN (${kamMentors}) OR user_id IN (${kamStudents}) OR user_id IN (SELECT id FROM users WHERE reference_id IN (${kamMentors}) OR reference_id IN (${kamStudents})) LIMIT 40` : (!isStudent && (isAdminOrKAM || isCM)) ? "SELECT * FROM leave_balances LIMIT 40" : "SELECT 1 WHERE 1=0", params: isKAM ? [...kamCollegeIds, ...kamCollegeIds, ...kamCollegeIds, ...kamCollegeIds] : [] },
      { sql: departmentSql, params: departmentParams },
      { sql: isStudent ? (collegeId ? "SELECT * FROM academic_tracker WHERE college_id = ? OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ? OR id = ? OR email = ?) ORDER BY date DESC, period_slot ASC LIMIT 200" : "SELECT * FROM academic_tracker WHERE class_group IN (SELECT classGroup FROM students WHERE id = ? OR email = ?) ORDER BY date DESC, period_slot ASC LIMIT 200") : ((collegeId && (isCM || isMentor)) ? "SELECT * FROM academic_tracker WHERE college_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY date DESC, period_slot ASC LIMIT 200" : (isKAM ? `SELECT * FROM academic_tracker WHERE college_id IN ${kamInClause} OR (college_id IS NULL AND mentor_id IN (${kamMentors})) ORDER BY date DESC, period_slot ASC LIMIT 200` : isAdmin ? "SELECT * FROM academic_tracker ORDER BY date DESC, period_slot ASC LIMIT 200" : "SELECT 1 WHERE 1=0")), params: isStudent ? (collegeId ? [collegeId, collegeId, userId || "", userId || ""] : [userId || "", userId || ""]) : ((collegeId && (isCM || isMentor)) ? [collegeId, collegeId] : isKAM ? [...kamCollegeIds, ...kamCollegeIds] : []) },
      {
        sql: isStudent
          ? (collegeId
            ? "SELECT * FROM weekly_academic_tasks WHERE (class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ? OR id = ? OR email = ?)) OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) ORDER BY week_number ASC LIMIT 200"
            : "SELECT * FROM weekly_academic_tasks WHERE class_group IN (SELECT DISTINCT classGroup FROM students WHERE id = ? OR email = ?) ORDER BY week_number ASC LIMIT 200")
          : (collegeId && (isCM || isMentor)
            ? "SELECT * FROM weekly_academic_tasks WHERE mentor_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?) ORDER BY week_number ASC LIMIT 200"
            : (isKAM ? `SELECT * FROM weekly_academic_tasks WHERE mentor_id IN (${kamMentors}) OR class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id IN ${kamInClause}) ORDER BY week_number ASC LIMIT 200` : isAdmin ? "SELECT * FROM weekly_academic_tasks ORDER BY week_number ASC LIMIT 200" : "SELECT 1 WHERE 1=0")),
        params: isStudent
          ? (collegeId ? [collegeId, userId || "", userId || "", collegeId] : [userId || "", userId || ""])
          : (collegeId && (isCM || isMentor) ? [userId || "", collegeId, collegeId] : isKAM ? [...kamCollegeIds, ...kamCollegeIds] : [])
      },
      { sql: (isStudent && userId) ? "SELECT * FROM student_academic_tracker WHERE student_id = ? OR LOWER(student_email) = LOWER(?) OR student_email IN (SELECT email FROM students WHERE id = ? OR email = ?) ORDER BY updated_at DESC LIMIT 250" : (collegeId && (isCM || isMentor) ? "SELECT * FROM student_academic_tracker WHERE student_id IN (SELECT id FROM students WHERE college_id = ?) OR student_email IN (SELECT email FROM students WHERE college_id = ?) OR graded_by = ? ORDER BY updated_at DESC LIMIT 500" : (isKAM ? `SELECT * FROM student_academic_tracker WHERE student_id IN (${kamStudents}) OR student_email IN (SELECT email FROM students WHERE college_id IN ${kamInClause}) ORDER BY updated_at DESC LIMIT 500` : isAdmin ? "SELECT * FROM student_academic_tracker ORDER BY updated_at DESC LIMIT 500" : "SELECT 1 WHERE 1=0")), params: (isStudent && userId) ? [userId, userId, userId, userId] : (collegeId && (isCM || isMentor) ? [collegeId, collegeId, userId || ""] : isKAM ? [...kamCollegeIds, ...kamCollegeIds] : []) },
      { sql: needsDemo ? "SELECT * FROM sme_availability ORDER BY day_of_week, start_time" : "SELECT 1 WHERE 1=0", params: [] },
      { sql: "SELECT 1 WHERE 1=0", params: [] },
      { sql: "SELECT 1 WHERE 1=0", params: [] },
      { sql: (isMentor || isLnd) ? `SELECT id, mentor_id, college_id, request_type, leave_category, start_date, end_date, reason, status FROM faculty_leave_requests WHERE status = 'approved' ORDER BY start_date DESC LIMIT ${CAPS.facultyLeaves}` : "SELECT 1 WHERE 1=0", params: [] },
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
    truncated(studentAttendance, ATTENDANCE_LIMIT, "studentAttendance");
    truncated(leaveRequests, 100, "leaveRequests");
    truncated(signupRequests, 40, "signupRequests");
    truncated(kamTasks, 50, "kamTasks");
    truncated(campusIssues, 50, "campusIssues");
    truncated(studentInterviews, isKAM ? 100 : 40, "studentInterviews");
    truncated(interviewEvaluations, 40, "interviewEvaluations");
    truncated(approvals, 40, "approvals");
    truncated(leaveBalances, 40, "leaveBalances");
    truncated(weeklyTasks, 150, "weeklyTasks");
    truncated(studentTracker, 250, "studentTracker");
    truncated(academicTracker, 200, "academicTracker");
    truncated(weeklyAcademicTasks, 200, "weeklyAcademicTasks");
    truncated(studentAcademicTracker, 500, "studentAcademicTracker");
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
