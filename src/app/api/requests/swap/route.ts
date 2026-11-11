export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth, Role } from "@/lib/authGuard";
import { checkMentorAvailability } from "@/lib/availability";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";

// A swap reassigns a live class slot and emails the other mentor.
const SWAP_ROLES: Role[] = ["mentor", "cm", "kam", "admin"];

export async function POST(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: SWAP_ROLES });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const body = await request.json();
    const {
      requestorId,
      offerSlotId,
      offerDateStr,
      offerDateFormatted,
      targetStaffId,
      compensatesHandoverId,
      reason,
      originalSubject,
      originalMonth
    } = body;

    if (!requestorId || !offerSlotId || !offerDateStr || !offerDateFormatted || !targetStaffId) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    // The three existence probes and the pending-duplicate probe all key off the
    // body, so they leave as one round trip. Every slice feeds a refusal: a failed
    // read must not read as "missing" (404) or "not pending" (INSERT).
    const swapFailures: QueryFailure[] = [];
    const [requestorRows, offerSlotRows, targetStaffRows, duplicateRows] = await db.multiQuery([
      { sql: "SELECT * FROM mentors WHERE id = ?", params: [requestorId] },
      { sql: "SELECT * FROM slots WHERE id = ?", params: [offerSlotId] },
      { sql: "SELECT * FROM mentors WHERE id = ?", params: [targetStaffId] },
      {
        sql: `SELECT id FROM handover_requests WHERE requestorId = ? AND slotId = ? AND dateStr = ? AND targetStaffId = ? AND request_type = 'swap_compensate' AND status IN ('pending', 'pending_cm', 'pending_cam')`,
        params: [requestorId, offerSlotId, offerDateStr, targetStaffId],
      },
    ], swapFailures);
    if (swapFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not verify this swap offer. Please try again." }, { status: 500 });
    }
    const requestor = requestorRows[0];
    const offerSlot = offerSlotRows[0];
    const targetStaff = targetStaffRows[0];

    if (!requestor || !offerSlot || !targetStaff) {
      return NextResponse.json({ success: false, message: "Mentor, Slot, or Target Staff not found." }, { status: 404 });
    }

    if (offerSlot.mentorId !== targetStaffId) {
      return NextResponse.json({ success: false, message: "You can only select a slot that belongs to the target faculty." }, { status: 400 });
    }

    const todayStr = getInstitutionDateStr();
    if (offerDateStr < todayStr) {
      return NextResponse.json({ success: false, message: "You can only offer to cover future slots as compensation." }, { status: 400 });
    }

    // Unified Availability check for the requestor (they must be free to cover)
    const requestorAvailability = await checkMentorAvailability(db, {
      mentorId: requestorId,
      dateStr: offerDateStr,
      timeSlot: offerSlot.time,
      shift: offerSlot.shift
    });

    if (!requestorAvailability.available) {
      return NextResponse.json({
        success: false,
        message: `You are unavailable to cover at this time on ${offerDateFormatted}: ${requestorAvailability.reason}`
      }, { status: 400 });
    }

    const duplicateCheck = duplicateRows[0];
    if (duplicateCheck) {
      return NextResponse.json({ success: false, message: "A swap offer for this slot/date is already pending." }, { status: 400 });
    }

    const newId = generateId("swap");
    const swapReason = reason || `Offering class as compensation for previous handover.`;

    await db.run(
      `INSERT INTO handover_requests (
         id, requestorId, requestorName, slotId, course, day, time,
         dateStr, dateFormatted, targetStaffId, targetStaffName,
         reason, status, timestamp, classGroup, request_type, compensates_handover_id,
         original_subject, original_month
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'swap_compensate', ?, ?, ?)`,
      newId, requestorId, requestor.name, offerSlotId, offerSlot.course,
      offerSlot.day, offerSlot.time, offerDateStr, offerDateFormatted,
      targetStaffId, targetStaff.name, swapReason, new Date().toISOString(),
      offerSlot.classGroup || "General", compensatesHandoverId || null,
      originalSubject || null, originalMonth || null
    );

    const logId = generateId("l");
    await db.run(
      "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'handover_request', ?, ?, 'Mentor', ?)",
      logId,
      `${requestor.name} offered "${offerSlot.course}" on ${offerDateFormatted} to ${targetStaff.name} as a swap compensation.`,
      requestor.name,
      new Date().toISOString()
    );

    // Realtime Push: trigger target mentor immediately with in-app & device notification
    try {
      await dispatchSystemNotification(db, {
        userIds: [targetStaffId],
        roles: ["admin"],
        collegeId: requestor.college_id,
        title: `Class Swap Offered by ${requestor.name}`,
        message: `${requestor.name} offered to cover "${offerSlot.course}" on ${offerDateFormatted} as compensation.`,
        link: "/mentor/handover",
        type: "info",
        domain: "notifications",
        action: "created",
        payload: { requestId: newId, requestorId, targetStaffId, slotId: offerSlotId, dateStr: offerDateStr }
      });
    } catch (_) {}

    try {
      notifyRealtimeEvent({
        domain: "requests",
        action: "created",
        targetUserIds: [targetStaffId],
        payload: { requestId: newId, requestorId, slotId: offerSlotId, dateStr: offerDateStr }
      });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      message: "Swap offer sent successfully.",
      request: {
        id: newId, requestorId, requestorName: requestor.name,
        slotId: offerSlotId, course: offerSlot.course, dateStr: offerDateStr,
        dateFormatted: offerDateFormatted, targetStaffId, targetStaffName: targetStaff.name,
        status: "pending", request_type: "swap_compensate"
      }
    });
  } catch (error: any) {
    console.error("API POST Swap Compensate error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
