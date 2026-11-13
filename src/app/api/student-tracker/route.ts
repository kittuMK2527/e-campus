export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { normalizeRole, requireAuth, Role } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

const TASK_ASSIGN_ROLES: Role[] = ["mentor", "admin"];

// Assigning a weekly task emails every student in the class group.
export async function POST(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: TASK_ASSIGN_ROLES });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const body = await request.json();
    const { action, classGroup, subject, weekNumber, taskName, taskPdfUrl, mentorId } = body;

    if (action === "assign_task") {
      if (!classGroup || !subject || weekNumber === undefined || !mentorId || !taskName) {
        return NextResponse.json(
          { success: false, message: "Missing required fields: classGroup, subject, weekNumber, mentorId, or taskName." },
          { status: 400 }
        );
      }

      // Validate taskPdfUrl is a valid URL or null
      if (taskPdfUrl && typeof taskPdfUrl !== "string") {
        return NextResponse.json(
          { success: false, message: "taskPdfUrl must be a string URL or null." },
          { status: 400 }
        );
      }

      const id = generateId("task");
      
      const now = new Date().toISOString();
      // INSERT OR REPLACE in weekly_tasks
      await db.run(
        `INSERT INTO weekly_tasks (id, class_group, subject, week_number, mentor_id, task_name, task_pdf_url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(class_group, subject, week_number) DO UPDATE SET
           task_name = excluded.task_name,
           task_pdf_url = excluded.task_pdf_url,
           mentor_id = excluded.mentor_id,
           updated_at = excluded.updated_at`,
        [id, classGroup, subject, weekNumber, mentorId, taskName, taskPdfUrl || null, now]
      );

      // Fetch the updated task
      const updatedTask = await db.get(
        "SELECT * FROM weekly_tasks WHERE class_group = ? AND subject = ? AND week_number = ?",
        [classGroup, subject, weekNumber]
      );

      try {
        const studentRows = await db.all(
          `SELECT id, email FROM students WHERE LOWER(TRIM(COALESCE(classgroup, ''))) = LOWER(TRIM(?))`,
          [classGroup.trim()]
        );
        const studentIds = studentRows.map((s: any) => s.id || s.email).filter(Boolean);
        if (studentIds.length > 0) {
          await dispatchSystemNotification(db, {
            userIds: studentIds,
            title: `Task Assigned: ${taskName.trim()}`,
            message: `Week ${weekNumber} task for ${subject.trim()} has been assigned.`,
            link: "/student/tasks",
            type: "info",
            domain: "tracker",
            action: "task_assigned",
            payload: { classGroup, subject, weekNumber, taskName }
          });
        }
      } catch (notifErr) {
        console.error("[student-tracker] dispatch task notification error:", notifErr);
      }

      return NextResponse.json({ success: true, task: updatedTask });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    console.error("API POST student-tracker error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["student", ...TASK_ASSIGN_ROLES, "cm", "kam"]
  });
  if (errorResponse || !auth) {
    return errorResponse || NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const body = await request.json();
    const { action, studentId, classGroup, subject, weekNumber, submissionUrl, vivaAssessment, marks, gradedBy } = body;

    // Handle grade_entry action first for staff (cm, kam, admin)
    if (action === "grade_entry") {
      if (!studentId || !classGroup || !subject || weekNumber === undefined) {
        return NextResponse.json(
          { success: false, message: "Missing required fields: studentId, classGroup, subject, or weekNumber." },
          { status: 400 }
        );
      }

      // Check marks boundaries
      if (marks !== undefined && marks !== null) {
        const numericMarks = parseFloat(marks);
        if (isNaN(numericMarks) || numericMarks < 0 || numericMarks > 10) {
          return NextResponse.json(
            { success: false, message: "Marks must be a number between 0 and 10." },
            { status: 400 }
          );
        }
      }

      const id = generateId("track");

      const now = new Date().toISOString();
      // INSERT OR REPLACE in student_tracker
      await db.run(
        `INSERT INTO student_tracker (id, student_id, class_group, subject, week_number, submission_url, viva_assessment, marks, graded_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, class_group, subject, week_number) DO UPDATE SET
           submission_url = CASE WHEN excluded.submission_url IS NOT NULL THEN excluded.submission_url ELSE student_tracker.submission_url END,
           viva_assessment = CASE WHEN excluded.viva_assessment IS NOT NULL THEN excluded.viva_assessment ELSE student_tracker.viva_assessment END,
           marks = CASE WHEN excluded.marks IS NOT NULL THEN excluded.marks ELSE student_tracker.marks END,
           graded_by = CASE WHEN excluded.graded_by IS NOT NULL THEN excluded.graded_by ELSE student_tracker.graded_by END,
           updated_at = excluded.updated_at`,
        [
          id,
          studentId,
          classGroup,
          subject,
          weekNumber,
          submissionUrl !== undefined ? submissionUrl : null,
          vivaAssessment !== undefined ? vivaAssessment : null,
          marks !== undefined && marks !== null ? parseFloat(marks) : null,
          gradedBy !== undefined ? gradedBy : null,
          now
        ]
      );

      // Fetch the updated entry
      const updatedEntry = await db.get(
        "SELECT * FROM student_tracker WHERE student_id = ? AND class_group = ? AND subject = ? AND week_number = ?",
        [studentId, classGroup, subject, weekNumber]
      );

      try {
        await dispatchSystemNotification(db, {
          userIds: [studentId],
          title: `Task Graded: ${subject}`,
          message: `Your Week ${weekNumber} submission for ${subject} was evaluated${marks !== undefined && marks !== null ? ` (Marks: ${marks}/10)` : ""}.`,
          link: "/student/tasks",
          type: "success",
          domain: "tracker",
          action: "grade_updated",
          payload: { studentId, classGroup, subject, weekNumber, marks }
        });
      } catch (notifErr) {
        console.error("[student-tracker] dispatch grade notification error:", notifErr);
      }

      return NextResponse.json({ success: true, entry: updatedEntry });
    }

    // Student action: students file their own submission
    if (normalizeRole(auth.user.role) === "student") {
      const selfId = auth.user.reference_id || auth.user.id;
      if (!selfId || studentId !== selfId) {
        return NextResponse.json(
          { success: false, message: "Forbidden: students may only update their own tracker entry." },
          { status: 403 }
        );
      }
      if (marks !== undefined || vivaAssessment !== undefined || gradedBy !== undefined) {
        return NextResponse.json(
          { success: false, message: "Forbidden: marks and viva are recorded by faculty." },
          { status: 403 }
        );
      }
      // Student submitting their own entry
      if (!studentId || !classGroup || !subject || weekNumber === undefined) {
        return NextResponse.json(
          { success: false, message: "Missing required fields for student submission." },
          { status: 400 }
        );
      }
      if (submissionUrl === undefined) {
        return NextResponse.json(
          { success: false, message: "submissionUrl is required for student submission." },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      // INSERT OR REPLACE in student_tracker
      await db.run(
        `INSERT INTO student_tracker (id, student_id, class_group, subject, week_number, submission_url, viva_assessment, marks, graded_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, class_group, subject, week_number) DO UPDATE SET
           submission_url = CASE WHEN excluded.submission_url IS NOT NULL THEN excluded.submission_url ELSE student_tracker.submission_url END,
           viva_assessment = CASE WHEN excluded.viva_assessment IS NOT NULL THEN excluded.viva_assessment ELSE student_tracker.viva_assessment END,
           marks = CASE WHEN excluded.marks IS NOT NULL THEN excluded.marks ELSE student_tracker.marks END,
           graded_by = CASE WHEN excluded.graded_by IS NOT NULL THEN excluded.graded_by ELSE student_tracker.graded_by END,
           updated_at = excluded.updated_at`,
        [
          generateId("track"),
          studentId,
          classGroup,
          subject,
          weekNumber,
          submissionUrl,
          vivaAssessment !== undefined ? vivaAssessment : null,
          marks !== undefined && marks !== null ? parseFloat(marks) : null,
          gradedBy !== undefined ? gradedBy : null,
          now
        ]
      );

      // Fetch the updated entry
      const updatedEntry = await db.get(
        "SELECT * FROM student_tracker WHERE student_id = ? AND class_group = ? AND subject = ? AND week_number = ?",
        [studentId, classGroup, subject, weekNumber]
      );

      try {
        const task = await db.get(
          "SELECT mentor_id FROM weekly_tasks WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND week_number = ?",
          [classGroup.trim(), subject.trim(), weekNumber]
        );
        if (task?.mentor_id) {
          await dispatchSystemNotification(db, {
            userIds: [task.mentor_id],
            title: `Student Submission: ${subject}`,
            message: `A student submitted work for Week ${weekNumber} (${subject}, ${classGroup}).`,
            link: "/mentor/tracker",
            type: "info",
            domain: "tracker",
            action: "submission_uploaded",
            payload: { studentId, classGroup, subject, weekNumber }
          });
        }
      } catch (notifErr) {
        console.error("[student-tracker] dispatch submission notification error:", notifErr);
      }

      return NextResponse.json({ success: true, entry: updatedEntry });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    console.error("API PUT student-tracker error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: TASK_ASSIGN_ROLES });
  if (errorResponse) return errorResponse;

  let db: any = null;
  try {
    db = await getDb();
    const { searchParams } = new URL(request.url);
    const classGroup = searchParams.get("classGroup");
    const subject = searchParams.get("subject");
    const weekNumber = searchParams.get("weekNumber");

    if (!classGroup || !subject || !weekNumber) {
      return NextResponse.json(
        { success: false, message: "Missing classGroup, subject, or weekNumber" },
        { status: 400 }
      );
    }

    const wk = parseInt(weekNumber, 10);
    if (isNaN(wk) || wk < 1) {
      return NextResponse.json(
        { success: false, message: "Invalid weekNumber: must be a positive integer." },
        { status: 400 }
      );
    }

    // Use a transaction for atomicity: delete from both tables together
    await db.run(
      `BEGIN TRANSACTION`
    );
    await db.run(
      `DELETE FROM weekly_tasks 
       WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) 
         AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) 
         AND week_number = ?`,
      [classGroup, subject, wk]
    );
    await db.run(
      `DELETE FROM student_tracker 
       WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) 
         AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) 
         AND week_number = ?`,
      [classGroup, subject, wk]
    );
    await db.run(
      `COMMIT`
    );

    return NextResponse.json({ success: true, message: "Task deleted successfully." });
  } catch (error: any) {
    try {
      if (db) await db.run(`ROLLBACK`);
    } catch {
      // ignore rollback errors
    }
    console.error("API DELETE student-tracker error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
