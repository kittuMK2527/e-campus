import { NextResponse } from "next/server";
import { getDb, chunkList, writeInChunks, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Bulk marks upload writes one statement per 100 student rows inside a single
// transaction, so the budget covers the whole batch rather than a per-row loop.
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
    const examId = searchParams.get("exam_id");
    const studentId = searchParams.get("student_id");
    const collegeId = searchParams.get("college_id");

    const db = await getDb();

    if (examId) {
      // Fetch exam details first
      const exam = await db.get("SELECT * FROM exam_schedules WHERE id = ?", [examId]);
      if (!exam) {
        return NextResponse.json({ success: false, message: "Exam not found" }, { status: 404, headers: noCacheHeaders });
      }

      const classGroup = searchParams.get("class_group");

      // Fetch students belonging to the exam's department & college
      let stQuery = `SELECT id, name, roll_number, register_number, email, classGroup, department 
                     FROM students 
                     WHERE (LOWER(college_id) = LOWER(?) OR college_id IS NULL)
                       AND (LOWER(department) LIKE LOWER(?) OR LOWER(classGroup) LIKE LOWER(?))`;
      const stParams: any[] = [exam.college_id, `%${exam.department}%`, `%${exam.department}%`];

      if (classGroup && classGroup !== "all") {
        stQuery += " AND (classGroup = ? OR LOWER(classGroup) LIKE LOWER(?))";
        stParams.push(classGroup, `%${classGroup}%`);
      }

      stQuery += " ORDER BY name ASC";

      // The roster, the marks already recorded and the exam-day OD list all key off
      // the exam row and off nothing else, so they travel as one round trip.
      const sheetFailures: QueryFailure[] = [];
      const [students, marksRows, odRows] = await db.multiQuery(
        [
          { sql: stQuery, params: stParams },
          { sql: "SELECT * FROM student_exam_marks WHERE exam_id = ?", params: [examId] },
          {
            sql: "SELECT studentId FROM student_attendance WHERE slotId = ? AND dateStr = ? AND status = 'od'",
            params: [examId, exam.exam_date],
          },
        ],
        sheetFailures
      );
      if (sheetFailures.length > 0) {
        // A failed slice reads as an empty list, which would show this sheet as having
        // no students, no recorded marks, or nobody on OD.
        return NextResponse.json(
          { success: false, message: "Could not load the marks sheet. Please try again." },
          { status: 500, headers: noCacheHeaders }
        );
      }

      const marksMap = new Map();
      marksRows.forEach((m: any) => marksMap.set(m.student_id, m));

      // OD is stored on exam-day attendance, not on student_exam_marks.
      const odSet = new Set(odRows.map((r: any) => r.studentId));

      const roster = students.map((st: any) => {
        const mark = marksMap.get(st.id);
        return {
          student_id: st.id,
          student_name: st.name,
          roll_number: st.roll_number || st.register_number || st.id,
          classGroup: st.classGroup,
          department: st.department,
          marks_obtained: mark ? mark.marks_obtained : null,
          max_marks: mark?.max_marks || exam.max_marks || 50,
          is_absent: mark ? Boolean(mark.is_absent) : false,
          is_od: odSet.has(st.id),
          grade: mark ? mark.grade : null,
          remarks: mark ? mark.remarks : "",
          evaluated_by: mark ? mark.evaluated_by : null,
          updated_at: mark ? mark.updated_at : null,
        };
      });

      return NextResponse.json({ success: true, exam, roster }, { headers: noCacheHeaders });
    }

    if (studentId) {
      // Fetch student's marks with exam details
      const studentMarks = await db.all(
        `SELECT sem.*, es.exam_type, es.subject_name, es.subject_code, es.exam_date, es.session_time, es.max_marks, es.passing_marks, es.hall_room, es.department, es.semester
         FROM student_exam_marks sem
         JOIN exam_schedules es ON sem.exam_id = es.id
         WHERE sem.student_id = ?
         ORDER BY es.exam_date DESC`,
        [studentId]
      );
      return NextResponse.json({ success: true, marks: studentMarks || [] }, { headers: noCacheHeaders });
    }

    // General list / CAM / KAM / Mentor query
    let allQuery = `SELECT sem.*, 
                           s.name as student_name, s.roll_number, s.classGroup, s.department as student_department,
                           es.exam_type, es.subject_name, es.subject_code, es.exam_date, es.session_time, es.max_marks, es.passing_marks, es.department as exam_department, es.semester
                    FROM student_exam_marks sem
                    JOIN students s ON sem.student_id = s.id
                    JOIN exam_schedules es ON sem.exam_id = es.id
                    WHERE 1=1`;
    const allParams: any[] = [];

    if (collegeId && collegeId !== "all") {
      allQuery += " AND (sem.college_id = ? OR es.college_id = ?)";
      allParams.push(collegeId, collegeId);
    }

    const examType = searchParams.get("exam_type");
    if (examType && examType !== "all") {
      allQuery += " AND es.exam_type = ?";
      allParams.push(examType);
    }

    const department = searchParams.get("department");
    if (department && department !== "all") {
      allQuery += " AND (LOWER(es.department) LIKE LOWER(?) OR LOWER(s.department) LIKE LOWER(?))";
      allParams.push(`%${department}%`, `%${department}%`);
    }

    allQuery += " ORDER BY es.exam_date DESC, s.name ASC LIMIT 500";

    const allMarks = await db.all(allQuery, allParams);
    return NextResponse.json({ success: true, marks: allMarks || [] }, { headers: noCacheHeaders });
  } catch (error: any) {
    console.error("Error fetching marks:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch marks" }, { status: 500, headers: noCacheHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "cm", "kam", "admin", "sme"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const body = await request.json();
    const { exam_id, marks } = body;
    const evaluated_by = auth?.user?.name || body.evaluated_by || "Faculty Evaluator";

    if (!exam_id || !marks || !Array.isArray(marks)) {
      return NextResponse.json({ success: false, message: "Invalid payload. exam_id and marks array required" }, { status: 400 });
    }

    const db = await getDb();
    const exam = await db.get("SELECT * FROM exam_schedules WHERE id = ?", [exam_id]);
    if (!exam) {
      return NextResponse.json({ success: false, message: "Exam not found" }, { status: 404 });
    }

    const maxMarks = exam.max_marks || 50;

    // Duplicate student rows in one payload would trip the conflict target twice in a
    // single multi-row upsert; the old per-row loop resolved that as last-entry-wins.
    const byStudent = new Map<string, any>();
    for (const entry of marks) {
      if (entry?.student_id) byStudent.set(String(entry.student_id), entry);
    }

    const evaluatedByName = evaluated_by || "Campus Manager";
    const attendedByName = evaluated_by || "Faculty Mentor";
    const attTimestamp = new Date().toISOString();
    const markRows: any[][] = [];
    const attRows: any[][] = [];

    for (const [student_id, entry] of byStudent.entries()) {
      const is_absent = entry.is_absent ? 1 : 0;
      const entryMaxMarks = entry.max_marks ? parseFloat(entry.max_marks) : maxMarks;
      const passingMarks = exam.passing_marks || (entryMaxMarks * 0.4);
      const marks_obtained = is_absent ? null : (entry.marks_obtained !== null && entry.marks_obtained !== undefined ? parseFloat(entry.marks_obtained) : null);
      const remarks = entry.remarks || "";

      // Auto-compute grade
      let grade = "F";
      if (!is_absent && marks_obtained !== null) {
        const pct = (marks_obtained / entryMaxMarks) * 100;
        if (pct >= 90) grade = "O";
        else if (pct >= 80) grade = "A+";
        else if (pct >= 70) grade = "A";
        else if (pct >= 60) grade = "B+";
        else if (pct >= 50) grade = "B";
        else if (marks_obtained >= passingMarks) grade = "C";
        else grade = "RA / F";
      } else if (is_absent) {
        grade = "AB";
      }

      markRows.push([
        `mark_${exam_id}_${student_id}`,
        exam_id,
        student_id,
        exam.college_id,
        marks_obtained,
        entryMaxMarks,
        is_absent,
        grade,
        remarks,
        evaluatedByName
      ]);

      // Attendance rows mirror the marks in the same transaction, so a saved mark can
      // never exist without its attendance row (the old write swallowed that failure).
      attRows.push([
        `att_exam_${exam_id}_${student_id}`,
        student_id,
        exam_id,
        exam.exam_date,
        is_absent ? "absent" : (entry.status === "od" ? "od" : "present"),
        attendedByName,
        attTimestamp,
        "Exam",
        "Offline",
        `Exam Attendance: ${exam.exam_type} - ${exam.subject_name}`
      ]);
    }

    await db.transaction(async (tx) => {
      for (const chunk of chunkList(markRows, 100)) {
        const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").join(", ");
        await tx.run(
          `INSERT INTO student_exam_marks (
            id, exam_id, student_id, college_id, marks_obtained, max_marks, is_absent, grade, remarks, evaluated_by, updated_at
          ) VALUES ${values}
          ON CONFLICT(exam_id, student_id) DO UPDATE SET
            marks_obtained = excluded.marks_obtained,
            max_marks = excluded.max_marks,
            is_absent = excluded.is_absent,
            grade = excluded.grade,
            remarks = excluded.remarks,
            evaluated_by = excluded.evaluated_by,
            updated_at = CURRENT_TIMESTAMP`,
          ...chunk.flat()
        );
      }

      // Remove prior exam-slot attendance for these students (legacy rows may lack the
      // deterministic id), then insert the fresh batch.
      await writeInChunks(tx, Array.from(byStudent.keys()), (chunk, placeholders) => ({
        sql: `DELETE FROM student_attendance WHERE slotId = ? AND dateStr = ? AND studentId IN (${placeholders})`,
        params: [exam_id, exam.exam_date, ...chunk]
      }), 400);

      for (const chunk of chunkList(attRows, 100)) {
        const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        await tx.run(
          `INSERT INTO student_attendance (id, studentId, slotId, dateStr, status, markedBy, timestamp, type, mode, attendanceTypeSub)
           VALUES ${values}`,
          ...chunk.flat()
        );
      }
    });

    notifyRealtimeEvent({
      domain: "exams",
      action: "marks_updated",
      collegeId: exam.college_id,
      payload: { examId: exam_id, count: byStudent.size }
    });
    notifyRealtimeEvent({
      domain: "attendance",
      action: "marked",
      collegeId: exam.college_id,
      payload: { type: "Exam", examId: exam_id }
    });

    const studentIds = Array.from(byStudent.keys());
    if (studentIds.length > 0) {
      dispatchSystemNotification(db, {
        userIds: studentIds,
        title: `Exam Marks Published — ${exam.subject || "Exam"}`,
        message: `Your marks for ${exam.name || exam.subject} have been recorded. Check Exams to view your score.`,
        link: "/student/exams",
        type: "success",
        domain: "exams",
        action: "marks_submitted",
        collegeId: exam.college_id,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, message: `Successfully recorded marks and attendance for ${byStudent.size} students` });
  } catch (error: any) {
    console.error("Error recording marks:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to record marks" }, { status: 500 });
  }
}
