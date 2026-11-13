/**
 * Mentor Skill Development Tracker — shared roll-up helpers.
 *
 * Pure functions shared by:
 *   - /api/skill-tracker  (GET roll-up + POST/PATCH verdict upsert)
 *   - /api/demo-sessions  (auto-verdict on SME demo evaluation)
 *   - tests/skill-tracker.test.ts (unit tests for the roll-up math)
 *
 * Matching convention matches /api/weekly-plan GET: topics are compared with
 * lowercase-trim equality (see plan doc §6 — exact fuzzy matching out of scope).
 */

export const DEMO_PASS_MARK = 50;

export type SkillClearanceStatus = "pending" | "cleared" | "not_cleared" | "needs_revision";

export interface TopicProgress {
  topic: string;
  planned: boolean;
  conducted: boolean;
}

/** Lowercase-trim normalize a topic/subject string for comparison. */
export function normalizeTopic(t?: string | null): string {
  return (t || "").toLowerCase().trim();
}

/** Derive subject type: prefer explicit batch-creation type, fall back to keyword classifier. */
export function deriveSubjectType(subject?: string | null, subjectType?: string | null): "Skill" | "Academic" {
  const t = (subjectType || "").toLowerCase().trim();
  if (t === "skill") return "Skill";
  if (t === "academic" || t === "theory" || t === "lab" || t === "practical") return "Academic";
  // Keyword fallback mirrors isSkillSubject() in utils.ts (kept inline so this
  // module stays dependency-free for reuse in tests and API routes).
  const n = normalizeTopic(subject);
  if (
    n.includes("soft skills") ||
    n.includes("communication skills") ||
    n.includes("communication") ||
    n.includes("aptitude") ||
    n.includes("portfolio") ||
    n.includes("nan mudhalvan") ||
    n.includes("nmc") ||
    n.includes("viva") ||
    n.includes("fop") ||
    n.includes("dsa") ||
    n.includes("leetcode") ||
    n.includes("placement") ||
    n.includes("full stack") ||
    n.includes("reinforcement learning") ||
    (n.includes("skill") && !n.includes("lab"))
  ) {
    return "Skill";
  }
  return "Academic";
}

/**
 * Map a demo outcome (status + marks) to a clearance verdict.
 * Only `completed` demos produce a final verdict; anything else stays pending.
 */
export function demoStatusToVerdict(
  status?: string | null,
  marks?: number | null,
  passMark: number = DEMO_PASS_MARK
): { status: SkillClearanceStatus; score: number | null } {
  const s = (status || "").toLowerCase().trim();
  if (s === "completed" && typeof marks === "number" && !isNaN(marks)) {
    return { status: marks >= passMark ? "cleared" : "not_cleared", score: marks };
  }
  return { status: "pending", score: typeof marks === "number" ? marks : null };
}

export interface WeekPlanInput {
  week_number: number;
  session_plan?: string | any[] | null;
  topics_planned?: string | null;
  start_date?: string | null;
  created_at?: string | null;
}

export interface ClearanceRow {
  mentor_id: string;
  subject: string;
  week_number: number;
  scope?: string | null;
  topic?: string | null;
  demo_session_id?: string | null;
  status: SkillClearanceStatus | string;
  score?: number | null;
  remarks?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  submission_link?: string | null;
  created_at?: string | null;
}

export interface DemoRow {
  id?: string;
  mentorId?: string | null;
  dateStr?: string | null;
  week?: number | string | null;
  status?: string | null;
  marks?: number | null;
  comments?: string | null;
}

export interface TrackerRow {
  topic?: string | null;
  weekly_plan_week?: number | string | null;
}

/**
 * Roll up one mentor × subject × week into tracker rows for the panel UI.
 * Priority: manual SME verdict (week/topic scope) > demo verdict > pending.
 */
export function buildWeekRollup(
  plan: WeekPlanInput | null | undefined,
  clearances: ClearanceRow[],
  demos: DemoRow[],
  trackerRows: TrackerRow[],
  weekNumber: number,
  passMark: number = DEMO_PASS_MARK
): {
  week_number: number;
  task_number?: number;
  topic_name: string | null;
  topics: TopicProgress[];
  topics_planned: number;
  topics_conducted: number;
  demo_status: string | null;
  demo_marks: number | null;
  demo_id: string | null;
  verdict: SkillClearanceStatus;
  score: number | null;
  remarks: string | null;
  verified_by: string | null;
  verified_at: string | null;
  submission_link: string | null;
  submission_date?: string | null;
  deadline?: string | null;
  task_given_date: string | null;
  instructions?: string | null;
  reference_material?: string | null;
} {
  // 1. Planned topics from the weekly plan's session_plan JSON
  let tasks: any[] = [];
  try {
    tasks = typeof plan?.session_plan === "string"
      ? JSON.parse(plan.session_plan as string)
      : (plan?.session_plan || []);
    if (!Array.isArray(tasks)) tasks = [];
  } catch {
    tasks = [];
  }
  let plannedTopics: string[] = tasks
    .map((t: any) => (t?.topic || "").trim())
    .filter(Boolean);

  // If session_plan didn't yield topics, check plan.topics_planned
  if (plannedTopics.length === 0 && (plan as any)?.topics_planned) {
    const raw = String((plan as any).topics_planned).trim();
    if (raw) {
      plannedTopics = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      if (plannedTopics.length === 0 && raw) plannedTopics = [raw];
    }
  }

  // Also check clearances for any topic-scope records
  if (plannedTopics.length === 0) {
    const clearanceTopics = clearances.map(c => c.topic?.trim()).filter(Boolean) as string[];
    if (clearanceTopics.length > 0) {
      plannedTopics = Array.from(new Set(clearanceTopics));
    }
  }

  // Also check conducted topics from tracker rows
  if (plannedTopics.length === 0) {
    const trackerTopics = trackerRows
      .filter(r => {
        const wk = parseInt(String(r.weekly_plan_week ?? ""), 10);
        return isNaN(wk) || wk === weekNumber;
      })
      .map(r => (r.topic || "").trim())
      .filter(Boolean);
    if (trackerTopics.length > 0) {
      plannedTopics = Array.from(new Set(trackerTopics));
    }
  }

  // 2. Conducted topics: matched from academic_tracker rows for this week.
  // Rows with no weekly_plan_week are undated as to week, so they count for every week.
  const conductedSet = new Set<string>();
  trackerRows.forEach(r => {
    const wk = parseInt(String(r.weekly_plan_week ?? ""), 10);
    if (!isNaN(wk) && wk !== weekNumber) return;
    const topic = normalizeTopic(r.topic);
    if (topic) conductedSet.add(topic);
  });

  const topics: TopicProgress[] = plannedTopics.map(t => ({
    topic: t,
    planned: true,
    conducted: conductedSet.has(normalizeTopic(t))
  }));

  // 3. Demo outcome for this week (latest by dateStr)
  const weekDemos = demos
    .filter(d => {
      const dw = parseInt(String(d.week ?? ""), 10);
      return !isNaN(dw) && dw === weekNumber;
    })
    .sort((a, b) => String(b.dateStr || "").localeCompare(String(a.dateStr || "")));
  const demo = weekDemos[0] || null;
  const demoVerdict = demo ? demoStatusToVerdict(demo.status, demo.marks, passMark) : { status: "pending" as const, score: null };

  // 4. SME manual verdict (week scope beats topic scope)
  const weekScope = clearances.filter(c => c.scope !== "demo" && c.scope !== "topic");
  const weekVerdictRow = weekScope.find(c => c.status === "cleared")
    || weekScope.find(c => c.status === "not_cleared")
    || weekScope.find(c => c.status === "needs_revision");

  // Manual topic-scope verdicts: if any topic is cleared, count it for the aggregate
  const topicScope = clearances.filter(c => c.scope === "topic");
  const allTopicsCleared = plannedTopics.length > 0 &&
    plannedTopics.every(t => topicScope.some(c => normalizeTopic(c.topic) === normalizeTopic(t) && c.status === "cleared"));

  let verdict: SkillClearanceStatus = demoVerdict.status === "cleared"
    ? "cleared"
    : demoVerdict.status === "not_cleared" ? "not_cleared" : "pending";
  let score: number | null = demoVerdict.score;
  let remarks: string | null = demo?.comments || null;
  let verified_by: string | null = demo ? null : null;
  let verified_at: string | null = null;

  if (weekVerdictRow) {
    verdict = weekVerdictRow.status as SkillClearanceStatus;
    score = weekVerdictRow.score ?? score;
    remarks = weekVerdictRow.remarks || remarks;
    verified_by = weekVerdictRow.verified_by || null;
    verified_at = weekVerdictRow.verified_at || null;
  } else if (allTopicsCleared) {
    verdict = "cleared";
    verified_by = topicScope.find(c => c.status === "cleared" && c.verified_by)?.verified_by || null;
  }

  // 5. Submission link: check clearance record first, then weekly plan material_url or session_plan tasks
  let submission_link: string | null = null;
  for (const c of clearances) {
    if (c.submission_link) {
      submission_link = c.submission_link;
      break;
    }
  }
  if (!submission_link && (plan as any)?.submission_link) {
    submission_link = (plan as any).submission_link;
  }
  if (!submission_link && (plan as any)?.material_url) {
    submission_link = (plan as any).material_url;
  }
  if (!submission_link) {
    for (const t of tasks) {
      if (t?.materialUrl && typeof t.materialUrl === "string" && t.materialUrl.trim()) {
        submission_link = t.materialUrl.trim();
        break;
      }
    }
  }

  const topicNames = topics.map(t => t.topic).filter(Boolean);
  const topic_name = topicNames.length > 0 ? topicNames.join(", ") : null;

  const deadline =
    (plan as any)?.start_date ||
    ((plan as any)?.created_at ? String((plan as any).created_at).slice(0, 10) : null) ||
    (clearances.find(c => (c as any).created_at)?.created_at ? String((clearances.find(c => (c as any).created_at) as any).created_at).slice(0, 10) : null) ||
    null;

  let submission_date: string | null = null;
  if (submission_link) {
    const clearanceWithLink = clearances.find(c => c.submission_link);
    if (clearanceWithLink && (clearanceWithLink as any).updated_at) {
      submission_date = String((clearanceWithLink as any).updated_at).slice(0, 10);
    } else if ((plan as any)?.updated_at && (plan as any)?.submission_link) {
      submission_date = String((plan as any).updated_at).slice(0, 10);
    }
  }

  const firstTaskObj = tasks[0] || null;
  const taskInstructions = firstTaskObj?.description || firstTaskObj?.instructions || null;
  const taskRefMaterial = firstTaskObj?.materialUrl || firstTaskObj?.referenceUrl || null;

  return {
    week_number: weekNumber,
    task_number: weekNumber,
    topic_name,
    topics,
    topics_planned: topics.length,
    topics_conducted: topics.filter(t => t.conducted).length,
    demo_status: demo?.status || null,
    demo_marks: demo?.marks ?? null,
    demo_id: demo?.id || null,
    verdict,
    score,
    remarks,
    verified_by,
    verified_at,
    submission_link,
    submission_date,
    deadline,
    task_given_date: deadline,
    instructions: taskInstructions,
    reference_material: taskRefMaterial
  };
}
