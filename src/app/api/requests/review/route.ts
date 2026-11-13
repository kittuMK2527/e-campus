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

    const cleanApproverName = approverName || "System User";
    const cleanActorRole = actorRole || (action === "cm_reassign" ? "Campus Manager" : "Mentor");

    // 1. CM Direct Reassignment / Allocation of a Free Mentor
    if ((action === "cm_reassign" || action === "cam_reassign") && newTargetStaffId) {
      // BUG-08: Mentors cannot perform CM direct reassignments
      if (actorRoleFromAuth === "mentor") {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Mentors cannot perform Campus Manager reassignments." },
          { status: 403 }
        );
      }

      // If CM, verify request belongs to their assigned campus
      if (actorRoleFromAuth === "cm" && auth?.user?.college_id && handoverRequest.college_id) {
        if (handoverRequest.college_id.toLowerCase() !== auth.user.college_id.toLowerCase()) {
          return NextResponse.json(
            { success: false, message: "Unauthorized: You can only reassign handovers for your assigned campus." },
            { status: 403 }
          );
        }
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
      }

      const handoverId = generateId("h");
      const logId = generateId("l");

      // The request row, the ledger row and the audit trail are one decision. Split
      // across autocommitted statements, a failure mid-way left the request approved
      // with no handover to show for it (or vice versa) and the ledger short by a class.
      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE handover_requests 
           SET targetStaffId = ?, targetStaffName = ?, status = 'approved', approvedBy = ?, headerReason = ?
           WHERE id = ?`,
          [newCoverStaff.id, newCoverStaff.name, cleanApproverName, `Assigned by CM ${cleanApproverName}`, requestId]
        );

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

      // DATA_FLOW_AUDIT D3: return the created handover row so the client patches
      // state with the authoritative DB values.
      const createdHandover = await db.get("SELECT * FROM approved_handovers WHERE id = ?", handoverId);
      return NextResponse.json({ success: true, message: `Class successfully assigned to ${newCoverStaff.name}!`, handover: createdHandover || null });
    }

    if (!isInCmQueue(handoverRequest.status)) {
      return NextResponse.json({ success: false, message: "Request has already been processed" });
    }

    if (handoverRequest.request_type === "exam_marks_edit") {
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
      await db.transaction(async (tx) => {
        await tx.run(
          "UPDATE handover_requests SET status = ?, headerReason = ?, approvedBy = ? WHERE id = ?",
          [targetStatus, headerReason || null, cleanApproverName, requestId]
        );

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

      return NextResponse.json({ success: true, message: `Exam mark modification request ${status} successfully!` });
    }

    const isMetaOrCamRequest =
      handoverRequest.targetStaffId === "cm_approval" ||
      handoverRequest.targetStaffId === "CM-APPROVAL" ||
      handoverRequest.targetStaffId === "cam_approval" ||
      handoverRequest.targetStaffId === "CAM-APPROVAL" ||
      (typeof handoverRequest.targetStaffId === "string" && (handoverRequest.targetStaffId.toLowerCase().includes("cm") || handoverRequest.targetStaffId.toLowerCase().includes("cam"))) ||
      (handoverRequest.targetStaffName && (handoverRequest.targetStaffName.includes("CM Approval") || handoverRequest.targetStaffName.includes("CAM Approval"))) ||
      (handoverRequest.reason && handoverRequest.reason.includes("Late Attendance")) ||
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
      }
    }

    // The status flip, the parent-leave linkage, the ledger row and the audit entry
    // describe one decision. Committed separately, a failure mid-way left the request
    // approved with no handover row behind it, or the parent leave approved with a
    // cover missing from the ledger.
    let createdHandoverId: string | null = null;

    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE handover_requests SET status = ?, headerReason = ?, approvedBy = ? WHERE id = ?",
        [targetStatus, headerReason || null, cleanApproverName, requestId]
      );

      // If this is a late attendance / meta request, also resolve any duplicate pending requests for the same session
      if (isMetaOrCamRequest && handoverRequest.requestorId && handoverRequest.slotId && (handoverRequest.dateStr || handoverRequest.datestr)) {
        const dStr = handoverRequest.dateStr || handoverRequest.datestr;
        await tx.run(
          "UPDATE handover_requests SET status = ?, headerReason = ?, approvedBy = ? WHERE requestorId = ? AND slotId = ? AND (dateStr = ? OR datestr = ?) AND id != ? AND status IN ('pending', 'pending_cm', 'pending_cam')",
          [targetStatus, headerReason || null, cleanApproverName, handoverRequest.requestorId, handoverRequest.slotId, dStr, dStr, requestId]
        );
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
