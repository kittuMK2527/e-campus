import { describe, expect, it } from "vitest";
import { getExamTimeRange, getExamTimelineStatus } from "@/lib/examScheduleTime";

describe("exam schedule time", () => {
  const exam = {
    exam_date: "2026-11-18",
    start_time: "10:00 AM",
    end_time: "01:00 PM",
    session_time: "10:00 AM - 01:00 PM",
  };

  it("uses the institution timezone and start/end boundaries", () => {
    expect(getExamTimelineStatus(exam, new Date("2026-11-18T04:29:00Z"))).toBe("upcoming");
    expect(getExamTimelineStatus(exam, new Date("2026-11-18T04:30:00Z"))).toBe("in_progress");
    expect(getExamTimelineStatus(exam, new Date("2026-11-18T07:30:00Z"))).toBe("completed");
  });

  it("reads legacy session_time ranges when separate times are missing", () => {
    const legacyExam = {
      exam_date: "2026-11-18",
      session_time: "9.00 AM to 12.00 PM",
    };

    expect(getExamTimelineStatus(legacyExam, new Date("2026-11-18T06:29:00Z"))).toBe("in_progress");
    expect(getExamTimelineStatus(legacyExam, new Date("2026-11-18T06:30:00Z"))).toBe("completed");
    expect(getExamTimeRange(legacyExam)).toBe("9.00 AM - 12.00 PM");
  });

  it("preserves cancelled state and displays time ranges consistently", () => {
    expect(getExamTimelineStatus({ ...exam, status: "Cancelled" }, new Date("2026-11-18T08:00:00Z"))).toBe("cancelled");
    expect(getExamTimeRange(exam)).toBe("10:00 AM - 01:00 PM");
  });
});
