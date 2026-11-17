export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { getInstitutionDateStr } from "@/lib/localDate";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    await ensureMigration("cm_attendance_and_leave_tables");
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const camId = searchParams.get("camId");
    const collegeId = searchParams.get("collegeId");
    const kamId = searchParams.get("kamId");
    const dateStr = searchParams.get("dateStr") || getInstitutionDateStr();
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 1. Fetch attendance history for a single Campus Manager
    if (camId) {
      const records = await db.all(
        `SELECT ca.*, cm.name as cam_name, cm.email as cam_email, c.name as college_name
         FROM cm_attendance ca
         JOIN campus_managers cm ON ca.cam_id = cm.id
         LEFT JOIN colleges c ON ca.college_id = c.id
         WHERE ca.cam_id = ?
         ORDER BY ca.date_str DESC LIMIT 100`,
        [camId]
      );
      return NextResponse.json({ success: true, records, dateStr });
    }

    // 2. Fetch attendance roster for a KAM or specific college
    let cmQuery = `
      SELECT cm.id, cm.name, cm.email, cm.college_id, cm.kam_id, c.name as college_name
      FROM campus_managers cm
      LEFT JOIN colleges c ON cm.college_id = c.id
      WHERE 1=1
    `;
    const cmParams: any[] = [];

    if (kamId) {
      cmQuery += ` AND (cm.kam_id = ? OR c.kam_id = ?)`;
      cmParams.push(kamId, kamId);
    }
    if (collegeId && collegeId !== "all") {
      cmQuery += ` AND cm.college_id = ?`;
      cmParams.push(collegeId);
    }

    cmQuery += ` ORDER BY cm.name ASC`;

    // The CM roster and the punches are independent; one round trip serves both, and
    // a failed slice cannot quietly render everyone as "Not Punched".
    const attendanceSlice = startDate && endDate
      ? {
          sql: `SELECT ca.*, cm.name as cam_name, cm.email as cam_email, c.name as college_name
               FROM cm_attendance ca
               JOIN campus_managers cm ON ca.cam_id = cm.id
               LEFT JOIN colleges c ON ca.college_id = c.id
               WHERE ca.date_str >= ? AND ca.date_str <= ?
               ORDER BY ca.date_str DESC`,
          params: [startDate, endDate],
        }
      : { sql: `SELECT * FROM cm_attendance WHERE date_str = ?`, params: [dateStr] };

    const rosterFailures: QueryFailure[] = [];
    const [cmList, attRecords] = await db.multiQuery(
      [{ sql: cmQuery, params: cmParams }, attendanceSlice],
      rosterFailures
    );
    if (rosterFailures.length > 0) {
      return NextResponse.json({ success: false, error: "Could not load CM attendance. Please try again." }, { status: 500 });
    }

    if (startDate && endDate) {
      return NextResponse.json({ success: true, records: attRecords, cms: cmList });
    }

    const attMap = new Map<string, any>();
    attRecords.forEach((r: any) => attMap.set(r.cam_id, r));

    const roster = cmList.map((cm: any) => {
      const att = attMap.get(cm.id);
      return {
        camId: cm.id,
        name: cm.name,
        email: cm.email,
        collegeId: cm.college_id,
        collegeName: cm.college_name || "Assigned Campus",
        kamId: cm.kam_id,
        dateStr,
        status: att?.status || "Not Punched",
        punchInTime: att?.punch_in_time || null,
        punchOutTime: att?.punch_out_time || null,
        reason: att?.reason || null,
        approvedBy: att?.approved_by || null,
        approvalStatus: att?.approval_status || "pending",
        approvalNotes: att?.approval_notes || null,
        attendanceId: att?.id || null
      };
    });

    return NextResponse.json({ success: true, roster, dateStr });
  } catch (error: any) {
    console.error("API GET /api/cm-attendance error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    await ensureMigration("cm_attendance_and_leave_tables");
    const db = await getDb();
    const body = await request.json();

    const {
      camId: rawCamId,
      collegeId,
      dateStr: clientDateStr,
      status = "Present",
      punchInTime,
      punchOutTime,
      reason
    } = body;

    // ── SECURITY: Identity enforcement ──────────────────────────
    // CMs can only punch for themselves; KAMs/Admins can punch on behalf.
    const callerRole = auth?.user?.role;
    const callerRefId = auth?.user?.reference_id;
    const camId = callerRole === "cm" ? callerRefId : rawCamId;

    if (!camId) {
      return NextResponse.json({ success: false, message: "Missing required field: camId" }, { status: 400 });
    }

    // ── SECURITY: Server-authoritative date & time ──────────────
    // Self-punch always uses server IST date & time. KAM/Admin marking
    // attendance for a CM can supply a date but never a future date.
    const serverToday = getInstitutionDateStr();
    const isSelfPunch = callerRole === "cm";
    let effectiveDateStr: string;
    if (isSelfPunch) {
      // CMs always punch for today only — ignore client date entirely
      effectiveDateStr = serverToday;
    } else {
      effectiveDateStr = clientDateStr || serverToday;
      // Reject future dates
      if (effectiveDateStr > serverToday) {
        return NextResponse.json(
          { success: false, message: "Cannot mark attendance for a future date." },
          { status: 400 }
        );
      }
      // Reject dates more than 7 days in the past
      const sevenDaysAgo = getInstitutionDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      if (effectiveDateStr < sevenDaysAgo) {
        return NextResponse.json(
          { success: false, message: "Cannot mark attendance for a date older than 7 days." },
          { status: 400 }
        );
      }
    }

    // Resolve college ID if not provided
    let effectiveCollegeId = collegeId;
    if (!effectiveCollegeId) {
      const cm = await db.get("SELECT college_id FROM campus_managers WHERE id = ?", [camId]);
      effectiveCollegeId = cm?.college_id || "general";
    }

    const dateStr = effectiveDateStr;
    const recId = `cm_att_${camId}_${dateStr}`;
    // Server-authoritative punch time in IST — never trust client clock
    const nowTime = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
    const finalPunchIn = isSelfPunch ? nowTime : (punchInTime || nowTime);

    const isPg = (db as any).isPostgres;
    const nowTimestamp = new Date().toISOString();

    if (isPg) {
      await db.run(
        `INSERT INTO cm_attendance (id, cam_id, college_id, date_str, status, punch_in_time, punch_out_time, reason, approval_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())
         ON CONFLICT (cam_id, date_str) DO UPDATE SET
           status = EXCLUDED.status,
           punch_in_time = COALESCE(EXCLUDED.punch_in_time, cm_attendance.punch_in_time),
           punch_out_time = COALESCE(EXCLUDED.punch_out_time, cm_attendance.punch_out_time),
           reason = COALESCE(EXCLUDED.reason, cm_attendance.reason),
           updated_at = NOW()`,
        [recId, camId, effectiveCollegeId, dateStr, status, finalPunchIn, punchOutTime || null, reason || null]
      );
    } else {
      await db.run(
        `INSERT INTO cm_attendance (id, cam_id, college_id, date_str, status, punch_in_time, punch_out_time, reason, approval_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT (cam_id, date_str) DO UPDATE SET
           status = excluded.status,
           punch_in_time = COALESCE(excluded.punch_in_time, cm_attendance.punch_in_time),
           punch_out_time = COALESCE(excluded.punch_out_time, cm_attendance.punch_out_time),
           reason = COALESCE(excluded.reason, cm_attendance.reason),
           updated_at = ?`,
        [recId, camId, effectiveCollegeId, dateStr, status, finalPunchIn, punchOutTime || null, reason || null, nowTimestamp, nowTimestamp, nowTimestamp]
      );
    }

    return NextResponse.json({
      success: true,
      message: `Campus Manager attendance marked as ${status} successfully.`,
      record: {
        id: recId,
        camId,
        collegeId: effectiveCollegeId,
        dateStr,
        status,
        punchInTime: finalPunchIn,
        punchOutTime: punchOutTime || null,
        reason: reason || null,
        approvalStatus: "pending"
      }
    });
  } catch (error: any) {
    console.error("API POST /api/cm-attendance error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["kam", "admin"] });
    if (errorResponse) return errorResponse;
    await ensureMigration("cm_attendance_and_leave_tables");
    const db = await getDb();
    const body = await request.json();

    const {
      id,
      camId,
      dateStr,
      status,
      approvalStatus = "approved",
      approvedBy = "KAM Administrator",
      approvalNotes
    } = body;

    const isPg = (db as any).isPostgres;
    const nowTimestamp = new Date().toISOString();

    if (id) {
      if (isPg) {
        await db.run(
          `UPDATE cm_attendance
           SET approval_status = ?, approved_by = ?, approval_notes = ?, status = COALESCE(?, status), updated_at = NOW()
           WHERE id = ?`,
          [approvalStatus, approvedBy, approvalNotes || null, status || null, id]
        );
      } else {
        await db.run(
          `UPDATE cm_attendance
           SET approval_status = ?, approved_by = ?, approval_notes = ?, status = COALESCE(?, status), updated_at = ?
           WHERE id = ?`,
          [approvalStatus, approvedBy, approvalNotes || null, status || null, nowTimestamp, id]
        );
      }
    } else if (camId && dateStr) {
      if (isPg) {
        await db.run(
          `UPDATE cm_attendance
           SET approval_status = ?, approved_by = ?, approval_notes = ?, status = COALESCE(?, status), updated_at = NOW()
           WHERE cam_id = ? AND date_str = ?`,
          [approvalStatus, approvedBy, approvalNotes || null, status || null, camId, dateStr]
        );
      } else {
        await db.run(
          `UPDATE cm_attendance
           SET approval_status = ?, approved_by = ?, approval_notes = ?, status = COALESCE(?, status), updated_at = ?
           WHERE cam_id = ? AND date_str = ?`,
          [approvalStatus, approvedBy, approvalNotes || null, status || null, nowTimestamp, camId, dateStr]
        );
      }
    } else {
      return NextResponse.json({ success: false, message: "Missing identifier (id or camId + dateStr)" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Campus Manager attendance ${approvalStatus} successfully.`
    });
  } catch (error: any) {
    console.error("API PATCH /api/cm-attendance error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
