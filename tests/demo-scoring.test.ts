import { describe, it, expect } from "vitest";
import {
  MAX_CRITERION_MARKS,
  roundMarks,
  clampCriterionMax,
  clampCriterionScore,
  calculateScaledMark,
  evaluateThresholdRule
} from "../src/lib/demoScoring";

describe("demoScoring helpers", () => {
  it("caps every criterion max marks at 5 while allowing decimals", () => {
    expect(MAX_CRITERION_MARKS).toBe(5);
    expect(clampCriterionMax(5)).toBe(5);
    expect(clampCriterionMax(10)).toBe(5);
    expect(clampCriterionMax(15)).toBe(5);
    expect(clampCriterionMax("4.6")).toBe(4.6);
    expect(clampCriterionMax("2.7")).toBe(2.7);
    expect(clampCriterionMax(0)).toBe(5);
    expect(clampCriterionMax(-3)).toBe(5);
  });

  it("supports decimal mentor scores without IEEE-754 drift and clamps cleanly", () => {
    expect(clampCriterionScore("2.7", 5)).toBe(2.7);
    expect(clampCriterionScore("4.6", 5)).toBe(4.6);
    expect(roundMarks(2.7 + 4.6)).toBe(7.3);
    expect(clampCriterionScore(6.2, 5)).toBe(5);
    expect(clampCriterionScore(4.2, 3.5)).toBe(3.5);
    expect(clampCriterionScore(-1.5, 5)).toBe(0);
  });

  it("auto-calculates /5 threshold across arbitrary numbers of configured criteria", () => {
    // 4 criteria of max 5 (totalMax = 20), scored 14.0 -> exactly 3.5 / 5 -> Pass
    expect(evaluateThresholdRule(14, 20, 3.5, 5)).toEqual({
      scaledScore: 3.5,
      met: true
    });

    // 12 criteria of max 5 (totalMax = 60), scored 42 -> 3.5 / 5 -> Pass
    expect(evaluateThresholdRule(42, 60, 3.5, 5)).toEqual({
      scaledScore: 3.5,
      met: true
    });

    // 7 criteria of max 5 (totalMax = 35), scored 24.1 -> 3.44 / 5 -> Fail
    expect(evaluateThresholdRule(24.1, 35, 3.5, 5)).toEqual({
      scaledScore: 3.44,
      met: false
    });

    // Decimal max weights: 5 + 4.5 + 3.5 = 13 total, scored 2.7 + 4.6(clamped 4.5) + 3.1 = 10.3 -> 3.96 / 5 -> Pass
    expect(calculateScaledMark(10.3, 13, 5)).toBe(3.96);
    expect(evaluateThresholdRule(10.3, 13, 3.5, 5)).toEqual({
      scaledScore: 3.96,
      met: true
    });
  });
});
