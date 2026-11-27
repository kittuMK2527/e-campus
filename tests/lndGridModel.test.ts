import { describe, expect, it, vi } from "vitest";
import {
  calculateWeekNumber,
  computeAllocProgress,
  computeCollegeTimetablePeriodList,
  computeEffectiveDayOrderInfo,
  computeGridWindowCapacity,
  computeMentorGroups,
  computeQuotaSummary,
  filterQuotaRows
} from "@/lib/lndGridModel";
import { mapDayOrderToDayName } from "@/lib/utils";

const SLOTS = [
  { college_id: "c1", day: "Monday", time: "Period 1 (08:30 AM - 09:25 AM)" },
  { college_id: "c1", day: "Mon", time: "Period 1 (08:30 AM - 09:25 AM)" },
  { college_id: "c1", day: "Monday", time: "Period 2 (09:25 AM - 10:20 AM)" },
  { college_id: "c1", day: "Tuesday", time: "Period 1 (08:30 AM - 09:25 AM)" },
  { college_id: "c2", day: "Monday", time: "Period 1 (08:30 AM - 09:25 AM)" },
  { college_id: "c1", day: "Wednesday", time: "Lunch Break" }
];

describe("calculateWeekNumber", () => {
  it("returns 1 for a malformed date", () => {
    expect(calculateWeekNumber("not-a-date")).toBe(1);
  });

  it("grows across the year", () => {
    expect(calculateWeekNumber("2026-01-05")).toBeLessThan(calculateWeekNumber("2026-06-15"));
  });
});

describe("computeCollegeTimetablePeriodList", () => {
  it("is empty without a college or weekday", () => {
    expect(computeCollegeTimetablePeriodList(SLOTS)).toEqual([]);
    expect(computeCollegeTimetablePeriodList(SLOTS, "c1")).toEqual([]);
  });

  it("matches full and 3-letter day names and dedupes", () => {
    expect(computeCollegeTimetablePeriodList(SLOTS, "c1", "Monday")).toEqual([
      "Period 1 (08:30 AM - 09:25 AM)",
      "Period 2 (09:25 AM - 10:20 AM)"
    ]);
    expect(computeCollegeTimetablePeriodList(SLOTS, "c1", "mon")).toEqual([
      "Period 1 (08:30 AM - 09:25 AM)",
      "Period 2 (09:25 AM - 10:20 AM)"
    ]);
  });

  it("never leaks another college's periods", () => {
    expect(computeCollegeTimetablePeriodList(SLOTS, "c2", "Monday")).toEqual([
      "Period 1 (08:30 AM - 09:25 AM)"
    ]);
  });
});

describe("computeEffectiveDayOrderInfo", () => {
  const holidays = [{ date: "2026-10-27", college_id: "" }];

  it("falls back to Day N when nothing is configured", () => {
    const info = computeEffectiveDayOrderInfo(new Map(), [], SLOTS, "2026-10-26", "Monday", 0, "c1");
    expect(info.dayOrder).toBe("Day 1");
    expect(info.isHoliday).toBe(false);
    expect(info.isConfiguredInCam).toBe(false);
    expect(info.periods).toBe(2);
  });

  it("prefers the college-scoped CAM config over the global one", () => {
    const configs = new Map([
      ["c1_2026-10-26", { day_order: "Day 3", day_type: "working" }],
      ["2026-10-26", { day_order: "Day 9", day_type: "working" }]
    ]);
    const info = computeEffectiveDayOrderInfo(configs, [], SLOTS, "2026-10-26", "Monday", 0, "c1");
    expect(info.isConfiguredInCam).toBe(true);
    expect(info.dayOrder).toBe("Day 3");
    expect(info.effectiveTimetableDay).toBe(mapDayOrderToDayName("Day 3", "Monday"));
  });

  it("marks holidays, zeroes the periods and labels the row", () => {
    const info = computeEffectiveDayOrderInfo(new Map(), holidays, SLOTS, "2026-10-27", "Tuesday", 1, "c1");
    expect(info.isHoliday).toBe(true);
    expect(info.periods).toBe(0);
    expect(info.dayOrder).toBe("Holiday");
    expect(info.effectiveTimetableDay).toBe("Holiday");
    expect(info.rowLabel).toBe("Holiday - Tuesday (2026-10-27)");
  });
});

describe("computeQuotaSummary and filterQuotaRows", () => {
  const mentors = [
    { id: "m1", name: "Asha", mentor_group: "Maths", college_id: "c1" },
    { id: "m2", name: "Bala", mentor_group: "Physics", college_id: "c2" }
  ];
  const ruleTargets = new Map([["maths", 3]]);
  const mentorTargets: Record<string, number> = { m2: 2 };
  const counts = new Map([["m1", 2]]);
  const collegesById = new Map([["c1", { name: "Solamalai" }]]);

  const rows = computeQuotaSummary(mentors, ruleTargets, mentorTargets, counts, collegesById);

  it("uses the dept rule target unless the mentor has a custom one", () => {
    expect(rows[0].customTarget).toBe(3);
    expect(rows[1].customTarget).toBe(2);
  });

  it("derives satisfaction, remaining and college name", () => {
    expect(rows[0].scheduledCount).toBe(2);
    expect(rows[0].remainingCount).toBe(1);
    expect(rows[0].isSatisfied).toBe(false);
    expect(rows[0].isOver).toBe(false);
    expect(rows[0].collegeName).toBe("Solamalai");
    expect(rows[1].collegeName).toBe("Campus");
  });

  it("sums progress across rows", () => {
    expect(computeAllocProgress(rows)).toEqual({ scheduled: 2, target: 5, satisfied: 0, total: 2 });
  });

  it("filters quota rows by mentor, group or campus name", () => {
    expect(filterQuotaRows(rows, "asha")).toHaveLength(1);
    expect(filterQuotaRows(rows, "physics").map(r => r.mentor.id)).toEqual(["m2"]);
    expect(filterQuotaRows(rows, "solamalai").map(r => r.mentor.id)).toEqual(["m1"]);
    expect(filterQuotaRows(rows, "   ")).toHaveLength(2);
    expect(filterQuotaRows(rows, "zzz")).toHaveLength(0);
  });
});

describe("computeGridWindowCapacity", () => {
  const week = [
    { dateStr: "2026-10-26", day: "Monday", formatted: "Mon 26" },
    { dateStr: "2026-10-27", day: "Tuesday", formatted: "Tue 27" }
  ];
  const smes = [{ id: "s1" }];
  const periodRows = ["Period 1", "Period 2"];
  const dayOrderFor = vi.fn((dateStr: string, _day: string, _idx: number, collegeId?: string) => {
    if (dateStr === "2026-10-27" && collegeId) {
      return { isHoliday: true, periods: 0 };
    }
    return { isHoliday: false, periods: periodRows.length };
  });
  const smeSlotStatusAt = vi.fn((_smeId: string, _day: string, dateStr: string, slot: string) => ({
    status: dateStr === "2026-10-26" && slot === "Period 1" ? "free_demo" : "busy"
  }));

  it("counts open windows on working days and skips campus holidays", () => {
    const { open, total } = computeGridWindowCapacity(week, smes, periodRows, "c1", dayOrderFor, smeSlotStatusAt);
    expect(total).toBe(2);
    expect(open).toBe(1);
  });

  it("keeps the all-campus view on SME demo windows instead of period counts", () => {
    const dayOrderForAll = vi.fn(() => ({ isHoliday: false, periods: 0 }));
    const { total } = computeGridWindowCapacity(week, smes, periodRows, "all", dayOrderForAll, smeSlotStatusAt);
    expect(total).toBe(4);
  });
});

describe("computeMentorGroups", () => {
  const mentorsWithMockDepartments = [
    { id: "m1", name: "Alice", department: "Bsc CS", mentor_group: "" },
    { id: "m2", name: "Bob", department: "Computer Science", mentor_group: "" },
    { id: "m3", name: "Charlie", department: "Data Science", mentor_group: "" },
    { id: "m4", name: "David", department: "Mathematics", mentor_group: "" }
  ];

  it("strictly returns configured subject_groups without leaking mock departments", () => {
    const subjectGroups = [
      { id: "sg_1", name: "CS" },
      { id: "sg_2", name: "Tamil" }
    ];
    const result = computeMentorGroups(mentorsWithMockDepartments, [], subjectGroups);
    expect(result).toEqual(["CS", "Tamil"]);
  });

  it("falls back to mentors' explicit groups when no subject_groups are configured", () => {
    const mentors = [
      { id: "m1", mentor_group: "English" },
      { id: "m2", subject_group: "Physics" }
    ];
    const result = computeMentorGroups(mentors, [], []);
    expect(result).toEqual(["English", "Physics"]);
  });
});
