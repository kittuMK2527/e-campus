// ROLE_RENAME cam→cm. Requests are written with the cm spellings (api/requests,
// and migrations.ts rewrites the legacy rows), but older clients still post the
// cam spellings, so every CM comparison has to accept both or its queue silently
// empties. Keep the helper's sets exactly as wide as the tokens in
// context/AppContext.tsx HandoverRequest.status.

const AWAITING_CM = ["pending_cm", "pending_cam"];
const NEEDS_CM_ALLOCATION = ["needs_cm_allocation", "needs_cam_allocation"];
const AWAITING_CM_CAPACITY = ["pending_cm_acceptance", "pending_cam_acceptance"];

/** The CM is the one who must approve or reject. */
export function isAwaitingCm(status?: string): boolean {
  return !!status && AWAITING_CM.includes(status);
}

/** Awaiting the CM plus plain colleague-pending rows the CM also watches. */
export function isAnyPendingCmRequest(status?: string): boolean {
  return status === "pending" || isAwaitingCm(status);
}

/** Waiting on a cover-mentor mapping rather than on an approval decision. */
export function isNeedsCmAllocation(status?: string): boolean {
  return !!status && NEEDS_CM_ALLOCATION.includes(status);
}

/** Everything a CM can still act on. */
export function isInCmQueue(status?: string): boolean {
  return isAnyPendingCmRequest(status) || isNeedsCmAllocation(status);
}

/** An interview whose cover capacity is waiting on the CM's acceptance. */
export function isAwaitingCmCapacity(status?: string): boolean {
  return !!status && AWAITING_CM_CAPACITY.includes(status);
}

/** Approval-list category label, derived from the persisted request fields. */
export function cmRequestCategory(request: {
  request_type?: string;
  reason?: string;
  targetStaffName?: string;
  targetStaffId?: string;
  slotId?: string;
}): "Exam Mark Edit" | "Late Punch" | "Late Attendance" | "Substitution" {
  if (request.request_type === "exam_marks_edit") return "Exam Mark Edit";
  if (
    request.request_type === "late_punch" ||
    request.reason?.includes("Late Mentor Attendance Punch") ||
    request.slotId?.startsWith("mentor_daily_punch_")
  ) {
    return "Late Punch";
  }
  if (
    request.request_type === "late_attendance" ||
    request.reason?.includes("Late Attendance") ||
    request.targetStaffName?.includes("CAM Approval (Late Attendance") ||
    request.targetStaffName?.includes("CM Approval") ||
    ((request.targetStaffId === "cam_approval" || request.targetStaffId === "cm_approval" || request.targetStaffId === "cm-approval" || request.targetStaffId === "cam-approval") &&
      !request.slotId?.startsWith("mentor_daily_punch_") &&
      !request.slotId?.startsWith("acad_log_edit_"))
  ) {
    return "Late Attendance";
  }
  return "Substitution";
}

/** Check if a handover request or approved handover corresponds to a late attendance edit approval. */
export function isLateAttendanceRequest(request: {
  request_type?: string;
  reason?: string;
  targetStaffName?: string;
  targetStaffId?: string;
  coverStaffName?: string;
  coverStaffId?: string;
  slotId?: string;
  course?: string;
} | null | undefined): boolean {
  if (!request) return false;
  if (request.request_type === "late_attendance") return true;
  if (request.slotId?.startsWith("mentor_daily_punch_") || request.slotId?.startsWith("acad_log_edit_")) return false;
  const targetId = (request.targetStaffId || request.coverStaffId || "").toLowerCase();
  if (targetId === "cm_approval" || targetId === "cam_approval" || targetId === "cm-approval" || targetId === "cam-approval") return true;
  const targetName = (request.targetStaffName || request.coverStaffName || "").toLowerCase();
  if (targetName.includes("late attendance") || targetName.includes("cm approval") || targetName.includes("cam approval")) return true;
  const reason = (request.reason || "").toLowerCase();
  if (reason.includes("late attendance")) return true;
  const course = (request.course || "").toLowerCase();
  if (course.includes("late attendance")) return true;
  return false;
}
