export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, chunkList, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("collegeId");
    const mentorId = searchParams.get("mentorId");
    const subject = searchParams.get("subject");
    const classGroup = searchParams.get("classGroup");
    const weekNumber = searchParams.get("weekNumber");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type");

    // If requesting weekly academic tasks and student marks
    if (type === "weekly" || searchParams.get("action") === "weekly") {
      let taskQuery = "SELECT * FROM weekly_academic_tasks WHERE 1=1";
      const taskParams: any[] = [];
      if (subject && subject !== "all") {
        taskQuery += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
        taskParams.push(subject);
      }
      if (classGroup && classGroup !== "all") {
        taskQuery += " AND LOWER(TRIM(class_group)) = LOWER(TRIM(?))";
        taskParams.push(classGroup);
      }
      if (weekNumber) {
        taskQuery += " AND week_number = ?";
        taskParams.push(parseInt(weekNumber, 10));
      }

      let marksQuery = "SELECT * FROM student_academic_tracker WHERE 1=1";
      const marksParams: any[] = [];
      if (subject && subject !== "all") {
        marksQuery += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
        marksParams.push(subject);
      }
      if (classGroup && classGroup !== "all") {
        marksQuery += " AND LOWER(TRIM(class_group)) = LOWER(TRIM(?))";
        marksParams.push(classGroup);
      }
      if (weekNumber) {
        marksQuery += " AND week_number = ?";
        marksParams.push(parseInt(weekNumber, 10));
      }

      // Tasks and marks filter on the same inputs and depend on nothing but the request,
      // so one round trip serves the whole weekly view. Both tables only exist where
      // their migration has run, so a failed slice still degrades to empty - just loudly.
      const weeklyFailures: QueryFailure[] = [];
      const [tasks, tracker] = await db.multiQuery(
        [
          { sql: taskQuery, params: taskParams },
          { sql: marksQuery, params: marksParams },
        ],
        weeklyFailures
      );
      if (weeklyFailures.length > 0) {
        console.warn("[/api/academic-tracker] weekly partial read:", weeklyFailures.map(f => f.sql.slice(0, 60)));
      }

      return NextResponse.json({
        success: true,
        weeklyTasks: tasks,
        studentTracker: tracker
      });
    }

    // Default: Fetch Conduction Entries + All Weekly Academic Data
    let query = "SELECT * FROM academic_tracker WHERE 1=1";
    const params: any[] = [];

    if (collegeId && collegeId !== "all") {
      query += " AND (college_id = ? OR mentor_id IN (SELECT id FROM mentors WHERE college_id = ?))";
      params.push(collegeId, collegeId);
    }
    if (mentorId && mentorId !== "all") {
      query += " AND mentor_id = ?";
      params.push(mentorId);
    }
    if (subject && subject !== "all") {
      query += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
      params.push(subject);
    }
    if (classGroup && classGroup !== "all") {
      query += " AND LOWER(TRIM(class_group)) = LOWER(TRIM(?))";
      params.push(classGroup);
    }
    if (startDate) {
      query += " AND date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND date <= ?";
      params.push(endDate);
    }

    query += " ORDER BY date DESC, period_slot ASC LIMIT 500";

    let weeklyTasksPromise;
    let studentTrackerPromise;

    if (collegeId && collegeId !== "all") {
      weeklyTasksPromise = db.all(
        "SELECT * FROM weekly_academic_tasks WHERE class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?)",
        collegeId
      ).catch(() => []);
      studentTrackerPromise = db.all(
        "SELECT * FROM student_academic_tracker WHERE class_group IN (SELECT DISTINCT classGroup FROM students WHERE college_id = ?)",
        collegeId
      ).catch(() => []);
    } else {
      weeklyTasksPromise = db.all("SELECT * FROM weekly_academic_tasks").catch(() => []);
      studentTrackerPromise = db.all("SELECT * FROM student_academic_tracker").catch(() => []);
    }

    const [entries, weeklyTasks, studentTracker] = await Promise.all([
      db.all(query, ...params).catch(() => []),
      weeklyTasksPromise,
      studentTrackerPromise
    ]);

    return NextResponse.json({
      success: true,
      entries,
      weeklyTasks,
      studentTracker
    });
  } catch (err: any) {
    console.error("GET /api/academic-tracker error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to fetch academic tracker entries." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["mentor", "cm", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    // Idempotent, runs once per process — adds weekly plan linkage columns before writes.
    try {
      await ensureMigration("academic_tracker_weekly_plan_link");
    } catch (migrationErr) {
      console.error("[academic-tracker] migration ensure failed:", migrationErr);
    }
    const body = await request.json();

    // ─────────────────────────────────────────────────────────────
    // 1. ACTION: ASSIGN WEEKLY ACADEMIC TASK
    // ─────────────────────────────────────────────────────────────
    if (body.action === "assign_weekly_task") {
      const {
        classGroup,
        subject,
        weekNumber,
        taskName,
        taskPdfUrl,
        quizTopic,
        assessmentTopic,
        assignmentTopic,
        mentorId,
        taskDate
      } = body;

      if (!classGroup || !subject || weekNumber === undefined || !mentorId || !taskName) {
        return NextResponse.json(
          { success: false, message: "Missing required fields: classGroup, subject, weekNumber, mentorId, or taskName." },
          { status: 400 }
        );
      }

      // task_date is added once by the startup migration
      // `weekly_academic_tasks_task_date`, not by DDL on every request.

      const id = generateId("acad_task");
      const now = new Date().toISOString();
      const effectiveTaskDate = (taskDate && String(taskDate).trim()) || now.slice(0, 10);

      await db.run(
        `INSERT INTO weekly_academic_tasks (
          id, class_group, subject, week_number, task_name, task_pdf_url, task_date, quiz_topic, assessment_topic, assignment_topic, mentor_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(class_group, subject, week_number) DO UPDATE SET
          task_name = excluded.task_name,
          task_pdf_url = excluded.task_pdf_url,
          task_date = excluded.task_date,
          quiz_topic = excluded.quiz_topic,
          assessment_topic = excluded.assessment_topic,
          assignment_topic = excluded.assignment_topic,
          mentor_id = excluded.mentor_id,
          updated_at = excluded.updated_at`,
        [
          id,
          classGroup.trim(),
          subject.trim(),
          parseInt(weekNumber, 10),
          taskName.trim(),
          taskPdfUrl || null,
          effectiveTaskDate,
          quizTopic || null,
          assessmentTopic || null,
          assignmentTopic || null,
          mentorId.trim(),
          now
        ]
      );

      const savedTask = await db.get(
        "SELECT * FROM weekly_academic_tasks WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND week_number = ?",
        [classGroup.trim(), subject.trim(), parseInt(weekNumber, 10)]
      );

      notifyRealtimeEvent({
        domain: "tracker",
        action: "task_assigned",
        targetRoles: ["student", "mentor", "cm", "admin"],
        payload: { classGroup, subject, weekNumber }
      });

      try {
        const studentRows = await db.all(
          `SELECT id, email FROM students WHERE LOWER(TRIM(COALESCE("classGroup", classgroup, ''))) = LOWER(TRIM(?))`,
          [classGroup.trim()]
        );
        const studentIds = studentRows.map((s: any) => s.id || s.email).filter(Boolean);
        if (studentIds.length > 0) {
          await dispatchSystemNotification(db, {
            userIds: studentIds,
            title: `New Academic Task: ${taskName.trim()}`,
            message: `Week ${weekNumber} task for ${subject.trim()} has been assigned. Due date: ${effectiveTaskDate}.`,
            link: "/student/academic-tracker",
            type: "info",
            domain: "tracker",
            action: "task_assigned",
            payload: { classGroup, subject, weekNumber, taskName }
          });
        }
      } catch (notifErr) {
        console.error("[academic-tracker] dispatch task notification error:", notifErr);
      }

      return NextResponse.json({ success: true, task: savedTask });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. ACTION: BULK UPLOAD ACADEMIC MARKS (MAPPED BY EMAIL)
    // ─────────────────────────────────────────────────────────────
    if (body.action === "bulk_upload_marks") {
      const { records, classGroup, subject, weekNumber, gradedBy } = body;
      if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json({ success: false, message: "No student records provided for upload." }, { status: 400 });
      }

      const now = new Date().toISOString();
      // Deduplicated by the upsert's conflict key so a repeated row inside one upload
      // resolves as last-entry-wins, exactly like the old sequential loop.
      const markRows = new Map<string, any[]>();

      for (const rec of records) {
        const studentEmail = (rec.studentEmail || rec.email || "").trim().toLowerCase();
        if (!studentEmail) continue;

        const studentId = rec.studentId || rec.id || null;
        const cGroup = (rec.classGroup || classGroup || "").trim();
        const subj = (rec.subject || subject || "").trim();
        const wk = parseInt(rec.weekNumber || weekNumber, 10) || 1;

        const qMarks = rec.quizMarks !== undefined && rec.quizMarks !== null && rec.quizMarks !== "" ? parseFloat(rec.quizMarks) : null;
        const asMarks = rec.assessmentMarks !== undefined && rec.assessmentMarks !== null && rec.assessmentMarks !== "" ? parseFloat(rec.assessmentMarks) : null;
        const agMarks = rec.assignmentMarks !== undefined && rec.assignmentMarks !== null && rec.assignmentMarks !== "" ? parseFloat(rec.assignmentMarks) : null;

        let totMarks: number | null = null;
        if (qMarks !== null || asMarks !== null || agMarks !== null) {
          totMarks = (qMarks || 0) + (asMarks || 0) + (agMarks || 0);
        }

        const attendanceStatus = rec.attendanceStatus || rec.attendance || "Present";
        const feedback = rec.feedback || rec.remarks || null;
        const gBy = rec.gradedBy || gradedBy || null;

        markRows.set(`${studentEmail}|${cGroup}|${subj}|${wk}`, [
          generateId("st_acad"),
          studentEmail,
          studentId,
          cGroup,
          subj,
          wk,
          attendanceStatus,
          qMarks,
          asMarks,
          agMarks,
          totMarks,
          feedback,
          gBy,
          now
        ]);
      }

      const rowsToWrite = Array.from(markRows.values());
      await db.transaction(async (tx) => {
        for (const chunk of chunkList(rowsToWrite, 100)) {
          const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
          await tx.run(
            `INSERT INTO student_academic_tracker (
              id, student_email, student_id, class_group, subject, week_number, attendance_status, quiz_marks, assessment_marks, assignment_marks, total_marks, feedback, graded_by, updated_at
            ) VALUES ${values}
            ON CONFLICT(student_email, class_group, subject, week_number) DO UPDATE SET
              student_id = COALESCE(excluded.student_id, student_academic_tracker.student_id),
              attendance_status = excluded.attendance_status,
              quiz_marks = excluded.quiz_marks,
              assessment_marks = excluded.assessment_marks,
              assignment_marks = excluded.assignment_marks,
              total_marks = excluded.total_marks,
              feedback = excluded.feedback,
              graded_by = excluded.graded_by,
              updated_at = excluded.updated_at`,
            ...chunk.flat()
          );
        }
      });
      const updatedCount = rowsToWrite.length;

      // Fetch all updated entries for this classGroup and subject/week
      const updatedTracker = await db.all(
        "SELECT * FROM student_academic_tracker WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND week_number = ?",
        [classGroup.trim(), subject.trim(), parseInt(weekNumber, 10)]
      );

      notifyRealtimeEvent({
        domain: "tracker",
        action: "marks_updated",
        targetRoles: ["student", "mentor", "cm", "admin"],
        payload: { classGroup, subject, weekNumber, updatedCount }
      });

      try {
        const uploadedEmails = Array.from(markRows.values()).map(r => r[1]).filter(Boolean);
        if (uploadedEmails.length > 0) {
          await dispatchSystemNotification(db, {
            userIds: uploadedEmails,
            title: `Academic Marks Updated: ${subject.trim()}`,
            message: `Your Week ${weekNumber} marks for ${subject.trim()} (${classGroup.trim()}) have been published.`,
            link: "/student/academic-tracker",
            type: "success",
            domain: "tracker",
            action: "marks_updated",
            payload: { classGroup, subject, weekNumber }
          });
        }
      } catch (notifErr) {
        console.error("[academic-tracker] dispatch bulk marks notification error:", notifErr);
      }

      return NextResponse.json({
        success: true,
        message: `Successfully updated academic marks for ${updatedCount} students!`,
        updatedCount,
        studentTracker: updatedTracker
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ACTION: SINGLE GRADE / SUBMISSION ENTRY (BY EMAIL)
    // ─────────────────────────────────────────────────────────────
    if (body.action === "grade_student" || body.action === "grade_entry") {
      const {
        studentEmail,
        studentId,
        classGroup,
        subject,
        weekNumber,
        quizMarks,
        assessmentMarks,
        assignmentMarks,
        attendanceStatus,
        submissionUrl,
        feedback,
        gradedBy
      } = body;

      const email = (studentEmail || "").trim().toLowerCase();
      if (!email || !classGroup || !subject || weekNumber === undefined) {
        return NextResponse.json(
          { success: false, message: "Missing required fields: studentEmail, classGroup, subject, or weekNumber." },
          { status: 400 }
        );
      }

      const qMarks = quizMarks !== undefined && quizMarks !== null && quizMarks !== "" ? parseFloat(quizMarks) : null;
      const asMarks = assessmentMarks !== undefined && assessmentMarks !== null && assessmentMarks !== "" ? parseFloat(assessmentMarks) : null;
      const agMarks = assignmentMarks !== undefined && assignmentMarks !== null && assignmentMarks !== "" ? parseFloat(assignmentMarks) : null;

      let totMarks: number | null = null;
      if (qMarks !== null || asMarks !== null || agMarks !== null) {
        totMarks = (qMarks || 0) + (asMarks || 0) + (agMarks || 0);
      }

      const id = generateId("st_acad");
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO student_academic_tracker (
          id, student_email, student_id, class_group, subject, week_number, attendance_status, submission_url, quiz_marks, assessment_marks, assignment_marks, total_marks, feedback, graded_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_email, class_group, subject, week_number) DO UPDATE SET
          student_id = COALESCE(excluded.student_id, student_academic_tracker.student_id),
          attendance_status = COALESCE(excluded.attendance_status, student_academic_tracker.attendance_status),
          submission_url = CASE WHEN excluded.submission_url IS NOT NULL THEN excluded.submission_url ELSE student_academic_tracker.submission_url END,
          quiz_marks = CASE WHEN excluded.quiz_marks IS NOT NULL THEN excluded.quiz_marks ELSE student_academic_tracker.quiz_marks END,
          assessment_marks = CASE WHEN excluded.assessment_marks IS NOT NULL THEN excluded.assessment_marks ELSE student_academic_tracker.assessment_marks END,
          assignment_marks = CASE WHEN excluded.assignment_marks IS NOT NULL THEN excluded.assignment_marks ELSE student_academic_tracker.assignment_marks END,
          total_marks = (
            COALESCE(CASE WHEN excluded.quiz_marks IS NOT NULL THEN excluded.quiz_marks ELSE student_academic_tracker.quiz_marks END, 0) +
            COALESCE(CASE WHEN excluded.assessment_marks IS NOT NULL THEN excluded.assessment_marks ELSE student_academic_tracker.assessment_marks END, 0) +
            COALESCE(CASE WHEN excluded.assignment_marks IS NOT NULL THEN excluded.assignment_marks ELSE student_academic_tracker.assignment_marks END, 0)
          ),
          feedback = CASE WHEN excluded.feedback IS NOT NULL THEN excluded.feedback ELSE student_academic_tracker.feedback END,
          graded_by = CASE WHEN excluded.graded_by IS NOT NULL THEN excluded.graded_by ELSE student_academic_tracker.graded_by END,
          updated_at = excluded.updated_at`,
        [
          id,
          email,
          studentId || null,
          classGroup.trim(),
          subject.trim(),
          parseInt(weekNumber, 10),
          attendanceStatus || "Present",
          submissionUrl || null,
          qMarks,
          asMarks,
          agMarks,
          totMarks,
          feedback || null,
          gradedBy || null,
          now
        ]
      );

      const updatedEntry = await db.get(
        "SELECT * FROM student_academic_tracker WHERE LOWER(TRIM(student_email)) = LOWER(TRIM(?)) AND LOWER(TRIM(class_group)) = LOWER(TRIM(?)) AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND week_number = ?",
        [email, classGroup.trim(), subject.trim(), parseInt(weekNumber, 10)]
      );

      notifyRealtimeEvent({
        domain: "tracker",
        action: "student_graded",
        targetUserIds: [studentId, email].filter(Boolean) as string[],
        targetRoles: ["student", "mentor", "cm", "admin"],
        payload: { studentEmail: email, classGroup, subject, weekNumber }
      });

      try {
        await dispatchSystemNotification(db, {
          userIds: [studentId, email].filter(Boolean),
          title: `Academic Grade Evaluated: ${subject.trim()}`,
          message: `Your Week ${weekNumber} submission for ${subject.trim()} (${classGroup.trim()}) was evaluated${totMarks !== null ? ` (Total: ${totMarks})` : ""}.`,
          link: "/student/academic-tracker",
          type: "success",
          domain: "tracker",
          action: "student_graded",
          payload: { studentEmail: email, classGroup, subject, weekNumber, totalMarks: totMarks }
        });
      } catch (notifErr) {
        console.error("[academic-tracker] dispatch single grade notification error:", notifErr);
      }

      return NextResponse.json({ success: true, entry: updatedEntry });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. ACTION: STANDARD PERIOD CONDUCTION LOG
    // ─────────────────────────────────────────────────────────────
    const {
      id: existingId,
      date,
      periodSlot,
      classGroup,
      subject,
      unit,
      topic,
      comments,
      status,
      mentorId,
      mentorName,
      collegeId,
      weeklyPlanId,
      weeklyPlanWeek
    } = body;

    if (!date || !periodSlot || !classGroup || !subject || !unit || !topic || !mentorId) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: date, periodSlot, classGroup, subject, unit, topic, or mentorId." },
        { status: 400 }
      );
    }

    const todayStr = getInstitutionDateStr();
    if (date.trim() !== todayStr) {
      return NextResponse.json(
        { success: false, message: "Period conduction can only be logged for today's active schedule. Past and future dates cannot be logged." },
        { status: 400 }
      );
    }

    const id = existingId || generateId("acad");
    const now = new Date().toISOString();

    let resolvedMentorName = mentorName;
    let resolvedCollegeId = collegeId;
    if (!resolvedMentorName || !resolvedCollegeId) {
      const mentorRow = await db.get("SELECT name, college_id FROM mentors WHERE id = ?", mentorId);
      if (mentorRow) {
        resolvedMentorName = resolvedMentorName || mentorRow.name;
        resolvedCollegeId = resolvedCollegeId || mentorRow.college_id;
      }
    }

    // ── CAM DAY ORDER & SCHEDULE GUARD ──────────────────────────
    // Period conduction must work strictly as per CAM daily configuration and day order
    if (resolvedCollegeId) {
      const dayConfig = await db.get(
        "SELECT day_type, day_order, notes FROM campus_daily_configs WHERE college_id = ? AND dateStr = ?",
        [resolvedCollegeId, todayStr]
      );

      // Holiday check takes priority - cannot log periods on holidays
      if (dayConfig && dayConfig.day_type === "holiday") {
        return NextResponse.json(
          { success: false, message: `Today is marked as a Holiday by Campus Manager${dayConfig.notes ? ` (${dayConfig.notes})` : ""}. Period conduction cannot be logged on a holiday.` },
          { status: 422 }
        );
      }

      // Day order validation - ensures CM has set a valid day schedule
      if (!dayConfig || !dayConfig.day_type || dayConfig.day_order === "None") {
        return NextResponse.json(
          { success: false, message: "Day order has not been configured by Campus Manager for today. The CM must set today's day schedule before period conduction can be logged." },
          { status: 422 }
        );
      }

      if (!dayConfig.day_order || dayConfig.day_order === "None") {
        return NextResponse.json(
          { success: false, message: "Campus Manager has not specified a Day Order for today. Period logging requires an active CM Day Order setting." },
          { status: 422 }
        );
      }
    }
    // ── END CAM DAY ORDER GUARD ─────────────────────────────────

    await db.run(
      `INSERT INTO academic_tracker (
        id, date, period_slot, class_group, subject, unit, topic, comments, status, mentor_id, mentor_name, college_id, weekly_plan_id, weekly_plan_week, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mentor_id, date, period_slot, subject, class_group) DO UPDATE SET
        unit = excluded.unit,
        topic = excluded.topic,
        comments = excluded.comments,
        status = excluded.status,
        mentor_name = excluded.mentor_name,
        college_id = excluded.college_id,
        weekly_plan_id = excluded.weekly_plan_id,
        weekly_plan_week = excluded.weekly_plan_week,
        updated_at = excluded.updated_at`,
      [
        id,
        date.trim(),
        periodSlot.trim(),
        classGroup.trim(),
        subject.trim(),
        unit.trim(),
        topic.trim(),
        comments ? comments.trim() : "",
        status ? status.trim() : "Conducted",
        mentorId.trim(),
        resolvedMentorName || "",
        resolvedCollegeId || "",
        weeklyPlanId ? String(weeklyPlanId) : null,
        weeklyPlanWeek !== undefined && weeklyPlanWeek !== null && weeklyPlanWeek !== "" ? parseInt(String(weeklyPlanWeek), 10) || null : null,
        now
      ]
    );

    const savedEntry = await db.get(
      "SELECT * FROM academic_tracker WHERE mentor_id = ? AND date = ? AND period_slot = ? AND subject = ? AND class_group = ?",
      [mentorId.trim(), date.trim(), periodSlot.trim(), subject.trim(), classGroup.trim()]
    );

    // Log the conduction event for analytics and tracking
    console.log(`[academic-tracker] Period conduction logged: mentor=${mentorId}, date=${date}, period=${periodSlot}, class=${classGroup}, subject=${subject}`);

    return NextResponse.json({
      success: true,
      message: "Academic log recorded successfully.",
      entry: savedEntry
    });
  } catch (err: any) {
    console.error("POST /api/academic-tracker error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to save academic tracker entry." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["mentor", "cm", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    return POST(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) }));
  } catch (err: any) {
    console.error("PUT /api/academic-tracker error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to update academic entry." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["mentor", "cm", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const action = searchParams.get("action");
    const classGroup = searchParams.get("classGroup");
    const subject = searchParams.get("subject");
    const weekNumber = searchParams.get("weekNumber");

    // Handle weekly task deletion with proper param validation
    if (action === "delete_weekly_task") {
      if (!classGroup || !subject || !weekNumber) {
        return NextResponse.json(
          { success: false, message: "Missing classGroup, subject, or weekNumber for weekly task deletion." },
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
      await db.run(
        `DELETE FROM weekly_academic_tasks 
         WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) 
           AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) 
           AND week_number = ?`,
        [classGroup, subject, wk]
      );
      await db.run(
        `DELETE FROM student_academic_tracker 
         WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) 
           AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) 
           AND week_number = ?`,
        [classGroup, subject, wk]
      );
      return NextResponse.json({ success: true, message: "Weekly academic task and associated records deleted." });
    }

    // Handle bulk deletion by classGroup, subject, weekNumber
    if (classGroup && subject && weekNumber) {
      const wk = parseInt(weekNumber, 10);
      if (isNaN(wk) || wk < 1) {
        return NextResponse.json(
          { success: false, message: "Invalid weekNumber: must be a positive integer." },
          { status: 400 }
        );
      }
      await db.run(
        `DELETE FROM weekly_academic_tasks 
         WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) 
           AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) 
           AND week_number = ?`,
        [classGroup, subject, wk]
      );
      await db.run(
        `DELETE FROM student_academic_tracker 
         WHERE LOWER(TRIM(class_group)) = LOWER(TRIM(?)) 
           AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) 
           AND week_number = ?`,
        [classGroup, subject, wk]
      );
      return NextResponse.json({ success: true, message: "Weekly academic task and associated records deleted." });
    }

    if (!id) {
      return NextResponse.json({ success: false, message: "Missing id parameter." }, { status: 400 });
    }

    await db.run("DELETE FROM academic_tracker WHERE id = ?", id);
    return NextResponse.json({ success: true, message: "Academic log deleted successfully." });
  } catch (err: any) {
    console.error("DELETE /api/academic-tracker error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to delete academic tracker entry." }, { status: 500 });
  }
}
