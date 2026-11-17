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

/**
 * Predicts the next sequential Day Order given the previous working Day Order
 * and the campus's working day count (e.g. 5 or 6).
 */
export function predictNextDayOrder(lastDayOrder?: string | null, workingDayCount: number = 5): string {
  const count = workingDayCount === 6 ? 6 : 5;
  const currentNum = parseDayOrder(lastDayOrder);
  if (currentNum <= 0) return "Day 1";
  const nextNum = (currentNum % count) + 1;
  return `Day ${nextNum}`;
}

/**
 * Given any date string (YYYY-MM-DD) or Date object, returns the Monday and Sunday
 * date strings and date objects bounding that week.
 */
export function getWeekBoundaries(referenceDateStr?: string): {
  startDate: string; // Monday (YYYY-MM-DD)
  endDate: string;   // Sunday (YYYY-MM-DD)
  monday: Date;
  sunday: Date;
  weekDates: string[]; // 7 dates: Mon -> Sun
} {
  const ref = referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
    ? new Date(referenceDateStr + "T00:00:00")
    : new Date();

  const dayOfWeek = ref.getDay(); // 0 = Sun, 1 = Mon, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    weekDates.push(`${y}-${m}-${day}`);
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: weekDates[0],
    endDate: weekDates[6],
    monday,
    sunday,
    weekDates,
  };
}

export interface AutoAdaptedDayConfig {
  dateStr: string;
  dayType: "working" | "holiday" | "event" | "exam_day";
  dayOrder: string;
  sessionMode: "Offline" | "Online" | "Hybrid";
  notes: string;
  isExisting: boolean;
  existingId?: string;
}

/**
 * Smartly auto-adapts Day Order and Day Type configuration for a specified date:
 * 1. If an existing configuration exists in configsList, returns that record.
 * 2. If it is a weekend (Sunday, or Saturday on a 5-day campus), auto-adapts to holiday / None.
 * 3. If it is a working weekday, finds the latest working Day Order before this date and predicts the next sequential Day Order.
 */
export function autoAdaptDayConfig(
  targetDateStr: string,
  configsList: any[] = [],
  workingDayCount: number = 5
): AutoAdaptedDayConfig {
  const existing = (configsList || []).find((c: any) => c.dateStr === targetDateStr);
  if (existing) {
    return {
      dateStr: targetDateStr,
      dayType: normalizeDayType(existing.day_type) as any,
      dayOrder: existing.day_order || "Day 1",
      sessionMode: (existing.session_mode as any) || "Offline",
      notes: existing.notes || "",
      isExisting: true,
      existingId: existing.id || targetDateStr
    };
  }

  const [y, m, d] = targetDateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const isWeekend = isSunday || (workingDayCount === 5 && isSaturday);

  if (isWeekend) {
    return {
      dateStr: targetDateStr,
      dayType: "holiday",
      dayOrder: "None",
      sessionMode: "Offline",
      notes: isSunday ? "Sunday Weekend" : "Saturday Weekend",
      isExisting: false
    };
  }

  // Find most recent prior working config before targetDateStr
  const priorConfigs = (configsList || [])
    .filter((c: any) => c.dateStr && c.dateStr < targetDateStr && c.day_order && c.day_order !== "None" && c.day_type !== "holiday")
    .sort((a: any, b: any) => b.dateStr.localeCompare(a.dateStr));

  const lastOrder = priorConfigs[0]?.day_order || null;
  const predicted = predictNextDayOrder(lastOrder, workingDayCount);

  return {
    dateStr: targetDateStr,
    dayType: "working",
    dayOrder: predicted,
    sessionMode: "Offline",
    notes: "",
    isExisting: false
  };
}

