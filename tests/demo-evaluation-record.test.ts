import { describe, it, expect } from "vitest";
import {
  buildScoreBreakdown,
  parseScoreBreakdown,
  resolveSessionDisplayScores,
  parseChecklistSnapshot,
  formatEvalTimestamp
} from "../src/lib/demoEvaluationRecord";

describe("demoEvaluationRecord helpers", () => {
  it("builds structured rubric breakdowns with <= 5 max marks caps and decimal scores", () => {
    const breakdown = buildScoreBreakdown(
      [
        { key: "c1", label: "Concept Clarity", max: 5 },
        { key: "c2", label: "Pacing & Time", max: 4.5 },
        { key: "c3", label: "Engagement", max: 8 } // clamped to 5
      ],
      { c1: "4.6", c2: "2.7", c3: "3.5" }
    );

    expect(breakdown.criteria).toEqual([
      { key: "c1", label: "Concept Clarity", score: 4.6, max: 5 },
      { key: "c2", label: "Pacing & Time", score: 2.7, max: 4.5 },
      { key: "c3", label: "Engagement", score: 3.5, max: 5 }
    ]);
    expect(breakdown.totalScored).toBe(10.8);
    expect(breakdown.totalMaxMarks).toBe(14.5);
    expect(breakdown.marksOutOf5).toBe(3.72);
    expect(breakdown.marksNormalized).toBe(74);
  });

  it("parses JSON string and object score_breakdown payloads safely", () => {
    const payload = {
      criteria: [
        { key: "c1", label: "Concept Clarity", score: 4.2, max: 5 },
        { key: "c2", label: "Delivery", score: 2.8, max: 5 }
      ],
      totalScored: 7,
      totalMaxMarks: 10,
      marksOutOf5: 3.5,
      marksNormalized: 70
    };

    expect(parseScoreBreakdown(JSON.stringify(payload))).toEqual(payload);
    expect(parseScoreBreakdown(payload)).toEqual(payload);
    expect(parseScoreBreakdown("not-json{")).toBeNull();
    expect(parseScoreBreakdown(null)).toBeNull();
  });

  it("resolves /5 mark and threshold status for both new breakdown sessions and legacy sessions", () => {
    const withBreakdown = resolveSessionDisplayScores({
      marks: 74,
      score_breakdown: JSON.stringify({
        criteria: [{ key: "c1", label: "Clarity", score: 3.7, max: 5 }],
        totalScored: 3.7,
        totalMaxMarks: 5,
        marksOutOf5: 3.7,
        marksNormalized: 74
      })
    });
    expect(withBreakdown.marksOutOf5).toBe(3.7);
    expect(withBreakdown.marksNormalized).toBe(74);
    expect(withBreakdown.thresholdMet).toBe(true);
    expect(withBreakdown.breakdown?.criteria).toHaveLength(1);

    const legacyPass = resolveSessionDisplayScores({ marks: 70 });
    expect(legacyPass.breakdown).toBeNull();
    expect(legacyPass.marksOutOf5).toBe(3.5);
    expect(legacyPass.thresholdMet).toBe(true);

    const legacyFail = resolveSessionDisplayScores({ marks: 68 });
    expect(legacyFail.breakdown).toBeNull();
    expect(legacyFail.marksOutOf5).toBe(3.4);
    expect(legacyFail.thresholdMet).toBe(false);
  });

  it("parses both Met and Unmet checklist entries without dropping checked items", () => {
    const raw = JSON.stringify([
      { criterionId: "dec_1", label: "Tracker sheet updated", type: "checkbox", met: true },
      { criterionId: "dec_2", label: "Weekly plan submitted", type: "checkbox", met: false },
      { criterionId: "dec_cert", label: "Mentor certification program", type: "checkbox", met: true },
      { invalid: true }
    ]);

    expect(parseChecklistSnapshot(raw)).toEqual([
      { criterionId: "dec_1", label: "Tracker sheet updated", type: "checkbox", met: true },
      { criterionId: "dec_2", label: "Weekly plan submitted", type: "checkbox", met: false },
      { criterionId: "dec_cert", label: "Mentor certification program", type: "checkbox", met: true }
    ]);
    expect(parseChecklistSnapshot("{bad")).toEqual([]);
  });

  it("formats evaluation timestamps gracefully", () => {
    expect(formatEvalTimestamp(null)).toBe("Not recorded");
    expect(formatEvalTimestamp("invalid-date")).toBe("invalid-date");
    const formatted = formatEvalTimestamp("2026-11-26T10:30:00Z");
    expect(formatted.length).toBeGreaterThan(5);
  });
});
