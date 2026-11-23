import { TursoDbAdapter, type QueryFailure } from "./db";
import { mapDayOrderToDayName, isTimeSlotMatch } from "./utils";

export interface MentorAvailabilityParams {
  mentorId: string;
  dateStr: string; // "YYYY-MM-DD"
  collegeId?: string;
  dayOfWeek?: string; // "Monday", "Tuesday", etc.
  timeSlot?: string; // e.g. "09:00 AM - 10:00 AM" or "09.00 AM - 10.00 AM"
  shift?: string; // "shift_1", "shift_2", "general"
  excludeHandoverId?: string;
  excludeInterviewId?: string;
  excludeDemoSwapId?: string;
  /** Preloaded busy-windows from loadAvailabilityContext(); skips queries when it covers dateStr. */
  ctx?: AvailabilityContext;
}

export interface MentorAvailabilityResult {
  available: boolean;
  reason?: string;
  busyType?: "leave" | "permission" | "od" | "slot" | "handover" | "interview" | "demo";
  details?: Record<string, any>;
}

export interface SmeAvailabilityParams {
  smeId: string;
  dateStr: string;
  timeSlot?: string;
  excludeDemoSwapId?: string;
  excludeDemoSessionId?: string;
  /** Preloaded busy-windows from loadAvailabilityContext(); skips queries when it covers dateStr. */
  ctx?: AvailabilityContext;
}

export interface SmeAvailabilityResult {
  available: boolean;
  reason?: string;
  busyType?: "demo" | "leave" | "other";
  details?: Record<string, any>;
}

/**
 * Preloaded busy-windows for one mentor and/or SME across a set of dates.
 *
 * Building the alternatives matrix for a reallocation used to call the engines once
 * per date × period: 12 dates × 6 periods × up to 7 queries each ≈ 500 round trips,
 * which at measured cross-region latency is 100+ seconds and routinely outlived the
 * function. One context load replaces them and the period loop becomes pure JS.
 */
export interface AvailabilityContext {
  mentorId?: string | null;
  /** Every mentor the preload covers. The engines filter each row down to the requested one. */
  mentorIds: string[];
  smeId?: string | null;
  collegeId?: string | null;
  /** Dates the preload covers; a date outside it must fall back to live queries. */
  dateSet: Set<string>;
  leaves: any[];
  mentorSlots: any[];
  handedOver: Set<string>;
  coverHandoversByDate: Map<string, any[]>;
  interviewSlotsByDate: Map<string, any[]>;
  directInterviewsByDate: Map<string, any[]>;
  mentorDemoSwaps: any[];
  smeDemoSwaps: any[];
  smeDemoSessions: any[];
  dailyConfigsByDate: Map<string, any>;
}

const DATE_CHUNK = 200;
const MENTOR_CHUNK = 100;
function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const ph = (n: number) => Array.from({ length: n }, () => "?").join(",");

export async function loadAvailabilityContext(
  db: TursoDbAdapter,
  opts: { mentorId?: string | null; mentorIds?: (string | null)[]; smeId?: string | null; dates: string[]; collegeId?: string | null }
): Promise<AvailabilityContext> {
  const { mentorId = null, smeId = null, collegeId = null } = opts;
  const mentorIds = Array.from(new Set([mentorId, ...(opts.mentorIds ?? [])].filter(Boolean) as string[]));
  const dates = Array.from(new Set(opts.dates.filter(Boolean))).sort();
  const ctx: AvailabilityContext = {
    mentorId,
    mentorIds,
    smeId,
    collegeId,
    dateSet: new Set(dates),
    leaves: [],
    mentorSlots: [],
    handedOver: new Set(),
    coverHandoversByDate: new Map(),
    interviewSlotsByDate: new Map(),
    directInterviewsByDate: new Map(),
    mentorDemoSwaps: [],
    smeDemoSwaps: [],
    smeDemoSessions: [],
    dailyConfigsByDate: new Map(),
  };
  if (dates.length === 0) return ctx;

  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const dateChunks = chunks(dates, DATE_CHUNK);
  const mentorChunks = chunks(mentorIds, MENTOR_CHUNK);
  const byDate = (map: Map<string, any[]>, keyOf: (row: any) => string, rows: any[]) => {
    for (const row of rows) {
      const k = String(keyOf(row) ?? "");
      if (!k) continue;
      const list = map.get(k) || [];
      list.push(row);
      map.set(k, list);
    }
  };

  const queries: { sql: string; params: any[] }[] = [];
  const labels: string[] = [];

  for (const mentors of mentorChunks) {
    queries.push({
      sql: `SELECT mentor_id, id, request_type, leave_category, start_date, end_date, reason
            FROM faculty_leave_requests
            WHERE mentor_id IN (${ph(mentors.length)}) AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
      params: [...mentors, maxDate, minDate],
    });
    labels.push("leaves");

    queries.push({
      sql: `SELECT mentorId, id, course, classGroup, day, time, shift FROM slots WHERE mentorId IN (${ph(mentors.length)})`,
      params: [...mentors],
    });
    labels.push("mentorSlots");

    queries.push({
      sql: `SELECT id, sessionId, subject, stream, mentorId, dateStr, timeSlot, status, proposedMentorId, proposedDateStr, proposedTimeSlot
            FROM demo_swap_requests
            WHERE status IN ('pending', 'pending_peer', 'pending_sme', 'approved')
              AND (mentorId IN (${ph(mentors.length)}) OR proposedMentorId IN (${ph(mentors.length)}))
              AND ((dateStr BETWEEN ? AND ?) OR (proposedDateStr BETWEEN ? AND ?))`,
      params: [...mentors, ...mentors, minDate, maxDate, minDate, maxDate],
    });
    labels.push("mentorDemoSwaps");

    for (const chunk of dateChunks) {
      queries.push({
        sql: `SELECT slotId, dateStr FROM approved_handovers WHERE originalMentorId IN (${ph(mentors.length)}) AND dateStr IN (${ph(chunk.length)})`,
        params: [...mentors, ...chunk],
      });
      labels.push("handedOver");

      queries.push({
        sql: `SELECT ah.id, ah.slotId, ah.originalMentorId, ah.coverStaffId, ah.dateStr,
                      s.course, s.classGroup, s.day, s.time, s.shift
               FROM approved_handovers ah
               JOIN slots s ON s.id = ah.slotId
               WHERE ah.coverStaffId IN (${ph(mentors.length)}) AND ah.dateStr IN (${ph(chunk.length)})`,
        params: [...mentors, ...chunk],
      });
      labels.push("coverHandovers");

      queries.push({
        sql: `SELECT sis.mentor_id, sis.id, sis.interview_id, sis.slot_start_time, sis.slot_end_time, si.subject, si.target_date
               FROM student_interview_slots sis
               JOIN student_interviews si ON si.id = sis.interview_id
               WHERE sis.mentor_id IN (${ph(mentors.length)}) AND si.target_date IN (${ph(chunk.length)}) AND sis.status != 'cancelled'`,
        params: [...mentors, ...chunk],
      });
      labels.push("interviewSlots");
    }
  }

  if (mentorIds.length > 0) {
    for (const chunk of dateChunks) {
      queries.push({
        sql: `SELECT id, subject, target_date, preferred_start_time, assigned_mentor_ids, status
               FROM student_interviews
               WHERE target_date IN (${ph(chunk.length)})
                 AND status IN ('assigned', 'capacity_partially_accepted', 'scheduled')`,
        params: [...chunk],
      });
      labels.push("directInterviews");
    }
  }

  if (smeId) {
    queries.push({
      sql: `SELECT id, sessionId, subject, stream, smeId, dateStr, timeSlot, status, proposedSmeId, proposedDateStr, proposedTimeSlot
            FROM demo_swap_requests
            WHERE status IN ('pending', 'pending_peer', 'pending_sme', 'approved')
              AND (smeId = ? OR proposedSmeId = ?)
              AND ((dateStr BETWEEN ? AND ?) OR (proposedDateStr BETWEEN ? AND ?))`,
      params: [smeId, smeId, minDate, maxDate, minDate, maxDate],
    });
    labels.push("smeDemoSwaps");

    queries.push({
      sql: `SELECT id, subject, timeSlot, dateStr FROM demo_sessions
            WHERE smeId = ? AND dateStr BETWEEN ? AND ?
              AND status NOT IN ('completed', 'not_conducted')`,
      params: [smeId, minDate, maxDate],
    });
    labels.push("smeDemoSessions");
  }

  for (const chunk of dateChunks) {
    queries.push({
      sql: `SELECT college_id, dateStr, day_type, day_order FROM campus_daily_configs WHERE dateStr IN (${ph(chunk.length)})`,
      params: [...chunk],
    });
    labels.push("dailyConfigs");
  }

  const failures: any[] = [];
  const results = await db.multiQuery(queries, failures);
  if (failures.length > 0) {
    // A half-loaded context would silently report free periods that are busy, so the
    // caller must fall back to the per-date queries instead of trusting a partial one.
    throw new Error(`Availability context incomplete: ${failures.length}/${queries.length} slices failed`);
  }

  results.forEach((rows, i) => {
    switch (labels[i]) {
      case "leaves": ctx.leaves = rows; break;
      case "mentorSlots": ctx.mentorSlots = rows; break;
      case "handedOver":
        for (const r of rows) ctx.handedOver.add(`${r.slotid ?? r.slotId}|${String(r.datestr ?? r.dateStr)}`);
        break;
      case "coverHandovers": byDate(ctx.coverHandoversByDate, (r) => r.datestr ?? r.dateStr, rows); break;
      case "interviewSlots": byDate(ctx.interviewSlotsByDate, (r) => r.target_date, rows); break;
      case "directInterviews": byDate(ctx.directInterviewsByDate, (r) => r.target_date, rows); break;
      case "mentorDemoSwaps": ctx.mentorDemoSwaps = rows; break;
      case "smeDemoSwaps": ctx.smeDemoSwaps = rows; break;
      case "smeDemoSessions": ctx.smeDemoSessions = rows; break;
      case "dailyConfigs":
        for (const r of rows) {
          const ds = r.dateStr || r.datestr;
          const cid = r.college_id || r.collegeid || "";
          if (ds) {
            ctx.dailyConfigsByDate.set(ds, r);
            if (cid) ctx.dailyConfigsByDate.set(`${cid}|${ds}`, r);
          }
        }
        break;
      default: break;
    }
  });

  return ctx;
}

/**
 * Normalizes time string representations for comparisons.
 * Converts "09.00 AM" -> "09:00 AM"
 */
function normalizeTime(timeStr: string): string {
  return (timeStr || "").replace(/\./g, ":").trim().toUpperCase();
}

function parseTimeToMinutes(t: string): number {
  if (!t) return -1;
  const match = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/i);
  if (!match) return -1;
  let hr = parseInt(match[1], 10);
  const min = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (ampm === "PM" && hr < 12) hr += 12;
  if (ampm === "AM" && hr === 12) hr = 0;
  return hr * 60 + min;
}

/**
 * Checks if a target time falls within or overlaps with a time range or slot.
 */
function isTimeSlotOverlap(slotTime1: string, slotTime2: string): boolean {
  if (!slotTime1 || !slotTime2) return true; // If one isn't specified, assume conflict
  if (isTimeSlotMatch(slotTime1, slotTime2)) return true;

  // "Period 3 (10:40 - 11:35)" must be read as one range, not two. Without stripping
  // the label, the period number was parsed as a clock time (Period 5 → 00:05) and
  // every labelled period overlapped every other one, so the whole matrix came back busy.
  const stripLabel = (s: string) => s.replace(/period\s*\d+\s*[\(:]?/gi, "").replace(/[\(\)]/g, "");
  const t1 = stripLabel((slotTime1 || "").trim());
  const t2 = stripLabel((slotTime2 || "").trim());
  // A label with no clock range left in it cannot be compared, so keep the
  // conservative "assume conflict" rule the un-timed inputs already get above.
  if (!t1 || !t2) return true;

  const matches1 = Array.from(t1.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));
  const matches2 = Array.from(t2.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));

  if (matches1.length >= 2 && matches2.length >= 2) {
    const s1 = parseTimeToMinutes(matches1[0][0]);
    const e1 = parseTimeToMinutes(matches1[1][0]);
    const s2 = parseTimeToMinutes(matches2[0][0]);
    const e2 = parseTimeToMinutes(matches2[1][0]);

    if (s1 >= 0 && e1 >= 0 && s2 >= 0 && e2 >= 0) {
      return s1 < e2 && e1 > s2;
    }
  }

  const clean1 = t1.toLowerCase().replace(/\./g, ":").replace(/\s+/g, "");
  const clean2 = t2.toLowerCase().replace(/\./g, ":").replace(/\s+/g, "");
  if (clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1)) return true;

  return false;
}

/**
 * Unified Availability Engine for Mentors.
 * Checks across:
 * 1. Approved Faculty Leaves & Permissions (faculty_leave_requests)
 * 2. Regular Teaching Timetable Slots (slots)
 * 3. Approved Handover Substitution Duties (approved_handovers)
 * 4. Scheduled Student Interview Panels (student_interviews & student_interview_slots)
 * 5. Scheduled Demo Evaluations & Demo Swaps (demo_swap_requests)
 */
export async function checkMentorAvailability(
  db: TursoDbAdapter,
  params: MentorAvailabilityParams
): Promise<MentorAvailabilityResult> {
  const { mentorId, dateStr, shift } = params;
  if (!mentorId || !dateStr) {
    return { available: false, reason: "Missing mentorId or dateStr" };
  }

  // Derive day of week if not supplied
  const rawDayOfWeek =
    params.dayOfWeek ||
    new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });

  const timeSlot = params.timeSlot ? normalizeTime(params.timeSlot) : undefined;

  // A preloaded context only answers for dates it was actually loaded with; any other
  // date has to fall back to live queries rather than report a false "free".
  const ctx = params.ctx && params.ctx.dateSet.has(dateStr) ? params.ctx : null;

  // Lookup campus daily config to resolve effective Day Order or holiday status
  const cfg = (ctx?.dailyConfigsByDate?.get(`${params.collegeId || ""}|${dateStr}`)
    || ctx?.dailyConfigsByDate?.get(dateStr))
    || (!ctx ? await db.get("SELECT day_type, day_order FROM campus_daily_configs WHERE dateStr = ? AND (college_id = ? OR college_id IS NULL) LIMIT 1", [dateStr, params.collegeId || null]).catch(() => null) : null);

  const isCampusHoliday = Boolean(cfg && (cfg.day_type === "holiday" || (cfg as any).is_holiday === 1));
  let effectiveDay = rawDayOfWeek;
  let cfgDayOrder: string | null = null;
  if (cfg?.day_order && cfg.day_order !== "None" && cfg.day_order !== "none") {
    cfgDayOrder = String(cfg.day_order).toLowerCase().trim();
    effectiveDay = mapDayOrderToDayName(cfg.day_order, rawDayOfWeek);
  }

  // ---------------------------------------------------------------------------
  // Availability inputs
  //
  // None of the five rules below feeds another: a hit only short-circuits the
  // answer. Read one at a time they cost ~6 round trips per mentor per date, and
  // this runs across whole cover-mentor lists and whole demo matrices. Either the
  // caller preloaded them (ctx) or they arrive as one batch.
  // ---------------------------------------------------------------------------
  let activeLeave: any = null;
  let mentorSlots: any[] = [];
  let coveringHandovers: any[] = [];
  let interviewSlots: any[] = [];
  let directInterviews: any[] = [];
  let activeDemos: any[] = [];
  let handedOverKeys = new Set<string>();

  if (ctx) {
    activeLeave = ctx.leaves.find(l => l.mentor_id === mentorId && dateStr >= l.start_date && dateStr <= l.end_date) || null;
    mentorSlots = ctx.mentorSlots.filter(s => (s.mentorId ?? s.mentorid) === mentorId);
    handedOverKeys = ctx.handedOver;
    coveringHandovers = (ctx.coverHandoversByDate.get(dateStr) || [])
      .filter(h => (h.coverStaffId ?? h.coverstaffid) === mentorId)
      .filter(h => !params.excludeHandoverId || h.id !== params.excludeHandoverId);
    interviewSlots = (ctx.interviewSlotsByDate.get(dateStr) || []).filter(r => (r.mentor_id ?? r.mentorId) === mentorId);
    directInterviews = ctx.directInterviewsByDate.get(dateStr) || [];
    activeDemos = ctx.mentorDemoSwaps.filter(d =>
      (d.mentorId === mentorId && d.dateStr === dateStr) ||
      (d.proposedMentorId === mentorId && d.proposedDateStr === dateStr)
    );
  } else {
    const availFailures: QueryFailure[] = [];
    const [leaveRows, slotRows, handedOverRows, coverRows, interviewRows, directRows, demoRows] = await db.multiQuery(
      [
        {
          sql: `SELECT id, request_type, leave_category, start_date, end_date, reason
                FROM faculty_leave_requests
                WHERE mentor_id = ?
                  AND status = 'approved'
                  AND ? >= start_date AND ? <= end_date`,
          params: [mentorId, dateStr, dateStr],
        },
        // Rules 2 and its handed-over probe only run when a time slot was supplied.
        timeSlot
          ? { sql: `SELECT id, course, classGroup, day, time, shift FROM slots WHERE mentorId = ?`, params: [mentorId] }
          : { sql: "SELECT 1 WHERE 1=0" },
        timeSlot
          ? { sql: `SELECT slotId FROM approved_handovers WHERE originalMentorId = ? AND dateStr = ?`, params: [mentorId, dateStr] }
          : { sql: "SELECT 1 WHERE 1=0" },
        {
          sql: `SELECT ah.id, ah.slotId, ah.originalMentorId, ah.coverStaffId, ah.dateStr,
                       s.course, s.classGroup, s.day, s.time, s.shift
                FROM approved_handovers ah
                JOIN slots s ON s.id = ah.slotId
                WHERE ah.coverStaffId = ? AND ah.dateStr = ?`,
          params: [mentorId, dateStr],
        },
        {
          sql: `SELECT sis.id, sis.interview_id, sis.slot_start_time, sis.slot_end_time, si.subject, si.target_date
                FROM student_interview_slots sis
                JOIN student_interviews si ON si.id = sis.interview_id
                WHERE sis.mentor_id = ? AND si.target_date = ? AND sis.status != 'cancelled'`,
          params: [mentorId, dateStr],
        },
        {
          sql: `SELECT id, subject, target_date, preferred_start_time, assigned_mentor_ids, status
                FROM student_interviews
                WHERE target_date = ? AND status IN ('assigned', 'capacity_partially_accepted', 'scheduled')`,
          params: [dateStr],
        },
        {
          sql: `SELECT id, sessionId, subject, stream, dateStr, timeSlot, status, proposedMentorId, proposedDateStr, proposedTimeSlot
                FROM demo_swap_requests
                WHERE status IN ('pending', 'pending_peer', 'pending_sme', 'approved')
                  AND (
                    (mentorId = ? AND dateStr = ?) OR
                    (proposedMentorId = ? AND proposedDateStr = ?)
                  )`,
          params: [mentorId, dateStr, mentorId, dateStr],
        },
      ],
      availFailures
    );
    if (availFailures.length > 0) {
      // A slice that came back empty because it failed would report a busy mentor as
      // free, so this must throw the way the sequential queries used to.
      throw new Error(`Availability inputs unreadable for ${mentorId} on ${dateStr}: ${availFailures.map(f => f.error).join("; ")}`);
    }
    activeLeave = leaveRows[0] || null;
    mentorSlots = slotRows;
    for (const r of handedOverRows) handedOverKeys.add(`${r.slotId ?? r.slotid}|${dateStr}`);
    coveringHandovers = coverRows.filter(h => !params.excludeHandoverId || h.id !== params.excludeHandoverId);
    interviewSlots = interviewRows;
    directInterviews = directRows;
    activeDemos = demoRows;
  }

  // ---------------------------------------------------------------------------
  // 1. Approved Faculty Leaves & Permissions
  // ---------------------------------------------------------------------------
  if (activeLeave) {
    const isPermission = activeLeave.request_type === "Permission";
    const isOD = activeLeave.request_type === "OD";
    const reqType = isPermission ? "permission" : isOD ? "od" : "leave";
    const label = isPermission ? "Permission" : isOD ? "On Duty (OD)" : "Approved Leave";

    return {
      available: false,
      busyType: reqType,
      reason: `Mentor is on ${label} (${activeLeave.leave_category || "General"}) from ${activeLeave.start_date} to ${activeLeave.end_date}.`,
      details: activeLeave
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Regular Timetable Slots
  // ---------------------------------------------------------------------------
  if (timeSlot && !isCampusHoliday) {
    for (const slot of mentorSlots) {
      const sDay = (slot.day || "").toLowerCase().trim();
      const targetDay = effectiveDay.toLowerCase().trim();
      const mappedDay = (mapDayOrderToDayName(slot.day, "") || "").toLowerCase().trim();
      const dayMatches = (cfgDayOrder && sDay === cfgDayOrder) || sDay === targetDay || mappedDay === targetDay || sDay.startsWith(targetDay.slice(0, 3));
      if (!dayMatches) continue;

      if (shift && slot.shift && slot.shift !== "general" && slot.shift !== shift) continue;

      if (isTimeSlotOverlap(slot.time, timeSlot)) {
        // Check if this slot was handed over to someone else on this specific date
        const isHandedOver = handedOverKeys.has(`${slot.id}|${dateStr}`);

        if (!isHandedOver) {
          return {
            available: false,
            busyType: "slot",
            reason: `Mentor has a scheduled class: "${slot.course}" (${slot.classGroup}) at ${slot.time}.`,
            details: slot
          };
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Approved Handover Substitution Duties
  // ---------------------------------------------------------------------------
  for (const h of coveringHandovers) {
    if (!timeSlot || isTimeSlotOverlap(h.time, timeSlot)) {
      return {
        available: false,
        busyType: "handover",
        reason: `Mentor is already covering a substitution class: "${h.course}" (${h.classGroup}) at ${h.time}.`,
        details: h
      };
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Scheduled Student Interview Panels
  // ---------------------------------------------------------------------------
  for (const islot of interviewSlots) {
    const islotTime = `${islot.slot_start_time} - ${islot.slot_end_time}`;
    if (!timeSlot || isTimeSlotOverlap(islotTime, timeSlot)) {
      return {
        available: false,
        busyType: "interview",
        reason: `Mentor is assigned to a Student Interview panel (${islot.subject}) at ${islotTime}.`,
        details: islot
      };
    }
  }

  // Also check assigned_mentor_ids in student_interviews
  for (const di of directInterviews) {
    if (params.excludeInterviewId && di.id === params.excludeInterviewId) continue;
    try {
      const ids: string[] = di.assigned_mentor_ids ? JSON.parse(di.assigned_mentor_ids) : [];
      if (ids.includes(mentorId)) {
        const diTime = di.preferred_start_time || "09:00 AM";
        if (!timeSlot || isTimeSlotOverlap(diTime, timeSlot)) {
          return {
            available: false,
            busyType: "interview",
            reason: `Mentor is allocated to an active Interview panel for "${di.subject}".`,
            details: di
          };
        }
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 5. Scheduled Demo Evaluations & Demo Swaps
  // ---------------------------------------------------------------------------
  for (const demo of activeDemos) {
    if (params.excludeDemoSwapId && demo.id === params.excludeDemoSwapId) continue;
    const mentorIdRow = demo.proposedMentorId ?? demo.proposedmentorid;
    const proposedTime = demo.proposedTimeSlot ?? demo.proposedtimeslot;
    const rowTime = demo.timeSlot ?? demo.timeslot;
    const dTime = (mentorIdRow === mentorId && proposedTime) ? proposedTime : rowTime;
    if (!timeSlot || isTimeSlotOverlap(dTime, timeSlot)) {
      return {
        available: false,
        busyType: "demo",
        reason: `Mentor is engaged in a Demo Session (${demo.subject}) at ${dTime}.`,
        details: demo
      };
    }
  }

  return { available: true };
}

/**
 * Availability Engine for SMEs (Subject Matter Experts).
 * Checks:
 * 1. Demo Swap commitments & active demo evaluation sessions.
 */
export async function checkSmeAvailability(
  db: TursoDbAdapter,
  params: SmeAvailabilityParams
): Promise<SmeAvailabilityResult> {
  const { smeId, dateStr, timeSlot } = params;
  if (!smeId || !dateStr) {
    return { available: false, reason: "Missing smeId or dateStr" };
  }

  const ctx = params.ctx && params.ctx.dateSet.has(dateStr) ? params.ctx : null;

  let activeDemos: any[];
  if (ctx) {
    activeDemos = ctx.smeDemoSwaps.filter(d =>
      (d.smeId === smeId && d.dateStr === dateStr) ||
      (d.proposedSmeId === smeId && d.proposedDateStr === dateStr)
    );
  } else {
    let demoQuery = `
      SELECT id, sessionId, subject, stream, dateStr, timeSlot, status, proposedSmeId, proposedDateStr, proposedTimeSlot
      FROM demo_swap_requests
      WHERE status IN ('pending', 'pending_peer', 'pending_sme', 'approved')
        AND (
          (smeId = ? AND dateStr = ?) OR
          (proposedSmeId = ? AND proposedDateStr = ?)
        )
    `;
    const demoParams: any[] = [smeId, dateStr, smeId, dateStr];
    if (params.excludeDemoSwapId) {
      demoQuery += ` AND id != ?`;
      demoParams.push(params.excludeDemoSwapId);
    }
    activeDemos = await db.all(demoQuery, demoParams);
  }

  for (const demo of activeDemos) {
    if (params.excludeDemoSwapId && demo.id === params.excludeDemoSwapId) continue;
    const smeIdRow = demo.proposedSmeId ?? demo.proposedsmeid;
    const proposedTime = demo.proposedTimeSlot ?? demo.proposedtimeslot;
    const rowTime = demo.timeSlot ?? demo.timeslot;
    const dTime = (smeIdRow === smeId && proposedTime) ? proposedTime : rowTime;
    if (!timeSlot || isTimeSlotOverlap(dTime, timeSlot)) {
      return {
        available: false,
        busyType: "demo",
        reason: `SME is scheduled for Demo Evaluation (${demo.subject}) at ${dTime}.`,
        details: demo
      };
    }
  }

  // Also check booked demo sessions for this SME
  let bookedDemos: any[];
  if (ctx) {
    bookedDemos = ctx.smeDemoSessions.filter(d => (d.smeId === smeId || d.smeid === smeId) && (d.dateStr === dateStr || d.datestr === dateStr));
  } else {
    bookedDemos = await db.all(
      `SELECT id, subject, timeSlot, dateStr FROM demo_sessions
       WHERE smeId = ? AND dateStr = ? AND status NOT IN ('completed', 'not_conducted')`,
      [smeId, dateStr]
    ).catch(() => []);
  }

  for (const bdemo of bookedDemos) {
    if (params.excludeDemoSessionId && bdemo.id === params.excludeDemoSessionId) continue;
    const bTime = bdemo.timeSlot ?? bdemo.timeslot;
    if (!timeSlot || isTimeSlotOverlap(bTime, timeSlot)) {
      return {
        available: false,
        busyType: "demo",
        reason: `SME already has a booked Demo Session (${bdemo.subject}) at ${bTime}.`,
        details: bdemo
      };
    }
  }

  return { available: true };
}
