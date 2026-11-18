import { describe, expect, it } from "vitest";
import {
  getCampusWorkingDateSequence,
  getNextCampusWorkingDate,
  isCampusWorkingDate,
} from "@/lib/campusWorkingDays";

describe("campus working-day schedule", () => {
  it("keeps 5-day campuses on Monday through Friday", () => {
    expect(isCampusWorkingDate("2026-11-21", 5)).toBe(false);
    expect(getNextCampusWorkingDate("2026-11-21", 5)).toBe("2026-11-23");
    expect(getCampusWorkingDateSequence("2026-11-20", 3, 5)).toEqual([
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
    ]);
  });

  it("allows Saturday for 6-day campuses but never Sunday", () => {
    expect(isCampusWorkingDate("2026-11-21", 6)).toBe(true);
    expect(getCampusWorkingDateSequence("2026-11-21", 3, 6)).toEqual([
      "2026-11-21",
      "2026-11-23",
      "2026-11-24",
    ]);
  });
});
