export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { checkMentorAvailability } from "@/lib/availability";
import { requireAuth } from "@/lib/authGuard";
import { applyHandoverDateCorrection, correctStaleHandoverDate } from "@/lib/handoverDates";
import { generateId } from "@/lib/id";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  try {
    // Every handover/leave request in the system is readable here, so a session
    // is mandatory and the list is scoped to the caller: mentors and SMEs see the
    // requests they raised or received, CMs see their campus, staff see all.
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "cm", "kam", "admin", "sme", "L and D"],
      checkCsrf: false
    });
    if (errorResponse) return errorResponse;
    const actor = auth!.user;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const targetStaffId = searchParams.get("targetStaffId");
    const requestorId = searchParams.get("requestorId");
    const slotId = searchParams.get("slotId");
    const status = searchParams.get("status");

    let query = "SELECT * FROM handover_requests WHERE 1=1";
    const params: any[] = [];
    if (targetStaffId) {
      query += " AND targetStaffId = ?";
      params.push(targetStaffId);
    }
    if (requestorId) {
      query += " AND requestorId = ?";
      params.push(requestorId);
    }
    if (slotId) {
      query += " AND slotId = ?";
      params.push(slotId);
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (actor.role === "mentor" || actor.role === "sme") {
      query += " AND (requestorId = ? OR targetStaffId = ?)";
      params.push(actor.reference_id, actor.reference_id);
    } else if (actor.role === "cm") {
      const ownCollege = actor.college_id;
      if (!ownCollege) {
        return NextResponse.json(
          { success: false, message: "No campus is linked to this account." },
          { status: 403, headers: noCacheHeaders }
        );
      }
      query +=
        " AND (requestorId IN (SELECT id FROM mentors WHERE LOWER(college_id) = LOWER(?))" +
        " OR targetStaffId IN (SELECT id FROM mentors WHERE LOWER(college_id) = LOWER(?)))";
      params.push(ownCollege, ownCollege);
    }

    query += " ORDER BY timestamp DESC";

    const records = await db.all(query, params);

    // Show timezone-shifted leave_cover dates without persisting: a GET must not
    // write. scripts/backfill-handover-dates.sql repairs the stored rows.
    const leaveIds = Array.from(new Set(
      records.filter((r: any) => r.compensates_handover_id && r.request_type === "leave_cover")
        .map((r: any) => r.compensates_handover_id)
    ));
    if (leaveIds.length > 0) {
      try {
        const placeholders = leaveIds.map(() => "?").join(",");
        const leaves = await db.all(
          `SELECT id, start_date FROM faculty_leave_requests WHERE id IN (${placeholders})`,
          leaveIds
        );
        const startById = new Map(leaves.map((l: any) => [l.id, l.start_date]));
        for (const rec of records) {
          const correction = correctStaleHandoverDate(
            rec.dateStr || rec.datestr,
            startById.get(rec.compensates_handover_id)
          );
          if (correction) applyHandoverDateCorrection(rec, correction);
        }
      } catch (_) {}
    }

    return NextResponse.json({ success: true, requests: records }, { headers: noCacheHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noCacheHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "cm", "kam", "admin"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;
    const actor = auth!.user;

    const db = await getDb();
    const body = await request.json();
    const { mentorId, slotId, dateStr, dateFormatted, targetStaffId, reason, subjectName, course, classGroup, targetStaffName, requestType } = body;

    if (!mentorId || !slotId || !dateStr || !dateFormatted || !targetStaffId || !reason) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    // The requestor used to be whatever mentorId the body claimed, so any signed-in
    // mentor could raise requests in a colleague's name.
    if (actor.role === "mentor" && String(mentorId) !== String(actor.reference_id)) {
      return NextResponse.json(
        { success: false, message: "Mentors can only raise requests in their own name." },
        { status: 403 }
      );
    }

    // ─── Meta-Request Fast Path ───────────────────────────────────────────────
    // Handles synthetic slot IDs (mentor_daily_punch_, acad_log_edit_) or CM-directed
    // approval requests (late attendance edit requests, targetStaffId="cm_approval" / "CM-APPROVAL").
    // These bypass the normal slot/coverStaff lookup and are stored directly as pending_cm requests for CM review.
    const normalizedTargetStaffId = typeof targetStaffId === "string" ? targetStaffId.trim() : "";
    const isMetaRequest =
      normalizedTargetStaffId.toLowerCase() === "cm_approval" ||
      normalizedTargetStaffId.toLowerCase() === "cm-approval" ||
      normalizedTargetStaffId.toLowerCase() === "cam_approval" ||
      normalizedTargetStaffId.toLowerCase() === "cam-approval" ||
      normalizedTargetStaffId.toLowerCase() === "cam" ||
      normalizedTargetStaffId.toLowerCase() === "cm"
      || normalizedTargetStaffId.toLowerCase().includes("cam") ||
      slotId.startsWith("mentor_daily_punch_") ||
      slotId.startsWith("acad_log_edit_") ||
      (typeof reason === "string" && reason.toLowerCase().includes("late attendance"));

    if (isMetaRequest) {
      // Check for duplicate pending or approved requests for this slot and date
      const existingReq = await db.get(
        `SELECT id, status, reason, timestamp, request_type, dateStr, slotId, targetStaffName, targetStaffId FROM handover_requests 
         WHERE requestorId = ? AND slotId = ? AND dateStr = ? 
         AND status IN ('pending', 'pending_cm', 'pending_cam', 'approved') 
         ORDER BY timestamp DESC LIMIT 1`,
        mentorId, slotId, dateStr
      );
      if (existingReq) {
        return NextResponse.json({
          success: false,
          duplicate: true,
          message: existingReq.status === "approved"
            ? "An approval request for this period has already been approved."
            : "A request for this period is already pending CM approval.",
          requestId: existingReq.id,
          request: existingReq
        }, { status: 409 });
      }

      // The requestor and the (optional) real slot both key off the body, so they
      // leave as one round trip. A failed requestor read must not read as "not found".
      const metaFailures: QueryFailure[] = [];
      const [requestorRows, slotRows] = await db.multiQuery([
        { sql: "SELECT * FROM mentors WHERE id = ?", params: [mentorId] },
        { sql: "SELECT * FROM slots WHERE id = ?", params: [slotId] },
      ], metaFailures);
      if (metaFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not verify this request. Please try again." }, { status: 500 });
      }
      const requestor = requestorRows[0];
      if (!requestor) {
        return NextResponse.json({ success: false, message: "Mentor not found." }, { status: 404 });
      }

      // If slotId corresponds to a real slot, its details fill the blanks below
      const slot = slotRows[0];

      const newId = generateId("r");
      const metaCourse = course || subjectName || slot?.course || slotId;
      const metaClassGroup = classGroup || slot?.classGroup || requestor.department || "Faculty";
      const metaTargetStaffName = targetStaffName || (normalizedTargetStaffId.toLowerCase().includes("cm") ? "CM Approval" : "CM Approval");
      const metaDay = slot?.day || "";
      const metaTime = slot?.time || "";
      const storedTargetStaffId = normalizedTargetStaffId.toLowerCase() === "cam-approval" ? "cm_approval" : normalizedTargetStaffId;
      // ROLE_UI_AUDIT T2: structured type marker (e.g. "late_punch") — the client
      // matches approvals on this instead of parsing the reason text.

      // targetStaffId is a routing token for CM-approval requests ("cm_approval"),
      // so the legacy mentors(id) FK on this column is dropped by the startup
      // migration `handover_requests_target_staff_fk_drop` rather than by DDL here.
      await db.run(
        `INSERT INTO handover_requests (
           id, requestorId, requestorName, slotId, course, day, time,
           dateStr, dateFormatted, targetStaffId, targetStaffName, reason, status, timestamp, classGroup, request_type
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_cm', ?, ?, ?)`,
        newId,
        mentorId,
        requestor.name,
        slotId,
        metaCourse,
        metaDay,
        metaTime,
        dateStr,
        dateFormatted,
        storedTargetStaffId,
        metaTargetStaffName,
        reason,
        new Date().toISOString(),
        metaClassGroup,
        requestType || ((typeof reason === "string" && reason.toLowerCase().includes("late attendance")) ? "late_attendance" : "late_punch")
      );

      // Audit log
      await db.run(
        "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'meta_request', ?, ?, 'Mentor', ?)",
        generateId("l"),
        `${requestor.name} submitted meta-request: ${reason.slice(0, 100)}`,
        requestor.name,
        new Date().toISOString()
      );

      // Realtime in-app & device notification to CM and Admin
      try {
        await dispatchSystemNotification(db, {
          roles: ["cm", "admin"],
          collegeId: requestor.college_id,
          title: `Pending Request: ${requestor.name}`,
          message: `${requestor.name} submitted request: ${reason.slice(0, 80)}`,
          link: "/cm/approvals",
          type: "warning",
          domain: "notifications",
          action: "created",
          payload: { requestId: newId, requestorId: mentorId, slotId, dateStr }
        });
      } catch (_) {}

      // Realtime Push: trigger CM and Admin instantly
      try {
        notifyRealtimeEvent({
          domain: "requests",
          action: "created",
          targetRoles: ["cm", "admin"],
          collegeId: requestor.college_id,
          payload: { requestId: newId, requestorId: mentorId, slotId, dateStr }
        });
      } catch (_) {}

      return NextResponse.json({
        success: true,
        requestId: newId,
        request: {
          id: newId,
          requestorId: mentorId,
          requestorName: requestor.name,
          slotId,
          course: metaCourse,
          day: metaDay,
          time: metaTime,
          dateStr,
          dateFormatted,
          targetStaffId: storedTargetStaffId,
          targetStaffName: metaTargetStaffName,
          reason,
          status: "pending_cm",
          timestamp: new Date().toISOString(),
          classGroup: metaClassGroup
        }
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const [requestor, slot, coverStaff] = await Promise.all([
      db.get("SELECT * FROM mentors WHERE id = ?", mentorId),
      db.get("SELECT * FROM slots WHERE id = ?", slotId),
      db.get("SELECT * FROM mentors WHERE id = ?", targetStaffId)
    ]);

    if (!requestor || !slot || !coverStaff) {
      return NextResponse.json({ success: false, message: "Invalid parameters. Mentor, Slot or Cover Staff not found." }, { status: 404 });
    }

    // A. Check if the slot/date is in the past to classify as an Emergency Handover Request
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date()); // "YYYY-MM-DD" in Asia/Kolkata
    let isEmergency = false;
    if (dateStr < todayStr) {
      isEmergency = true;
    } else if (dateStr === todayStr) {
      // Check if the slot time has passed
      try {
        const parts = slot.time.split("-");
        if (parts.length === 2) {
          const endTimeStr = parts[1].trim(); // e.g. "10.00 AM" or "4.30 PM"
          const [timePart, ampm] = endTimeStr.split(" ");
          let [hours, minutes] = timePart.split(".").map(Number);
          if (ampm.toLowerCase() === "pm" && hours < 12) hours += 12;
          if (ampm.toLowerCase() === "am" && hours === 12) hours = 0;
          
          const now = new Date();
          const slotEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
          if (now > slotEndTime) {
            isEmergency = true;
          }
        }
      } catch (err) {
        console.error("Error parsing slot time:", err);
      }
    }

    const initialStatus = isEmergency ? "pending_cm" : "pending";

    // Check for duplicate pending or approved requests for this slot and date
    const existingReq = await db.get(
      `SELECT id, status, reason, timestamp, request_type, dateStr, slotId, targetStaffName, targetStaffId FROM handover_requests 
       WHERE requestorId = ? AND slotId = ? AND dateStr = ? 
       AND status IN ('pending', 'pending_cm', 'pending_cam', 'approved') 
       ORDER BY timestamp DESC LIMIT 1`,
      mentorId, slotId, dateStr
    );
    if (existingReq) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        message: existingReq.status === "approved"
          ? "This slot has already been approved for handover."
          : "A handover request for this slot is already pending.",
        requestId: existingReq.id,
        request: existingReq
      }, { status: 409 });
    }

    // Unified Availability Validation for covering faculty
    const availability = await checkMentorAvailability(db, {
      mentorId: targetStaffId,
      dateStr,
      timeSlot: slot.time,
      shift: slot.shift
    });

    if (!availability.available) {
      return NextResponse.json({
        success: false,
        message: `${coverStaff.name} is unavailable: ${availability.reason}`
      }, { status: 400 });
    }

    const newId = generateId("r");
    await db.run(
      `INSERT INTO handover_requests (
         id, requestorId, requestorName, slotId, course, day, time, 
         dateStr, dateFormatted, targetStaffId, targetStaffName, reason, status, timestamp, classGroup
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId,
      mentorId,
      requestor.name,
      slotId,
      subjectName || slot.course,
      slot.day,
      slot.time,
      dateStr,
      dateFormatted,
      targetStaffId,
      coverStaff.name,
      reason,
      initialStatus,
      new Date().toISOString(),
      slot.classGroup || "General"
    );

    // Audit Log request
    const logId = generateId("l");
    const logDesc = `${requestor.name} requested to hand over class "${subjectName || slot.course}" on ${dateFormatted} to ${coverStaff.name} (Emergency: ${isEmergency})`;
    await db.run(
      "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, 'handover_request', ?, ?, 'Mentor', ?)",
      logId,
      logDesc,
      requestor.name,
      new Date().toISOString()
    );

    // Realtime in-app & device notification to target cover mentor and CM (if emergency)
    try {
      await dispatchSystemNotification(db, {
        userIds: [targetStaffId],
        roles: isEmergency ? ["cm", "admin"] : ["admin"],
        collegeId: requestor.college_id,
        title: isEmergency ? `EMERGENCY Handover: ${requestor.name}` : `Class Handover Request`,
        message: `${requestor.name} requested you to cover "${subjectName || slot.course}" on ${dateFormatted}.`,
        link: "/mentor?tab=handovers",
        type: isEmergency ? "warning" : "info",
        domain: "notifications",
        action: "created",
        payload: { requestId: newId, requestorId: mentorId, targetStaffId, slotId, dateStr }
      });
    } catch (_) {}

    // Realtime Push: trigger target cover staff and CM (if emergency)
    try {
      notifyRealtimeEvent({
        domain: "requests",
        action: "created",
        targetUserIds: [targetStaffId],
        targetRoles: isEmergency ? ["cm", "admin"] : undefined,
        collegeId: requestor.college_id,
        payload: { requestId: newId, requestorId: mentorId, slotId, dateStr }
      });
    } catch (_) {}

    return NextResponse.json({
      success: true,
      request: {
        id: newId,
        requestorId: mentorId,
        requestorName: requestor.name,
        slotId,
        course: slot.course,
        day: slot.day,
        time: slot.time,
        dateStr,
        dateFormatted,
        targetStaffId,
        targetStaffName: coverStaff.name,
        reason,
        status: initialStatus,
        timestamp: new Date().toISOString(),
        classGroup: slot.classGroup || "General"
      }
    });
  } catch (error: any) {
    console.error("API POST Request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
