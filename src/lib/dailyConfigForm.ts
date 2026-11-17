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

export interface WeekDayPlan {
  dateStr: string;
  dayType: "working" | "holiday" | "event" | "exam_day";
  dayOrder: string;
  sessionMode: "Offline" | "Online" | "Hybrid";
  notes: string;
  isExisting: boolean;
  existingId?: string;
}

/**
 * Auto-fills a 7-day week (Monday to Sunday) given any single configured anchor day in that week,
 * or continues from the last known working Day Order prior to that week.
 * Preserves weekends (Sunday, and Saturday on 5-day campus) as holidays.
 */
export function autoFillWeekFromAnchor(
  weekDates: string[],
  configsList: any[] = [],
  workingDayCount: number = 5,
  priorLastDayOrder?: string | null
): WeekDayPlan[] {
  const count = workingDayCount === 6 ? 6 : 5;
  const existingMap = new Map<string, any>();
  (configsList || []).forEach((c: any) => {
    if (c.dateStr && weekDates.includes(c.dateStr)) {
      existingMap.set(c.dateStr, c);
    }
  });

  // Find any existing working day order anchor in this week
  const anchorEntry = weekDates
    .map((dStr, idx) => ({ dStr, idx, cfg: existingMap.get(dStr) }))
    .find(item => item.cfg && item.cfg.day_order && item.cfg.day_order !== "None" && item.cfg.day_type !== "holiday");

  let baseDayOrderNum = 1;
  let baseIndex = 0;

  if (anchorEntry) {
    baseDayOrderNum = parseDayOrder(anchorEntry.cfg.day_order) || 1;
    baseIndex = anchorEntry.idx;
  } else {
    const priorNum = parseDayOrder(priorLastDayOrder);
    baseDayOrderNum = priorNum > 0 ? ((priorNum % count) + 1) : 1;
    baseIndex = 0;
  }

  const dayFlags = weekDates.map((dStr) => {
    const existing = existingMap.get(dStr);
    const [y, m, d] = dStr.split("-").map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isWeekend = isSunday || (count === 5 && isSaturday);
    const isHoliday = existing ? existing.day_type === "holiday" : isWeekend;
    return { dStr, existing, isHoliday, isSunday, isSaturday, isWeekend };
  });

  const dayOrdersArr: string[] = new Array(7).fill("None");

  // Forward pass from baseIndex
  let currentNum = baseDayOrderNum;
  for (let i = baseIndex; i < 7; i++) {
    const item = dayFlags[i];
    if (item.isHoliday) {
      dayOrdersArr[i] = "None";
    } else {
      if (item.existing && item.existing.day_order && item.existing.day_order !== "None") {
        dayOrdersArr[i] = item.existing.day_order;
        currentNum = (parseDayOrder(item.existing.day_order) % count) + 1;
      } else {
        dayOrdersArr[i] = `Day ${currentNum}`;
        currentNum = (currentNum % count) + 1;
      }
    }
  }

  // Backward pass from baseIndex - 1 down to 0
  let prevNum = ((baseDayOrderNum - 2 + count) % count) + 1;
  for (let i = baseIndex - 1; i >= 0; i--) {
    const item = dayFlags[i];
    if (item.isHoliday) {
      dayOrdersArr[i] = "None";
    } else {
      if (item.existing && item.existing.day_order && item.existing.day_order !== "None") {
        dayOrdersArr[i] = item.existing.day_order;
        const parsed = parseDayOrder(item.existing.day_order);
        prevNum = ((parsed - 2 + count) % count) + 1;
      } else {
        dayOrdersArr[i] = `Day ${prevNum}`;
        prevNum = ((prevNum - 2 + count) % count) + 1;
      }
    }
  }

  const result: WeekDayPlan[] = [];
  for (let i = 0; i < 7; i++) {
    const item = dayFlags[i];
    if (item.existing) {
      result.push({
        dateStr: item.dStr,
        dayType: normalizeDayType(item.existing.day_type) as any,
        dayOrder: dayOrdersArr[i],
        sessionMode: (item.existing.session_mode as any) || "Offline",
        notes: item.existing.notes || "",
        isExisting: true,
        existingId: item.existing.id || item.dStr
      });
    } else {
      result.push({
        dateStr: item.dStr,
        dayType: item.isHoliday ? "holiday" : "working",
        dayOrder: dayOrdersArr[i],
        sessionMode: "Offline",
        notes: item.isHoliday ? (item.isSunday ? "Sunday Weekend" : item.isSaturday ? "Saturday Weekend" : "Holiday") : "",
        isExisting: false
      });
    }
  }

  return result;
}

/**
 * Re-aligns and cascades subsequent Day Orders in the cycle when a specific date is modified:
 * - If target date is made a holiday, subsequent working days shift to continue from the prior working Day Order.
 * - If target date is assigned Day K, subsequent working days continue as K+1, K+2, skipping holidays.
 */
export function cascadeRealignCycle(
  targetDateStr: string,
  newDayType: string,
  newDayOrder: string,
  configsList: any[] = [],
  workingDayCount: number = 5,
  scopeDates?: string[]
): { dateStr: string; dayType: string; dayOrder: string; modified: boolean }[] {
  const count = workingDayCount === 6 ? 6 : 5;
  
  let targetScopeDates: string[] = [];
  if (scopeDates && scopeDates.length > 0) {
    targetScopeDates = scopeDates.filter(d => d >= targetDateStr);
  } else {
    const week = getWeekBoundaries(targetDateStr);
    targetScopeDates = week.weekDates.filter(d => d >= targetDateStr);
  }

  const existingMap = new Map<string, any>();
  (configsList || []).forEach(c => {
    if (c.dateStr) existingMap.set(c.dateStr, c);
  });

  const result: { dateStr: string; dayType: string; dayOrder: string; modified: boolean }[] = [];

  let nextDayOrderNum = 1;
  const isTargetHoliday = newDayType === "holiday";
  const targetParsed = parseDayOrder(newDayOrder);

  if (!isTargetHoliday && targetParsed > 0) {
    nextDayOrderNum = (targetParsed % count) + 1;
  } else {
    const priorConfigs = (configsList || [])
      .filter((c: any) => c.dateStr && c.dateStr < targetDateStr && c.day_order && c.day_order !== "None" && c.day_type !== "holiday")
      .sort((a: any, b: any) => b.dateStr.localeCompare(a.dateStr));
    const lastPrior = priorConfigs[0]?.day_order;
    const priorNum = parseDayOrder(lastPrior);
    nextDayOrderNum = priorNum > 0 ? ((priorNum % count) + 1) : 1;
  }

  for (const dStr of targetScopeDates) {
    if (dStr === targetDateStr) {
      result.push({
        dateStr: dStr,
        dayType: newDayType,
        dayOrder: isTargetHoliday ? "None" : (newDayOrder || `Day 1`),
        modified: true
      });
      continue;
    }

    const existing = existingMap.get(dStr);
    const [y, m, d] = dStr.split("-").map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isWeekend = isSunday || (count === 5 && isSaturday);
    const isHoliday = existing ? existing.day_type === "holiday" : isWeekend;

    if (isHoliday) {
      result.push({
        dateStr: dStr,
        dayType: "holiday",
        dayOrder: "None",
        modified: existing ? (existing.day_order !== "None" || existing.day_type !== "holiday") : false
      });
    } else {
      const assignedOrder = `Day ${nextDayOrderNum}`;
      const wasModified = !existing || existing.day_order !== assignedOrder || existing.day_type !== "working";
      result.push({
        dateStr: dStr,
        dayType: "working",
        dayOrder: assignedOrder,
        modified: wasModified
      });
      nextDayOrderNum = (nextDayOrderNum % count) + 1;
    }
  }

  return result;
}

