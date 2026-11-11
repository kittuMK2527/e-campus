import { NextRequest, NextResponse } from "next/server";
import { getDb, allCapped, ROW_CAP, type QueryFailure } from "@/lib/db";
import { requireAuth, Role } from "@/lib/authGuard";
import { getInstitutionDateStr, getInstitutionDateStrOffset } from "@/lib/localDate";
import { generateId } from "@/lib/id";
import { ensureMigration } from "@/lib/migrations";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";

// Without this, Vercel routes to iad1 (Washington DC) → ~200ms per DB call
export const maxDuration = 60; // seconds — bulk imports need breathing room
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

/**
 * Bulk imports build hundreds of rows inside the same millisecond, so a
 * `Date.now()` prefix plus a short random suffix can land on a duplicate
 * primary key and fail the whole batch. UUID keeps the id unique per row.
 */
function makeAttendanceId(): string {
  return `att_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

// Roles allowed to read attendance. This route has no per-student scoping —
// the college_id / studentId filters are advisory — so a student session must
// not be able to enumerate other students' records through it.
const ATTENDANCE_READ_ROLES: Role[] = [
  "admin", "cm", "kam", "mentor", "sme", "fee_manager", "L and D", "hr"
];

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ATTENDANCE_READ_ROLES });
    if (errorResponse) return errorResponse;

    await ensureMigration("student_attendance_extended_columns").catch(() => {});
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const slotId = searchParams.get("slotId");
    const dateStr = searchParams.get("dateStr");
    const studentId = searchParams.get("studentId");
    const collegeId = searchParams.get("college_id") || searchParams.get("collegeId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // ── 0. Campus-wide bulk fetch for CAM monitoring tab ──────────────────
    // GET /api/attendance?college_id=xxx[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
    if (collegeId && !slotId && !studentId) {
      let sql = `
        SELECT sa.id, sa.studentId, sa.slotId, sa.dateStr, sa.status, sa.type, sa.mode
        FROM student_attendance sa
        JOIN students st ON sa.studentId = st.id
        WHERE st.college_id = ?`;
      const args: any[] = [collegeId];
      if (startDate) { sql += " AND sa.dateStr >= ?"; args.push(startDate); }
      if (endDate) { sql += " AND sa.dateStr <= ?"; args.push(endDate); }
      // Default 60-day window if no date params given — prevents unbounded full-table scan
      if (!startDate && !endDate) {
        sql += " AND sa.dateStr >= ?";
        args.push(getInstitutionDateStrOffset(-60));
      }
      sql += " ORDER BY sa.dateStr DESC LIMIT 15000";
      const records = await db.all(sql, args);
      return NextResponse.json({ success: true, records, count: records.length }, { headers: noCacheHeaders });
    }

    // ── 1. Student historical logs (for CAM correction modal) ─────────────
    if (studentId && !slotId && !dateStr) {
      // The ledger and the correction counter key off the same studentId, so they leave
      // as one group instead of two sequential round trips. The ceiling check is kept
      // here because batching replaces the allCapped() wrapper that used to enforce it.
      const historyFailures: QueryFailure[] = [];
      const [records, studentRows] = await db.multiQuery([
        {
          sql: `SELECT sa.*, s.time as timeSlot, s.course as subject, s.classGroup
         FROM student_attendance sa
         JOIN slots s ON sa.slotId = s.id
         WHERE sa.studentId = ?
         ORDER BY sa.dateStr DESC, s.time ASC LIMIT ${ROW_CAP + 1}`,
          params: [studentId]
        },
        { sql: "SELECT correction_count FROM students WHERE id = ?", params: [studentId] }
      ], historyFailures);
      if (historyFailures.length > 0) {
        return NextResponse.json({ success: false, error: "Attendance history could not be loaded. Please retry." }, { status: 500, headers: noCacheHeaders });
      }
      if (records.length > ROW_CAP) {
        return NextResponse.json({ success: false, error: `Read passed its ${ROW_CAP}-row ceiling for student attendance history.` }, { status: 500, headers: noCacheHeaders });
      }
      const student = studentRows[0];
      return NextResponse.json({
        success: true,
        records,
        correctionCount: student ? (student.correction_count || 0) : 0
      }, { headers: noCacheHeaders });
    }

    // ── 2. Single slot + date lookup ──────────────────────────────────────
    if (!slotId || !dateStr) {
      return NextResponse.json({ success: false, message: "Missing slotId or dateStr" }, { status: 400, headers: noCacheHeaders });
    }

    let records;
    if (studentId) {
      records = await db.all(
        "SELECT * FROM student_attendance WHERE slotId = ? AND dateStr = ? AND studentId = ?",
        [slotId, dateStr, studentId]
      );
    } else {
      records = await db.all(
        "SELECT * FROM student_attendance WHERE slotId = ? AND dateStr = ?",
        [slotId, dateStr]
      );
    }

    const isMarked = records.length > 0;
    return NextResponse.json({
      success: true,
      isMarked,
      count: records.length,
      records
    }, { headers: noCacheHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noCacheHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam", "mentor"],
      checkCsrf: true
    });
    if (errorResponse) return errorResponse;

    const actor = auth!.user;
    const actorRole = actor.role?.toLowerCase() || "";
    const isRealAdmin = actorRole === "admin" || actorRole === "super admin";
    const actorCollegeId = actor.college_id;
    const realActorName = actor.name || actor.email || (isRealAdmin ? "Admin" : "Campus Manager");

    const db = await getDb();
    const body = await request.json();
    const { action } = body;

    // ── ATTENDANCE CORRECTION BY CAM / ADMIN ───────────────────────
    if (action === "correct") {
      if (actorRole === "mentor") {
        return NextResponse.json(
          { success: false, message: "Mentors cannot directly correct locked attendance. Please request CM approval." },
          { status: 403 }
        );
      }

      const {
        studentId,
        slotId,
        dateStr,
        newStatus,
        reason
      } = body;

      if (!studentId || !slotId || !dateStr || !newStatus || !reason) {
        return NextResponse.json({ success: false, message: "Missing required fields for correction" }, { status: 400 });
      }

      const correctFailures: QueryFailure[] = [];
      const [studentRows, existingRows] = await db.multiQuery(
        [
          { sql: "SELECT id, name, college_id, correction_count FROM students WHERE id = ?", params: [studentId] },
          { sql: "SELECT status FROM student_attendance WHERE studentId = ? AND slotId = ? AND dateStr = ?", params: [studentId, slotId, dateStr] },
        ],
        correctFailures
      );
      if (correctFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not verify this correction. Please try again." }, { status: 500 });
      }

      // Check current student status & correction count
      const student = studentRows[0];
      if (!student) {
        return NextResponse.json({ success: false, message: "Student not found" }, { status: 404 });
      }

      // Campus isolation: CM can only correct students in their own assigned campus
      if (actorRole === "cm" && actorCollegeId && student.college_id) {
        if (student.college_id.toLowerCase() !== actorCollegeId.toLowerCase()) {
          return NextResponse.json(
            { success: false, message: "Unauthorized: You can only correct attendance for students of your assigned campus." },
            { status: 403 }
          );
        }
      }

      const currentCount = student.correction_count || 0;
      // Bug 2 Fix: Only genuine verified admin session can override the 2-correction limit
      const verifiedAdminOverride = isRealAdmin;

      if (currentCount >= 2 && !verifiedAdminOverride) {
        return NextResponse.json({
          success: false,
          message: `Correction blocked: ${student.name} has already utilized all 2 attendance corrections. Requires verified Admin override.`
        });
      }

      // Check old status
      const existing = existingRows[0];
      const oldStatus = existing ? existing.status : "not_marked";

      if (oldStatus === newStatus) {
        return NextResponse.json({ success: false, message: `Status is already ${newStatus}.` });
      }

      if (existing) {
        // Update existing
        await db.run(
          "UPDATE student_attendance SET status = ?, markedBy = ?, timestamp = ? WHERE studentId = ? AND slotId = ? AND dateStr = ?",
          [newStatus, realActorName, new Date().toISOString(), studentId, slotId, dateStr]
        );
      } else {
        // Insert new
        const recordId = makeAttendanceId();
        await db.run(
          "INSERT INTO student_attendance (id, studentId, slotId, dateStr, status, markedBy, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [recordId, studentId, slotId, dateStr, newStatus, realActorName, new Date().toISOString()]
        );
      }

      // Increment student correction counter (only for non-admin standard corrections)
      if (!isRealAdmin) {
        await db.run(
          "UPDATE students SET correction_count = COALESCE(correction_count, 0) + 1 WHERE id = ?",
          [studentId]
        );
      }

      // Log into audit trail with genuine actor details
      const logId = generateId("l");
      const description = `Attendance corrected for ${student.name} (${studentId}) on ${dateStr} in slot ${slotId}. Status changed from ${oldStatus.toUpperCase()} to ${newStatus.toUpperCase()}. Reason: "${reason}"`;

      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp, old_status, new_status, reason, changed_by)
           VALUES (?, 'attendance_correction', ?, ?, ?, ?, ?, ?, ?, ?)`,
        logId,
        description,
        realActorName,
        isRealAdmin ? "Admin" : (actor.role || "Campus Manager"),
        new Date().toISOString(),
        oldStatus,
        newStatus,
        reason,
        realActorName
      );

      // DATA_FLOW_AUDIT D9: build the corrected row from what we already know rather
      // than doing a round-trip SELECT after the write. All fields the client needs
      // are available here.
      const nowStr = new Date().toISOString();
      const correctedRow = existing
        ? { ...existing, status: newStatus, markedBy: realActorName, timestamp: nowStr }
        : { id: existing?.id || makeAttendanceId(), studentId, slotId, dateStr, status: newStatus, markedBy: realActorName, timestamp: nowStr };

      notifyRealtimeEvent({
        domain: "attendance",
        action: "corrected",
        collegeId: student.college_id || undefined,
        targetRoles: ["student", "cm", "admin"],
        payload: { studentId, slotId, dateStr, status: newStatus }
      });

      return NextResponse.json({
        success: true,
        message: "Attendance corrected successfully.",
        newCount: isRealAdmin ? currentCount : currentCount + 1,
        correctionCount: isRealAdmin ? currentCount : currentCount + 1,
        limit: 2,
        record: correctedRow
      });
    }

    // ── DIRECT PERIOD MARKING (CAM / FACULTY) ──────────────────────────────
    if (action === "mark_period") {
      const { studentId, slotId, dateStr, status } = body;
      if (!studentId || !slotId || !dateStr || !status) {
        return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
      }

      // Campus isolation: check that student belongs to actor's campus
      const targetStudent = await db.get("SELECT college_id FROM students WHERE id = ?", [studentId]);
      if (!targetStudent) {
        return NextResponse.json({ success: false, message: "Student not found" }, { status: 404 });
      }

      if (actorRole === "cm" && actorCollegeId && targetStudent.college_id) {
        if (targetStudent.college_id.toLowerCase() !== actorCollegeId.toLowerCase()) {
          return NextResponse.json(
            { success: false, message: "Unauthorized: You can only mark attendance for students of your assigned campus." },
            { status: 403 }
          );
        }
      }

      if (status === "not_marked") {
        await db.run(
          "DELETE FROM student_attendance WHERE studentId = ? AND slotId = ? AND dateStr = ?",
          [studentId, slotId, dateStr]
        );
      } else {
        // Single UPSERT replaces the SELECT-then-INSERT-or-UPDATE pattern (2 round trips → 1).
        const recordId = makeAttendanceId();
        await db.run(
          `INSERT INTO student_attendance (id, studentId, slotId, dateStr, status, markedBy, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (studentId, slotId, dateStr)
           DO UPDATE SET status = EXCLUDED.status, markedBy = EXCLUDED.markedBy, timestamp = EXCLUDED.timestamp`,
          [recordId, studentId, slotId, dateStr, status, realActorName, new Date().toISOString()]
        );
      }

      notifyRealtimeEvent({
        domain: "attendance",
        action: "period_marked",
        collegeId: targetStudent.college_id || undefined,
        targetRoles: ["student", "cm", "mentor", "admin"],
        payload: { studentId, slotId, dateStr, status }
      });

      return NextResponse.json({ success: true, message: "Attendance updated." });
    }

    // ── BULK ATTENDANCE IMPORT (HIGH-PERFORMANCE BATCH SQL) ───────────────
    if (action === "bulk_import") {
      if (actorRole === "mentor") {
        return NextResponse.json({ success: false, message: "Mentors are not authorized for bulk attendance imports." }, { status: 403 });
      }

      const { records, students: incomingStudents, markedBy, collegeId: importCollegeId } = body;
      if (!records || !Array.isArray(records) || records.length === 0) {
        return NextResponse.json({ success: false, message: "No attendance records to import" }, { status: 400 });
      }

      const effectiveCollegeId = (actorRole === "cm" && actorCollegeId) ? actorCollegeId : importCollegeId;
      if (!effectiveCollegeId && !isRealAdmin) {
        return NextResponse.json({ success: false, message: "Target campus (collegeId) is required for bulk import." }, { status: 400 });
      }

      const nowStr = new Date().toISOString();

      // ── Parallelize: fetch valid slots AND pre-build student upsert statements simultaneously ──
      // This cuts 2 sequential HTTP round-trips → 1 parallel round-trip before the write batch.
      const studentBatchStatements: { sql: string; args: any[] }[] = [];

      if (incomingStudents && Array.isArray(incomingStudents) && incomingStudents.length > 0) {
        const validStudents = incomingStudents.filter((st: any) => st.id && st.name);
        const ST_BATCH = 50; // 50 students × 7 cols = 350 params, well under Turso's 32766 limit
        for (let i = 0; i < validStudents.length; i += ST_BATCH) {
          const chunk = validStudents.slice(i, i + ST_BATCH);
          const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, 'Active', ?)").join(", ");
          const params: any[] = [];
          chunk.forEach((st: any) => {
            params.push(
              st.id, st.name, st.roll_number || st.id,
              st.department || "General", st.classGroup || "General Batch",
              st.college_id || effectiveCollegeId || null, nowStr
            );
          });
          studentBatchStatements.push({
            sql: `INSERT INTO students (id, name, roll_number, department, classGroup, college_id, status, created_at)
                  VALUES ${placeholders}
                  ON CONFLICT(id) DO UPDATE SET
                    name = COALESCE(excluded.name, name),
                    roll_number = COALESCE(excluded.roll_number, roll_number),
                    department = COALESCE(excluded.department, department),
                    classGroup = COALESCE(excluded.classGroup, classGroup),
                    college_id = COALESCE(excluded.college_id, college_id)`,
            args: params
          });
        }
      }

      // Fetch slots with day + classGroup for compact record expansion on server
      // Compact records have no slotId — server looks up all slots for (classGroup, dayOfWeek)
      const validSlots = effectiveCollegeId
        ? await db.all("SELECT id, day, classGroup FROM slots WHERE college_id = ?", effectiveCollegeId)
        : await allCapped(db, "SELECT id, day, classGroup FROM slots", [], 30000);
      const validSlotIds = new Set(validSlots.map((s: any) => s.id));

      // Expansion cache: "dayName||classGroup" → slotId[] (avoids repeated filter scans)
      // Bug 8 Fix: Match classGroup strictly and skip blank class names
      const expansionCache = new Map<string, string[]>();
      const getExpansionSlotIds = (dayName: string, classGroup: string): string[] => {
        const cg = (classGroup || "").toLowerCase().trim();
        if (!cg) return []; // Blank class matches nothing; never expand blindly to all classes
        const key = `${dayName}||${cg}`;
        if (expansionCache.has(key)) return expansionCache.get(key)!;
        const matched = (validSlots as any[]).filter(s => {
          if (dayName && s.day !== dayName) return false;
          if (!s.classGroup) return false;
          const sg = s.classGroup.toLowerCase().trim();
          return sg === cg; // Exact cohort match, no loose .includes()
        }).map((s: any) => s.id);
        expansionCache.set(key, matched);
        return matched;
      };

      const deleteItems: Array<{ studentId: string; slotId: string; dateStr: string }> = [];
      const upsertRows: any[] = [];
      let skippedRecords = 0;

      for (const item of records) {
        const { studentId, slotId, dateStr, status, classGroup } = item;
        if (!studentId || !dateStr || !status) continue;

        if (slotId) {
          // Explicit slotId format (period-specific marks from client-side resolution).
          // An id outside this college's timetable is rejected: substituting another
          // slot filed the marks against a class the student never sat in.
          if (!validSlotIds.has(slotId)) {
            skippedRecords++;
            continue;
          }
          const effectiveSlotId = slotId;
          if (status === "not_marked") {
            deleteItems.push({ studentId, slotId: effectiveSlotId, dateStr });
          } else {
            upsertRows.push({
              id: makeAttendanceId(),
              studentId, slotId: effectiveSlotId, dateStr, status,
              markedBy: markedBy || "Master Import", timestamp: nowStr
            });
          }
        } else {
          // Compact format: classGroup + dateStr, no slotId
          // Server expands to ALL matching slots for this cohort on this day of week
          const dateObj = new Date(dateStr + "T00:00:00");
          const dayName = !isNaN(dateObj.getTime())
            ? new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dateObj)
            : "";
          const matchedSlotIds = getExpansionSlotIds(dayName, classGroup || "");
          if (matchedSlotIds.length === 0) {
            skippedRecords++;
            continue;
          }
          for (const sId of matchedSlotIds) {
            if (status === "not_marked") {
              deleteItems.push({ studentId, slotId: sId, dateStr });
            } else {
              upsertRows.push({
                id: makeAttendanceId(),
                studentId, slotId: sId, dateStr, status,
                markedBy: markedBy || "Master Import", timestamp: nowStr
              });
            }
          }
        }
      }

      // ── Student upserts first (FK order), then attendance writes ──
      // Chunked into separate batch() calls to stay well under Turso's HTTP body limit
      let count = 0;

      // 1. Student upserts (separate batch to ensure they exist before FK attendance rows)
      if (studentBatchStatements.length > 0) {
        try {
          await db.client.batch(studentBatchStatements, "write");
        } catch (e: any) {
          console.warn("[Import] Student upsert batch failed (non-fatal):", e?.message);
        }
      }

      // 2. Build attendance write statements
      const batchStatements: { sql: string; args: any[] }[] = [];

      for (const d of deleteItems) {
        batchStatements.push({
          sql: "DELETE FROM student_attendance WHERE studentId = ? AND slotId = ? AND dateStr = ?",
          args: [d.studentId, d.slotId, d.dateStr]
        });
      }

      const ROWS_PER_INSERT = 200; // 200 rows × 7 params = 1400 params, under SQLite limit
      for (let i = 0; i < upsertRows.length; i += ROWS_PER_INSERT) {
        const chunk = upsertRows.slice(i, i + ROWS_PER_INSERT);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params: any[] = [];
        chunk.forEach(r => {
          params.push(r.id, r.studentId, r.slotId, r.dateStr, r.status, r.markedBy, r.timestamp);
        });
        batchStatements.push({
          sql: `INSERT INTO student_attendance (id, studentId, slotId, dateStr, status, markedBy, timestamp)
                VALUES ${placeholders}
                ON CONFLICT(studentId, slotId, dateStr)
                DO UPDATE SET status = excluded.status, markedBy = excluded.markedBy, timestamp = excluded.timestamp`,
          args: params
        });
        count += chunk.length;
      }

      // 3. Execute attendance writes in chunks of 100 statements per batch()
      // 100 stmts × ~28KB each = ~2.8MB per HTTP call — well under Turso's limit
      const STMTS_PER_BATCH = 100;
      let failedStatements = 0;
      for (let i = 0; i < batchStatements.length; i += STMTS_PER_BATCH) {
        const batchChunk = batchStatements.slice(i, i + STMTS_PER_BATCH);
        try {
          await db.client.batch(batchChunk, "write");
        } catch (batchErr: any) {
          console.error(`[Import] batch chunk ${Math.floor(i / STMTS_PER_BATCH) + 1} failed, falling back:`, batchErr?.message);
          // Fallback: run each statement individually (still uses multi-row INSERT, just 1 per HTTP call)
          let chunkFailed = 0;
          for (const stmt of batchChunk) {
            try {
              await db.run(stmt.sql, stmt.args);
            } catch (stmtErr: any) {
              chunkFailed++;
              console.error(`[Import] statement failed after batch fallback: ${stmtErr?.message}\nSQL: ${String(stmt.sql).slice(0, 200)}`);
            }
          }
          if (chunkFailed > 0) {
            failedStatements += chunkFailed;
            console.error(`[Import] chunk had ${chunkFailed}/${batchChunk.length} statements fail permanently`);
          }
        }
      }

      if (count === 0 && upsertRows.length > 0) count = upsertRows.length;

      const skippedNote = skippedRecords > 0
        ? ` Skipped ${skippedRecords} record(s) that matched no slot in this college.`
        : "";

      if (failedStatements > 0) {
        return NextResponse.json({
          success: false,
          message: `Imported ${count} attendance entries but ${failedStatements} statements failed permanently. Check server logs for details.${skippedNote}`,
          count,
          failedStatements,
          skipped: skippedRecords
        }, { status: 207 });
      }


      notifyRealtimeEvent({
        domain: "attendance",
        action: "bulk_imported",
        collegeId: effectiveCollegeId || undefined,
        targetRoles: ["student", "cm", "mentor", "admin"],
        payload: { count }
      });

      return NextResponse.json({
        success: true,
        message: `Successfully imported ${count} attendance entries.${skippedNote}`,
        count,
        skipped: skippedRecords
      });
    }

    // ── FACULTY ATTENDANCE SUBMISSION ───────────────────────────────
    const {
      slotId,
      dateStr,
      attendance,
      markedBy,
      actorName,
      coveredSubject,
      type, // 'Regular' | 'Non-Regular'
      mode, // 'Online' | 'Offline'
      attendanceTypeSub // e.g., 'Event', 'Exam', 'Activity', 'Others'
    } = body;

    if (!slotId || !dateStr || !attendance || !Array.isArray(attendance)) {
      return NextResponse.json({ success: false, message: "Missing slotId, dateStr, or attendance data." }, { status: 400 });
    }

    const slot = await db.get("SELECT * FROM slots WHERE id = ?", slotId);
    if (!slot) {
      return NextResponse.json({ success: false, message: "Slot not found." }, { status: 404 });
    }

    // ── FUTURE DATE ATTENDANCE GUARD ─────────────────────────────────────
    // Faculty mentors cannot record student attendance in advance for future dates
    const todayDateStr = getInstitutionDateStr();
    if (dateStr > todayDateStr) {
      return NextResponse.json({
        success: false,
        message: "Attendance cannot be recorded in advance for future dates."
      }, { status: 422 });
    }

    // ── DAY ORDER / TYPE GUARD ────────────────────────────────────────────
    // Attendance cannot be submitted unless the CAM has configured the day
    // order and type for this date. Check campus_daily_configs for the
    // slot's college. Skip this check only for CAM-initiated corrections
    // (action === "correct") and direct period marks (action === "mark_period")
    // which are handled above — so anything reaching here is a mentor submit.
    const collegeIdForSlot = slot.college_id || null;
    if (collegeIdForSlot) {
      const dayConfig = await db.get(
        "SELECT day_type, day_order FROM campus_daily_configs WHERE college_id = ? AND dateStr = ?",
        [collegeIdForSlot, dateStr]
      );
      if (!dayConfig || !dayConfig.day_type || dayConfig.day_order === "None") {
        return NextResponse.json({
          success: false,
          message: "Day order/type has not been configured for this date. The CM must set the day schedule before attendance can be marked."
        }, { status: 422 });
      }
      if (dayConfig.day_type === "holiday") {
        return NextResponse.json({
          success: false,
          message: "This date is marked as a Holiday by the CM. Attendance cannot be recorded on a holiday."
        }, { status: 422 });
      }
    }
    // ── END DAY ORDER / TYPE GUARD ────────────────────────────────────────

    // ── Batch insert all attendance rows in one multi-row INSERT ──────────
    // Filter out "not_marked" — those are just absences from the delete below.
    const validItems = attendance.filter((a: any) => a.status && a.status !== "not_marked");
    const timestamp = new Date().toISOString();
    const logId = generateId("l");
    const presentCount = attendance.filter((a: any) => a.status === "present").length;
    const absentCount = attendance.filter((a: any) => a.status === "absent").length;
    const description = `Marked ${type || "Regular"} attendance (${mode || "Offline"}) for class ${slot.classGroup || "General"} in course "${slot.course}" on date ${dateStr} (${presentCount} present, ${absentCount} absent).`;

    // Clearing the period and re-writing it are one unit. Autocommitted, an insert
    // that failed after the DELETE left the whole period's attendance erased.
    const insertedCount = await db.transaction(async (tx) => {
      await tx.run("DELETE FROM student_attendance WHERE slotId = ? AND dateStr = ?", [slotId, dateStr]);

      if (coveredSubject) {
        await tx.run(
          "UPDATE approved_handovers SET course = ? WHERE slotId = ? AND dateStr = ?",
          [coveredSubject, slotId, dateStr]
        );
      }

      if (validItems.length > 0) {
        const placeholders = validItems.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params: any[] = [];
        validItems.forEach((item: any) => {
          const recordId = makeAttendanceId();
          params.push(
            recordId, item.studentId, slotId, dateStr, item.status,
            markedBy || "System", timestamp,
            type || "Regular", mode || "Offline", attendanceTypeSub || null,
            coveredSubject || null
          );
        });
        await tx.run(
          `INSERT INTO student_attendance
             (id, studentId, slotId, dateStr, status, markedBy, timestamp, type, mode, attendanceTypeSub, coveredSubject)
             VALUES ${placeholders}
             ON CONFLICT(studentId, slotId, dateStr) DO UPDATE SET
               status = excluded.status,
               markedBy = excluded.markedBy,
               timestamp = excluded.timestamp,
               type = excluded.type,
               mode = excluded.mode,
               attendanceTypeSub = excluded.attendanceTypeSub,
               coveredSubject = COALESCE(excluded.coveredSubject, student_attendance.coveredSubject)`,
          params
        );
      }

      await tx.run(
        "INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        [logId, "booking", description, actorName || "Faculty", actorRole || "Mentor", timestamp]
      );

      return validItems.length;
    });

    // DATA_FLOW_AUDIT D6: return the authoritative stored rows (real DB ids, markedBy,
    // timestamp) so the client patches state instead of synthesizing fake ids.
    const storedRows = validItems.length > 0
      ? await db.all(
        "SELECT * FROM student_attendance WHERE slotId = ? AND dateStr = ?",
        [slotId, dateStr]
      )
      : [];

    notifyRealtimeEvent({
      domain: "attendance",
      action: "marked",
      collegeId: slot.college_id || undefined,
      targetRoles: ["student", "cm", "mentor", "admin"],
      payload: { slotId, dateStr, count: insertedCount }
    });

    return NextResponse.json({ success: true, message: "Attendance marked successfully.", insertedCount, records: storedRows });
  } catch (error: any) {
    console.error("API POST Attendance error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { auth, errorResponse } = await requireAuth(request, {
      allowedRoles: ["admin", "cm", "kam"]
    });
    if (errorResponse) return errorResponse;

    const actor = auth!.user;
    const actorRole = actor.role?.toLowerCase() || "";
    const isRealAdmin = actorRole === "admin" || actorRole === "super admin";
    const actorCollegeId = actor.college_id;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("dateStr");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const studentIdParam = searchParams.get("studentId") || searchParams.get("rollNo") || searchParams.get("regNo");
    const clearAll = searchParams.get("all") === "true";
    const scopeParam = searchParams.get("scope");

    // Bug 3 Fix: Enforce collegeId boundary — prevent date deletes from wiping all colleges
    let effectiveCollegeId = searchParams.get("collegeId")?.trim() || null;
    if (actorRole === "cm") {
      if (!actorCollegeId) {
        return NextResponse.json({ success: false, message: "No campus is assigned to this Campus Manager account." }, { status: 403 });
      }
      effectiveCollegeId = actorCollegeId;
    } else if (actorRole === "kam") {
      if (!effectiveCollegeId) {
        return NextResponse.json({ success: false, message: "Campus (collegeId) is required for attendance deletion." }, { status: 400 });
      }
      const kamColleges = await db.all("SELECT college_id FROM kam_colleges WHERE kam_id = ?", [actor.reference_id || actor.id]);
      const kamCids = new Set(kamColleges.map((r: any) => String(r.college_id).toLowerCase()));
      if (kamCids.size > 0 && !kamCids.has(effectiveCollegeId.toLowerCase())) {
        return NextResponse.json({ success: false, message: "Unauthorized: Campus is not assigned to your account." }, { status: 403 });
      }
    } else if (!isRealAdmin && !effectiveCollegeId) {
      return NextResponse.json({ success: false, message: "Campus (collegeId) is required for attendance deletion." }, { status: 400 });
    }

    let targetStudentIds: string[] = [];
    if (studentIdParam) {
      targetStudentIds.push(studentIdParam);
      // Look up student from db to also get their alternative IDs (id, roll_number, register_number)
      const st = await db.get(
        "SELECT id, roll_number, register_number, college_id FROM students WHERE id = ? OR roll_number = ? OR register_number = ?",
        [studentIdParam, studentIdParam, studentIdParam]
      );
      if (st) {
        if (effectiveCollegeId && st.college_id && st.college_id.toLowerCase() !== effectiveCollegeId.toLowerCase()) {
          return NextResponse.json({ success: false, message: "Unauthorized: Student does not belong to the selected campus." }, { status: 403 });
        }
        if (st.id) targetStudentIds.push(st.id);
        if (st.roll_number) targetStudentIds.push(st.roll_number);
        if (st.register_number) targetStudentIds.push(st.register_number);
      }
      targetStudentIds = Array.from(new Set(targetStudentIds));
    }

    const department = searchParams.get("department");
    const classGroup = searchParams.get("classGroup");

    const hasDeptOrBatch = (department && department !== "all") || (classGroup && classGroup !== "all");

    // Dynamic student subquery builder for targeted college/department/batch scoping
    const buildStudentFilter = () => {
      let sql = "SELECT id FROM students WHERE 1=1";
      const params: any[] = [];
      if (effectiveCollegeId) {
        sql += " AND college_id = ?";
        params.push(effectiveCollegeId);
      }
      if (department && department !== "all") {
        sql += " AND department = ?";
        params.push(department);
      }
      if (classGroup && classGroup !== "all") {
        sql += " AND classGroup = ?";
        params.push(classGroup);
      }
      return { sql, params };
    };

    // 1. Date Range Deletion (From ... To ...)
    if (startDate && endDate) {
      if (targetStudentIds.length > 0) {
        const placeholders = targetStudentIds.map(() => "?").join(",");
        const res = await db.run(
          `DELETE FROM student_attendance WHERE dateStr >= ? AND dateStr <= ? AND studentId IN (${placeholders})`,
          [startDate, endDate, ...targetStudentIds]
        );
        return NextResponse.json({
          success: true,
          message: `Cleared attendance for student (${targetStudentIds.join(", ")}) from ${startDate} to ${endDate}.`,
          deletedCount: res.changes
        });
      } else if (hasDeptOrBatch || effectiveCollegeId) {
        // Two-step: resolve student IDs first (avoids subquery param binding issues with libSQL)
        const { sql: stSql, params: stParams } = buildStudentFilter();
        const scopedStudents = await db.all(stSql, stParams);
        if (scopedStudents.length === 0) {
          return NextResponse.json({ success: true, message: "No students found for the given scope.", deletedCount: 0 });
        }
        const ids = scopedStudents.map((s: any) => s.id);
        // Delete in chunks of 500 to stay within SQLite IN-list limits
        const CHUNK = 500;
        let totalDeleted = 0;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const ph = chunk.map(() => "?").join(",");
          const r = await db.run(
            `DELETE FROM student_attendance WHERE dateStr >= ? AND dateStr <= ? AND studentId IN (${ph})`,
            [startDate, endDate, ...chunk]
          );
          totalDeleted += r.changes;
        }
        return NextResponse.json({
          success: true,
          message: `Cleared ${totalDeleted} attendance record(s) from ${startDate} to ${endDate}.`,
          deletedCount: totalDeleted
        });
      } else if (isRealAdmin && scopeParam === "all_colleges") {
        const res = await db.run(
          "DELETE FROM student_attendance WHERE dateStr >= ? AND dateStr <= ?",
          [startDate, endDate]
        );
        return NextResponse.json({
          success: true,
          message: `Cleared attendance records from ${startDate} to ${endDate} across all campuses.`,
          deletedCount: res.changes
        });
      } else {
        return NextResponse.json(
          { success: false, message: "Campus (collegeId) is required. Cross-campus deletion requires verified Admin with scope=all_colleges." },
          { status: 400 }
        );
      }
    }

    // 2. Student Deletion (All Dates for this Student)
    if (targetStudentIds.length > 0 && !dateStr) {
      const placeholders = targetStudentIds.map(() => "?").join(",");
      const res = await db.run(
        `DELETE FROM student_attendance WHERE studentId IN (${placeholders})`,
        targetStudentIds
      );
      return NextResponse.json({
        success: true,
        message: `Deleted all attendance for student (${targetStudentIds.join(", ")})`,
        deletedCount: res.changes
      });
    }

    // 3. Single Date & Student
    if (dateStr && targetStudentIds.length > 0) {
      const placeholders = targetStudentIds.map(() => "?").join(",");
      const res = await db.run(
        `DELETE FROM student_attendance WHERE dateStr = ? AND studentId IN (${placeholders})`,
        [dateStr, ...targetStudentIds]
      );
      return NextResponse.json({
        success: true,
        message: `Deleted attendance for student (${targetStudentIds.join(", ")}) on ${dateStr}`,
        deletedCount: res.changes
      });
    }

    // 4. Single Date
    if (dateStr) {
      if (hasDeptOrBatch || effectiveCollegeId) {
        // Two-step: resolve student IDs first
        const { sql: stSql, params: stParams } = buildStudentFilter();
        const scopedStudents = await db.all(stSql, stParams);
        if (scopedStudents.length === 0) {
          return NextResponse.json({ success: true, message: "No students found for the given scope.", deletedCount: 0 });
        }
        const ids = scopedStudents.map((s: any) => s.id);
        const CHUNK = 500;
        let totalDeleted = 0;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const ph = chunk.map(() => "?").join(",");
          const r = await db.run(
            `DELETE FROM student_attendance WHERE dateStr = ? AND studentId IN (${ph})`,
            [dateStr, ...chunk]
          );
          totalDeleted += r.changes;
        }
        return NextResponse.json({ success: true, message: `Deleted attendance for date ${dateStr}`, deletedCount: totalDeleted });
      } else if (isRealAdmin && scopeParam === "all_colleges") {
        const res = await db.run("DELETE FROM student_attendance WHERE dateStr = ?", [dateStr]);
        return NextResponse.json({ success: true, message: `Deleted attendance for date ${dateStr} across all campuses`, deletedCount: res.changes });
      } else {
        return NextResponse.json(
          { success: false, message: "Campus (collegeId) is required. Cross-campus deletion requires verified Admin with scope=all_colleges." },
          { status: 400 }
        );
      }
    }

    // 5. Clear All / Full Wipe
    // ALWAYS scope to collegeId when provided — never wipe other colleges' data
    if (clearAll) {
      if (effectiveCollegeId) {
        // Two-step: resolve IDs for this college, then delete
        const collegeStudents = await db.all("SELECT id FROM students WHERE college_id = ?", [effectiveCollegeId]);
        if (collegeStudents.length === 0) {
          return NextResponse.json({ success: true, message: "No students found for this campus.", deletedCount: 0 });
        }
        const ids = collegeStudents.map((s: any) => s.id);
        const CHUNK = 500;
        let totalDeleted = 0;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const ph = chunk.map(() => "?").join(",");
          const r = await db.run(
            `DELETE FROM student_attendance WHERE studentId IN (${ph})`,
            chunk
          );
          totalDeleted += r.changes;
        }
        return NextResponse.json({
          success: true,
          message: "All attendance records for this campus have been cleared.",
          deletedCount: totalDeleted
        });
      } else if (isRealAdmin && scopeParam === "all_colleges") {
        const res = await db.run("DELETE FROM student_attendance");
        return NextResponse.json({
          success: true,
          message: "All attendance records across all campuses have been cleared.",
          deletedCount: res.changes
        });
      } else {
        return NextResponse.json({
          success: false,
          message: "collegeId is required for a wipe. Cross-campus deletion is not permitted."
        }, { status: 400 });
      }
    }

    // 6. Scoped wipe by dept/batch/college (no all flag)
    if (hasDeptOrBatch || effectiveCollegeId) {
      // Two-step: resolve IDs, then delete
      const { sql: stSql, params: stParams } = buildStudentFilter();
      const scopedStudents = await db.all(stSql, stParams);
      if (scopedStudents.length === 0) {
        return NextResponse.json({ success: true, message: "No students found for the given scope.", deletedCount: 0 });
      }
      const ids = scopedStudents.map((s: any) => s.id);
      const CHUNK = 500;
      let totalDeleted = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const ph = chunk.map(() => "?").join(",");
        const r = await db.run(
          `DELETE FROM student_attendance WHERE studentId IN (${ph})`,
          chunk
        );
        totalDeleted += r.changes;
      }
      return NextResponse.json({
        success: true,
        message: "Attendance records for selected scope have been cleared successfully.",
        deletedCount: totalDeleted
      });
    }

    // Final fallback — refuse unscoped global delete to prevent accidental cross-campus wipe
    return NextResponse.json({
      success: false,
      message: "A collegeId, date range, or student filter is required. Unscoped global deletion is not permitted."
    }, { status: 400 });
  } catch (error: any) {
    console.error("API DELETE Attendance error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
