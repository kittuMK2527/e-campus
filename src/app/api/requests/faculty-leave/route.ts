export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, readInChunks, type QueryFailure } from "@/lib/db";
import { requireAuth, Role } from "@/lib/authGuard";
import { checkMentorAvailability, loadAvailabilityContext, type AvailabilityContext } from "@/lib/availability";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";
import { applyHandoverDateCorrection, correctStaleHandoverDate } from "@/lib/handoverDates";

// Faculty leave reads and writes the live schedule (handovers, mentor_attendance)
// and mails CM/KAM/cover mentors, so every handler needs a session.
const LEAVE_ROLES: Role[] = ["mentor", "cm", "kam", "admin"];

export async function GET(request: Request) {
  const { errorResponse } = await requireAuth(request, {
    allowedRoles: LEAVE_ROLES,
    checkCsrf: false
  });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const collegeId = searchParams.get("collegeId");
    const mentorId = searchParams.get("mentorId");
    const status = searchParams.get("status");
    // Special mode: fetch available cover mentors for a slot+date
    const availableForSlotId = searchParams.get("availableForSlotId");
    const availableForDate = searchParams.get("availableForDate");
    const availableForCollegeId = searchParams.get("availableForCollegeId");
    const excludeMentorId = searchParams.get("excludeMentorId");

    if (availableForSlotId && availableForDate && availableForCollegeId) {
      // Slot + campus roster are independent, then the whole campus shares ONE preloaded
      // availability context and ONE same-subject lookup. This branch used to run roughly
      // seven queries per mentor, so a 30-mentor campus cost ~200 round trips.
      const [slotRows, mentorRows] = await db.multiQuery([
        { sql: "SELECT * FROM slots WHERE id = ?", params: [availableForSlotId] },
        {
          sql: `SELECT id, name, department, email FROM mentors WHERE college_id = ? AND id != ? ORDER BY name`,
          params: [availableForCollegeId, excludeMentorId || ""]
        }
      ]);
      const slot = slotRows[0];
      if (!slot) return NextResponse.json({ success: false, message: "Slot not found" }, { status: 404 });

      const allMentors: any[] = mentorRows;

      // Which mentors already teach this course (sameSubject), fetched for the whole campus
      // in one chunked read instead of once per candidate.
      const mentorIds = allMentors.map((m: any) => m.id);

      // Which mentors already teach this course, fetched for the whole campus in one
      // chunked read instead of once per candidate. It only drives a sort hint and a badge,
      // so a failed read degrades to "no same-subject match" rather than breaking the picker.
      const sameSubjectRead = readInChunks(
        db,
        mentorIds,
        (chunk, ph) => ({
          sql: `SELECT DISTINCT mentorId FROM slots WHERE mentorId IN (${ph}) AND LOWER(course) = LOWER(?)`,
          params: [...chunk, slot.course]
        })
      ).catch(() => [] as any[]);

      const [sameSubjectRows, ctxResult] = await Promise.all([
        sameSubjectRead,
        loadAvailabilityContext(db, { mentorIds, dates: [availableForDate] })
          .then(c => ({ ctx: c as AvailabilityContext | null, error: null as any }))
          .catch(error => ({ ctx: null as AvailabilityContext | null, error }))
      ]);
      if (ctxResult.error) {
        console.warn("[faculty-leave] availability preload failed, falling back to per-mentor lookups:", ctxResult.error?.message);
      }
      const availCtx = ctxResult.ctx;

      const sameSubjectIds = new Set<string>(sameSubjectRows.map((r: any) => String(r.mentorId ?? r.mentorid ?? "")));

      const available: any[] = [];
      for (const m of allMentors) {
        const result = await checkMentorAvailability(db, {
          mentorId: m.id,
          dateStr: availableForDate,
          timeSlot: slot.time,
          shift: slot.shift,
          ctx: availCtx ?? undefined
        });
        if (result.available) {
          available.push({ ...m, sameSubject: sameSubjectIds.has(String(m.id)) });
        }
      }
      // Sort: same subject first
      available.sort((a, b) => (b.sameSubject ? 1 : 0) - (a.sameSubject ? 1 : 0));
      return NextResponse.json({ success: true, mentors: available });
    }

    let query = `
      SELECT flr.*, m.name as mentorName, m.email as mentorEmail, m.department as mentorDepartment, c.name as collegeName
      FROM faculty_leave_requests flr
      JOIN mentors m ON flr.mentor_id = m.id
      LEFT JOIN colleges c ON flr.college_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (collegeId) {
      query += ` AND flr.college_id = ?`;
      params.push(collegeId);
    }
    if (mentorId) {
      query += ` AND flr.mentor_id = ?`;
      params.push(mentorId);
    }
    if (status) {
      query += ` AND flr.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY flr.created_at DESC`;

    const records = await db.all(query, params);

    // Load cover requests for every leave in one round trip instead of one per row.
    const leaveIds = records.map((r: any) => r.id).filter(Boolean);
    const coversByLeave = new Map<string, any[]>();
    if (leaveIds.length > 0) {
      // MAIL-C02 Fix: Use SQLite/libSQL compatible IN syntax instead of PostgreSQL ANY(?::text[])
      const placeholders = leaveIds.map(() => "?").join(",");
      const allCovers = await db.all(
        `SELECT id, compensates_handover_id, targetStaffId, targetStaffName, targetstaffname, status, course, day, time, dateStr, dateFormatted
         FROM handover_requests
         WHERE compensates_handover_id IN (${placeholders})`,
        leaveIds
      ).catch(() => []);
      for (const cover of allCovers) {
        const leaveId = cover.compensates_handover_id;
        if (!leaveId) continue;
        const list = coversByLeave.get(leaveId);
        if (list) list.push(cover);
        else coversByLeave.set(leaveId, [cover]);
      }
    }

    // Enrich with cover requests. A GET never writes: stale cover dates are
    // corrected in memory only, and the approve/attendance cascade runs in
    // POST /api/requests/review when the last cover is accepted.
    for (const rec of records) {
      const covers = coversByLeave.get(rec.id) || [];
      rec.covers = covers;
      for (const c of covers) {
        const correction = correctStaleHandoverDate(c.dateStr || c.datestr, rec.start_date);
        if (correction) applyHandoverDateCorrection(c, correction);
      }
    }

    return NextResponse.json({ success: true, records });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: LEAVE_ROLES });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const body = await request.json();
    const { action } = body;

    // 1. Approval or Rejection by Campus Manager (CM)
    if (action === "approve" || action === "reject") {
      const { requestId, approvedBy, rejectionReason } = body;

      if (!requestId) {
        return NextResponse.json({ success: false, message: "Missing requestId" }, { status: 400 });
      }

      // The request row and the demo-reallocation gate both key off requestId, so one
      // round trip serves both. Each decides a write, so a failed slice aborts rather
      // than reading as "request not found" or "no conflicts".
      const approveFailures: QueryFailure[] = [];
      const [requestRows, pendingReallocs] = await db.multiQuery(
        [
          {
            sql: `SELECT flr.*, m.name as mentorName, m.email as mentorEmail, c.name as collegeName
                  FROM faculty_leave_requests flr
                  JOIN mentors m ON flr.mentor_id = m.id
                  LEFT JOIN colleges c ON flr.college_id = c.id
                  WHERE flr.id = ?`,
            params: [requestId],
          },
          action === "approve"
            ? {
                sql: "SELECT id, subject, original_date_str, original_time_slot, proposed_date_str, proposed_time_slot FROM demo_reallocation_requests WHERE leave_request_id = ? AND status = 'pending'",
                params: [requestId],
              }
            : { sql: "SELECT 1 WHERE 1=0" },
        ],
        approveFailures
      );
      if (approveFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not verify this request before approving it. Please try again." }, { status: 500 });
      }

      const reqRecord = requestRows[0] || null;
      if (!reqRecord) {
        return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });
      }

      const newStatus = action === "approve" ? "approved" : "rejected";

      // ── Gate: leave approval must not create an unhandled demo conflict ──
      if (action === "approve") {
        if (pendingReallocs.length > 0) {
          return NextResponse.json({
            success: false,
            message: `Cannot approve yet: ${pendingReallocs.length} demo reallocation(s) for this leave are still awaiting L&D decision (${pendingReallocs.map((r: any) => `${r.subject}: ${r.original_date_str} → ${r.proposed_date_str}`).join("; ")}).`
          }, { status: 409 });
        }
      }

      // MAIL-M09 Fix: Replace NOW() with CURRENT_TIMESTAMP
      await db.run(
        `UPDATE faculty_leave_requests
         SET status = ?, approved_by = ?, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newStatus, approvedBy || "Campus Manager", rejectionReason || null, requestId]
      );

      // Automatic Sync to mentor_attendance if approved
      let affectedClasses: any[] = [];
      if (action === "approve") {
        const [sY, sM, sD] = reqRecord.start_date.split("-").map(Number);
        const [eY, eM, eD] = (reqRecord.end_date || reqRecord.start_date).split("-").map(Number);
        let cur = new Date(sY, sM - 1, sD, 12, 0, 0);
        const end = new Date(eY, eM - 1, eD, 12, 0, 0);
        const attStatus = reqRecord.request_type === "OD" ? "OD" : "Leave";

        while (cur <= end) {
          const year = cur.getFullYear();
          const month = String(cur.getMonth() + 1).padStart(2, "0");
          const day = String(cur.getDate()).padStart(2, "0");
          const dateStr = `${year}-${month}-${day}`;
          const attId = `att_${reqRecord.mentor_id}_${dateStr}`;

          // MAIL-M09 Fix: Replace NOW() with CURRENT_TIMESTAMP
          await db.run(
            `INSERT INTO mentor_attendance (id, mentor_id, college_id, date_str, status, reason, marked_by, marked_by_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'cam_approval', ?, CURRENT_TIMESTAMP)
             ON CONFLICT(mentor_id, date_str) DO UPDATE SET
             status = excluded.status,
             reason = excluded.reason,
             marked_by = excluded.marked_by,
             marked_by_id = excluded.marked_by_id,
             updated_at = CURRENT_TIMESTAMP`,
            [
              attId,
              reqRecord.mentor_id,
              reqRecord.college_id,
              dateStr,
              attStatus,
              `${reqRecord.request_type}: ${reqRecord.reason}`,
              approvedBy || "Campus Manager"
            ]
          );

          cur.setDate(cur.getDate() + 1);
        }

        // Automatic identification of affected demo sessions for this mentor
        const affectedDemos = await db.all(
          `SELECT * FROM demo_sessions 
           WHERE mentorId = ? AND status NOT IN ('completed', 'not_conducted')
           AND dateStr >= ? AND dateStr <= ?`,
          [reqRecord.mentor_id, reqRecord.start_date, reqRecord.end_date]
        );

        if (affectedDemos && affectedDemos.length > 0) {
          for (const demo of affectedDemos) {
            const leaveReason = `Mentor ${reqRecord.mentorName} approved leave (${reqRecord.start_date} to ${reqRecord.end_date}). Pending mentor self-reschedule.`;

            // Update session status to 'reallocation_required' so the mentor sees the temporary "Reschedule Demo" button
            await db.run(
              `UPDATE demo_sessions SET status = 'reallocation_required', comments = ? WHERE id = ?`,
              [leaveReason, demo.id]
            );

            // 1. In-app notification to the assigned SME (freeing their slot and letting them know mentor will reschedule)
            if (demo.smeId) {
              await dispatchSystemNotification(db, {
                userIds: [demo.smeId],
                title: "L&D On Hold — Mentor on Leave",
                message: `L&D session for ${demo.subject} with ${reqRecord.mentorName} on ${demo.dateStr} (${demo.timeSlot}) is on hold due to approved mentor leave. Slot has been freed; mentor will reschedule.`,
                link: "/sme/demo_list",
                type: "warning",
                domain: "demos",
                action: "availability_updated",
                collegeId: reqRecord.college_id || undefined,
              });
            }

            // 2. In-app notification to the mentor prompting them to pick a new date & slot
            if (reqRecord.mentor_id) {
              await dispatchSystemNotification(db, {
                userIds: [reqRecord.mentor_id],
                title: "L&D Reschedule Required",
                message: `Your L&D session for ${demo.subject} on ${demo.dateStr} falls during your approved leave. Please open Demo Evaluations to pick a new date and time slot.`,
                link: "/mentor/demo_evaluations",
                type: "reminder",
                domain: "demos",
                action: "availability_updated",
                collegeId: reqRecord.college_id || undefined,
              });
            }

            // 3. Audit log
            const auditId = generateId("audit");
            await db.run(
              `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
               VALUES (?, 'demo_leave_hold', ?, ?, 'Campus Manager', ?)`,
              [
                auditId,
                `CAM approved leave for Mentor ${reqRecord.mentorName}. L&D session for ${demo.subject} on ${demo.dateStr} (${demo.timeSlot}) placed on hold (Reschedule Required). Evaluator SME ${demo.smeName} and Mentor notified.`,
                approvedBy || "Campus Manager",
                new Date().toISOString()
              ]
            );
          }
        }

        // Automatic identification of affected regular teaching classes for this mentor
        const mentorSlots = await db.all("SELECT * FROM slots WHERE mentorId = ?", [reqRecord.mentor_id]);

        // Which classes fall in the window is pure date arithmetic, so work that out
        // first and then read every handover flag in one set-based query. Used to be one
        // round trip per period per day (a 5-day leave covering 6 periods cost 30 trips).
        const scheduled: { slot: any; dateStr: string }[] = [];
        let curSlotCheck = new Date(sY, sM - 1, sD, 12, 0, 0);
        while (curSlotCheck <= end) {
          const cYear = curSlotCheck.getFullYear();
          const cMonth = String(curSlotCheck.getMonth() + 1).padStart(2, "0");
          const cDay = String(curSlotCheck.getDate()).padStart(2, "0");
          const dStr = `${cYear}-${cMonth}-${cDay}`;
          const dName = curSlotCheck.toLocaleDateString("en-US", { weekday: "long" });
          for (const s of mentorSlots.filter((s: any) => s.day.toLowerCase() === dName.toLowerCase())) {
            scheduled.push({ slot: s, dateStr: dStr });
          }
          curSlotCheck.setDate(curSlotCheck.getDate() + 1);
        }

        const handoverSlotIds = Array.from(new Set(scheduled.map(x => x.slot.id))).filter(Boolean);
        const handoverBySlotDate = new Map<string, any>();
        if (handoverSlotIds.length > 0) {
          const handoverRows = await db.all(
            `SELECT slotId, dateStr, coverStaffId FROM approved_handovers
             WHERE slotId IN (${handoverSlotIds.map(() => "?").join(",")}) AND dateStr >= ? AND dateStr <= ?`,
            [...handoverSlotIds, reqRecord.start_date, reqRecord.end_date]
          );
          for (const h of handoverRows) handoverBySlotDate.set(`${h.slotId}|${h.dateStr}`, h);
        }

        for (const { slot: s, dateStr: dStr } of scheduled) {
          const existingHandover = handoverBySlotDate.get(`${s.id}|${dStr}`) || null;
          affectedClasses.push({
            slotId: s.id,
            course: s.course,
            classGroup: s.classGroup,
            day: s.day,
            time: s.time,
            dateStr: dStr,
            isHandedOver: !!existingHandover,
            coverStaffId: existingHandover?.coverStaffId || null
          });
        }
      }

      // In-app notification to mentor (bell) so the decision is visible
      if (reqRecord.mentor_id) {
        try {
          const dateSpan = reqRecord.end_date && reqRecord.end_date !== reqRecord.start_date
            ? `${reqRecord.start_date} to ${reqRecord.end_date}`
            : reqRecord.start_date;
          await dispatchSystemNotification(db, {
            userIds: [reqRecord.mentor_id],
            title: `${reqRecord.request_type} Request ${newStatus === "approved" ? "Approved" : "Rejected"}`,
            message: `Your ${reqRecord.request_type} application for ${dateSpan} has been ${newStatus} by ${approvedBy || "Campus Manager"}.${rejectionReason ? ` Remarks: ${rejectionReason}` : ""}`,
            link: "/mentor?tab=handovers",
            type: newStatus === "approved" ? "success" : "alert",
            domain: "requests",
            action: "resolved",
            collegeId: reqRecord.college_id || undefined,
          });
        } catch (notifErr) {
          console.error("Failed to write leave decision notification for mentor:", notifErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Faculty leave request ${newStatus} successfully and the mentor has been notified.`,
        affectedClasses
      });
    }

    // 2. Submit new Leave / Permission / OD / Casual / Emergency request (By Mentor)
    const {
      mentorId,
      collegeId,
      requestType,
      startDate,
      endDate,
      startTime,
      endTime,
      reason,
      // Array of { slotId, dateStr, coverMentorId } — one per affected class
      coverSelections,
      // Leave-driven demo reallocation request ids proposed by the mentor
      // (each was already reserved and queued for L&D approval in the UI)
      demoReallocationIds
    } = body;

    const validTypes = ["Casual Leave", "Emergency", "Emergency Leave", "On Duty", "OD", "Permission", "Leave"];
    if (!mentorId || !requestType || !startDate || !reason || !reason.trim()) {
      return NextResponse.json({ success: false, message: "Missing required fields: Request Type, Dates, and Mandatory Reason are required." }, { status: 400 });
    }
    if (!validTypes.includes(requestType)) {
      return NextResponse.json({ success: false, message: `Invalid request type: ${requestType}` }, { status: 400 });
    }

    const normalizedRequestType = 
      requestType === "Emergency Leave" || requestType === "Emergency" ? "Emergency" :
      requestType === "OD" || requestType === "On Duty" ? "On Duty" :
      requestType === "Permission" ? "Permission" :
      "Casual Leave";

    const effectiveEndDate = endDate || startDate;
    const reqId = generateId("f_leave");

    let effectiveCollegeId = collegeId;
    const mentor = await db.get(`SELECT * FROM mentors WHERE id = ?`, [mentorId]);
    if (!effectiveCollegeId) {
      effectiveCollegeId = mentor?.college_id || "general";
    }

    const finalReason = normalizedRequestType === "Permission" && startTime && endTime
      ? `[Time: ${startTime} - ${endTime}] ${reason.trim()}`
      : reason.trim();

    // MAIL-M09 Fix: Replace NOW() with CURRENT_TIMESTAMP
    await db.run(
      `INSERT INTO faculty_leave_requests (id, mentor_id, college_id, request_type, leave_category, start_date, end_date, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        reqId,
        mentorId,
        effectiveCollegeId,
        normalizedRequestType,
        normalizedRequestType,
        startDate,
        effectiveEndDate,
        finalReason
      ]
    );

    // Link the mentor's proposed demo reallocations to this leave application
    if (Array.isArray(demoReallocationIds) && demoReallocationIds.length > 0) {
      for (const drrId of demoReallocationIds) {
        await db.run(
          "UPDATE demo_reallocation_requests SET leave_request_id = ? WHERE id = ? AND status = 'pending'",
          [reqId, drrId]
        ).catch(() => {});
      }
    }

    // Process cover selections: create handover_requests for each slot the mentor nominated a cover for
    const createdHandovers: any[] = [];
    const needsManualCover: any[] = [];

    if (Array.isArray(coverSelections) && coverSelections.length > 0) {
      const validSelections = coverSelections.filter((sel: any) => sel?.slotId && sel?.dateStr);
      const wantedSlotIds = Array.from(new Set(validSelections.map((sel: any) => sel.slotId)));
      const wantedCoverIds = Array.from(new Set(validSelections.map((sel: any) => sel.coverMentorId).filter(Boolean)));

      // Every selection needs its slot row and, when a cover was nominated, that
      // mentor's row. Used to be two round trips per selection (~400ms each here);
      // one set-based batch covers the whole list.
      const slotById = new Map<string, any>();
      const coverMentorById = new Map<string, any>();
      if (wantedSlotIds.length > 0 || wantedCoverIds.length > 0) {
        const coverFailures: QueryFailure[] = [];
        const [slotRows, coverMentorRows] = await db.multiQuery(
          [
            wantedSlotIds.length > 0
              ? { sql: `SELECT * FROM slots WHERE id IN (${wantedSlotIds.map(() => "?").join(",")})`, params: wantedSlotIds }
              : { sql: "SELECT 1 WHERE 1=0" },
            wantedCoverIds.length > 0
              ? { sql: `SELECT * FROM mentors WHERE id IN (${wantedCoverIds.map(() => "?").join(",")})`, params: wantedCoverIds }
              : { sql: "SELECT 1 WHERE 1=0" },
          ],
          coverFailures
        );
        if (coverFailures.length > 0) {
          return NextResponse.json({ success: false, message: "Could not load the classes you nominated covers for. Please try again." }, { status: 500 });
        }
        for (const s of slotRows) slotById.set(s.id, s);
        for (const m of coverMentorRows) coverMentorById.set(m.id, m);
      }

      for (const sel of validSelections) {
        const { slotId, dateStr, coverMentorId } = sel;

        if (coverMentorId) {
          const slot = slotById.get(slotId);
          const coverMentor = coverMentorById.get(coverMentorId);
          if (!slot || !coverMentor) continue;

          const handoverId = generateId("ho");
          const [dY, dM, dD] = dateStr.split("-").map(Number);
          const dateObj = new Date(dY, dM - 1, dD, 12, 0, 0);
          const dateFormatted = dateObj.toLocaleDateString("en-IN", {
            weekday: "long", day: "2-digit", month: "short", year: "numeric"
          });

          await db.run(
            `INSERT INTO handover_requests (
              id, requestorId, requestorName, slotId, course, day, time,
              dateStr, dateFormatted, targetStaffId, targetStaffName,
              reason, status, timestamp, classGroup, request_type, compensates_handover_id,
              original_subject, original_month
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'leave_cover', ?, ?, ?)`,
            [
              handoverId, mentorId, mentor?.name || mentorId,
              slotId, slot.course, slot.day, slot.time,
              dateStr, dateFormatted,
              coverMentorId, coverMentor.name,
              `[Leave Cover] ${requestType} from ${startDate} to ${effectiveEndDate}. ${finalReason}`,
              new Date().toISOString(),
              slot.classGroup || "General",
              reqId, null, null
            ]
          );

          createdHandovers.push({ slotId, dateStr, course: slot.course, coverMentorId, coverMentorName: coverMentor.name });

          // MAIL-M04 Fix: Collect emails for batch sending instead of blocking per-mentor
          createdHandovers.push({ 
            slotId, 
            dateStr, 
            course: slot.course, 
            coverMentorId, 
            coverMentorName: coverMentor.name,
            coverMentorEmail: coverMentor.email,
            dateFormatted,
            time: slot.time,
            classGroup: slot.classGroup
          });
        } else {
          // No cover selected for this slot — mentor explicitly requested CAM to help in swap
          const slot = slotById.get(slotId);
          if (slot) {
            const handoverId = generateId("ho_cam");
            const [dY2, dM2, dD2] = dateStr.split("-").map(Number);
            const dateObj2 = new Date(dY2, dM2 - 1, dD2, 12, 0, 0);
            const dateFormatted = dateObj2.toLocaleDateString("en-IN", {
              weekday: "long", day: "2-digit", month: "short", year: "numeric"
            });

            await db.run(
              `INSERT INTO handover_requests (
                id, requestorId, requestorName, slotId, course, day, time,
                dateStr, dateFormatted, targetStaffId, targetStaffName,
                reason, status, timestamp, classGroup, request_type, compensates_handover_id,
                original_subject, original_month
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'needs_cm_allocation', ?, ?, 'leave_cover', ?, ?, ?)`,
              [
                handoverId, mentorId, mentor?.name || mentorId,
                slotId, slot.course, slot.day, slot.time,
                dateStr, dateFormatted,
                mentorId, "Needs CAM Allocation",
                `[CAM Help Requested] Faculty on ${requestType} (${startDate} to ${effectiveEndDate}). Reason: ${finalReason}`,
                new Date().toISOString(),
                slot.classGroup || "General",
                reqId, null, null
              ]
            );
          }
          needsManualCover.push({ slotId, dateStr, course: slot?.course, time: slot?.time });
        }
      }
    }

    try {
      await dispatchSystemNotification(db, {
        roles: ["cm", "admin", "kam"],
        collegeId: effectiveCollegeId,
        title: `New Faculty ${requestType} Request: ${mentor?.name || mentorId}`,
        message: `${mentor?.name || mentorId} applied for ${requestType} from ${startDate} to ${effectiveEndDate}. Reason: ${finalReason}`,
        link: "/cm/approvals",
        type: "warning",
        domain: "faculty_leave",
        action: "submitted",
        payload: { requestId: reqId, mentorId, startDate, endDate: effectiveEndDate, requestType }
      });
    } catch (notifErr) {
      console.error("[faculty-leave] dispatch leave submitted notification error:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message: `${requestType} request submitted successfully!${createdHandovers.length > 0 ? ` Cover requests are being sent for ${createdHandovers.length} class(es).` : ""} The Campus Manager has been notified for review.`,
      requestId: reqId,
      createdHandovers,
      needsManualCover
    });
  } catch (error: any) {
    console.error("POST /api/requests/faculty-leave error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
