// The L&D multi-campus demo workbook.
//
// This is the on-screen Master Grid in another medium, so it is built from the same slot snapshot
// and the same engine rules the grid reads. Kept free of React so scratch/lnd_master_grid_shape.cjs
// can produce the real file and assert on its shape.

import {
  checkTimeOverlap,
  facultyOnLeaveOn,
  parseSlotTimeToMinutes,
  smeFreeAt,
  smeSlotStatusAt,
  smesForSubjectGroup,
  type LndSlotSnapshot
} from "./lndAllocationEngine";
import type { GridRow } from "./lndGridIndexes";
import { mentorGroupOf } from "./lndFilterOptions";
import { isTimeSlotMatch, mapDayOrderToDayName } from "./utils";

export type LndTemplateContext = {
  /** Everything the availability rules read; the workbook must not keep its own copy of it. */
  snap: LndSlotSnapshot;
  toast: (message: string, kind?: "success" | "error" | "info" | "warning") => void;
  selectedGroupId: string;
  demoRules: GridRow[];
  mentorTargets: Record<string, number>;
  activeDemoSlots: string[];
  mentorsById: Map<string, GridRow>;
  collegesById: Map<string, GridRow>;
  /** Campus period labels, resolved by the dashboard from generated timetables and shift config. */
  collegePeriodLabels: (collegeId?: string) => string[];
  collegeTimetablePeriodList: (collegeId?: string, weekdayName?: string) => string[];
  collegeDayStatus: (collegeId: string) => { isReady: boolean; readyCount: number; totalDates: number; missingDates: any[] };
  subjectGroups?: any[];
  timetableCoverage: { collegesWithTimetable: GridRow[]; collegesSkipped: GridRow[] };
};

export async function buildLndDemoTemplate(
  ctx: LndTemplateContext,
  targetGroupInput?: string
): Promise<any | undefined> {
  const snap = ctx.snap;
  const {
    facultyLeaves, smeAvailability, demoSessions, mentors, smes, colleges, slots,
    selectedWeek, weekDates: currentWeekDates
  } = snap;

  // Dashboard-side inputs the snapshot cannot carry.
  const toast = ctx.toast;
  const selectedGroupId = ctx.selectedGroupId;
  const demoRules = ctx.demoRules;
  const mentorTargets = ctx.mentorTargets;
  const activeDemoSlots = ctx.activeDemoSlots;
  const mentorsById = ctx.mentorsById;
  const collegesById = ctx.collegesById;
  const getCollegePeriodLabels = ctx.collegePeriodLabels;
  const getCollegeTimetablePeriodList = ctx.collegeTimetablePeriodList;
  const getCollegeTimetableDayStatus = ctx.collegeDayStatus;
  const allCollegesTimetableStatus = ctx.timetableCoverage;

  // Bound to the shared engine so a cell and its workbook twin can never disagree.
  const getMentorGroup = mentorGroupOf;
  const getEffectiveDayOrderInfo = snap.dayOrderFor;
  const getSmesForSubjectGroup = (groupName: string) => smesForSubjectGroup(snap, groupName);
  const isFacultyOnLeave = (facultyId: string, dateStr: string) => facultyOnLeaveOn(snap.facultyLeaves, facultyId, dateStr);
  const getSmeSlotStatus = (smeId: string, dayName: string, dateStr: string, slot: string) =>
    smeSlotStatusAt(snap, smeId, dayName, dateStr, slot);
  const isSmeFree = (smeId: string, dateStr: string, time: string, newlyScheduled: GridRow[] = []) =>
    smeFreeAt(snap, smeId, dateStr, time, newlyScheduled);

  // 1. Scope the workbook to campuses whose timetable is actually generated
  const collegesWithTimetable = allCollegesTimetableStatus.collegesWithTimetable;
  const skippedColleges = allCollegesTimetableStatus.collegesSkipped;

  if (collegesWithTimetable.length === 0) {
    toast("Template download blocked: no campus has a generated timetable yet. Generate the timetable in the CM Timetable console first.", "error");
    return;
  }

  const targetGroup = targetGroupInput || (selectedGroupId && selectedGroupId !== "All" ? selectedGroupId : "All");
  const isAll = !targetGroup || targetGroup.toLowerCase().trim() === "all";
  const targetGroupLower = targetGroup.toLowerCase().trim();

  // Admin-created Subject Groups catalog
  const rawSubjectGroups = ctx.subjectGroups || snap.subjectGroups || [];
  const adminSubjectGroupNames: string[] = Array.from(new Set(
    rawSubjectGroups
      .map((sg: any) => (typeof sg === "string" ? sg : sg?.name))
      .filter((n: any): n is string => Boolean(n && n.trim()))
      .map((n: string) => n.trim())
  ));

  const applicableColleges = collegesWithTimetable;
  if (applicableColleges.length === 0) {
    toast("No colleges configured in database.", "warning");
    return;
  }

  // Filter mentors: if specific group selected, filter by that subject group (matching mentor_group, subject_group, or department)
  const isMentorMatch = (m: any) => {
    if (isAll) return true;
    if (!m) return false;
    const mg = (getMentorGroup(m) || "").toLowerCase().trim();
    const sg = (m.subject_group || "").toLowerCase().trim();
    const dept = (m.department || "").toLowerCase().trim();
    if (mg === targetGroupLower || sg === targetGroupLower || dept === targetGroupLower) return true;
    if (targetGroupLower === "cs" && (mg.includes("cs") || mg.includes("computer") || sg.includes("cs") || dept.includes("cs"))) return true;
    if (targetGroupLower.length >= 3 && (mg.includes(targetGroupLower) || sg.includes(targetGroupLower) || dept.includes(targetGroupLower))) return true;
    return false;
  };
  const relevantMentors = mentors.filter(isMentorMatch);

  // Filter SMEs: if specific group selected, filter by that subject group, otherwise include all SMEs
  const relevantSmes = !isAll
    ? getSmesForSubjectGroup(targetGroup)
    : smes;

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FACE Prep E-Campus - L & D";

  // Helper to get actual college working hours, start time, end time, and campus name
  const getCollegeTimingInfo = (collegeId?: string) => {
    const col = colleges.find(c => c.id === collegeId);
    const collegeName = col?.name || "Campus";
    const campusSlotsList = new Set<string>();

    slots.filter(s => s.college_id === collegeId && s.time).forEach(s => {
      const clean = s.time.trim();
      if (clean && !clean.toLowerCase().includes("lunch") && !clean.toLowerCase().includes("break")) {
        campusSlotsList.add(clean);
      }
    });

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

    if (sortedSlots.length > 0) {
      const earliestSlot = sortedSlots[0];
      const latestSlot = sortedSlots[sortedSlots.length - 1];
      const startTime = earliestSlot.split("-")[0]?.trim() || earliestSlot;
      const endTime = latestSlot.split("-")[1]?.trim() || latestSlot;
      return { collegeName, startTime, endTime, workingHours: `${startTime} - ${endTime}` };
    }

    const startTime = col?.start_time || "08:30 AM";
    const endTime = "04:30 PM";
    return { collegeName, startTime, endTime, workingHours: `${startTime} - ${endTime}` };
  };

  // Helper to get exact time slots for a specific college (shared with the on-screen grid)
  const getCollegeSpecificSlots = getCollegePeriodLabels;

  // Helper to calculate free periods for a mentor on a specific Day Order & date based solely on their timetable & college Day Order
  const getMentorDayFreePeriods = (mentorId: string, collegeId?: string, targetDateStr?: string, weekdayName?: string, dayIndex?: number) => {
    const mDayInfo = getEffectiveDayOrderInfo(targetDateStr || "", weekdayName || "", dayIndex || 0, collegeId);
    if (mDayInfo.isHoliday) {
      return "Campus Holiday (Closed)";
    }
    const mentorSlots = getCollegeSpecificSlots(collegeId);
    const freeList: string[] = [];
    const targetDate = targetDateStr;

    mentorSlots.forEach((slot, sIdx) => {
      const isLunchOrBreak = slot.toLowerCase().includes("lunch") || slot.toLowerCase().includes("break");
      if (isLunchOrBreak) return;

      const hasClass = slots.some(s => {
        if (s.mentorId !== mentorId) return false;
        const sDay = (s.day || "").toLowerCase().trim();
        const targetEffDay = mDayInfo.effectiveTimetableDay.toLowerCase().trim();
        const targetDayOrder = (mDayInfo.dayOrder || "").toLowerCase().trim();
        const mappedSlotDay = (mapDayOrderToDayName(s.day, "") || "").toLowerCase().trim();
        const mappedTargetDayOrder = (mapDayOrderToDayName(mDayInfo.dayOrder, "") || "").toLowerCase().trim();

        const dayMatches =
          (targetDayOrder && sDay === targetDayOrder) ||
          (targetEffDay && sDay === targetEffDay) ||
          (mappedSlotDay && targetEffDay && mappedSlotDay === targetEffDay) ||
          (mappedTargetDayOrder && sDay === mappedTargetDayOrder) ||
          (targetEffDay && sDay.startsWith(targetEffDay.slice(0, 3)));

        if (!dayMatches) return false;
        return isTimeSlotMatch(s.time, slot);
      });
      const isBlocked = targetDate ? isFacultyOnLeave(mentorId, targetDate) : facultyLeaves?.some((fl: any) => (fl.mentor_id === mentorId || fl.mentorId === mentorId) && fl.status === "approved");

      if (!hasClass && !isBlocked) {
        freeList.push(`P${sIdx + 1} (${slot})`);
      }
    });

    return freeList.length > 0 ? freeList.join(", ") : "No Free Periods (Fully Booked)";
  };

  // Helper to calculate weekly free overview across all week days based on each mentor's college Day Orders
  const getMentorWeeklyFreeSummary = (mentorId: string, collegeId?: string) => {
    const mentorSlots = getCollegeSpecificSlots(collegeId);
    const parts: string[] = [];
    let totalFreeCount = 0;

    currentWeekDates.forEach((w, idx) => {
      const mDayInfo = getEffectiveDayOrderInfo(w.dateStr, w.day, idx, collegeId);
      if (mDayInfo.isHoliday) {
        parts.push(`${w.day.slice(0, 3)}: Holiday`);
        return;
      }
      if (mDayInfo.periods === 0) {
        parts.push(`${mDayInfo.dayOrder} (${mDayInfo.weekdayName.slice(0, 3)}): No timetable`);
        return;
      }
      const freePeriodRanges: string[] = [];
      const targetDate = mDayInfo.dateStr;

      mentorSlots.forEach((slot) => {
        const isLunchOrBreak = slot.toLowerCase().includes("lunch") || slot.toLowerCase().includes("break");
        if (isLunchOrBreak) return;

        const hasClass = slots.some(s => {
          if (s.mentorId !== mentorId) return false;
          const sDay = (s.day || "").toLowerCase().trim();
          const targetEffDay = (mDayInfo.effectiveTimetableDay || "").toLowerCase().trim();
          const targetDayOrder = (mDayInfo.dayOrder || "").toLowerCase().trim();
          const mappedSlotDay = (mapDayOrderToDayName(s.day, "") || "").toLowerCase().trim();
          const mappedTargetDayOrder = (mapDayOrderToDayName(mDayInfo.dayOrder, "") || "").toLowerCase().trim();

          const dayMatches =
            (targetDayOrder && sDay === targetDayOrder) ||
            (targetEffDay && sDay === targetEffDay) ||
            (mappedSlotDay && targetEffDay && mappedSlotDay === targetEffDay) ||
            (mappedTargetDayOrder && sDay === mappedTargetDayOrder) ||
            (targetEffDay && sDay.startsWith(targetEffDay.slice(0, 3)));

          if (!dayMatches) return false;
          return isTimeSlotMatch(s.time, slot);
        });
        const isBlocked = targetDate ? isFacultyOnLeave(mentorId, targetDate) : facultyLeaves?.some((fl: any) => (fl.mentor_id === mentorId || fl.mentorId === mentorId) && fl.status === "approved");

        if (!hasClass && !isBlocked) {
          freePeriodRanges.push(slot);
          totalFreeCount++;
        }
      });

      if (freePeriodRanges.length > 0) {
        parts.push(`${mDayInfo.dayOrder} (${mDayInfo.weekdayName.slice(0, 3)}): ${freePeriodRanges.join(", ")}`);
      } else {
        parts.push(`${mDayInfo.dayOrder} (${mDayInfo.weekdayName.slice(0, 3)}): Busy`);
      }
    });

    return parts.length > 0 ? `${parts.join(" • ")} (${totalFreeCount} free periods/wk)` : "Fully Occupied";
  };

  // Helper function to convert 1-based column index to Excel column letters
  const getColLetter = (colIdx: number) => {
    let temp, letter = '';
    let num = colIdx;
    while (num > 0) {
      temp = (num - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      num = Math.floor((num - temp - 1) / 26);
    }
    return letter;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED ENGINE CONTEXT: Period union, Day Orders, SME demo slots, and mentors
  // ─────────────────────────────────────────────────────────────────────────
  const dayOrderNumber = (label?: string) => {
    const n = parseInt(String(label || "").replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : 999;
  };

  // Helper to format minutes into 12-hour AM/PM string (e.g. 600 -> "10:00 AM")
  const formatMinTo12 = (val: number) => {
    let hr = Math.floor(val / 60);
    const min = val % 60;
    const isPm = hr >= 12;
    let displayHr = hr > 12 ? hr - 12 : hr;
    if (displayHr === 0) displayHr = 12;
    return `${String(displayHr).padStart(2, "0")}:${String(min).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
  };

  const collegePeriods: Record<string, string[]> = {};
  applicableColleges.forEach(c => { collegePeriods[c.id] = getCollegeSpecificSlots(c.id); });

  const globalPeriods = Array.from(new Set(
    applicableColleges.map(c => collegePeriods[c.id]).flat()
  )).sort((a, b) => parseSlotTimeToMinutes(a) - parseSlotTimeToMinutes(b));

  const collegeDayRows: Record<string, { idx: number; info: ReturnType<typeof getEffectiveDayOrderInfo> }[]> = {};
  applicableColleges.forEach(c => {
    collegeDayRows[c.id] = currentWeekDates
      .map((w, idx) => ({ idx, info: getEffectiveDayOrderInfo(w.dateStr, w.day, idx, c.id) }))
      .sort((a, b) => a.info.isHoliday === b.info.isHoliday
        ? dayOrderNumber(a.info.dayOrder) - dayOrderNumber(b.info.dayOrder)
        : (a.info.isHoliday ? 1 : -1));
  });

  const collegeNameOf = (collegeId?: string) => colleges.find(c => c.id === collegeId)?.name || "";

  const orderedMentors = [...relevantMentors].sort((a, b) =>
    collegeNameOf(a.college_id).localeCompare(collegeNameOf(b.college_id)) ||
    String(a.name).localeCompare(String(b.name))
  );

  const activeSmes = relevantSmes.length > 0 ? relevantSmes : (smes.length > 0 ? smes : [{ id: "sme_gen", name: "General Evaluator", subject: targetGroup }]);

  // ─────────────────────────────────────────────────────────────────────────
  // HIDDEN REFERENCE SHEET: Free Mentors per SME, Day Order & Demo Time Slot
  // ─────────────────────────────────────────────────────────────────────────
  const wsRef = workbook.addWorksheet("Free_Periods_Ref");
  wsRef.state = "hidden";
  wsRef.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];

  // One column per SME x Day Order x Demo Time Slot. Rows 1-4 label the column and row 6+ holds
  // the dropdown entries, so the sheet reads as a structured lookup table.
  const REF_FIRST_DATA_COL = 2;
  const REF_MENTOR_START_ROW = 6;
  const refCaptions = [
    "Assigned SME",
    "Day Order / Date",
    "Demo Time Slot",
    "Free mentors in this slot",
    "Dropdown entries ↓",
  ];

  const totalGridDataRows = currentWeekDates.length * activeSmes.length;
  const gridEndRow = 1 + totalGridDataRows;
  const gridLastColLetter = getColLetter(activeDemoSlots.length + 3);

  let refColCounter = REF_FIRST_DATA_COL;
  const cellValidationRanges: Record<string, string> = {};

  currentWeekDates.forEach((w, dayIdx) => {
    const dayInfo = getEffectiveDayOrderInfo(w.dateStr, w.day, dayIdx);
    const targetDate = w.dateStr;

    activeSmes.forEach((sme) => {
      activeDemoSlots.forEach((slot) => {
        const smeSlotStatus = getSmeSlotStatus(sme.id, w.day, targetDate, slot);

        let freeMentorsForSlot: typeof relevantMentors = [];

        if (!dayInfo.isHoliday && smeSlotStatus.isDemoSlot) {
          freeMentorsForSlot = relevantMentors.filter(m => {
            // 1. Must match SME's subject group
            const mGroup = getMentorGroup(m);
            const eligibleSmes = getSmesForSubjectGroup(mGroup);
            const matchesSme = eligibleSmes.some(e => e.id === sme.id) ||
              (!isAll && mGroup.toLowerCase().trim() === targetGroup.toLowerCase().trim());
            if (!matchesSme) return false;

            // 2. Check if mentor's campus is open / not on holiday
            const mDayInfo = getEffectiveDayOrderInfo(targetDate, w.day, dayIdx, m.college_id);
            if (mDayInfo.isHoliday || mDayInfo.periods === 0) return false;

            // 3. Check if mentor is on approved leave
            const isBlocked = targetDate
              ? isFacultyOnLeave(m.id, targetDate)
              : facultyLeaves?.some((fl: any) => (fl.mentor_id === m.id || fl.mentorId === m.id) && fl.status === "approved");
            if (isBlocked) return false;

            // 3b. Quota check: if mentor's weekly target hours are satisfied, exclude from dropdown list
            const defaultTarget = demoRules?.find(r => r.subject?.toLowerCase().trim() === mGroup.toLowerCase().trim())?.target || 1;
            const customTarget = mentorTargets[m.id] !== undefined ? mentorTargets[m.id] : defaultTarget;
            const scheduledCount = demoSessions.filter(ds => {
              const dsMid = ds.mentorId || ds.mentor_id;
              const dsW = ds.week ?? ds.week_number;
              const dsD = ds.dateStr || ds.date_str;
              return dsMid === m.id &&
                (dsW === selectedWeek || (dsD && currentWeekDates.some(w => w.dateStr === dsD))) &&
                ds.status !== "cancelled" &&
                ds.status !== "not_conducted";
            }).length;
            if (scheduledCount >= customTarget) return false;

            // 4. Check if mentor is already booked for another demo session overlapping this slot
            const hasExistingDemo = demoSessions.some(ds => {
              const dsMid = ds.mentorId || ds.mentor_id;
              const dsD = ds.dateStr || ds.date_str;
              const dsT = ds.timeSlot || ds.time_slot;
              return dsMid === m.id &&
                dsD === targetDate &&
                ds.status !== "cancelled" &&
                ds.status !== "not_conducted" &&
                checkTimeOverlap(dsT, slot);
            });
            if (hasExistingDemo) return false;

            // 5. Check if mentor has regular timetable teaching class clashing with this slot
            const hasClass = slots.some(s => {
              if (s.mentorId !== m.id) return false;
              const sDay = (s.day || "").toLowerCase().trim();
              const targetEffDay = (mDayInfo.effectiveTimetableDay || "").toLowerCase().trim();
              const targetDayOrder = (mDayInfo.dayOrder || "").toLowerCase().trim();
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

        const colLetter = getColLetter(refColCounter);
        const valKey = `${sme.id}_${dayInfo.key}_${slot}`;

        wsRef.getCell(`${colLetter}1`).value = sme.name;
        wsRef.getCell(`${colLetter}2`).value = dayInfo.rowLabel;
        wsRef.getCell(`${colLetter}3`).value = slot;
        wsRef.getCell(`${colLetter}4`).value = freeMentorsForSlot.length;

        if (freeMentorsForSlot.length > 0) {
          freeMentorsForSlot.forEach((m, idx) => {
            const mGroup = getMentorGroup(m);
            const customTarget = mentorTargets[m.id] !== undefined
              ? mentorTargets[m.id]
              : (demoRules?.find(r => r.subject?.toLowerCase().trim() === mGroup.toLowerCase().trim())?.target || 1);
            const mentorLabel = `${m.name} (${collegeNameOf(m.college_id)})`;
            const safeName = m.name.replace(/"/g, '""');
            const safeLabel = mentorLabel.replace(/"/g, '""');

            const cell = wsRef.getCell(`${colLetter}${REF_MENTOR_START_ROW + idx}`);
            // Dynamic formula: If count of mentor in Master_Grid demo slots is less than their weekly target/hours,
            // show their name; once condition/hours is satisfied, evaluate to "" so other dropdowns do not show them.
            cell.value = {
              formula: `IF(COUNTIF(Master_Grid!$D$2:$${gridLastColLetter}$${gridEndRow}, "*${safeName}*")<${customTarget}, "${safeLabel}", "")`,
              result: mentorLabel
            };
          });
          const endRow = REF_MENTOR_START_ROW + freeMentorsForSlot.length - 1;
          cellValidationRanges[valKey] = `'Free_Periods_Ref'!$${colLetter}$${REF_MENTOR_START_ROW}:$${colLetter}$${endRow}`;
        }

        refColCounter++;
      });
    });
  });

  const refLabelFill = { type: "pattern", pattern: "solid", fgColor: { argb: "EEF2FF" } } as const;
  refCaptions.forEach((cap, i) => {
    const cell = wsRef.getCell(i + 1, 1);
    cell.value = cap;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E293B" } };
    cell.fill = refLabelFill;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  for (let c = REF_FIRST_DATA_COL; c < refColCounter; c++) {
    for (let r = 1; r <= 5; r++) {
      const cell = wsRef.getCell(r, c);
      if (r === 5) { cell.fill = refLabelFill; continue; }
      cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "1E293B" } };
      cell.fill = refLabelFill;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    }
    for (let r = REF_MENTOR_START_ROW; r <= wsRef.rowCount; r++) {
      const cell = wsRef.getCell(r, c);
      if (cell.value === null || cell.value === undefined) continue;
      cell.font = { name: "Arial", size: 9 };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    }
  }
  wsRef.getColumn(1).width = 26;
  for (let c = REF_FIRST_DATA_COL; c < refColCounter; c++) {
    wsRef.getColumn(c).width = 30;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET 1: Master L&D Schedule (Bulk Multi-College Entry Table)
  // ─────────────────────────────────────────────────────────────────────────
  const wsMaster = workbook.addWorksheet("Master_LnD_Schedule");
  const masterHeaders = [
    "College / Campus",
    "Faculty / Mentor",
    "Department / Subject Group",
    "Day / Date",
    "Time Slot / Period",
    "Assigned SME (Optional)",
    "Class Cohort / Stream",
    "Week Number"
  ];
  const masterHeadRow = wsMaster.addRow(masterHeaders);
  masterHeadRow.height = 28;
  masterHeadRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  masterHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "D528A2" } }; // Signature Magenta
  masterHeadRow.alignment = { vertical: "middle", horizontal: "center" };

  // One pre-filled row per eligible mentor, pinned to the first period they are genuinely free in
  applicableColleges.forEach(colObj => {
    const colMentors = relevantMentors.filter(m => m.college_id === colObj.id || m.collegeId === colObj.id);

    colMentors.forEach((m) => {
      // Resolve canonical subject group: if a specific group was chosen, pin to targetGroup;
      // otherwise prefer official admin-created subject group name
      const matchedAdminGroup = adminSubjectGroupNames.find(
        ag => ag.toLowerCase().trim() === (m.subject_group || "").toLowerCase().trim()
      );
      const mGroup = !isAll ? targetGroup : (matchedAdminGroup || m.subject_group || getMentorGroup(m));
      let freePick: { dateStr: string; day: string; dayOrder: string; slot: string } | null = null;

      for (let wIdx = 0; wIdx < currentWeekDates.length && !freePick; wIdx++) {
        const w = currentWeekDates[wIdx];
        const dayInfo = getEffectiveDayOrderInfo(w.dateStr, w.day, wIdx, colObj.id);
        if (dayInfo.isHoliday || dayInfo.periods === 0) continue;

        const freeText = getMentorDayFreePeriods(m.id, colObj.id, w.dateStr, w.day, wIdx);
        if (!freeText || freeText.startsWith("No Free Periods") || freeText.includes("Holiday")) continue;

        const runningPeriods = getCollegeTimetablePeriodList(colObj.id, dayInfo.effectiveTimetableDay);
        const freeRange = freeText
          .split(",")
          .map(part => part.match(/\(([^)]+)\)/)?.[1].trim())
          .filter((t): t is string => Boolean(t))
          .find(t => runningPeriods.some(p => isTimeSlotMatch(p, t)));
        if (!freeRange) continue;

        freePick = {
          dateStr: w.dateStr,
          day: w.day,
          dayOrder: dayInfo.dayOrder,
          slot: freeRange
        };
      }

      const eligibleSmes = getSmesForSubjectGroup(mGroup);
      let eligibleSme: any = undefined;
      if (freePick) {
        const pick = freePick;
        eligibleSme = eligibleSmes.find(s => isSmeFree(s.id, pick.dateStr, pick.slot)) || eligibleSmes[0];
      }

      const row = wsMaster.addRow([
        colObj.name,
        m.name,
        mGroup,
        freePick ? `${freePick.dayOrder} - ${freePick.day} (${freePick.dateStr})` : "No free period in selected week",
        freePick ? freePick.slot : "",
        eligibleSme ? eligibleSme.name : "",
        "General Stream",
        selectedWeek || 1
      ]);
      row.height = 22;
      for (let c = 1; c <= 8; c++) {
        row.getCell(c).font = { name: "Arial", size: 9.5 };
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      }
    });
  });

  [30, 26, 24, 30, 24, 24, 20, 14].forEach((w, i) => { wsMaster.getColumn(i + 1).width = w; });

  // Add Excel dropdown validation for Department / Subject Group column (C) from Admin-created Subject Groups
  if (adminSubjectGroupNames.length > 0) {
    const groupFormula = `"${adminSubjectGroupNames.slice(0, 35).join(",")}"`;
    const maxRow = Math.max(wsMaster.rowCount, 50);
    for (let r = 2; r <= maxRow; r++) {
      wsMaster.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [groupFormula]
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET: Unified Master Grid — Day Order × Assigned SME across all campuses
  // ─────────────────────────────────────────────────────────────────────────
  const wsGrid = workbook.addWorksheet("Master_Grid");
  wsGrid.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];

  const gridHeaders = [
    "Day Order / Date",
    "Assigned SME",
    "Department / Subject Group",
    ...activeDemoSlots.map((ts, i) => `Demo Slot ${i + 1} (${ts})`)
  ];
  const gridHeaderRow = wsGrid.addRow(gridHeaders);
  gridHeaderRow.height = 28;
  gridHeaderRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  gridHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4F46E5" } }; // Indigo Header
  gridHeaderRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  wsGrid.getColumn(1).width = 30; // Day Order / Date
  wsGrid.getColumn(2).width = 26; // Assigned SME
  wsGrid.getColumn(3).width = 28; // Department / Subject Group
  for (let c = 4; c <= activeDemoSlots.length + 3; c++) {
    wsGrid.getColumn(c).width = 30;
  }

  let gridRowCursor = 2;
  currentWeekDates.forEach((w, dayIdx) => {
    const dayInfo = getEffectiveDayOrderInfo(w.dateStr, w.day, dayIdx);
    const targetDate = w.dateStr;
    const dayBlockFill = dayIdx % 2 === 1 ? "F8FAFC" : "FFFFFF";
    let firstRowOfDay = true;

    activeSmes.forEach((sme) => {
      const smeSubject = sme.subject || sme.head_subject_group || "General";
      const rowData: string[] = [dayInfo.rowLabel, sme.name, smeSubject];

      activeDemoSlots.forEach((slot) => {
        if (dayInfo.isHoliday) {
          rowData.push("Campus Holiday (Closed)");
        } else {
          const smeSlotStatus = getSmeSlotStatus(sme.id, w.day, targetDate, slot);
          if (smeSlotStatus.status === "booked" && smeSlotStatus.session) {
            const bMid = smeSlotStatus.session.mentorId || smeSlotStatus.session.mentor_id;
            const bMentor = mentorsById.get(bMid);
            const bCollege = collegesById.get(bMentor?.college_id || "")?.name || "";
            rowData.push(bMentor ? `${bMentor.name} (${bCollege})` : (smeSlotStatus.session.mentorName || "Booked"));
          } else if (!smeSlotStatus.isDemoSlot) {
            rowData.push(smeSlotStatus.label);
          } else {
            const valKey = `${sme.id}_${dayInfo.key}_${slot}`;
            const listRange = cellValidationRanges[valKey];
            if (listRange) {
              rowData.push("");
            } else {
              rowData.push("No free faculty in this slot");
            }
          }
        }
      });

      const row = wsGrid.addRow(rowData);
      row.height = 24;

      for (let c = 1; c <= activeDemoSlots.length + 3; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Arial", size: 9.5 };
        cell.alignment = { vertical: "middle", horizontal: c <= 3 ? "center" : "left" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dayBlockFill } };
        cell.border = {
          top: { style: firstRowOfDay ? 'medium' : 'thin', color: { argb: firstRowOfDay ? '4F46E5' : 'E2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
          left: { style: 'thin', color: { argb: 'E2E8F0' } },
          right: { style: 'thin', color: { argb: 'E2E8F0' } }
        };
      }
      firstRowOfDay = false;

      activeDemoSlots.forEach((slot, sIdx) => {
        const cell = wsGrid.getCell(gridRowCursor, 4 + sIdx);

        if (dayInfo.isHoliday) {
          cell.font = { name: "Arial", size: 9, italic: true, color: { argb: "94A3B8" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F1F5F9" } };
          return;
        }

        const smeSlotStatus = getSmeSlotStatus(sme.id, w.day, targetDate, slot);
        if (smeSlotStatus.status === "booked" && smeSlotStatus.session) {
          cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "9D174D" } }; // Deep pink text
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FCE7F3" } }; // Lite pink background
          const valKey = `${sme.id}_${dayInfo.key}_${slot}`;
          const listRange = cellValidationRanges[valKey];
          if (listRange) {
            cell.dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [listRange],
              showErrorMessage: true,
              errorTitle: "Change Faculty Allocation",
              error: "Please select an eligible free faculty from the dropdown list or clear this cell."
            };
          }
          return;
        }

        if (!smeSlotStatus.isDemoSlot) {
          if (smeSlotStatus.status === "training") {
            cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "6D28D9" } }; // Purple
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F5F3FF" } };
          } else if (smeSlotStatus.status === "leave") {
            cell.font = { name: "Arial", size: 9, italic: true, color: { argb: "B45309" } }; // Amber
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF3C7" } };
          } else {
            // off_duty or other unconfigured slot
            cell.font = { name: "Arial", size: 9, italic: true, color: { argb: "94A3B8" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
          }
          return;
        }

        const valKey = `${sme.id}_${dayInfo.key}_${slot}`;
        const listRange = cellValidationRanges[valKey];

        if (listRange) {
          cell.dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [listRange],
            showErrorMessage: true,
            errorTitle: "Invalid Faculty Selection",
            error: "Please select an eligible free faculty from the dropdown list for this SME slot."
          };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F0FDF4" } }; // Mint / light green
          cell.font = { name: "Arial", size: 9.5, color: { argb: "0F172A" } };
        } else {
          cell.value = "No free faculty in this slot";
          cell.font = { name: "Arial", size: 9, italic: true, color: { argb: "94A3B8" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
        }
      });

      gridRowCursor++;
    });
  });

  wsGrid.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(gridEndRow, 1), column: activeDemoSlots.length + 3 },
  };

  // ─────────────────────────────────────────────────────────────────────────
  // REAL-TIME FACULTY WEEKLY L&D HOURS & QUOTA MONITOR (Directly below Master Grid)
  // ─────────────────────────────────────────────────────────────────────────
  const monitorStartRow = gridEndRow + 3;

  // Title banner
  wsGrid.mergeCells(monitorStartRow, 1, monitorStartRow, 7);
  const titleCell = wsGrid.getCell(monitorStartRow, 1);
  titleCell.value = "REAL-TIME FACULTY WEEKLY L&D HOURS & QUOTA MONITOR";
  titleCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "312E81" } }; // Deep Indigo
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  wsGrid.getRow(monitorStartRow).height = 28;

  // Subtitle note
  wsGrid.mergeCells(monitorStartRow + 1, 1, monitorStartRow + 1, 7);
  const subtitleCell = wsGrid.getCell(monitorStartRow + 1, 1);
  subtitleCell.value = "Live Monitoring: Scheduled hours and quota status recalculate in real time as faculty are assigned in the grid above. Dropdowns automatically exclude mentors once their weekly quota is satisfied.";
  subtitleCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "64748B" } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F8FAFC" } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  wsGrid.getRow(monitorStartRow + 1).height = 20;

  // Headers
  const monitorHeaders = [
    "Faculty / Mentor Name",
    "College / Campus",
    "Department / Subject Group",
    "Weekly Target Hours (Quota)",
    "Scheduled Hours (In Grid Above)",
    "Remaining Hours",
    "Real-Time Quota Status"
  ];
  const monitorHeadRowIndex = monitorStartRow + 2;
  const monitorHeadRow = wsGrid.getRow(monitorHeadRowIndex);
  monitorHeadRow.values = monitorHeaders;
  monitorHeadRow.height = 24;
  monitorHeadRow.font = { name: "Arial", size: 9.5, bold: true, color: { argb: "FFFFFF" } };
  monitorHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4F46E5" } };
  monitorHeadRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  orderedMentors.forEach((m, idx) => {
    const currentRow = monitorHeadRowIndex + 1 + idx;
    const mGroup = getMentorGroup(m);
    const customTarget = mentorTargets[m.id] !== undefined
      ? mentorTargets[m.id]
      : (demoRules?.find(r => r.subject?.toLowerCase().trim() === mGroup.toLowerCase().trim())?.target || 1);
    const colName = collegeNameOf(m.college_id) || "Campus";

    const row = wsGrid.getRow(currentRow);
    row.values = [
      m.name,
      colName,
      mGroup,
      customTarget,
      { formula: `COUNTIF($D$2:$${gridLastColLetter}$${gridEndRow}, "*"&A${currentRow}&"*")`, result: 0 },
      { formula: `MAX(0, D${currentRow}-E${currentRow})`, result: customTarget },
      { formula: `IF(E${currentRow}=D${currentRow}, "Quota Satisfied", IF(E${currentRow}>D${currentRow}, "Over-scheduled (+" & (E${currentRow}-D${currentRow}) & " hrs)", "Pending (" & (D${currentRow}-E${currentRow}) & " hrs left)"))`, result: `Pending (${customTarget} hrs left)` }
    ];
    row.height = 22;

    const isEven = idx % 2 === 0;
    const rowFill = isEven ? "FFFFFF" : "F8FAFC";

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 9.5, bold: c === 1 || c >= 4 };
      cell.alignment = {
        vertical: "middle",
        horizontal: c <= 3 ? "left" : "center"
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowFill } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET: Mentor Summary — target vs booked L&D across the whole master grid
  // ─────────────────────────────────────────────────────────────────────────
  const wsSummary = workbook.addWorksheet("Mentor_Summary");
  wsSummary.views = [{ state: "frozen", xSplit: 2, ySplit: 1 }];

  const summaryHeadRow = wsSummary.addRow([
    "College / Campus",
    "Faculty / Mentor",
    "Department / Subject Group",
    "Target L&D/Wk",
    "Scheduled L&D",
    "Validation Status"
  ]);
  summaryHeadRow.height = 24;
  summaryHeadRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  summaryHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "374151" } };
  summaryHeadRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  orderedMentors.forEach((m, i) => {
    const rNum = i + 2;
    const customTarget = mentorTargets[m.id] !== undefined
      ? mentorTargets[m.id]
      : (demoRules?.find(r => r.subject?.toLowerCase().trim() === getMentorGroup(m).toLowerCase().trim())?.target || 1);

    const row = wsSummary.addRow([
      collegeNameOf(m.college_id) || "Campus",
      m.name,
      getMentorGroup(m),
      customTarget
    ]);
    row.height = 20;

    row.getCell(5).value = { formula: `COUNTIF(Master_Grid!$D$2:$${gridLastColLetter}$${gridEndRow}, "*"&B${rNum}&"*")` };
    row.getCell(6).value = { formula: `IF(E${rNum}=D${rNum}, "Matched", IF(E${rNum}>D${rNum}, "Over-scheduled", "Remaining: " & (D${rNum}-E${rNum}) & " L&D sessions"))` };

    for (let col = 1; col <= 6; col++) {
      const cell = row.getCell(col);
      cell.font = { name: "Arial", size: 9.5, bold: col >= 5 };
      cell.alignment = { vertical: "middle", horizontal: col === 4 || col === 5 ? "center" : "left" };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };
    }
  });

  [30, 26, 24, 16, 16, 36].forEach((w, i) => { wsSummary.getColumn(i + 1).width = w; });

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET: Eligible Mentors across ALL applicable colleges
  // ─────────────────────────────────────────────────────────────────────────
  const wsMentors = workbook.addWorksheet("Eligible_Mentors");

  // Free-period columns follow each campus's Day Order sequence, not calendar weekdays
  const dayOrderColumns = Array.from(new Set(
    applicableColleges
      .flatMap(c => collegeDayRows[c.id] || [])
      .filter(x => !x.info.isHoliday)
      .map(x => `Day ${dayOrderNumber(x.info.dayOrder)}`)
  )).sort((a, b) => dayOrderNumber(a) - dayOrderNumber(b));

  const mHeadRow = wsMentors.addRow([
    "Mentor ID",
    "Faculty Name",
    "Mentor Group / Department",
    "College Name",
    "College Start Time",
    "College End Time",
    "College Working Hours",
    ...dayOrderColumns.map(label => `${label} Free Periods`),
    "Weekly Free Availability Summary",
    "Weekly Quota Target"
  ]);
  mHeadRow.height = 30;
  mHeadRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  mHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4F46E5" } };
  mHeadRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  wsMentors.views = [{ state: "frozen", xSplit: 4, ySplit: 1 }];

  const totalMentorCols = 9 + dayOrderColumns.length;

  orderedMentors.forEach((m) => {
    const mGroup = getMentorGroup(m);
    const customTarget = mentorTargets[m.id] !== undefined
      ? mentorTargets[m.id]
      : (demoRules?.find(r => r.subject?.toLowerCase().trim() === mGroup.toLowerCase().trim())?.target || 1);

    const timing = getCollegeTimingInfo(m.college_id);
    const mDayRows = collegeDayRows[m.college_id || ""] || [];
    const dayFreeCols = dayOrderColumns.map((label) => {
      const wanted = dayOrderNumber(label);
      const hit = mDayRows.find(x => dayOrderNumber(x.info.dayOrder) === wanted);
      if (!hit) return "Not a working day for this campus";
      if (hit.info.isHoliday) return "Campus Holiday (Closed)";
      if (hit.info.periods === 0) return "No timetable generated";

      const freeText = getMentorDayFreePeriods(m.id, m.college_id, hit.info.dateStr, hit.info.weekdayName, hit.idx);
      if (!freeText || freeText.startsWith("No Free Periods")) return "No free period";

      // Time ranges only, in the same left-to-right order as the Master Grid columns
      const ranges = String(freeText).split(",")
        .map(part => (part.match(/\(([^)]+)\)/) || [])[1]?.trim())
        .filter((t): t is string => Boolean(t));
      return ranges.length ? ranges.join(", ") : "No free period";
    });
    const weeklyFree = getMentorWeeklyFreeSummary(m.id, m.college_id);

    const row = wsMentors.addRow([
      m.id,
      m.name,
      mGroup,
      timing.collegeName,
      timing.startTime,
      timing.endTime,
      timing.workingHours,
      ...dayFreeCols,
      weeklyFree,
      customTarget
    ]);
    for (let c = 1; c <= totalMentorCols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Arial", size: 9 };
      cell.alignment = {
        vertical: "middle",
        horizontal: c === totalMentorCols ? "center" : "left",
        wrapText: c >= 8,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };
      if (c === totalMentorCols) {
        cell.font = { name: "Arial", size: 9.5, bold: true };
      }
    }
  });

  const colWidths = [
    15, 26, 24, 32, 18, 18, 24,
    ...dayOrderColumns.map(() => 30),
    52, 20,
  ];
  colWidths.forEach((w, i) => { wsMentors.getColumn(i + 1).width = w; });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Normalize any time string to 12-hour format "hh:mm AM/PM"
  // ─────────────────────────────────────────────────────────────────────────
  const normalizeTimeTo12Hour = (t: string | undefined | null): string => {
    if (!t) return "";
    const totalMin = parseSlotTimeToMinutes(t);
    if (totalMin === 9999) return t.trim();
    let hr = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    const isPm = hr >= 12;
    let displayHr = hr % 12;
    if (displayHr === 0) displayHr = 12;
    return `${String(displayHr).padStart(2, "0")}:${String(min).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Calculate an SME's day-specific free L&D evaluation slot
  // ─────────────────────────────────────────────────────────────────────────
  const getSmeDaySlots = (smeId: string, dayName: string, dateStr?: string) => {
    const allSmeWindows = (smeAvailability || []).filter(
      (a: any) => a.sme_id === smeId && a.is_active !== 0
    );

    const onLeave = dateStr ? isFacultyOnLeave(smeId, dateStr) : false;
    if (onLeave) {
      return {
        demoText: "On Approved Faculty Leave",
        trainingText: "On Leave",
        isFree: false
      };
    }

    if (allSmeWindows.length === 0) {
      return {
        demoText: "09:00 AM - 05:30 PM (Full Shift Free)",
        trainingText: "None",
        isFree: true
      };
    }

    const dayWindows = allSmeWindows.filter((a: any) => {
      const aDay = (a.day_of_week || "").toLowerCase().trim();
      const targetDay = dayName.toLowerCase().trim();
      const mappedDay = (mapDayOrderToDayName(a.day_of_week, "") || "").toLowerCase().trim();
      return aDay === targetDay || mappedDay === targetDay || aDay.startsWith(targetDay.slice(0, 3));
    });

    if (dayWindows.length === 0) {
      return {
        demoText: "09:00 AM - 05:30 PM (Default Shift)",
        trainingText: "None",
        isFree: true
      };
    }

    const demoWins = dayWindows.filter((w: any) => String(w.slot_type || w.slotType || "demo").toLowerCase() === "demo");
    const trainWins = dayWindows.filter((w: any) => String(w.slot_type || w.slotType || "").toLowerCase() === "training");
    const otherWins = dayWindows.filter((w: any) => String(w.slot_type || w.slotType || "").toLowerCase() === "other");

    const demoText = demoWins.length > 0
      ? demoWins.map((w: any) => `${normalizeTimeTo12Hour(w.start_time)} - ${normalizeTimeTo12Hour(w.end_time)}`).join(", ")
      : "No L&D Windows (Training / Other Only)";

    const trainingText = trainWins.length > 0
      ? trainWins.map((w: any) => `${normalizeTimeTo12Hour(w.start_time)} - ${normalizeTimeTo12Hour(w.end_time)}`).join(", ")
      : "None (Full Availability for L&D)";

    return {
      demoText,
      trainingText,
      isFree: demoWins.length > 0
    };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: Calculate an SME's weekly L&D evaluation slot summary
  // ─────────────────────────────────────────────────────────────────────────
  const getSmeWeeklyOverview = (smeId: string) => {
    const allSmeWindows = (smeAvailability || []).filter(
      (a: any) => a.sme_id === smeId && a.is_active !== 0
    );

    if (allSmeWindows.length === 0) {
      return {
        demoSummary: "Mon – Fri: 09:00 AM - 05:30 PM (Standard Full Shift)",
        trainingSummary: "None (Full Availability for L&D: 09:00 AM - 05:30 PM)"
      };
    }

    const dayDemoList: { day: string; text: string }[] = [];
    const dayTrainList: { day: string; text: string }[] = [];

    currentWeekDates.forEach((w) => {
      const dayRes = getSmeDaySlots(smeId, w.day, w.dateStr);
      dayDemoList.push({ day: w.day.slice(0, 3), text: dayRes.demoText });
      if (dayRes.trainingText && dayRes.trainingText !== "None" && !dayRes.trainingText.includes("Full Availability")) {
        dayTrainList.push({ day: w.day.slice(0, 3), text: dayRes.trainingText });
      }
    });

    const firstDemo = dayDemoList[0]?.text;
    const allSameDemo = dayDemoList.every(d => d.text === firstDemo);

    const demoSummary = allSameDemo && firstDemo
      ? `Mon – Fri: ${firstDemo}`
      : dayDemoList.map(d => `${d.day}: ${d.text}`).join(" • ");

    const trainingSummary = dayTrainList.length > 0
      ? dayTrainList.map(t => `${t.day}: ${t.text}`).join(" • ")
      : "None (Full Availability for L&D)";

    return { demoSummary, trainingSummary };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET: Assigned SMEs with Dedicated L&D Session Slot & Training Time Windows
  // ─────────────────────────────────────────────────────────────────────────
  const wsSmes = workbook.addWorksheet("Assigned_SMEs");
  const sHeadRow = wsSmes.addRow([
    "SME ID",
    "SME Name",
    "Specialization & Group",
    "SME Standard Shift",
    ...currentWeekDates.map(d => `${d.day} Dedicated L&D Session Slot`),
    "Dedicated L&D Evaluation Slots (Used for Timetable)",
    "Faculty Training / Workshop Slots (Excluded from L&D)",
    "Head SME Status"
  ]);
  sHeadRow.height = 26;
  sHeadRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  sHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "4F46E5" } };
  sHeadRow.alignment = { vertical: "middle", horizontal: "center" };

  const totalSmeCols = 6 + currentWeekDates.length;

  relevantSmes.forEach((s: any) => {
    const dayDemoCols = currentWeekDates.map((w) => {
      const res = getSmeDaySlots(s.id, w.day, w.dateStr);
      return res.demoText;
    });

    const weekly = getSmeWeeklyOverview(s.id);

    const row = wsSmes.addRow([
      s.id,
      s.name,
      s.subject || s.head_subject_group || "General",
      "09:00 AM - 05:30 PM",
      ...dayDemoCols,
      weekly.demoSummary,
      weekly.trainingSummary,
      s.is_head_sme ? "YES (+50 Priority Score)" : "NO"
    ]);
    row.height = 22;
    for (let c = 1; c <= totalSmeCols; c++) {
      row.getCell(c).font = { name: "Arial", size: 9 };
      row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };
      if (c === totalSmeCols) {
        row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
        row.getCell(c).font = { name: "Arial", size: 9.5, bold: true };
      }
    }
  });

  const smeColWidths = [15, 28, 26, 24, ...currentWeekDates.map(() => 34), 48, 48, 20];
  smeColWidths.forEach((w, i) => { wsSmes.getColumn(i + 1).width = w; });

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET: Campus Day Orders across All Colleges
  // ─────────────────────────────────────────────────────────────────────────
  const wsDayOrders = workbook.addWorksheet("Campus_Day_Orders");
  const dHeadRow = wsDayOrders.addRow([
    "College / Campus Name",
    ...currentWeekDates.map(w => `${w.day} (${w.formatted || w.dateStr})`),
    "Timetable Status"
  ]);
  dHeadRow.height = 24;
  dHeadRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  dHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "374151" } };
  dHeadRow.alignment = { vertical: "middle", horizontal: "center" };

  applicableColleges.forEach(colObj => {
    const cStatus = getCollegeTimetableDayStatus(colObj.id);
    const dayOrderCols = currentWeekDates.map((w, idx) => {
      const info = getEffectiveDayOrderInfo(w.dateStr, w.day, idx, colObj.id);
      return info.isHoliday ? "Holiday" : info.dayOrder;
    });

    const row = wsDayOrders.addRow([
      colObj.name,
      ...dayOrderCols,
      cStatus.isReady ? "Timetable Ready" : "No Timetable"
    ]);
    row.height = 20;
    for (let c = 1; c <= 2 + currentWeekDates.length; c++) {
      row.getCell(c).font = { name: "Arial", size: 9.5 };
      row.getCell(c).border = { top: { style: 'thin', color: { argb: 'E2E8F0' } }, bottom: { style: 'thin', color: { argb: 'E2E8F0' } }, left: { style: 'thin', color: { argb: 'E2E8F0' } }, right: { style: 'thin', color: { argb: 'E2E8F0' } } };
    }
  });
  [32, ...currentWeekDates.map(() => 22), 24].forEach((w, i) => { wsDayOrders.getColumn(i + 1).width = w; });

  // ─────────────────────────────────────────────────────────────────────────
  // SHEET: System Reference Guide
  // ─────────────────────────────────────────────────────────────────────────
  const wsGuide = workbook.addWorksheet("System_Reference_Guide");
  const gHeadRow = wsGuide.addRow(["Category", "Configured System Values"]);
  gHeadRow.height = 24;
  gHeadRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } };
  gHeadRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "374151" } };

  const campusDayOrderSummary = applicableColleges.map(c => {
    const cOrders = (collegeDayRows[c.id] || []).map(({ info: d }) => (
      d.isHoliday
        ? `${d.weekdayName.slice(0, 3)} ${d.dateStr} = Holiday`
        : `${d.dayOrder} = ${d.weekdayName.slice(0, 3)} ${d.dateStr} (${d.periods} periods)`
    )).join(", ");
    return `${c.name}: [${cOrders}]`;
  }).join(" | ");

  const guideRows = [
    ["Scope", "All Applicable Colleges & Campuses"],
    ["Target Subject Group", targetGroup],
    ["Configured Admin Subject Groups", adminSubjectGroupNames.join(", ") || "All"],
    ["Active Week Date Range", `${currentWeekDates[0]?.dateStr || "Start"} to ${currentWeekDates[currentWeekDates.length - 1]?.dateStr || "End"}`],
    ["Campus Day Orders & Timetable Coverage", campusDayOrderSummary],
    ["Total Colleges Included", `${applicableColleges.length} colleges (${applicableColleges.map(c => c.name).join(", ")})`],
    ...(skippedColleges.length > 0
      ? [["Colleges Excluded (No Timetable)", `${skippedColleges.length} skipped: ${skippedColleges.map(c => c.name).join(", ")}. Generate their timetable in the CM Timetable console and re-download.`]]
      : []),
    ["Eligible Faculty Count", `${relevantMentors.length} active mentors`],
    ["Assigned SMEs Count", `${relevantSmes.length} assigned SMEs`],
    ["Allocation Engine Rules", "L&D sessions require: (1) Mentor is free from teaching and leave, (2) SME is free and within L&D evaluation window (Standard shift: 09:00 AM - 05:30 PM), (3) College is open (not a holiday), (4) the college timetable runs periods on that day."],
    ["Sheet Usage", "Fill out 'Master_LnD_Schedule' for bulk multi-college uploads, or use the single unified 'Master_Grid' tab (Day Order × Assigned SME, with SME demo evaluation time slots as columns, colour-banded per day order with header filters) for visual matrix entry. 'Mentor_Summary' reports how many sessions each mentor has been assigned."],
    ["Master_Grid Dropdowns", "Every fillable cell lists only the faculty genuinely free across all campuses who match the row's SME subject, on that Day Order, in that demo time slot, shown as 'Faculty Name (College Name)'. Mentors with classes, approved leave, or conflicting bookings have no option. Cells showing 'SME Unavailable (Training/Leave)' or 'No free faculty in this slot' have no dropdown and are ignored on import."]
  ];

  guideRows.forEach(r => {
    const row = wsGuide.addRow(r);
    row.height = 20;
    row.getCell(1).font = { name: "Arial", size: 9.5, bold: true };
    row.getCell(2).font = { name: "Arial", size: 9.5 };
    row.getCell(1).border = { top: { style: 'thin', color: { argb: 'E2E8F0' } }, bottom: { style: 'thin', color: { argb: 'E2E8F0' } }, left: { style: 'thin', color: { argb: 'E2E8F0' } }, right: { style: 'thin', color: { argb: 'E2E8F0' } } };
    row.getCell(2).border = { top: { style: 'thin', color: { argb: 'E2E8F0' } }, bottom: { style: 'thin', color: { argb: 'E2E8F0' } }, left: { style: 'thin', color: { argb: 'E2E8F0' } }, right: { style: 'thin', color: { argb: 'E2E8F0' } } };
  });
  wsGuide.getColumn(1).width = 30;
  wsGuide.getColumn(2).width = 85;


  return workbook;
}
