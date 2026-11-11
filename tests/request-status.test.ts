import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  isAwaitingCm,
  isAnyPendingCmRequest,
  isNeedsCmAllocation,
  isInCmQueue,
  isAwaitingCmCapacity,
  cmRequestCategory,
} from "../src/lib/requestStatus";

const camSource = readFileSync("src/components/CAMDashboard.tsx", "utf8");
const mentorSource = readFileSync("src/components/MentorDashboard.tsx", "utf8");
const reviewSource = readFileSync("src/app/api/requests/review/route.ts", "utf8");

describe("CM request status vocabulary", () => {
  it("counts the attendance unlock a mentor requests on the CM", () => {
    expect(isAwaitingCm("pending_cm")).toBe(true);
    expect(isInCmQueue("pending_cm")).toBe(true);
    expect(isAnyPendingCmRequest("pending_cm")).toBe(true);
  });

  it("still counts the legacy cam spellings", () => {
    for (const status of ["pending_cam", "needs_cam_allocation"]) {
      expect(isInCmQueue(status), status).toBe(true);
    }
    expect(isAwaitingCm("pending_cam")).toBe(true);
    expect(isNeedsCmAllocation("needs_cm_allocation")).toBe(true);
    expect(isNeedsCmAllocation("needs_cam_allocation")).toBe(true);
  });

  it("separates colleague-pending from CM-pending", () => {
    expect(isAwaitingCm("pending")).toBe(false);
    expect(isAnyPendingCmRequest("pending")).toBe(true);
    expect(isInCmQueue("pending")).toBe(true);
  });

  it("lets decided requests out of the queue", () => {
    for (const status of ["approved", "rejected", undefined]) {
      expect(isInCmQueue(status), String(status)).toBe(false);
    }
  });

  it("reads both interview capacity spellings", () => {
    expect(isAwaitingCmCapacity("pending_cm_acceptance")).toBe(true);
    expect(isAwaitingCmCapacity("pending_cam_acceptance")).toBe(true);
    expect(isAwaitingCmCapacity("pending")).toBe(false);
  });

  it("labels each approval category from the stored fields", () => {
    expect(cmRequestCategory({ request_type: "late_attendance" })).toBe("Late Attendance");
    expect(cmRequestCategory({ targetStaffId: "cam_approval", slotId: "slot_1" })).toBe("Late Attendance");
    expect(cmRequestCategory({ request_type: "late_punch" })).toBe("Late Punch");
    expect(cmRequestCategory({ slotId: "mentor_daily_punch_2026-11-06_m_1" })).toBe("Late Punch");
    expect(cmRequestCategory({ request_type: "exam_marks_edit" })).toBe("Exam Mark Edit");
    expect(cmRequestCategory({ reason: "Personal / Emergency" })).toBe("Substitution");
  });

  it("keeps the row the requests route writes inside the CM queue", () => {
    const written = readFileSync("src/app/api/requests/route.ts", "utf8");
    expect(written).toContain("'pending_cm'");
    const row = { status: "pending_cm", request_type: "late_attendance" };
    expect(isInCmQueue(row.status)).toBe(true);
    expect(cmRequestCategory(row)).toBe("Late Attendance");
  });

  it("shows the mentor their own request still awaits the CM", () => {
    const handSpelled = (mentorSource + reviewSource).match(
      /\.status\s*[!=]==\s*"(?:pending_cm|pending_cam|needs_cm_allocation|needs_cam_allocation)"/g
    );
    expect(handSpelled ?? []).toEqual([]);
  });
});
