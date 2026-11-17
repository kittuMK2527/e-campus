import { describe, expect, it } from "vitest";
import {
  predictNextDayOrder,
  getWeekBoundaries,
  parseDayOrder,
  dayOrderCeiling,
  dayOrderOptions,
  autoAdaptDayConfig
} from "@/lib/dailyConfigForm";

describe("predictNextDayOrder", () => {
  it("cycles Day 1 through Day 5 and loops back to Day 1 for a 5-day campus", () => {
    expect(predictNextDayOrder("Day 1", 5)).toBe("Day 2");
    expect(predictNextDayOrder("Day 2", 5)).toBe("Day 3");
    expect(predictNextDayOrder("Day 3", 5)).toBe("Day 4");
    expect(predictNextDayOrder("Day 4", 5)).toBe("Day 5");
    expect(predictNextDayOrder("Day 5", 5)).toBe("Day 1");
  });

  it("cycles Day 1 through Day 6 and loops back to Day 1 for a 6-day campus", () => {
    expect(predictNextDayOrder("Day 1", 6)).toBe("Day 2");
    expect(predictNextDayOrder("Day 5", 6)).toBe("Day 6");
    expect(predictNextDayOrder("Day 6", 6)).toBe("Day 1");
  });

  it("defaults to Day 1 when lastDayOrder is empty or null", () => {
    expect(predictNextDayOrder(null, 5)).toBe("Day 1");
    expect(predictNextDayOrder("", 5)).toBe("Day 1");
    expect(predictNextDayOrder("None", 5)).toBe("Day 1");
  });
});

describe("getWeekBoundaries", () => {
  it("computes the correct Monday to Sunday week for a midweek date", () => {
    // 2026-11-18 is Wednesday
    const bounds = getWeekBoundaries("2026-11-18");
    expect(bounds.startDate).toBe("2026-11-16"); // Monday
    expect(bounds.endDate).toBe("2026-11-22");   // Sunday
    expect(bounds.weekDates).toHaveLength(7);
    expect(bounds.weekDates[0]).toBe("2026-11-16");
    expect(bounds.weekDates[6]).toBe("2026-11-22");
  });

  it("computes the correct Monday to Sunday week when reference is Sunday", () => {
    // 2026-11-22 is Sunday
    const bounds = getWeekBoundaries("2026-11-22");
    expect(bounds.startDate).toBe("2026-11-16");
    expect(bounds.endDate).toBe("2026-11-22");
  });

  it("computes the correct Monday to Sunday week when reference is Monday", () => {
    // 2026-11-16 is Monday
    const bounds = getWeekBoundaries("2026-11-16");
    expect(bounds.startDate).toBe("2026-11-16");
    expect(bounds.endDate).toBe("2026-11-22");
  });
});

describe("autoAdaptDayConfig", () => {
  it("pre-fills existing configuration when target date is already configured", () => {
    const configs = [
      { id: "cfg_1", dateStr: "2026-11-18", day_type: "exam_day", day_order: "Day 3", session_mode: "Offline", notes: "Midterm Exam" }
    ];
    const res = autoAdaptDayConfig("2026-11-18", configs, 5);
    expect(res.isExisting).toBe(true);
    expect(res.dayType).toBe("exam_day");
    expect(res.dayOrder).toBe("Day 3");
    expect(res.notes).toBe("Midterm Exam");
  });

  it("auto-adapts Sunday to holiday / None with weekend notes", () => {
    const res = autoAdaptDayConfig("2026-11-22", [], 5); // 2026-11-22 is Sunday
    expect(res.isExisting).toBe(false);
    expect(res.dayType).toBe("holiday");
    expect(res.dayOrder).toBe("None");
    expect(res.notes).toContain("Sunday Weekend");
  });

  it("auto-adapts Saturday to holiday on a 5-day campus", () => {
    const res = autoAdaptDayConfig("2026-11-21", [], 5); // 2026-11-21 is Saturday
    expect(res.isExisting).toBe(false);
    expect(res.dayType).toBe("holiday");
    expect(res.dayOrder).toBe("None");
  });

  it("auto-adapts Saturday to working on a 6-day campus", () => {
    const configs = [
      { id: "cfg_fri", dateStr: "2026-11-20", day_type: "working", day_order: "Day 5" }
    ];
    const res = autoAdaptDayConfig("2026-11-21", configs, 6);
    expect(res.isExisting).toBe(false);
    expect(res.dayType).toBe("working");
    expect(res.dayOrder).toBe("Day 6");
  });

  it("predicts sequential day order from prior working days", () => {
    const configs = [
      { id: "cfg_mon", dateStr: "2026-11-16", day_type: "working", day_order: "Day 1" }
    ];
    const res = autoAdaptDayConfig("2026-11-17", configs, 5); // Tuesday
    expect(res.isExisting).toBe(false);
    expect(res.dayType).toBe("working");
    expect(res.dayOrder).toBe("Day 2");
  });

  it("loops Day 5 back to Day 1 on a 5-day campus", () => {
    const configs = [
      { id: "cfg_fri", dateStr: "2026-11-20", day_type: "working", day_order: "Day 5" }
    ];
    // Next Monday is 2026-11-23
    const res = autoAdaptDayConfig("2026-11-23", configs, 5);
    expect(res.isExisting).toBe(false);
    expect(res.dayType).toBe("working");
    expect(res.dayOrder).toBe("Day 1");
  });

  it("defaults to Day 1 when no prior configurations exist", () => {
    const res = autoAdaptDayConfig("2026-11-16", [], 5);
    expect(res.isExisting).toBe(false);
    expect(res.dayType).toBe("working");
    expect(res.dayOrder).toBe("Day 1");
  });
});
