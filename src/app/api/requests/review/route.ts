export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { applyHandoverDateCorrection, correctStaleHandoverDate } from "@/lib/handoverDates";
import { generateId } from "@/lib/id";
import { isInCmQueue, isAwaitingCm } from "@/lib/requestStatus";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";
import { isTimeSlotOverlap } from "@/lib/utils";
import { canActOnCollege, resolveRequestCollegeId, actorRoleLabel, StaleStateError } from "@/lib/requestScope";

/** Statuses a CM reassignment may still act on (legacy cam spellings included). */
const REASSIGNABLE_STATUSES = ["pending", "pending_cm", "pending_cam", "needs_cm_allocation", "needs_cam_allocation"];

/**
 * True when `mentorId` already covers another class that overlaps `time` on `dateStr`
 * (approved covers are date-specific, so the weekly timetable check alone misses them).
 */
async function findCoverClash(db: any, mentorId: string, dateStr: string | null | undefined, time: string, excludeRequestId: string) {
  if (!mentorId || !dateStr || !time) return null;
  const covers = await db.all(
    `SELECT ah.course, s.time FROM approved_handovers ah JOIN slots s ON s.id = ah.slotId
     WHERE ah.coverStaffId = ? AND ah.dateStr = ? AND (ah.requestId IS NULL OR ah.requestId != ?)`,
    [mentorId, dateStr, excludeRequestId]
  );
  return covers.find((c: any) => isTimeSlotOverlap(c.time, time)) || null;
}

// Approving or rejecting a handover mutates the schedule and notifies the
// requestor by email, so it cannot stay reachable without a session.
export async function POST(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["cm", "kam", "mentor", "admin"]
  });
  if (errorResponse) return errorResponse;

  const actorRoleFromAuth = (auth?.user?.role || "").toLowerCase();
  const isRealAdmin = actorRoleFromAuth === "admin" || actorRoleFromAuth === "super admin";

  try {
    const db = await getDb();
    const body = await request.json();
    const { requestId, status, headerReason, approverName, actorRole, course, action, targetStaffId: newTargetStaffId } = body;

    if (!requestId) {
      return NextResponse.json({ success: false, message: "Missing required requestId" }, { status: 400 });
    }

    // The request row and the proposed cover faculty both key off the body, so they
    // share one round trip. A failed slice must not read as "request not found":
    // everything below writes on the strength of these two rows.
    const needsCoverStaff = (action === "cm_reassign" || action === "cam_reassign") && Boolean(newTargetStaffId);
    const reviewFailures: QueryFailure[] = [];
    const [requestRows, coverStaffRows] = await db.multiQuery(
      [
        { sql: "SELECT * FROM handover_requests WHERE id = ?", params: [requestId] },
        needsCoverStaff
          ? { sql: "SELECT * FROM mentors WHERE id = ?", params: [newTargetStaffId] }
          : { sql: "SELECT 1 WHERE 1=0" },
      ],
      reviewFailures
    );
    if (reviewFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not load the handover request. Please try again." }, { status: 500 });
    }

    const handoverRequest = requestRows[0];

    if (!handoverRequest) {
      return NextResponse.json({ success: false, message: "Handover request not found" }, { status: 404 });
    }

    // Audit identity comes from the verified session; body fields are only a fallback label.
    const cleanApproverName = auth?.user?.name || approverName || "System User";
    const cleanActorRole = actorRoleLabel(auth?.user?.role) || actorRole || "User";

    // Campus scope applies to every action on this request, not just reassignment.
    // Mentors are scoped below by being the requestor or the addressed cover.
    if (actorRoleFromAuth !== "mentor" && !isRealAdmin) {
      const requestCollegeId = await resolveRequestCollegeId(db, handoverRequest);
      if (!(await canActOnCollege(db, auth!.user, requestCollegeId))) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: This request belongs to a campus outside your scope." },
          { status: 403 }
        );
      }
    }

    // 1. CM Direct Reassignment / Allocation of a Free Mentor
    if ((action === "cm_reassign" || action === "cam_reassign") && newTargetStaffId) {
      // BUG-08: Mentors cannot perform CM direct reassignments
      if (actorRoleFromAuth === "mentor") {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Mentors cannot perform Campus Manager reassignments." },
          { status: 403 }
        );
      }

      if (!REASSIGNABLE_STATUSES.includes(String(handoverRequest.status || ""))) {
        return NextResponse.json(
          { success: false, message: "This request has already been processed and cannot be reassigned." },
          { status: 409 }
        );
      }

      const newCoverStaff = coverStaffRows[0];
      if (!newCoverStaff) {
        return NextResponse.json({ success: false, message: "Selected cover faculty not found" }, { status: 404 });
      }

      // BUG-07: Prevent assigning a cover mentor who is already scheduled to teach at this time
      const targetSlot = handoverRequest.slotId
        ? await db.get("SELECT day, time FROM slots WHERE id = ?", [handoverRequest.slotId])
        : null;
      const targetDay = handoverRequest.day || targetSlot?.day;
      const targetTime = handoverRequest.time || targetSlot?.time;

      if (targetDay && targetTime) {
        const coverMentorSlots = await db.all(
          "SELECT course, time FROM slots WHERE mentorId = ? AND day = ?",
          [newCoverStaff.id, targetDay]
        );
        const teachingClash = coverMentorSlots.find((s: any) => isTimeSlotOverlap(s.time, targetTime));
        if (teachingClash) {
          return NextResponse.json({
            success: false,
            message: `Conflict: ${newCoverStaff.name} is already scheduled to teach "${teachingClash.course}" at [${targetDay}, ${teachingClash.time}].`
          }, { status: 409 });
        }
        const coverClash = await findCoverClash(db, newCoverStaff.id, handoverRequest.dateStr, targetTime, requestId);
        if (coverClash) {
          return NextResponse.json({
            success: false,
            message: `Conflict: ${newCoverStaff.name} is already covering "${coverClash.course}" at ${coverClash.time} on ${handoverRequest.dateStr}.`
          }, { status: 409 });
        }
      }

      const handoverId = generateId("h");
      const logId = generateId("l");

      // The request row, the ledger row and the audit trail are one decision. Split
      // across autocommitted statements, a failure mid-way left the request approved
      // with no handover to show for it (or vice versa) and the ledger short by a class.
      try {
      await db.transaction(async (tx) => {
        // Conditional on the status we read: a second click / concurrent approver
        // matches no row and the whole decision rolls back (no duplicate ledger row).
        const flip = await tx.run(
          `UPDATE handover_requests 
           SET targetStaffId = ?, targetStaffName = ?, status = 'approved', approvedBy = ?, headerReason = ?
           WHERE id = ? AND status = ?`,
          [newCoverStaff.id, newCoverStaff.name, cleanApproverName, `Assigned by CM ${cleanApproverName}`, requestId, handoverRequest.status]
        );
        if (flip.changes !== 1) throw new StaleStateError();

        await tx.run(
          `INSERT INTO approved_handovers (id, requestId, slotId, dateStr, originalMentorId, coverStaffId, coverStaffName, course, ledger_month) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            handoverId,
            requestId,
            handoverRequest.slotId,
            handoverRequest.dateStr,
            handoverRequest.requestorId,
            newCoverStaff.id,
            newCoverStaff.name,
            course || handoverRequest.course,
            handoverRequest.dateStr.slice(0, 7),
          ]
        );

        await tx.run(
          "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
          [
            logId,
            "handover_approval",
            `CM Assigned Cover: ${cleanApproverName} mapped "${handoverRequest.course}" on ${handoverRequest.dateFormatted} to ${newCoverStaff.name}`,
            cleanApproverName,
            cleanActorRole,
            new Date().toISOString(),
          ]
        );
      });
      } catch (err) {
        if (err instanceof StaleStateError) {
          return NextResponse.json({ success: false, message: err.message }, { status: 409 });
        }
        throw err;
      }

      // DATA_FLOW_AUDIT D3: return the created handover row so the client patches
      // state with the authoritative DB values.
      const createdHandover = await db.get("SELECT * FROM approved_handovers WHERE id = ?", handoverId);
      return NextResponse.json({ success: true, message: `Class successfully assigned to ${newCoverStaff.name}!`, handover: createdHandover || null });
    }

    if (!isInCmQueue(handoverRequest.status)) {
      return NextResponse.json({ success: false, message: "Request has already been processed" });
    }

    if (handoverRequest.request_type === "exam_marks_edit") {
      if (actorRoleFromAuth === "mentor") {
        return NextResponse.json(
          { success: false, message: "Exam mark modification requests can only be reviewed by Campus Managers or Admins." },
          { status: 403 }
        );
      }
      const targetStatus = status === "approved" ? "approved" : "rejected";

      // Resolve the mark/grade before opening the transaction so the write set is
      // decided up front and nothing can half-apply.
      let approvedMark: { mark: number; grade: string } | null = null;
      if (status === "approved") {
        // Parse proposed mark from reason (e.g. "Proposed Mark: 45")
        const proposedMatch = (handoverRequest.reason || "").match(/Proposed Mark:\s*([\d.]+)/i);
        const proposedMark = proposedMatch ? parseFloat(proposedMatch[1]) : null;
        if (proposedMark !== null && !isNaN(proposedMark)) {
          const exam = await db.get("SELECT * FROM exam_schedules WHERE id = ?", [handoverRequest.slotId]);
          const maxMarks = exam?.max_marks || 50;
          const passingMarks = exam?.passing_marks || (maxMarks * 0.4);
          let grade = "F";
          const pct = (proposedMark / maxMarks) * 100;
          if (pct >= 90) grade = "O";
          else if (pct >= 80) grade = "A+";
          else if (pct >= 70) grade = "A";
          else if (pct >= 60) grade = "B+";
          else if (pct >= 50) grade = "B";
          else if (proposedMark >= passingMarks) grade = "C";
          else grade = "RA / F";
          approvedMark = { mark: proposedMark, grade };
        }
      }

      // Approving the request and writing the mark are the same act; an error on the
      // second left a request marked approved whose mark never changed.
      try {
      await db.transaction(async (tx) => {
        const flip = await tx.run(
          "UPDATE handover_requests SET status = ?, headerReason = ?, approvedBy = ? WHERE id = ? AND status = ?",
          [targetStatus, headerReason || null, cleanApproverName, requestId, handoverRequest.status]
        );
        if (flip.changes !== 1) throw new StaleStateError();

        if (approvedMark) {
          await tx.run(
            `UPDATE student_exam_marks 
             SET marks_obtained = ?, is_absent = 0, grade = ?, updated_at = CURRENT_TIMESTAMP, remarks = ?
             WHERE exam_id = ? AND student_id = ?`,
            [
              approvedMark.mark,
              approvedMark.grade,
              `CM Approved (${cleanApproverName}): ${headerReason || "Mark Updated"}`,
              handoverRequest.slotId,
              handoverRequest.targetStaffId,
            ]
          );
        }
      });
      } catch (err) {
        if (err instanceof StaleStateError) {
          return NextResponse.json({ success: false, message: err.message }, { status: 409 });
        }
        throw err;
      }

      return NextResponse.json({ success: true, message: `Exam mark modification request ${status} successfully!` });
    }

    const isMetaOrCamRequest =
      handoverRequest.targetStaffId === "cm_approval" ||
      handoverRequest.targetStaffId === "CM-APPROVAL" ||
      handoverRequest.targetStaffId === "cam_approval" ||
      handoverRequest.targetStaffId === "CAM-APPROVAL" ||
      handoverRequest.targetStaffId === "cm" ||
      handoverRequest.targetStaffId === "cam" ||
      handoverRequest.request_type === "late_attendance" ||
      handoverRequest.request_type === "late_punch" ||
      handoverRequest.request_type === "acad_log_edit" ||
      (handoverRequest.targetStaffName && (handoverRequest.targetStaffName.includes("CM Approval") || handoverRequest.targetStaffName.includes("CAM Approval"))) ||
      (handoverRequest.slotId && handoverRequest.slotId.startsWith("mentor_daily_punch_")) ||
      (handoverRequest.slotId && handoverRequest.slotId.startsWith("acad_log_edit_"));

    if (actorRoleFromAuth === "mentor") {
      const isTarget =
        auth?.user?.reference_id === handoverRequest.targetStaffId ||
        auth?.user?.id === handoverRequest.targetStaffId;
      const isRequestor =
        auth?.user?.reference_id === handoverRequest.requestorId ||
        auth?.user?.id === handoverRequest.requestorId;

      if (!isTarget && !isRequestor) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Mentors can only review handovers addressed to them." },
          { status: 403 }
        );
      }

      // WF-P12 / BUG-08: Mentors can NEVER approve their own handover requests
      if (status === "approved" && isRequestor && !isTarget) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Mentors cannot approve their own handover requests." },
          { status: 403 }
        );
      }

      // Mentors can NEVER approve administrative / meta requests
      if (isMetaOrCamRequest) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Administrative requests can only be approved by Campus Managers." },
          { status: 403 }
        );
      }
    }

    let targetStatus = status; // e.g. "approved" or "rejected"
    if (isAwaitingCm(handoverRequest.status)) {
      if (isMetaOrCamRequest) {
        // Direct CM requests (late attendance edit, punch request, acad log edit) are directly approved or rejected by CM
        targetStatus = status === "approved" ? "approved" : "rejected";
      } else if (status === "approved") {
        targetStatus = "pending"; // Escalate normal emergency peer handover to receiver
      } else {
        targetStatus = "rejected"; // Reject outright
      }
    }

    // BUG-07: Prevent approving a handover if the cover mentor has a timetable clash
    if (status === "approved" && handoverRequest.status === "pending") {
      const coverStaffId = handoverRequest.request_type === "swap_compensate"
        ? handoverRequest.requestorId
        : handoverRequest.targetStaffId;
      const targetSlot = handoverRequest.slotId
        ? await db.get("SELECT day, time FROM slots WHERE id = ?", [handoverRequest.slotId])
        : null;
      const targetDay = handoverRequest.day || targetSlot?.day;
      const targetTime = handoverRequest.time || targetSlot?.time;

      if (coverStaffId && targetDay && targetTime) {
        const coverMentorSlots = await db.all(
          "SELECT course, time FROM slots WHERE mentorId = ? AND day = ?",
          [coverStaffId, targetDay]
        );
        const teachingClash = coverMentorSlots.find((s: any) => isTimeSlotOverlap(s.time, targetTime));
        if (teachingClash) {
          const coverName = handoverRequest.request_type === "swap_compensate"
            ? handoverRequest.requestorName
            : handoverRequest.targetStaffName;
          return NextResponse.json({
            success: false,
            message: `Conflict: ${coverName || 'Cover faculty'} is already scheduled to teach "${teachingClash.course}" at [${targetDay}, ${teachingClash.time}]. Cannot double-book.`
          }, { status: 409 });
        }
        const coverClash = await findCoverClash(db, coverStaffId, handoverRequest.dateStr || handoverRequest.datestr, targetTime, requestId);
        if (coverClash) {
          return NextResponse.json({
            success: false,
            message: `Conflict: this faculty is already covering "${coverClash.course}" at ${coverClash.time} on that date. Cannot double-book.`
          }, { status: 409 });
        }
      }
    }

    // The status flip, the parent-leave linkage, the ledger row and the audit entry
    // describe one decision. Committed separately, a failure mid-way left the request
    // approved with no handover row behind it, or the parent leave approved with a
    // cover missing from the ledger.
    let createdHandoverId: string | null = null;

    try {
    await db.transaction(async (tx) => {
      const flip = await tx.run(
        "UPDATE handover_requests SET status = ?, headerReason = ?, approvedBy = ? WHERE id = ? AND status = ?",
        [targetStatus, headerReason || null, cleanApproverName, requestId, handoverRequest.status]
      );
      if (flip.changes !== 1) throw new StaleStateError();

      // If this is a late attendance / meta request, also resolve any duplicate pending requests for the same session
      if (isMetaOrCamRequest && handoverRequest.requestorId && handoverRequest.slotId && (handoverRequest.dateStr || handoverRequest.datestr)) {
        const dStr = handoverRequest.dateStr || handoverRequest.datestr;
        await tx.run(
          "UPDATE handover_requests SET status = ?, headerReason = ?, approvedBy = ? WHERE requestorId = ? AND slotId = ? AND (dateStr = ? OR datestr = ?) AND id != ? AND status IN ('pending', 'pending_cm', 'pending_cam')",
          [targetStatus, headerReason || null, cleanApproverName, handoverRequest.requestorId, handoverRequest.slotId, dStr, dStr, requestId]
        );
      }

      // If this is an approved academic log edit request, update the academic tracker row
      if (status === "approved" && handoverRequest.slotId && handoverRequest.slotId.startsWith("acad_log_edit_")) {
        const logId = handoverRequest.slotId.replace("acad_log_edit_", "");
        const topicMatch = (handoverRequest.reason || "").match(/Proposed Topic:\s*([^|]+)/i);
        const remarksMatch = (handoverRequest.reason || "").match(/Proposed Remarks:\s*([^|]+)/i);
        const newTopic = topicMatch ? topicMatch[1].trim() : null;
        const newRemarks = remarksMatch ? remarksMatch[1].trim() : null;
        if (logId && (newTopic !== null || newRemarks !== null)) {
          const updateSets: string[] = [];
          const updateParams: any[] = [];
          if (newTopic !== null) { updateSets.push("topic = ?"); updateParams.push(newTopic); }
          if (newRemarks !== null) { updateSets.push("comments = ?"); updateParams.push(newRemarks); }
          updateSets.push("updated_at = ?"); updateParams.push(new Date().toISOString());
          updateParams.push(logId);
          await tx.run(`UPDATE academic_tracker SET ${updateSets.join(", ")} WHERE id = ?`, updateParams);
        }
      }

      // If this is a leave cover linked to faculty_leave_requests, link and update parent leave
      if (handoverRequest.compensates_handover_id) {
        const parentLeaveId = handoverRequest.compensates_handover_id;

        // The date heal that used to run on every GET belongs here: fixing the row
        // at the moment the cover is actioned keeps approved_handovers on the same day.
        const parentLeave = await tx.get(
          "SELECT start_date FROM faculty_leave_requests WHERE id = ?",
          [parentLeaveId]
        );
        const correction = correctStaleHandoverDate(
          handoverRequest.dateStr || handoverRequest.datestr,
          parentLeave?.start_date
        );
        if (correction) {
          await tx.run(
            "UPDATE handover_requests SET datestr = ?, dateformatted = ? WHERE id = ?",
            [correction.datestr, correction.dateformatted, handoverRequest.id]
          );
          await tx.run(
            "UPDATE approved_handovers SET datestr = ? WHERE requestid = ?",
            [correction.datestr, handoverRequest.id]
          );
          applyHandoverDateCorrection(handoverRequest, correction);
        }

        if (status === "approved") {
          const siblingCovers = await tx.all(
            "SELECT id, status, targetStaffName, targetstaffname FROM handover_requests WHERE compensates_handover_id = ?",
            [parentLeaveId]
          );
          const allApproved = siblingCovers.length > 0 && siblingCovers.every(
            (c: any) => c.id === requestId || c.status === "approved"
          );

          if (allApproved) {
            const leaveReq = await tx.get(
              "SELECT * FROM faculty_leave_requests WHERE id = ?",
              [parentLeaveId]
            );
            if (leaveReq) {
              const coverNames = Array.from(new Set([
                ...siblingCovers.map((c: any) => c.targetStaffName || c.targetstaffname).filter(Boolean),
                cleanApproverName
              ])).join(", ");
              const approverTag = `Cover Approved (${coverNames || cleanApproverName})`;

              await tx.run(
                `UPDATE faculty_leave_requests 
                 SET status = 'approved', approved_by = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [approverTag, parentLeaveId]
              );

              // Automatically sync mentor_attendance for the leave period. One multi-row
              // upsert instead of one round trip per day: a 3-week leave used to cost
              // 21 queries, and a malformed end_date could spin the loop for years.
              const leaveDays: string[] = [];
              const [sY, sM, sD] = String(leaveReq.start_date).split("-").map(Number);
              const [eY, eM, eD] = String(leaveReq.end_date || leaveReq.start_date).split("-").map(Number);
              const cursor = new Date(sY, sM - 1, sD, 12, 0, 0);
              const end = new Date(eY, eM - 1, eD, 12, 0, 0);
              while (cursor <= end && leaveDays.length < 366) {
                const year = cursor.getFullYear();
                const month = String(cursor.getMonth() + 1).padStart(2, "0");
                const day = String(cursor.getDate()).padStart(2, "0");
                leaveDays.push(`${year}-${month}-${day}`);
                cursor.setDate(cursor.getDate() + 1);
              }
              if (cursor <= end) {
                console.warn(`Leave ${parentLeaveId} spans more than 366 days; attendance synced for the first 366 only.`);
              }

              const attStatus = leaveReq.request_type === "OD" ? "OD" : "Leave";
              const attReason = `${leaveReq.request_type}: ${leaveReq.reason || "Leave Approved"} (Covered by ${cleanApproverName})`;
              const DAY_CHUNK = 200;
              for (let i = 0; i < leaveDays.length; i += DAY_CHUNK) {
                const chunk = leaveDays.slice(i, i + DAY_CHUNK);
                const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, 'cover_approval', ?, CURRENT_TIMESTAMP)").join(", ");
                const params: any[] = [];
                for (const d of chunk) {
                  params.push(`att_${leaveReq.mentor_id}_${d}`, leaveReq.mentor_id, leaveReq.college_id, d, attStatus, attReason, approverTag);
                }
                await tx.run(
                  `INSERT INTO mentor_attendance (id, mentor_id, college_id, date_str, status, reason, marked_by, marked_by_id, updated_at)
                   VALUES ${placeholders}
                   ON CONFLICT(mentor_id, date_str) DO UPDATE SET
                   status = excluded.status,
                   reason = excluded.reason,
                   marked_by = excluded.marked_by,
                   marked_by_id = excluded.marked_by_id,
                   updated_at = CURRENT_TIMESTAMP`,
                  params
                );
              }

              // Auto-flag affected demo sessions for L&D / SME reallocation
              try {
                const sDate = String(leaveReq.start_date).slice(0, 10);
                const eDate = String(leaveReq.end_date || leaveReq.start_date).slice(0, 10);
                const affectedDemos = await tx.all(
                  `SELECT * FROM demo_sessions 
                   WHERE mentorId = ? AND dateStr >= ? AND dateStr <= ? 
                     AND status IN ('scheduled', 'confirmed')`,
                  [leaveReq.mentor_id, sDate, eDate]
                );
                for (const ds of affectedDemos || []) {
                  const existingReq = await tx.get(
                    "SELECT id FROM demo_reallocation_requests WHERE demo_session_id = ? AND status = 'pending'",
                    [ds.id]
                  );
                  if (!existingReq) {
                    const reqId = generateId("drr");
                    await tx.run(
                      `INSERT INTO demo_reallocation_requests (
                        id, demo_session_id, leave_request_id, mentor_id, mentor_name,
                        sme_id, sme_name, subject, stream, week,
                        original_date_str, original_time_slot, proposed_date_str, proposed_time_slot,
                        reason, status, proposed_by, created_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
                      [
                        reqId, ds.id, parentLeaveId, ds.mentorId, ds.mentorName,
                        ds.smeId, ds.smeName, ds.subject, ds.stream, ds.week,
                        ds.dateStr, ds.timeSlot, ds.dateStr, ds.timeSlot,
                        `Mentor on approved leave (${sDate} to ${eDate})`,
                        cleanApproverName || "Approver"
                      ]
                    );
                  }
                  await tx.run(
                    "UPDATE demo_sessions SET status = 'reallocation_required' WHERE id = ?",
                    [ds.id]
                  );
                  if (ds.smeId) {
                    await dispatchSystemNotification(tx, {
                      userIds: [ds.smeId],
                      title: "L&D Session Reallocation Required",
                      message: `Mentor ${ds.mentorName} is on approved faculty leave on ${ds.dateStr}. Session for ${ds.subject} requires reallocation.`,
                      type: "alert",
                      link: "/sme?tab=reallocation",
                      domain: "demos",
                      action: "reallocated",
                      dedupeKey: `demo:${ds.id}:leave-reallocation-required`,
                      payload: { sessionId: ds.id, leaveRequestId: requestId },
                    }).catch(() => {});
                  }
                }
              } catch (demoSyncErr) {
                console.warn("[requests/review] Demo reallocation sync failed:", demoSyncErr);
              }
            }
          }
        } else if (status === "rejected") {
          await tx.run(
            `UPDATE faculty_leave_requests 
             SET rejection_reason = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [`Cover declined by ${cleanApproverName}: ${headerReason || 'No reason specified'}`, parentLeaveId]
          );
        }
      }

      // If Approved and it was already at 'pending' stage, create ApprovedHandover mapping
      if (status === "approved" && handoverRequest.status === "pending") {
        createdHandoverId = generateId("h");

        if (handoverRequest.request_type === "swap_compensate") {
          // Swap compensate: the requestor is covering FOR the target (reversed roles)
          // originalMentor = targetStaff (they "originally" had it owed), cover = requestor (paying it back)
          await tx.run(
            `INSERT INTO approved_handovers (id, requestId, slotId, dateStr, originalMentorId, coverStaffId, coverStaffName, course, ledger_month)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              createdHandoverId,
              requestId,
              handoverRequest.slotId,
              handoverRequest.dateStr,
              handoverRequest.targetStaffId,   // creditor is "original"
              handoverRequest.requestorId,     // debtor is "cover" (paying back)
              handoverRequest.requestorName,
              handoverRequest.original_subject || course || handoverRequest.course,
              handoverRequest.original_month || handoverRequest.dateStr.slice(0, 7),
            ]
          );
        } else {
          // Normal handover
          await tx.run(
            `INSERT INTO approved_handovers (id, requestId, slotId, dateStr, originalMentorId, coverStaffId, coverStaffName, course, ledger_month) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              createdHandoverId,
              requestId,
              handoverRequest.slotId,
              handoverRequest.dateStr,
              handoverRequest.requestorId,
              handoverRequest.targetStaffId,
              handoverRequest.targetStaffName,
              course || handoverRequest.course,
              handoverRequest.dateStr.slice(0, 7),
            ]
          );
        }
      }

      // Log Audit Event
      const actionVerb = cleanActorRole === "Mentor"
        ? (status === "approved" ? "Accepted" : "Rejected")
        : (status === "approved" ? "Approved" : "Rejected");

      const auditDesc = status === "approved"
        ? `${actionVerb} Class Handover: ${handoverRequest.requestorName} handed over "${handoverRequest.course}" on ${handoverRequest.dateFormatted} to ${handoverRequest.targetStaffName}`
        : `${actionVerb} Class Handover: ${handoverRequest.requestorName}'s handover of "${handoverRequest.course}" on ${handoverRequest.dateFormatted} to ${handoverRequest.targetStaffName} - Reason: "${headerReason || 'No reason specified'}"`;

      await tx.run(
        "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        [
          generateId("l"),
          status === "approved" ? "handover_approval" : "handover_rejection",
          auditDesc,
          cleanApproverName,
          cleanActorRole,
          new Date().toISOString(),
        ]
      );
    });
    } catch (err) {
      if (err instanceof StaleStateError) {
        return NextResponse.json({ success: false, message: err.message }, { status: 409 });
      }
      throw err;
    }

    // Realtime notification dispatch to requestor and target cover staff
    try {
      const decisionTitle = status === "approved" ? "Handover Request Approved" : "Handover Request Declined";
      const decisionMessage = `${cleanApproverName} ${status === "approved" ? "approved" : "declined"} the handover request for "${handoverRequest.course}" on ${handoverRequest.dateFormatted}.${headerReason ? ` Reason: ${headerReason}` : ""}`;
      await dispatchSystemNotification(db, {
        userIds: [handoverRequest.requestorId, handoverRequest.targetStaffId].filter(Boolean),
        roles: ["admin"],
        title: decisionTitle,
        message: decisionMessage,
        link: "/mentor?tab=handovers",
        type: status === "approved" ? "success" : "error",
        domain: "notifications",
        action: "created",
        dedupeKey: `handover:${requestId}:${targetStatus}`,
        payload: {
          requestId,
          status: targetStatus,
          slotId: handoverRequest.slotId,
          dateStr: handoverRequest.dateStr || handoverRequest.datestr,
          headerReason
        }
      });
    } catch (_) {}

    // Realtime Push: trigger mentor, CM, and cover staff immediately
    try {
      notifyRealtimeEvent({
        domain: "requests",
        action: status,
        targetUserIds: [handoverRequest.requestorId, handoverRequest.targetStaffId].filter(Boolean),
        payload: {
          requestId,
          status: targetStatus,
          slotId: handoverRequest.slotId,
          dateStr: handoverRequest.dateStr || handoverRequest.datestr,
          headerReason
        }
      });
    } catch (_) {}

    // DATA_FLOW_AUDIT D3: return the created handover row (if any) for client sync.
    const createdHandover = createdHandoverId
      ? (await db.get("SELECT * FROM approved_handovers WHERE id = ?", createdHandoverId) || null)
      : null;
    return NextResponse.json({ success: true, handover: createdHandover });
  } catch (error: any) {
    console.error("API POST Review Request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
