/**
 * Date helpers for calendar days in the institution's operating timezone.
 *
 * Vercel runs Node with TZ=UTC, so both `new Date().toISOString().split("T")[0]`
 * and `toLocaleDateString("en-CA")` answer "what day is it in Greenwich". The
 * campuses act on Indian Standard Time (UTC+5:30, no DST), and between
 * 00:00:00 and 05:29:59 IST those two answers differ by a whole day — the UTC
 * string is still yesterday. Day-order deadlines and the future-attendance
 * guard built on the UTC string therefore reject a legitimate current-day
 * submission in the early morning.
 */

export const INSTITUTION_TIME_ZONE = "Asia/Kolkata";

/** YYYY-MM-DD for `at` (default: now) in the institution's timezone. */
export function getInstitutionDateStr(
  at: Date = new Date(),
  timeZone: string = INSTITUTION_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** YYYY-MM-DD `days` calendar days from the institution's today (negative = past). */
export function getInstitutionDateStrOffset(days: number): string {
  const [y, m, d] = getInstitutionDateStr().split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Parses YYYY-MM-DD as local midnight instead of UTC midnight.
 * `new Date("2026-10-22")` is 05:30 IST, so `getDay()` on it is only safe by
 * accident; a browser in a negative-offset zone lands on the previous day.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Alias for getInstitutionDateStr() — returns YYYY-MM-DD in IST.
 * Use this wherever `new Date().toISOString().split("T")[0]` was used before.
 */
export function getLocalDateStr(): string {
  return getInstitutionDateStr();
}

/**
 * Calendar-day arithmetic on a YYYY-MM-DD string.
 * Zone-independent: nothing here reads the machine's local clock, so paging
 * weeks back and forth cannot land a day early the way Date#toISOString did.
 */
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
