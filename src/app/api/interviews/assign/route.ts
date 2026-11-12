export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { getDb, allCapped, type QueryFailure } from "@/lib/db";
import { notifyExternalInterviewsAfterResponse } from "@/lib/interview-notifications";
import { checkMentorAvailability, loadAvailabilityContext } from "@/lib/availability";
import type { AvailabilityContext } from "@/lib/availability";
import { generateStudentGCalUrl } from "@/lib/google-calendar";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr } from "@/lib/localDate";
import { dispatchSystemNotification } from "@/lib/notifications";

const SLOT_COLUMNS = [
  "id", "interview_id", "allocation_id", "student_id", "student_name",
  "mentor_id", "mentor_name", "college_id", "slot_start_time", "slot_end_time",
  "gmeet_link", "gcal_link", "subject", "target_date", "status", "created_at"
];
// 16 columns × 200 rows stays far below Postgres' 65,535 bind-parameter ceiling.
const SLOT_INSERT_CHUNK = 200;
const chunkBy = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "L and D", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    // Schema ensured by the centralized migration runner (runs once per process)
    await ensureMigration("student_interview_slots_table");
    await ensureMigration("student_interviews_columns");
    const body = await request.json();

    const {
      interview_id,
      mapped_mentor_ids = [],
      student_count,
      cm_name = "Campus Manager",
      gmeet_link = "",
      time_slot = ""
    } = body;

    if (!interview_id) {
      return NextResponse.json({ success: false, message: "Missing interview_id" }, { status: 400 });
    }

    const mappedMentorIds: string[] = Array.isArray(mapped_mentor_ids)
      ? mapped_mentor_ids.filter((id: any) => typeof id === "string" && id)
      : [];

    // The interview row and the mentor roster both key off this request's body, not off
    // each other, so they travel together. A failed slice must not read as "interview
    // not found" or "these mentors have no profile", so the batch is guarded.
    const mentorSchedule = Array.isArray(body.mentor_schedule) ? body.mentor_schedule : [];
    const useSchedule = mentorSchedule.length > 0;

    // One lookup covers every mentor this request touches: availability messages, the
    // slot rows below and the assignment email all read from it instead of re-querying.
    const allMentorIds = Array.from(new Set([
      ...mappedMentorIds,
      ...(useSchedule ? mentorSchedule.map((ms: any) => ms.mentor_id) : [])
    ].filter(Boolean)));

    const assignFailures: QueryFailure[] = [];
    const [interviewRows, mentorRows] = await db.multiQuery(
      [
        { sql: "SELECT * FROM student_interviews WHERE id = ?", params: [interview_id] },
        allMentorIds.length > 0
          ? { sql: `SELECT id, name, email, college_id FROM mentors WHERE id IN (${allMentorIds.map(() => "?").join(",")})`, params: allMentorIds }
          : { sql: "SELECT 1 WHERE 1=0" },
      ],
      assignFailures
    );
    if (assignFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not verify this assignment. Please try again." }, { status: 500 });
    }

    const interview = interviewRows[0];
    if (!interview) {
      return NextResponse.json({ success: false, message: "Interview request not found" }, { status: 404 });
    }

    const assignedTimeSlot = time_slot || interview.preferred_start_time || "09:00 AM";

    // Validate mentor availability on target date and time (per-mentor slot check)
    const checksToRun: { mentorId: string; timeSlot: string }[] = useSchedule
      ? mentorSchedule.filter((ms: any) => ms.mentor_id).map((ms: any) => ({
          mentorId: ms.mentor_id,
          timeSlot: ms.time_slot || assignedTimeSlot
        }))
      : mappedMentorIds.map((mId: string) => ({
          mentorId: mId,
          timeSlot: assignedTimeSlot
        }));

    const mentorById = new Map<string, any>();
    for (const m of mentorRows) mentorById.set(m.id, m);

    // The engine runs ~6 queries per mentor; loading one shared busy-window context for
    // the whole assignment collapses that fan-out into a single batched round trip.
    let availCtx: AvailabilityContext | null = null;
    if (checksToRun.length > 0 && interview.target_date) {
      try {
        availCtx = await loadAvailabilityContext(db, {
          mentorIds: Array.from(new Set(checksToRun.map(c => c.mentorId))),
          dates: [interview.target_date]
        });
      } catch (ctxErr: any) {
        console.warn("Availability context preload failed, falling back to per-mentor lookups:", ctxErr?.message);
      }
    }

    for (const check of checksToRun) {
      try {
        const avail = await checkMentorAvailability(db, {
          mentorId: check.mentorId,
          dateStr: interview.target_date,
          timeSlot: check.timeSlot,
          excludeInterviewId: interview_id,
          ctx: availCtx ?? undefined
        });
        if (!avail.available) {
          const mName = mentorById.get(check.mentorId)?.name || check.mentorId;
          const at = useSchedule ? ` at ${check.timeSlot}` : "";
          return NextResponse.json({
            success: false,
            message: `Cannot assign mentor ${mName}${at}: ${avail.reason}`
          }, { status: 400 });
        }
      } catch (availErr) {
        console.warn("Mentor availability check warning:", availErr);
      }
    }

    const now = new Date().toISOString();

    // Student count comes from what the caller actually allocated. The old `|| 3`
    // default invented a third student whenever the field was omitted.
    const scheduleStudentTotal = useSchedule
      ? mentorSchedule.reduce((sum: number, ms: any) => sum + (Number(ms.student_count) || 0), 0)
      : 0;
    const selectedStudentTotal = Array.isArray(body.selected_student_ids) ? body.selected_student_ids.filter(Boolean).length : 0;
    const assigningStudentCount = Number(student_count) || scheduleStudentTotal || selectedStudentTotal || Number(interview.student_count) || 0;
    if (assigningStudentCount <= 0) {
      return NextResponse.json({ success: false, message: "Assign at least one student before saving this interview schedule." }, { status: 400 });
    }
    const updatedCount = assigningStudentCount;

    let combinedMentorIds = mappedMentorIds;
    let finalStatus = "assigned";
    let totalAccepted = assigningStudentCount;
    let totalAllocated = assigningStudentCount;

    if (interview.type === "external") {
      let existingIds: string[] = [];
      try {
        const parsed = interview.assigned_mentor_ids ? JSON.parse(interview.assigned_mentor_ids) : [];
        if (Array.isArray(parsed)) existingIds = parsed.filter((id: any) => typeof id === "string" && id);
      } catch {
        // Legacy rows stored a comma-separated list instead of JSON.
        existingIds = String(interview.assigned_mentor_ids || "").split(",").map(s => s.trim()).filter(Boolean);
      }
      combinedMentorIds = Array.from(new Set([...existingIds, ...mappedMentorIds]));
      
      const prevAccepted = Number(interview.accepted_capacity) || 0;
      const prevAllocated = Number(interview.allocated_students) || 0;
      totalAccepted = prevAccepted + assigningStudentCount;
      totalAllocated = prevAllocated + assigningStudentCount;
      
      const requestedTotal = Number(interview.student_count) || 10;
      finalStatus = totalAccepted >= requestedTotal ? "assigned" : "capacity_partially_accepted";
    }

    const assignedIdsStr = JSON.stringify(combinedMentorIds);
    const remainingCount = Math.max(0, (Number(interview.student_count) || 0) - totalAccepted);

    // Internal interviews are in-person; any previously saved Meet room must be cleared,
    // not preserved by a COALESCE that only skipped the new value.
    let nextMeetLink = interview.type === "internal" ? null : (gmeet_link || interview.gmeet_link || null);
    if (interview.type !== "internal" && !nextMeetLink) {
      const chars = "abcdefghijklmnopqrstuvwxyz";
      const randStr = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const meetCode = randStr(3) + "-" + randStr(4) + "-" + randStr(3);
      nextMeetLink = "https://meet.google.com/" + meetCode;
    }

    await db.run(
      `UPDATE student_interviews 
       SET assigned_mentor_ids = ?, 
           accepted_capacity = ?, 
           allocated_students = ?,
           remaining_students = ?,
           status = ?, 
           gmeet_link = ?, 
           preferred_start_time = ?, 
           updated_at = ?
       WHERE id = ?`,
      [
        assignedIdsStr, 
        totalAccepted, 
        totalAllocated, 
        remainingCount, 
        finalStatus, 
        nextMeetLink, 
        assignedTimeSlot, 
        now, 
        interview_id
      ]
    );

    // Populate student-level slot records for individual student tracking.
    // A caller that maps mentors without a per-mentor schedule still gets slots: the
    // student count is split evenly across those mentors. Otherwise the interview sat
    // in "assigned" with no slot for any student, so nobody knew when to attend.
    const effectiveSchedule: any[] = useSchedule
      ? mentorSchedule
      : (() => {
          if (mappedMentorIds.length === 0) return [];
          const base = Math.floor(assigningStudentCount / mappedMentorIds.length);
          let remainder = assigningStudentCount % mappedMentorIds.length;
          return mappedMentorIds.map((id: string) => {
            const count = base + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            return { mentor_id: id, student_count: count, time_slot: assignedTimeSlot };
          }).filter((ms: any) => ms.student_count > 0);
        })();

    const slotRows: any[][] = [];

    if (effectiveSchedule.length > 0) {
      const isInternal = interview.type === "internal";
      const selectedStudentIds = Array.isArray(body.selected_student_ids) ? body.selected_student_ids.filter(Boolean) : [];
      let enrolledStudents: any[] = [];

      // 1. Fetch CAM-selected students by ID first (maintains exact selection)
      if (selectedStudentIds.length > 0) {
        try {
          const placeholders = selectedStudentIds.map(() => "?").join(",");
          const fetched = await db.all(
            `SELECT id, name, email, register_number, classgroup as "classGroup", department FROM students WHERE id IN (${placeholders})`,
            selectedStudentIds
          );
          // Preserve original ordering AND keep a stub entry even if student row not found (avoids null student_id)
          enrolledStudents = selectedStudentIds.map((id: any) => {
            const found = fetched.find((s: any) => s.id === id);
            return found || { id, name: null, email: null, register_number: id };
          });
        } catch (_) {}
      }

      // 2. Supplement with cohort query if needed
      if (enrolledStudents.length < assigningStudentCount) {
        const cleanCG = (interview.class_group || "").replace(/^[\["'\s]+|[\]"'\s]+$/g, "").trim();
        const hostColId = interview.origin_college_id || interview.college_id || null;
        let cohortStudents: any[] = [];
        try {
          let allCampusStudents: any[] = [];
          if (hostColId) {
            allCampusStudents = await allCapped(
              db,
              `SELECT id, name, email, register_number, classgroup as "classGroup", department 
               FROM students 
               WHERE college_id = ? 
               ORDER BY register_number ASC, id ASC`,
              [hostColId]
            );
          }
          if (allCampusStudents.length === 0) {
            allCampusStudents = await db.all(
              `SELECT id, name, email, register_number, classgroup as "classGroup", department 
               FROM students 
               ORDER BY register_number ASC, id ASC LIMIT 300`
            );
          }

          // Fuzzy and token matching against class_group, department, and base course
          const deptPrefix = cleanCG.split(/[-–—(]/)[0].trim().toLowerCase();
          const cleanTokens = cleanCG.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter((t: string) => t.length > 2);

          cohortStudents = allCampusStudents.filter((st: any) => {
            const sCG = (st.classGroup || "").toLowerCase().trim();
            const sDept = (st.department || "").toLowerCase().trim();
            if (sCG === cleanCG.toLowerCase() || sDept === cleanCG.toLowerCase()) return true;
            if (deptPrefix && (sDept.includes(deptPrefix) || deptPrefix.includes(sDept))) return true;
            if (deptPrefix && (sCG.includes(deptPrefix) || deptPrefix.includes(sCG))) return true;
            const matchCount = cleanTokens.filter((tok: string) => sCG.includes(tok) || sDept.includes(tok)).length;
            return matchCount >= Math.min(2, cleanTokens.length);
          });

          // If no department string match, fallback to students from the host campus
          if (cohortStudents.length === 0) {
            cohortStudents = allCampusStudents;
          }
        } catch (_) {}

        const existingIds = new Set(enrolledStudents.map(s => s.id));
        for (const cs of cohortStudents) {
          if (!existingIds.has(cs.id)) {
            enrolledStudents.push(cs);
            existingIds.add(cs.id);
          }
        }
      }

      // Helper to increment minutes and format e.g. "09:15 AM" starting from the slot's actual start time
      const formatTimeSlotWindow = (baseTimeStr: string, slotIndex: number) => {
        let baseMins = 540;
        if (baseTimeStr) {
          const firstPart = baseTimeStr.split("-")[0].trim().replace(/\./g, ":");
          const match = firstPart.match(/^(\d+)(?::(\d+))?\s*(AM|PM)?$/i);
          if (match) {
            let hours = parseInt(match[1], 10);
            const minutes = match[2] ? parseInt(match[2], 10) : 0;
            const ampm = match[3];
            if (ampm) {
              const isPM = ampm.toUpperCase() === "PM";
              if (isPM && hours < 12) hours += 12;
              if (!isPM && hours === 12) hours = 0;
            }
            baseMins = hours * 60 + minutes;
          }
        }
        const startMins = baseMins + (slotIndex * 15);
        const endMins = startMins + 15;
        const toTimeStr = (m: number) => {
          let hrs = Math.floor(m / 60);
          const mins = m % 60;
          const ampm = hrs >= 12 ? "PM" : "AM";
          if (hrs > 12) hrs -= 12;
          if (hrs === 0) hrs = 12;
          return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${ampm}`;
        };
        return { start: toTimeStr(startMins), end: toTimeStr(endMins) };
      };

      // Build every slot row first, then clear and rewrite this interview's slots in one
      // transaction. The previous per-row INSERT loop deleted the old slots up front and
      // could die halfway, leaving the panel with a partial schedule.
      let sIndex = 0;
      let slotRunningIndex = 0;
      for (const ms of effectiveSchedule) {
        const mObj = mentorById.get(ms.mentor_id);
        const mName = mObj?.name || "Mentor";
        const mCol = mObj?.college_id || interview.college_id || "campus";
        const count = Number(ms.student_count) || 3;
        const baseTime = ms.time_slot || assignedTimeSlot || "09:00 AM";

        for (let k = 0; k < count; k++) {
          const slotId = generateId("slot");
          const st = enrolledStudents[sIndex] || null;
          sIndex++;

          // Always store the real student ID; fall back to a generated slot ID only if truly unknown
          const stId = st?.id || null;
          // Use real name if available; for stubs without a name, use a readable fallback (not anonymous)
          const stName = (st?.name && st.name.trim()) ? st.name.trim() : (st?.id ? `Student ${st.id.slice(0, 8)}` : `Candidate #${slotRunningIndex + 1}`);
          const stEmail = st?.email || undefined;

          const slotTiming = formatTimeSlotWindow(baseTime, k);
          slotRunningIndex++;

          // Internal interviews do NOT use Google Meet (in-person physical on campus)
          const effectiveMeetLink = isInternal ? null : (nextMeetLink || gmeet_link || interview.gmeet_link || null);
          const studentGCalUrl = isInternal || !effectiveMeetLink ? null : generateStudentGCalUrl({
            studentName: stName,
            studentEmail: stEmail,
            subject: interview.subject || "Interview",
            targetDate: interview.target_date || getInstitutionDateStr(),
            slotStartTime: slotTiming.start,
            slotEndTime: slotTiming.end,
            gmeetLink: effectiveMeetLink,
            mentorName: mName
          });

          slotRows.push([
            slotId,
            interview_id,
            "alloc_direct",
            stId,
            stName,
            ms.mentor_id,
            mName,
            mCol,
            slotTiming.start,
            slotTiming.end,
            effectiveMeetLink,
            studentGCalUrl,
            interview.subject || "Interview",
            interview.target_date || getInstitutionDateStr(),
            "scheduled",
            now
          ]);
        }
      }

      const clearPreviousSlots = "DELETE FROM student_interview_slots WHERE interview_id = ?";
      if (slotRows.length === 0) {
        await db.run(clearPreviousSlots, [interview_id]);
      } else {
        const rowPlaceholders = `(${SLOT_COLUMNS.map(() => "?").join(", ")})`;
        await db.transaction(async (tx) => {
          await tx.run(clearPreviousSlots, interview_id);
          for (const part of chunkBy(slotRows, SLOT_INSERT_CHUNK)) {
            await tx.run(
              `INSERT INTO student_interview_slots (${SLOT_COLUMNS.join(", ")}) VALUES ${part.map(() => rowPlaceholders).join(", ")}`,
              part.flat()
            );
          }
        });
      }
    }

    // Mentor names come from the single mentor lookup done up front
    const mentorNames: string[] = mappedMentorIds
      .map((id: string) => mentorById.get(id)?.name)
      .filter(Boolean);

    // Notify KAM & Regional Colleges
    if (interview.type === "external") {
      notifyExternalInterviewsAfterResponse({
        interviewId: interview.id,
        subject: interview.subject,
        classGroup: interview.class_group,
        targetDate: interview.target_date,
        type: "external",
        topics: interview.topics,
        studentCount: updatedCount,
        mentorName: mentorNames.join(", ") || interview.mentor_name,
        originCollegeId: interview.origin_college_id || interview.college_id,
        targetCollegeId: interview.target_college_id,
        actionType: "assigned",
        gmeetLink: gmeet_link || interview.gmeet_link,
        actorName: cm_name
      });
    }

    try {
      const allocatedStudentIds = Array.from(new Set(slotRows.map((r: any[]) => r[3]).filter(Boolean))) as string[];
      if (allocatedStudentIds.length > 0) {
        await dispatchSystemNotification(db, {
          userIds: allocatedStudentIds,
          title: `Mock Interview Scheduled: ${interview.subject || "Interview"}`,
          message: `You have been scheduled for a mock interview on ${interview.target_date || "upcoming date"}. Meet link: ${gmeet_link || interview.gmeet_link || "Check schedule"}.`,
          link: "/student/interviews",
          type: "info",
          domain: "interviews",
          action: "assigned",
          payload: { interviewId: interview.id, subject: interview.subject, targetDate: interview.target_date }
        });
      }
      if (mappedMentorIds.length > 0) {
        await dispatchSystemNotification(db, {
          userIds: mappedMentorIds,
          title: `Interview Assignment: ${interview.subject || "Interview"}`,
          message: `You are assigned to evaluate ${updatedCount} student(s) on ${interview.target_date || "scheduled date"}.`,
          link: "/mentor/interviews",
          type: "info",
          domain: "interviews",
          action: "assigned",
          payload: { interviewId: interview.id, subject: interview.subject, targetDate: interview.target_date }
        });
      }
    } catch (assignNotifErr) {
      console.error("[interviews/assign] dispatch notification error:", assignNotifErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully assigned ${updatedCount} students & mapped ${mappedMentorIds.length} mentor(s).`
    });
  } catch (error: any) {
    console.error("POST /api/interviews/assign error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to assign interview" }, { status: 500 });
  }
}
