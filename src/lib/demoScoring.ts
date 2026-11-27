/**
 * Shared scoring and threshold normalization helpers for SME Demo Evaluation.
 * Every rubric criterion has a max score <= 5 (decimals supported), and the
 * combined score across any number of configured criteria maps cleanly onto
 * the compliance checklist scale (e.g., >= 3.5 / 5).
 */

export const MAX_CRITERION_MARKS = 5;

export function roundMarks(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function clampCriterionMax(value: unknown): number {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(num) || num <= 0) return MAX_CRITERION_MARKS;
  return roundMarks(Math.min(MAX_CRITERION_MARKS, num));
}

export function clampCriterionScore(value: unknown, maxMarks: number): number {
  const safeMax = clampCriterionMax(maxMarks);
  const num = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(num) || num < 0) return 0;
  return roundMarks(Math.min(safeMax, num));
}

export function calculateScaledMark(marks: number, totalMaxMarks: number, scale: number = 5): number {
  if (!Number.isFinite(marks) || !Number.isFinite(totalMaxMarks) || totalMaxMarks <= 0) return 0;
  const safeMarks = Math.max(0, marks);
  const scaled = (safeMarks / totalMaxMarks) * scale;
  return roundMarks(Math.min(scale, scaled));
}

export function evaluateThresholdRule(
  marks: number,
  totalMaxMarks: number,
  threshold: number,
  scale: number = 5
): { scaledScore: number; met: boolean } {
  const scaledScore = calculateScaledMark(marks, totalMaxMarks, scale);
  return {
    scaledScore,
    met: scaledScore >= threshold
  };
}
