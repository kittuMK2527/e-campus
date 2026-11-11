export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 60;

import { NextResponse, after } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { getDb, readInChunks } from "@/lib/db";
import { notifyExternalInterviewsAfterResponse } from "@/lib/interview-notifications";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";
import { getInstitutionDateStrOffset } from "@/lib/localDate";


export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const user = auth!.user;

    // The visibility branch used to be chosen from ?role= alone, so any signed-in
    // account could ask for the admin view and receive every interview. Staff keep
    // the requested view; everyone else is pinned to their own session role.
    const FULL_INTERVIEW_VIEW_ROLES = new Set(["admin", "L and D", "sme", "hr", "fee_manager"]);
    const requestedRole = (searchParams.get("role") || "mentor").toLowerCase();
    const role = FULL_INTERVIEW_VIEW_ROLES.has(user.role) ? requestedRole : user.role;

    const type = searchParams.get("type");

    let query = "SELECT * FROM student_interviews WHERE 1=1";
    const params: any[] = [];

    if (type) {
      query += " AND type = ?";
      params.push(type);
    }

    let mentorId = searchParams.get("mentorId");
    let collegeId = searchParams.get("collegeId");
    let kamId = searchParams.get("kamId");

    if (user.role === "mentor") {
      mentorId = user.reference_id;
    } else if (user.role === "cm") {
      collegeId = user.college_id || null;
      if (!collegeId) {
        return NextResponse.json(
          { success: false, message: "No campus is linked to this account." },
          { status: 403 }
        );
      }
    } else if (user.role === "kam") {
      const kam = await db.get(
        "SELECT id FROM kam_users WHERE id = ? OR LOWER(email) = ? LIMIT 1",
        [user.reference_id, String(user.email || "").toLowerCase()]
      );
      if (!kam) {
        return NextResponse.json(
          { success: false, message: "No KAM portfolio is linked to this account." },
          { status: 403 }
        );
      }
      kamId = kam.id;
    }

    // Role-scoped filtering
    if (role === "mentor" && mentorId) {
      // Mentor only sees their own raised requests OR sessions where they are assigned as evaluator
      query += ` AND (
        mentor_id = ? OR 
        assigned_mentor_ids LIKE ? OR
        id IN (SELECT interview_id FROM student_interview_slots WHERE mentor_id = ?) OR
        id IN (SELECT interview_id FROM interview_allocations WHERE mentor_id = ?)
      )`;
      params.push(mentorId, `%${mentorId}%`, mentorId, mentorId);
    } else if ((role === "cm" || role === "cam") && collegeId) {
      // 1. Internal: STRICTLY only inside this campus (college_id / origin_college_id)
      // 2. External: Origin/Target campus OR responded campus OR all campuses under the SAME KAM who manages the origin college
      query += ` AND (
        (type = 'internal' AND (college_id = ? OR origin_college_id = ? OR target_college_id = ?))
        OR
        (type = 'external' AND (
          college_id = ? OR 
          origin_college_id = ? OR 
          target_college_id = ? OR 
          id IN (SELECT interview_id FROM cam_capacity_responses WHERE college_id = ?) OR
          (
            status NOT IN ('pending_origin_cm', 'draft', 'rejected') AND (
              origin_college_id IN (
                SELECT id FROM colleges 
                WHERE kam_id = (SELECT kam_id FROM colleges WHERE id = ?) 
                AND kam_id IS NOT NULL 
                AND kam_id != ''
              )
              OR
              college_id IN (
                SELECT id FROM colleges 
                WHERE kam_id = (SELECT kam_id FROM colleges WHERE id = ?) 
                AND kam_id IS NOT NULL 
                AND kam_id != ''
              )
            )
          )
        ))
      )`;
      params.push(collegeId, collegeId, collegeId, collegeId, collegeId, collegeId, collegeId, collegeId, collegeId);
    } else if (role === "kam" && kamId) {
      // KAM sees all internal & external interviews for colleges assigned to them
      query += ` AND (
        origin_college_id IN (SELECT id FROM colleges WHERE kam_id = ?) OR
        college_id IN (SELECT id FROM colleges WHERE kam_id = ?) OR
        target_college_id IN (SELECT id FROM colleges WHERE kam_id = ?)
      )`;
      params.push(kamId, kamId, kamId);
    } else if (role === "student") {
      let studentId = searchParams.get("studentId");
      let classGroup = searchParams.get("classGroup");
      let colId = searchParams.get("collegeId");

      if (user.role === "student") {
        const studentRow = await db.get(
          "SELECT id, classgroup, college_id, register_number, roll_number FROM students WHERE id = ? OR LOWER(email) = ? LIMIT 1",
          [user.reference_id, String(user.email || "").toLowerCase()]
        );
        studentId = studentRow?.id || user.reference_id;
        classGroup = studentRow?.classgroup || studentRow?.classGroup || classGroup || "";
        colId = studentRow?.college_id || colId || "";
        const regNo = studentRow?.register_number || "";
        const rollNo = studentRow?.roll_number || "";

        query += ` AND (
          status NOT IN ('draft', 'rejected', 'cancelled', 'declined') AND (
            id IN (SELECT interview_id FROM student_interview_slots WHERE student_id IN (?, ?, ?)) OR
            (class_group IS NOT NULL AND class_group != '' AND (LOWER(class_group) = LOWER(?) OR LOWER(class_group) LIKE LOWER(?))) OR
            (college_id = ? AND status IN ('assigned', 'completed', 'pending_verification', 'capacity_partially_accepted'))
          )
        )`;
        params.push(studentId || "", regNo || studentId || "", rollNo || studentId || "", classGroup || "", `%${classGroup || ""}%`, colId || "");
      } else {
        query += ` AND (
          status NOT IN ('draft', 'rejected', 'cancelled', 'declined') AND (
            id IN (SELECT interview_id FROM student_interview_slots WHERE student_id = ?) OR
            (class_group IS NOT NULL AND class_group != '' AND (LOWER(class_group) = LOWER(?) OR LOWER(class_group) LIKE LOWER(?))) OR
            (college_id = ? AND status IN ('assigned', 'completed', 'pending_verification', 'capacity_partially_accepted'))
          )
        )`;
        params.push(studentId || "", classGroup || "", `%${classGroup || ""}%`, colId || "");
      }
    }
    // Admin: no filter - see all

    query += " ORDER BY created_at DESC";

    const interviews = await db.all(query, params);

    let interviewsWithDetails: any[] = [];
    const evalsMap = new Map<string, any[]>();

    if (interviews.length > 0) {
      const interviewIds = interviews.map((i: any) => i.id);

      // Chunked IN-list: an admin's interview feed is unbounded, and binding every id
      // into one statement grows the parse plan with it. Per-chunk order is preserved,
      // which is all the grouping below needs.
      const byInterviews = (table: string, orderBy: string) =>
        readInChunks(db, interviewIds, (chunk, ph) => ({
          sql: `SELECT * FROM ${table} WHERE interview_id IN (${ph}) ORDER BY ${orderBy}`,
          params: [...chunk]
        }));

      const [allAllocs, allCamResponses, allStudentSlots, allEvals] = await Promise.all([
        byInterviews("interview_allocations", "start_time ASC"),
        byInterviews("cam_capacity_responses", "created_at ASC"),
        byInterviews("student_interview_slots", "slot_start_time ASC"),
        byInterviews("interview_evaluations", "created_at DESC")
      ]);

      const allocsMap = new Map<string, any[]>();
      for (const a of allAllocs) {
        if (!allocsMap.has(a.interview_id)) allocsMap.set(a.interview_id, []);
        allocsMap.get(a.interview_id)!.push(a);
      }

      const camResponsesMap = new Map<string, any[]>();
      for (const c of allCamResponses) {
        if (!camResponsesMap.has(c.interview_id)) camResponsesMap.set(c.interview_id, []);
        camResponsesMap.get(c.interview_id)!.push(c);
      }

      const studentSlotsMap = new Map<string, any[]>();
      for (const s of allStudentSlots) {
        if (!studentSlotsMap.has(s.interview_id)) studentSlotsMap.set(s.interview_id, []);
        studentSlotsMap.get(s.interview_id)!.push(s);
      }

      for (const e of allEvals) {
        if (!evalsMap.has(e.interview_id)) evalsMap.set(e.interview_id, []);
        evalsMap.get(e.interview_id)!.push(e);
      }

      interviewsWithDetails = interviews.map((inv: any) => {
        const allocs = allocsMap.get(inv.id) || [];
        const camResponses = camResponsesMap.get(inv.id) || [];
        const studentSlots = studentSlotsMap.get(inv.id) || [];
        const evalsForThis = evalsMap.get(inv.id) || [];

        const reqCount = Number(inv.student_count) || Number(inv.requested_students) || 10;
        const accCap = (camResponses || [])
          .filter((r: any) => r.status === "accepted")
          .reduce((sum: number, r: any) => sum + (Number(r.accepted_student_capacity) || 0), 0);
        const cappedAccCap = Math.min(reqCount, accCap);

        const allocCount = (studentSlots && studentSlots.length > 0)
          ? studentSlots.length
          : (Number(inv.allocated_students) || 0);

        const evalCount = evalsForThis ? evalsForThis.length : 0;
        const isCompleted = inv.status === "completed";
        const verCount = isCompleted ? evalCount : 0;

        const remToAlloc = Math.max(0, reqCount - allocCount);
        const remToEval = Math.max(0, allocCount - evalCount);

        let conductedStatus = "not_conducted";
        if (isCompleted) {
          if (allocCount >= reqCount && evalCount >= allocCount) {
            conductedStatus = "fully_conducted";
          } else {
            conductedStatus = "partially_conducted";
          }
        } else if (inv.status === "pending_verification") {
          conductedStatus = "pending_verification";
        } else if (inv.status === "assigned") {
          if (evalCount > 0) {
            conductedStatus = "partially_conducted";
          } else {
            conductedStatus = "scheduled";
          }
        } else if (inv.status === "no_capacity" || (inv.status?.includes("pending") && allocCount === 0)) {
          conductedStatus = "not_conducted";
        }

        // Inherit a link only when an evaluator or CM really saved one. A GET must never
        // mint a Meet code from the interview id: the fabricated URL renders as a working
        // "Join" button and lands students on Google's invalid-link page.
        let effectiveGmeet: string | null = inv.gmeet_link || null;
        if (!effectiveGmeet && inv.type === "external") {
          effectiveGmeet = studentSlots.find((s: any) => s.gmeet_link)?.gmeet_link || "https://meet.google.com/new";
        }

        const enrichedSlots = (studentSlots || []).map((s: any) => ({
          ...s,
          gmeet_link: s.gmeet_link || effectiveGmeet
        }));

        return {
          ...inv,
          gmeet_link: effectiveGmeet || inv.gmeet_link,
          allocations: allocs || [],
          cam_responses: camResponses || [],
          student_slots: enrichedSlots,
          evaluations: evalsForThis || [],
          required_students: reqCount,
          accepted_capacity: cappedAccCap,
          allocated_students: allocCount,
          evaluated_students: evalCount,
          verified_students: verCount,
          remaining_to_allocate: remToAlloc,
          remaining_to_evaluate: remToEval,
          conducted_status: conductedStatus
        };
      });
    }

    // Fetch evaluations — returns all evaluations for visible interviews
    let evaluations: any[] = [];
    if (interviewsWithDetails.length > 0) {
      evaluations = Array.from(evalsMap.values()).flat();
    } else if (role === "mentor" && mentorId) {
      evaluations = await db.all(
        "SELECT * FROM interview_evaluations WHERE mentor_id = ? ORDER BY created_at DESC",
        [mentorId]
      );
    } else {
      evaluations = await db.all("SELECT * FROM interview_evaluations ORDER BY created_at DESC");
    }

    return NextResponse.json(
      { success: true, interviews: interviewsWithDetails, evaluations },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      }
    );
  } catch (error: any) {
    console.error("GET /api/interviews error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch interviews" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { 
      allowedRoles: ["mentor", "sme", "L and D", "cm", "kam", "admin"],
      checkCsrf: false
    });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();

    const {
      id,
      student_id,
      student_name,
      class_group = "",
      subject,
      type = "internal",
      target_date,
      topics,
      student_count,
      mentor_id,
      mentor_name,
      mentor_email,
      origin_college_id,
      college_id,
      notes = ""
    } = body;

    if (!subject || !mentor_id || !target_date) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (subject, mentor_id, target_date)" },
        { status: 400 }
      );
    }

    // Rule 1: Exclude Tamil subject
    if (subject.trim().toLowerCase() === "tamil") {
      return NextResponse.json(
        { success: false, message: "Interview Module features are not applicable for Tamil subject." },
        { status: 400 }
      );
    }

    // Rule 2: Date must be at least 2 days after the institution's current date.
    // Compared as YYYY-MM-DD: the Vercel clock runs UTC, so a Date-derived "today"
    // rolls over 5h30m after IST midnight and would allow/reject the wrong day.
    const requestedDateStr = String(target_date).split("T")[0].trim();
    const minAllowedDateStr = getInstitutionDateStrOffset(2);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDateStr) || isNaN(new Date(requestedDateStr).getTime())) {
      return NextResponse.json(
        { success: false, message: "Interview target date must be a valid date in YYYY-MM-DD format." },
        { status: 400 }
      );
    }

    if (requestedDateStr < minAllowedDateStr) {
      return NextResponse.json(
        { success: false, message: `Interview target date must be at least 2 days in advance (on or after ${minAllowedDateStr}).` },
        { status: 400 }
      );
    }

    const resolvedCollegeId = college_id || origin_college_id || "";

    // Rule 3: Exam Day Validation - Interviews cannot be scheduled on exam days
    const examConfig = await db.get(
      `SELECT day_type, notes FROM campus_daily_configs 
       WHERE dateStr = ? 
       AND (day_type = 'exam_day' OR day_type = 'exam' OR LOWER(notes) LIKE '%exam%')
       AND (college_id = ? OR ? = '' OR college_id IS NULL)
       LIMIT 1`,
      [requestedDateStr, resolvedCollegeId, resolvedCollegeId]
    );

    const examSchedule = await db.get(
      `SELECT exam_type, department, subject_name FROM exam_schedules 
       WHERE exam_date = ? 
       AND (college_id = ? OR ? = '' OR college_id IS NULL)
       LIMIT 1`,
      [requestedDateStr, resolvedCollegeId, resolvedCollegeId]
    );

    if (examConfig || examSchedule) {
      const examName = examSchedule?.exam_type || "Examination";
      const subjectDesc = examSchedule?.subject_name ? ` (${examSchedule.subject_name})` : "";
      const reason = examSchedule ? `${examName}${subjectDesc}` : (examConfig?.notes || "Campus Exam");
      return NextResponse.json(
        {
          success: false,
          message: `Cannot schedule interview on ${requestedDateStr}: this date is configured as an Exam Day (${reason}). Please choose a working day.`
        },
        { status: 400 }
      );
    }

    // Rule 4: Holiday Validation - Interviews cannot be scheduled on holidays
    const holidayConfig = await db.get(
      `SELECT day_type, notes FROM campus_daily_configs 
       WHERE dateStr = ? AND day_type = 'holiday'
       AND (college_id = ? OR ? = '' OR college_id IS NULL)
       LIMIT 1`,
      [requestedDateStr, resolvedCollegeId, resolvedCollegeId]
    );

    if (holidayConfig) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot schedule interview on ${requestedDateStr}: this date is marked as a Holiday (${holidayConfig.notes || "Campus Holiday"}). Please choose a working day.`
        },
        { status: 400 }
      );
    }

    const interviewId = id || generateId("int");
    const now = new Date().toISOString();

    const { preferred_start_time = "09:00 AM" } = body;
    const studentCountNum = Number(student_count) || 10;
    const totalDurationMinutes = studentCountNum * 15;

    await db.run(
      `INSERT INTO student_interviews (
        id, student_id, student_name, class_group, subject, type,
        target_date, topics, student_count, mentor_id, mentor_name,
        origin_college_id, college_id, status, notes, evaluator_name, evaluator_role,
        preferred_start_time, total_duration_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subject = excluded.subject,
        type = excluded.type,
        target_date = excluded.target_date,
        topics = excluded.topics,
        student_count = excluded.student_count,
        preferred_start_time = excluded.preferred_start_time,
        total_duration_minutes = excluded.total_duration_minutes,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
      [
        interviewId,
        student_id || "batch_all",
        student_name || "Assigned Students",
        class_group,
        subject,
        type,
        target_date,
        topics || "",
        studentCountNum,
        mentor_id,
        mentor_name || "Mentor",
        origin_college_id || "",
        resolvedCollegeId,
        type === "external" ? "pending_origin_cm" : "pending_cm",
        notes,
        mentor_name || "",
        "mentor",
        preferred_start_time,
        totalDurationMinutes,
        now,
        now
      ]
    );

    // Notify Campus Manager
    if (type === "external") {
      notifyExternalInterviewsAfterResponse({
        interviewId,
        subject,
        classGroup: class_group,
        targetDate: target_date,
        type: "external",
        topics,
        studentCount: Number(student_count) || 0,
        mentorName: mentor_name,
        originCollegeId: origin_college_id || resolvedCollegeId,
        notes,
        actionType: "created"
      });
    }

    const createdRecord = await db.get("SELECT * FROM student_interviews WHERE id = ?", [interviewId]);

    return NextResponse.json({
      success: true,
      message: "Interview request raised successfully. The Campus Manager is being notified.",
      interview: createdRecord
    });
  } catch (error: any) {
    console.error("POST /api/interviews error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to save interview" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { 
      allowedRoles: ["cm", "kam", "admin", "L and D", "mentor", "sme"],
      checkCsrf: false
    });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const { interview_id, status, cm_name } = body;
    const actor = auth!.user;

    if (!interview_id || !status) {
      return NextResponse.json({ success: false, message: "Missing interview_id or status" }, { status: 400 });
    }

    // This endpoint used to write any caller-supplied string for any of six roles,
    // so a mentor could mark an interview 'completed' and skip CM verification.
    const PATCHABLE_STATUSES = new Set(["completed", "pending_verification", "declined", "cancelled", "pending_cm"]);
    if (!PATCHABLE_STATUSES.has(String(status))) {
      return NextResponse.json(
        { success: false, message: `Status '${status}' cannot be set through this endpoint.` },
        { status: 400 }
      );
    }

    const interview = await db.get("SELECT * FROM student_interviews WHERE id = ?", [interview_id]);
    if (!interview) {
      return NextResponse.json({ success: false, message: "Interview not found" }, { status: 404 });
    }

    if (status === "completed" && interview.status !== "pending_verification") {
      return NextResponse.json(
        { success: false, message: "Only interviews awaiting verification can be marked completed." },
        { status: 409 }
      );
    }

    if (actor.role === "cm" || actor.role === "kam") {
      const involvedColleges = new Set(
        [interview.college_id, interview.origin_college_id, interview.target_college_id]
          .filter(Boolean)
          .map(String)
      );
      let allowed = false;
      if (actor.role === "cm") {
        const ownCollege = actor.college_id ? String(actor.college_id) : "";
        allowed = !!ownCollege && involvedColleges.has(ownCollege);
        if (!allowed && ownCollege) {
          const responded = await db
            .get("SELECT 1 AS ok FROM cam_capacity_responses WHERE interview_id = ? AND college_id = ? LIMIT 1", [
              interview_id,
              ownCollege,
            ])
            .catch(() => null);
          allowed = !!responded;
        }
      } else {
        const kam = await db.get(
          "SELECT id FROM kam_users WHERE id = ? OR LOWER(email) = ? LIMIT 1",
          [actor.reference_id, String(actor.email || "").toLowerCase()]
        );
        if (kam) {
          const portfolio = await db.all("SELECT id FROM colleges WHERE kam_id = ?", [kam.id]);
          allowed = portfolio.some((c: any) => involvedColleges.has(String(c.id)));
        }
      }
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: "This interview is outside your assigned campus or portfolio." },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();
    const newType = body.type && ["internal", "external"].includes(body.type) ? body.type : interview.type;
    await db.run(
      "UPDATE student_interviews SET status = ?, type = ?, updated_at = ? WHERE id = ?",
      [status, newType, now, interview_id]
    );

    // If marking as completed, notify students in the class group
    if (status === "completed") {
      // A class roster means one send per ten students, all of it after the CM has
      // already been told the interview is closed.
      after(async () => {
        try {
          const classGroup = interview.class_group;
          let studentEmails: string[] = [];

          if (classGroup) {
            const studentsInClass = await db.all(
              "SELECT email, name FROM students WHERE (classgroup = ? OR classGroup = ?) AND email IS NOT NULL AND email != ''",
              [classGroup, classGroup]
            );
            studentEmails = studentsInClass.map((s: any) => s.email).filter(Boolean);
          }

          // Real-time zero-delay in-app notification to all students in the class
          if (studentEmails.length > 0) {
            await dispatchSystemNotification(db, {
              userIds: studentEmails,
              title: `Interview Results Ready — ${interview.subject}`,
              message: `Your ${interview.subject} interview evaluation results have been reviewed and verified. Check Interviews to view your feedback.`,
              link: "/student/interviews",
              type: "success",
              domain: "interviews",
              action: "evaluated",
              collegeId: interview.college_id,
            });
          }
        } catch (notifErr) {
          console.warn("Student notification failed:", notifErr);
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: status === "completed"
        ? "Interview marked as completed. Students are being notified."
        : `Interview status updated to '${status}'.`
    });
  } catch (error: any) {
    console.error("PATCH /api/interviews error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update interview" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { 
      allowedRoles: ["admin", "cm", "kam", "L and D", "mentor", "sme"],
      checkCsrf: false
    });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("all") === "true";

    if (clearAll) {
      const actorRole = auth?.user?.role;
      if (!["admin", "cm", "kam", "L and D"].includes(actorRole || "")) {
        return NextResponse.json(
          { success: false, message: "Forbidden: Only coordinators and administrators can clear all interview records." },
          { status: 403 }
        );
      }
      // Children first so a failure cannot strand evaluation rows whose interview is gone.
      await db.transaction(async (tx) => {
        await tx.run("DELETE FROM interview_evaluations");
        await tx.run("DELETE FROM student_interview_slots");
        await tx.run("DELETE FROM interview_allocations");
        await tx.run("DELETE FROM cam_capacity_responses");
        await tx.run("DELETE FROM student_interviews");
      });
      return NextResponse.json({ success: true, message: "All interview records deleted successfully" });
    }

    if (!id) {
      return NextResponse.json({ success: false, message: "Missing interview id" }, { status: 400 });
    }

    await db.transaction(async (tx) => {
      await tx.run("DELETE FROM interview_evaluations WHERE interview_id = ?", [id]);
      await tx.run("DELETE FROM student_interview_slots WHERE interview_id = ?", [id]);
      await tx.run("DELETE FROM interview_allocations WHERE interview_id = ?", [id]);
      await tx.run("DELETE FROM cam_capacity_responses WHERE interview_id = ?", [id]);
      await tx.run("DELETE FROM student_interviews WHERE id = ?", [id]);
    });
    return NextResponse.json({ success: true, message: "Interview deleted successfully" });
  } catch (error: any) {
    console.error("DELETE /api/interviews error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete interview" }, { status: 500 });
  }
}
