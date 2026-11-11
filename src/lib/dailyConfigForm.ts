/** Pure helpers behind the CM "Daily Day Order & Schedule Configurator" form. */

export const CANONICAL_DAY_TYPES = ["working", "holiday", "event", "exam_day"] as const;

/** Rows written before this vocabulary settled down still carry these. */
const DAY_TYPE_ALIASES: Record<string, string> = {
  regular: "working",
  normal: "working",
  working_day: "working",
  workday: "working",
  off: "holiday",
  off_day: "holiday",
  event_day: "event",
  exam: "exam_day",
  exam_date: "exam_day"
};

function canonicalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

/**
 * A <select> with no matching option displays its first entry, so an unlisted
 * day type had to be folded onto the closest real one - otherwise the picker
 * silently promised a rewrite the moment the record was saved.
 */
export function normalizeDayType(raw?: string | null): string {
  const key = canonicalize(raw || "");
  if (!key) return "working";
  if ((CANONICAL_DAY_TYPES as readonly string[]).includes(key)) return key;
  return DAY_TYPE_ALIASES[key] || raw!.trim();
}

export function isCanonicalDayType(raw?: string | null): boolean {
  return (CANONICAL_DAY_TYPES as readonly string[]).includes(canonicalize(raw || ""));
}

export function parseDayOrder(value?: string | null): number {
  const match = (value || "").trim().match(/^Day (\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Day Order only maps onto a weekday up to Day 6, so the option list is capped
 * at 7 to bound a corrupt stored value while still being able to display it.
 */
export function dayOrderCeiling(workingDayCount: number, current?: string | null): number {
  const campusLimit = workingDayCount > 0 ? workingDayCount : 5;
  return Math.min(7, Math.max(campusLimit, parseDayOrder(current)));
}

export function dayOrderOptions(ceiling: number): string[] {
  return Array.from({ length: Math.max(1, ceiling) }, (_, i) => `Day ${i + 1}`);
}
