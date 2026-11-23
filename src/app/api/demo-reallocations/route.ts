export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { ensureMigration } from "@/lib/migrations";
import { checkMentorAvailability, checkSmeAvailability, loadAvailabilityContext } from "@/lib/availability";
import type { AvailabilityContext } from "@/lib/availability";
import { requireRole, requireSession, apiAuthErrorResponse } from "@/lib/api-auth";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";
import { getInstitutionDateStr, parseLocalDate } from "@/lib/localDate";
import { mapDayOrderToDayName, isTimeSlotMatch } from "@/lib/utils";

/**
 * Leave-driven Demo Reallocation flow:
 *  - GET  ?demoSessionId=            → demo details + mentor-free periods × SME availability matrix
 *  - GET  ?leaveRequestId= / ?status=pending → list reallocation requests (L&D queue)
 *  - POST { action: "propose" }      → mentor picks an alternative period; a PENDING
 *                                      reservation is created that blocks the slot.
 *  - POST { action: "resolve" }      → L&D approves (demo moved, original slot
 *                                      released) or rejects (reservation released).
 *
 * Pending reservations are respected by /api/demo-sessions (book / reschedule).
 */

const ACTIVE_RESERVATION_STATUSES = ["pending", "approved"];

function parseClockMinutes(value: unknown): number {
  const match = String(value || "").match(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/i);
  if (!match) return -1;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function slotTimeRange(value: unknown): { start: number; end: number } {
  const text = String(value || "");
  const range = text.match(/(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:AM|PM)?)/i);
  if (!range) {
    const start = parseClockMinutes(text);
    return { start, end: start };
  }
  return { start: parseClockMinutes(range[1]), end: parseClockMinutes(range[2]) };
}

function smeDemoWindowReason(windows: any[], weekday: string, period: string): string | null {
  const dayWindows = (windows || []).filter((window: any) => {
    const day = String(window.day_of_week || "").trim().toLowerCase();
    const target = weekday.toLowerCase();
    const mappedDay = mapDayOrderToDayName(window.day_of_week, "").toLowerCase();
    return day === target || day.startsWith(target.slice(0, 3)) || mappedDay === target;
  });
  const demoWindows = dayWindows.filter((window: any) =>
    String(window.slot_type || window.slotType || "demo").toLowerCase() === "demo"
  );
  if (!demoWindows.length) return `No SME demo availability configured for ${weekday}.`;

  const slot = slotTimeRange(period);
  if (slot.start < 0) return null;
  const fits = demoWindows.some((window: any) => {
    const start = parseClockMinutes(window.start_time);
    const end = parseClockMinutes(window.end_time);
    return start >= 0 && end >= 0 && slot.start >= start && (slot.end <= slot.start || slot.end <= end);
  });
  if (!fits) {
    const ranges = demoWindows.map((window: any) => `${window.start_time}-${window.end_time}`).join(", ");
    return `SME demo periods are ${ranges}; this slot is outside those hours.`;
  }

  // Non-demo windows (Training, Other) strictly block demo allocations even if a demo window overlaps
  const nonDemoWindows = dayWindows.filter((window: any) => {
    const st = String(window.slot_type || window.slotType || "demo").toLowerCase();
    return st !== "demo";
  });
  for (const ndw of nonDemoWindows) {
    const start = parseClockMinutes(ndw.start_time);
    const end = parseClockMinutes(ndw.end_time);
    if (start >= 0 && end >= 0 && Math.max(slot.start, start) < Math.min(slot.end, end)) {
      const typeLabel = ndw.slot_type === "training" ? "Training" : (ndw.notes || "Other activity");
      return `SME is occupied with ${typeLabel} (${ndw.start_time} - ${ndw.end_time}).`;
    }
  }

  return null;
}

async function ensureTable(db: any) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS demo_reallocation_requests (
      id TEXT PRIMARY KEY,
      demo_session_id TEXT NOT NULL,
      leave_request_id TEXT,
      mentor_id TEXT NOT NULL,
      mentor_name TEXT,
      sme_id TEXT,
      sme_name TEXT,
      subject TEXT,
      stream TEXT,
      week INTEGER,
      original_date_str TEXT NOT NULL,
      original_time_slot TEXT NOT NULL,
      proposed_date_str TEXT NOT NULL,
      proposed_time_slot TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      request_kind TEXT DEFAULT 'reschedule',
      proposed_by TEXT,
      decided_by TEXT,
      decided_at TEXT,
      decision_notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(() => {});
  await db.exec("ALTER TABLE demo_reallocation_requests ADD COLUMN IF NOT EXISTS request_kind TEXT DEFAULT 'reschedule';").catch(() => {});
  await db.exec("CREATE INDEX IF NOT EXISTS idx_demo_realloc_status ON demo_reallocation_requests(status)").catch(() => {});
  await db.exec("CREATE INDEX IF NOT EXISTS idx_demo_realloc_session ON demo_reallocation_requests(demo_session_id)").catch(() => {});
  await db.exec("CREATE INDEX IF NOT EXISTS idx_demo_realloc_leave ON demo_reallocation_requests(leave_request_id)").catch(() => {});
}

export async function GET(request: Request) {
  try {
    await requireSession(request);
    const db = await getDb();
    await ensureMigration("demo_reallocation_requests");
    await ensureTable(db);

    const { searchParams } = new URL(request.url);
    const demoSessionId = searchParams.get("demoSessionId");
    const requestedDate = searchParams.get("dateStr");
    const leaveRequestId = searchParams.get("leaveRequestId");
    const status = searchParams.get("status");

    // ── Alternatives discovery for one demo ────────────────────────────
    if (demoSessionId) {
      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [demoSessionId]);
      if (!demo) {
        return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });
      }

      const mentorRecord = await db.get("SELECT college_id FROM mentors WHERE id = ?", [demo.mentorId]).catch(() => null);
      const collegeId = (demo as any).college_id || mentorRecord?.college_id || null;

      // College, timetable periods, holidays and outstanding reservations are four
      // independent reads, so one round trip serves all of them. A missed reservation
      // or holiday slice would offer a clashing alternative as free, so discovery is
      // refused instead of guessed at.
      const discoveryFailures: QueryFailure[] = [];
      const [collegeRows, slotRows, holidayRows, reservationRows, smeWindowRows] = await db.multiQuery(
        [
          { sql: "SELECT * FROM colleges WHERE id = ?", params: [collegeId] },
          { sql: "SELECT * FROM slots WHERE college_id = ?", params: [collegeId] },
          { sql: "SELECT date, title FROM holidays" },
          { sql: "SELECT demo_session_id, proposed_date_str, proposed_time_slot, mentor_id, sme_id FROM demo_reallocation_requests WHERE status IN ('pending', 'approved')" },
          { sql: "SELECT day_of_week, start_time, end_time, slot_type FROM sme_availability WHERE sme_id = ? AND is_active != 0", params: [demo.smeId] },
        ],
        discoveryFailures
      );
      if (discoveryFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not check availability. Please try again." }, { status: 500 });
      }

      const college = collegeRows[0] || null;

      // Period slots: college timetable periods (demo timeSlots use the same strings)
      let periodSlots: string[] = [];
      try {
        const { getCollegePeriodTimeSlots } = await import("@/lib/utils");
        const colleges = college ? [college] : [];
        periodSlots = getCollegePeriodTimeSlots(collegeId, colleges as any, slotRows as any) || [];
      } catch (_) {}
      if (!periodSlots || periodSlots.length === 0) {
        periodSlots = [
          "Period 1 (08:30 - 09:25)",
          "Period 2 (09:25 - 10:20)",
          "Period 3 (10:40 - 11:35)",
          "Period 4 (11:35 - 12:30)",
          "Period 5 (01:25 - 02:20)",
          "Period 6 (02:20 - 03:15)"
        ];
      }

      // Candidate dates: next 21 days, skipping Sundays, non-working Saturdays & configured holidays
      const holidays: any[] = holidayRows;
      const holidaySet = new Set(holidays.map(h => h.date));

      // Query campus daily configs to capture campus-specific holidays and day orders
      const dailyConfigsRows = await db.all(
        "SELECT dateStr, day_type, day_order FROM campus_daily_configs WHERE college_id = ? OR college_id IS NULL",
        [collegeId]
      ).catch(() => []);
      for (const dcr of dailyConfigsRows) {
        if (dcr.day_type === "holiday" || (dcr as any).is_holiday === 1) {
          const ds = dcr.dateStr || dcr.datestr;
          if (ds) holidaySet.add(ds);
        }
      }

      const is5DayCollege = Boolean(college && (college.is_saturday_working === 0 || college.working_days === 5 || (college as any).workingDays === 5));
      const candidateDates: { dateStr: string; label: string; isHoliday?: boolean }[] = [];
      const today = parseLocalDate(getInstitutionDateStr());
      if (requestedDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || Number.isNaN(parseLocalDate(requestedDate).getTime())) {
          return NextResponse.json({ success: false, message: "Invalid target date." }, { status: 400 });
        }
        const d = parseLocalDate(requestedDate);
        candidateDates.push({
          dateStr: requestedDate,
          label: `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} (${d.toLocaleDateString("en-US", { weekday: "long" })})`,
          isHoliday: holidaySet.has(requestedDate),
        });
      }
      for (let i = 1; !requestedDate && i <= 21 && candidateDates.length < 12; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i, 12, 0, 0);
        const dow = d.getDay();
        if (dow === 0) continue; // Sunday
        if (is5DayCollege && dow === 6) continue; // Saturday on 5-day week campus
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${day}`;
        if (holidaySet.has(dateStr)) continue;
        const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
        candidateDates.push({ dateStr, label: `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} (${weekday})` });
      }

      // Pending/approved reservations to exclude
      const reservations: any[] = reservationRows;

      // Compute per-date free-period matrix (mentor × SME)
      //
      // The matrix used to fan out to one query set per date × period
      // (12 dates × 6 periods × ~5 lookups ≈ 400 round trips, 100+ s at measured
      // cross-region latency — routinely past maxDuration). Both engines and the
      // demo_sessions clash checks are preloaded once for the whole window instead.
      const dateList = candidateDates.map(c => c.dateStr);
      const preloadFailures: any[] = [];

      let ctx: AvailabilityContext | null = null;
      try {
        ctx = await loadAvailabilityContext(db, { mentorId: demo.mentorId, smeId: demo.smeId, dates: dateList, collegeId });
      } catch (err: any) {
        console.warn("[/api/demo-reallocations] availability preload failed, using per-period lookups:", err?.message);
      }

      let mentorSelfDemos: any[] | null = null;
      let smeOtherDemos: any[] | null = null;
      if (dateList.length > 0) {
        const inList = dateList.map(() => "?").join(",");
        const slices = await db.multiQuery(
          [
            {
              sql: `SELECT id, dateStr, timeSlot FROM demo_sessions
                    WHERE mentorId = ? AND id != ? AND dateStr IN (${inList})
                      AND status NOT IN ('completed', 'not_conducted')`,
              params: [demo.mentorId, demo.id, ...dateList],
            },
            {
              sql: `SELECT id, dateStr, timeSlot FROM demo_sessions
                    WHERE smeId = ? AND id != ? AND dateStr IN (${inList})
                      AND status NOT IN ('completed', 'not_conducted')`,
              params: [demo.smeId, demo.id, ...dateList],
            },
          ],
          preloadFailures
        ).catch(() => null);
        if (slices && preloadFailures.length === 0) {
          mentorSelfDemos = slices[0];
          smeOtherDemos = slices[1];
        }
      }

      const hasSelfDemoAt = (rows: any[] | null, dateStr: string, period: string) =>
        !!rows && rows.some(r => {
          if (String(r.dateStr ?? r.datestr ?? "") !== dateStr) return false;
          const ts = String(r.timeSlot ?? r.timeslot ?? "").trim();
          if (!ts) return false;
          return isTimeSlotMatch(ts, period) || ts === period || period.includes(ts) || ts.includes(period);
        });

      const alternatives: any[] = [];
      for (const cd of candidateDates) {
        const rawWeekday = new Date(cd.dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
        const cfg = ctx?.dailyConfigsByDate?.get(`${collegeId || ""}|${cd.dateStr}`) || ctx?.dailyConfigsByDate?.get(cd.dateStr);
        let weekday = rawWeekday;
        if (cfg?.day_order && cfg.day_order !== "None" && cfg.day_order !== "none") {
          weekday = mapDayOrderToDayName(cfg.day_order, rawWeekday);
        }
        const periods: any[] = [];
        for (const period of periodSlots) {
          // Mentor side: pass our demo's own slot via demo_sessions is checked by
          // availability engine through demo_swap_requests; direct demo_sessions check here:
          const mentorSelfDemoClash = mentorSelfDemos
            ? hasSelfDemoAt(mentorSelfDemos, cd.dateStr, period)
            : await db.get(
                `SELECT id FROM demo_sessions
                 WHERE mentorId = ? AND dateStr = ? AND id != ? AND status NOT IN ('completed', 'not_conducted')
                   AND (timeSlot = ? OR ? LIKE ('%' || timeSlot || '%') OR timeSlot LIKE ('%' || ? || '%'))`,
                [demo.mentorId, cd.dateStr, demo.id, period, period, period]
              ).catch(() => null);

          const mentorReservationClash = reservations.find(r =>
            r.mentor_id === demo.mentorId &&
            r.demo_session_id !== demo.id &&
            r.proposed_date_str === cd.dateStr &&
            (isTimeSlotMatch(r.proposed_time_slot, period) || r.proposed_time_slot === period || period.includes(r.proposed_time_slot) || r.proposed_time_slot.includes(period))
          );

          const mentorAvail = mentorSelfDemoClash || mentorReservationClash
            ? { available: false, reason: mentorSelfDemoClash ? "You have another demo at this period." : "This period is reserved by another reallocation." }
            : await checkMentorAvailability(db, {
              mentorId: demo.mentorId,
              dateStr: cd.dateStr,
              collegeId: collegeId || undefined,
              dayOfWeek: weekday,
              timeSlot: period,
              ctx: ctx ?? undefined
            });

          const smeReservationClash = reservations.find(r =>
            r.sme_id && r.sme_id === demo.smeId &&
            r.demo_session_id !== demo.id &&
            r.proposed_date_str === cd.dateStr &&
            (isTimeSlotMatch(r.proposed_time_slot, period) || r.proposed_time_slot === period || period.includes(r.proposed_time_slot) || r.proposed_time_slot.includes(period))
          );

          const smeAvail = smeReservationClash
            ? { available: false, reason: "SME slot reserved by another reallocation." }
            : await checkSmeAvailability(db, {
              smeId: demo.smeId,
              dateStr: cd.dateStr,
              timeSlot: period,
              excludeDemoSessionId: demo.id,
              ctx: ctx ?? undefined
            });

          const smeWindowReason = smeDemoWindowReason(smeWindowRows || [], rawWeekday, period);

          // SME also blocked by other demo_sessions at same date+slot
          const smeOtherDemo = smeOtherDemos
            ? hasSelfDemoAt(smeOtherDemos, cd.dateStr, period)
            : await db.get(
                `SELECT id FROM demo_sessions
                 WHERE smeId = ? AND dateStr = ? AND id != ? AND status NOT IN ('completed', 'not_conducted')
                   AND (timeSlot = ? OR ? LIKE ('%' || timeSlot || '%') OR timeSlot LIKE ('%' || ? || '%'))`,
                [demo.smeId, cd.dateStr, demo.id, period, period, period]
              ).catch(() => null);

          const mentorFree = mentorAvail.available;
          const smeFree = smeAvail.available && !smeOtherDemo && !smeWindowReason;

          periods.push({
            period,
            mentorFree,
            mentorReason: mentorFree ? null : (mentorAvail as any).reason || "Mentor busy",
            smeFree,
            smeReason: smeFree ? null : (smeWindowReason || (smeOtherDemo ? "SME has another demo at this period." : (smeAvail as any).reason || "SME busy")),
            mutuallyFree: mentorFree && smeFree
          });
        }

        alternatives.push({ dateStr: cd.dateStr, label: cd.label, weekday: rawWeekday, effectiveDay: weekday, isSunday: rawWeekday === "Sunday", isHoliday: Boolean(cd.isHoliday || holidaySet.has(cd.dateStr)), periods });
      }

      return NextResponse.json({
        success: true,
        demo,
        alternatives
      });
    }

    // ── List mode (L&D queue / mentor history) ─────────────────────────
    // Candidates discovery for L&D Mentor Swap
    const candidateMentorsForDemoId = searchParams.get("candidateMentorsForDemoId");
    if (candidateMentorsForDemoId) {
      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [candidateMentorsForDemoId]);
      if (!demo) return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });
      const mentorRecord = await db.get("SELECT college_id FROM mentors WHERE id = ?", [demo.mentorId]).catch(() => null);
      const collegeId = (demo as any).college_id || mentorRecord?.college_id;

      const mentors = await db.all(
        "SELECT id, name, email, department, subjects, classes, college_id FROM mentors WHERE college_id = ? AND id != ? AND is_active != 0",
        [collegeId, demo.mentorId]
      );

      const targetDate = String(demo.dateStr || "");
      const weekday = new Date(targetDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

      const candidates = await Promise.all(
        mentors.map(async (m: any) => {
          const avail = await checkMentorAvailability(db, {
            mentorId: m.id,
            dateStr: targetDate,
            dayOfWeek: weekday,
            timeSlot: demo.timeSlot,
            collegeId: collegeId || undefined
          });
          return {
            id: m.id,
            name: m.name,
            email: m.email,
            department: m.department,
            subjects: m.subjects,
            classes: m.classes,
            college_id: m.college_id,
            available: avail.available,
            reason: avail.available ? null : (avail.reason || "Has scheduled class/duty")
          };
        })
      );

      return NextResponse.json({ success: true, demo, candidates });
    }

    // ── Candidates discovery for L&D SME Reallocation ──────────────────
    const candidateSmesForDemoId = searchParams.get("candidateSmesForDemoId");
    if (candidateSmesForDemoId) {
      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [candidateSmesForDemoId]);
      if (!demo) return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });

      const targetDate = searchParams.get("targetDate") || String(demo.dateStr || "");
      const targetTime = searchParams.get("targetTime") || String(demo.timeSlot || "");
      const weekday = new Date(targetDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

      const smes = await db.all(
        "SELECT id, name, email, subject, head_subject_group, mentor_group FROM sme_users ORDER BY name ASC"
      );

      const allWindows = await db.all(
        "SELECT sme_id, day_of_week, start_time, end_time, slot_type, notes FROM sme_availability WHERE is_active != 0"
      ).catch(() => []);

      const windowsBySme = new Map<string, any[]>();
      for (const w of allWindows) {
        const list = windowsBySme.get(w.sme_id) || [];
        list.push(w);
        windowsBySme.set(w.sme_id, list);
      }

      const demoCounts = await db.all(
        `SELECT smeId, COUNT(*) as count FROM demo_sessions 
         WHERE status NOT IN ('completed', 'not_conducted')
         GROUP BY smeId`
      ).catch(() => []);
      const countMap = new Map<string, number>();
      for (const c of demoCounts) {
        if (c.smeId) countMap.set(c.smeId, Number(c.count || 0));
      }

      const candidates = await Promise.all(
        smes.map(async (s: any) => {
          const isCurrentSme = s.id === demo.smeId;
          const sWindows = windowsBySme.get(s.id) || [];
          const windowReason = smeDemoWindowReason(sWindows, weekday, targetTime);

          const avail = await checkSmeAvailability(db, {
            smeId: s.id,
            dateStr: targetDate,
            timeSlot: targetTime,
            excludeDemoSessionId: demo.id
          });

          const isAvailable = avail.available && !windowReason;
          const reason = !avail.available ? avail.reason : (windowReason || null);

          const cleanSubject = String(demo.subject || "").toLowerCase().trim();
          const smeSub = String(s.subject || "").toLowerCase();
          const smeHead = String(s.head_subject_group || "").toLowerCase();
          const smeGroup = String(s.mentor_group || "").toLowerCase();
          const subjectMatch = Boolean(
            cleanSubject && (
              smeSub.includes(cleanSubject) || cleanSubject.includes(smeSub) ||
              smeHead.includes(cleanSubject) || cleanSubject.includes(smeHead) ||
              smeGroup.includes(cleanSubject) || cleanSubject.includes(smeGroup)
            )
          );

          return {
            id: s.id,
            name: s.name,
            email: s.email,
            subject: s.subject || s.head_subject_group || "General SME",
            available: isAvailable,
            reason: isAvailable ? "Free & Available" : (reason || "Busy / Conflict"),
            subjectMatch,
            isCurrentSme,
            demoCount: countMap.get(s.id) || 0
          };
        })
      );

      return NextResponse.json({ success: true, demo, targetDate, targetTime, candidates });
    }

    // ── Candidate sessions discovery for SME Demo Swap ────────────────
    const candidateSwapSessionsForDemoId = searchParams.get("candidateSwapSessionsForDemoId");
    if (candidateSwapSessionsForDemoId) {
      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [candidateSwapSessionsForDemoId]);
      if (!demo) return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });

      const otherSessions = await db.all(
        `SELECT * FROM demo_sessions 
         WHERE id != ? AND status NOT IN ('completed', 'not_conducted')
         ORDER BY dateStr ASC, timeSlot ASC LIMIT 60`,
        [demo.id]
      ).catch(() => []);

      const swapCandidates = await Promise.all(
        otherSessions.map(async (other: any) => {
          const availA = demo.smeId ? await checkSmeAvailability(db, {
            smeId: demo.smeId,
            dateStr: other.dateStr,
            timeSlot: other.timeSlot,
            excludeDemoSessionId: demo.id
          }) : { available: true };

          const availB = other.smeId ? await checkSmeAvailability(db, {
            smeId: other.smeId,
            dateStr: demo.dateStr,
            timeSlot: demo.timeSlot,
            excludeDemoSessionId: other.id
          }) : { available: true };

          const compatible = availA.available && availB.available;
          let clashNote = "";
          if (!availA.available) clashNote += `${demo.smeName || "Current SME"} busy on ${other.dateStr}: ${availA.reason}. `;
          if (!availB.available) clashNote += `${other.smeName || "Target SME"} busy on ${demo.dateStr}: ${availB.reason}.`;

          return {
            id: other.id,
            mentorName: other.mentorName,
            smeId: other.smeId,
            smeName: other.smeName,
            subject: other.subject,
            stream: other.stream,
            dateStr: other.dateStr,
            timeSlot: other.timeSlot,
            compatible,
            smeAAvailable: availA.available,
            smeBAvailable: availB.available,
            clashNote: clashNote.trim() || null
          };
        })
      );

      return NextResponse.json({ success: true, demo, swapCandidates });
    }

    // ── Quick real-time single SME period check ───────────────────────
    const checkSmePeriod = searchParams.get("checkSmePeriod");
    if (checkSmePeriod === "true") {
      const smeId = searchParams.get("smeId");
      const dateStr = searchParams.get("dateStr");
      const timeSlot = searchParams.get("timeSlot");
      const excludeSessionId = searchParams.get("excludeSessionId") || undefined;

      if (!smeId || !dateStr || !timeSlot) {
        return NextResponse.json({ success: false, message: "Missing smeId, dateStr, or timeSlot" }, { status: 400 });
      }

      const weekday = new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
      const avail = await checkSmeAvailability(db, { smeId, dateStr, timeSlot, excludeDemoSessionId: excludeSessionId });
      const smeWindows = await db.all(
        "SELECT day_of_week, start_time, end_time, slot_type FROM sme_availability WHERE sme_id = ? AND is_active != 0",
        [smeId]
      ).catch(() => []);
      const windowReason = smeDemoWindowReason(smeWindows, weekday, timeSlot);

      const isAvailable = avail.available && !windowReason;
      return NextResponse.json({
        success: true,
        available: isAvailable,
        reason: isAvailable ? "Free & Available" : (avail.available ? windowReason : avail.reason)
      });
    }

    let query = "SELECT * FROM demo_reallocation_requests WHERE 1=1";
    const params: any[] = [];
    if (leaveRequestId) {
      query += " AND leave_request_id = ?";
      params.push(leaveRequestId);
    }
    if (status && status !== "all") {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC LIMIT 200";
    const requests = await db.all(query, ...params).catch(() => []);

    return NextResponse.json({ success: true, requests });
  } catch (err: any) {
    const authRes = apiAuthErrorResponse(err);
    if (authRes) return authRes;
    console.error("GET /api/demo-reallocations error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to fetch reallocation data" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    await ensureMigration("demo_reallocation_requests");
    await ensureTable(db);

    const body = await request.json();
    const { action } = body;

    // Role-based authorization
    if (action === "resolve" || action === "swap_mentor" || action === "reallocate_sme" || action === "swap_sme_sessions") {
      await requireRole(request, "admin", "L and D", "head_sme");
    } else if (action === "propose" || action === "escalate_lnd") {
      await requireSession(request);
    }

    // ── ESCALATE_LND: Mentor or SME requests help from L&D ───────────────
    if (action === "escalate_lnd") {
      const { demoSessionId, reason, requestedBy } = body;
      if (!demoSessionId) {
        return NextResponse.json({ success: false, message: "Missing demoSessionId" }, { status: 400 });
      }

      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [demoSessionId]);
      if (!demo) {
        return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });
      }

      // Mark session as requiring reallocation
      await db.run("UPDATE demo_sessions SET status = 'reallocation_required' WHERE id = ?", [demoSessionId]);

      // Remove existing pending reallocations for this session
      await db.run("DELETE FROM demo_reallocation_requests WHERE demo_session_id = ? AND status = 'pending'", [demoSessionId]).catch(() => {});

      const reqId = generateId("drr");
      await db.run(
        `INSERT INTO demo_reallocation_requests (
          id, demo_session_id, mentor_id, mentor_name, sme_id, sme_name,
          subject, stream, week, original_date_str, original_time_slot,
          proposed_date_str, proposed_time_slot, reason, status, request_kind, proposed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'escalated_to_lnd', ?)`,
        [
          reqId,
          demoSessionId,
          demo.mentorId,
          demo.mentorName,
          demo.smeId,
          demo.smeName,
          demo.subject,
          demo.stream,
          (demo as any).week ?? null,
          demo.dateStr,
          demo.timeSlot,
          demo.dateStr,
          demo.timeSlot,
          reason || "Need Help from L&D (Assistance requested)",
          requestedBy || demo.mentorName || "Faculty"
        ]
      );

      // Dispatch real-time system notification to L&D / Admin
      await dispatchSystemNotification(db, {
        title: "L&D Assistance Requested: Demo Reallocation",
        message: `${requestedBy || demo.mentorName} requested help from L&D to swap/reallocate the ${demo.subject} demo on ${demo.dateStr} (${demo.timeSlot}).`,
        link: "/l-and-d",
        type: "warning",
        domain: "demos",
        action: "reallocated",
      }).catch(() => {});

      // Audit log
      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_reallocation_escalated', ?, ?, 'Faculty', ?)`,
        [
          auditId,
          `Help requested from L&D for demo session ${demoSessionId} (${demo.subject}) by ${requestedBy || demo.mentorName}.`,
          requestedBy || demo.mentorName,
          new Date().toISOString()
        ]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: "Request sent to L&D team! They will assist with swapping/reallocating this session.",
        requestId: reqId
      });
    }

    // ── SWAP_MENTOR: L&D reassigns the demo session to an eligible peer mentor ──
    if (action === "swap_mentor") {
      const { demoSessionId, targetMentorId, decidedBy, notes } = body;
      if (!demoSessionId || !targetMentorId) {
        return NextResponse.json({ success: false, message: "Missing demoSessionId or targetMentorId" }, { status: 400 });
      }

      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [demoSessionId]);
      if (!demo) {
        return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });
      }

      const targetMentor = await db.get("SELECT id, name, college_id FROM mentors WHERE id = ?", [targetMentorId]);
      if (!targetMentor) {
        return NextResponse.json({ success: false, message: "Target mentor not found" }, { status: 404 });
      }

      const targetDate = String(demo.dateStr || "");
      const weekday = new Date(targetDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

      // Verify that the replacement mentor is genuinely free at that time
      const avail = await checkMentorAvailability(db, {
        mentorId: targetMentorId,
        dateStr: targetDate,
        dayOfWeek: weekday,
        timeSlot: demo.timeSlot,
        collegeId: targetMentor.college_id || undefined
      });
      if (!avail.available) {
        return NextResponse.json({
          success: false,
          message: `Cannot assign ${targetMentor.name}: ${avail.reason || "Has scheduled class conflict"}`
        }, { status: 409 });
      }

      // Verify replacement mentor doesn't already have a demo at that time
      const clash = await db.get(
        `SELECT id FROM demo_sessions WHERE dateStr = ? AND mentorId = ? AND id != ?
         AND status NOT IN ('completed', 'not_conducted')
         AND (timeSlot = ? OR ? LIKE ('%' || timeSlot || '%') OR timeSlot LIKE ('%' || ? || '%'))`,
        [targetDate, targetMentorId, demoSessionId, demo.timeSlot, demo.timeSlot, demo.timeSlot]
      );
      if (clash) {
        return NextResponse.json({
          success: false,
          message: `Cannot assign ${targetMentor.name}: already has another demo session at this time.`
        }, { status: 409 });
      }

      const prevMentorName = demo.mentorName;
      await db.run(
        `UPDATE demo_sessions
         SET mentorId = ?, mentorName = ?, status = 'scheduled'
         WHERE id = ?`,
        [targetMentor.id, targetMentor.name, demoSessionId]
      );

      // Resolve any pending reallocation requests for this session
      await db.run(
        `UPDATE demo_reallocation_requests
         SET status = 'approved', decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_notes = ?
         WHERE demo_session_id = ? AND status = 'pending'`,
        [decidedBy || "L&D", notes || `Swapped mentor from ${prevMentorName} to ${targetMentor.name}`, demoSessionId]
      );

      // Notify original mentor, new mentor, and SME
      await dispatchSystemNotification(db, {
        userIds: [demo.mentorId, targetMentor.id, demo.smeId].filter(Boolean),
        title: "L&D Demo Mentor Reassigned",
        message: `The ${demo.subject} L&D session on ${demo.dateStr} (${demo.timeSlot}) was reassigned from ${prevMentorName} to ${targetMentor.name} by L&D.`,
        link: "/mentor/demo_evaluations",
        type: "success",
        domain: "demos",
        action: "reallocated"
      }).catch(() => {});

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_mentor_swapped', ?, ?, 'L&D', ?)`,
        [
          auditId,
          `L&D session ${demoSessionId} (${demo.subject}) mentor swapped: ${prevMentorName} → ${targetMentor.name} by ${decidedBy || "L&D"}.`,
          decidedBy || "L&D",
          new Date().toISOString()
        ]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Successfully swapped session from ${prevMentorName} to ${targetMentor.name}!`
      });
    }

    // ── REALLOCATE_SME: L&D allocates/reallocates SME to demo session ─────
    if (action === "reallocate_sme") {
      const {
        demoSessionId,
        targetSmeId,
        targetSmeName,
        reason,
        notes,
        targetDateStr,
        targetTimeSlot,
        decidedBy,
        overrideClash = false
      } = body;

      if (!demoSessionId || !targetSmeId) {
        return NextResponse.json({ success: false, message: "Missing demoSessionId or targetSmeId" }, { status: 400 });
      }

      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [demoSessionId]);
      if (!demo) {
        return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });
      }

      const targetSme = await db.get("SELECT id, name, email FROM sme_users WHERE id = ?", [targetSmeId]);
      if (!targetSme) {
        return NextResponse.json({ success: false, message: "Target SME not found" }, { status: 404 });
      }

      const effDate = targetDateStr || demo.dateStr;
      const effSlot = targetTimeSlot || demo.timeSlot;
      const weekday = new Date(effDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

      if (!overrideClash) {
        const avail = await checkSmeAvailability(db, {
          smeId: targetSmeId,
          dateStr: effDate,
          timeSlot: effSlot,
          excludeDemoSessionId: demoSessionId
        });
        if (!avail.available) {
          return NextResponse.json({
            success: false,
            message: `Cannot assign ${targetSme.name}: ${avail.reason || "Has conflicting session/commitment"}`
          }, { status: 409 });
        }

        const smeWindows = await db.all(
          "SELECT day_of_week, start_time, end_time, slot_type FROM sme_availability WHERE sme_id = ? AND is_active != 0",
          [targetSmeId]
        ).catch(() => []);
        const windowReason = smeDemoWindowReason(smeWindows, weekday, effSlot);
        if (windowReason) {
          return NextResponse.json({
            success: false,
            message: `Cannot assign ${targetSme.name}: ${windowReason}`
          }, { status: 409 });
        }
      }

      const prevSmeName = demo.smeName || "Unassigned";
      const prevSmeId = demo.smeId;
      const reallocReason = reason || "Direct SME Reallocation by L&D";
      const reallocNotes = notes || `SME reallocated from ${prevSmeName} to ${targetSme.name}`;
      const actor = decidedBy || "L&D Manager";
      const reqId = generateId("drr");

      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE demo_sessions
           SET smeId = ?, smeName = ?, dateStr = ?, timeSlot = ?, status = 'confirmed'
           WHERE id = ?`,
          [targetSme.id, targetSme.name, effDate, effSlot, demoSessionId]
        );

        await tx.run(
          `INSERT INTO demo_reallocation_requests (
            id, demo_session_id, mentor_id, mentor_name, sme_id, sme_name,
            subject, stream, week, original_date_str, original_time_slot,
            proposed_date_str, proposed_time_slot, reason, status, request_kind,
            proposed_by, decided_by, decided_at, decision_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'sme_reallocation', ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            reqId,
            demoSessionId,
            demo.mentorId,
            demo.mentorName,
            targetSme.id,
            targetSme.name,
            demo.subject,
            demo.stream,
            (demo as any).week ?? null,
            demo.dateStr,
            demo.timeSlot,
            effDate,
            effSlot,
            reallocReason,
            actor,
            actor,
            reallocNotes
          ]
        );

        await tx.run(
          `UPDATE demo_reallocation_requests
           SET status = 'approved', decided_by = ?, decided_at = CURRENT_TIMESTAMP, decision_notes = ?
           WHERE demo_session_id = ? AND status = 'pending' AND id != ?`,
          [actor, `Resolved via direct reallocation to ${targetSme.name}`, demoSessionId, reqId]
        );
      });

      await dispatchSystemNotification(db, {
        userIds: [demo.mentorId, targetSme.id, prevSmeId].filter(Boolean),
        title: "L&D Demo SME Reallocated",
        message: `The ${demo.subject} demo session on ${effDate} (${effSlot}) was allocated to SME ${targetSme.name} (Previous: ${prevSmeName}). Reason: ${reallocReason}`,
        link: "/l-and-d",
        type: "success",
        domain: "demos",
        action: "reallocated"
      }).catch(() => {});

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_sme_reallocated', ?, ?, 'L&D', ?)`,
        [
          auditId,
          `L&D session ${demoSessionId} (${demo.subject}) SME reallocated: ${prevSmeName} → ${targetSme.name} by ${actor}. Reason: ${reallocReason}. Notes: ${reallocNotes}`,
          actor,
          new Date().toISOString()
        ]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Successfully allocated SME ${targetSme.name} to the session!`,
        requestId: reqId
      });
    }

    // ── SWAP_SME_SESSIONS: L&D executes SME swap between two demo sessions ──
    if (action === "swap_sme_sessions") {
      const {
        sessionAId,
        sessionBId,
        reason,
        notes,
        decidedBy,
        overrideClash = false
      } = body;

      if (!sessionAId || !sessionBId) {
        return NextResponse.json({ success: false, message: "Missing sessionAId or sessionBId" }, { status: 400 });
      }

      const [demoA, demoB] = await Promise.all([
        db.get("SELECT * FROM demo_sessions WHERE id = ?", [sessionAId]),
        db.get("SELECT * FROM demo_sessions WHERE id = ?", [sessionBId])
      ]);

      if (!demoA || !demoB) {
        return NextResponse.json({ success: false, message: "One or both demo sessions not found" }, { status: 404 });
      }

      const smeA = await db.get("SELECT id, name, email FROM sme_users WHERE id = ?", [demoA.smeId]);
      const smeB = await db.get("SELECT id, name, email FROM sme_users WHERE id = ?", [demoB.smeId]);

      if (!smeA || !smeB) {
        return NextResponse.json({ success: false, message: "Both sessions must have assigned SMEs to execute a swap" }, { status: 400 });
      }

      const weekdayA = new Date(demoA.dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
      const weekdayB = new Date(demoB.dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

      if (!overrideClash) {
        const availA = await checkSmeAvailability(db, {
          smeId: smeA.id,
          dateStr: demoB.dateStr,
          timeSlot: demoB.timeSlot,
          excludeDemoSessionId: demoA.id
        });
        if (!availA.available) {
          return NextResponse.json({
            success: false,
            message: `Cannot swap: ${smeA.name} is not available for Session B's slot (${demoB.dateStr} ${demoB.timeSlot}): ${availA.reason}`
          }, { status: 409 });
        }

        const availB = await checkSmeAvailability(db, {
          smeId: smeB.id,
          dateStr: demoA.dateStr,
          timeSlot: demoA.timeSlot,
          excludeDemoSessionId: demoB.id
        });
        if (!availB.available) {
          return NextResponse.json({
            success: false,
            message: `Cannot swap: ${smeB.name} is not available for Session A's slot (${demoA.dateStr} ${demoA.timeSlot}): ${availB.reason}`
          }, { status: 409 });
        }
      }

      const swapReason = reason || "SME Demo Session Swap by L&D";
      const actor = decidedBy || "L&D Manager";
      const reqIdA = generateId("drr");
      const reqIdB = generateId("drr");

      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE demo_sessions SET smeId = ?, smeName = ?, status = 'confirmed' WHERE id = ?`,
          [smeB.id, smeB.name, demoA.id]
        );
        await tx.run(
          `UPDATE demo_sessions SET smeId = ?, smeName = ?, status = 'confirmed' WHERE id = ?`,
          [smeA.id, smeA.name, demoB.id]
        );

        await tx.run(
          `INSERT INTO demo_reallocation_requests (
            id, demo_session_id, mentor_id, mentor_name, sme_id, sme_name,
            subject, stream, week, original_date_str, original_time_slot,
            proposed_date_str, proposed_time_slot, reason, status, request_kind,
            proposed_by, decided_by, decided_at, decision_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'sme_swap', ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            reqIdA,
            demoA.id,
            demoA.mentorId,
            demoA.mentorName,
            smeB.id,
            smeB.name,
            demoA.subject,
            demoA.stream,
            (demoA as any).week ?? null,
            demoA.dateStr,
            demoA.timeSlot,
            demoA.dateStr,
            demoA.timeSlot,
            swapReason,
            actor,
            actor,
            notes || `Swapped SME ${smeA.name} with ${smeB.name} from session ${demoB.id}`
          ]
        );

        await tx.run(
          `INSERT INTO demo_reallocation_requests (
            id, demo_session_id, mentor_id, mentor_name, sme_id, sme_name,
            subject, stream, week, original_date_str, original_time_slot,
            proposed_date_str, proposed_time_slot, reason, status, request_kind,
            proposed_by, decided_by, decided_at, decision_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'sme_swap', ?, ?, CURRENT_TIMESTAMP, ?)`,
          [
            reqIdB,
            demoB.id,
            demoB.mentorId,
            demoB.mentorName,
            smeA.id,
            smeA.name,
            demoB.subject,
            demoB.stream,
            (demoB as any).week ?? null,
            demoB.dateStr,
            demoB.timeSlot,
            demoB.dateStr,
            demoB.timeSlot,
            swapReason,
            actor,
            actor,
            notes || `Swapped SME ${smeB.name} with ${smeA.name} from session ${demoA.id}`
          ]
        );
      });

      await dispatchSystemNotification(db, {
        userIds: [demoA.mentorId, demoB.mentorId, smeA.id, smeB.id].filter(Boolean),
        title: "L&D Demo Sessions Swapped",
        message: `SMEs swapped between ${demoA.mentorName}'s session (${demoA.subject}) and ${demoB.mentorName}'s session (${demoB.subject}) by L&D. Reason: ${swapReason}`,
        link: "/l-and-d",
        type: "success",
        domain: "demos",
        action: "reallocated"
      }).catch(() => {});

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_sme_swapped', ?, ?, 'L&D', ?)`,
        [
          auditId,
          `L&D swapped SMEs: ${smeA.name} (${demoA.subject}) ↔ ${smeB.name} (${demoB.subject}) by ${actor}. Reason: ${swapReason}`,
          actor,
          new Date().toISOString()
        ]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Successfully swapped SMEs: ${smeA.name} ↔ ${smeB.name}!`
      });
    }

    // ── PROPOSE: mentor picks an alternative period → pending reservation ──
    if (action === "propose") {
      const { demoSessionId, proposedDateStr, proposedTimeSlot, leaveRequestId, reason, proposedBy } = body;
      if (!demoSessionId || !proposedDateStr || !proposedTimeSlot) {
        return NextResponse.json({ success: false, message: "Missing demoSessionId, proposedDateStr or proposedTimeSlot" }, { status: 400 });
      }

      const demo = await db.get("SELECT * FROM demo_sessions WHERE id = ?", [demoSessionId]);
      if (!demo) {
        return NextResponse.json({ success: false, message: "L&D session not found" }, { status: 404 });
      }
      if ((demo as any).status === "completed" || (demo as any).status === "not_conducted") {
        return NextResponse.json({ success: false, message: "Completed L&D sessions cannot be reallocated." }, { status: 400 });
      }

      const weekday = new Date(proposedDateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDateStr) || Number.isNaN(new Date(proposedDateStr + "T12:00:00").getTime())) {
        return NextResponse.json({ success: false, message: "Choose a valid proposed date." }, { status: 400 });
      }
      if (weekday === "Sunday") return NextResponse.json({ success: false, message: "Campus is closed on Sunday." }, { status: 400 });

      const proposalFailures: QueryFailure[] = [];
      const [proposalWindows, proposalHolidays, proposalClashes, proposalReservations] = await db.multiQuery(
        [
          { sql: "SELECT day_of_week, start_time, end_time, slot_type FROM sme_availability WHERE sme_id = ? AND is_active != 0", params: [demo.smeId] },
          { sql: "SELECT date FROM holidays WHERE date = ? LIMIT 1", params: [proposedDateStr] },
          {
            sql: `SELECT id FROM demo_sessions WHERE dateStr = ? AND id != ? AND status NOT IN ('completed', 'not_conducted')
                  AND (mentorId = ? OR smeId = ?)
                  AND (timeSlot = ? OR ? LIKE ('%' || timeSlot || '%') OR timeSlot LIKE ('%' || ? || '%'))`,
            params: [proposedDateStr, demoSessionId, demo.mentorId, demo.smeId, proposedTimeSlot, proposedTimeSlot, proposedTimeSlot],
          },
          {
            sql: `SELECT id FROM demo_reallocation_requests WHERE status IN ('pending', 'approved') AND demo_session_id != ?
                  AND (mentor_id = ? OR sme_id = ?) AND proposed_date_str = ?
                  AND (proposed_time_slot = ? OR ? LIKE ('%' || proposed_time_slot || '%') OR proposed_time_slot LIKE ('%' || ? || '%'))`,
            params: [demoSessionId, demo.mentorId, demo.smeId, proposedDateStr, proposedTimeSlot, proposedTimeSlot, proposedTimeSlot],
          },
        ],
        proposalFailures
      );
      if (proposalFailures.length) return NextResponse.json({ success: false, message: "Could not verify mentor and SME availability. Please retry." }, { status: 500 });
      if (proposalHolidays?.length) return NextResponse.json({ success: false, message: "The proposed date is a campus holiday." }, { status: 400 });
      if (proposalClashes?.length) return NextResponse.json({ success: false, message: "The mentor or SME already has an L&D session during this period." }, { status: 409 });
      if (proposalReservations?.length) return NextResponse.json({ success: false, message: "This period is already reserved for another L&D reallocation." }, { status: 409 });

      const [mentorAvailable, smeAvailable] = await Promise.all([
        checkMentorAvailability(db, { mentorId: demo.mentorId, dateStr: proposedDateStr, dayOfWeek: weekday, timeSlot: proposedTimeSlot }),
        checkSmeAvailability(db, { smeId: demo.smeId, dateStr: proposedDateStr, timeSlot: proposedTimeSlot }),
      ]);
      if (!mentorAvailable.available) return NextResponse.json({ success: false, message: "Mentor is not free: " + (mentorAvailable.reason || "timetable conflict") }, { status: 409 });
      if (!smeAvailable.available) return NextResponse.json({ success: false, message: "SME is not free: " + (smeAvailable.reason || "availability conflict") }, { status: 409 });
      const proposalWindowReason = smeDemoWindowReason(proposalWindows || [], weekday, proposedTimeSlot);
      if (proposalWindowReason) return NextResponse.json({ success: false, message: proposalWindowReason }, { status: 409 });

      // Replace any existing pending reservation for this demo
      await db.run(
        "DELETE FROM demo_reallocation_requests WHERE demo_session_id = ? AND status = 'pending'",
        [demoSessionId]
      ).catch(() => {});

      const reqId = generateId("drr");
      await db.run(
        `INSERT INTO demo_reallocation_requests (
          id, demo_session_id, leave_request_id, mentor_id, mentor_name, sme_id, sme_name,
          subject, stream, week, original_date_str, original_time_slot,
          proposed_date_str, proposed_time_slot, reason, status, proposed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          reqId,
          demoSessionId,
          leaveRequestId || null,
          demo.mentorId,
          demo.mentorName,
          demo.smeId,
          demo.smeName,
          demo.subject,
          demo.stream,
          (demo as any).week ?? null,
          demo.dateStr,
          demo.timeSlot,
          proposedDateStr,
          proposedTimeSlot,
          reason || "Mentor leave reallocation",
          proposedBy || demo.mentorName
        ]
      );

      // Notify L&D and the SME via zero-delay notification engine
      if (demo.smeId) {
        await dispatchSystemNotification(db, {
          userIds: [demo.smeId],
          title: "L&D Reallocation Proposed",
          message: `${demo.mentorName} proposed moving the ${demo.subject} L&D session from ${demo.dateStr} (${demo.timeSlot}) to ${proposedDateStr} (${proposedTimeSlot}). Awaiting L&D approval.`,
          link: "/l-and-d",
          type: "warning",
          domain: "demos",
          action: "reallocated",
        }).catch(() => {});
      }

      // Audit log
      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_reallocation_proposed', ?, ?, 'Mentor', ?)`,
        [
          auditId,
          `L&D session ${demoSessionId} (${demo.subject}) reallocation proposed: ${demo.dateStr} (${demo.timeSlot}) → ${proposedDateStr} (${proposedTimeSlot}). Slot reserved pending L&D approval.`,
          proposedBy || demo.mentorName,
          new Date().toISOString()
        ]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Alternative period reserved: ${proposedDateStr} (${proposedTimeSlot}). Sent to L&D for approval.`,
        requestId: reqId
      });
    }

    // ── RESOLVE: L&D approves or rejects ─────────────────────────
    if (action === "resolve") {
      const { requestId, decision, decidedBy, decisionNotes } = body;
      if (!requestId || !["approved", "rejected"].includes(decision)) {
        return NextResponse.json({ success: false, message: "Missing requestId or invalid decision" }, { status: 400 });
      }

      const req = await db.get("SELECT * FROM demo_reallocation_requests WHERE id = ?", [requestId]);
      if (!req) {
        return NextResponse.json({ success: false, message: "Reallocation request not found" }, { status: 404 });
      }
      if (req.status !== "pending") {
        return NextResponse.json({ success: false, message: `Request already ${req.status}.` }, { status: 400 });
      }

      if (decision === "rejected") {
        const flip = await db.run(
          "UPDATE demo_reallocation_requests SET status = 'rejected', decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ? AND status = 'pending'",
          [decidedBy || "L&D", new Date().toISOString(), decisionNotes || null, requestId]
        );
        if (flip.changes !== 1) {
          return NextResponse.json({ success: false, message: "Request was already processed." }, { status: 409 });
        }
        await db.run("UPDATE demo_sessions SET status = 'confirmed' WHERE id = ?", [req.demo_session_id]).catch(() => {});

        const auditId = generateId("audit");
        await db.run(
          `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
           VALUES (?, 'demo_reallocation_resolved', ?, ?, 'L&D', ?)`,
          [
            auditId,
            `Demo reallocation ${requestId} REJECTED by ${decidedBy || "L&D"}. Reservation released; original slot ${req.original_date_str} (${req.original_time_slot}) retained.`,
            decidedBy || "L&D",
            new Date().toISOString()
          ]
        ).catch(() => {});

        return NextResponse.json({ success: true, message: "Reallocation rejected. Reservation released." });
      }

      // ── APPROVED: move the demo, release the original slot ────────────
      // Re-check live timetable, SME windows and reservations at decision time.
      const targetDate = String(req.proposed_date_str || "");
      const targetWeekday = new Date(targetDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
      if (targetWeekday === "Sunday") {
        return NextResponse.json({ success: false, message: "Cannot approve: campus is closed on Sunday." }, { status: 409 });
      }

      const mentorRec = await db.get("SELECT college_id FROM mentors WHERE id = ?", [req.mentor_id]).catch(() => null);
      const appCollegeId = mentorRec?.college_id || null;
      const appCollege = appCollegeId ? await db.get("SELECT is_saturday_working, working_days FROM colleges WHERE id = ?", [appCollegeId]).catch(() => null) : null;
      if (targetWeekday === "Saturday" && appCollege && (appCollege.is_saturday_working === 0 || appCollege.working_days === 5)) {
        return NextResponse.json({ success: false, message: "Cannot approve: campus is closed on Saturday." }, { status: 409 });
      }
      const targetCfg = await db.get("SELECT day_type, day_order FROM campus_daily_configs WHERE dateStr = ? AND (college_id = ? OR college_id IS NULL) LIMIT 1", [targetDate, appCollegeId]).catch(() => null);
      if (targetCfg && (targetCfg.day_type === "holiday" || (targetCfg as any).is_holiday === 1)) {
        return NextResponse.json({ success: false, message: "Cannot approve: target date is a campus holiday." }, { status: 409 });
      }
      let effectiveTargetWeekday = targetWeekday;
      if (targetCfg?.day_order && targetCfg.day_order !== "None" && targetCfg.day_order !== "none") {
        effectiveTargetWeekday = mapDayOrderToDayName(targetCfg.day_order, targetWeekday);
      }

      const approvalFailures: QueryFailure[] = [];
      const [smeWindows, holidays] = await db.multiQuery(
        [
          { sql: "SELECT day_of_week, start_time, end_time, slot_type FROM sme_availability WHERE sme_id = ? AND is_active != 0", params: [req.sme_id] },
          { sql: "SELECT date FROM holidays WHERE date = ? LIMIT 1", params: [targetDate] },
        ],
        approvalFailures
      );
      if (approvalFailures.length) {
        return NextResponse.json({ success: false, message: "Could not re-check the SME timetable. Please retry." }, { status: 500 });
      }
      if (holidays?.length) {
        return NextResponse.json({ success: false, message: "Cannot approve: the selected date is a campus holiday." }, { status: 409 });
      }
      const windowReason = smeDemoWindowReason(smeWindows || [], targetWeekday, String(req.proposed_time_slot || ""));
      if (windowReason) {
        return NextResponse.json({ success: false, message: "Cannot approve: " + windowReason }, { status: 409 });
      }
      const [mentorStatus, smeStatus] = await Promise.all([
        checkMentorAvailability(db, { mentorId: req.mentor_id, collegeId: appCollegeId || undefined, dateStr: targetDate, dayOfWeek: effectiveTargetWeekday, timeSlot: req.proposed_time_slot }),
        checkSmeAvailability(db, { smeId: req.sme_id, dateStr: targetDate, timeSlot: req.proposed_time_slot, excludeDemoSessionId: req.demo_session_id }),
      ]);
      if (!mentorStatus.available) {
        return NextResponse.json({ success: false, message: "Cannot approve: mentor is no longer free. " + (mentorStatus.reason || "") }, { status: 409 });
      }
      if (!smeStatus.available) {
        return NextResponse.json({ success: false, message: "Cannot approve: SME is no longer free. " + (smeStatus.reason || "") }, { status: 409 });
      }

      const competingReservation = await db.get(
        `SELECT id FROM demo_reallocation_requests
         WHERE id != ? AND status IN ('pending', 'approved')
           AND (mentor_id = ? OR sme_id = ?) AND proposed_date_str = ?
           AND (proposed_time_slot = ? OR ? LIKE ('%' || proposed_time_slot || '%') OR proposed_time_slot LIKE ('%' || ? || '%'))
         LIMIT 1`,
        [requestId, req.mentor_id, req.sme_id, targetDate, req.proposed_time_slot, req.proposed_time_slot, req.proposed_time_slot]
      );
      if (competingReservation) {
        return NextResponse.json({ success: false, message: "Cannot approve: this period is reserved for another reallocation." }, { status: 409 });
      }

      // Re-verify target is still free (another demo may have taken it meanwhile).
      const clash = await db.get(
        `SELECT id FROM demo_sessions
         WHERE dateStr = ? AND id != ? AND status NOT IN ('completed', 'not_conducted')
           AND (mentorId = ? OR smeId = ?)
           AND (timeSlot = ? OR ? LIKE ('%' || timeSlot || '%') OR timeSlot LIKE ('%' || ? || '%'))`,
        [req.proposed_date_str, req.demo_session_id, req.mentor_id, req.sme_id, req.proposed_time_slot, req.proposed_time_slot, req.proposed_time_slot]
      ).catch(() => null);
      if (clash) {
        return NextResponse.json({
          success: false,
          message: `Cannot approve: the proposed period ${req.proposed_date_str} (${req.proposed_time_slot}) is now occupied by another demo (${clash.id}).`
        }, { status: 409 });
      }

      // Claim the request first (conditional) and move the session in the same
      // transaction, so two approvers cannot both apply it.
      const moved = await db.transaction(async (tx) => {
        const flip = await tx.run(
          "UPDATE demo_reallocation_requests SET status = 'approved', decided_by = ?, decided_at = ?, decision_notes = ? WHERE id = ? AND status = 'pending'",
          [decidedBy || "L&D", new Date().toISOString(), decisionNotes || null, requestId]
        );
        if (flip.changes !== 1) return false;
        await tx.run(
          `UPDATE demo_sessions
           SET dateStr = ?, timeSlot = ?, status = 'confirmed'
           WHERE id = ?`,
          [req.proposed_date_str, req.proposed_time_slot, req.demo_session_id]
        );
        return true;
      });
      if (!moved) {
        return NextResponse.json({ success: false, message: "Request was already processed." }, { status: 409 });
      }

      // Notifications: mentor + SME via zero-delay notification engine
      await dispatchSystemNotification(db, {
        userIds: [req.mentor_id, req.sme_id].filter(Boolean),
        title: "L&D Reallocation Approved",
        message: `Your ${req.subject} L&D session has been moved to ${req.proposed_date_str} (${req.proposed_time_slot}). SME: ${req.sme_name}.`,
        link: "/mentor/demo_evaluations",
        type: "success",
        domain: "demos",
        action: "reallocated",
      }).catch(() => {});

      const auditId = generateId("audit");
      await db.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp)
         VALUES (?, 'demo_reallocation_resolved', ?, ?, 'L&D', ?)`,
        [
          auditId,
          `L&D reallocation ${requestId} APPROVED by ${decidedBy || "L&D"}. L&D session ${req.demo_session_id} (${req.subject}) moved ${req.original_date_str} (${req.original_time_slot}) → ${req.proposed_date_str} (${req.proposed_time_slot}). Original slot released.`,
          decidedBy || "L&D",
          new Date().toISOString()
        ]
      ).catch(() => {});

      return NextResponse.json({ success: true, message: "Reallocation approved. L&D schedule updated across all views." });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    const authRes = apiAuthErrorResponse(err);
    if (authRes) return authRes;
    console.error("POST /api/demo-reallocations error:", err);
    return NextResponse.json({ success: false, message: err?.message || "Failed to process reallocation" }, { status: 500 });
  }
}
