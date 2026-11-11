import { describe, it, expect } from "vitest";
import { getQueryRootsForEvent, isEventAuthorizedForClient, RealtimeEnvelope } from "@/lib/realtimeSchema";

describe("Realtime Schema & Authorization Filter", () => {
  it("maps domains to correct TanStack query key roots", () => {
    expect(getQueryRootsForEvent("interviews")).toContain("interviews");
    expect(getQueryRootsForEvent("attendance")).toContain("attendance");
    expect(getQueryRootsForEvent("fees")).toContain("fees");
    expect(getQueryRootsForEvent("exams")).toContain("exams");
    expect(getQueryRootsForEvent("notifications")).toContain("notifications");
  });

  it("strictly restricts PII events by targetUserIds", () => {
    const sensitiveFeeEvent: RealtimeEnvelope = {
      id: 1,
      eventId: "evt_1",
      domain: "fees",
      action: "payment_recorded",
      collegeId: "Clg_TEST",
      targetUserIds: ["stud_123"],
      payload: { studentId: "stud_123", amount: 5000 },
      timestamp: Date.now()
    };

    // Recipient match
    expect(isEventAuthorizedForClient(sensitiveFeeEvent, { userId: "stud_123", role: "student", collegeId: "Clg_TEST" })).toBe(true);

    // Another student from same college should NOT receive it
    expect(isEventAuthorizedForClient(sensitiveFeeEvent, { userId: "stud_999", role: "student", collegeId: "Clg_TEST" })).toBe(false);

    // Admin should not receive targeted PII event if not in targetUserIds
    expect(isEventAuthorizedForClient(sensitiveFeeEvent, { userId: "admin_1", role: "admin", collegeId: "all" })).toBe(false);
  });

  it("enforces tenant college isolation for campus events", () => {
    const campusTimetableEvent: RealtimeEnvelope = {
      id: 2,
      eventId: "evt_2",
      domain: "daily_configs",
      action: "updated",
      collegeId: "Clg_TEST",
      payload: { date: "2026-11-12", dayOrder: 3 },
      timestamp: Date.now()
    };

    // User at same college
    expect(isEventAuthorizedForClient(campusTimetableEvent, { userId: "mentor_1", role: "mentor", collegeId: "Clg_TEST" })).toBe(true);

    // User at different college
    expect(isEventAuthorizedForClient(campusTimetableEvent, { userId: "mentor_2", role: "mentor", collegeId: "Clg_OTHER" })).toBe(false);

    // Admin receives all campus events
    expect(isEventAuthorizedForClient(campusTimetableEvent, { userId: "admin_1", role: "admin", collegeId: "all" })).toBe(true);

    // KAM receives if college is in their portfolio
    expect(isEventAuthorizedForClient(campusTimetableEvent, { userId: "kam_1", role: "kam", collegeId: "all", kamCollegeIds: ["Clg_TEST", "Clg_TEST2"] })).toBe(true);
    expect(isEventAuthorizedForClient(campusTimetableEvent, { userId: "kam_2", role: "kam", collegeId: "all", kamCollegeIds: ["Clg_OTHER"] })).toBe(false);
  });

  it("enforces target roles", () => {
    const lndOnlyEvent: RealtimeEnvelope = {
      id: 3,
      eventId: "evt_3",
      domain: "demos",
      action: "reallocated",
      targetRoles: ["L and D", "sme"],
      payload: { sessionId: "demo_1" },
      timestamp: Date.now()
    };

    expect(isEventAuthorizedForClient(lndOnlyEvent, { userId: "allocator_1", role: "L and D" })).toBe(true);
    expect(isEventAuthorizedForClient(lndOnlyEvent, { userId: "sme_1", role: "sme" })).toBe(true);
    expect(isEventAuthorizedForClient(lndOnlyEvent, { userId: "student_1", role: "student" })).toBe(false);
  });
});

