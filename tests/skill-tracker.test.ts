import { describe, it, expect } from "vitest";
import {
  DEMO_PASS_MARK,
  normalizeTopic,
  deriveSubjectType,
  demoStatusToVerdict,
  buildWeekRollup
} from "../src/lib/skillTracker";

describe("normalizeTopic", () => {
  it("lowercases and trims topic strings", () => {
    expect(normalizeTopic("  Intro to DSA ")).toBe("intro to dsa");
    expect(normalizeTopic(null)).toBe("");
    expect(normalizeTopic(undefined)).toBe("");
  });
});

describe("deriveSubjectType", () => {
  it("prefers explicit batch-creation type", () => {
    expect(deriveSubjectType("Some Name", "SKILL")).toBe("Skill");
    expect(deriveSubjectType("Some Name", "academic")).toBe("Academic");
    expect(deriveSubjectType("Some Name", "lab")).toBe("Academic");
  });

  it("falls back to keyword classifier when type is empty", () => {
    expect(deriveSubjectType("Aptitude Training", "")).toBe("Skill");
    expect(deriveSubjectType("Soft Skills", undefined)).toBe("Skill");
    expect(deriveSubjectType("DSA", null)).toBe("Skill");
    expect(deriveSubjectType("Full Stack Development", "")).toBe("Skill");
    expect(deriveSubjectType("Data Structures Lab", "")).toBe("Academic"); // lab excluded
  });

  it("defaults to Academic for unrecognized names", () => {
    expect(deriveSubjectType("Mathematics", "")).toBe("Academic");
    expect(deriveSubjectType("", "")).toBe("Academic");
  });
});

describe("demoStatusToVerdict", () => {
  it("marks completed demos above the pass mark as cleared", () => {
    expect(demoStatusToVerdict("completed", 75)).toEqual({ status: "cleared", score: 75 });
    expect(demoStatusToVerdict("completed", DEMO_PASS_MARK)).toEqual({ status: "cleared", score: DEMO_PASS_MARK });
  });

  it("marks completed demos below the pass mark as not cleared", () => {
    expect(demoStatusToVerdict("completed", 40)).toEqual({ status: "not_cleared", score: 40 });
  });

  it("keeps non-completed demos pending", () => {
    expect(demoStatusToVerdict("scheduled", 90)).toEqual({ status: "pending", score: 90 });
    expect(demoStatusToVerdict("confirmed", null)).toEqual({ status: "pending", score: null });
    expect(demoStatusToVerdict(null, null)).toEqual({ status: "pending", score: null });
  });

  it("respects a custom pass mark", () => {
    expect(demoStatusToVerdict("completed", 55, 60).status).toBe("not_cleared");
    expect(demoStatusToVerdict("completed", 65, 60).status).toBe("cleared");
  });
});

describe("buildWeekRollup", () => {
  const plan = {
    week_number: 3,
    session_plan: JSON.stringify([
      { day: "Monday", topic: "Arrays & Strings", status: "Planned" },
      { day: "Tuesday", topic: "Recursion Basics", status: "Planned" }
    ])
  };

  it("counts planned topics and matches conducted ones from the tracker", () => {
    const tracker = [
      { weekly_plan_week: 3, topic: "arrays & strings" },
      { weekly_plan_week: 3, topic: " Recursion Basics " }
    ];
    const r = buildWeekRollup(plan, [], [], tracker, 3);
    expect(r.topics_planned).toBe(2);
    expect(r.topics_conducted).toBe(2);
    expect(r.verdict).toBe("pending");
  });

  it("ignores tracker rows from other weeks", () => {
    const tracker = [{ weekly_plan_week: 2, topic: "arrays & strings" }];
    const r = buildWeekRollup(plan, [], [], tracker, 3);
    expect(r.topics_conducted).toBe(0);
  });

  it("derives cleared from a completed demo above the pass mark", () => {
    const demos = [{ mentorId: "m1", week: 3, status: "completed", marks: 80, dateStr: "2026-09-10", comments: "Good" }];
    const r = buildWeekRollup(plan, [], demos, [], 3);
    expect(r.verdict).toBe("cleared");
    expect(r.score).toBe(80);
    expect(r.remarks).toBe("Good");
  });

  it("derives not_cleared from a completed demo below the pass mark", () => {
    const demos = [{ mentorId: "m1", week: 3, status: "completed", marks: 30, dateStr: "2026-09-10" }];
    const r = buildWeekRollup(plan, [], demos, [], 3);
    expect(r.verdict).toBe("not_cleared");
  });

  it("manual week-scope verdict overrides the demo verdict", () => {
    const demos = [{ mentorId: "m1", week: 3, status: "completed", marks: 30, dateStr: "2026-09-10" }];
    const clearances = [
      { mentor_id: "m1", subject: "DSA", week_number: 3, scope: "week", status: "cleared", remarks: "Retest passed", verified_by: "SME A" }
    ];
    const r = buildWeekRollup(plan, clearances, demos, [], 3);
    expect(r.verdict).toBe("cleared");
    expect(r.remarks).toBe("Retest passed");
    expect(r.verified_by).toBe("SME A");
  });

  it("marks the week cleared when every planned topic has a topic-scope clearance", () => {
    const clearances = [
      { mentor_id: "m1", subject: "DSA", week_number: 3, scope: "topic", topic: "Arrays & Strings", status: "cleared" },
      { mentor_id: "m1", subject: "DSA", week_number: 3, scope: "topic", topic: "recursion basics", status: "cleared", verified_by: "SME B" }
    ];
    const r = buildWeekRollup(plan, clearances, [], [], 3);
    expect(r.verdict).toBe("cleared");
    expect(r.verified_by).toBe("SME B");
  });

  it("stays pending when only some topics have topic-scope clearances", () => {
    const clearances = [
      { mentor_id: "m1", subject: "DSA", week_number: 3, scope: "topic", topic: "Arrays & Strings", status: "cleared" }
    ];
    const r = buildWeekRollup(plan, clearances, [], [], 3);
    expect(r.verdict).toBe("pending");
  });

  it("handles missing plan (no planned topics, verdict from demo only)", () => {
    const demos = [{ mentorId: "m1", week: 3, status: "completed", marks: 70, dateStr: "2026-09-10" }];
    const r = buildWeekRollup(null, [], demos, [], 3);
    expect(r.topics_planned).toBe(0);
    expect(r.verdict).toBe("cleared");
  });

  it("handles malformed session_plan JSON gracefully", () => {
    const badPlan = { week_number: 3, session_plan: "{not-json" };
    const r = buildWeekRollup(badPlan, [], [], [], 3);
    expect(r.topics_planned).toBe(0);
    expect(r.verdict).toBe("pending");
  });

  it("extracts submission_link from clearance row or weekly plan", () => {
    const clearancesWithLink = [
      { mentor_id: "m1", subject: "DSA", week_number: 3, scope: "week", status: "cleared", submission_link: "https://drive.google.com/test-submission.pdf" }
    ];
    const r1 = buildWeekRollup(plan, clearancesWithLink, [], [], 3);
    expect(r1.submission_link).toBe("https://drive.google.com/test-submission.pdf");

    const planWithLink = { ...plan, submission_link: "https://example.com/sheet.xlsx" };
    const r2 = buildWeekRollup(planWithLink, [], [], [], 3);
    expect(r2.submission_link).toBe("https://example.com/sheet.xlsx");

    const uploadedDocPlan = { ...plan, submission_link: "/uploads/submissions/1715000000_doc_dsa_notes.pdf" };
    const r3 = buildWeekRollup(uploadedDocPlan, [], [], [], 3);
    expect(r3.submission_link).toBe("/uploads/submissions/1715000000_doc_dsa_notes.pdf");
  });

  it("extracts task_given_date from plan start_date, created_at, or clearance", () => {
    const planWithStartDate = { ...plan, start_date: "2026-09-15" };
    const r1 = buildWeekRollup(planWithStartDate, [], [], [], 3);
    expect(r1.task_given_date).toBe("2026-09-15");

    const planWithCreatedAt = { ...plan, created_at: "2026-09-12 10:30:00" };
    const r2 = buildWeekRollup(planWithCreatedAt, [], [], [], 3);
    expect(r2.task_given_date).toBe("2026-09-12");

    const r3 = buildWeekRollup(plan, [], [], [], 3);
    expect(r3.task_given_date).toBeNull();
  });
});
