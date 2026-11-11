import { getInstitutionDateStr } from "@/lib/localDate";

// ── Student NPS — the monthly class-feedback survey ─────────────────────────
// Hook-free so the API route, the admin card and the tests agree on one scale.

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;
export const MAX_TEXT_LENGTH = 500;

export const SCORE_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Good" },
  { value: 3, label: "Neutral" },
  { value: 2, label: "Poor" },
  { value: 1, label: "Very poor" }
];

export type NpsBand = "promoter" | "passive" | "detractor";

/** YYYY-MM bucket for a moment in the institution's timezone. */
export function monthKeyOf(at: Date = new Date()): string {
  return getInstitutionDateStr(at).slice(0, 7);
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

/** "2026-11" → "Nov 2026"; anything else comes back unchanged. */
export function monthLabel(key: string): string {
  if (!isMonthKey(key)) return String(key || "");
  const [y, m] = key.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
  return `${name} ${y}`;
}

export function clampScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_SCORE || n > MAX_SCORE) return null;
  return n;
}

/**
 * Same thresholds the mentor card uses (>=4.5 promoter, >=3.5 passive), applied
 * to the integer picker: 5 promotes, 4 is passive, 3 and under detract. Keeping
 * one rule means the two NPS cards in Reports & Insight cannot drift apart.
 */
export function bandOfScore(score: number): NpsBand | null {
  const n = clampScore(score);
  if (n === null) return null;
  if (n >= 4.5) return "promoter";
  if (n >= 3.5) return "passive";
  return "detractor";
}

export interface StudentNpsSummary {
  npsIndex: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  avg: number;
}

/** Index over the scores that classify; unparseable entries are ignored. */
export function summarize(scores: unknown[]): StudentNpsSummary {
  const numeric = scores.map(clampScore).filter((n): n is number => n !== null);
  const bands = numeric.map(bandOfScore).filter((b): b is NpsBand => b !== null);
  const total = bands.length;
  const promoters = bands.filter((b) => b === "promoter").length;
  const passives = bands.filter((b) => b === "passive").length;
  const detractors = bands.filter((b) => b === "detractor").length;
  const avg = total > 0 ? Math.round((numeric.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0;
  return {
    npsIndex: total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null,
    promoters,
    passives,
    detractors,
    total,
    avg
  };
}

export interface StudentNpsRow {
  month_key?: string | null;
  score?: number | string | null;
  mentor_score?: number | string | null;
  mentor_name?: string | null;
  student_id?: string | null;
  student_name?: string | null;
  college_name?: string | null;
  department?: string | null;
  class_group?: string | null;
  likes?: string | null;
  improve?: string | null;
  submitted_at?: string | null;
}

export interface StudentNpsTrendPoint {
  month: string;
  label: string;
  npsIndex: number | null;
  avg: number;
  total: number;
}

/** One point per month that has answers, oldest first. */
export function trendByMonth(rows: StudentNpsRow[]): StudentNpsTrendPoint[] {
  const byMonth: Record<string, number[]> = {};
  for (const row of rows) {
    const key = String(row.month_key || "").slice(0, 7);
    const score = clampScore(row.score);
    if (!isMonthKey(key) || score === null) continue;
    (byMonth[key] || (byMonth[key] = [])).push(score);
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, scores]) => {
      const summary = summarize(scores);
      return { month, label: monthLabel(month), npsIndex: summary.npsIndex, avg: summary.avg, total: summary.total };
    });
}

/** Months with a score to report, newest first — the picker in the admin card. */
export function monthsPresent(rows: StudentNpsRow[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = String(row.month_key || "").slice(0, 7);
    if (!isMonthKey(key) || clampScore(row.score) === null) continue;
    seen.add(key);
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}

export interface NpsCoverage {
  enrolled: number;
  respondents: number;
  ratePct: number | null;
}

/** Response share of the enrolled roster; null when the campus has no roster. */
export function coverageOf(respondents: number, enrolled: number): NpsCoverage {
  const r = Math.max(0, Math.round(respondents));
  const e = Math.max(0, Math.round(enrolled));
  return { enrolled: e, respondents: r, ratePct: e > 0 ? Math.round((r / e) * 100) : null };
}

export interface StudentNpsVerbatim {
  student: string;
  month: string;
  score: number | null;
  likes: string;
  improve: string;
}

/** Answers that carry words — the qualitative half of the monthly review. */
export function verbatimsOf(rows: StudentNpsRow[], limit = 20): StudentNpsVerbatim[] {
  return rows
    .filter((r) => String(r.likes || "").trim() !== "" || String(r.improve || "").trim() !== "")
    .slice(0, limit)
    .map((r) => ({
      student: String(r.student_name || "").trim() || "Anonymous",
      month: String(r.month_key || "").slice(0, 7),
      score: clampScore(r.score),
      likes: String(r.likes || "").trim(),
      improve: String(r.improve || "").trim()
    }));
}

/** Index colour band shared by the mentor/client cards so all three read alike. */
export function npsTone(index: number | null | undefined): "neutral" | "danger" | "warn" | "good" {
  if (index == null) return "neutral";
  if (index < 0) return "danger";
  if (index < 50) return "warn";
  return "good";
}

/** The signed number the cards print; nothing answered is a dash, not a zero. */
export function formatNps(index: number | null | undefined): string {
  if (index == null) return "—";
  return index > 0 ? `+${index}` : String(index);
}
