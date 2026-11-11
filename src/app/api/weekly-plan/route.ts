export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { deriveSubjectType } from "@/lib/skillTracker";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("mentor_weekly_plans");
    // The verdict enrichment below reads this table, so it must exist before a failed
    // read can be treated as a real database problem rather than a missing migration.
    await ensureMigration("mentor_skill_clearances");
    const { searchParams } = new URL(request.url);

    const collegeId = searchParams.get("collegeId");
    const mentorId = searchParams.get("mentorId");
    const weekNumber = searchParams.get("weekNumber");
    const classGroup = searchParams.get("classGroup");
    const subject = searchParams.get("subject");
    const includeAudit = searchParams.get("includeAudit") === "true";

    let query = "SELECT * FROM mentor_weekly_plans WHERE 1=1";
    const params: any[] = [];

    if (collegeId && collegeId !== "all") {
      query += " AND college_id = ?";
      params.push(collegeId);
    }
    if (mentorId && mentorId !== "all") {
      query += " AND mentor_id = ?";
      params.push(mentorId);
    }
    if (weekNumber && weekNumber !== "all") {
      query += " AND week_number = ?";
      params.push(parseInt(weekNumber, 10));
    }
    if (classGroup && classGroup !== "all") {
      query += " AND LOWER(TRIM(class_group)) = LOWER(TRIM(?))";
      params.push(classGroup);
    }
    if (subject && subject !== "all") {
      query += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
      params.push(subject);
    }

    query += " ORDER BY week_number ASC, updated_at DESC";

    // ── Every remaining read is independent of the others (all parameters come from the
    // query string), so the slices are issued as one batched group instead of four more
    // sequential awaits. Each used to end with `.catch(() => [])`, which made a database
    // failure look like "no plans yet" - and a failed subjects/clearances slice rendered
    // every Skill verdict as pending.
    const withAudit = !!(includeAudit || mentorId || collegeId);
    const slices: { label: string; sql: string; params: any[] }[] = [{ label: "mentor_weekly_plans", sql: query, params }];

    if (withAudit) {
      // Fetch related conducted topics from academic_tracker and demos if requested or relevant
      let trackerQuery = "SELECT id, date, period_slot, class_group, subject, unit, topic, comments, status, mentor_id FROM academic_tracker WHERE 1=1";
      const trackerParams: any[] = [];
      if (mentorId && mentorId !== "all") {
        trackerQuery += " AND mentor_id = ?";
        trackerParams.push(mentorId);
      }
      if (collegeId && collegeId !== "all") {
        trackerQuery += " AND college_id = ?";
        trackerParams.push(collegeId);
      }
      if (subject && subject !== "all") {
        trackerQuery += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
        trackerParams.push(subject);
      }
      trackerQuery += " ORDER BY date DESC LIMIT 300";
      slices.push({ label: "academic_tracker", sql: trackerQuery, params: trackerParams });

      let demoQuery = "SELECT id, mentorId, mentorName, smeId, smeName, dateStr, timeSlot, subject, stream, week, status, marks, comments FROM demo_sessions WHERE 1=1";
      const demoParams: any[] = [];
      if (mentorId && mentorId !== "all") {
        demoQuery += " AND mentorId = ?";
        demoParams.push(mentorId);
      }
      demoQuery += " ORDER BY dateStr DESC LIMIT 100";
      slices.push({ label: "demo_sessions", sql: demoQuery, params: demoParams });
    }

    slices.push(
      { label: "subjects", sql: "SELECT name, type FROM subjects", params: [] },
      {
        label: "mentor_skill_clearances",
        sql: "SELECT mentor_id, subject, week_number, scope, status, score, remarks, verified_by, verified_at FROM mentor_skill_clearances",
        params: []
      }
    );

    const failedSlices: QueryFailure[] = [];
    const batch = await db.multiQuery(slices, failedSlices);
    if (failedSlices.length > 0) {
      const labels = failedSlices.map(f => slices.find(s => s.sql === f.sql)?.label || "unknown");
      console.error("GET /api/weekly-plan partial read:", failedSlices.map(f => `${f.sql.slice(0, 80)} → ${f.error}`).join(" | "));
      return NextResponse.json(
        { success: false, message: `Weekly plans could not be loaded (${labels.join(", ")}). Please retry.` },
        { status: 500 }
      );
    }

    const sliceRows = new Map<string, any[]>();
    slices.forEach((s, i) => sliceRows.set(s.label, batch[i] || []));
    const rows: any[] = sliceRows.get("mentor_weekly_plans") || [];
    const conductedTrackerRows: any[] = sliceRows.get("academic_tracker") || [];
    const demoRows: any[] = sliceRows.get("demo_sessions") || [];

    // ── Skill tracker enrichment (Mentor Skill Development Tracker) ──
    // Attach subject_type (Skill/Academic) and the latest SME skill verdict
    // per plan so the WeeklyPlanViewer table and mentor plan studio can render
    // them without extra requests.
    const subjectTypeMap = new Map<string, string>();
    (sliceRows.get("subjects") || []).forEach((s: any) => {
      if (s?.name) subjectTypeMap.set(String(s.name).toLowerCase().trim(), s.type || "");
    });
    const clearanceRows: any[] = sliceRows.get("mentor_skill_clearances") || [];

    const verdictForPlan = (plan: any) => {
      const subjKey = String(plan.subject || "").toLowerCase().trim();
      const wk = parseInt(String(plan.week_number ?? ""), 10);
      const matches = clearanceRows.filter((c: any) =>
        String(c.subject || "").toLowerCase().trim() === subjKey &&
        parseInt(String(c.week_number ?? ""), 10) === wk &&
        (!plan.mentor_id || !c.mentor_id || c.mentor_id === plan.mentor_id)
      );
      const weekRow = matches.find((m: any) => m.scope === "week" && m.status === "cleared")
        || matches.find((m: any) => m.scope === "week" && m.status === "not_cleared")
        || matches.find((m: any) => m.scope === "week" && m.status === "needs_revision")
        || matches.find((m: any) => m.scope === "demo" && m.status === "cleared")
        || matches.find((m: any) => m.scope === "demo" && m.status === "not_cleared");
      if (!weekRow) return { verdict: "pending", score: null, remarks: null, verified_by: null, verified_at: null };
      return {
        verdict: weekRow.status,
        score: weekRow.score ?? null,
        remarks: weekRow.remarks || null,
        verified_by: weekRow.verified_by || null,
        verified_at: weekRow.verified_at || null
      };
    };

    // Build comparison metrics & audit summary
    const conductedTopicSet = new Set(
      conductedTrackerRows
        .filter(r => r.topic && r.topic.trim())
        .map(r => r.topic.toLowerCase().trim())
    );

    let totalPlannedTopics = 0;
    let completedPlannedTopics = 0;
    let pendingPlannedTopics = 0;

    const enrichedPlans = rows.map(plan => {
      let tasks: any[] = [];
      try {
        tasks = typeof plan.session_plan === "string" ? JSON.parse(plan.session_plan) : (plan.session_plan || []);
      } catch {
        tasks = [];
      }

      const tasksWithAudit = tasks.map((task: any) => {
        const topicNorm = (task.topic || "").toLowerCase().trim();
        const isCompletedInTracker = topicNorm && conductedTopicSet.has(topicNorm);
        const isConducted = isCompletedInTracker || task.status === "Completed";

        if (task.topic && task.topic.trim()) {
          totalPlannedTopics += 1;
          if (isConducted) {
            completedPlannedTopics += 1;
          } else {
            pendingPlannedTopics += 1;
          }
        }

        return {
          ...task,
          conductedStatus: isConducted ? "Completed" : "Pending",
          matchedTracker: conductedTrackerRows.find(
            ct => ct.topic && ct.topic.toLowerCase().trim() === topicNorm
          ) || null
        };
      });

      const explicitType = subjectTypeMap.get(String(plan.subject || "").toLowerCase().trim()) || "";
      const subjectType = deriveSubjectType(plan.subject, explicitType);
      return {
        ...plan,
        sme_remarks: plan.sme_remarks || plan.cam_feedback || "",
        subject_type: subjectType,
        skill_verdict: verdictForPlan(plan),
        session_plan: tasksWithAudit
      };
    });

    const completionPercentage = totalPlannedTopics > 0
      ? Math.round((completedPlannedTopics / totalPlannedTopics) * 100)
      : 0;

    const auditSummary = {
      totalPlans: rows.length,
      totalPlannedTopics,
      completedPlannedTopics,
      pendingPlannedTopics,
      completionPercentage,
      smeStatusBreakdown: {
        verified: rows.filter(r => r.status === "Verified").length,
        submitted: rows.filter(r => r.status === "Submitted").length,
        needsRevision: rows.filter(r => r.status === "Needs Revision").length,
        draft: rows.filter(r => r.status === "Draft").length
      },
      demos: {
        total: demoRows.length,
        completed: demoRows.filter(d => d.status === "completed").length,
        pending: demoRows.filter(d => d.status !== "completed").length,
        list: demoRows
      },
      conductedTrackerCount: conductedTrackerRows.length
    };

    return NextResponse.json({
      success: true,
      plans: enrichedPlans,
      audit: auditSummary
    }, { headers: noCacheHeaders });
  } catch (err: any) {
    console.error("GET /api/weekly-plan error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to fetch weekly plans" },
      { status: 500, headers: noCacheHeaders }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "sme", "cm", "kam", "admin"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("mentor_weekly_plans");
    const body = await request.json();

    const {
      id,
      collegeId,
      mentorId,
      mentorName,
      department,
      subject,
      classGroup,
      weekNumber,
      startDate = "",
      endDate = "",
      unit,
      topicsPlanned,
      sessionPlan,
      learningObjectives,
      teachingMode = "Offline",
      materialUrl = "",
      status = "Submitted",
      smeRemarks = "",
      camFeedback = ""
    } = body;

    if (!collegeId || !mentorId || !subject || !classGroup || !weekNumber) {
      return NextResponse.json(
        { success: false, message: "Missing required weekly plan fields." },
        { status: 400 }
      );
    }

    const planId = id || generateId("WP");
    const nowStr = new Date().toISOString();
    const effectiveRemarks = smeRemarks || camFeedback || "";

    // The overlap preflight and the insert-vs-update existence probe both read this one
    // table, so they travel as a single round trip. Both feed writes, so a failed slice
    // aborts: an unreadable conflict check would otherwise let an overlapping plan through.
    const planFailures: QueryFailure[] = [];
    const [conflictRows, existingRows] = await db.multiQuery(
      [
        startDate && endDate
          ? {
              sql: `SELECT id, week_number, start_date, end_date FROM mentor_weekly_plans
                 WHERE college_id = ? AND mentor_id = ? AND LOWER(TRIM(class_group)) = LOWER(TRIM(?)) AND LOWER(TRIM(subject)) = LOWER(TRIM(?))
                 AND week_number != ? AND id != ?
                 AND start_date <= ? AND end_date >= ?
                 LIMIT 1`,
              params: [collegeId, mentorId, classGroup, subject, parseInt(String(weekNumber), 10), planId, endDate, startDate],
            }
          : { sql: "SELECT 1 WHERE 1=0" },
        { sql: "SELECT id FROM mentor_weekly_plans WHERE id = ?", params: [planId] },
      ],
      planFailures
    );
    if (planFailures.length > 0) {
      return NextResponse.json(
        { success: false, message: "Could not verify this weekly plan against existing ones. Please try again." },
        { status: 500 }
      );
    }

    const conflict = conflictRows[0] || null;
    if (conflict) {
      return NextResponse.json(
        {
          success: false,
          message: `Date range (${startDate} to ${endDate}) overlaps with Week ${conflict.week_number} (${conflict.start_date} to ${conflict.end_date}) for ${classGroup}.`
        },
        { status: 409 }
      );
    }

    const existing = existingRows[0] || null;

    if (existing) {
      await db.run(
        `UPDATE mentor_weekly_plans SET
          college_id = ?, mentor_id = ?, mentor_name = ?, department = ?,
          subject = ?, class_group = ?, week_number = ?, start_date = ?, end_date = ?, unit = ?,
          topics_planned = ?, session_plan = ?, learning_objectives = ?,
          teaching_mode = ?, material_url = ?, status = ?, sme_remarks = ?, cam_feedback = ?, updated_at = ?
         WHERE id = ?`,
        collegeId, mentorId, mentorName || "", department || "",
        subject, classGroup, parseInt(String(weekNumber), 10), startDate, endDate, unit || "",
        topicsPlanned || "", typeof sessionPlan === "string" ? sessionPlan : JSON.stringify(sessionPlan || []),
        learningObjectives || "", teachingMode, materialUrl, status, effectiveRemarks, effectiveRemarks, nowStr, planId
      );
    } else {
      await db.run(
        `INSERT INTO mentor_weekly_plans (
          id, college_id, mentor_id, mentor_name, department,
          subject, class_group, week_number, start_date, end_date, unit,
          topics_planned, session_plan, learning_objectives,
          teaching_mode, material_url, status, sme_remarks, cam_feedback, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        planId, collegeId, mentorId, mentorName || "", department || "",
        subject, classGroup, parseInt(String(weekNumber), 10), startDate, endDate, unit || "",
        topicsPlanned || "", typeof sessionPlan === "string" ? sessionPlan : JSON.stringify(sessionPlan || []),
        learningObjectives || "", teachingMode, materialUrl, status, effectiveRemarks, effectiveRemarks, nowStr
      );
    }

    const savedPlan = await db.get("SELECT * FROM mentor_weekly_plans WHERE id = ?", planId);

    return NextResponse.json({
      success: true,
      message: "Weekly plan saved successfully.",
      plan: savedPlan
    });
  } catch (err: any) {
    console.error("POST /api/weekly-plan error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to save weekly plan" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "sme", "cm", "kam", "admin"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("mentor_weekly_plans");
    const body = await request.json();

    const { id, status, smeRemarks, camFeedback, verifiedBy } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, message: "Missing plan ID or status." },
        { status: 400 }
      );
    }

    const nowStr = new Date().toLocaleString();
    const effectiveRemarks = smeRemarks || camFeedback || "";
    const effectiveVerifier = verifiedBy?.trim() || "Reviewer";

    await db.run(
      `UPDATE mentor_weekly_plans SET
        status = ?, sme_remarks = ?, cam_feedback = ?, verified_by = ?, verified_at = ?, updated_at = ?
       WHERE id = ?`,
      status, effectiveRemarks, effectiveRemarks, effectiveVerifier, nowStr, new Date().toISOString(), id
    );

    const updated = await db.get("SELECT * FROM mentor_weekly_plans WHERE id = ?", id);

    if (status === "Verified" && updated && updated.mentor_id) {
      await dispatchSystemNotification(db, {
        userIds: [updated.mentor_id],
        title: "Weekly Plan Approved",
        message: `Your Weekly Plan for ${updated.subject || "your subject"} (Week ${updated.week_number || ""}) has been approved by ${effectiveVerifier}.`,
        link: "/mentor/weekly-plan",
        type: "success",
        domain: "weekly_plan",
        action: "verified",
      }).catch((e) => console.error("Failed to insert notification:", e));
    }

    return NextResponse.json({
      success: true,
      message: `Weekly plan marked as ${status}.`,
      plan: updated
    });
  } catch (err: any) {
    console.error("PATCH /api/weekly-plan error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update weekly plan review status" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "sme", "cm", "kam", "admin"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("mentor_weekly_plans");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Missing plan id" },
        { status: 400 }
      );
    }

    await db.run("DELETE FROM mentor_weekly_plans WHERE id = ?", id);

    return NextResponse.json({
      success: true,
      message: "Weekly plan deleted successfully."
    });
  } catch (err: any) {
    console.error("DELETE /api/weekly-plan error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to delete weekly plan" },
      { status: 500 }
    );
  }
}
