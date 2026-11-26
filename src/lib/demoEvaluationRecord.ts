import {
  calculateScaledMark,
  clampCriterionMax,
  clampCriterionScore,
  roundMarks
} from "./demoScoring";

export interface RubricCriterionInput {
  key: string;
  label: string;
  max: number;
}

export interface RubricBreakdownEntry {
  key: string;
  label: string;
  score: number;
  max: number;
}

export interface DemoScoreBreakdown {
  criteria: RubricBreakdownEntry[];
  totalScored: number;
  totalMaxMarks: number;
  marksOutOf5: number;
  marksNormalized: number;
}

export interface ChecklistSnapshotEntry {
  criterionId?: string;
  label: string;
  type?: string;
  met: boolean;
  detail?: string;
}

export function buildScoreBreakdown(
  criteriaList: RubricCriterionInput[],
  evalScores: Record<string, number | string>
): DemoScoreBreakdown {
  const criteria: RubricBreakdownEntry[] = criteriaList.map((crit) => {
    const max = clampCriterionMax(crit.max);
    const score = clampCriterionScore(evalScores[crit.key] ?? 0, max);
    return {
      key: String(crit.key),
      label: String(crit.label),
      score,
      max
    };
  });

  const totalMaxMarks = roundMarks(criteria.reduce((sum, item) => sum + item.max, 0));
  const totalScored = roundMarks(criteria.reduce((sum, item) => sum + item.score, 0));
  const marksOutOf5 = calculateScaledMark(totalScored, totalMaxMarks, 5);
  const marksNormalized = totalMaxMarks > 0 ? Math.min(100, Math.round((totalScored / totalMaxMarks) * 100)) : 0;

  return {
    criteria,
    totalScored,
    totalMaxMarks,
    marksOutOf5,
    marksNormalized
  };
}

export function parseScoreBreakdown(raw: unknown): DemoScoreBreakdown | null {
  if (!raw) return null;
  let parsed: any = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;

  const rawCriteria = Array.isArray(parsed.criteria) ? parsed.criteria : [];
  const criteria: RubricBreakdownEntry[] = rawCriteria
    .filter((item: any) => item && typeof item === "object" && typeof item.label === "string" && item.label.trim().length > 0)
    .map((item: any, idx: number) => {
      const maxNum = Number(item.max);
      const safeMax = Number.isFinite(maxNum) && maxNum > 0 ? roundMarks(maxNum) : 5;
      const scoreNum = Number(item.score);
      const safeScore = Number.isFinite(scoreNum) && scoreNum >= 0 ? clampCriterionScore(scoreNum, safeMax) : 0;
      return {
        key: typeof item.key === "string" && item.key.trim() ? item.key : `criterion_${idx}`,
        label: item.label.trim(),
        score: safeScore,
        max: safeMax
      };
    });

  const hasCriteria = criteria.length > 0;
  const fallbackMax = roundMarks(criteria.reduce((sum, item) => sum + item.max, 0));
  const fallbackScored = roundMarks(criteria.reduce((sum, item) => sum + item.score, 0));

  const rawTotalMax = Number(parsed.totalMaxMarks);
  const totalMaxMarks = Number.isFinite(rawTotalMax) && rawTotalMax > 0 ? roundMarks(rawTotalMax) : fallbackMax;

  const rawTotalScored = Number(parsed.totalScored);
  const totalScored = Number.isFinite(rawTotalScored) && rawTotalScored >= 0 ? roundMarks(rawTotalScored) : fallbackScored;

  if (!hasCriteria && totalMaxMarks <= 0) return null;

  const rawOutOf5 = Number(parsed.marksOutOf5);
  const marksOutOf5 = Number.isFinite(rawOutOf5) && rawOutOf5 >= 0
    ? roundMarks(Math.min(5, rawOutOf5))
    : calculateScaledMark(totalScored, totalMaxMarks, 5);

  const rawNorm = Number(parsed.marksNormalized);
  const marksNormalized = Number.isFinite(rawNorm) && rawNorm >= 0
    ? Math.min(100, Math.round(rawNorm))
    : (totalMaxMarks > 0 ? Math.min(100, Math.round((totalScored / totalMaxMarks) * 100)) : 0);

  return {
    criteria,
    totalScored,
    totalMaxMarks,
    marksOutOf5,
    marksNormalized
  };
}

export function resolveSessionDisplayScores(
  session: any,
  thresholdOutOf5: number = 3.5
): {
  breakdown: DemoScoreBreakdown | null;
  marksOutOf5: number;
  marksNormalized: number;
  thresholdMet: boolean;
} {
  const breakdown = parseScoreBreakdown(session?.score_breakdown ?? session?.scoreBreakdown);
  const rawMarks = Number(session?.marks);
  const marksNormalized = Number.isFinite(rawMarks)
    ? Math.max(0, Math.min(100, Math.round(rawMarks)))
    : (breakdown?.marksNormalized ?? 0);
  const marksOutOf5 = breakdown
    ? breakdown.marksOutOf5
    : calculateScaledMark(marksNormalized, 100, 5);
  return {
    breakdown,
    marksOutOf5,
    marksNormalized,
    thresholdMet: marksOutOf5 >= thresholdOutOf5
  };
}

export function parseChecklistSnapshot(raw: unknown): ChecklistSnapshotEntry[] {
  if (!raw) return [];
  let parsed: any = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item: any) => item && typeof item === "object" && typeof item.label === "string" && item.label.trim().length > 0 && typeof item.met === "boolean")
    .map((item: any) => ({
      criterionId: typeof item.criterionId === "string" ? item.criterionId : undefined,
      label: item.label.trim(),
      type: typeof item.type === "string" ? item.type : undefined,
      met: item.met,
      detail: typeof item.detail === "string" && item.detail.trim() ? item.detail.trim() : undefined
    }));
}

export function formatEvalTimestamp(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "Not recorded";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
