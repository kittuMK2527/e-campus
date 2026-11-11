import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_DAY_TYPES,
  dayOrderCeiling,
  dayOrderOptions,
  isCanonicalDayType,
  normalizeDayType,
  parseDayOrder
} from "@/lib/dailyConfigForm";

const panelSource = readFileSync(join(process.cwd(), "src/components/CAMDashboard.tsx"), "utf8");

describe("day type folds onto the picker vocabulary", () => {
  it("maps the legacy aliases onto an option that actually exists", () => {
    expect(normalizeDayType("regular")).toBe("working");
    expect(normalizeDayType("Exam")).toBe("exam_day");
    expect(normalizeDayType("event day")).toBe("event");
    expect(normalizeDayType("OFF")).toBe("holiday");
  });

  it("leaves a type the picker never offered untouched instead of renaming it", () => {
    expect(normalizeDayType("sabbatical")).toBe("sabbatical");
    expect(isCanonicalDayType("sabbatical")).toBe(false);
    expect(isCanonicalDayType("exam_day")).toBe(true);
    expect(CANONICAL_DAY_TYPES).not.toContain("regular");
  });

  it("treats a missing type as a working day", () => {
    expect(normalizeDayType(null)).toBe("working");
    expect(normalizeDayType("   ")).toBe("working");
  });
});

describe("day order options always cover the loaded record", () => {
  it("caps a new range at the campus working days", () => {
    expect(dayOrderOptions(dayOrderCeiling(5, "Day 3"))).toEqual([
      "Day 1",
      "Day 2",
      "Day 3",
      "Day 4",
      "Day 5"
    ]);
  });

  it("widens to a stored Day 6 on a five day campus instead of hiding it", () => {
    expect(dayOrderCeiling(5, "Day 6")).toBe(6);
    expect(dayOrderOptions(dayOrderCeiling(5, "Day 6"))).toContain("Day 6");
  });

  it("falls back to a five day week before the campus config lands", () => {
    expect(dayOrderCeiling(0, "None")).toBe(5);
  });

  it("bounds a corrupt order so the option list cannot explode", () => {
    expect(dayOrderCeiling(5, "Day 41")).toBe(7);
  });

  it("reads only the Day N shape the engine understands", () => {
    expect(parseDayOrder("Day 6")).toBe(6);
    expect(parseDayOrder("None")).toBe(0);
    expect(parseDayOrder(undefined)).toBe(0);
  });
});

describe("the configurator stops overwriting the record it loaded", () => {
  it("skips the campus clamp while a record is being edited", () => {
    expect(panelSource).toMatch(/if \(editingDailyId\) return;/);
  });

  it("builds the Day Order list from the campus ceiling rather than a fixed six", () => {
    expect(panelSource).toContain("{dayOrderOptions(dailyOrderCeiling).map((order) => (");
    expect(panelSource).not.toMatch(/<option value="Day 6">Day 6<\/option>/);
  });

  it("scrolls the dialog to the form the pencil just filled", () => {
    expect(panelSource).toMatch(/getElementById\("daily-config-form"\)\?\.closest\("\[role=dialog\]"\)/);
  });

  it("returns the whole form to create defaults, not just notes", () => {
    const cancel = panelSource.match(/const handleCancelDailyEdit = \(\) => \{[\s\S]*?\n {2}\};/);
    expect(cancel?.[0]).toContain("resetDailyConfigForm();");
    expect(panelSource).toMatch(/const resetDailyConfigForm = \(\) => \{[\s\S]*?setDailyDeptScope\("All Departments"\);/);
  });
});
