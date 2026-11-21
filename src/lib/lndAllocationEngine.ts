// Scheduling primitives for the L&D workspace.
//
// These used to live inside LndAllocationDashboard as component-scope callbacks, which meant the
// grid, the quota monitor, the auto-scheduler and the Excel template each rebuilt the same rules.
// They are pure functions of a data snapshot so every consumer evaluates one shared implementation.
//
// Keep this module hook-free: scratch/lnd_master_grid_shape.cjs slices it and only stubs React.

import { isTimeSlotMatch, mapDayOrderToDayName } from "./utils";
import { isActiveSession, type GridRow } from "./lndGridIndexes";
import { mentorGroupOf } from "./lndFilterOptions";

/** An SME with no configured windows is still available inside the default working day. */
export const DEFAULT_WORK_START_MIN = 540;
export const DEFAULT_WORK_END_MIN = 1050;
const UNPARSEABLE_MIN = 9999;

export type LndSlotSnapshot = {
  facultyLeaves: GridRow[];
  smeAvailability: GridRow[];
  demoSessions: GridRow[];
  leaveIdsByDate: Map<string, Set<string>>;
  sessionsBySmeDate: Map<string, GridRow[]>;
  weekDates: { dateStr: string; day: string; formatted?: string }[];
  mentors: GridRow[];
  smes: GridRow[];
  colleges: GridRow[];
  slots: GridRow[];
  holidays: GridRow[];
  subjectGroups: GridRow[];
  /** Period labels the scheduler walks when scoring back-to-back load. */
  collegeTimeSlots: string[];
  selectedWeek: number;
  currentCollegeName?: string;
  /** Campus day order, resolved by the component because it reads the CM's daily configs. */
  dayOrderFor: (dateStr: string, weekdayName: string, dayIndex: number, collegeId?: string) => GridRow;
};

/** Slot time in minutes from midnight. Accepts any string shape; unknown times sort last. */
export function parseSlotTimeToMinutes(t: string): number {
  if (!t) return UNPARSEABLE_MIN;
  const match = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/i);
  if (!match) return UNPARSEABLE_MIN;
  let hr = parseInt(match[1], 10);
  const min = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3] ? match[3].toUpperCase() : null;
  if (ampm === "PM" && hr < 12) hr += 12;
  if (ampm === "AM" && hr === 12) hr = 0;
  return hr * 60 + min;
}

function parseMatch(m: RegExpMatchArray): number {
  let hr = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === "PM" && hr < 12) hr += 12;
  if (ampm === "AM" && hr === 12) hr = 0;
  return hr * 60 + min;
}

/** Start/end minutes of a period label such as "Period 1 (8.30 AM - 9.25 AM)". */
export function extractSlotStartAndEnd(timeSlotStr: string): { startMin: number; endMin: number } {
  if (!timeSlotStr) return { startMin: DEFAULT_WORK_START_MIN, endMin: 600 };
  const matches = Array.from(timeSlotStr.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));
  if (matches.length >= 2) return { startMin: parseMatch(matches[0]), endMin: parseMatch(matches[1]) };
  if (matches.length === 1) {
    const s = parseSlotTimeToMinutes(matches[0][0]);
    return { startMin: s, endMin: s + 50 };
  }
  return { startMin: DEFAULT_WORK_START_MIN, endMin: 600 };
}

/** Two intervals clash when they overlap; identical labels always clash. */
export function checkTimeOverlap(t1?: string, t2?: string): boolean {
  if (!t1 || !t2) return false;
  if (t1.trim().toLowerCase() === t2.trim().toLowerCase()) return true;
  const { startMin: s1, endMin: e1 } = extractSlotStartAndEnd(t1);
  const { startMin: s2, endMin: e2 } = extractSlotStartAndEnd(t2);
  return s1 < e2 && e1 > s2;
}

/** 600 -> "10:00 AM". */
export function formatMinTo12(val: number): string {
  const hr = Math.floor(val / 60);
  const min = val % 60;
  const isPm = hr >= 12;
  let displayHr = hr > 12 ? hr - 12 : hr;
  if (displayHr === 0) displayHr = 12;
  return `${String(displayHr).padStart(2, "0")}:${String(min).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
}

/** Leave rows are ranges, so a date is inside the leave when start <= date <= end. */
export function facultyOnLeaveOn(facultyLeaves: GridRow[], facultyId: string, dateStr: string): boolean {
  return Boolean(facultyLeaves?.some(
    (fl: GridRow) =>
      (fl.mentor_id === facultyId || fl.mentorId === facultyId) &&
      fl.status === "approved" &&
      dateStr >= fl.start_date &&
      dateStr <= fl.end_date
  ));
}

/** Indexed fast path; dates outside the index (other weeks) fall back to a scan. */
export function facultyOnLeaveIndexed(
  snap: LndSlotSnapshot,
  facultyId: string,
  dateStr: string
): boolean {
  const indexed = snap.leaveIdsByDate.get(dateStr);
  if (!indexed) return facultyOnLeaveOn(snap.facultyLeaves, facultyId, dateStr);
  return indexed.has(facultyId);
}

/** Availability rows whose weekday matches the requested day. */
function windowsOnDay(snap: LndSlotSnapshot, smeId: string): GridRow[] {
  return (snap.smeAvailability || []).filter((a: GridRow) => a.sme_id === smeId && a.is_active !== 0);
}

/**
 * smeFreeAt matches a window to a date by resolving the *stored* label: "Day 3" is treated as the
 * Wednesday window. Kept distinct from the slot-status rule because the two have always differed.
 */
function smeWindowsFor(snap: LndSlotSnapshot, smeId: string, dayName: string): GridRow[] {
  const targetDay = (dayName || "").toLowerCase().trim();
  return windowsOnDay(snap, smeId).filter((a: GridRow) => {
    if (a.is_active === 0) return false;
    const aDay = (a.day_of_week || "").toLowerCase().trim();
    const mappedDay = (mapDayOrderToDayName(a.day_of_week, "") || "").toLowerCase().trim();
    return aDay === targetDay || mappedDay === targetDay || aDay.startsWith(targetDay.slice(0, 3));
  });
}

/** smeSlotStatusAt matches by resolving the *requested* label, and reads the raw stored value. */
function smeWindowsForSlotStatus(snap: LndSlotSnapshot, smeId: string, dayName: string): GridRow[] {
  const targetDay = dayName.toLowerCase().trim();
  const canonicalTarget = mapDayOrderToDayName(dayName, "")?.toLowerCase().trim();
  return windowsOnDay(snap, smeId).filter((a: GridRow) =>
    a.day_of_week?.toLowerCase().trim() === targetDay ||
    a.day_of_week?.toLowerCase().trim() === canonicalTarget ||
    (a.day_of_week && dayName && a.day_of_week.toLowerCase().startsWith(dayName.toLowerCase().slice(0, 3)))
  );
}

/** True when the slot sits in a session that still occupies the SME's time. */
function isBusyIn(sessions: GridRow[], smeId: string, dateStr: string, time: string): boolean {
  return sessions.some(ds => {
    if (ds.smeId !== smeId || ds.dateStr !== dateStr) return false;
    if (!isActiveSession(ds)) return false;
    return isTimeSlotMatch(ds.timeSlot, time) || checkTimeOverlap(ds.timeSlot, time);
  });
}

/** Is an SME assignable to this slot — availability window, no booked session, no preview clash. */
export function smeFreeAt(
  snap: LndSlotSnapshot,
  smeId: string,
  dateStr: string,
  time: string,
  newlyScheduled: GridRow[] = []
): boolean {
  const dayName = snap.weekDates.find(w => w.dateStr === dateStr)?.day || "";
  if (facultyOnLeaveOn(snap.facultyLeaves, smeId, dateStr)) return false;

  const smeWindows = smeWindowsFor(snap, smeId, dayName);
  const { startMin: slotStartMin, endMin: slotEndMin } = extractSlotStartAndEnd(time);

  if (smeWindows.length > 0) {
    // Only windows designated for L&D evaluation can host a demo; training and other windows cannot.
    const withinDemoWindow = smeWindows.some((w: GridRow) => {
      const isDemoType = String(w.slot_type || w.slotType || "demo").toLowerCase() === "demo";
      if (!isDemoType) return false;
      return slotStartMin >= parseSlotTimeToMinutes(w.start_time) &&
        slotEndMin <= parseSlotTimeToMinutes(w.end_time);
    });
    if (!withinDemoWindow) return false;
  } else if (slotStartMin < DEFAULT_WORK_START_MIN || slotEndMin > DEFAULT_WORK_END_MIN) {
    return false;
  }

  if (isBusyIn(snap.demoSessions, smeId, dateStr, time)) return false;
  return !newlyScheduled.some(p => {
    if (p.smeId !== smeId || p.dateStr !== dateStr) return false;
    return isTimeSlotMatch(p.timeSlot, time) || checkTimeOverlap(p.timeSlot, time);
  });
}

export type SmeSlotStatus = {
  status: "leave" | "booked" | "off_duty" | "training" | "free_demo";
  label: string;
  isDemoSlot: boolean;
  session?: GridRow;
};

/**
 * What an SME's cell should read for one (evaluator, date, period). Mirrors the SME portal so the
 * grid, the quota monitor and the Excel Master_Grid cannot disagree about the same window.
 */
export function smeSlotStatusAt(
  snap: LndSlotSnapshot,
  smeId: string,
  dayName: string,
  dateStr: string,
  slot: string
): SmeSlotStatus {
  if (dateStr && facultyOnLeaveIndexed(snap, smeId, dateStr)) {
    return { status: "leave", label: "SME on Leave", isDemoSlot: false };
  }

  const smeDateSessions = snap.sessionsBySmeDate.get(`${smeId}|${dateStr}`) || [];
  const bookedSession = smeDateSessions.find(ds => {
    const tSlot = ds.timeSlot || ds.time_slot;
    return isActiveSession(ds) && checkTimeOverlap(tSlot, slot);
  });
  if (bookedSession) {
    return { status: "booked", label: "Confirmed L&D (Booked)", isDemoSlot: true, session: bookedSession };
  }

  const { startMin: slotStartMin, endMin: slotEndMin } = extractSlotStartAndEnd(slot);
  const dayWins = smeWindowsForSlotStatus(snap, smeId, dayName);

  if (dayWins.length === 0) {
    const configuredElsewhere = windowsOnDay(snap, smeId).length > 0;
    const weekday = (dayName || "").toLowerCase();
    if (!configuredElsewhere &&
      slotStartMin >= DEFAULT_WORK_START_MIN &&
      slotEndMin <= DEFAULT_WORK_END_MIN &&
      weekday !== "sunday" &&
      weekday !== "saturday") {
      return { status: "free_demo", label: "Free Demo Slot", isDemoSlot: true };
    }
    return { status: "off_duty", label: "Off-Duty", isDemoSlot: false };
  }

  const matchingWin = dayWins.find((win: GridRow) => {
    const wStart = parseSlotTimeToMinutes(win.start_time);
    const wEnd = parseSlotTimeToMinutes(win.end_time);
    return slotStartMin < wEnd && slotEndMin > wStart;
  });

  if (!matchingWin) return { status: "off_duty", label: "Off-Duty", isDemoSlot: false };

  const slotType = String(matchingWin.slot_type || matchingWin.slotType || "demo").toLowerCase();
  if (slotType === "training") return { status: "training", label: "Training Time", isDemoSlot: false };
  if (slotType === "other") return { status: "off_duty", label: matchingWin.notes ? `Other: ${matchingWin.notes}` : "Other Activity", isDemoSlot: false };
  if (slotType !== "demo") return { status: "off_duty", label: "Not Demo Slot", isDemoSlot: false };

  return { status: "free_demo", label: "Free Demo Slot", isDemoSlot: true };
}

/** An SME can host at most this many demos per day; the scheduler and the swap validator share it. */
export const SME_DAILY_CAP = 2;

/** SMEs whose subject, head group or mentor group overlaps the requested subject group. */
export function smesForSubjectGroup(snap: LndSlotSnapshot, groupName: string): GridRow[] {
  if (!groupName) return [];
  const target = groupName.toLowerCase().trim();
  const targetWords = target.split(/[\s/,&+-]+/).filter(w => w.length > 2);

  return (snap.smes || []).filter((s: GridRow) => {
    if (!s) return false;
    const sub = (s.subject || "").toLowerCase().trim();
    const headGroup = (s.head_subject_group || "").toLowerCase().trim();
    const mGroup = (s.mentor_group || "").toLowerCase().trim();
    const sName = (s.name || "").toLowerCase().trim();

    // 1. Direct group lead match in subjectGroups
    const isGroupLead = (snap.subjectGroups || []).some((g: GridRow) => {
      const gName = (g.name || "").toLowerCase().trim();
      const gMatch = gName === target || targetWords.some(w => gName.includes(w));
      const smeMatch = (g.lead_sme_id && g.lead_sme_id === s.id) ||
        (g.lead_sme_name && g.lead_sme_name.toLowerCase().trim() === sName);
      return gMatch && smeMatch;
    });
    if (isGroupLead) return true;

    // 2. Exact match on subject / head group / mentor group
    if (sub === target || headGroup === target || mGroup === target) return true;

    // 3. Substring / word overlap match
    if (sub && (sub.includes(target) || target.includes(sub))) return true;
    if (headGroup && (headGroup.includes(target) || target.includes(headGroup))) return true;
    if (mGroup && (mGroup.includes(target) || target.includes(mGroup))) return true;

    if (targetWords.length > 0) {
      if (targetWords.some(w => (sub && sub.includes(w)) || (headGroup && headGroup.includes(w)) || (mGroup && mGroup.includes(w)))) {
        return true;
      }
    }

    return false;
  });
}

export type MentorSlotAvailability = {
  status: "unavailable" | "blocked" | "demo" | "preview" | "occupied" | "sme_unavailable" | "free";
  isAllocatable: boolean;
  label: string;
  details: string;
  availableSmes: GridRow[];
  session?: GridRow;
  group?: string;
  mentorGroup?: string;
};

const noSmes = (): MentorSlotAvailability => ({
  status: "blocked",
  isAllocatable: false,
  label: "",
  details: "",
  availableSmes: []
});

/**
 * The single availability answer for one (participant, date, period): campus day order, holiday,
 * faculty leave, booked demo, unsaved preview, teaching class, then qualified SME capacity.
 */
export function mentorSlotAvailabilityAt(
  snap: LndSlotSnapshot,
  mentorId: string,
  dateStr: string,
  timeSlot: string,
  customCollegeId?: string,
  currentPreviews: GridRow[] = []
): MentorSlotAvailability {
  const mentor = (snap.mentors || []).find(m => m.id === mentorId);
  if (!mentor) {
    return { status: "unavailable", isAllocatable: false, label: "Mentor Not Found", details: "", availableSmes: [] };
  }

  const collegeId = customCollegeId || mentor.college_id;
  const colObj = (snap.colleges || []).find(c => c.id === collegeId);

  // 1. Holiday & timetable coverage resolution (daily configs give the rotation, slots give the periods)
  const dayObj = snap.weekDates.find(w => w.dateStr === dateStr);
  const weekdayName = dayObj?.day || "";
  const dayIndex = Math.max(0, snap.weekDates.findIndex(w => w.dateStr === dateStr));
  const dayInfo = snap.dayOrderFor(dateStr, weekdayName, dayIndex, collegeId);

  if (dayInfo.isHoliday) {
    return { ...noSmes(), label: "Campus Holiday", details: `${colObj?.name || "Campus"} Holiday (Closed)` };
  }

  if (dayInfo.periods === 0) {
    return {
      ...noSmes(),
      label: "No Timetable",
      details: `No timetable periods on ${dayInfo.effectiveTimetableDay} for ${colObj?.name || "Campus"}`
    };
  }

  // 2. Mentor Faculty Leave check
  if (facultyOnLeaveOn(snap.facultyLeaves, mentorId, dateStr)) {
    return { ...noSmes(), label: "On Leave", details: "Faculty Leave Approved" };
  }

  // 3. Existing L&D Session Session in database check
  const existingDemo = (snap.demoSessions || []).find(ds => {
    if (ds.mentorId !== mentorId || ds.dateStr !== dateStr) return false;
    if (ds.status === "cancelled" || ds.status === "not_conducted") return false;
    return isTimeSlotMatch(ds.timeSlot, timeSlot) || checkTimeOverlap(ds.timeSlot, timeSlot);
  });
  if (existingDemo) {
    return {
      status: "demo",
      isAllocatable: false,
      label: `L&D: ${existingDemo.subject}`,
      details: `SME: ${existingDemo.smeName}`,
      session: existingDemo,
      availableSmes: []
    };
  }

  // 4. Preview draft session check
  const previewDemo = currentPreviews.find(p => {
    if (p.mentorId !== mentorId || p.dateStr !== dateStr) return false;
    return isTimeSlotMatch(p.timeSlot, timeSlot) || checkTimeOverlap(p.timeSlot, timeSlot);
  });
  if (previewDemo) {
    return {
      status: "preview",
      isAllocatable: false,
      label: `Preview: ${previewDemo.subject}`,
      details: `SME: ${previewDemo.smeName}`,
      session: previewDemo,
      availableSmes: []
    };
  }

  // 5. College Timetable Teaching Class check
  const effectiveDay = dayInfo.effectiveTimetableDay.toLowerCase().trim();
  const dayOrderStr = (dayInfo.dayOrder || "").toLowerCase().trim();

  const teachSlot = (snap.slots || []).find(s => {
    if (s.mentorId !== mentorId) return false;
    const sDay = (s.day || "").toLowerCase().trim();
    const mappedSlotDay = (mapDayOrderToDayName(s.day, "") || "").toLowerCase().trim();

    const dayMatches =
      (dayOrderStr && sDay === dayOrderStr) ||
      (effectiveDay && sDay === effectiveDay) ||
      (mappedSlotDay && effectiveDay && mappedSlotDay === effectiveDay) ||
      (effectiveDay && sDay.startsWith(effectiveDay.slice(0, 3)));

    if (!dayMatches) return false;
    return isTimeSlotMatch(s.time, timeSlot) || checkTimeOverlap(s.time, timeSlot);
  });

  if (teachSlot) {
    return {
      status: "occupied",
      isAllocatable: false,
      label: teachSlot.course,
      group: teachSlot.classGroup,
      details: `Class in ${teachSlot.location || "Room"}`,
      availableSmes: []
    };
  }

  // 6. Mentor is timetable-free. Now check qualified SME availability for mentor's subject group
  const mentorGroup = mentorGroupOf(mentor);
  const eligibleSmes = smesForSubjectGroup(snap, mentorGroup);
  const availableSmes = eligibleSmes.filter(sme => smeFreeAt(snap, sme.id, dateStr, timeSlot, currentPreviews));

  if (availableSmes.length === 0) {
    return {
      status: "sme_unavailable",
      isAllocatable: false,
      label: "No SME Available",
      details: eligibleSmes.length === 0
        ? `No SME registered for ${mentorGroup}`
        : `All ${eligibleSmes.length} SME(s) busy/outside availability window`,
      availableSmes: [],
      mentorGroup
    };
  }

  return {
    status: "free",
    isAllocatable: true,
    label: "Available",
    details: `${availableSmes.length} SME(s) free`,
    availableSmes,
    mentorGroup
  };
}

/** Whether an SME (booked or previewed) or a mentor (per the availability engine) holds that period. */
function isEntityBusy(
  snap: LndSlotSnapshot,
  entityId: string,
  isSme: boolean,
  dateStr: string,
  slotName: string,
  currentGenerated: GridRow[]
): boolean {
  if (!slotName) return false;
  if (isSme) {
    const hasDbDemo = (snap.demoSessions || []).some(ds => ds.smeId === entityId && ds.dateStr === dateStr && ds.timeSlot === slotName);
    const hasGenDemo = currentGenerated.some(g => g.smeId === entityId && g.dateStr === dateStr && g.timeSlot === slotName);
    return hasDbDemo || hasGenDemo;
  }
  return mentorSlotAvailabilityAt(snap, entityId, dateStr, slotName, undefined, currentGenerated).status !== "free";
}

/** Period labels adjacent to `timeSlot` in the college's own period order. */
function neighbourSlots(snap: LndSlotSnapshot, timeSlot: string) {
  const idx = snap.collegeTimeSlots.indexOf(timeSlot);
  if (idx === -1) return null;
  const slots = snap.collegeTimeSlots;
  const last = slots.length - 1;
  return {
    idx,
    prev1: idx > 0 ? slots[idx - 1] : "",
    prev2: idx > 1 ? slots[idx - 2] : "",
    next1: idx < last ? slots[idx + 1] : "",
    next2: idx < last - 1 ? slots[idx + 2] : ""
  };
}

/** Hard block: the entity already holds three periods in a row around this one. */
export function consecutiveHardClash(
  snap: LndSlotSnapshot,
  entityId: string,
  isSme: boolean,
  dateStr: string,
  timeSlot: string,
  currentGenerated: GridRow[] = []
): boolean {
  const n = neighbourSlots(snap, timeSlot);
  if (!n) return false;

  const busy = (slotName: string) => isEntityBusy(snap, entityId, isSme, dateStr, slotName, currentGenerated);

  if (n.prev1 && n.prev2 && busy(n.prev1) && busy(n.prev2)) return true;
  if (n.prev1 && n.next1 && busy(n.prev1) && busy(n.next1)) return true;
  return Boolean(n.next1 && n.next2 && busy(n.next1) && busy(n.next2));
}

/** Soft penalty: the entity holds a period immediately before or after this one. */
export function hasSingleConsecutive(
  snap: LndSlotSnapshot,
  entityId: string,
  isSme: boolean,
  dateStr: string,
  timeSlot: string,
  currentGenerated: GridRow[] = []
): boolean {
  const n = neighbourSlots(snap, timeSlot);
  if (!n) return false;

  const busy = (slotName: string) => isEntityBusy(snap, entityId, isSme, dateStr, slotName, currentGenerated);
  return Boolean((n.prev1 && busy(n.prev1)) || (n.next1 && busy(n.next1)));
}

export type AutoAssignResult = { generated: GridRow[]; exceptions: GridRow[] };

/**
 * Rule-based SME assigner over the timetable slots the L&D user is about to schedule. Candidates
 * are scored for head-SME seniority, exact subject match, weekly load and back-to-back fatigue,
 * with a deterministic id-hash tie-breaker so the same input always yields the same plan.
 */
export function autoAssignSmes(
  snap: LndSlotSnapshot,
  targetSlots: GridRow[],
  previousAllocations: GridRow[] = []
): AutoAssignResult {
  const generated: GridRow[] = [];
  const exceptions: GridRow[] = [];

  if (!targetSlots || targetSlots.length === 0) {
    return { generated, exceptions };
  }

  const pending = () => [...generated, ...previousAllocations];

  targetSlots.forEach((slotInput, idx) => {
    const mentorId = slotInput.mentorId;
    const mentorName = slotInput.mentorName || (snap.mentors || []).find(m => m.id === mentorId)?.name || "Mentor";
    const dateStr = slotInput.dateStr;
    const timeSlot = slotInput.timeSlot;
    const subjectGroup = (slotInput.subject ||
      mentorGroupOf((snap.mentors || []).find(m => m.id === mentorId)) || "General").trim();
    const stream = slotInput.stream || "General Stream";
    const week = slotInput.week || snap.selectedWeek || 1;
    const preAssignedSmeId = slotInput.smeId;
    const preAssignedSmeName = slotInput.smeName;

    const fail = (token: string, reason: string, recommendation: string) => {
      exceptions.push({
        id: `${token}_${idx}_${Date.now()}`,
        mentorId,
        mentorName,
        subject: subjectGroup,
        stream,
        reason,
        recommendation
      });
    };

    // 1. Check if date is a holiday
    if ((snap.holidays || []).some(h => h.date === dateStr)) {
      fail("exc_hol", "Holiday Conflict", `Date ${dateStr} is a college holiday. Upload timetable slots on working days.`);
      return;
    }

    // 2. Check if mentor is on approved leave or teaching a class
    if (facultyOnLeaveOn(snap.facultyLeaves, mentorId, dateStr)) {
      fail("exc_mleave", "Mentor Leave Conflict", `Mentor ${mentorName} is on approved faculty leave on ${dateStr}.`);
      return;
    }

    const mentorStatus = mentorSlotAvailabilityAt(snap, mentorId, dateStr, timeSlot, undefined, pending());
    if (mentorStatus.status !== "free" && mentorStatus.status !== "preview") {
      fail("exc_mbusy", "Mentor Timetable Conflict",
        `Mentor ${mentorName} is occupied: ${mentorStatus.label || mentorStatus.details} at ${timeSlot} on ${dateStr}.`);
      return;
    }

    // 3. If pre-assigned SME is provided in Excel, validate them first
    if (preAssignedSmeId) {
      const smeObj = (snap.smes || []).find(s => s.id === preAssignedSmeId ||
        s.name.toLowerCase() === (preAssignedSmeName || "").toLowerCase());
      if (smeObj && !facultyOnLeaveOn(snap.facultyLeaves, smeObj.id, dateStr) &&
        smeFreeAt(snap, smeObj.id, dateStr, timeSlot, pending())) {
        generated.push({
          mentorId,
          mentorName,
          collegeName: slotInput.collegeName || snap.currentCollegeName || "College",
          smeId: smeObj.id,
          smeName: smeObj.name,
          dateStr,
          timeSlot,
          subject: subjectGroup,
          stream,
          week
        });
        return;
      }
    }

    // 4. Rule-Based Auto-Assignment: Find qualified SME for this subject & slot
    const eligibleSmes = smesForSubjectGroup(snap, subjectGroup);

    if (eligibleSmes.length === 0) {
      fail("exc_nosme", "No Qualified SME",
        `No SME registered with subject expertise for '${subjectGroup}'. Register an SME or update subject mapping.`);
      return;
    }

    const candidates: { sme: GridRow; score: number }[] = [];

    eligibleSmes.forEach(sme => {
      // Must not be on faculty leave
      if (facultyOnLeaveOn(snap.facultyLeaves, sme.id, dateStr)) return;

      // Must be free at slot time
      if (!smeFreeAt(snap, sme.id, dateStr, timeSlot, pending())) return;

      // Daily cap check (max 2/day)
      const existingSmeDemos = [
        ...(snap.demoSessions || []).filter(ds => ds.smeId === sme.id && ds.dateStr === dateStr &&
          ds.status !== "not_conducted" && ds.status !== "cancelled"),
        ...previousAllocations.filter(pa => pa.smeId === sme.id && pa.dateStr === dateStr),
        ...generated.filter(g => g.smeId === sme.id && g.dateStr === dateStr)
      ].length;
      if (existingSmeDemos >= SME_DAILY_CAP) return;

      // Consecutive hard clash (3 consecutive)
      if (consecutiveHardClash(snap, sme.id, true, dateStr, timeSlot, pending())) return;

      let score = 0;
      const isHeadSme = sme.is_head_sme === 1 || sme.head_subject_group === subjectGroup;
      if (isHeadSme) score += 50; // Priority boost for Head SME

      if (sme.subject?.toLowerCase().trim() === subjectGroup.toLowerCase().trim()) score += 30; // Direct subject match

      const smeWeeklyLoad = generated.filter(g => g.smeId === sme.id).length;
      score += Math.max(0, 20 - (smeWeeklyLoad * 4)); // Load balancing

      // Soft consecutive check penalty
      if (hasSingleConsecutive(snap, sme.id, true, dateStr, timeSlot, pending())) score -= 15;

      // Deterministic tie-breaker based on SME ID hash
      const idHash = String(sme.id).split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
      score += (idHash % 100) * 0.0001;

      candidates.push({ sme, score });
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0].sme;

      generated.push({
        mentorId,
        mentorName,
        collegeName: slotInput.collegeName || snap.currentCollegeName || "College",
        smeId: best.id,
        smeName: best.name,
        dateStr,
        timeSlot,
        subject: subjectGroup,
        stream,
        week
      });
    } else {
      fail("exc_clash", "SME Availability / Capacity Conflict",
        `All SMEs for '${subjectGroup}' are occupied or on leave at ${timeSlot} on ${dateStr}. Adjust slot or assign manually.`);
    }
  });

  return { generated, exceptions };
}
