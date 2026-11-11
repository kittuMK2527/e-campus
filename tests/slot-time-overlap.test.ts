import { describe, it, expect } from "vitest";
import { isTimeSlotOverlap, parseSlotTimeRange } from "@/lib/utils";

describe("BUG-05: Slot time range overlap detection", () => {
  it("parses time range into start and end minutes", () => {
    const range1 = parseSlotTimeRange("09:00 AM - 10:00 AM");
    expect(range1).toEqual({ start: 540, end: 600 });

    const range2 = parseSlotTimeRange("9.25 AM - 10.20 AM");
    expect(range2).toEqual({ start: 565, end: 620 });

    const range3 = parseSlotTimeRange("01:00 PM - 02:00 PM");
    expect(range3).toEqual({ start: 780, end: 840 });
  });

  it("detects exact duplicate slots as overlapping", () => {
    expect(isTimeSlotOverlap("09:00 AM - 10:00 AM", "09:00 AM - 10:00 AM")).toBe(true);
  });

  it("detects partial overlaps between staggered periods (BUG-05 real-world example)", () => {
    // 9.00-10.00 AM vs 9.25-10.20 AM
    expect(isTimeSlotOverlap("09:00 AM - 10:00 AM", "09:25 AM - 10:20 AM")).toBe(true);
    expect(isTimeSlotOverlap("09:25 AM - 10:20 AM", "09:00 AM - 10:00 AM")).toBe(true);
  });

  it("recognizes completely disjoint slots as non-overlapping", () => {
    expect(isTimeSlotOverlap("09:00 AM - 10:00 AM", "10:00 AM - 11:00 AM")).toBe(false);
    expect(isTimeSlotOverlap("09:00 AM - 10:00 AM", "11:00 AM - 12:00 PM")).toBe(false);
    expect(isTimeSlotOverlap("02:00 PM - 03:00 PM", "09:00 AM - 10:00 AM")).toBe(false);
  });

  it("detects subset / fully enclosed periods as overlapping", () => {
    expect(isTimeSlotOverlap("09:00 AM - 12:00 PM", "10:00 AM - 11:00 AM")).toBe(true);
  });
});

