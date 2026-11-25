export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { deriveSubjectType } from "@/lib/skillTracker";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "sme", "cm", "kam"] });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("mentor_weekly_plans");
    await ensureMigration("mentor_skill_clearances");
    await ensureMigration("mentor_plans_and_clearances_submission_link").catch(() => {});

    const url = new URL(request.url);
    const collegeId = url.searchParams.get("collegeId");

    // 1. Fetch all mentors, colleges, and subjects in parallel so bulk validation always has full reference data
    const [allMentors, colleges, allSubjects] = await Promise.all([
      db.all("SELECT id, name, email, college_id, department, subjects FROM mentors ORDER BY name ASC LIMIT 500").catch(() => []),
      db.all("SELECT id, name, code FROM colleges ORDER BY name ASC LIMIT 100").catch(() => []),
      db.all("SELECT id, name, type, semester, department, college_id FROM subjects ORDER BY name ASC LIMIT 500").catch(() => [])
    ]);

    const mentors = collegeId && collegeId !== "all"
      ? allMentors.filter((m: any) => m.college_id === collegeId)
      : allMentors;
    const skillSubjects = allSubjects.filter((s: any) => deriveSubjectType(s.name, s.type) === "Skill");

    // 4. Fetch Recently Assigned Tasks (from mentor_weekly_plans where created_at is recent)
    let assignedTasksQuery = `
      SELECT 
        mwp.id,
        mwp.mentor_id,
        mwp.mentor_name,
        mwp.college_id,
        mwp.department,
        mwp.subject,
        mwp.class_group,
        mwp.week_number,
        mwp.start_date AS task_given_date,
        mwp.topics_planned AS topic,
        mwp.session_plan,
        mwp.submission_link,
        mwp.status AS plan_status,
        mwp.created_at,
        mwp.updated_at,
        msc.status AS clearance_status,
        msc.score AS clearance_score,
        msc.remarks AS clearance_remarks,
        msc.verified_by,
        msc.verified_at
      FROM mentor_weekly_plans mwp
      LEFT JOIN mentor_skill_clearances msc
        ON mwp.mentor_id = msc.mentor_id
        AND LOWER(TRIM(mwp.subject)) = LOWER(TRIM(msc.subject))
        AND mwp.week_number = msc.week_number
        AND msc.scope = 'week'
      WHERE 1=1
    `;
    const taskParams: any[] = [];
    if (collegeId && collegeId !== "all") {
      assignedTasksQuery += " AND mwp.college_id = ?";
      taskParams.push(collegeId);
    }
    assignedTasksQuery += " ORDER BY mwp.created_at DESC, mwp.updated_at DESC LIMIT 150";

    const assignedTasks = await db.all(assignedTasksQuery, ...taskParams).catch(() => []);

    return NextResponse.json({
      success: true,
      mentors,
      allMentors,
      colleges,
      skillSubjects,
      assignedTasks: assignedTasks.map((t: any) => {
        let parsedPlan: any = null;
        try {
          parsedPlan = typeof t.session_plan === "string" ? JSON.parse(t.session_plan) : t.session_plan;
        } catch {
          parsedPlan = null;
        }
        const firstTask = Array.isArray(parsedPlan) ? parsedPlan[0] : null;
        const deadlineDate = t.task_given_date || firstTask?.deadline || (t.created_at ? String(t.created_at).slice(0, 10) : null);
        const subDate = t.submission_link ? (t.updated_at ? String(t.updated_at).slice(0, 10) : null) : null;
        return {
          id: t.id,
          mentor_id: t.mentor_id,
          employee_id: t.mentor_id,
          mentor_name: t.mentor_name || t.mentor_id,
          college_id: t.college_id,
          department: t.department,
          subject: t.subject,
          semester: t.class_group || "Semester 1",
          week_number: t.week_number,
          task_number: t.week_number,
          task_given_date: deadlineDate,
          deadline: deadlineDate,
          submission_date: subDate,
          topic: t.topic || firstTask?.topic || "Skill Development Task",
          description: firstTask?.description || firstTask?.instructions || null,
          reference_url: firstTask?.materialUrl || firstTask?.referenceUrl || null,
          assigned_by: firstTask?.assignedBy || t.verified_by || null,
          assigned_role: firstTask?.assignedRole || "sme",
          submission_link: t.submission_link,
          status: t.clearance_status || "pending",
          score: t.clearance_score ?? null,
          remarks: t.clearance_remarks || null,
          created_at: t.created_at
        };
      })
    });
  } catch (err: any) {
    console.error("GET /api/skill-tracker/tasks error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load task assignment metadata" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "sme"] });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("mentor_weekly_plans");
    await ensureMigration("mentor_skill_clearances");
    await ensureMigration("mentor_plans_and_clearances_submission_link").catch(() => {});
    await ensureMigration("notifications").catch(() => {});

    const body = await request.json();
    const tasksToAssign: any[] = Array.isArray(body?.tasks) ? body.tasks : [body];

    if (tasksToAssign.length === 0) {
      return NextResponse.json(
        { success: false, message: "No tasks provided for assignment." },
        { status: 400 }
      );
    }

    const user = auth?.user;
    const assignedResults: any[] = [];
    const rejected: { rowNumber: number; mentorId?: string; subject?: string; reason: string }[] = [];
    const nowIso = new Date().toISOString();
    const assignedBy = user?.name || user?.email || (user?.role === "admin" ? "System Admin" : "SME Reviewer");
    const assignedRole = user?.role || "sme";

    // High-performance batch pre-cache: avoids per-row mentor/subject/plan round trips during bulk imports
    const [allMentors, allColleges, allSubjects] = await Promise.all([
      db.all("SELECT id, name, email, college_id, department FROM mentors").catch(() => []),
      db.all("SELECT id, name, code FROM colleges").catch(() => []),
      db.all("SELECT name, type, semester, department, college_id FROM subjects").catch(() => [])
    ]);

    const mentorById = new Map<string, any>();
    const mentorByEmail = new Map<string, any>();
    const mentorsByName = new Map<string, any[]>();
    allMentors.forEach((m: any) => {
      if (m?.id) mentorById.set(String(m.id).trim().toLowerCase(), m);
      if (m?.email) mentorByEmail.set(String(m.email).trim().toLowerCase(), m);
      if (m?.name) {
        const key = String(m.name).trim().toLowerCase();
        if (!mentorsByName.has(key)) mentorsByName.set(key, []);
        mentorsByName.get(key)!.push(m);
      }
    });

    const collegeById = new Map<string, any>();
    allColleges.forEach((c: any) => {
      if (c?.id) collegeById.set(String(c.id).trim().toLowerCase(), c);
    });
    const resolveCollegeMatch = (val?: string | null) => {
      const q = (val || "").trim().toLowerCase();
      if (!q) return null;
      return (
        collegeById.get(q) ||
        allColleges.find((c: any) => c.code && String(c.code).trim().toLowerCase() === q) ||
        allColleges.find((c: any) => c.name && String(c.name).trim().toLowerCase() === q) ||
        allColleges.find((c: any) => c.name && String(c.name).trim().toLowerCase().includes(q)) ||
        null
      );
    };

    const candidateMentorIds = Array.from(
      new Set(
        tasksToAssign
          .map(t => {
            const rawId = (t.mentorId || t.employeeId || "").trim().toLowerCase();
            const mFromId = rawId ? mentorById.get(rawId) : null;
            if (mFromId?.id) return mFromId.id;
            const rawEmail = (t.emailId || t.mentorEmail || "").trim().toLowerCase();
            const mFromEmail = rawEmail ? mentorByEmail.get(rawEmail) : null;
            if (mFromEmail?.id) return mFromEmail.id;
            return (t.mentorId || t.employeeId || "").trim();
          })
          .filter(Boolean)
      )
    );
    const preloadedPlans = new Map<string, any>();
    const preloadedClearances = new Map<string, any>();

    if (candidateMentorIds.length > 0) {
      const placeholders = candidateMentorIds.map(() => "?").join(", ");
      const [plans, clearances] = await Promise.all([
        db.all(
          `SELECT id, mentor_id, LOWER(TRIM(subject)) as subject, week_number FROM mentor_weekly_plans WHERE mentor_id IN (${placeholders})`,
          candidateMentorIds
        ).catch(() => []),
        db.all(
          `SELECT id, mentor_id, LOWER(TRIM(subject)) as subject, week_number FROM mentor_skill_clearances WHERE mentor_id IN (${placeholders}) AND scope = 'week'`,
          candidateMentorIds
        ).catch(() => [])
      ]);
      plans.forEach((p: any) => preloadedPlans.set(`${p.mentor_id}|${p.subject}|${p.week_number}`, p));
      clearances.forEach((c: any) => preloadedClearances.set(`${c.mentor_id}|${c.subject}|${c.week_number}`, c));
    }

    for (let idx = 0; idx < tasksToAssign.length; idx++) {
      const t = tasksToAssign[idx];
      const rowNum = typeof t.rowNumber === "number" ? t.rowNumber : idx + 1;
      const {
        mentorId,
        employeeId,
        mentorEmail,
        emailId,
        mentorName,
        collegeId,
        campus,
        department,
        subject,
        semester,
        topic,
        taskGivenDate,
        deadline,
        weekNumber,
        taskNumber,
        description,
        instructions,
        inastructions,
        referenceUrl,
        materialUrl
      } = t;

      const rawId = (mentorId || employeeId || "").trim();
      const rawName = (mentorName || "").trim();
      const targetEmail = (emailId || mentorEmail || "").trim();
      const campusMatch = resolveCollegeMatch(collegeId || campus);

      let matchedMentor =
        (rawId ? mentorById.get(rawId.toLowerCase()) : null) ||
        (targetEmail ? mentorByEmail.get(targetEmail.toLowerCase()) : null) ||
        null;

      if (!matchedMentor && rawName) {
        const candidates = mentorsByName.get(rawName.toLowerCase()) || [];
        if (candidates.length === 1) {
          matchedMentor = candidates[0];
        } else if (candidates.length > 1 && campusMatch) {
          matchedMentor = candidates.find((c: any) => c.college_id === campusMatch.id) || null;
        }
      }

      if (allMentors.length > 0 && !matchedMentor) {
        rejected.push({
          rowNumber: rowNum,
          mentorId: rawId || undefined,
          subject: subject ? String(subject).trim() : undefined,
          reason: rawId
            ? `Mentor Employee ID "${rawId}" was not found.`
            : "Mentor could not be matched from Employee ID, Email, or Name."
        });
        continue;
      }

      const resolvedMentorId = matchedMentor?.id || rawId;
      const resolvedMentorName = matchedMentor?.name || rawName || resolvedMentorId;
      const resolvedCollegeId = matchedMentor?.college_id || campusMatch?.id || collegeId || null;

      if (!resolvedMentorId || !subject || !topic) {
        rejected.push({
          rowNumber: rowNum,
          mentorId: resolvedMentorId || undefined,
          subject: subject ? String(subject).trim() : undefined,
          reason: "Missing required field: mentorId, subject, or topic."
        });
        continue;
      }

      const cleanTopic = String(topic).trim();
      const cleanSubjectInput = String(subject).trim();
      const subjectMatches = allSubjects.filter(
        (s: any) => s?.name && String(s.name).trim().toLowerCase() === cleanSubjectInput.toLowerCase()
      );
      const matchedSubjectRow =
        (resolvedCollegeId && subjectMatches.find((s: any) => s.college_id === resolvedCollegeId)) ||
        subjectMatches[0] ||
        null;

      const cleanSubject = matchedSubjectRow?.name || cleanSubjectInput;
      const resolvedDepartment = department || matchedMentor?.department || matchedSubjectRow?.department || null;
      const cleanDate = (deadline || taskGivenDate || nowIso.slice(0, 10)).trim();
      const cleanSemester = semester
        ? String(semester).trim()
        : (matchedSubjectRow?.semester ? String(matchedSubjectRow.semester).trim() : "Semester 1");
      const cleanDesc = (instructions || description || inastructions || "").trim() || null;
      const cleanRef = (referenceUrl || materialUrl || "").trim() || null;

      // Derive week/task number (max 40 tasks)
      let wk = parseInt(String(weekNumber || taskNumber || 1), 10);
      if (isNaN(wk) || wk < 1) {
        // Find highest existing week number for this mentor + subject
        const lastPlan = await db.get(
          "SELECT MAX(week_number) as max_wk FROM mentor_weekly_plans WHERE mentor_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?))",
          resolvedMentorId, cleanSubject
        ).catch(() => null);
        wk = (lastPlan?.max_wk || 0) + 1;
      }
      if (wk > 40) wk = 40; // Enforce strict 40 tasks max!

      const planId = generateId("MWP");
      const sessionPlanJson = JSON.stringify([
        {
          topic: cleanTopic,
          status: "Planned",
          description: cleanDesc,
          instructions: cleanDesc,
          materialUrl: cleanRef,
          referenceUrl: cleanRef,
          assignedBy,
          assignedRole,
          assignedAt: nowIso,
          deadline: cleanDate,
          taskGivenDate: cleanDate,
          taskNumber: wk
        }
      ]);

      // 1. Check if plan already exists for this mentor, subject, and week (fast in-memory check first)
      const planKey = `${resolvedMentorId}|${cleanSubject.toLowerCase()}|${wk}`;
      const existingPlan = preloadedPlans.get(planKey) || await db.get(
        "SELECT id FROM mentor_weekly_plans WHERE mentor_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND week_number = ?",
        resolvedMentorId, cleanSubject, wk
      ).catch(() => null);

      if (existingPlan?.id) {
        await db.run(
          `UPDATE mentor_weekly_plans SET
            college_id = COALESCE(college_id, ?),
            mentor_name = COALESCE(mentor_name, ?),
            department = COALESCE(?, department),
            class_group = COALESCE(NULLIF(?, ''), class_group),
            topics_planned = ?,
            session_plan = ?,
            start_date = ?,
            status = 'Submitted',
            updated_at = ?
          WHERE id = ?`,
          resolvedCollegeId || null,
          resolvedMentorName || null,
          resolvedDepartment,
          cleanSemester,
          cleanTopic,
          sessionPlanJson,
          cleanDate,
          nowIso,
          existingPlan.id
        );
      } else {
        await db.run(
          `INSERT INTO mentor_weekly_plans (
            id, college_id, mentor_id, mentor_name, department, subject,
            class_group, week_number, start_date, topics_planned, session_plan,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?)`,
          planId,
          resolvedCollegeId || null,
          resolvedMentorId,
          resolvedMentorName || null,
          resolvedDepartment,
          cleanSubject,
          cleanSemester,
          wk,
          cleanDate,
          cleanTopic,
          sessionPlanJson,
          nowIso,
          nowIso
        );
        preloadedPlans.set(planKey, { id: planId });
      }

      // 2. Initialize or reset clearance to pending (fast in-memory check first)
      const clearanceKey = `${resolvedMentorId}|${cleanSubject.toLowerCase()}|${wk}`;
      const existingClearance = preloadedClearances.get(clearanceKey) || await db.get(
        "SELECT id FROM mentor_skill_clearances WHERE mentor_id = ? AND LOWER(TRIM(subject)) = LOWER(TRIM(?)) AND week_number = ? AND scope = 'week'",
        resolvedMentorId, cleanSubject, wk
      ).catch(() => null);

      if (existingClearance?.id) {
        await db.run(
          `UPDATE mentor_skill_clearances SET
            college_id = COALESCE(college_id, ?),
            mentor_name = COALESCE(mentor_name, ?),
            topic = ?,
            status = 'pending',
            score = NULL,
            remarks = ?,
            verified_by = ?,
            updated_at = ?
          WHERE id = ?`,
          resolvedCollegeId || null,
          resolvedMentorName || null,
          cleanTopic,
          `Assigned by ${assignedBy} on ${cleanDate}`,
          assignedBy,
          nowIso,
          existingClearance.id
        ).catch(() => {});
      } else {
        const clearanceId = generateId("MSC");
        const subjType = deriveSubjectType(cleanSubject, "Skill");
        await db.run(
          `INSERT INTO mentor_skill_clearances (
            id, college_id, mentor_id, mentor_name, subject, subject_type,
            week_number, scope, topic, status, remarks, verified_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'week', ?, 'pending', ?, ?, ?, ?)`,
          clearanceId,
          resolvedCollegeId || null,
          resolvedMentorId,
          resolvedMentorName || null,
          cleanSubject,
          subjType,
          wk,
          cleanTopic,
          `Assigned by ${assignedBy} on ${cleanDate}`,
          assignedBy,
          nowIso,
          nowIso
        ).catch(() => {});
        preloadedClearances.set(clearanceKey, { id: clearanceId });
      }

      assignedResults.push({
        mentorId: resolvedMentorId,
        employeeId: resolvedMentorId,
        mentorName: resolvedMentorName,
        subject: cleanSubject,
        weekNumber: wk,
        taskNumber: wk,
        topic: cleanTopic,
        taskGivenDate: cleanDate,
        deadline: cleanDate,
        assignedBy
      });
    }

    // 3. Dispatch Targeted Notifications to Mentors (Consolidated for Bulk Imports)
    // For single task assignment, sends the detailed single-task alert.
    // For bulk imports, groups tasks by mentor and sends 1 consolidated alert per mentor
    // so faculty members are not flooded with 20 separate pings in 2 seconds.
    const tasksByMentor = new Map<string, typeof assignedResults>();
    for (const res of assignedResults) {
      if (!tasksByMentor.has(res.mentorId)) tasksByMentor.set(res.mentorId, []);
      tasksByMentor.get(res.mentorId)!.push(res);
    }

    for (const [mId, mentorTasks] of tasksByMentor.entries()) {
      try {
        if (mentorTasks.length === 1) {
          const single = mentorTasks[0];
          await dispatchSystemNotification(db, {
            userIds: [mId],
            title: `New Skill Task Assigned — Task ${single.taskNumber}`,
            message: `${assignedBy} assigned you Task ${single.taskNumber} in "${single.subject}": "${single.topic}". Deadline: ${single.deadline}. Open My Skill Tracker to view and submit your work.`,
            link: `/mentor?tab=my_skill_tracker`,
            type: "skill_task",
            action: "skill_task_assigned",
            domain: "notifications",
            dedupeKey: `skill-task:${mId}:${single.taskNumber}:${String(single.subject).toLowerCase()}`,
            payload: {
              mentorId: mId,
              taskNumber: single.taskNumber,
              subject: single.subject,
              topic: single.topic,
              deadline: single.deadline,
              assignedBy,
              assignedRole,
            }
          });
        } else {
          const distinctSubjects = Array.from(new Set(mentorTasks.map(t => t.subject))).join(", ");
          const minWk = Math.min(...mentorTasks.map(t => t.taskNumber));
          const maxWk = Math.max(...mentorTasks.map(t => t.taskNumber));
          await dispatchSystemNotification(db, {
            userIds: [mId],
            title: `${mentorTasks.length} New Skill Tasks Assigned`,
            message: `${assignedBy} assigned you ${mentorTasks.length} skill tasks in "${distinctSubjects}" (Tasks ${minWk} to ${maxWk}). Open My Skill Tracker to view details and submit your work.`,
            link: `/mentor?tab=my_skill_tracker`,
            type: "skill_task",
            action: "skill_task_assigned",
            domain: "notifications",
            dedupeKey: `skill-task-batch:${mId}:${minWk}:${maxWk}:${String(distinctSubjects).toLowerCase()}`,
            payload: {
              mentorId: mId,
              taskCount: mentorTasks.length,
              subjects: distinctSubjects,
              assignedBy,
              assignedRole,
            }
          });
        }
      } catch (_) {}
    }

    if (assignedResults.length === 0 && rejected.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Could not assign tasks: Row ${rejected[0].rowNumber} - ${rejected[0].reason}`,
          rejected
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: rejected.length > 0
        ? `Assigned ${assignedResults.length} task(s); ${rejected.length} row(s) rejected.`
        : `Successfully assigned ${assignedResults.length} task(s) to mentor(s).`,
      count: assignedResults.length,
      rejectedCount: rejected.length,
      rejected,
      assigned: assignedResults
    });
  } catch (err: any) {
    console.error("POST /api/skill-tracker/tasks error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to assign task(s)" },
      { status: 500 }
    );
  }
}
