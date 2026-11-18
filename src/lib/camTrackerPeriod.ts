export type CamTrackerPeriodFilter = {
  mode: "week" | "date";
  weekNumber: number | null;
  fromDate: string;
  toDate: string;
};

export function matchesCamTrackerPeriod(
  record: Record<string, unknown>,
  filter: CamTrackerPeriodFilter
): boolean {
  if (filter.mode === "week") {
    return filter.weekNumber !== null && Number(record.week_number) === filter.weekNumber;
  }

  const recordDate = String(record.updated_at || record.created_at || "").slice(0, 10);
  return recordDate.length === 10 && recordDate >= filter.fromDate && recordDate <= filter.toDate;
}
