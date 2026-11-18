import { describe, expect, it } from "vitest";
import { matchesCamTrackerPeriod } from "@/lib/camTrackerPeriod";

describe("CAM tracker period filters", () => {
  const range = { fromDate: "2026-11-10", toDate: "2026-11-18" };

  it("filters by academic week without applying the date range", () => {
    expect(matchesCamTrackerPeriod(
      { week_number: 4, updated_at: "2026-08-01T10:00:00Z" },
      { ...range, mode: "week", weekNumber: 4 }
    )).toBe(true);
    expect(matchesCamTrackerPeriod(
      { week_number: 3, updated_at: "2026-11-12T10:00:00Z" },
      { ...range, mode: "week", weekNumber: 4 }
    )).toBe(false);
  });

  it("filters by updated date without applying the academic week", () => {
    expect(matchesCamTrackerPeriod(
      { week_number: 12, updated_at: "2026-11-15T10:00:00Z" },
      { ...range, mode: "date", weekNumber: 1 }
    )).toBe(true);
    expect(matchesCamTrackerPeriod(
      { week_number: 1, updated_at: "2026-11-20T10:00:00Z" },
      { ...range, mode: "date", weekNumber: 1 }
    )).toBe(false);
  });

  it("requires a real academic week or a dated record", () => {
    expect(matchesCamTrackerPeriod(
      { week_number: 1 },
      { ...range, mode: "week", weekNumber: null }
    )).toBe(false);
    expect(matchesCamTrackerPeriod(
      { week_number: 1 },
      { ...range, mode: "date", weekNumber: null }
    )).toBe(false);
  });
});
