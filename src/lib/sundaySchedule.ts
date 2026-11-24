/**
 * Sunday working-day override (hook-free so the admin panel, the unit tests and
 * the headless harness all read exactly one rule).
 *
 * Every portal treats Sunday as a weekly holiday unless a `campus_daily_configs`
 * row for that exact date carries `day_type = "working"` plus a real
 * `day_order`. There is no standing per-campus Sunday flag, so an override is a
 * per-date write — and a holiday-table row on the same date still wins.
 */

import { formatMinutesToTime, parseTimeToMinutes } from "./utils";

export const DAY_ORDERS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"] as const;

export interface DailyConfigRow {
  dateStr?: string;
  day_type?: string;
  day_order?: string;
  session_mode?: string;
  notes?: string;
}

export type SundayStatus = "working" | "closed" | "blocked";

export interface SundayState {
  dateStr: string;
  /** `blocked` = the config asks for a working Sunday but a holiday row closes it. */
  status: SundayStatus;
  dayOrder: string;
  hasConfig: boolean;
  holidayTitle: string;
}

export function isSundayDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return new Date(`${dateStr}T00:00:00`).getDay() === 0;
}

/** Every Sunday inside a "YYYY-MM" month, oldest first. */
export function sundaysInMonth(yearMonth: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return [];
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || month < 1 || month > 12) return [];
  const lastDay = new Date(year, month, 0).getDate();
  const out: string[] = [];
  for (let day = 1; day <= lastDay; day++) {
    if (new Date(year, month - 1, day).getDay() !== 0) continue;
    out.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return out;
}

/** The rule the portals apply: working + a day order that is not "None". */
export function isWorkingSunday(config?: DailyConfigRow | null): boolean {
  return !!config && config.day_type === "working" && !!config.day_order && config.day_order !== "None";
}

export function resolveSundayState(
  dateStr: string,
  config?: DailyConfigRow | null,
  holidayTitle?: string
): SundayState {
  const working = isWorkingSunday(config);
  const title = (holidayTitle || "").trim();
  if (title) {
    return {
      dateStr,
      status: working ? "blocked" : "closed",
      dayOrder: working ? String(config?.day_order) : "",
      hasConfig: !!config,
      holidayTitle: title
    };
  }
  return {
    dateStr,
    status: working ? "working" : "closed",
    dayOrder: working ? String(config?.day_order) : "",
    hasConfig: !!config,
    holidayTitle: ""
  };
}

export interface SundayOverrideWrite {
  dateStr: string;
  working: boolean;
  dayOrder: string;
  sessionMode?: string;
  notes?: string;
}

/** Body for POST /api/daily-configs — one date, explicit order, never auto-advanced. */
export function sundayOverridePayload(
  collegeId: string,
  write: SundayOverrideWrite
): Record<string, string> {
  const order = DAY_ORDERS.includes(write.dayOrder as (typeof DAY_ORDERS)[number])
    ? write.dayOrder
    : "Day 1";
  return {
    college_id: collegeId,
    dateStr: write.dateStr,
    day_type: write.working ? "working" : "holiday",
    day_order: write.working ? order : "None",
    session_mode: write.sessionMode || "Offline",
    auto_advance: "false",
    notes: write.notes || ""
  };
}

export interface CompiledShiftPeriods {
  /** False when the campus has no compiled `shift_configs` and the default timetable applies. */
  configured: boolean;
  general: string[];
  shift_1: string[];
  shift_2: string[];
}

const EMPTY_PERIODS: CompiledShiftPeriods = { configured: false, general: [], shift_1: [], shift_2: [] };

/**
 * Reads the period arrays `compileShiftConfigs` writes. A Sunday can only run
 * one of these three shapes — there is no fourth shift key, which is why the
 * override never invents its own timings.
 */
export function readCompiledShiftPeriods(shiftConfigs?: string | null): CompiledShiftPeriods {
  if (!shiftConfigs) return EMPTY_PERIODS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(shiftConfigs);
  } catch {
    return EMPTY_PERIODS;
  }
  const rows = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((r): r is string => typeof r === "string" && r.includes("-"))
      : [];

  const source = (parsed || {}) as Record<string, unknown>;
  const general = rows(source.general);
  const shift_1 = rows(source.shift_1);
  const shift_2 = rows(source.shift_2);
  return {
    configured: general.length + shift_1.length + shift_2.length > 0,
    general,
    shift_1,
    shift_2
  };
}

export interface TimingBand {
  start: string;
  end: string;
  periods: number;
}

/** "08:20 AM - 09:10 AM" rows collapsed into the first-open / last-close band. */
export function bandOfPeriodRows(rows: string[]): TimingBand | null {
  let min = Number.POSITIVE_INFINITY;
  let max = -1;
  let periods = 0;
  for (const row of rows) {
    const [head, tail] = row.split("-");
    if (!head || !tail) continue;
    const start = parseTimeToMinutes(head.trim());
    const end = parseTimeToMinutes(tail.trim());
    if (!start || !end) continue;
    periods++;
    if (start < min) min = start;
    if (end > max) max = end;
  }
  if (periods === 0) return null;
  return { start: formatMinutesToTime(min), end: formatMinutesToTime(max), periods };
}
