import { mapDayOrderToDayName } from "./utils";
import {
  checkTimeOverlap,
  extractSlotStartAndEnd,
  formatMinTo12,
  parseSlotTimeToMinutes
} from "./lndAllocationEngine";
import { mentorGroupOf } from "./lndFilterOptions";

/** Resolves detailed Day Order info for one date, exactly as the grid renders it. */
export type LndDayOrderForFn = (
  dateStr: string,
  weekdayName: string,
  dayIndex: number,
  collegeId?: string
) => any;

/** Resolves an evaluator's window status, exactly as the matrix cells render it. */
export type LndSmeSlotStatusFn = (smeId: string, dayName: string, dateStr: string, slot: string) => any;

/** Everything computeFreeMentorsForSlot reads, bound once by the model hook. */
export interface LndFreeMentorCtx {
  smes: any[];
  mentors: any[];
  selectedGroupId: string;
  selectedCollegeId: string;
  mentorTargets: Record<string, number>;
  ruleTargetsBySubject: Map<string, number>;
  weeklySessionCounts: Map<string, number>;
  sessionsByMentorDate: Map<string, any[]>;
  slotsByMentor: Map<string, any[]>;
  isFacultyOnLeaveIndexed: (facultyId: string, dateStr: string) => boolean;
  smesForGroup: (groupName: string) => any[];
  dayOrderFor: LndDayOrderForFn;
}

export function calculateWeekNumber(dateStr: string): number {
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return 1;
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const pastDays = (d.getTime() - startOfYear.getTime()) / 86400000;
    return Math.max(1, Math.ceil((pastDays + startOfYear.getDay() + 1) / 7));
  } catch {
    return 1;
  }
}

/** Every department group the roster, SMEs and active rules mention, sorted. */
export function computeMentorGroups(mentors: any[], _smes?: any[], _subjectGroups?: any, _demoRules?: any): string[] {
  const groups = new Set<string>();

  // Only extract authentic mentor group names from registered mentors
  if (Array.isArray(mentors)) {
    mentors.forEach(m => {
      const g = (m.mentor_group || m.subject_group || "").trim();
      if (g) groups.add(g);
    });
    if (groups.size === 0) {
      mentors.forEach(m => {
        const g = mentorGroupOf(m);
        if (g) groups.add(g);
      });
    }
  }

  return Array.from(groups).sort((a, b) => (a || "").localeCompare(b || ""));
}

/** Distinct periods a college's generated timetable holds on a weekday. Zero entries = no timetable that day. */
export function computeCollegeTimetablePeriodList(slots: any[], collegeId?: string, weekdayName?: string): string[] {
  if (!collegeId || !weekdayName) return [];
  const wanted = weekdayName.toLowerCase().trim();
  return Array.from(new Set(
    slots
      .filter(s => {
        if (s.college_id !== collegeId || !s.time) return false;
        const day = (s.day || "").toLowerCase().trim();
        return day === wanted || day.startsWith(wanted.slice(0, 3));
      })
      .map(s => String(s.time).trim())
  ));
}

/** Day Order info for one date: CAM config, holiday flags, timetable period count, row label. */
export function computeEffectiveDayOrderInfo(
  dailyConfigsMap: Map<string, any>,
  holidays: any[],
  slots: any[],
  dateStr: string,
  weekdayName: string,
  dayIndex: number,
  collegeId?: string
) {
  const collegeCfg = collegeId ? dailyConfigsMap.get(`${collegeId}_${dateStr}`) : null;
  const cfg = collegeCfg || dailyConfigsMap.get(dateStr);

  // Check if genuinely configured in CAM
  const isConfiguredInCam = Boolean(
    (collegeCfg && collegeCfg.day_order && collegeCfg.day_order !== "None" && collegeCfg.day_order !== "none") ||
    (!collegeId && cfg && cfg.day_order && cfg.day_order !== "None" && cfg.day_order !== "none")
  );

  const isHoliday = Boolean(
    (collegeCfg && (collegeCfg.day_type === "holiday" || collegeCfg.day_type === "event")) ||
    (!collegeId && cfg && (cfg.day_type === "holiday" || cfg.day_type === "event")) ||
    holidays.some(h => h.date === dateStr && (!h.college_id || !collegeId || h.college_id === collegeId))
  );

  let dayOrder = collegeCfg?.day_order || cfg?.day_order || cfg?.dayorder;
  const dayType = collegeCfg?.day_type || cfg?.day_type || (isHoliday ? "holiday" : "working");

  if (isHoliday) {
    dayOrder = "Holiday";
  } else if (!dayOrder || dayOrder === "None" || dayOrder === "none") {
    dayOrder = isConfiguredInCam ? dayOrder : `Day ${dayIndex + 1}`;
  }

  const effectiveTimetableDay = isHoliday ? "Holiday" : mapDayOrderToDayName(dayOrder, weekdayName);

  return {
    dayOrder,
    effectiveTimetableDay,
    periods: isHoliday ? 0 : computeCollegeTimetablePeriodList(slots, collegeId, effectiveTimetableDay).length,
    weekdayName,
    dateStr,
    isHoliday,
    isConfiguredInCam,
    dayType,
    rowLabel: `${dayOrder} - ${weekdayName} (${dateStr})`,
    key: `${dayOrder}_${dateStr}`
  };
}

/** Whether a college's generated timetable covers each date of the active week. */
export function computeCollegeTimetableDayStatus(
  currentWeekDates: any[],
  dayOrderFor: LndDayOrderForFn,
  collegeId: string
) {
  const dates = currentWeekDates;
  const missingDates: { dateStr: string; day: string; formatted: string }[] = [];
  let readyCount = 0;

  dates.forEach((w, idx) => {
    const info = dayOrderFor(w.dateStr, w.day, idx, collegeId);
    if (info.isHoliday || info.periods > 0) {
      readyCount++;
    } else {
      missingDates.push({ dateStr: w.dateStr, day: w.day, formatted: w.formatted || w.day });
    }
  });

  const isReady = missingDates.length === 0;
  return {
    isReady,
    readyCount,
    totalDates: dates.length,
    missingDates
  };
}

/** Do ALL applicable colleges run a timetable on each date of the active week. */
export function computeAllCollegesTimetableStatus(colleges: any[], slots: any[], dayStatusFor: (collegeId: string) => any) {
  const applicableColleges = colleges.filter(c => c && c.id);
  const collegesMissingTimetable: { college: any; missingDates: string[] }[] = [];

  applicableColleges.forEach(c => {
    const status = dayStatusFor(c.id);
    if (!status.isReady) {
      collegesMissingTimetable.push({
        college: c,
        missingDates: status.missingDates.map((d: any) => `${d.day.slice(0, 3)} (${d.formatted || d.dateStr})`)
      });
    }
  });

  const isReady = applicableColleges.length > 0 && collegesMissingTimetable.length === 0;

  // Colleges with no generated timetable at all are skipped from the workbook rather than blocking it.
  const collegesWithTimetable = applicableColleges.filter(c =>
    slots.some(s => s.college_id === c.id && String(s.time || "").trim())
  );
  const readyIds = new Set(collegesWithTimetable.map(c => c.id));
  const collegesSkipped = applicableColleges.filter(c => !readyIds.has(c.id));

  return {
    isReady,
    canDownload: collegesWithTimetable.length > 0,
    applicableColleges,
    collegesWithTimetable,
    collegesSkipped,
    collegesMissingTimetable
  };
}

/** Per-mentor weekly quota row: default target from dept rules, custom override, satisfaction flags. */
export function computeQuotaSummary(
  filteredMentors: any[],
  ruleTargetsBySubject: Map<string, number>,
  mentorTargets: Record<string, number>,
  weeklySessionCounts: Map<string, number>,
  collegesById: Map<string, any>
) {
  // Scoped to the campus/group filters — never falls back to the full roster.
  return filteredMentors.map(m => {
    const mGroup = mentorGroupOf(m);
    const defaultTarget = ruleTargetsBySubject.get(mGroup.toLowerCase().trim()) || 1;
    const customTarget = mentorTargets[m.id] !== undefined ? mentorTargets[m.id] : defaultTarget;
    const scheduledCount = weeklySessionCounts.get(m.id) || 0;
    const remainingCount = Math.max(0, customTarget - scheduledCount);
    const isSatisfied = scheduledCount >= customTarget;
    const isOver = scheduledCount > customTarget;

    return {
      mentor: m,
      group: mGroup,
      collegeName: collegesById.get(m.college_id)?.name || "Campus",
      customTarget,
      scheduledCount,
      remainingCount,
      isSatisfied,
      isOver
    };
  });
}

/** Quota monitor search over mentor / group / campus names. */
export function filterQuotaRows<T extends { mentor: any; group: string; collegeName: string }>(
  quotaMentorsSummary: T[],
  search: string
): T[] {
  if (!search.trim()) return quotaMentorsSummary;
  const q = search.toLowerCase().trim();
  return quotaMentorsSummary.filter(x =>
    (x.mentor.name || "").toLowerCase().includes(q) ||
    x.group.toLowerCase().includes(q) ||
    x.collegeName.toLowerCase().includes(q)
  );
}

/** Earliest and latest SME L&D window across active availability. */
export function computeSmeDemoBounds(smeAvailability: any[]) {
  const activeDemoWindows = (smeAvailability || []).filter(
    (a: any) => a.is_active !== 0 && (a.slot_type || a.slotType || "demo") !== "training"
  );

  if (activeDemoWindows.length === 0) {
    return { minStartMin: 540, maxEndMin: 1050 }; // Default: 09:00 AM (540) to 05:30 PM (1050)
  }

  let minStart = 9999;
  let maxEnd = 0;
  activeDemoWindows.forEach((w: any) => {
    const s = parseSlotTimeToMinutes(w.start_time);
    const e = parseSlotTimeToMinutes(w.end_time);
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  });

  if (minStart >= 9999) minStart = 540;
  if (maxEnd <= 0) maxEnd = 1050;

  return { minStartMin: minStart, maxEndMin: maxEnd };
}

/** Clean timetable periods for the selected campus / group, sorted by start time. */
export function computeCollegeTimeSlots(
  selectedCollegeId: string,
  colleges: any[],
  filteredMentors: any[],
  slots: any[]
): string[] {
  if (!selectedCollegeId) return [];

  let targetColleges = colleges;
  if (selectedCollegeId !== "all") {
    targetColleges = colleges.filter(c => c.id === selectedCollegeId);
  } else if (filteredMentors.length > 0) {
    // If all mentors belong to a single college or primary college, prioritize that college's shift definition
    const mentorCollegeIds = Array.from(new Set(filteredMentors.map(m => m.college_id).filter(Boolean)));
    if (mentorCollegeIds.length === 1) {
      targetColleges = colleges.filter(c => c.id === mentorCollegeIds[0]);
    }
  }

  const uniqueSlots = new Set<string>();

  // 1. Extract from college shift configs
  targetColleges.forEach(c => {
    if (c.shift_configs) {
      try {
        const parsed = JSON.parse(c.shift_configs);
        const s1 = parsed.shift_1 || [];
        const s2 = parsed.shift_2 || [];
        const gen = parsed.general || [];
        (s1.length > 0 ? s1 : (gen.length > 0 ? gen : s2)).forEach((t: string) => {
          if (t && t.trim()) uniqueSlots.add(t.trim());
        });
      } catch (_) { }
    }
  });

  // 2. If no shift config found, extract from master slots
  if (uniqueSlots.size === 0) {
    slots.forEach(s => {
      if ((selectedCollegeId === "all" || s.college_id === selectedCollegeId) && s.time) {
        uniqueSlots.add(s.time.trim());
      }
    });
  }

  if (uniqueSlots.size === 0) {
    return [
      "Period 1 (08:30 AM - 09:25 AM)",
      "Period 2 (09:25 AM - 10:20 AM)",
      "Period 3 (10:35 AM - 11:30 AM)",
      "Period 4 (11:30 AM - 12:25 PM)",
      "Period 5 (01:15 PM - 02:05 PM)",
      "Period 6 (02:05 PM - 02:55 PM)"
    ];
  }

  // Sort cleanly by period start time
  return Array.from(uniqueSlots).sort((a, b) => {
    const aStart = extractSlotStartAndEnd(a).startMin;
    const bStart = extractSlotStartAndEnd(b).startMin;
    return aStart - bStart;
  });
}

/** Every shift-config period string in scope (lowercased, deduplicated). */
export function computeStandardShiftSlots(selectedCollegeId: string, colleges: any[]): string[] {
  const list: string[] = [];
  colleges.forEach(c => {
    if ((selectedCollegeId === "all" || c.id === selectedCollegeId) && c.shift_configs) {
      try {
        const parsed = JSON.parse(c.shift_configs);
        const s1 = parsed.shift_1 || [];
        const s2 = parsed.shift_2 || [];
        const gen = parsed.general || [];
        [...s1, ...s2, ...gen].forEach((t: string) => list.push(t.trim().toLowerCase()));
      } catch (_) { }
    }
  });
  return Array.from(new Set(list));
}

/** Hourly demo windows spanning the active SME availability, or the default grid. */
export function computeActiveDemoSlots(smeAvailability: any[]): string[] {
  const activeWindows = (smeAvailability || []).filter(
    (a: any) => a.is_active !== 0
  );

  let minStart = 9999;
  let maxEnd = 0;
  activeWindows.forEach((w: any) => {
    const s = parseSlotTimeToMinutes(w.start_time);
    const e = parseSlotTimeToMinutes(w.end_time);
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  });

  if (minStart >= 9999) minStart = 600; // 10:00 AM default
  if (maxEnd <= 0) maxEnd = 1110; // 06:30 PM default

  const res: string[] = [];
  for (let m = minStart; m < maxEnd; m += 60) {
    const nextM = Math.min(m + 60, maxEnd);
    res.push(`${formatMinTo12(m)} - ${formatMinTo12(nextM)}`);
  }

  return res.length > 0 ? res : [
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "12:00 PM - 01:00 PM",
    "01:00 PM - 02:00 PM",
    "02:00 PM - 03:00 PM",
    "03:00 PM - 04:00 PM",
    "04:00 PM - 05:00 PM",
    "05:00 PM - 06:00 PM",
    "06:00 PM - 06:30 PM"
  ];
}

/** Campus period labels from that college's timetable + shift configs, lunch/break stripped. */
export function computeCollegePeriodLabels(colleges: any[], slots: any[], collegeId?: string): string[] {
  const col = colleges.find(c => c.id === collegeId);
  const campusSlotsList = new Set<string>();

  if (collegeId) {
    slots.forEach(s => {
      if (s.college_id !== collegeId || !s.time) return;
      const clean = s.time.trim();
      if (clean && !clean.toLowerCase().includes("lunch") && !clean.toLowerCase().includes("break")) {
        campusSlotsList.add(clean);
      }
    });
  }

  if (col?.shift_configs) {
    try {
      const parsed = JSON.parse(col.shift_configs);
      const s1 = parsed.shift_1 || [];
      const s2 = parsed.shift_2 || [];
      const gen = parsed.general || [];
      [...s1, ...s2, ...gen].forEach((t: string) => {
        const clean = t.trim();
        if (clean && !clean.toLowerCase().includes("lunch") && !clean.toLowerCase().includes("break")) {
          campusSlotsList.add(clean);
        }
      });
    } catch (_) { }
  }

  const sortedSlots = Array.from(campusSlotsList).sort((a, b) => parseSlotTimeToMinutes(a) - parseSlotTimeToMinutes(b));
  if (sortedSlots.length > 0) return sortedSlots;

  return [
    "08:30 AM - 09:30 AM",
    "09:30 AM - 10:30 AM",
    "10:30 AM - 11:30 AM",
    "11:30 AM - 12:30 PM",
    "01:30 PM - 02:30 PM",
    "02:30 PM - 03:30 PM"
  ];
}

/** Evaluators in scope: department filter first, then campus-eligibility narrowing. */
export function computeGridScopeSmes(
  smes: any[],
  mentors: any[],
  selectedGroupId: string,
  selectedCollegeId: string,
  smesForGroup: (groupName: string) => any[]
): any[] {
  let list = smes;
  if (selectedGroupId && selectedGroupId !== "All") {
    list = smesForGroup(selectedGroupId);
  }

  // SMEs are shared across campuses, so a campus filter means: keep only evaluators
  // that can actually serve at least one mentor posted to that campus.
  if (selectedCollegeId && selectedCollegeId !== "all") {
    const groupsHere = new Set<string>();
    mentors.forEach(m => {
      if (m.college_id !== selectedCollegeId) return;
      const g = (mentorGroupOf(m) || "").trim();
      if (g) groupsHere.add(g);
    });
    if (groupsHere.size === 0) {
      return [];
    }
    const eligible = new Set<string>();
    groupsHere.forEach(g => smesForGroup(g).forEach(s => eligible.add(s.id)));
    list = list.filter(s => eligible.has(s.id));
  }

  return list;
}

/** Header progress numbers read straight off the quota rows. */
export function computeAllocProgress(quotaMentorsSummary: any[]) {
  let scheduled = 0;
  let target = 0;
  let satisfied = 0;
  quotaMentorsSummary.forEach(q => {
    scheduled += q.scheduledCount;
    target += q.customTarget;
    if (q.isSatisfied) satisfied += 1;
  });
  return { scheduled, target, satisfied, total: quotaMentorsSummary.length };
}

/** Open vs total grid windows: working days only, whole scoped roster. */
export function computeGridWindowCapacity(
  currentWeekDates: any[],
  gridScopeSmes: any[],
  gridPeriodRows: string[],
  selectedCollegeId: string,
  dayOrderFor: LndDayOrderForFn,
  smeSlotStatusAt: LndSmeSlotStatusFn
) {
  const scopeCollege = selectedCollegeId !== "all" ? selectedCollegeId : undefined;
  let open = 0;
  let total = 0;
  currentWeekDates.forEach((w: any, dayIdx: number) => {
    const info = dayOrderFor(w.dateStr, w.day, dayIdx, scopeCollege);
    // Period counts exist per campus; the all-campus view is driven by SME demo windows instead.
    if (info.isHoliday || (scopeCollege && info.periods === 0)) return;
    gridScopeSmes.forEach(sme => {
      gridPeriodRows.forEach(slot => {
        total += 1;
        if (smeSlotStatusAt(sme.id, w.day, w.dateStr, slot).status === "free_demo") open += 1;
      });
    });
  });
  return { open, total };
}

/** Free timetable periods across the filtered roster for the visible week. */
export function computeTotalFreeSlotsCount(
  currentWeekDates: any[],
  collegeTimeSlots: string[],
  holidays: any[],
  filteredMentors: any[],
  mentorStatusAt: (mentorId: string, dateStr: string, dbTimeSlot: string) => any
) {
  let count = 0;
  currentWeekDates.forEach(date => {
    if (holidays.some(h => h.date === date.dateStr)) return;
    collegeTimeSlots.forEach(time => {
      if (time.toLowerCase().includes("lunch") || time.toLowerCase().includes("break")) return;
      filteredMentors.forEach(mentor => {
        if (mentorStatusAt(mentor.id, date.dateStr, time).status === "free") {
          count++;
        }
      });
    });
  });
  return count;
}

/** Mentors genuinely allocatable to one evaluator window: eligibility, quota, leave, clashes. */
export function computeFreeMentorsForSlot(
  ctx: LndFreeMentorCtx,
  smeId: string,
  dayName: string,
  dateStr: string,
  slot: string,
  dayIdx: number
): any[] {
  const sme = ctx.smes.find(s => s.id === smeId);
  if (!sme) return [];

  return ctx.mentors.filter(m => {
    // 1. Must match SME's subject group or selected department
    const mGroup = mentorGroupOf(m);
    const eligibleSmes = ctx.smesForGroup(mGroup);
    const matchesSme = eligibleSmes.some(e => e.id === smeId) ||
      (ctx.selectedGroupId !== "All" && mGroup.toLowerCase().trim() === ctx.selectedGroupId.toLowerCase().trim());
    if (!matchesSme) return false;

    // 2. Campus filter
    if (ctx.selectedCollegeId && ctx.selectedCollegeId !== "all" && m.college_id !== ctx.selectedCollegeId) {
      return false;
    }

    // 3. Quota check: if mentor's weekly target hours are satisfied, exclude from dropdown!
    const defaultTarget = ctx.ruleTargetsBySubject.get(mGroup.toLowerCase().trim()) || 1;
    const customTarget = ctx.mentorTargets[m.id] !== undefined ? ctx.mentorTargets[m.id] : defaultTarget;
    const scheduledCount = ctx.weeklySessionCounts.get(m.id) || 0;
    if (scheduledCount >= customTarget) {
      return false;
    }

    // 4. Mentor campus holiday check
    const mDayInfo = ctx.dayOrderFor(dateStr, dayName, dayIdx, m.college_id);
    if (mDayInfo.isHoliday || mDayInfo.periods === 0) return false;

    // 5. Approved faculty leave check
    if (ctx.isFacultyOnLeaveIndexed(m.id, dateStr)) return false;

    // 6. Conflicting demo session
    const mentorDaySessions = ctx.sessionsByMentorDate.get(`${m.id}|${dateStr}`) || [];
    const hasExistingDemo = mentorDaySessions.some(ds => {
      const dsT = ds.timeSlot || ds.time_slot;
      return ds.status !== "cancelled" &&
        ds.status !== "not_conducted" &&
        checkTimeOverlap(dsT, slot);
    });
    if (hasExistingDemo) return false;

    // 7. College timetable teaching class clash
    const mentorTimetableSlots = ctx.slotsByMentor.get(m.id) || [];
    const hasClass = mentorTimetableSlots.some(s => {
      const sDay = (s.day || "").toLowerCase().trim();
      const targetEffDay = mDayInfo.effectiveTimetableDay.toLowerCase().trim();
      const targetDayOrder = mDayInfo.dayOrder.toLowerCase().trim();
      const mappedSlotDay = (mapDayOrderToDayName(s.day, "") || "").toLowerCase().trim();
      const mappedTargetDayOrder = (mapDayOrderToDayName(mDayInfo.dayOrder, "") || "").toLowerCase().trim();

      const dayMatches =
        (targetDayOrder && sDay === targetDayOrder) ||
        (targetEffDay && sDay === targetEffDay) ||
        (mappedSlotDay && targetEffDay && mappedSlotDay === targetEffDay) ||
        (mappedTargetDayOrder && sDay === mappedTargetDayOrder) ||
        (targetEffDay && sDay.startsWith(targetEffDay.slice(0, 3)));

      if (!dayMatches) return false;
      return checkTimeOverlap(s.time, slot);
    });
    if (hasClass) return false;

    return true;
  });
}
