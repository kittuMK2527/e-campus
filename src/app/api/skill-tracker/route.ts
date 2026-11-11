export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import {
  buildWeekRollup,
  deriveSubjectType,
  normalizeTopic
} from "@/lib/skillTracker";

const VERDICTS = new Set(["pending", "cleared", "not_cleared", "needs_revision"]);

function extractSemesterFromClassGroup(cg?: string | null): string | null {
  if (!cg) return null;
  const m = cg.match(/(?:sem(?:ester)?|s)\s*([1-8])/i);
  if (m) return `Semester ${m[1]}`;
  const romanMatch = cg.match(/\b(I|II|III|IV|V|VI|VII|VIII)\b/i);
  if (romanMatch) {
    const rMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
    const num = rMap[romanMatch[1].toLowerCase()];
    if (num) return `Semester ${num}`;
  }
  return null;
}

/** Pick the best weekly plan per (subject, week): Verified > Submitted > latest updated. */
function pickBestPlan(plans: any[]): any | null {
  if (!plans || plans.length === 0) return null;
  const rank = (p: any) => (p.status === "Verified" ? 3 : p.status === "Submitted" ? 2 : p.status === "Needs Revision" ? 1 : 0);
  return [...plans].sort((a, b) => rank(b) - rank(a) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
}

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("mentor_skill_clearances");

    const { searchParams } = new URL(request.url);
    const mentorId = searchParams.get("mentorId");
    const collegeId = searchParams.get("collegeId");
    const subject = searchParams.get("subject");
    const weekNumber = searchParams.get("weekNumber");

    // ── 1. Clearance rows ──────────────────────────────────────────────
    // Every slice below is parameterised only from the query string, so they are
    // independent and issued as one batched group instead of six sequential round trips.
    // Each used to end with `.catch(() => [])`, which turned a database failure into a
    // plausible-but-empty tracker: a failed `subjects` slice makes the SKILL-ONLY gate
    // fall back to keyword matching and hide real skill rows.
    let clearanceQuery = "SELECT * FROM mentor_skill_clearances WHERE 1=1";
    const clearanceParams: any[] = [];
    if (mentorId) {
      clearanceQuery += " AND mentor_id = ?";
      clearanceParams.push(mentorId);
    }
    if (collegeId) {
      clearanceQuery += " AND college_id = ?";
      clearanceParams.push(collegeId);
    }
    if (subject && subject !== "all") {
      clearanceQuery += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
      clearanceParams.push(subject);
    }

    // ── 2. Weekly plans (skill subjects feed the roll-up) ──────────────
    let planQuery = "SELECT * FROM mentor_weekly_plans WHERE 1=1";
    const planParams: any[] = [];
    if (mentorId) {
      planQuery += " AND mentor_id = ?";
      planParams.push(mentorId);
    }
    if (collegeId && collegeId !== "all") {
      planQuery += " AND college_id = ?";
      planParams.push(collegeId);
    }
    if (subject && subject !== "all") {
      planQuery += " AND LOWER(TRIM(subject)) = LOWER(TRIM(?))";
      planParams.push(subject);
    }
    planQuery += " ORDER BY week_number ASC, updated_at DESC LIMIT 1000";

    // ── 3. Demo sessions ───────────────────────────────────────────────
    let demoQuery = "SELECT id, mentorId, mentorName, smeId, smeName, dateStr, timeSlot, subject, stream, week, status, marks, comments FROM demo_sessions WHERE 1=1";
    const demoParams: any[] = [];
    if (mentorId) {
      demoQuery += " AND mentorId = ?";
      demoParams.push(mentorId);
    }
    demoQuery += " ORDER BY dateStr DESC LIMIT 200";

    // ── 4. Conducted topics (academic_tracker) ─────────────────────────
    // academic_tracker carries the plan week as weekly_plan_week; a week_number column has
    // never existed on it, and naming one here fails the whole read.
    let trackerQuery = "SELECT id, date, period_slot, class_group, subject, unit, topic, comments, status, mentor_id, weekly_plan_week FROM academic_tracker WHERE 1=1";
    const trackerParams: any[] = [];
    if (mentorId) {
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
    trackerQuery += " ORDER BY date DESC LIMIT 600";

    // ── 5. Timetable slots (mentor teaching allocations) ────────────────
    let slotQuery = "SELECT DISTINCT mentorid, course, semester, department, classgroup FROM slots WHERE 1=1";
    const slotParams: any[] = [];
    if (mentorId) {
      slotQuery += " AND mentorid = ?";
      slotParams.push(mentorId);
    }
    if (collegeId && collegeId !== "all") {
      slotQuery += " AND college_id = ?";
      slotParams.push(collegeId);
    }
    slotQuery += " LIMIT 5000";

    // ── 6. Subject type & curriculum map (subjects table) ───────────────
    const slices: { sql: string; params: any[] }[] = [
      { sql: clearanceQuery, params: clearanceParams },
      { sql: planQuery, params: planParams },
      { sql: demoQuery, params: demoParams },
      { sql: trackerQuery, params: trackerParams },
      { sql: "SELECT name, type, semester, department, college_id FROM subjects", params: [] },
      { sql: slotQuery, params: slotParams },
    ];

    // ── 7. Mentor roster for the requested scope ───────────────────────
    if (mentorId) {
      slices.push({ sql: "SELECT id, name, college_id, subjects FROM mentors WHERE id = ?", params: [mentorId] });
    } else if (collegeId && collegeId !== "all") {
      slices.push({ sql: "SELECT id, name, college_id, subjects FROM mentors WHERE college_id = ? ORDER BY name ASC", params: [collegeId] });
    }

    const failedSlices: QueryFailure[] = [];
    const [clearances, plans, demos, trackerRows, subjectRows, slotRows, mentorRoster] = await db.multiQuery(slices, failedSlices);
    if (failedSlices.length > 0) {
      const tables = failedSlices.map(f => f.sql.match(/FROM\s+([a-z_]+)/i)?.[1] || "unknown");
      console.error("GET /api/skill-tracker partial read:", failedSlices.map(f => `${f.sql.slice(0, 80)} → ${f.error}`).join(" | "));
      return NextResponse.json(
        { success: false, message: `Skill tracker could not be loaded (${tables.join(", ")}). Please retry.` },
        { status: 500 }
      );
    }

    const subjectTypeMap = new Map<string, string>();
    const subjectSemesterMap = new Map<string, string>();
    const subjectDeptMap = new Map<string, string>();

    subjectRows.forEach((s: any) => {
      if (s?.name) {
        const k = normalizeTopic(s.name);
        subjectTypeMap.set(k, s.type || "");
        if (s.semester) {
          if (s.college_id) subjectSemesterMap.set(`${k}__${s.college_id}`, s.semester);
          if (!subjectSemesterMap.has(k)) subjectSemesterMap.set(k, s.semester);
        }
        if (s.department) {
          if (s.college_id) subjectDeptMap.set(`${k}__${s.college_id}`, s.department);
          if (!subjectDeptMap.has(k)) subjectDeptMap.set(k, s.department);
        }
      }
    });

    const resolveType = (subjectName: string): "Skill" | "Academic" =>
      deriveSubjectType(subjectName, subjectTypeMap.get(normalizeTopic(subjectName)));

    // SKILL-ONLY gate: the Skill Development Tracker tracks Skill subjects exclusively.
    // Academic subject plans/demos/clearances must never surface here.
    const isSkillSubjectName = (subjectName: string): boolean => resolveType(subjectName) === "Skill";
    const skillDemos = demos.filter(d => isSkillSubjectName(d.subject || ""));
    const skillClearances = clearances.filter(c => isSkillSubjectName(c.subject));

    // ── 8. Build per mentor × subject × week roll-up ───────────────────
    // Group plans by (subject, week)
    const plansByKey = new Map<string, any[]>();
    plans.forEach(p => {
      const key = `${normalizeTopic(p.subject)}__${p.week_number}`;
      if (!plansByKey.has(key)) plansByKey.set(key, []);
      plansByKey.get(key)!.push(p);
    });

    const clearancesBySubjectWeek = new Map<string, any[]>();
    skillClearances.forEach(c => {
      const key = `${normalizeTopic(c.subject)}__${c.week_number}`;
      if (!clearancesBySubjectWeek.has(key)) clearancesBySubjectWeek.set(key, []);
      clearancesBySubjectWeek.get(key)!.push(c);
    });

    const weeksFilter = weekNumber && weekNumber !== "all" ? [parseInt(weekNumber, 10)] : Array.from({ length: 16 }, (_, i) => i + 1);

    const mentors: any[] = mentorRoster || [];

    const mentorRows: any[] = [];
    const mentorIds = mentorId ? [mentorId] : mentors.map(m => m.id);
    const mentorNames = new Map<string, string>(mentors.map((m: any) => [m.id, m.name]));

    for (const mId of mentorIds) {
      const mentorObj = mentors.find((m: any) => m.id === mId);
      const subjForMentor = new Set<string>();

      // 1. From plans
      plans.filter(p => p.mentor_id === mId).forEach(p => {
        if (p.subject) subjForMentor.add(p.subject);
      });
      // 2. From skill clearances
      skillClearances.filter(c => c.mentor_id === mId).forEach(c => {
        if (c.subject) subjForMentor.add(c.subject);
      });
      // 3. From timetable slots
      (slotRows || []).filter((s: any) => s.mentorid === mId).forEach((s: any) => {
        if (s.course) subjForMentor.add(s.course);
      });
      // 4. From mentor profile subjects
      if (mentorObj?.subjects) {
        String(mentorObj.subjects).split(",").forEach(s => {
          const trimmed = s.trim();
          if (trimmed) subjForMentor.add(trimmed);
        });
      }

      for (const subj of subjForMentor) {
        const subjKey = normalizeTopic(subj);
        const subjectType = resolveType(subj);
        if (subjectType !== "Skill") continue; // SKILL-ONLY gate
        const weeks: any[] = [];

        for (const wk of weeksFilter) {
          const key = `${subjKey}__${wk}`;
          const wkPlans = (plansByKey.get(key) || []).filter(p => p.mentor_id === mId);
          const hasClearance = (clearancesBySubjectWeek.get(key) || []).some(c => c.mentor_id === mId);
          if (wkPlans.length === 0 && !hasClearance) {
            continue; // only include planned or clearance weeks in the week loop
          }
          const bestPlan = pickBestPlan(wkPlans);
          const wkDemos = skillDemos.filter(d =>
            d.mentorId === mId &&
            normalizeTopic(d.subject || "") === subjKey &&
            parseInt(String(d.week ?? ""), 10) === wk
          );
          const wkTracker = trackerRows.filter(r =>
            r.mentor_id === mId &&
            normalizeTopic(r.subject || "") === subjKey
          );
          const rollup = buildWeekRollup(
            bestPlan,
            (clearancesBySubjectWeek.get(key) || []).filter(c => c.mentor_id === mId),
            wkDemos,
            wkTracker,
            wk
          );
          weeks.push({
            ...rollup,
            weekly_plan_id: bestPlan?.id || null,
            plan_status: bestPlan?.status || null
          });
        }

        // If no plans or clearances exist yet for this mentor's skill subject, provide a baseline Week 1 so the subject is visible on the tracker
        if (weeks.length === 0) {
          weeks.push({
            week_number: 1,
            topics: [],
            topics_planned: 0,
            topics_conducted: 0,
            demo_status: null,
            demo_marks: null,
            demo_id: null,
            verdict: "pending" as const,
            score: null,
            remarks: null,
            verified_by: null,
            verified_at: null,
            weekly_plan_id: null,
            plan_status: null
          });
        }

        const mentorCollegeId = mentorObj?.college_id || collegeId;
        const semFromSubj = (mentorCollegeId && subjectSemesterMap.get(`${subjKey}__${mentorCollegeId}`)) || subjectSemesterMap.get(subjKey);
        const deptFromSubj = (mentorCollegeId && subjectDeptMap.get(`${subjKey}__${mentorCollegeId}`)) || subjectDeptMap.get(subjKey);
        const slotMatch = (slotRows || []).find((s: any) => s.mentorid === mId && normalizeTopic(s.course) === subjKey);
        const samplePlan = plans.find(p => p.mentor_id === mId && normalizeTopic(p.subject) === subjKey);
        const semFromPlan = samplePlan?.class_group ? extractSemesterFromClassGroup(samplePlan.class_group) : null;
        const resolvedSemester = semFromSubj || slotMatch?.semester || semFromPlan || null;
        const resolvedDepartment = deptFromSubj || slotMatch?.department || samplePlan?.department || null;

        mentorRows.push({
          mentor_id: mId,
          mentor_name: mentorNames.get(mId) || null,
          college_id: mentorCollegeId || null,
          subject: subj,
          subject_type: subjectType,
          semester: resolvedSemester,
          department: resolvedDepartment,
          weeks
        });
      }
    }

    // ── 8. Summary counts (for panel KPI cards) ────────────────────────
    const allWeeks = mentorRows.flatMap(r => r.weeks);
    const summary = {
      mentors: mentorRows.length,
      total_weeks: allWeeks.length,
      cleared: allWeeks.filter(w => w.verdict === "cleared").length,
      not_cleared: allWeeks.filter(w => w.verdict === "not_cleared").length,
      pending: allWeeks.filter(w => w.verdict === "pending").length,
      needs_revision: allWeeks.filter(w => w.verdict === "needs_revision").length,
      completion_pct: allWeeks.length > 0
        ? Math.round((allWeeks.filter(w => w.verdict === "cleared").length / allWeeks.length) * 100)
        : 0
    };

    return NextResponse.json({
      success: true,
      summary,
      mentors: mentorRows,
      clearances: skillClearances
    });
  } catch (err: any) {
    console.error("GET /api/skill-tracker error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to fetch skill tracker" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "sme", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureMigration("mentor_skill_clearances");

    const body = await request.json();
    const {
      mentorId,
      mentorName,
      collegeId,
      subject,
      subjectType,
      weekNumber,
      scope = "week",
      topic,
      demoSessionId,
      weeklyPlanId,
      status,
      score,
      remarks,
      verifiedBy
    } = body;

    if (!mentorId || !subject || !weekNumber || !status || !VERDICTS.has(status)) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid fields: mentorId, subject, weekNumber, status." },
        { status: 400 }
      );
    }
    if (scope === "topic" && !topic) {
      return NextResponse.json(
        { success: false, message: "scope='topic' requires a topic." },
        { status: 400 }
      );
    }
    // Anti-rubber-stamp: clearing without demo backing requires remarks
    if (status === "cleared" && scope !== "demo" && !remarks?.trim()) {
      return NextResponse.json(
        { success: false, message: "Remarks are required when clearing a week/topic without a demo-backed evaluation." },
        { status: 400 }
      );
    }

    const nowStr = new Date().toISOString();
    const resolvedType = deriveSubjectType(subject, subjectType);
    if (resolvedType !== "Skill") {
      return NextResponse.json(
        { success: false, message: "Skill verdicts can only be recorded for Skill subjects." },
        { status: 400 }
      );
    }

    // Upsert key: scope-aware. Demo scope keys on demo_session_id; topic on topic; week on week.
    // These lookups must NOT fall back to `null` on a database error: that reads as "no verdict
    // yet" and INSERTs a second row for the same week instead of updating the existing one.
    let existing: any = null;
    if (scope === "demo" && demoSessionId) {
      existing = await db.get(
        "SELECT id FROM mentor_skill_clearances WHERE mentor_id = ? AND subject = ? AND week_number = ? AND scope = 'demo' AND demo_session_id = ?",
        mentorId, subject, weekNumber, demoSessionId
      );
    } else if (scope === "topic") {
      existing = await db.get(
        "SELECT id FROM mentor_skill_clearances WHERE mentor_id = ? AND subject = ? AND week_number = ? AND scope = 'topic' AND LOWER(TRIM(COALESCE(topic, ''))) = LOWER(TRIM(?))",
        mentorId, subject, weekNumber, topic
      );
    } else {
      existing = await db.get(
        "SELECT id FROM mentor_skill_clearances WHERE mentor_id = ? AND subject = ? AND week_number = ? AND scope = 'week'",
        mentorId, subject, weekNumber
      );
    }

    let writtenId: string = existing?.id || generateId("MSC");
    if (existing?.id) {
      await db.run(
        `UPDATE mentor_skill_clearances SET
          status = ?, score = ?, remarks = ?, verified_by = ?, verified_at = ?, updated_at = ?
         WHERE id = ?`,
        status,
        score ?? null,
        remarks || "",
        verifiedBy || "Reviewer",
        nowStr,
        nowStr,
        writtenId
      );
    } else {
      await db.run(
        `INSERT INTO mentor_skill_clearances (
          id, college_id, mentor_id, mentor_name, subject, subject_type,
          week_number, scope, topic, demo_session_id, weekly_plan_id,
          status, score, remarks, verified_by, verified_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        writtenId, collegeId || null, mentorId, mentorName || null, subject, resolvedType,
        weekNumber, scope, topic || null, demoSessionId || null, weeklyPlanId || null,
        status, score ?? null, remarks || "", verifiedBy || "Reviewer", nowStr, nowStr
      );
    }

    // Presentation only - the panel refetches the roll-up after a successful POST, so a
    // read-back failure must not turn an already-saved verdict into "Failed to record".
    let row: any = null;
    try {
      row = await db.get("SELECT * FROM mentor_skill_clearances WHERE id = ?", writtenId);
    } catch (readErr: any) {
      console.warn("POST /api/skill-tracker: verdict written but read-back failed:", readErr?.message);
    }

    return NextResponse.json({
      success: true,
      message: `Skill verdict recorded: ${status}.`,
      clearance: row
    });
  } catch (err: any) {
    console.error("POST /api/skill-tracker error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to record skill verdict" },
      { status: 500 }
    );
  }
}
