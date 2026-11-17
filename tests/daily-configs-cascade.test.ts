import { describe, expect, it } from "vitest";
import {
  autoFillWeekFromAnchor,
  cascadeRealignCycle,
  getWeekBoundaries
} from "@/lib/dailyConfigForm";

describe("autoFillWeekFromAnchor", () => {
  const weekDates = [
    "2026-11-16", // Mon
    "2026-11-17", // Tue
    "2026-11-18", // Wed
    "2026-11-19", // Thu
    "2026-11-20", // Fri
    "2026-11-21", // Sat
    "2026-11-22"  // Sun
  ];

  it("continues rest of the week forward and backward when only Wednesday is set as Day 3", () => {
    const existing = [
      { dateStr: "2026-11-18", day_type: "working", day_order: "Day 3" }
    ];

    const plan = autoFillWeekFromAnchor(weekDates, existing, 5);

    expect(plan).toHaveLength(7);
    // Monday and Tuesday should back-propagate
    expect(plan[0].dateStr).toBe("2026-11-16");
    expect(plan[0].dayOrder).toBe("Day 1");
    expect(plan[1].dateStr).toBe("2026-11-17");
    expect(plan[1].dayOrder).toBe("Day 2");

    // Wednesday should preserve Day 3
    expect(plan[2].dateStr).toBe("2026-11-18");
    expect(plan[2].dayOrder).toBe("Day 3");

    // Thursday and Friday should forward-propagate
    expect(plan[3].dateStr).toBe("2026-11-19");
    expect(plan[3].dayOrder).toBe("Day 4");
    expect(plan[4].dateStr).toBe("2026-11-20");
    expect(plan[4].dayOrder).toBe("Day 5");

    // Sat & Sun should be holidays on a 5-day campus
    expect(plan[5].dayType).toBe("holiday");
    expect(plan[5].dayOrder).toBe("None");
    expect(plan[6].dayType).toBe("holiday");
    expect(plan[6].dayOrder).toBe("None");
  });

  it("continues week when Monday is set as Day 1", () => {
    const existing = [
      { dateStr: "2026-11-16", day_type: "working", day_order: "Day 1" }
    ];

    const plan = autoFillWeekFromAnchor(weekDates, existing, 5);
    expect(plan[0].dayOrder).toBe("Day 1");
    expect(plan[1].dayOrder).toBe("Day 2");
    expect(plan[2].dayOrder).toBe("Day 3");
    expect(plan[3].dayOrder).toBe("Day 4");
    expect(plan[4].dayOrder).toBe("Day 5");
    expect(plan[5].dayOrder).toBe("None");
    expect(plan[6].dayOrder).toBe("None");
  });

  it("auto-fills Saturday as Day 6 on a 6-day campus", () => {
    const existing = [
      { dateStr: "2026-11-16", day_type: "working", day_order: "Day 1" }
    ];

    const plan = autoFillWeekFromAnchor(weekDates, existing, 6);
    expect(plan[4].dayOrder).toBe("Day 5");
    expect(plan[5].dayType).toBe("working");
    expect(plan[5].dayOrder).toBe("Day 6");
    expect(plan[6].dayType).toBe("holiday");
    expect(plan[6].dayOrder).toBe("None");
  });
});

describe("cascadeRealignCycle", () => {
  const weekDates = [
    "2026-11-16", // Mon Day 1
    "2026-11-17", // Tue Day 2
    "2026-11-18", // Wed Day 3
    "2026-11-19", // Thu Day 4
    "2026-11-20", // Fri Day 5
    "2026-11-21", // Sat None (holiday)
    "2026-11-22"  // Sun None (holiday)
  ];

  const fullWeekConfigs = [
    { dateStr: "2026-11-16", day_type: "working", day_order: "Day 1" },
    { dateStr: "2026-11-17", day_type: "working", day_order: "Day 2" },
    { dateStr: "2026-11-18", day_type: "working", day_order: "Day 3" },
    { dateStr: "2026-11-19", day_type: "working", day_order: "Day 4" },
    { dateStr: "2026-11-20", day_type: "working", day_order: "Day 5" },
    { dateStr: "2026-11-21", day_type: "holiday", day_order: "None" },
    { dateStr: "2026-11-22", day_type: "holiday", day_order: "None" }
  ];

  it("shifts subsequent days backwards when Tuesday is converted to a Holiday", () => {
    // CAM changes Tuesday (2026-11-17) from Day 2 to Holiday
    const cascaded = cascadeRealignCycle(
      "2026-11-17",
      "holiday",
      "None",
      fullWeekConfigs,
      5,
      weekDates
    );

    const tuesday = cascaded.find(c => c.dateStr === "2026-11-17");
    const wednesday = cascaded.find(c => c.dateStr === "2026-11-18");
    const thursday = cascaded.find(c => c.dateStr === "2026-11-19");
    const friday = cascaded.find(c => c.dateStr === "2026-11-20");

    expect(tuesday?.dayType).toBe("holiday");
    expect(tuesday?.dayOrder).toBe("None");

    // Wednesday should now be Day 2 (shifted backwards from Day 3)
    expect(wednesday?.dayType).toBe("working");
    expect(wednesday?.dayOrder).toBe("Day 2");

    // Thursday should now be Day 3 (shifted backwards from Day 4)
    expect(thursday?.dayType).toBe("working");
    expect(thursday?.dayOrder).toBe("Day 3");

    // Friday should now be Day 4 (shifted backwards from Day 5)
    expect(friday?.dayType).toBe("working");
    expect(friday?.dayOrder).toBe("Day 4");
  });

  it("cascades forward when Tuesday is manually overridden to Day 4", () => {
    const cascaded = cascadeRealignCycle(
      "2026-11-17",
      "working",
      "Day 4",
      fullWeekConfigs,
      5,
      weekDates
    );

    const tuesday = cascaded.find(c => c.dateStr === "2026-11-17");
    const wednesday = cascaded.find(c => c.dateStr === "2026-11-18");
    const thursday = cascaded.find(c => c.dateStr === "2026-11-19");
    const friday = cascaded.find(c => c.dateStr === "2026-11-20");

    expect(tuesday?.dayOrder).toBe("Day 4");
    expect(wednesday?.dayOrder).toBe("Day 5");
    expect(thursday?.dayOrder).toBe("Day 1"); // loops back to Day 1
    expect(friday?.dayOrder).toBe("Day 2");
  });
});
