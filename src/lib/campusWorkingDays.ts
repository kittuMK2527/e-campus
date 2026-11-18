function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeCampusWorkingDays(value?: number | null): 5 | 6 {
  return Number(value) === 6 ? 6 : 5;
}

export function isCampusWorkingDate(dateStr: string, workingDays: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;

  const weekday = date.getUTCDay();
  return weekday !== 0 && (normalizeCampusWorkingDays(workingDays) === 6 || weekday !== 6);
}

export function getNextCampusWorkingDate(
  dateStr: string,
  workingDays: number,
  includeStartDate = true
): string {
  let candidate = includeStartDate ? dateStr : shiftDate(dateStr, 1);
  for (let attempts = 0; attempts < 8; attempts += 1) {
    if (isCampusWorkingDate(candidate, workingDays)) return candidate;
    candidate = shiftDate(candidate, 1);
  }
  return candidate;
}

export function getCampusWorkingDateSequence(
  startDate: string,
  count: number,
  workingDays: number
): string[] {
  const dates: string[] = [];
  let nextDate = getNextCampusWorkingDate(startDate, workingDays);
  for (let index = 0; index < count; index += 1) {
    dates.push(nextDate);
    nextDate = getNextCampusWorkingDate(nextDate, workingDays, false);
  }
  return dates;
}
