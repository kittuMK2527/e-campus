// The L&D Excel import reader.
//
// Turns an uploaded workbook back into allocation rows, validated by the same engine the grid and the
// template use so an imported row cannot disagree with the cell it came from. Hook-free on purpose:
// scratch/lnd_master_grid_shape.cjs slices this module and round-trips a generated workbook through it.

import {
  autoAssignSmes,
  facultyOnLeaveOn,
  mentorSlotAvailabilityAt,
  smeFreeAt,
  type LndSlotSnapshot
} from "./lndAllocationEngine";
import type { GridRow } from "./lndGridIndexes";
import { mapDayOrderToDayName } from "./utils";

export type LndImportContext = {
  /** The same snapshot the grid and the workbook builder read. */
  snap: LndSlotSnapshot;
  selectedGroupId: string;
  selectedDateStr: string;
};

export type LndImportOutcome =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "preview"; parsed: GridRow[]; warnings: string[]; validCount: number; targetSubjectGroup: string };

/** Grid rows are named by their date cell ("Day 3 - Monday (2026-10-26)"). Anything else on the sheet -
 *  the quota monitor block below the grid, or its title - must not read as a schedule row. */
export function isGridDayLabel(v: string): boolean {
  return Boolean(v) && (
    /\d{4}-\d{2}-\d{2}/.test(v) ||
    /^\s*(day\s*\d+|holiday)\b/i.test(v) ||
    /^\s*(sun|mon|tue|wed|thu|fri|sat)(day|nesday|rsday|urday)?\b/i.test(v)
  );
}

/** Case-insensitive, punctuation-tolerant column getter for flexible user Excel imports. */
function findRowValue(row: Record<string, any>, candidateKeys: string[], fallback: string = ""): string {
  if (!row || typeof row !== "object") return fallback;
  const normCandidates = candidateKeys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || v === null || String(v).trim() === "") continue;
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normCandidates.includes(cleanKey)) return String(v).trim();
  }
  return fallback;
}

/** Read a downloaded L&D template back into allocation rows. Never throws; reports through the outcome. */
export async function parseLndDemoWorkbook(binary: unknown, ctx: LndImportContext): Promise<LndImportOutcome> {
  const snap = ctx.snap;
  const { selectedDateStr } = ctx;
  const { weekDates: currentWeekDates, mentors, colleges, smes, selectedWeek } = ctx.snap;
  const currentCollegeName = ctx.snap.currentCollegeName;
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(binary, { type: "binary" });

    const warnings: string[] = [];
    const parsedSessions: any[] = [];
    const currentTargetGroup = ctx.selectedGroupId && ctx.selectedGroupId !== "All" ? ctx.selectedGroupId : "General";

    // Admin-created Subject Groups catalog from database
    const rawSubjectGroups = (snap.subjectGroups || []) as any[];
    const adminSubjectGroupNames: string[] = Array.from(new Set(
      rawSubjectGroups
        .map((sg: any) => (typeof sg === "string" ? sg : sg?.name))
        .filter((n: any): n is string => Boolean(n && n.trim()))
        .map((n: string) => n.trim())
    ));

    // Detect if template was generated for a specific Subject Group via System_Reference_Guide
    let fileTargetGroup = currentTargetGroup;
    if (wb.SheetNames.includes("System_Reference_Guide")) {
      try {
        const gWs = wb.Sheets["System_Reference_Guide"];
        const gRows: any[] = XLSX.utils.sheet_to_json(gWs, { header: 1 });
        gRows.forEach(row => {
          if (Array.isArray(row) && (row[0] === "Target Subject Group" || row[0] === "Target Mentor Group")) {
            const val = String(row[1] || "").trim();
            if (val && val.toLowerCase() !== "all") fileTargetGroup = val;
          }
        });
      } catch (e) {
        // Ignore reference guide parse issues
      }
    }

    // Day of week / Day Order to dateStr mapping helper
    const dayToDateMap: Record<string, string> = {};
    currentWeekDates.forEach((w, wIdx) => {
      const dLower = w.day.toLowerCase().trim();
      dayToDateMap[dLower] = w.dateStr;
      dayToDateMap[dLower.slice(0, 3)] = w.dateStr;
      dayToDateMap[`day ${wIdx + 1}`] = w.dateStr;
      dayToDateMap[`day${wIdx + 1}`] = w.dateStr;
      dayToDateMap[`day_${wIdx + 1}`] = w.dateStr;
    });

    const normalizedRows: any[] = [];

    // Smart Sheet Selection: If Master_Grid has allocations, prioritize it; otherwise check Master_LnD_Schedule
    let targetSheets: string[] = [];
    if (wb.SheetNames.includes("Master_Grid")) {
      const testWs = wb.Sheets["Master_Grid"];
      const testRows: any[] = XLSX.utils.sheet_to_json(testWs, { defval: "" });
      const hasAllocations = testRows.some(row => {
        if (!isGridDayLabel(String(row["Day Order / Date"] || row["Day Order / Period"] || row["Day / Period"] || row["Day/Period"] || row["Day Order"] || "").trim())) return false;
        return Object.entries(row).some(([colKey, cellVal]) => {
          if (colKey === "College / Campus" || colKey === "Assigned SME" || colKey === "Department / Subject Group" || colKey === "Day Order / Date") return false;
          const v = String(cellVal || "").toLowerCase().trim();
          return v && !v.includes("no free") && !v.includes("training") && !v.includes("leave") && !v.includes("holiday") && !v.includes("off-duty");
        });
      });
      if (hasAllocations) {
        targetSheets = ["Master_Grid"];
      }
    }

    if (targetSheets.length === 0) {
      if (wb.SheetNames.includes("Master_LnD_Schedule")) {
        targetSheets = ["Master_LnD_Schedule"];
      } else {
        targetSheets = wb.SheetNames.filter(s =>
          !["Eligible_Mentors", "Assigned_SMEs", "Campus_Day_Orders", "System_Reference_Guide", "Free_Periods_Ref", "Mentor_Summary"].includes(s)
        );
      }
    }

    // Parse prioritized sheets
    targetSheets.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rawRows.length === 0) return;

      let sheetCollegeName = "";
      if (sheetName.startsWith("Grid_")) {
        sheetCollegeName = sheetName.replace("Grid_", "").replace(/_/g, " ");
      }

      rawRows.forEach((row, rIdx) => {
        const matrixDay = String(row["Day Order / Date"] || row["Day Order / Period"] || row["Day / Period"] || row["Day/Period"] || row["Day Order"] || "").trim();
        const isMatrix = Boolean(matrixDay) && Object.keys(row).some(k => k.toLowerCase().includes("slot") || k.toLowerCase().includes("period") || k.includes("AM") || k.includes("PM") || k.includes("-"));
        // Header/label columns never hold an allocation — only treat a row as a schedule
        // row when its day cell really names a day of the week or a date.
        const looksLikeScheduleRow = isGridDayLabel(matrixDay);

        if (isMatrix && looksLikeScheduleRow) {
          const matrixCollege = String(row["College / Campus"] || "").trim();
          const matrixSme = String(row["Assigned SME"] || row["SME"] || row["Evaluator"] || "").trim();
          const matrixSubject = String(row["Department / Subject Group"] || row["Subject Group"] || row["Subject"] || currentTargetGroup).trim();

          Object.entries(row).forEach(([colKey, cellVal]) => {
            if (colKey === "College / Campus" || colKey === "Assigned SME" || colKey === "Department / Subject Group" || colKey === "Subject Group" || colKey === "Subject") return;
            if (colKey === "Day Order / Date" || colKey === "Day Order / Period" || colKey === "Day / Period" || colKey === "Day/Period" || colKey === "Day Order" || colKey === "Day") return;
            const valStr = String(cellVal || "").trim();
            if (!valStr) return;
            const lowerVal = valStr.toLowerCase();
            if (lowerVal.includes("holiday") || lowerVal.includes("no mentors") ||
              lowerVal.includes("no timetable") || lowerVal.includes("not a period") ||
              lowerVal.includes("no free faculty") || lowerVal.includes("unavailable") ||
              lowerVal.includes("training") || lowerVal.includes("leave") ||
              lowerVal.includes("off-duty") || lowerVal.includes("off duty") ||
              lowerVal.includes("booked")) return;

            let parsedMentorName = valStr;
            let parsedSmeName = matrixSme;
            let parsedCollege = matrixCollege;

            const smeMatch = valStr.match(/\[(?:SME:\s*)?([^\]]+)\]/i);
            if (smeMatch) {
              parsedSmeName = smeMatch[1].trim();
              parsedMentorName = valStr.replace(smeMatch[0], "").trim();
            }

            const colMatch = parsedMentorName.match(/\(([^)]+)\)$/);
            if (colMatch) {
              parsedCollege = colMatch[1].trim();
              parsedMentorName = parsedMentorName.replace(/\s*\([^)]+\)$/, "").trim();
            } else {
              parsedMentorName = parsedMentorName.replace(/\s*\([^)]+\)$/, "").trim();
            }

            let cleanSlot = colKey.trim();
            const periodTimeMatch = colKey.match(/\(([^)]+)\)/);
            if (periodTimeMatch) {
              cleanSlot = periodTimeMatch[1].trim();
            }

            normalizedRows.push({
              rawCollege: parsedCollege || sheetCollegeName,
              rawDay: matrixDay,
              rawTime: cleanSlot,
              rawMentor: parsedMentorName,
              rawSme: parsedSmeName,
              rawSubject: matrixSubject,
              rawStream: "General Stream",
              rawWeek: selectedWeek || 1,
              sheetName,
              rowNum: rIdx + 2
            });
          });
        } else {
          const rawCollege = findRowValue(row, ["College / Campus", "College", "Campus", "College Name", "Campus Name", "Institution"], sheetCollegeName || "");
          const rawDay = findRowValue(row, ["Day / Date", "Day of Week", "Day", "Day Order", "Date", "Day Date", "Weekday"]);
          const rawTime = findRowValue(row, ["Time Slot / Period", "Time Slot", "Time", "Period", "Slot", "Timing", "TimeSlot", "Hours", "Period / Time"]);
          const rawMentor = findRowValue(row, ["Faculty / Mentor", "Faculty", "Mentor", "Faculty Name", "Mentor Name", "Staff Name", "Trainer", "Teacher", "Staff"]);
          const rawSme = findRowValue(row, ["Assigned SME (Optional)", "Assigned SME", "SME", "SME Name", "Evaluator", "Evaluator Name", "Assigned Evaluator"]);
          const rawSubject = findRowValue(row, ["Department / Subject Group", "Department / Group", "Subject Group", "Subject", "Department", "Course", "Track"], currentTargetGroup);
          const rawStream = findRowValue(row, ["Class Cohort / Stream", "Class Cohort", "Class Group", "Stream", "Cohort", "Batch", "Section", "Class"]);
          const rawWeekVal = findRowValue(row, ["Week Number", "Week", "Week No", "Week #"]);
          const rawWeek = parseInt(rawWeekVal || String(selectedWeek || "1"), 10) || selectedWeek || 1;

          const isUnavailabilityNote = /no free period|no free faculty|no timetable/i.test(rawDay) || /no free period|no free faculty|no timetable/i.test(rawTime);

          if ((rawDay || rawMentor || rawSme) && rawTime && !isUnavailabilityNote) {
            normalizedRows.push({
              rawCollege,
              rawDay,
              rawTime,
              rawMentor,
              rawSme,
              rawSubject,
              rawStream,
              rawWeek,
              sheetName,
              rowNum: rIdx + 2
            });
          } else if ((rawMentor || rawDay) && !rawTime && !isUnavailabilityNote) {
            warnings.push(`[${sheetName}] Row ${rIdx + 2}: Skipped row for '${rawMentor || "entry"}' because time slot/period column could not be detected.`);
          }
        }
      });
    });

    if (normalizedRows.length === 0) {
      return { kind: "empty" };
    }

    normalizedRows.forEach((item) => {
      const { rawCollege, rawDay, rawTime, rawMentor, rawSme, rawSubject, rawStream, rawWeek, sheetName, rowNum } = item;

      if (!rawDay && !rawMentor && !rawSme) return;

      // Convert Day of Week / Day Order to dateStr
      let targetDateStr = "";
      const dateMatch = rawDay.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const ddmmyyyyMatch = rawDay.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);

      if (dateMatch) {
        targetDateStr = dateMatch[1];
      } else if (ddmmyyyyMatch) {
        const day = ddmmyyyyMatch[1].padStart(2, "0");
        const month = ddmmyyyyMatch[2].padStart(2, "0");
        const year = ddmmyyyyMatch[3];
        targetDateStr = `${year}-${month}-${day}`;
      } else if (!isNaN(Number(rawDay)) && Number(rawDay) > 30000 && Number(rawDay) < 65000) {
        // Excel serial date number
        const serial = Number(rawDay);
        const utcDays = Math.floor(serial - 25569);
        const dateInfo = new Date(utcDays * 86400 * 1000);
        const year = dateInfo.getUTCFullYear();
        const month = String(dateInfo.getUTCMonth() + 1).padStart(2, "0");
        const day = String(dateInfo.getUTCDate()).padStart(2, "0");
        targetDateStr = `${year}-${month}-${day}`;
      } else {
        const lowerDay = rawDay.toLowerCase().trim();
        const resolvedDay = (mapDayOrderToDayName(rawDay, "") || "").toLowerCase().trim();

        if (dayToDateMap[lowerDay]) {
          targetDateStr = dayToDateMap[lowerDay];
        } else if (resolvedDay && dayToDateMap[resolvedDay]) {
          targetDateStr = dayToDateMap[resolvedDay];
        } else {
          const cleanKey = resolvedDay || lowerDay;
          const matchedDateObj = currentWeekDates.find(w => w.day.toLowerCase().startsWith(cleanKey.slice(0, 3)));
          if (matchedDateObj) {
            targetDateStr = matchedDateObj.dateStr;
          } else {
            targetDateStr = currentWeekDates[0]?.dateStr || selectedDateStr;
            warnings.push(`[${sheetName}] Row ${rowNum}: Could not map day '${rawDay}' — defaulting to ${currentWeekDates[0]?.day || "Monday"}.`);
          }
        }
      }

      // Match Mentor (with stripped department / college brackets & fuzzy match)
      const cleanMentorName = rawMentor.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
      let matchedMentor = cleanMentorName ? mentors.find(m => {
        const mName = (m.name || "").toLowerCase().trim();
        const mEmail = (m.email || "").toLowerCase().trim();
        const mId = (m.id || "").toLowerCase().trim();
        if (mName === cleanMentorName || mEmail === cleanMentorName || mId === cleanMentorName) return true;
        if (cleanMentorName.includes(mName) || mName.includes(cleanMentorName)) return true;
        return false;
      }) : undefined;

      if (!matchedMentor && rawMentor) {
        matchedMentor = mentors.find(m => m.name.toLowerCase().includes(cleanMentorName));
      }

      if (!matchedMentor) {
        warnings.push(`[${sheetName}] Row ${rowNum}: Mentor '${rawMentor}' not found in database.`);
      }

      const mentorCollege = matchedMentor ? colleges.find(c => c.id === matchedMentor.college_id) : null;
      const collegeName = mentorCollege?.name || rawCollege || currentCollegeName || "College";

      // Match SME (with stripped department / bracket info e.g. "Vidhya (CS)" -> "Vidhya")
      const cleanSmeName = rawSme.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
      let matchedSme = cleanSmeName ? smes.find(s => {
        const sName = (s.name || "").toLowerCase().trim();
        const sEmail = (s.email || "").toLowerCase().trim();
        const sId = (s.id || "").toLowerCase().trim();
        return sName === cleanSmeName || sEmail === cleanSmeName || sId === cleanSmeName ||
               cleanSmeName.includes(sName) || sName.includes(cleanSmeName);
      }) : undefined;

      if (!matchedSme && cleanSmeName) {
        matchedSme = smes.find(s => (s.name || "").toLowerCase().includes(cleanSmeName) || cleanSmeName.includes((s.name || "").toLowerCase()));
      }

      // Normalize subject against official Admin-created Subject Groups
      let normalizedSubject = rawSubject;
      if (adminSubjectGroupNames.length > 0) {
        const matched = adminSubjectGroupNames.find(
          ag => ag.toLowerCase().trim() === (rawSubject || "").toLowerCase().trim()
        );
        if (matched) {
          normalizedSubject = matched;
        } else if (fileTargetGroup && fileTargetGroup !== "General") {
          const matchedFile = adminSubjectGroupNames.find(
            ag => ag.toLowerCase().trim() === fileTargetGroup.toLowerCase().trim()
          );
          if (matchedFile) normalizedSubject = matchedFile;
        }
      }
      const finalSubject = normalizedSubject || fileTargetGroup || currentTargetGroup;

      // If SME is not specified in Excel, run Auto-Scheduler Rule Engine for this slot
      if (!matchedSme && matchedMentor && targetDateStr && rawTime) {
        const singleSlotRuleCheck = autoAssignSmes(snap, [{
          mentorId: matchedMentor.id,
          mentorName: matchedMentor.name,
          collegeName,
          dateStr: targetDateStr,
          timeSlot: rawTime,
          subject: finalSubject,
          stream: rawStream || "General Stream",
          week: rawWeek
        }], parsedSessions);

        if (singleSlotRuleCheck.generated.length > 0) {
          const assigned = singleSlotRuleCheck.generated[0];
          matchedSme = smes.find(s => s.id === assigned.smeId);
        }
      }

      if (!matchedSme) {
        warnings.push(`[${sheetName}] Row ${rowNum}: Could not auto-assign SME for '${finalSubject}' at ${rawTime} on ${targetDateStr}.`);
      }

      // Strict validation via evaluateMentorSlotAvailability engine
      const conflictReasons: string[] = [];

      if (matchedMentor && targetDateStr && rawTime) {
        const slotEval = mentorSlotAvailabilityAt(snap,
          matchedMentor.id,
          targetDateStr,
          rawTime,
          matchedMentor.college_id,
          parsedSessions
        );

        if (slotEval.status === "blocked") {
          conflictReasons.push(`${matchedMentor.name}: ${slotEval.label} (${slotEval.details})`);
        } else if (slotEval.status === "occupied") {
          conflictReasons.push(`Mentor ${matchedMentor.name} is teaching: ${slotEval.label} (${slotEval.details})`);
        } else if (slotEval.status === "demo") {
          conflictReasons.push(`Mentor ${matchedMentor.name} already has L&D session: ${slotEval.label}`);
        }

        if (matchedSme) {
          if (facultyOnLeaveOn(snap.facultyLeaves, matchedSme.id, targetDateStr)) {
            conflictReasons.push(`SME ${matchedSme.name} is on approved faculty leave.`);
          }
          if (!smeFreeAt(snap, matchedSme.id, targetDateStr, rawTime, parsedSessions)) {
            conflictReasons.push(`SME ${matchedSme.name} is not available at ${rawTime}.`);
          }
        }
      }

      const hasConflict = conflictReasons.length > 0;
      const conflictReason = conflictReasons.join(" | ");

      if (hasConflict) {
        warnings.push(`[${sheetName}] Row ${rowNum}: ${conflictReason}`);
      }

      parsedSessions.push({
        rowNum,
        dayName: rawDay || "Monday",
        dateStr: targetDateStr,
        timeSlot: rawTime || "08:30 AM",
        mentorId: matchedMentor ? matchedMentor.id : "",
        mentorName: matchedMentor ? matchedMentor.name : (rawMentor || "Unknown Mentor"),
        collegeName,
        smeId: matchedSme ? matchedSme.id : "",
        smeName: matchedSme ? matchedSme.name : "Unassigned SME",
        subject: finalSubject,
        stream: rawStream || "General Stream",
        week: rawWeek,
        isValid: !!matchedMentor && !!matchedSme && !hasConflict,
        conflictReason
      });
    });

    const validCount = parsedSessions.filter(p => p.isValid).length;
    const resolvedTargetGroup = (fileTargetGroup && fileTargetGroup !== "All" && fileTargetGroup !== "General")
      ? fileTargetGroup
      : (parsedSessions.length > 0 && parsedSessions[0].subject && parsedSessions[0].subject !== "General"
          ? parsedSessions[0].subject
          : currentTargetGroup);

    return { kind: "preview", parsed: parsedSessions, warnings, validCount, targetSubjectGroup: resolvedTargetGroup };
  } catch (err: any) {
    return { kind: "error", message: err.message };
  }
}
