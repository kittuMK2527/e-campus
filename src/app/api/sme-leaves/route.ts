export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { normalizeRole } from "@/lib/api-auth";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";
import { getInstitutionDateStr } from "@/lib/localDate";
import {
  validateLeaveDateRange,
  resolveMentorsUnderSme,
  buildSmeLeaveNotification,
  buildSmeLeaveCancelNotification
} from "@/lib/smeLeaves";

async function resolveCallerSme(db: any, user: any, requestedSmeId?: string | null) {
  const role = normalizeRole(user?.role);
  const canSpecifyOther = role === "admin" || role === "L and D";

  if (canSpecifyOther && requestedSmeId) {
    const row = await db.get(
      `SELECT id, name, email, subject, department, is_head_sme, head_subject_group, mentor_group
       FROM sme_users WHERE id = ? LIMIT 1`,
      [requestedSmeId]
    );
    return { sme: row || null, role, canSpecifyOther };
  }

  const refId = String(user?.reference_id || "").trim();
  const uid = String(user?.id || "").trim();
  const email = String(user?.email || "").trim();

  const row = await db.get(
    `SELECT id, name, email, subject, department, is_head_sme, head_subject_group, mentor_group
     FROM sme_users
     WHERE id = ? OR id = ? OR LOWER(email) = LOWER(?)
     LIMIT 1`,
    [refId, uid, email]
  );
  return { sme: row || null, role, canSpecifyOther };
}

async function requireSmeLeaveAccess(request: Request) {
  return requireAuth(request, {
    allowedRoles: ["sme", "L and D", "admin"]
  });
}

async function resolveTargetMentorsForLeave(
  db: any,
  sme: any,
  startDate: string,
  endDate: string
) {
  const [subjectGroups, mentors, demoSessions] = await db.multiQuery([
    { sql: "SELECT id, name, lead_sme_id FROM subject_groups", params: [] },
    { sql: "SELECT id, name, email, department, subjects, subject_group, mentor_group, status FROM mentors", params: [] },
    { sql: "SELECT id, mentorId, mentorName, smeId, dateStr, status FROM demo_sessions WHERE smeId = ?", params: [sme.id] }
  ]);
  return resolveMentorsUnderSme({
    sme,
    mentors: mentors || [],
    subjectGroups: subjectGroups || [],
    demoSessions: demoSessions || [],
    startDate,
    endDate
  });
}

export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireSmeLeaveAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("sme_leaves_table");

    const { searchParams } = new URL(request.url);
    const requestedSmeId = searchParams.get("smeId");
    const { sme, canSpecifyOther } = await resolveCallerSme(db, auth!.user, requestedSmeId);

    if (!sme && canSpecifyOther && !requestedSmeId) {
      const leaves = await db.all(
        "SELECT * FROM sme_leaves ORDER BY start_date DESC, created_at DESC LIMIT 250"
      );
      return NextResponse.json({ success: true, leaves });
    }

    if (!sme) {
      return NextResponse.json(
        { success: false, message: "SME profile not found for your account." },
        { status: 404 }
      );
    }

    const leaves = await db.all(
      "SELECT * FROM sme_leaves WHERE sme_id = ? ORDER BY start_date DESC, created_at DESC LIMIT 200",
      [sme.id]
    );

    return NextResponse.json({ success: true, smeId: sme.id, leaves });
  } catch (error: any) {
    console.error("GET /api/sme-leaves error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Failed to load SME leaves" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireSmeLeaveAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("sme_leaves_table");

    const body = await request.json();
    const {
      smeId: bodySmeId,
      startDate,
      endDate,
      leaveType = "Personal Leave",
      reason = ""
    } = body || {};

    const dateCheck = validateLeaveDateRange(startDate, endDate || startDate);
    if (!dateCheck.valid) {
      return NextResponse.json({ success: false, message: dateCheck.message }, { status: 400 });
    }

    const { sme } = await resolveCallerSme(db, auth!.user, bodySmeId);
    if (!sme) {
      return NextResponse.json(
        { success: false, message: "SME profile not found for this request." },
        { status: 404 }
      );
    }

    // Prevent duplicate/overlapping active leave entries so mentors are not alerted twice
    const existingOverlap = await db.get(
      `SELECT id, start_date, end_date FROM sme_leaves
       WHERE sme_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?
       LIMIT 1`,
      [sme.id, dateCheck.endDate, dateCheck.startDate]
    );
    if (existingOverlap) {
      return NextResponse.json(
        {
          success: false,
          message: `You already have leave marked for overlapping dates (${existingOverlap.start_date}${
            existingOverlap.end_date !== existingOverlap.start_date ? ` to ${existingOverlap.end_date}` : ""
          }).`
        },
        { status: 409 }
      );
    }

    // Resolve mentors strictly scoped to this SME
    const { mentors: matchedMentors } = await resolveTargetMentorsForLeave(
      db,
      sme,
      dateCheck.startDate,
      dateCheck.endDate
    );

    const leaveId = generateId("sme_lv");
    const cleanLeaveType = String(leaveType || "Personal Leave").trim().slice(0, 80) || "Personal Leave";
    const cleanReason = String(reason || "").trim().slice(0, 500);
    const nowIso = new Date().toISOString();

    await db.run(
      `INSERT INTO sme_leaves (
         id, sme_id, sme_name, leave_type, start_date, end_date, reason, status, notified_mentor_count, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        leaveId,
        sme.id,
        sme.name || auth!.user.name || "SME",
        cleanLeaveType,
        dateCheck.startDate,
        dateCheck.endDate,
        cleanReason || null,
        matchedMentors.length
      ]
    );

    let notifiedCount = 0;
    if (matchedMentors.length > 0) {
      const notifContent = buildSmeLeaveNotification({
        smeName: sme.name || auth!.user.name || "SME",
        smeSubject: sme.subject || sme.head_subject_group || sme.mentor_group || null,
        startDate: dateCheck.startDate,
        endDate: dateCheck.endDate,
        leaveType: cleanLeaveType,
        reason: cleanReason
      });

      const dispatchResult = await dispatchSystemNotification(db, {
        userIds: matchedMentors.map((m) => m.id),
        title: notifContent.title,
        message: notifContent.message,
        link: notifContent.link,
        type: "alert",
        domain: "notifications",
        dedupeKey: `sme_leave_${leaveId}`,
        push: true,
        payload: {
          leaveId,
          smeId: sme.id,
          smeName: sme.name,
          startDate: dateCheck.startDate,
          endDate: dateCheck.endDate,
          leaveType: cleanLeaveType
        }
      });
      notifiedCount = dispatchResult.count;
    }

    const auditId = generateId("audit");
    await db
      .run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'sme_leave_marked', ?, ?, ?, ?)`,
        [
          auditId,
          `SME ${sme.name || sme.id} marked ${cleanLeaveType} from ${dateCheck.startDate} to ${dateCheck.endDate} (notified ${notifiedCount} mentors).`,
          sme.name || auth!.user.name || auth!.user.email,
          auth!.user.role,
          nowIso
        ]
      )
      .catch(() => {});

    const createdLeave = await db.get("SELECT * FROM sme_leaves WHERE id = ?", [leaveId]);

    return NextResponse.json({
      success: true,
      leave: createdLeave || {
        id: leaveId,
        sme_id: sme.id,
        sme_name: sme.name,
        leave_type: cleanLeaveType,
        start_date: dateCheck.startDate,
        end_date: dateCheck.endDate,
        reason: cleanReason || null,
        status: "approved",
        notified_mentor_count: notifiedCount,
        created_at: nowIso
      },
      notifiedCount,
      matchedMentors: matchedMentors.map((m) => ({
        id: m.id,
        name: m.name,
        matchedVia: m.matchedVia
      })),
      message:
        notifiedCount > 0
          ? `Leave marked (${dateCheck.startDate}${dateCheck.endDate !== dateCheck.startDate ? ` to ${dateCheck.endDate}` : ""}) and notified ${notifiedCount} mentor${notifiedCount === 1 ? "" : "s"} under you.`
          : `Leave marked (${dateCheck.startDate}${dateCheck.endDate !== dateCheck.startDate ? ` to ${dateCheck.endDate}` : ""}). No active mentors matched your SME group/sessions.`
    });
  } catch (error: any) {
    console.error("POST /api/sme-leaves error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Failed to mark SME leave" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { auth, errorResponse } = await requireSmeLeaveAccess(request);
    if (errorResponse) return errorResponse;

    const db = await getDb();
    await ensureMigration("sme_leaves_table");

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing leave id" }, { status: 400 });
    }

    const leave = await db.get("SELECT * FROM sme_leaves WHERE id = ? LIMIT 1", [id]);
    if (!leave) {
      return NextResponse.json({ success: false, message: "Leave record not found" }, { status: 404 });
    }

    const { sme, canSpecifyOther } = await resolveCallerSme(db, auth!.user, leave.sme_id);
    if (!canSpecifyOther && (!sme || String(sme.id) !== String(leave.sme_id))) {
      return NextResponse.json({ success: false, message: "Forbidden: cannot cancel another SME's leave." }, { status: 403 });
    }

    if (String(leave.status) === "cancelled") {
      return NextResponse.json({ success: true, leave, message: "Leave is already cancelled." });
    }

    await db.run(
      "UPDATE sme_leaves SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );

    const todayStr = getInstitutionDateStr();
    const smeRecord = sme || (await db.get("SELECT id, name, subject, department, head_subject_group, mentor_group FROM sme_users WHERE id = ? LIMIT 1", [leave.sme_id]));

    if (smeRecord && String(leave.end_date || leave.start_date) >= todayStr) {
      const { mentors: matchedMentors } = await resolveTargetMentorsForLeave(
        db,
        smeRecord,
        leave.start_date,
        leave.end_date
      );

      if (matchedMentors.length > 0) {
        const cancelNotif = buildSmeLeaveCancelNotification({
          smeName: smeRecord.name || leave.sme_name || "SME",
          smeSubject: smeRecord.subject || smeRecord.head_subject_group || smeRecord.mentor_group || null,
          startDate: leave.start_date,
          endDate: leave.end_date
        });
        await dispatchSystemNotification(db, {
          userIds: matchedMentors.map((m) => m.id),
          title: cancelNotif.title,
          message: cancelNotif.message,
          link: cancelNotif.link,
          type: "info",
          domain: "notifications",
          dedupeKey: `sme_leave_cancel_${id}`,
          push: false,
          payload: { leaveId: id, smeId: smeRecord.id, cancelled: true }
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, id, message: "Leave cancelled successfully." });
  } catch (error: any) {
    console.error("DELETE /api/sme-leaves error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Failed to cancel leave" }, { status: 500 });
  }
}
