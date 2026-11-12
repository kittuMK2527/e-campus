import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";
import { dispatchSystemNotification } from "@/lib/notifications";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// POST imports one row per exam. Without this the route ran on the platform
// default and a 60s statement_timeout could outlive the function, killing the
// import half-applied.
export const maxDuration = 120;

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("college_id");
    const department = searchParams.get("department");
    const semester = searchParams.get("semester");
    const dateStr = searchParams.get("dateStr");
    // class_group is used by student view to narrow results to their cohort's department
    const classGroup = searchParams.get("class_group");

    const db = await getDb();
    let query = "SELECT * FROM exam_schedules WHERE 1=1";
    const args: any[] = [];

    if (collegeId) {
      query += " AND (LOWER(college_id) = LOWER(?) OR college_id IS NULL)";
      args.push(collegeId);
    }

    // Department filter: prefer explicit department param, fall back to class_group prefix
    // e.g. classGroup "CSE-A" should match department "CSE" or "Computer Science Engineering"
    if (department && department !== "all") {
      query += " AND (LOWER(department) = LOWER(?) OR LOWER(department) LIKE ?)";
      args.push(department, `%${department.toLowerCase()}%`);
    } else if (classGroup) {
      // Extract the department code from classGroup (everything before the first dash/space)
      const deptPrefix = classGroup.split(/[-\s]/)[0].toLowerCase();
      query += " AND (LOWER(department) = LOWER(?) OR LOWER(department) LIKE ? OR LOWER(department) LIKE ?)";
      args.push(classGroup, `%${classGroup.toLowerCase()}%`, `%${deptPrefix}%`);
    }

    if (semester && semester !== "all") {
      query += " AND (LOWER(semester) = LOWER(?) OR LOWER(semester) LIKE ?)";
      args.push(semester, `%${semester.toLowerCase()}%`);
    }
    if (dateStr) {
      query += " AND exam_date = ?";
      args.push(dateStr);
    }

    query += " ORDER BY exam_date ASC, start_time ASC";

    const exams = await db.all(query, args);
    return NextResponse.json({ success: true, exams: exams || [] }, { headers: noCacheHeaders });
  } catch (error: any) {
    console.error("Error fetching exams:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch exams" }, { status: 500, headers: noCacheHeaders });
  }
}

function formatToCanonicalTime12(timeStr?: string): string {
  if (!timeStr) return "10:00 AM";
  const cleanStr = timeStr.trim().replace(/\./g, ":");
  const match = cleanStr.match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];
  if (ampm) {
    const isPM = ampm.toUpperCase() === "PM";
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  }
  const period = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  return `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${period}`;
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const db = await getDb();

    // Check if bulk array or single object
    const schedules: any[] = Array.isArray(body) ? body : (body.schedules ? body.schedules : [body]);

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ success: false, message: "No exam data provided" }, { status: 400 });
    }

    // Build every row first, then write in a handful of statements. Per-item
    // autocommitted upserts meant a failure mid-import left half a timetable
    // stored with no way to tell which rows made it, and cost two round trips
    // per exam (~200ms each).
    const rows = schedules.map((item: any) => {
      const id = item.id || generateId("exam");
      const college_id = item.college_id || "";
      const department = item.department || "General";
      const semester = item.semester || "Semester 1";
      const exam_type = (item.exam_type || item.exam_name || "CIA 1").trim();
      const subject_name = item.subject_name || "Subject";
      const subject_code = item.subject_code || null;
      const exam_date = item.exam_date || getInstitutionDateStr();
      // session_time is free text and usually reads "9.00 AM to 12.00 PM", so a
      // hyphen-only split returned undefined and every imported exam silently
      // fell back to the default window.
      const sessionParts = (item.session_time || "").split(/\s*(?:to|–|—|-)\s*/i);
      const rawStart = item.start_time || sessionParts[0]?.trim() || "10:00 AM";
      const rawEnd = item.end_time || sessionParts[1]?.trim() || "01:00 PM";
      const start_time = formatToCanonicalTime12(rawStart);
      const end_time = formatToCanonicalTime12(rawEnd);
      const session_time = `${start_time} - ${end_time}`;
      const day_order = item.day_order || "Day 1";
      const hall_room = item.hall_room || "Main Examination Hall";
      const max_marks = parseFloat(item.max_marks) || 50;
      const passing_marks = parseFloat(item.passing_marks) || (max_marks * 0.4);
      const created_by = item.created_by || "Campus Manager";
      const status = item.status || "Scheduled";

      return {
        values: [
          id, college_id, department, semester, exam_type, subject_name,
          subject_code, exam_date, session_time, start_time, end_time, day_order,
          hall_room, max_marks, passing_marks, created_by, status
        ],
        config: {
          id: `${college_id}_${exam_date}`,
          college_id,
          exam_date,
          day_order,
          notes: `${exam_type} Examination`
        },
        inserted: { id, exam_type, subject_name, exam_date, session_time, start_time, end_time, day_order, department, semester }
      };
    });

    // 17 bind parameters per row, so 500 rows keeps each statement well inside
    // Postgres' 65,535-parameter ceiling.
    const ROW_CHUNK = 500;

    // A multi-row ON CONFLICT DO UPDATE rejects a target key it would update twice
    // ("cannot affect row a second time"), which the old per-row loop tolerated.
    // Collapse duplicates last-wins, exactly like sequential upserts did.
    const dedupeById = (items: any[], keyOf: (item: any) => any) => {
      const byKey = new Map<any, any>();
      for (const item of items) byKey.set(keyOf(item), item);
      return Array.from(byKey.values());
    };
    const examRows = dedupeById(rows, (r) => r.values[0]);
    const configRows = dedupeById(rows, (r) => r.config.id);

    await db.transaction(async (tx) => {
      for (let i = 0; i < examRows.length; i += ROW_CHUNK) {
        const chunk = examRows.slice(i, i + ROW_CHUNK);
        const placeholders = chunk
          .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
          .join(", ");
        const params = chunk.reduce<any[]>((acc, r) => acc.concat(r.values), []);

        await tx.run(
          `INSERT INTO exam_schedules (
            id, college_id, department, semester, exam_type, subject_name,
            subject_code, exam_date, session_time, start_time, end_time, day_order,
            hall_room, max_marks, passing_marks, created_by, status, updated_at
          ) VALUES ${placeholders}
          ON CONFLICT(id) DO UPDATE SET
            department = excluded.department,
            semester = excluded.semester,
            exam_type = excluded.exam_type,
            subject_name = excluded.subject_name,
            subject_code = excluded.subject_code,
            exam_date = excluded.exam_date,
            session_time = excluded.session_time,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            day_order = excluded.day_order,
            hall_room = excluded.hall_room,
            max_marks = excluded.max_marks,
            passing_marks = excluded.passing_marks,
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP`,
          params
        );
      }
    });

    // Auto-sync campus_daily_configs to recognize each imported date as an active
    // exam day with the specified day_order. Derived data, so it stays best-effort
    // after the import commits — but the outcome is reported instead of discarded.
    let dailyConfigSynced = true;
    try {
      for (let i = 0; i < configRows.length; i += ROW_CHUNK) {
        const chunk = configRows.slice(i, i + ROW_CHUNK);
        const placeholders = chunk.map(() => "(?, ?, ?, 'exam_day', ?, ?, 'Offline', CURRENT_TIMESTAMP)").join(", ");
        const params = chunk.reduce<any[]>((acc, r) => acc.concat([r.config.id, r.config.college_id, r.config.exam_date, r.config.day_order, r.config.notes]), []);

        await db.run(
          `INSERT INTO campus_daily_configs (
            id, college_id, dateStr, day_type, day_order, notes, session_mode, updated_at
          ) VALUES ${placeholders}
          ON CONFLICT(id) DO UPDATE SET
            day_type = 'exam_day',
            day_order = CASE WHEN excluded.day_order IS NOT NULL AND excluded.day_order != '' THEN excluded.day_order ELSE campus_daily_configs.day_order END,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
          WHERE campus_daily_configs.day_type != 'holiday'`,
          params
        );
      }
    } catch (cdcErr) {
      dailyConfigSynced = false;
      console.warn("Could not auto-sync campus_daily_configs for exam dates:", cdcErr);
    }

    const inserted = rows.map(r => r.inserted);

    // Notify students, mentors, and CMs of the published/updated exam schedule
    if (rows.length > 0) {
      try {
        const first = rows[0].inserted;
        const collegeId = rows[0].values[1];
        const title = rows.length === 1
          ? `Exam Scheduled: ${first.subject_name} (${first.exam_date})`
          : `Exam Timetable Published (${rows.length} Assessment${rows.length > 1 ? "s" : ""})`;
        const message = rows.length === 1
          ? `${first.exam_type} for ${first.subject_name} is scheduled on ${first.exam_date} (${first.session_time}). Room: ${rows[0].values[12]}.`
          : `New exam schedule published for ${first.department || "campus"} (${rows.length} subjects). Check Exams tab for your schedule.`;

        await dispatchSystemNotification(db, {
          roles: ["student", "mentor", "cm", "admin"],
          collegeId: collegeId || undefined,
          title,
          message,
          link: "/student/exams",
          type: "info",
          action: "exam_scheduled"
        });

        notifyRealtimeEvent({
          domain: "exams",
          action: "schedule_updated",
          collegeId: collegeId || undefined,
          payload: { count: rows.length, firstExamDate: first.exam_date }
        });
      } catch (notifErr) {
        console.warn("Exams notification dispatch failed:", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully saved ${inserted.length} exam schedule(s)`,
      inserted,
      dailyConfigSynced
    });
  } catch (error: any) {
    console.error("Error saving exam schedule:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to save exam schedule" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "Exam ID is required" }, { status: 400 });
    }

    const db = await getDb();
    const exam = await db.get("SELECT college_id, exam_date FROM exam_schedules WHERE id = ?", [id]);
    await db.run("DELETE FROM exam_schedules WHERE id = ?", [id]);
    await db.run("DELETE FROM student_exam_marks WHERE exam_id = ?", [id]);

    if (exam?.college_id && exam?.exam_date) {
      const remaining = await db.all(
        "SELECT id FROM exam_schedules WHERE college_id = ? AND exam_date = ?",
        [exam.college_id, exam.exam_date]
      );
      if (!remaining || remaining.length === 0) {
        await db.run(
          "UPDATE campus_daily_configs SET day_type = 'working', notes = NULL WHERE college_id = ? AND dateStr = ? AND day_type = 'exam_day'",
          [exam.college_id, exam.exam_date]
        );
      }
    }

    return NextResponse.json({ success: true, message: "Exam schedule and associated marks deleted" });
  } catch (error: any) {
    console.error("Error deleting exam:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete exam" }, { status: 500 });
  }
}
