export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { getInstitutionDateStr } from "@/lib/localDate";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const collegeId = searchParams.get("collegeId");
    const kamId = searchParams.get("kamId");
    const mentorId = searchParams.get("mentorId");
    const dateStr = searchParams.get("dateStr") || getInstitutionDateStr();

    // 1. Fetch attendance history for a single mentor
    if (mentorId && !collegeId && !kamId) {
      const records = await db.all(
        `SELECT ma.*, m.name as mentorName, m.department, c.name as collegeName
         FROM mentor_attendance ma
         JOIN mentors m ON ma.mentor_id = m.id
         LEFT JOIN colleges c ON ma.college_id = c.id
         WHERE ma.mentor_id = ?
         ORDER BY ma.date_str DESC`,
        [mentorId]
      );
      return NextResponse.json({ success: true, records, dateStr });
    }

    // 2. Fetch attendance for a specific college (single date or date range)
    if (collegeId) {
      const startDate = searchParams.get("startDate");
      const endDate = searchParams.get("endDate");
      const isRange = Boolean(startDate && endDate);

      // Roster and punches are independent, so one round trip serves both — and a
      // failed slice would render every mentor as "Not Punched".
      const attendanceSlice = isRange
        ? {
            sql: `SELECT * FROM mentor_attendance 
                  WHERE (LOWER(college_id) = LOWER(?) OR mentor_id IN (SELECT id FROM mentors WHERE LOWER(college_id) = LOWER(?)))
                    AND date_str >= ? AND date_str <= ?
                  ORDER BY date_str ASC`,
            params: [collegeId, collegeId, startDate, endDate],
          }
        : {
            sql: `SELECT * FROM mentor_attendance 
                  WHERE (LOWER(college_id) = LOWER(?) OR mentor_id IN (SELECT id FROM mentors WHERE LOWER(college_id) = LOWER(?))) 
                    AND date_str = ?`,
            params: [collegeId, collegeId, dateStr],
          };

      const rosterFailures: QueryFailure[] = [];
      const [mentors, attendanceRecords] = await db.multiQuery(
        [
          {
            sql: `SELECT m.id, m.name, m.email, m.department, m.college_id, m.subject_group, m.mentor_group
                  FROM mentors m
                  WHERE LOWER(m.college_id) = LOWER(?)
                  ORDER BY m.name ASC`,
            params: [collegeId],
          },
          attendanceSlice,
        ],
        rosterFailures
      );
      if (rosterFailures.length > 0) {
        return NextResponse.json({ success: false, error: "Could not load mentor attendance. Please try again." }, { status: 500 });
      }

      if (isRange) {
        // Group attendance by mentor_id
        const mentorAttMap = new Map<string, any[]>();
        const distinctDates = Array.from(new Set(attendanceRecords.map(r => r.date_str))).sort();

        attendanceRecords.forEach(r => {
          if (!mentorAttMap.has(r.mentor_id)) mentorAttMap.set(r.mentor_id, []);
          mentorAttMap.get(r.mentor_id)!.push(r);
        });

        const combined = mentors.map(m => {
          const mRecords = mentorAttMap.get(m.id) || [];
          const recordMap = new Map(mRecords.map(r => [r.date_str, r]));
          
          const present = mRecords.filter(r => r.status === "Present").length;
          const od = mRecords.filter(r => r.status === "OD").length;
          const leave = mRecords.filter(r => r.status === "Leave").length;
          const absent = mRecords.filter(r => r.status === "Absent").length;
          const halfDay = mRecords.filter(r => r.status === "Half-Day").length;
          const recordedDays = mRecords.length;
          const totalDays = distinctDates.length || 1;
          const pct = totalDays > 0 ? (((present + od + (halfDay * 0.5)) / totalDays) * 100).toFixed(1) : "0.0";

          return {
            mentorId: m.id,
            name: m.name,
            email: m.email,
            department: m.department || "General",
            collegeId: m.college_id,
            presentDays: present,
            odDays: od,
            leaveDays: leave,
            absentDays: absent,
            halfDays: halfDay,
            recordedDays,
            totalDays,
            attendancePct: pct,
            status: mRecords.length > 0 ? mRecords[mRecords.length - 1].status : "Not Punched",
            punchInTime: mRecords.length > 0 ? mRecords[mRecords.length - 1].punch_in_time : null,
            punchOutTime: mRecords.length > 0 ? mRecords[mRecords.length - 1].punch_out_time : null,
            dailyMap: Object.fromEntries(mRecords.map(r => [r.date_str, { status: r.status, punchIn: r.punch_in_time, reason: r.reason }])),
            history: mRecords
          };
        });

        return NextResponse.json({
          success: true,
          isRange: true,
          startDate,
          endDate,
          distinctDates,
          records: combined,
          summary: {
            totalMentors: mentors.length,
            totalDays: distinctDates.length,
            totalPresentSlots: attendanceRecords.filter(r => r.status === "Present").length,
            totalODSlots: attendanceRecords.filter(r => r.status === "OD").length,
            totalLeaveSlots: attendanceRecords.filter(r => r.status === "Leave").length,
            totalAbsentSlots: attendanceRecords.filter(r => r.status === "Absent").length,
            avgAttendancePct: combined.length > 0
              ? (combined.reduce((acc, c) => acc + parseFloat(c.attendancePct), 0) / combined.length).toFixed(1)
              : "0.0"
          }
        });
      }

      // Single Date logic
      const attendanceMap = new Map(attendanceRecords.map(r => [r.mentor_id, r]));

      const combined = mentors.map(m => {
        const att = attendanceMap.get(m.id);
        return {
          mentorId: m.id,
          name: m.name,
          email: m.email,
          department: m.department || "General",
          collegeId: m.college_id,
          status: att ? att.status : "Not Punched",
          punchInTime: att ? att.punch_in_time : null,
          punchOutTime: att ? att.punch_out_time : null,
          reason: att ? att.reason : null,
          markedBy: att ? att.marked_by : null,
          updatedAt: att ? att.updated_at : null,
          id: att ? att.id : null,
        };
      });

      return NextResponse.json({
        success: true,
        isRange: false,
        dateStr,
        records: combined,
        summary: {
          total: mentors.length,
          present: combined.filter(c => c.status === "Present").length,
          od: combined.filter(c => c.status === "OD").length,
          leave: combined.filter(c => c.status === "Leave").length,
          absent: combined.filter(c => c.status === "Absent").length,
          halfDay: combined.filter(c => c.status === "Half-Day").length,
          unpunched: combined.filter(c => c.status === "Not Punched").length,
        }
      });
    }

    // 3. Fetch cross-college attendance for a KAM
    if (kamId) {
      const colleges = await db.all(
        `SELECT id, name FROM colleges WHERE kam_id = ?`,
        [kamId]
      );
      const collegeIds = colleges.map(c => c.id);

      if (collegeIds.length === 0) {
        return NextResponse.json({ success: true, dateStr, records: [], summary: { total: 0, present: 0, od: 0, leave: 0, absent: 0, unpunched: 0 } });
      }

      const placeholders = collegeIds.map(() => "?").join(",");
      const kamFailures: QueryFailure[] = [];
      const [mentors, attendanceRecords] = await db.multiQuery(
        [
          {
            sql: `SELECT m.id, m.name, m.email, m.department, m.college_id, c.name as collegeName
                  FROM mentors m
                  LEFT JOIN colleges c ON m.college_id = c.id
                  WHERE m.college_id IN (${placeholders})
                  ORDER BY c.name ASC, m.name ASC`,
            params: collegeIds,
          },
          {
            sql: `SELECT * FROM mentor_attendance WHERE date_str = ? AND college_id IN (${placeholders})`,
            params: [dateStr, ...collegeIds],
          },
        ],
        kamFailures
      );
      if (kamFailures.length > 0) {
        return NextResponse.json({ success: false, error: "Could not load mentor attendance. Please try again." }, { status: 500 });
      }

      const attendanceMap = new Map(attendanceRecords.map(r => [r.mentor_id, r]));

      const combined = mentors.map(m => {
        const att = attendanceMap.get(m.id);
        return {
          mentorId: m.id,
          name: m.name,
          email: m.email,
          department: m.department || "General",
          collegeId: m.college_id,
          collegeName: m.collegeName || "Unknown College",
          status: att ? att.status : "Not Punched",
          punchInTime: att ? att.punch_in_time : null,
          reason: att ? att.reason : null,
          markedBy: att ? att.marked_by : null,
          updatedAt: att ? att.updated_at : null,
        };
      });

      return NextResponse.json({
        success: true,
        dateStr,
        colleges,
        records: combined,
        summary: {
          total: mentors.length,
          present: combined.filter(c => c.status === "Present").length,
          od: combined.filter(c => c.status === "OD").length,
          leave: combined.filter(c => c.status === "Leave").length,
          absent: combined.filter(c => c.status === "Absent").length,
          halfDay: combined.filter(c => c.status === "Half-Day").length,
          unpunched: combined.filter(c => c.status === "Not Punched").length,
        }
      });
    }

    // Default: Return today's attendance across all mentors
    const records = await db.all(
      `SELECT ma.*, m.name as mentorName, m.department, c.name as collegeName
       FROM mentor_attendance ma
       JOIN mentors m ON ma.mentor_id = m.id
       LEFT JOIN colleges c ON ma.college_id = c.id
       WHERE ma.date_str = ?
       ORDER BY ma.updated_at DESC`,
      [dateStr]
    );

    return NextResponse.json({ success: true, dateStr, records });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["mentor", "cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const actor = auth!.user;
    const db = await getDb();
    const body = await request.json();
    const { action } = body;

    const currentTime = new Date().toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

    // 1. Bulk mark all unpunched mentors in a college as Present
    if (action === "bulk_present") {
      const { collegeId, dateStr } = body;

      if (actor.role === "mentor") {
        return NextResponse.json(
          { success: false, message: "Only Campus Managers or admins can bulk-mark a campus." },
          { status: 403 }
        );
      }
      if (!collegeId || !dateStr) {
        return NextResponse.json({ success: false, message: "Missing collegeId or dateStr" }, { status: 400 });
      }

      const mentors = await db.all(
        `SELECT id FROM mentors WHERE college_id = ?`,
        [collegeId]
      );

      let count = 0;
      if (mentors.length > 0) {
        await db.transaction(async (tx) => {
          for (const m of mentors) {
            const id = `att_${m.id}_${dateStr}`;
            await tx.run(
              `INSERT INTO mentor_attendance (id, mentor_id, college_id, date_str, status, punch_in_time, marked_by, marked_by_id, updated_at)
               VALUES (?, ?, ?, ?, 'Present', ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(mentor_id, date_str) DO UPDATE SET
               status = excluded.status,
               punch_in_time = COALESCE(mentor_attendance.punch_in_time, excluded.punch_in_time),
               marked_by = excluded.marked_by,
               marked_by_id = excluded.marked_by_id,
               updated_at = CURRENT_TIMESTAMP`,
              [id, m.id, collegeId, dateStr, currentTime, actor.name, actor.reference_id]
            );
            count++;
          }
        });
      }

      return NextResponse.json({
        success: true,
        message: `Successfully marked ${count} mentors as Present for ${dateStr}.`,
        updatedCount: count
      });
    }

    // 2. Punch or Update single mentor attendance
    const {
      mentorId,
      collegeId,
      dateStr,
      status,
      punchInTime,
      reason,
    } = body;

    if (!mentorId || !status) {
      return NextResponse.json({ success: false, message: "Missing mentorId or status" }, { status: 400 });
    }

    // Self vs proxy used to come from the request body, so a mentor could send
    // markedBy:"cm" and edit an already-locked punch (or another mentor's record).
    const isSelf = actor.role === "mentor";
    if (isSelf && String(mentorId) !== String(actor.reference_id)) {
      return NextResponse.json(
        { success: false, message: "Mentors can only punch their own attendance." },
        { status: 403 }
      );
    }
    const markedBy = isSelf ? "self" : actor.name;
    const markedById = actor.reference_id;

    const effectiveDate = dateStr || getInstitutionDateStr();
    const recordId = `att_${mentorId}_${effectiveDate}`;

    // The mentor's college (only needed when the caller did not send one) and the day's
    // existing punch record (only consulted for self-punches) are independent reads, so
    // the common path costs one round trip instead of two. Both gate the write below,
    // so a failed slice aborts rather than punching over a locked day.
    const punchFailures: QueryFailure[] = [];
    const [mentorRows, existingRows] = await db.multiQuery(
      [
        collegeId
          ? { sql: "SELECT 1 WHERE 1=0" }
          : { sql: "SELECT college_id FROM mentors WHERE id = ?", params: [mentorId] },
        isSelf
          ? { sql: `SELECT id, status, punch_in_time FROM mentor_attendance WHERE mentor_id = ? AND date_str = ?`, params: [mentorId, effectiveDate] }
          : { sql: "SELECT 1 WHERE 1=0" },
      ],
      punchFailures
    );
    if (punchFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not check this punch against today's record. Please try again." }, { status: 500 });
    }

    const effectiveCollegeId = collegeId || mentorRows[0]?.college_id || "general";

    // Prevent mentors from changing status once punched (self-punch is locked)
    if (isSelf) {
      const existing = existingRows[0] || null;
      if (existing && existing.status && existing.status !== "Not Punched") {
        return NextResponse.json({
          success: false,
          message: `Attendance is already marked as '${existing.status}' for today. Status cannot be changed.`
        }, { status: 400 });
      }
    }

    const punchTime = punchInTime || currentTime;

    await db.run(
      `INSERT INTO mentor_attendance (id, mentor_id, college_id, date_str, status, punch_in_time, reason, marked_by, marked_by_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(mentor_id, date_str) DO UPDATE SET
       status = excluded.status,
       punch_in_time = COALESCE(excluded.punch_in_time, mentor_attendance.punch_in_time),
       reason = excluded.reason,
       marked_by = excluded.marked_by,
       marked_by_id = excluded.marked_by_id,
       updated_at = CURRENT_TIMESTAMP`,
      [
        recordId,
        mentorId,
        effectiveCollegeId,
        effectiveDate,
        status,
        punchTime,
        reason || null,
        markedBy || "self",
        markedById || mentorId
      ]
    );

    notifyRealtimeEvent({
      domain: "attendance",
      action: "mentor_punched",
      collegeId: effectiveCollegeId,
      targetRoles: ["cm", "kam", "admin"],
      payload: { mentorId, status, effectiveDate }
    });

    return NextResponse.json({
      success: true,
      message: `Attendance marked as ${status} for ${effectiveDate}`,
      record: {
        id: recordId,
        mentorId,
        collegeId: effectiveCollegeId,
        dateStr: effectiveDate,
        status,
        punchInTime: punchTime,
        reason: reason || null,
        markedBy: markedBy || "self"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
