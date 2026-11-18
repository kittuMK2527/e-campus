"use client";

import { useMemo, useCallback } from "react";
import { getWeekDates } from "../lib/utils";
import {
  buildLeaveIdsByDate,
  buildRuleTargetsBySubject,
  buildSessionsByMentorDate,
  buildSessionsBySmeDate,
  buildSlotsByMentor,
  buildWeeklySessionCounts
} from "../lib/lndGridIndexes";
import {
  facultyOnLeaveIndexed,
  facultyOnLeaveOn,
  smeFreeAt,
  smeSlotStatusAt,
  smesForSubjectGroup,
  mentorSlotAvailabilityAt,
  type LndSlotSnapshot
} from "../lib/lndAllocationEngine";
import { filterMentorsByCampus, filterMentorsByGroup, mentorGroupOf } from "../lib/lndFilterOptions";
import {
  calculateWeekNumber,
  computeActiveDemoSlots,
  computeAllocProgress,
  computeAllCollegesTimetableStatus,
  computeCollegePeriodLabels,
  computeCollegeTimeSlots,
  computeCollegeTimetableDayStatus,
  computeCollegeTimetablePeriodList,
  computeEffectiveDayOrderInfo,
  computeFreeMentorsForSlot,
  computeGridScopeSmes,
  computeGridWindowCapacity,
  computeMentorGroups,
  computeQuotaSummary,
  computeSmeDemoBounds,
  computeStandardShiftSlots,
  computeTotalFreeSlotsCount,
  filterQuotaRows,
  type LndFreeMentorCtx
} from "../lib/lndGridModel";

export interface LndGridModelInputs {
  colleges: any[];
  mentors: any[];
  slots: any[];
  smes: any[];
  demoSessions: any[];
  demoRules: any[] | null | undefined;
  facultyLeaves: any[];
  holidays: any[];
  smeAvailability: any[];
  subjectGroups: any[];
  dailyConfigsMap: Map<string, any>;
  selectedDateStr: string;
  selectedCollegeId: string;
  selectedGroupId: string;
  selectedSmeId: string;
  mentorTargets: Record<string, number>;
  mentorQuotaSearch: string;
  previewSessions: any[];
  generationStep: string;
}

/**
 * Every derived view of the L&D grid: week dates, day orders, quota rows, slot rows,
 * free-mentor resolution and the header stats. The component keeps state, actions and
 * markup; this hook keeps derivations; lndGridModel keeps the pure logic they share.
 */
export function useLndGridModel({
  colleges,
  mentors,
  slots,
  smes,
  demoSessions,
  demoRules,
  facultyLeaves,
  holidays,
  smeAvailability,
  subjectGroups,
  dailyConfigsMap,
  selectedDateStr,
  selectedCollegeId,
  selectedGroupId,
  selectedSmeId,
  mentorTargets,
  mentorQuotaSearch,
  previewSessions,
  generationStep
}: LndGridModelInputs) {
  // The selected campus controls the visible week; "all" uses the union of assigned campuses.
  const workingDaysCount = useMemo(() => {
    if (selectedCollegeId === "all") {
      return colleges.some(college => Number(college.working_days) === 6) ? 6 : 5;
    }
    return Number(colleges.find(college => college.id === selectedCollegeId)?.working_days) === 6 ? 6 : 5;
  }, [colleges, selectedCollegeId]);

  const currentWeekDates = useMemo(() => {
    return getWeekDates(0, selectedDateStr, workingDaysCount);
  }, [selectedDateStr, workingDaysCount]);

  // Week number is whatever the visible week is — kept derived so it can never drift from it.
  const selectedWeek = useMemo(() => calculateWeekNumber(selectedDateStr), [selectedDateStr]);

  /** Distinct periods this college's generated timetable holds on a given weekday. */
  const getCollegeTimetablePeriodList = useCallback((collegeId?: string, weekdayName?: string): string[] =>
    computeCollegeTimetablePeriodList(slots, collegeId, weekdayName), [slots]);

  const getCollegeTimetablePeriods = useCallback((collegeId?: string, weekdayName?: string) =>
    getCollegeTimetablePeriodList(collegeId, weekdayName).length,
    [getCollegeTimetablePeriodList]);

  // Helper to resolve detailed Day Order info for a given dateStr, weekday & college
  const getEffectiveDayOrderInfo = useCallback((dateStr: string, weekdayName: string, dayIndex: number, collegeId?: string) =>
    computeEffectiveDayOrderInfo(dailyConfigsMap, holidays, slots, dateStr, weekdayName, dayIndex, collegeId),
    [dailyConfigsMap, holidays, slots]);

  // Helper to check whether the generated timetable covers each date of the active week
  const getCollegeTimetableDayStatus = useCallback((collegeId: string) =>
    computeCollegeTimetableDayStatus(currentWeekDates, getEffectiveDayOrderInfo, collegeId),
    [currentWeekDates, getEffectiveDayOrderInfo]);

  // Derived: do ALL applicable colleges run a timetable on each date of the active week
  const allCollegesTimetableStatus = useMemo(
    () => computeAllCollegesTimetableStatus(colleges, slots, getCollegeTimetableDayStatus),
    [colleges, slots, getCollegeTimetableDayStatus]
  );

  // Derived: Current selected college
  const currentCollege = useMemo(() => {
    return colleges.find(c => c.id === selectedCollegeId);
  }, [colleges, selectedCollegeId]);

  // Derived: All unique class groups/cohorts in slots for modal choices
  const classGroups = useMemo(() => {
    const groups = new Set<string>();
    slots.forEach(s => {
      if (s.classGroup) {
        groups.add(s.classGroup.trim());
      }
    });
    return Array.from(groups);
  }, [slots]);

  const mentorGroups = useMemo(
    () => computeMentorGroups(mentors, smes, subjectGroups, demoRules),
    [mentors, smes, subjectGroups, demoRules]
  );

  // ── Lookup indexes: one pass per source row set, shared by the grid, quota monitor and rules ──
  const sessionsBySmeDate = useMemo(() => buildSessionsBySmeDate(demoSessions), [demoSessions]);
  const sessionsByMentorDate = useMemo(() => buildSessionsByMentorDate(demoSessions), [demoSessions]);
  const weeklySessionCounts = useMemo(
    () => buildWeeklySessionCounts(demoSessions, selectedWeek, currentWeekDates.map(w => w.dateStr)),
    [demoSessions, selectedWeek, currentWeekDates]
  );
  const slotsByMentor = useMemo(() => buildSlotsByMentor(slots), [slots]);
  const leaveIdsByDate = useMemo(
    () => buildLeaveIdsByDate(facultyLeaves || [], currentWeekDates.map(w => w.dateStr)),
    [facultyLeaves, currentWeekDates]
  );
  const ruleTargetsBySubject = useMemo(() => buildRuleTargetsBySubject(demoRules || []), [demoRules]);
  const collegesById = useMemo(() => new Map(colleges.map(c => [c.id, c])), [colleges]);
  const mentorsById = useMemo(() => new Map(mentors.map(m => [m.id, m])), [mentors]);

  // Derived: Filtered list of mentors (used by scheduler and grid)
  const filteredMentors = useMemo(() => {
    if (mentors.length === 0) return [];
    const onCampus = filterMentorsByCampus(mentors, selectedCollegeId);
    if (!selectedGroupId || selectedGroupId === "All") return onCampus;
    return filterMentorsByGroup(onCampus, selectedGroupId, mentorGroupOf);
  }, [mentors, selectedCollegeId, selectedGroupId]);

  // Derived summary for Real-Time Mentor Weekly Hours & Quota Monitor (Web UI)
  const quotaMentorsSummary = useMemo(
    () => computeQuotaSummary(filteredMentors, ruleTargetsBySubject, mentorTargets, weeklySessionCounts, collegesById),
    [filteredMentors, ruleTargetsBySubject, mentorTargets, weeklySessionCounts, collegesById]
  );

  const displayedQuotaMentors = useMemo(
    () => filterQuotaRows(quotaMentorsSummary, mentorQuotaSearch),
    [quotaMentorsSummary, mentorQuotaSearch]
  );

  // Earliest and Latest SME L&D Windows across active SME availability
  const smeDemoBounds = useMemo(() => computeSmeDemoBounds(smeAvailability), [smeAvailability]);

  // Derived: Clean timetable slots for the selected college / group
  const collegeTimeSlots = useMemo(
    () => computeCollegeTimeSlots(selectedCollegeId, colleges, filteredMentors, slots),
    [slots, selectedCollegeId, colleges, filteredMentors]
  );

  const standardShiftSlots = useMemo(
    () => computeStandardShiftSlots(selectedCollegeId, colleges),
    [selectedCollegeId, colleges]
  );

  // One snapshot of the data the scheduling rules read, shared by every engine call below.
  const slotSnapshot = useMemo<LndSlotSnapshot>(() => ({
    facultyLeaves: facultyLeaves || [],
    smeAvailability: smeAvailability || [],
    demoSessions,
    leaveIdsByDate,
    sessionsBySmeDate,
    weekDates: currentWeekDates,
    mentors: mentors || [],
    smes: smes || [],
    colleges: colleges || [],
    slots: slots || [],
    holidays: holidays || [],
    subjectGroups: subjectGroups || [],
    collegeTimeSlots,
    selectedWeek,
    currentCollegeName: currentCollege?.name,
    dayOrderFor: getEffectiveDayOrderInfo
  }), [facultyLeaves, smeAvailability, demoSessions, leaveIdsByDate, sessionsBySmeDate, currentWeekDates,
    mentors, smes, colleges, slots, holidays, subjectGroups, collegeTimeSlots, selectedWeek,
    currentCollege, getEffectiveDayOrderInfo]);

  // Helper: check if a faculty member (mentor/SME) is on approved faculty leave on a date
  const isFacultyOnLeave = useCallback((facultyId: string, dateStr: string) => {
    return facultyOnLeaveOn(facultyLeaves, facultyId, dateStr);
  }, [facultyLeaves]);

  // Helper: resolve SMEs registered for a subject group
  const getSmesForSubjectGroup = useCallback(
    (groupName: string) => smesForSubjectGroup(slotSnapshot, groupName),
    [slotSnapshot]
  );

  // Helper: check if an SME is free on a given date/time (checks DB collisions + dynamic configured availability windows)
  const isSmeFree = useCallback(
    (smeId: string, dateStr: string, time: string, newlyScheduled: any[] = []) =>
      smeFreeAt(slotSnapshot, smeId, dateStr, time, newlyScheduled),
    [slotSnapshot]
  );

  // Dynamic SME Time Slots derived strictly from active SME availability windows
  const activeDemoSlots = useMemo(() => computeActiveDemoSlots(smeAvailability), [smeAvailability]);

  // Campus period labels straight from that college's timetable + shift configs.
  // Shared by the Excel template and the on-screen grid so both show the same rows.
  const getCollegePeriodLabels = useCallback((collegeId?: string) =>
    computeCollegePeriodLabels(colleges, slots, collegeId), [colleges, slots]);

  // Rows the Master Grid renders: the selected campus' own periods, else the union of SME windows.
  const gridPeriodRows = useMemo(() => {
    if (selectedCollegeId && selectedCollegeId !== "all") {
      const campusPeriods = getCollegePeriodLabels(selectedCollegeId);
      const hasTimetable = slots.some(s => s.college_id === selectedCollegeId && s.time);
      if (hasTimetable || campusPeriods.length > 0) return campusPeriods;
    }
    return activeDemoSlots;
  }, [selectedCollegeId, getCollegePeriodLabels, slots, activeDemoSlots]);

  // ── Grid lookup helpers built on top of the indexes ──
  const isFacultyOnLeaveIndexed = useCallback((facultyId: string, dateStr: string) => {
    return facultyOnLeaveIndexed(slotSnapshot, facultyId, dateStr);
  }, [slotSnapshot]);

  // SME eligibility is string-matched; cache per group instead of re-scanning every SME.
  const smesByGroupCache = useMemo(() => new Map<string, any[]>(), [getSmesForSubjectGroup]);
  const smesForGroup = useCallback((group: string) => {
    const key = (group || "").toLowerCase().trim();
    const hit = smesByGroupCache.get(key);
    if (hit) return hit;
    const res = getSmesForSubjectGroup(group);
    smesByGroupCache.set(key, res);
    return res;
  }, [getSmesForSubjectGroup, smesByGroupCache]);

  // Helper: evaluate an SME's window status on a given date/time (matches SME Portal in SMEDashboard)
  const getSmeSlotStatus = useCallback(
    (smeId: string, dayName: string, dateStr: string, slot: string) =>
      smeSlotStatusAt(slotSnapshot, smeId, dayName, dateStr, slot),
    [slotSnapshot]
  );

  // One dropdown label for every renderer: the cards, the unified matrix and the workbook all read it.
  const mentorOptionLabel = useCallback((m: any) => {
    const mGroup = mentorGroupOf(m);
    const defaultTarget = ruleTargetsBySubject.get(mGroup.toLowerCase().trim()) || 1;
    const customTarget = mentorTargets[m.id] !== undefined ? mentorTargets[m.id] : defaultTarget;
    const scheduled = weeklySessionCounts.get(m.id) || 0;
    const colName = collegesById.get(m.college_id)?.name || "Campus";
    return `${m.name} (${colName}) [${scheduled}/${customTarget}h]`;
  }, [ruleTargetsBySubject, mentorTargets, weeklySessionCounts, collegesById]);

  // Everything the free-mentor gate reads, bound once so the per-cell cache can key off it.
  const freeMentorCtx = useMemo<LndFreeMentorCtx>(() => ({
    smes,
    mentors,
    selectedGroupId,
    selectedCollegeId,
    mentorTargets,
    ruleTargetsBySubject,
    weeklySessionCounts,
    sessionsByMentorDate,
    slotsByMentor,
    isFacultyOnLeaveIndexed,
    smesForGroup,
    dayOrderFor: getEffectiveDayOrderInfo
  }), [smes, mentors, selectedGroupId, selectedCollegeId, mentorTargets, ruleTargetsBySubject,
    weeklySessionCounts, sessionsByMentorDate, slotsByMentor, isFacultyOnLeaveIndexed,
    smesForGroup, getEffectiveDayOrderInfo]);

  // Helper: query available free mentors for an SME demo slot (with real-time quota gating & clash detection)
  const getFreeMentorsForSlot = useCallback((smeId: string, dayName: string, dateStr: string, slot: string, dayIdx: number) =>
    computeFreeMentorsForSlot(freeMentorCtx, smeId, dayName, dateStr, slot, dayIdx), [freeMentorCtx]);

  // Every cell of the grid asks the same question once per render, so cache per cell key.
  const freeMentorsByCell = useMemo(() => new Map<string, any[]>(), [freeMentorCtx]);

  const getFreeMentorsForSlotCached = useCallback((
    smeId: string,
    dayName: string,
    dateStr: string,
    slot: string,
    dayIdx: number
  ) => {
    const key = `${smeId}|${dayName}|${dateStr}|${slot}|${dayIdx}`;
    const hit = freeMentorsByCell.get(key);
    if (hit) return hit;
    const res = getFreeMentorsForSlot(smeId, dayName, dateStr, slot, dayIdx);
    freeMentorsByCell.set(key, res);
    return res;
  }, [freeMentorsByCell, getFreeMentorsForSlot]);

  // Active SMEs to display on the Master L&D Grid
  const gridScopeSmes = useMemo(
    () => computeGridScopeSmes(smes, mentors, selectedGroupId, selectedCollegeId, smesForGroup),
    [smes, mentors, selectedGroupId, selectedCollegeId, smesForGroup]
  );

  // The evaluator choice only narrows the scoped roster; both grid renderers read this one list.
  const activeGridSmes = useMemo(
    () => (selectedSmeId && selectedSmeId !== "all"
      ? gridScopeSmes.filter(s => s.id === selectedSmeId)
      : gridScopeSmes),
    [gridScopeSmes, selectedSmeId]
  );

  // ── Unified dashboard header. Every number is read off data the grid already derives. ──
  const allocProgress = useMemo(
    () => computeAllocProgress(quotaMentorsSummary),
    [quotaMentorsSummary]
  );

  // Capacity stays scoped to the whole filtered roster - tapping an evaluator pill must not move it.
  const gridWindowCapacity = useMemo(
    () => computeGridWindowCapacity(currentWeekDates, gridScopeSmes, gridPeriodRows, selectedCollegeId, getEffectiveDayOrderInfo, getSmeSlotStatus),
    [currentWeekDates, gridScopeSmes, gridPeriodRows, selectedCollegeId, getEffectiveDayOrderInfo, getSmeSlotStatus]
  );

  // ── Unified Participant Availability & Allocation Engine ──
  // Evaluates real availability across College Timetable, CAM Day Order, Mentor Free Time, Leave,
  // SME Windows and Bookings. The rules live in lndAllocationEngine; this only binds the snapshot.
  const evaluateMentorSlotAvailability = useCallback((
    mentorId: string,
    dateStr: string,
    timeSlot: string,
    customCollegeId?: string,
    currentPreviews: any[] = []
  ) => mentorSlotAvailabilityAt(slotSnapshot, mentorId, dateStr, timeSlot, customCollegeId, currentPreviews),
    [slotSnapshot]);

  // Backwards-compatible alias for existing callers
  const getMentorStatusAtSlot = useCallback((mentorId: string, dateStr: string, dbTimeSlot: string, currentPreviews: any[] = []) => {
    return evaluateMentorSlotAvailability(mentorId, dateStr, dbTimeSlot, undefined, currentPreviews);
  }, [evaluateMentorSlotAvailability]);

  // Derived: Total available free slots for the filtered mentors over the selected dates (excluding holidays)
  const totalFreeSlotsCount = useMemo(
    () => computeTotalFreeSlotsCount(currentWeekDates, collegeTimeSlots, holidays, filteredMentors, getMentorStatusAtSlot),
    [filteredMentors, currentWeekDates, collegeTimeSlots, holidays, getMentorStatusAtSlot]
  );

  // Calculation details for preview
  const unassignedMentors = useMemo(() => {
    if (generationStep !== "done") return [];
    return filteredMentors.filter(m =>
      !previewSessions.some(p => p.mentorId === m.id)
    );
  }, [filteredMentors, previewSessions, generationStep]);

  return {
    currentWeekDates,
    selectedWeek,
    getCollegeTimetablePeriodList,
    getCollegeTimetablePeriods,
    getEffectiveDayOrderInfo,
    getCollegeTimetableDayStatus,
    allCollegesTimetableStatus,
    currentCollege,
    classGroups,
    mentorGroups,
    sessionsBySmeDate,
    sessionsByMentorDate,
    weeklySessionCounts,
    slotsByMentor,
    leaveIdsByDate,
    ruleTargetsBySubject,
    collegesById,
    mentorsById,
    filteredMentors,
    quotaMentorsSummary,
    displayedQuotaMentors,
    smeDemoBounds,
    collegeTimeSlots,
    standardShiftSlots,
    slotSnapshot,
    isFacultyOnLeave,
    getSmesForSubjectGroup,
    isSmeFree,
    activeDemoSlots,
    getCollegePeriodLabels,
    gridPeriodRows,
    isFacultyOnLeaveIndexed,
    smesForGroup,
    getSmeSlotStatus,
    mentorOptionLabel,
    getFreeMentorsForSlot,
    freeMentorsByCell,
    getFreeMentorsForSlotCached,
    gridScopeSmes,
    activeGridSmes,
    allocProgress,
    gridWindowCapacity,
    evaluateMentorSlotAvailability,
    getMentorStatusAtSlot,
    totalFreeSlotsCount,
    unassignedMentors
  };
}
