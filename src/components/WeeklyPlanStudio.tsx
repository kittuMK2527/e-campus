"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  CalendarRange,
  Calendar,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  FileText,
  User,
  Building2,
  Plus,
  Trash2,
  Save,
  Send,
  Download,
  Upload,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Eye,
  Check,
  X,
  MessageSquare,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Edit2,
  TrendingUp,
  Award,
  BarChart3,
  HelpCircle,
  ArrowRight,
  Info,
  CheckCircle,
  XCircle,
  Clock3,
  SlidersHorizontal,
  CalendarDays
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/context/ToastContext";
import { useApp } from "@/context/AppContext";
import { getCollegePeriodTimeSlots, isSubjectNameMatch, isCohortMatching, isSkillSubject } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

export interface DailySessionTask {
  day: string;
  dayOrder?: string;
  /** "cam" = assigned via CAM daily config. Undefined when CAM has NOT set one — the UI then shows nothing. */
  dayOrderSource?: "cam";
  date?: string;
  periodSlot?: string;
  topic: string;
  objectives: string;
  teachingMode: "Theory" | "Lab / Practical" | "Hands-on Coding" | "Project Work" | "Assessment / Quiz" | "Revision";
  materialUrl?: string;
  status: "Planned" | "Completed" | "Rescheduled";
  conductedStatus?: "Completed" | "Pending";
  matchedTracker?: any;
}

export interface WeeklyPlanRecord {
  id: string;
  college_id: string;
  mentor_id: string;
  mentor_name?: string;
  department?: string;
  subject: string;
  class_group: string;
  week_number: number;
  start_date?: string;
  end_date?: string;
  unit?: string;
  topics_planned?: string;
  session_plan: string | DailySessionTask[];
  learning_objectives?: string;
  teaching_mode?: string;
  material_url?: string;
  status: "Draft" | "Submitted" | "Verified" | "Needs Revision";
  cam_feedback?: string;
  sme_remarks?: string;
  verified_by?: string;
  verified_at?: string;
  created_at?: string;
  updated_at?: string;
  /** Mentor Skill Development Tracker enrichment from /api/weekly-plan GET */
  subject_type?: "Skill" | "Academic";
  skill_verdict?: {
    verdict: "pending" | "cleared" | "not_cleared" | "needs_revision";
    score: number | null;
    remarks: string | null;
    verified_by: string | null;
    verified_at: string | null;
  };
}

export interface WeeklyPlanAuditSummary {
  totalPlans: number;
  totalPlannedTopics: number;
  completedPlannedTopics: number;
  pendingPlannedTopics: number;
  completionPercentage: number;
  smeStatusBreakdown: {
    verified: number;
    submitted: number;
    needsRevision: number;
    draft: number;
  };
  demos?: {
    total: number;
    completed: number;
    pending: number;
    list?: any[];
  };
  conductedTrackerCount?: number;
}

export const TEACHING_MODES = [
  "Theory",
  "Lab / Practical",
  "Hands-on Coding",
  "Project Work",
  "Assessment / Quiz",
  "Revision"
] as const;

export const DAY_ORDER_OPTIONS = [
  "Day 1",
  "Day 2",
  "Day 3",
  "Day 4",
  "Day 5",
  "Day 6"
];

// Helper: Normalize Excel Date serials, slash, or dash strings to YYYY-MM-DD
export function parseExcelDate(val: any): string {
  if (!val) return "";
  if (typeof val === "number") {
    // Excel date serial number to JS Date
    const jsDate = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString().split("T")[0];
    }
  }
  const s = String(val).trim();
  // Check if DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  // Check if YYYY-MM-DD
  const ymdMatch = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, "0");
    const d = ymdMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return s;
}

// Helper: Fuzzy normalize Teaching Mode
export function normalizeTeachingMode(val: any): "Theory" | "Lab / Practical" | "Hands-on Coding" | "Project Work" | "Assessment / Quiz" | "Revision" {
  const s = String(val || "").toLowerCase();
  if (s.includes("lab") || s.includes("practical")) return "Lab / Practical";
  if (s.includes("coding") || s.includes("hands")) return "Hands-on Coding";
  if (s.includes("quiz") || s.includes("test") || s.includes("assess")) return "Assessment / Quiz";
  if (s.includes("project")) return "Project Work";
  if (s.includes("revision")) return "Revision";
  return "Theory";
}

// Helper: Compute calendar date for a given day offset from start date
export function getDateForDay(dayName: string, startDateStr?: string): string {
  if (!startDateStr) return "";
  try {
    const base = new Date(startDateStr + "T00:00:00");
    if (isNaN(base.getTime())) return "";

    const baseDow = base.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
    };
    const targetDow = dayMap[dayName];
    if (targetDow === undefined) return startDateStr;

    let offset = targetDow - baseDow;
    if (offset < 0) {
      offset += 7;
    }
    const target = new Date(base);
    target.setDate(base.getDate() + offset);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    const d = String(target.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "";
  }
}

// Helper: Map Day Order (Day 1..6) to weekday name
export function getMappedDayFromDayOrder(dayOrder: string, defaultDay: string): string {
  if (!dayOrder) return defaultDay;
  const match = dayOrder.match(/^Day (\d+)$/i);
  if (match) {
    const orderNum = parseInt(match[1], 10);
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (orderNum >= 1 && orderNum <= dayNames.length) {
      return dayNames[orderNum - 1];
    }
  }
  return defaultDay;
}

// Helper: Get Monday date string (YYYY-MM-DD) of the current week (or base date)
export function getMondayOfCurrentWeek(baseDateStr?: string): string {
  const base = baseDateStr ? new Date(baseDateStr + "T00:00:00") : new Date();
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (dow === 0 ? 6 : dow - 1));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Helper: Auto-calculate week Monday & Saturday dates for Week N (standalone helper)
export function computeWeekWindow(weekNumber: number, baseDateStr?: string, workingDays: number = 6) {
  const base = baseDateStr ? new Date(baseDateStr + "T00:00:00") : new Date();
  const dow = base.getDay();
  const currentMonday = new Date(base);
  currentMonday.setDate(base.getDate() - (dow === 0 ? 6 : dow - 1));

  // Offset by academic week difference (assuming Week 1 starts around base)
  const targetMonday = new Date(currentMonday);
  targetMonday.setDate(currentMonday.getDate() + (weekNumber - 1) * 7);

  const targetEnd = new Date(targetMonday);
  targetEnd.setDate(targetMonday.getDate() + (workingDays === 6 ? 5 : 4));

  const format = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return {
    start: format(targetMonday),
    end: format(targetEnd)
  };
}

// Helper: Auto-compute End Date from Start Date based on working days count
export function computeEndDateFromStart(startDateStr: string, workingDays: number = 6): string {
  if (!startDateStr) return "";
  try {
    const base = new Date(startDateStr + "T00:00:00");
    if (isNaN(base.getTime())) return "";
    const daysToAdd = Math.max(0, (workingDays || 6) - 1);
    const end = new Date(base);
    end.setDate(base.getDate() + daysToAdd);
    const y = end.getFullYear();
    const m = String(end.getMonth() + 1).padStart(2, "0");
    const d = String(end.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "";
  }
}

// Helper to parse session plan
export function parseSessionPlan(raw: string | DailySessionTask[] | undefined): DailySessionTask[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* =========================================================================
   1. MENTOR WEEKLY PLAN STUDIO (Spreadsheet-Grade Teaching Period Roadmap)
   ========================================================================= */

export interface MentorWeeklyPlanStudioProps {
  mentorId: string;
  mentorName: string;
  collegeId?: string;
  collegeName?: string;
  department?: string;
  assignedClasses?: string[];
  assignedSubjects?: string[];
}

export const MentorWeeklyPlanStudio: React.FC<MentorWeeklyPlanStudioProps> = ({
  mentorId,
  mentorName,
  collegeId,
  collegeName,
  department,
  assignedClasses = [],
  assignedSubjects = []
}) => {
  const { toast } = useToast();
  const { colleges, slots, timeSlots: ctxTimeSlots, daysOfWeek: ctxDaysOfWeek, subjectsList } = useApp();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const studioTopRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [dailyConfigsMap, setDailyConfigsMap] = useState<Map<string, any>>(new Map());
  const [dailyConfigsLoaded, setDailyConfigsLoaded] = useState(false);
  const isDirtyRef = useRef(false);
  const lastPlanAutoSelectRef = useRef("");

  // Selection state — sequential week purely based on submission history (1, 2, 3...)
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedClass, setSelectedClass] = useState<string>(assignedClasses[0] || "Default Cohort");
  const [selectedSubject, setSelectedSubject] = useState<string>(assignedSubjects[0] || "General Subject");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [customDatesOverride, setCustomDatesOverride] = useState<boolean>(false);
  const [unitName, setUnitName] = useState<string>("Unit 1");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showDateModal, setShowDateModal] = useState<boolean>(false);
  const [planUpdatedAt, setPlanUpdatedAt] = useState<string>("");
  const [archiveFilterScope, setArchiveFilterScope] = useState<"current" | "all">("current");
  const [archiveSearch, setArchiveSearch] = useState<string>("");

  // Dynamically resolve college working days and period slots from system configuration
  const activeCollege = useMemo(() => colleges.find(c => c.id === collegeId), [colleges, collegeId]);
  const workingDaysCount = activeCollege?.working_days !== undefined ? Number(activeCollege.working_days) : 6;

  const availableDays = useMemo(() => {
    if (ctxDaysOfWeek && ctxDaysOfWeek.length > 0) {
      return ctxDaysOfWeek.slice(0, workingDaysCount);
    }
    return workingDaysCount === 5
      ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  }, [ctxDaysOfWeek, workingDaysCount]);

  const resolvedPeriodSlots = useMemo(() => {
    const dynamicSlots = getCollegePeriodTimeSlots(collegeId, colleges, slots);
    if (dynamicSlots && dynamicSlots.length > 0) return dynamicSlots;
    if (ctxTimeSlots && ctxTimeSlots.length > 0) return ctxTimeSlots;
    return [
      "Period 1 (08:30 - 09:25)",
      "Period 2 (09:25 - 10:20)",
      "Period 3 (10:40 - 11:35)",
      "Period 4 (11:35 - 12:30)",
      "Period 5 (01:25 - 02:20)",
      "Period 6 (02:20 - 03:15)"
    ];
  }, [collegeId, colleges, slots, ctxTimeSlots]);

  // Daily Tasks state
  const [dailyTasks, setDailyTasks] = useState<DailySessionTask[]>([]);

  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<"Draft" | "Submitted" | "Verified" | "Needs Revision">("Draft");
  const [currentFeedback, setCurrentFeedback] = useState<string>("");
  const [verifiedBy, setVerifiedBy] = useState<string>("");
  const [verifiedAt, setVerifiedAt] = useState<string>("");

  // Cached weekly plans for this mentor (shared with the CM/SME viewer below).
  const plansQuery = useQuery({
    queryKey: qk.weeklyPlan(collegeId || "all", mentorId),
    enabled: !!collegeId && !!mentorId,
    queryFn: async () => {
      const data = await apiFetch(
        `/api/weekly-plan?collegeId=${encodeURIComponent(collegeId as string)}&mentorId=${encodeURIComponent(mentorId)}&includeAudit=true`
      );
      return data?.success && Array.isArray(data.plans) ? (data.plans as WeeklyPlanRecord[]) : [];
    },
  });
  const plans = plansQuery.data || [];
  const loading = plansQuery.isFetching;
  const plansLoaded = plansQuery.isSuccess;

  // Real-time synchronization: invalidate instead of refetching on every focus.
  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-plan"] });
    };

    window.addEventListener("fp_weekly_plan_updated", handleSync);

    return () => {
      window.removeEventListener("fp_weekly_plan_updated", handleSync);
    };
  }, [queryClient]);

  // All plans for currently selected cohort + subject
  const matchingPlans = useMemo(() => {
    return plans
      .filter(p => {
        const classMatch = !selectedClass || selectedClass === "Default Cohort" || selectedClass === "All Classes" ||
          p.class_group.toLowerCase().trim() === selectedClass.toLowerCase().trim() ||
          isCohortMatching(p.class_group, selectedClass);
        const subjectMatch = !selectedSubject || selectedSubject === "General Subject" || selectedSubject === "All Subjects" ||
          p.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim() ||
          isSubjectNameMatch(p.subject, selectedSubject);
        return classMatch && subjectMatch;
      })
      .sort((a, b) => a.week_number - b.week_number);
  }, [plans, selectedClass, selectedSubject]);

  // Max week number and next sequential week
  const maxExistingWeek = useMemo(() => {
    return matchingPlans.length > 0 ? Math.max(...matchingPlans.map(p => p.week_number)) : 0;
  }, [matchingPlans]);

  const nextSequentialWeek = useMemo(() => {
    return maxExistingWeek + 1;
  }, [maxExistingWeek]);

  // Fetch daily configs (CAM Day Orders and Holidays) - Normalizes both dateStr & datestr
  useEffect(() => {
    if (!collegeId) return;
    apiFetch(`/api/daily-configs?college_id=${encodeURIComponent(collegeId)}`)
      .then(data => {
        if (data.success && Array.isArray(data.configs)) {
          const map = new Map<string, any>();
          data.configs.forEach((c: any) => {
            const dStr = c.dateStr || c.datestr;
            if (dStr) {
              map.set(dStr, {
                ...c,
                dateStr: dStr,
                day_order: c.day_order || c.dayorder || "None",
                day_type: c.day_type || c.daytype || "working"
              });
            }
          });
          setDailyConfigsMap(map);
        }
      })
      .catch(e => console.warn("Could not load daily configs:", e))
      .finally(() => setDailyConfigsLoaded(true));
  }, [collegeId]);

  // Helper to resolve Day Order for a date. Returns an EMPTY order when the
  // CAM has not assigned one for that date — we must NOT auto-generate a
  // fallback "Day N" value; only show what CAM actually set.
  const resolveDayOrderDetailed = useCallback((dateStr: string, dayName: string): { order: string; source: "cam" | "none" } => {
    if (dateStr && dailyConfigsMap.has(dateStr)) {
      const cfg = dailyConfigsMap.get(dateStr);
      const dOrder = cfg?.day_order || cfg?.dayorder;
      if (dOrder && dOrder !== "None") {
        return { order: dOrder, source: "cam" };
      }
    }
    return { order: "", source: "none" };
  }, [dailyConfigsMap]);

  // 1. Helper to build default tasks for each working day in the week
  const buildDefaultTasksForWeek = useCallback((customStartDate?: string): DailySessionTask[] => {
    const mondayStr = customStartDate || startDate || getMondayOfCurrentWeek();
    const newTasks: DailySessionTask[] = [];

    availableDays.forEach((dayName) => {
      const dateStr = getDateForDay(dayName, mondayStr);
      const dailyCfg = dailyConfigsMap.get(dateStr);
      const isHoliday = dailyCfg?.day_type === "holiday" || dailyCfg?.daytype === "holiday";
      const resolved = resolveDayOrderDetailed(dateStr, dayName);
      const rawDayOrder = resolved.order;
      const dayOrderSource = resolved.source === "cam" ? "cam" as const : undefined;

      if (isHoliday) {
        newTasks.push({
          day: dayName,
          dayOrder: "None / Holiday",
          dayOrderSource: "cam",
          date: dateStr,
          periodSlot: "Holiday",
          topic: "Campus Holiday (No Sessions)",
          objectives: "Holiday observed as per CM schedule",
          teachingMode: "Theory",
          materialUrl: "",
          status: "Planned"
        });
        return;
      }

      if (dayOrderSource !== "cam") {
        return; // Skip if Day Order is not set by CAM
      }

      // Map Day Order to timetable schedule day (e.g. Day 1 -> Monday)
      const mappedTimetableDay = getMappedDayFromDayOrder(rawDayOrder, dayName);

      // Find mentor slots for this mapped Day Order
      const daySlots = (slots || []).filter(s => {
        if (s.mentorId !== mentorId && (s as any).mentor_id !== mentorId) return false;
        if (collegeId && s.college_id && s.college_id !== collegeId) return false;
        return s.day === mappedTimetableDay;
      });

      // Filter by subject/class if specified (with fuzzy matching support)
      const matchingSubjectSlots = daySlots.filter(s => {
        const slotCourse = s.course || (s as any).subject || "";
        const slotClass = s.classGroup || (s as any).class_group || "";

        const matchesSubject = !selectedSubject ||
          selectedSubject === "General Subject" ||
          selectedSubject === "All Subjects" ||
          slotCourse.toLowerCase().trim() === selectedSubject.toLowerCase().trim() ||
          isSubjectNameMatch(slotCourse, selectedSubject);

        const matchesClass = !selectedClass ||
          selectedClass === "Default Cohort" ||
          selectedClass === "All Classes" ||
          slotClass.toLowerCase().trim() === selectedClass.toLowerCase().trim() ||
          isCohortMatching(slotClass, selectedClass);

        return matchesSubject && matchesClass;
      });

      const slotsToUse = matchingSubjectSlots.length > 0 ? matchingSubjectSlots : (
        (!selectedSubject || selectedSubject === "General Subject" || selectedSubject === "All Subjects") &&
        (!selectedClass || selectedClass === "Default Cohort" || selectedClass === "All Classes")
          ? daySlots
          : []
      );

      if (slotsToUse.length > 0) {
        slotsToUse.forEach((slot, sIdx) => {
          newTasks.push({
            day: dayName,
            dayOrder: rawDayOrder || undefined,
            dayOrderSource,
            date: dateStr,
            periodSlot: slot.time || resolvedPeriodSlots[sIdx % resolvedPeriodSlots.length] || `Period ${sIdx + 1}`,
            topic: "",
            objectives: "",
            teachingMode: "Theory",
            materialUrl: "",
            status: "Planned"
          });
        });
      }
    });

    return newTasks;
  }, [availableDays, resolvedPeriodSlots, resolveDayOrderDetailed, startDate, slots, mentorId, collegeId, selectedSubject, selectedClass, dailyConfigsMap]);

  const generateDefaultTasksForWeek = useCallback((customStartDate?: string) => {
    setDailyTasks(buildDefaultTasksForWeek(customStartDate));
  }, [buildDefaultTasksForWeek]);

  // 2. Load plan for a specific week number, cohort, and subject
  const loadPlanForWeek = useCallback((
    targetWeek: number,
    targetClass?: string,
    targetSubject?: string,
    plansList?: WeeklyPlanRecord[]
  ) => {
    const cls = targetClass ?? selectedClass;
    const subj = targetSubject ?? selectedSubject;
    const currentPlans = plansList ?? plans;

    const match = currentPlans.find(
      p =>
        p.week_number === targetWeek &&
        (!cls || cls === "Default Cohort" || cls === "All Classes" || p.class_group.toLowerCase().trim() === cls.toLowerCase().trim() || isCohortMatching(p.class_group, cls)) &&
        (!subj || subj === "General Subject" || subj === "All Subjects" || p.subject.toLowerCase().trim() === subj.toLowerCase().trim() || isSubjectNameMatch(p.subject, subj))
    );

    if (match) {
      setCurrentPlanId(match.id);
      setCurrentStatus(match.status);
      setCurrentFeedback(match.sme_remarks || match.cam_feedback || "");
      setVerifiedBy(match.verified_by || "");
      setVerifiedAt(match.verified_at || "");
      setPlanUpdatedAt(match.updated_at || match.created_at || "");
      setStartDate(match.start_date || "");
      setEndDate(match.end_date || (match.start_date ? computeEndDateFromStart(match.start_date, workingDaysCount) : ""));
      setUnitName(match.unit || `Unit ${Math.min(5, Math.ceil(targetWeek / 3))}`);

      const loadedTasks = parseSessionPlan(match.session_plan);
      if (loadedTasks.length > 0) {
        setDailyTasks(
          loadedTasks.map(t => {
            const date = t.date || getDateForDay(t.day, match.start_date);
            const resolved = resolveDayOrderDetailed(date, t.day);
            const isCamFromConfig = resolved.source === "cam" && resolved.order && resolved.order !== "None";
            const isCamSaved = t.dayOrder && t.dayOrder !== "None" && (t.dayOrderSource === "cam" || (t as any).dayOrderSource === "cam");

            return {
              ...t,
              date,
              dayOrder: isCamFromConfig ? resolved.order : (isCamSaved ? t.dayOrder : undefined),
              dayOrderSource: (isCamFromConfig || isCamSaved) ? ("cam" as const) : undefined
            };
          })
        );
      } else {
        generateDefaultTasksForWeek(match.start_date);
      }
    } else {
      // New sequential week creation (auto derived from previous logs/plans)
      setCurrentPlanId(null);
      setCurrentStatus("Draft");
      setCurrentFeedback("");
      setVerifiedBy("");
      setVerifiedAt("");
      setPlanUpdatedAt("");
      setUnitName(`Unit ${Math.min(5, Math.ceil(targetWeek / 3))}`);

      // Derive the window from the selected week; pinning every new plan to the
      // current Monday overlaps existing ranges and the API rejects the save.
      const weekWindow = computeWeekWindow(targetWeek, undefined, workingDaysCount);
      const calculatedStart = weekWindow.start;
      const calculatedEnd = weekWindow.end;
      setStartDate(calculatedStart);
      setEndDate(calculatedEnd);
      generateDefaultTasksForWeek(calculatedStart);
    }
  }, [selectedClass, selectedSubject, plans, workingDaysCount, resolveDayOrderDetailed, generateDefaultTasksForWeek]);

  // Handle explicit week switch by mentor
  const handleSelectWeek = (targetWeek: number) => {
    isDirtyRef.current = false;
    setSelectedWeek(targetWeek);
    loadPlanForWeek(targetWeek, selectedClass, selectedSubject, plans);
  };

  // Initial and reactive plan selection when plans load or selections change
  useEffect(() => {
    if (!plansLoaded || !dailyConfigsLoaded) return;
    if (isDirtyRef.current) return;

    // Filter matching plans for current class and subject
    const matched = plans.filter(p => {
      const classMatch = !selectedClass || selectedClass === "Default Cohort" || selectedClass === "All Classes" ||
        p.class_group.toLowerCase().trim() === selectedClass.toLowerCase().trim() ||
        isCohortMatching(p.class_group, selectedClass);
      const subjectMatch = !selectedSubject || selectedSubject === "General Subject" || selectedSubject === "All Subjects" ||
        p.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim() ||
        isSubjectNameMatch(p.subject, selectedSubject);
      return classMatch && subjectMatch;
    }).sort((a, b) => a.week_number - b.week_number);

    // Background refreshes rebuild `plans`; only re-select when the relevant content changed.
    const selectionSignature = [
      selectedClass,
      selectedSubject,
      ...matched.map(p => `${p.id}:${p.week_number}:${p.status}:${p.updated_at || p.created_at || ""}`)
    ].join("|");
    if (lastPlanAutoSelectRef.current === selectionSignature) return;
    lastPlanAutoSelectRef.current = selectionSignature;

    if (matched.length === 0) {
      setSelectedWeek(1);
      loadPlanForWeek(1, selectedClass, selectedSubject, plans);
    } else {
      // Prioritize draft/revision, or if all are submitted/verified, auto-advance to next sequential week
      const activeDraft = matched.find(p => p.status === "Draft" || p.status === "Needs Revision");
      if (activeDraft) {
        setSelectedWeek(activeDraft.week_number);
        loadPlanForWeek(activeDraft.week_number, selectedClass, selectedSubject, plans);
      } else {
        const highestWk = Math.max(...matched.map(p => p.week_number));
        const nextWk = highestWk + 1;
        setSelectedWeek(nextWk);
        loadPlanForWeek(nextWk, selectedClass, selectedSubject, plans);
      }
    }
  }, [plansLoaded, dailyConfigsLoaded, selectedClass, selectedSubject, plans, loadPlanForWeek]);

  // Keep dropdown options updated when props arrive
  useEffect(() => {
    if (assignedClasses.length > 0 && (!selectedClass || selectedClass === "Default Cohort")) {
      setSelectedClass(assignedClasses[0]);
    }
  }, [assignedClasses, selectedClass]);

  useEffect(() => {
    if (assignedSubjects.length > 0 && (!selectedSubject || selectedSubject === "General Subject")) {
      setSelectedSubject(assignedSubjects[0]);
    }
  }, [assignedSubjects, selectedSubject]);

  // When Class changes
  const handleClassChange = (newClass: string) => {
    isDirtyRef.current = false;
    setSelectedClass(newClass);
    const matched = plans.filter(p => {
      const classMatch = !newClass || newClass === "Default Cohort" || newClass === "All Classes" ||
        p.class_group.toLowerCase().trim() === newClass.toLowerCase().trim() ||
        isCohortMatching(p.class_group, newClass);
      const subjectMatch = !selectedSubject || selectedSubject === "General Subject" || selectedSubject === "All Subjects" ||
        p.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim() ||
        isSubjectNameMatch(p.subject, selectedSubject);
      return classMatch && subjectMatch;
    }).sort((a, b) => a.week_number - b.week_number);

    if (matched.length === 0) {
      setSelectedWeek(1);
      loadPlanForWeek(1, newClass, selectedSubject, plans);
    } else {
      const activeDraft = matched.find(p => p.status === "Draft" || p.status === "Needs Revision");
      if (activeDraft) {
        setSelectedWeek(activeDraft.week_number);
        loadPlanForWeek(activeDraft.week_number, newClass, selectedSubject, plans);
      } else {
        const highestWk = Math.max(...matched.map(p => p.week_number));
        const nextWk = highestWk + 1;
        setSelectedWeek(nextWk);
        loadPlanForWeek(nextWk, newClass, selectedSubject, plans);
      }
    }
  };

  // When Subject changes
  const handleSubjectChange = (newSubject: string) => {
    isDirtyRef.current = false;
    setSelectedSubject(newSubject);
    const matched = plans.filter(p => {
      const classMatch = !selectedClass || selectedClass === "Default Cohort" || selectedClass === "All Classes" ||
        p.class_group.toLowerCase().trim() === selectedClass.toLowerCase().trim() ||
        isCohortMatching(p.class_group, selectedClass);
      const subjectMatch = !newSubject || newSubject === "General Subject" || newSubject === "All Subjects" ||
        p.subject.toLowerCase().trim() === newSubject.toLowerCase().trim() ||
        isSubjectNameMatch(p.subject, newSubject);
      return classMatch && subjectMatch;
    }).sort((a, b) => a.week_number - b.week_number);

    if (matched.length === 0) {
      setSelectedWeek(1);
      loadPlanForWeek(1, selectedClass, newSubject, plans);
    } else {
      const activeDraft = matched.find(p => p.status === "Draft" || p.status === "Needs Revision");
      if (activeDraft) {
        setSelectedWeek(activeDraft.week_number);
        loadPlanForWeek(activeDraft.week_number, selectedClass, newSubject, plans);
      } else {
        const highestWk = Math.max(...matched.map(p => p.week_number));
        const nextWk = highestWk + 1;
        setSelectedWeek(nextWk);
        loadPlanForWeek(nextWk, selectedClass, newSubject, plans);
      }
    }
  };

  // When Start Date changes manually (Updates dates but preserves sequential week number!)
  const handleStartDateChange = (newStartDate: string) => {
    setStartDate(newStartDate);
    if (newStartDate) {
      const autoEnd = computeEndDateFromStart(newStartDate, workingDaysCount);
      setEndDate(autoEnd);
      isDirtyRef.current = true;
    }
    setDailyTasks(prev => {
      const updated = prev.map(t => {
        const date = getDateForDay(t.day, newStartDate);
        const resolved = resolveDayOrderDetailed(date, t.day);
        return {
          ...t,
          date,
          dayOrder: resolved.source === "cam" ? resolved.order : undefined,
          dayOrderSource: resolved.source === "cam" ? ("cam" as const) : undefined
        };
      });

      if (!newStartDate) return updated;

      // Days skipped earlier (no CAM day order) are not in `prev`; add them now that the dates moved.
      const existingDays = new Set(updated.map(t => t.day));
      const missingTasks = buildDefaultTasksForWeek(newStartDate).filter(t => !existingDays.has(t.day));
      if (missingTasks.length === 0) return updated;

      const dayRank = new Map(availableDays.map((day, idx) => [day, idx]));
      return [...updated, ...missingTasks].sort(
        (a, b) => (dayRank.get(a.day) ?? Number.MAX_SAFE_INTEGER) - (dayRank.get(b.day) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  };

  // Check if CAM has assigned any Day Order for this week
  const hasAnyCamDayOrder = useMemo(() => {
    const mondayStr = startDate || getMondayOfCurrentWeek();
    return availableDays.some(day => {
      const dStr = getDateForDay(day, mondayStr);
      const res = resolveDayOrderDetailed(dStr, day);
      return res.source === "cam";
    });
  }, [availableDays, startDate, resolveDayOrderDetailed]);

  // Handle task field updates
  const updateDailyTask = (idx: number, field: keyof DailySessionTask, value: any) => {
    isDirtyRef.current = true;
    setDailyTasks(prev => {
      const next = [...prev];
      let updatedTask = { ...next[idx], [field]: value };
      // If day was changed, automatically update the date and day order
      if (field === "day") {
        const newDate = getDateForDay(value, startDate);
        const resolved = resolveDayOrderDetailed(newDate, value);
        updatedTask = {
          ...updatedTask,
          date: newDate,
          dayOrder: resolved.source === "cam" ? resolved.order : undefined,
          dayOrderSource: resolved.source === "cam" ? ("cam" as const) : undefined
        };
      }
      // If date was changed directly, resolve day order
      if (field === "date") {
        const resolved = resolveDayOrderDetailed(value, updatedTask.day);
        updatedTask = {
          ...updatedTask,
          dayOrder: resolved.source === "cam" ? resolved.order : undefined,
          dayOrderSource: resolved.source === "cam" ? ("cam" as const) : undefined
        };
      }
      next[idx] = updatedTask;
      return next;
    });
  };

  // ─── EXCEL TEMPLATE DOWNLOAD — ExcelJS (styled, engine-quality) ───
  const handleDownloadTemplate = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;

      const templateTasks = dailyTasks.length > 0
        ? dailyTasks
        : availableDays.map((day, idx) => {
            const date = getDateForDay(day, startDate);
            const resolved = resolveDayOrderDetailed(date, day);
            return {
              day,
              dayOrder: resolved.order || undefined,
              dayOrderSource: resolved.source === "cam" ? "cam" as const : undefined,
              date,
              periodSlot: resolvedPeriodSlots[idx % resolvedPeriodSlots.length] || `Period ${idx + 1}`,
              topic: "",
              objectives: "",
              teachingMode: "Theory" as const,
              materialUrl: "",
              status: "Planned" as const
            };
          });

      const wb = new ExcelJS.Workbook();
      wb.creator = mentorName || "FACE Prep E-Campus";
      wb.created = new Date();

      // ── Sheet 1: Weekly Teaching Plan ──
      const wsPlan = wb.addWorksheet("Weekly Teaching Plan", {
        views: [{ state: "frozen", xSplit: 0, ySplit: 2 }]
      });

      // Columns: Date | Day Order | Week | Period Slot | Topic Planned * | Description
      wsPlan.columns = [
        { key: "date",      width: 18 },
        { key: "dayOrder",  width: 14 },
        { key: "week",      width: 12 },
        { key: "period",    width: 28 },
        { key: "topic",     width: 44 },
        { key: "desc",      width: 54 }
      ];

      // ── Row 1: Title banner ──
      wsPlan.mergeCells("A1:F1");
      const titleCell = wsPlan.getCell("A1");
      titleCell.value = `Weekly Teaching Plan  ·  ${selectedSubject}  ·  ${selectedClass}`;
      titleCell.font   = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3730A3" } };
      wsPlan.getRow(1).height = 30;

      // ── Row 2: Column headers ──
      const COLS = ["Date", "Day Order", "Week", "Period Slot", "Topic Planned *", "Description"];
      const headerRow = wsPlan.getRow(2);
      headerRow.height = 22;
      COLS.forEach((h, ci) => {
        const cell = headerRow.getCell(ci + 1);
        cell.value = h;
        cell.font  = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = {
          top:    { style: "thin",   color: { argb: "FF6366F1" } },
          bottom: { style: "medium", color: { argb: "FFFFFFFF" } },
          left:   { style: "thin",   color: { argb: "FF6366F1" } },
          right:  { style: "thin",   color: { argb: "FF6366F1" } }
        };
      });

      // ── Data rows ──
      const weekLabel = `Week ${selectedWeek}`;

      templateTasks.forEach((t, idx) => {
        const row = wsPlan.getRow(idx + 3);
        row.height = 20;

        const rowData: (string)[] = [
          t.date || getDateForDay(t.day, startDate),
          t.dayOrder || "",
          weekLabel,
          t.periodSlot || resolvedPeriodSlots[idx % resolvedPeriodSlots.length] || `Period ${idx + 1}`,
          "",   // Topic — mentor fills
          ""    // Description — mentor fills
        ];

        const isAlt = idx % 2 !== 0;

        rowData.forEach((val, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = val;
          cell.font  = { name: "Calibri", size: 10 };
          cell.alignment = { vertical: "middle", horizontal: ci < 4 ? "center" : "left", wrapText: true };
          cell.border = {
            top:    { style: "hair", color: { argb: "FFE2E8F0" } },
            bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
            left:   { style: "hair", color: { argb: "FFE2E8F0" } },
            right:  { style: "hair", color: { argb: "FFE2E8F0" } }
          };

          // Editable columns (Topic & Description) → amber tint + italic placeholder hint
          if (ci >= 4) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
            cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF92400E" } };
          } else {
            cell.fill = {
              type: "pattern", pattern: "solid",
              fgColor: { argb: isAlt ? "FFF5F3FF" : "FFFFFFFF" }
            };
          }
        });
      });

      // ── Sheet 2: Info ──
      const wsInfo = wb.addWorksheet("Info");
      wsInfo.columns = [
        { key: "guide",   width: 24 },
        { key: "details", width: 52 }
      ];

      // Info header row
      const infoHdr = wsInfo.getRow(1);
      infoHdr.height = 20;
      ["Field", "Value"].forEach((h, ci) => {
        const c = infoHdr.getCell(ci + 1);
        c.value = h;
        c.font  = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3730A3" } };
        c.alignment = { vertical: "middle" };
      });

      const infoData: [string, string][] = [
        ["Faculty Name",   mentorName || "—"],
        ["Campus",         collegeName || collegeId || "—"],
        ["Class / Cohort", selectedClass],
        ["Subject",        selectedSubject],
        ["Week",           weekLabel],
        ["Period Count",   String(templateTasks.length)],
        ["Instructions",   "Fill only the 'Topic Planned *' and 'Description' columns (highlighted amber). Do not edit any other column. Upload back into Weekly Plan Studio."]
      ];

      infoData.forEach(([guide, details]) => {
        const r = wsInfo.addRow({ guide, details });
        r.height = 18;
        r.getCell(1).font = { name: "Calibri", size: 10, bold: true };
        r.getCell(2).font = { name: "Calibri", size: 10 };
        r.getCell(2).alignment = { wrapText: true };
      });

      // ── Write buffer → native Blob download ──
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeSubject = selectedSubject.replace(/[^a-zA-Z0-9]/g, "_");
      a.download = `Weekly_Plan_Template_Week_${selectedWeek}_${safeSubject}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast("Styled Excel template downloaded successfully.", "success");
    } catch (err: any) {
      toast("Failed to download template: " + err.message, "error");
    }
  };

  // ─── EXCEL BULK UPLOAD (ROBUST DATE & DAY ORDER PARSING) ───

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const XLSX = await import("xlsx");
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const sheetName = wb.SheetNames.includes("Weekly Teaching Plan")
          ? "Weekly Teaching Plan"
          : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        // range: 1 → skip row 0 (title banner from ExcelJS template);
        // row 1 (our "Date / Day Order / Week / Period Slot / Topic / Description" header) becomes keys
        const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", range: 1 });

        if (!rawRows || rawRows.length === 0) {
          toast("Uploaded file contains no rows.", "error");
          return;
        }

        // Compute updates outside setDailyTasks to avoid setState-during-render
        let updateCount = 0;
        const pendingUpdates: { idx: number; topic: string; objectives: string }[] = [];

        // We need a snapshot of current tasks to match against — capture it first
        setDailyTasks(prev => {
          const updatedTasks = [...prev];

          rawRows.forEach((row) => {
            const rawDate = row["Date"] || row["Date (YYYY-MM-DD)"] || "";
            const dateVal = parseExcelDate(rawDate);
            const periodSlot = String(row["Period Slot"] || "").trim();

            if (dateVal && periodSlot) {
              const matchIdx = updatedTasks.findIndex(t => t.date === dateVal && t.periodSlot === periodSlot);
              if (matchIdx !== -1) {
                const topic = String(row["Topic Planned *"] || row["Topic Planned"] || row["Topic"] || "").trim();
                if (topic) {
                  updatedTasks[matchIdx] = {
                    ...updatedTasks[matchIdx],
                    topic,
                    objectives: String(row["Description"] || row["Objectives"] || "").trim()
                  };
                  updateCount++;
                  pendingUpdates.push({ idx: matchIdx, topic, objectives: updatedTasks[matchIdx].objectives });
                }
              }
            }
          });

          return updatedTasks;
        });

        // Toast AFTER state update (not inside the updater) — safe from setState-during-render
        setTimeout(() => {
          toast(`Imported plan successfully (${updateCount} periods updated).`, updateCount > 0 ? "success" : "warning");
        }, 0);

      } catch (err: any) {
        toast("Failed to parse Excel file: " + err.message, "error");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  // Save Plan (as Draft or Submitted)
  const handleSavePlan = async (statusToSave: "Draft" | "Submitted") => {
    if (!selectedClass || !selectedSubject) {
      toast("Please select a valid cohort and subject.", "error");
      return;
    }

    if (statusToSave === "Submitted") {
      const hasAtLeastOneTopic = dailyTasks.some(t => t.topic.trim().length > 0);
      if (!hasAtLeastOneTopic) {
        toast("Please fill in the planned topic for at least one period before submitting.", "error");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        id: currentPlanId || undefined,
        collegeId,
        mentorId,
        mentorName,
        department: department || "",
        subject: selectedSubject,
        classGroup: selectedClass,
        weekNumber: selectedWeek,
        startDate,
        endDate,
        unit: unitName,
        sessionPlan: dailyTasks,
        teachingMode: "Offline",
        status: statusToSave
      };

      const data = await apiFetch("/api/weekly-plan", {
        method: "POST",
        body: payload
      });

      if (data.success) {
        isDirtyRef.current = false;
        toast(
          statusToSave === "Submitted"
            ? "Weekly plan submitted to SME for verification!"
            : "Weekly plan saved as draft.",
          "success"
        );
        await queryClient.invalidateQueries({ queryKey: ["weekly-plan"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_weekly_plan_updated"));
        }
      } else {
        toast(data.message || "Failed to save weekly plan", "error");
      }
    } catch (e: any) {
      toast("Error saving weekly plan: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const filledPeriodsCount = dailyTasks.filter(t => t.topic.trim().length > 0).length;
  const completedInCurrentPlan = dailyTasks.filter(
    t => t.status === "Completed" || t.conductedStatus === "Completed"
  ).length;

  // Verified = permanently locked — SME has approved, mentor cannot edit
  const isVerified = currentStatus === "Verified";
  // Submitted = content locked but can be re-submitted after unlock
  const isLocked = currentStatus === "Submitted" || isVerified;
  // Editable states
  const isEditable = currentStatus === "Draft" || currentStatus === "Needs Revision";

  const handleUnlock = () => {
    if (isVerified) return; // Verified plans cannot be unlocked by mentor
    setCurrentStatus("Draft");
    isDirtyRef.current = true;
    toast("Plan reopened for editing. Re-submit when ready.", "info");
  };

  // Load a plan from the history archive table
  const handleOpenFromArchive = (plan: WeeklyPlanRecord) => {
    setSelectedClass(plan.class_group);
    setSelectedSubject(plan.subject);
    setSelectedWeek(plan.week_number);
    loadPlanForWeek(plan.week_number, plan.class_group, plan.subject, plans);
    studioTopRef.current?.scrollIntoView({ behavior: "smooth" });
    toast(`Loaded Week ${plan.week_number} plan for ${plan.subject}.`, "info");
  };

  // Filtered archive plans
  const filteredArchivePlans = useMemo(() => {
    return plans.filter(p => {
      if (archiveFilterScope === "current") {
        const classMatch = !selectedClass || selectedClass === "Default Cohort" || selectedClass === "All Classes" ||
          p.class_group.toLowerCase().trim() === selectedClass.toLowerCase().trim() ||
          isCohortMatching(p.class_group, selectedClass);
        const subjectMatch = !selectedSubject || selectedSubject === "General Subject" || selectedSubject === "All Subjects" ||
          p.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim() ||
          isSubjectNameMatch(p.subject, selectedSubject);
        if (!classMatch || !subjectMatch) return false;
      }
      if (archiveSearch.trim()) {
        const q = archiveSearch.toLowerCase().trim();
        const matchSubj = (p.subject || "").toLowerCase().includes(q);
        const matchClass = (p.class_group || "").toLowerCase().includes(q);
        const matchWeek = String(p.week_number).includes(q) || `week ${p.week_number}`.includes(q);
        const matchRemarks = (p.sme_remarks || p.cam_feedback || "").toLowerCase().includes(q);
        if (!matchSubj && !matchClass && !matchWeek && !matchRemarks) return false;
      }
      return true;
    }).sort((a, b) => b.week_number - a.week_number);
  }, [plans, archiveFilterScope, archiveSearch, selectedClass, selectedSubject]);

  // Synthesise submission history from available DB fields
  const submissionLog: Array<{ action: string; by: string; at: string; remarks?: string; color: string; icon: string }> =
    currentPlanId ? [
      (planUpdatedAt && currentStatus !== "Draft") ? {
        action: "Submitted to SME",
        by: mentorName,
        at: planUpdatedAt,
        color: "indigo",
        icon: "send"
      } : null,
      (verifiedAt && verifiedBy) ? {
        action: currentStatus === "Verified" ? "Verified & Approved" : "Needs Revision",
        by: verifiedBy,
        at: verifiedAt,
        remarks: currentFeedback || undefined,
        color: currentStatus === "Verified" ? "emerald" : "rose",
        icon: currentStatus === "Verified" ? "check" : "alert"
      } : null
    ].filter((x): x is NonNullable<typeof x> => x !== null) : [];
  const hasLog = submissionLog.length > 0;

  return (
    <div ref={studioTopRef} className="space-y-5 font-sans">
      {/* ─── Top Header Card with Non-Wrapping Single-Row Toolbar ─── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CalendarRange className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900">Weekly Teaching Plan Studio</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 border border-indigo-200 text-indigo-700">
                  {mentorName}
                </span>
                {collegeName && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                    {collegeName}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                  Week {selectedWeek} Active
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Plan weekly teaching periods sequentially (Week 1, Week 2...) and submit to your Subject Matter Expert.
              </p>
            </div>
          </div>

          {/* Context-aware Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Excel helpers: hidden when Verified */}
            {!isVerified && (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" className="hidden" />
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title="Download pre-filled Excel schedule template"
                >
                  <Download className="h-3 w-3 text-indigo-500" />
                  <span>Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  title="Upload completed Excel sheet"
                >
                  <Upload className="h-3 w-3 text-indigo-500" />
                  <span>Upload</span>
                </button>
              </>
            )}

            {/* Save Draft */}
            {isEditable && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSavePlan("Draft")}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="h-3 w-3" />
                <span>Save Draft</span>
              </button>
            )}

            {/* Edit / Unlock: only Submitted */}
            {currentStatus === "Submitted" && (
              <button
                type="button"
                onClick={handleUnlock}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Edit2 className="h-3 w-3" />
                <span>Edit / Re-open</span>
              </button>
            )}

            {/* Primary CTA */}
            {isVerified ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="text-left leading-tight">
                  <div className="text-[11px] font-black text-emerald-900">
                    Approved by {verifiedBy || "SME"}
                  </div>
                  {verifiedAt && (
                    <div className="text-[9.5px] font-semibold text-emerald-600">
                      {verifiedAt}
                    </div>
                  )}
                </div>
                <span className="ml-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-200/70 text-emerald-800">
                  Locked
                </span>
              </div>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSavePlan("Submitted")}
                className="px-4 py-1.5 rounded-lg text-[11px] font-black text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="h-3 w-3" />
                <span>{currentStatus === "Submitted" ? "Re-submit Week Plan" : `Submit Week ${selectedWeek} to SME`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Skill Development Tracker Verdict Chip (skill subjects only) */}
        {(() => {
          const subj = subjectsList.find((s: any) => s.name.toLowerCase().trim() === selectedSubject.toLowerCase().trim());
          const isSkill = (subj?.type || "").toLowerCase() === "skill" || isSkillSubject(subj || selectedSubject);
          if (!isSkill) return null;
          const verdict = plans.find(p => p.week_number === selectedWeek)?.skill_verdict;
          if (!verdict || verdict.verdict === "pending") {
            return (
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2.5">
                <Clock3 className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="text-xs text-slate-600">
                  <span className="font-bold">Skill Development Verdict: </span>
                  <span className="font-bold text-slate-700 uppercase">Pending SME Review</span>
                  <span className="text-slate-400 font-medium"> — your L&D outcome and SME sign-off will appear here.</span>
                </div>
              </div>
            );
          }
          const styles: Record<string, string> = {
            cleared: "bg-emerald-50/70 border-emerald-200 text-emerald-900",
            not_cleared: "bg-rose-50/70 border-rose-200 text-rose-900",
            needs_revision: "bg-amber-50/70 border-amber-200 text-amber-900"
          };
          const labels: Record<string, string> = {
            cleared: "Cleared by SME",
            not_cleared: "Not Cleared",
            needs_revision: "Needs Revision"
          };
          return (
            <div className={`mt-3 p-3 rounded-xl border flex items-start gap-2.5 ${styles[verdict.verdict] || styles.cleared}`}>
              {verdict.verdict === "cleared" ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${verdict.verdict === "not_cleared" ? "text-rose-600" : "text-amber-600"}`} />}
              <div className="text-xs flex-1">
                <span className="font-black uppercase">Skill Development Verdict: </span>
                <span className="font-black uppercase">{labels[verdict.verdict] || verdict.verdict}</span>
                {verdict.score != null && <span className="font-bold"> — Score: {verdict.score}</span>}
                {verdict.remarks && <div className="mt-0.5 font-medium italic">&ldquo;{verdict.remarks}&rdquo;</div>}
                {verdict.verified_by && <div className="text-[10px] font-semibold opacity-75 mt-0.5">by {verdict.verified_by}</div>}
              </div>
            </div>
          );
        })()}

        {/* Status Alerts */}
        {currentStatus === "Needs Revision" && currentFeedback && (
          <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs flex-1">
              <span className="font-black text-amber-900 uppercase">SME Revision Required: </span>
              <span className="text-amber-800 font-medium">{currentFeedback}</span>
            </div>
          </div>
        )}

        {/* SME Remarks Note */}
        {isVerified && currentFeedback && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900">
              <span className="font-bold">SME Remark: </span>
              <span className="font-medium italic">&ldquo;{currentFeedback}&rdquo;</span>
            </div>
          </div>
        )}

        {/* Submission History Log */}
        {hasLog && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowHistory(h => !h)}
              className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <Clock3 className="h-3 w-3" />
              <span>Submission History</span>
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showHistory ? "rotate-180" : ""}`} />
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1.5 pl-1">
                {submissionLog.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                      entry.color === "emerald" ? "bg-emerald-50 border-emerald-100" :
                      entry.color === "rose"    ? "bg-rose-50 border-rose-100" :
                                                 "bg-indigo-50 border-indigo-100"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      entry.color === "emerald" ? "bg-emerald-200 text-emerald-700" :
                      entry.color === "rose"    ? "bg-rose-200 text-rose-700" :
                                                 "bg-indigo-200 text-indigo-700"
                    }`}>
                      {entry.icon === "check" ? <Check className="h-3 w-3" /> :
                       entry.icon === "alert" ? <AlertCircle className="h-3 w-3" /> :
                       <Send className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-black text-[11px] ${
                          entry.color === "emerald" ? "text-emerald-800" :
                          entry.color === "rose"    ? "text-rose-800" :
                                                     "text-indigo-800"
                        }`}>{entry.action}</span>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0">
                          {String(entry.at).replace("T", " ").split(".")[0]}
                        </span>
                      </div>
                      <span className="text-[10.5px] text-slate-500">by {entry.by}</span>
                      {entry.remarks && (
                        <p className="text-[10.5px] text-slate-600 mt-0.5 italic">&ldquo;{entry.remarks}&rdquo;</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Context Configuration Panel ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-3.5 mt-3.5 border-t border-slate-100 items-end">
          {/* Cohort / Class Group */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Class / Cohort
            </label>
            <select
              aria-label="Class / Cohort"
              value={selectedClass}
              onChange={e => handleClassChange(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {assignedClasses.length > 0 ? (
                assignedClasses.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))
              ) : (
                <option value={selectedClass}>{selectedClass}</option>
              )}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Subject
            </label>
            <select
              aria-label="Subject"
              value={selectedSubject}
              onChange={e => handleSubjectChange(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {assignedSubjects.length > 0 ? (
                assignedSubjects.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              ) : (
                <option value={selectedSubject}>{selectedSubject}</option>
              )}
            </select>
          </div>

          {/* Teaching Dates Popup Trigger */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Teaching Schedule Dates
            </label>
            <button
              type="button"
              onClick={() => setShowDateModal(true)}
              className="w-full p-2 bg-sunken hover:bg-white border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-800 transition-colors flex items-center justify-between gap-2 cursor-pointer"
              title="Click to view or edit teaching dates for this week"
            >
              <div className="flex items-center gap-1.5 truncate">
                <CalendarRange className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span className="truncate text-[11px]">
                  {startDate && endDate ? `${startDate} to ${endDate}` : "Set Schedule Dates"}
                </span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                {workingDaysCount}-Day Week
              </span>
            </button>
          </div>
        </div>

        {/* ─── Teaching Dates Popup Modal ─── */}
        {showDateModal && (
          <Dialog
            open={true}
            onOpenChange={(next) => { if (!next) setShowDateModal(false); }}
            ariaLabel="Teaching Schedule Dates"
            overlayClassName="bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
            panelClassName="max-w-md max-h-[90vh] p-5 space-y-4 rounded-2xl animate-scaleUp"
          >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <CalendarRange className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Teaching Schedule Dates (Week {selectedWeek})
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {workingDaysCount}-Day Week configured for {collegeName || "Campus"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDateModal(false)}
                  aria-label="Close teaching schedule dates"
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    aria-label="Start Date"
                    value={startDate}
                    onChange={e => handleStartDateChange(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      End Date
                    </label>
                    <span className="text-[8px] font-extrabold text-emerald-700 bg-emerald-100/80 px-1 py-0.2 rounded">Auto</span>
                  </div>
                  <input
                    type="date"
                    aria-label="End Date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDateModal(false)}
                  className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs cursor-pointer"
                >
                  Apply & Close
                </button>
              </div>
          </Dialog>
        )}

        {/* ─── Sequential Week Navigation Bar (Read & Update Tabs) ─── */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Teaching Plan Weeks ({matchingPlans.length} Total)
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                Auto-sequenced based on submission history
              </span>
            </div>
            <div className="text-[11px] font-bold text-slate-500">
              Active: <span className="font-extrabold text-indigo-600">Week {selectedWeek}</span>
              {currentStatus && (
                <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase ${
                  currentStatus === "Verified" ? "bg-emerald-100 text-emerald-800" :
                  currentStatus === "Needs Revision" ? "bg-rose-100 text-rose-800" :
                  currentStatus === "Submitted" ? "bg-indigo-100 text-indigo-800" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {currentStatus}
                </span>
              )}
            </div>
          </div>

          {/* Week Tabs Carousel */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5">
            {matchingPlans.map(p => {
              const isActive = p.week_number === selectedWeek;
              const statusColors: Record<string, string> = {
                Verified: "bg-emerald-100/90 text-emerald-800 border-emerald-200",
                Submitted: "bg-indigo-100/90 text-indigo-800 border-indigo-200",
                "Needs Revision": "bg-rose-100/90 text-rose-800 border-rose-200",
                Draft: "bg-slate-100 text-slate-600 border-slate-200"
              };

              return (
                <button
                  key={p.id || p.week_number}
                  type="button"
                  onClick={() => handleSelectWeek(p.week_number)}
                  className={`flex flex-col text-left px-3.5 py-2 rounded-xl border transition-all cursor-pointer shrink-0 min-w-[125px] ${
                    isActive
                      ? "bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <span className={`text-xs font-black ${isActive ? "text-indigo-900" : "text-slate-800"}`}>
                      Week {p.week_number}
                    </span>
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded border ${statusColors[p.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                      {p.status === "Verified" ? "Approved" : p.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                    {p.start_date && p.end_date ? `${p.start_date.slice(5)} to ${p.end_date.slice(5)}` : "No dates set"}
                  </div>
                </button>
              );
            })}

            {/* Next Sequential Week Button (e.g. Week 2 if Week 1 exists, Week 1 if none) */}
            {(!matchingPlans.some(p => p.week_number === nextSequentialWeek)) && (
              <button
                type="button"
                onClick={() => handleSelectWeek(nextSequentialWeek)}
                className={`flex flex-col text-left px-3.5 py-2 rounded-xl border border-dashed transition-all cursor-pointer shrink-0 min-w-[130px] ${
                  selectedWeek === nextSequentialWeek && !currentPlanId
                    ? "bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500/20"
                    : "bg-slate-50/60 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-600"
                }`}
                title={`Start next sequential plan (Week ${nextSequentialWeek})`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black text-indigo-700">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Week {nextSequentialWeek}</span>
                </div>
                <div className="text-[10px] text-indigo-500 font-semibold mt-1">
                  New Sequence Plan
                </div>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ─── Spreadsheet-Grade Interactive Teaching Period Table ─── */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Teaching Periods for Week {selectedWeek} ({dailyTasks.length} Sessions)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
              Campus: {workingDaysCount} Working Days
            </span>
            <span className="text-xs text-slate-400 font-semibold">
              • {selectedSubject} ({selectedClass})
            </span>
          </div>

          {/* Export current plan */}
          {dailyTasks.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const XLSX = await import("xlsx");
                  const rows = dailyTasks.map((t, i) => ({
                    "#": `P${i + 1}`,
                    "Week": `Week ${selectedWeek}`,
                    "Date": t.date || "",
                    "Day Order": t.dayOrder || "",
                    "Period Slot": t.periodSlot || resolvedPeriodSlots[i % resolvedPeriodSlots.length] || "",
                    "Topic Planned": t.topic || "",
                    "Description": t.objectives || "",
                    "SME Status": currentStatus
                  }));
                  const wb = XLSX.utils.book_new();
                  const ws = XLSX.utils.json_to_sheet(rows);
                  XLSX.utils.book_append_sheet(wb, ws, "Weekly Plan");
                  const safeSubject = selectedSubject.replace(/[^a-zA-Z0-9]/g, "_");
                  XLSX.writeFile(wb, `Plan_Week${selectedWeek}_${safeSubject}.xlsx`);
                  toast("Plan exported.", "success");
                } catch (e: any) {
                  toast("Export failed: " + e.message, "error");
                }
              }}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="h-3 w-3 text-indigo-500" />
              <span>Export (.xlsx)</span>
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse text-xs min-w-[950px]">
            <TableHeader>
              <TableRow className="bg-slate-100/70 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <TableHead className="py-2.5 px-3 w-12 text-center">#</TableHead>
                <TableHead className="py-2.5 px-3 w-20">Week</TableHead>
                <TableHead className="py-2.5 px-3 w-28">Date</TableHead>
                <TableHead className="py-2.5 px-3 w-28">Day Order</TableHead>
                <TableHead className="py-2.5 px-3 w-44">Period Slot</TableHead>
                <TableHead className="py-2.5 px-3">Topic Planned *</TableHead>
                <TableHead className="py-2.5 px-3 w-52">Description</TableHead>
                <TableHead className="py-2.5 px-3 w-28 text-center">SME Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {dailyTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-slate-400 italic font-medium">
                    {!dailyConfigsLoaded
                      ? "Loading day-order configuration…"
                      : hasAnyCamDayOrder
                        ? "No periods found in your timetable for this selection."
                        : "Day order not set for these dates."}
                  </TableCell>
                </TableRow>
              ) : (
                dailyTasks.map((task, idx) => (
                  <TableRow key={idx} className="hover:bg-slate-50/80 transition-colors">
                    {/* # */}
                    <TableCell className="py-2 px-3 text-center">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-indigo-50 text-indigo-700 font-black text-[11px] border border-indigo-100">
                        P{idx + 1}
                      </span>
                    </TableCell>

                    {/* Week */}
                    <TableCell className="py-2.5 px-3">
                      <span className="text-[11px] font-black text-indigo-700 whitespace-nowrap">Week {selectedWeek}</span>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="py-2.5 px-3">
                      <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200/70 whitespace-nowrap">
                        {task.date || "—"}
                      </span>
                    </TableCell>

                    {/* Day Order */}
                    <TableCell className="py-2.5 px-3">
                      {task.dayOrder ? (
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg font-black text-[10.5px] border whitespace-nowrap ${
                            task.dayOrder.toLowerCase().includes("holiday") || task.dayOrder === "None"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }`}
                          title="Day Order assigned by CM daily configuration"
                        >
                          {task.dayOrder}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10.5px] text-slate-300 whitespace-nowrap"
                          title="Day Order not set by CM for this date"
                        >
                          —
                        </span>
                      )}
                    </TableCell>

                    {/* Period Slot */}
                    <TableCell className="py-2.5 px-3">
                      <span
                        className="inline-flex items-center gap-1.5 font-bold text-slate-700 text-xs bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg whitespace-nowrap"
                        title="Assigned timetable period slot"
                      >
                        <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                        <span>{task.periodSlot || resolvedPeriodSlots[idx % resolvedPeriodSlots.length] || `Period ${idx + 1}`}</span>
                      </span>
                    </TableCell>

                    {/* Topic Planned */}
                    <TableCell className="py-2 px-3">
                      {isLocked ? (
                        <div className={`flex items-center gap-2 ${!isVerified ? "group" : ""}`}>
                          <span className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg border ${
                            task.topic
                              ? "text-slate-900 bg-slate-50 border-slate-200"
                              : "text-slate-400 italic bg-slate-50/50 border-slate-100"
                          }`}>
                            {task.topic || "—"}
                          </span>
                          {!isVerified && (
                            <button
                              type="button"
                              onClick={handleUnlock}
                              title="Unlock to edit"
                              className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          placeholder="What will be taught in this session? *"
                          value={task.topic}
                          onChange={e => updateDailyTask(idx, "topic", e.target.value)}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      )}
                    </TableCell>

                    {/* Description */}
                    <TableCell className="py-2 px-3">
                      {isLocked ? (
                        <span className={`block text-[11px] px-2 py-1.5 rounded-lg border ${
                          task.objectives
                            ? "text-slate-700 font-medium bg-slate-50 border-slate-200"
                            : "text-slate-400 italic bg-slate-50/50 border-slate-100"
                        }`}>
                          {task.objectives || "—"}
                        </span>
                      ) : (
                        <input
                          type="text"
                          placeholder="Description"
                          value={task.objectives}
                          onChange={e => updateDailyTask(idx, "objectives", e.target.value)}
                          className="w-full p-1.5 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-lg text-[11px] font-medium text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      )}
                    </TableCell>

                    {/* SME Status */}
                    <TableCell className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase whitespace-nowrap ${
                        currentStatus === "Verified"       ? "bg-emerald-100 text-emerald-800" :
                        currentStatus === "Needs Revision" ? "bg-rose-100 text-rose-800" :
                        currentStatus === "Submitted"      ? "bg-indigo-100 text-indigo-800" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {currentStatus}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ─── Mentor's Weekly Plan Archive & History (Read & Update All Plans) ─── */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <span>Weekly Teaching Plan Archive & History</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Read past submitted plans, view SME verification feedback, or click to edit and update.
            </p>
          </div>

          {/* Filter controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setArchiveFilterScope("current")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  archiveFilterScope === "current"
                    ? "bg-white text-indigo-700 shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Current Subject ({matchingPlans.length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveFilterScope("all")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  archiveFilterScope === "all"
                    ? "bg-white text-indigo-700 shadow-xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Subjects ({plans.length})
              </button>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={archiveSearch}
                onChange={e => setArchiveSearch(e.target.value)}
                placeholder="Search archive..."
                className="pl-8 pr-3 py-1 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 w-36"
              />
            </div>
          </div>
        </div>

        {/* Archive Table */}
        <div className="overflow-x-auto mt-3">
          <Table className="w-full text-left border-collapse text-xs">
            <TableHeader>
              <TableRow className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <TableHead className="py-2.5 px-3">Week</TableHead>
                <TableHead className="py-2.5 px-3">Class / Cohort</TableHead>
                <TableHead className="py-2.5 px-3">Subject</TableHead>
                <TableHead className="py-2.5 px-3">Date Range</TableHead>
                <TableHead className="py-2.5 px-3 text-center">Sessions</TableHead>
                <TableHead className="py-2.5 px-3 text-center">SME Status</TableHead>
                <TableHead className="py-2.5 px-3">Remarks / Feedback</TableHead>
                <TableHead className="py-2.5 px-3 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {filteredArchivePlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-slate-400 italic font-medium">
                    No weekly plans found in archive.
                  </TableCell>
                </TableRow>
              ) : (
                filteredArchivePlans.map(p => {
                  const tasks = parseSessionPlan(p.session_plan);
                  const filledCount = tasks.filter(t => t.topic && t.topic.trim().length > 0).length;
                  const isCurrent = p.week_number === selectedWeek &&
                    p.class_group.toLowerCase().trim() === selectedClass.toLowerCase().trim() &&
                    p.subject.toLowerCase().trim() === selectedSubject.toLowerCase().trim();

                  return (
                    <TableRow
                      key={p.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isCurrent ? "bg-indigo-50/40 font-semibold" : ""
                      }`}
                    >
                      <TableCell className="py-2.5 px-3">
                        <span className="font-black text-indigo-700 text-xs">Week {p.week_number}</span>
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-slate-800 font-bold">
                        {p.class_group}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-slate-800 font-medium">
                        {p.subject}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {p.start_date && p.end_date ? `${p.start_date} to ${p.end_date}` : "—"}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
                          {filledCount} / {tasks.length}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase whitespace-nowrap ${
                          p.status === "Verified" ? "bg-emerald-100 text-emerald-800" :
                          p.status === "Needs Revision" ? "bg-rose-100 text-rose-800" :
                          p.status === "Submitted" ? "bg-indigo-100 text-indigo-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {p.status === "Verified" ? "Approved" : p.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-slate-600 text-xs max-w-xs truncate">
                        {p.sme_remarks || p.cam_feedback || "—"}
                      </TableCell>
                      <TableCell className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenFromArchive(p)}
                          className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700"
                          }`}
                        >
                          {p.status === "Verified" ? "Read Plan" : "Read / Edit"}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

/* =========================================================================
   2. MANAGER & SME WEEKLY PLAN VIEWER (For CM, SME, and KAM to view & verify)
   ========================================================================= */
export interface WeeklyPlanViewerProps {
  collegeId?: string;
  collegeName?: string;
  role: "cm" | "sme" | "kam" | "admin";
  reviewerName: string;
  allowedCollegeIds?: string[];
  allColleges?: { id: string; name: string }[];
}

export const WeeklyPlanViewer: React.FC<WeeklyPlanViewerProps> = ({
  collegeId,
  collegeName,
  role,
  reviewerName,
  allowedCollegeIds,
  allColleges = []
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [selectedCollege, setSelectedCollege] = useState<string>(collegeId || "all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // SME Review / Verification State
  const [selectedPlanForReview, setSelectedPlanForReview] = useState<WeeklyPlanRecord | null>(null);
  const [feedbackInput, setFeedbackInput] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // Skill Development Tracker: per-skill-plan verdict marking (SME)
  const [skillVerdictBusy, setSkillVerdictBusy] = useState<boolean>(false);

  // Detail Drawer
  const [inspectingPlan, setInspectingPlan] = useState<WeeklyPlanRecord | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Reset page when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCollege, selectedWeek, selectedStatus, searchQuery]);

  const plansQuery = useQuery({
    queryKey: qk.weeklyPlan(selectedCollege || "all", "all"),
    queryFn: async () => {
      const q =
        selectedCollege && selectedCollege !== "all"
          ? `?collegeId=${encodeURIComponent(selectedCollege)}&includeAudit=true`
          : `?includeAudit=true`;
      const data = await apiFetch(`/api/weekly-plan${q}`);
      return data?.success && Array.isArray(data.plans)
        ? (data.plans as WeeklyPlanRecord[])
        : [];
    },
  });

  const plans = plansQuery.data || [];
  const loading = plansQuery.isFetching;

  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ["weekly-plan"] });
    };
    window.addEventListener("fp_weekly_plan_updated", handleSync);
    return () => {
      window.removeEventListener("fp_weekly_plan_updated", handleSync);
    };
  }, [queryClient]);

  // Filtered plans
  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      if (allowedCollegeIds && allowedCollegeIds.length > 0 && !allowedCollegeIds.includes(p.college_id)) {
        return false;
      }
      if (selectedCollege !== "all" && p.college_id !== selectedCollege) {
        return false;
      }
      if (selectedWeek !== "all" && String(p.week_number) !== selectedWeek) {
        return false;
      }
      if (selectedStatus !== "all" && p.status !== selectedStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchMentor = (p.mentor_name || "").toLowerCase().includes(q);
        const matchSubj = (p.subject || "").toLowerCase().includes(q);
        const matchClass = (p.class_group || "").toLowerCase().includes(q);
        const matchDept = (p.department || "").toLowerCase().includes(q);
        if (!matchMentor && !matchSubj && !matchClass && !matchDept) return false;
      }
      return true;
    });
  }, [plans, allowedCollegeIds, selectedCollege, selectedWeek, selectedStatus, searchQuery]);

  // Pagination slicing & clamping
  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedPlans = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredPlans.slice(start, start + pageSize);
  }, [filteredPlans, safePage, pageSize]);

  // Infographic aggregates for currently filtered plans
  const totalCount = filteredPlans.length;
  const verifiedCount = filteredPlans.filter(p => p.status === "Verified").length;
  const pendingCount = filteredPlans.filter(p => p.status === "Submitted").length;
  const revisionCount = filteredPlans.filter(p => p.status === "Needs Revision").length;

  // Topics audit calculation across filtered plans
  let plannedTopicsSum = 0;
  let conductedTopicsSum = 0;
  filteredPlans.forEach(p => {
    const tasks = parseSessionPlan(p.session_plan);
    tasks.forEach(t => {
      if (t.topic && t.topic.trim()) {
        plannedTopicsSum += 1;
        if (t.conductedStatus === "Completed" || t.status === "Completed") {
          conductedTopicsSum += 1;
        }
      }
    });
  });

  const pendingTopicsSum = Math.max(0, plannedTopicsSum - conductedTopicsSum);
  const completionPercentage = plannedTopicsSum > 0
    ? Math.round((conductedTopicsSum / plannedTopicsSum) * 100)
    : 0;

  // SME Skill Verdict for skill-subject plans (Mentor Skill Development Tracker)
  const handleSkillVerdict = async (plan: WeeklyPlanRecord, verdict: "cleared" | "not_cleared") => {
    if (!plan.skill_verdict || plan.skill_verdict.verdict === verdict) return;
    setSkillVerdictBusy(true);
    try {
      const data = await apiFetch("/api/skill-tracker", {
        method: "POST",
        body: {
          mentorId: plan.mentor_id,
          mentorName: plan.mentor_name,
          collegeId: plan.college_id,
          subject: plan.subject,
          subjectType: plan.subject_type,
          weekNumber: plan.week_number,
          scope: "week",
          weeklyPlanId: plan.id,
          status: verdict,
          remarks: feedbackInput || (plan.skill_verdict.remarks ?? ""),
          verifiedBy: reviewerName || "Reviewer"
        }
      });
      if (data.success) {
        toast(`Skill verdict recorded: ${verdict === "cleared" ? "Cleared" : "Not Cleared"}.`, "success");
        setSelectedPlanForReview(null);
        await queryClient.invalidateQueries({ queryKey: ["weekly-plan"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_weekly_plan_updated"));
        }
      } else {
        toast(data.message || "Failed to record skill verdict", "error");
      }
    } catch (e: any) {
      toast("Error recording skill verdict: " + e.message, "error");
    } finally {
      setSkillVerdictBusy(false);
    }
  };

  // SME Handle Review Action (Verify or Request Revision)
  const handleReviewAction = async (status: "Verified" | "Needs Revision") => {
    if (!selectedPlanForReview) return;
    setSubmittingReview(true);
    try {
      const data = await apiFetch("/api/weekly-plan", {
        method: "PATCH",
        body: {
          id: selectedPlanForReview.id,
          status,
          smeRemarks: feedbackInput,
          camFeedback: feedbackInput,
          verifiedBy: reviewerName
        }
      });
      if (data.success) {
        toast(`Weekly plan marked as ${status}.`, "success");
        setSelectedPlanForReview(null);
        setFeedbackInput("");
        await queryClient.invalidateQueries({ queryKey: ["weekly-plan"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_weekly_plan_updated"));
        }
      } else {
        toast(data.message || "Failed to update review", "error");
      }
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setSubmittingReview(false);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = filteredPlans.flatMap(p => {
        const tasks = parseSessionPlan(p.session_plan);
        if (tasks.length === 0) {
          return [
            {
              "Plan ID": p.id,
              "Campus ID": p.college_id,
              "Faculty Name": p.mentor_name || "—",
              "Department": p.department || "—",
              "Class / Cohort": p.class_group,
              "Subject": p.subject,
              "Week": `Week ${p.week_number}`,
              "Start Date": p.start_date || "—",
              "End Date": p.end_date || "—",
              "Unit": p.unit || "—",
              "Day Order": "—",
              "Period Slot": "—",
              "Daily Topic": p.topics_planned || "—",
              "Teaching Mode": "—",
              "Tracker Conducted Status": "—",
              "SME Status": p.status,
              "SME Remarks": p.sme_remarks || p.cam_feedback || "—"
            }
          ];
        }
        return tasks.map(t => ({
          "Plan ID": p.id,
          "Campus ID": p.college_id,
          "Faculty Name": p.mentor_name || "—",
          "Department": p.department || "—",
          "Class / Cohort": p.class_group,
          "Subject": p.subject,
          "Week": `Week ${p.week_number}`,
          "Start Date": p.start_date || "—",
          "End Date": p.end_date || "—",
          "Unit": p.unit || "—",
          "Day": t.day,
          "Date": t.date || "—",
          "Day Order": t.dayOrder || "—",
          "Period Slot": t.periodSlot || "—",
          "Daily Topic": t.topic,
          "Learning Objectives": t.objectives,
          "Teaching Mode": t.teachingMode,
          "Tracker Conducted Status": t.conductedStatus || "Pending",
          "Material Link": t.materialUrl || "—",
          "SME Status": p.status,
          "SME Remarks": p.sme_remarks || p.cam_feedback || "—"
        }));
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Weekly Plans");
      XLSX.writeFile(wb, `Weekly_Plans_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast("Exported weekly plans to Excel.", "success");
    } catch (err: any) {
      toast("Export failed: " + err.message, "error");
    }
  };

  const isSME = role === "sme" || role === "admin";
  const isViewOnly = role === "cm" || role === "kam";

  return (
    <div className="space-y-5 font-sans">
      {/* ─── Top Role & Scope Banner ─── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border ${
                isSME
                  ? "bg-purple-50 border-purple-100 text-purple-600"
                  : role === "kam"
                  ? "bg-sky-50 border-sky-100 text-sky-600"
                  : "bg-indigo-50 border-indigo-100 text-indigo-600"
              }`}
            >
              <CalendarRange className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900">
                  {isSME
                    ? "SME Weekly Teaching Plan Verification"
                    : role === "kam"
                    ? "KAM Academic Plan Oversight"
                    : "Campus Weekly Plan Monitor"}
                </h2>
                {collegeName && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700">
                    {collegeName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ActionDropdownButton />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={() => plansQuery.refetch()}
                  disabled={loading}
                  className="gap-2 cursor-pointer text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  <span>Refresh Data</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExportExcel}
                  className="gap-2 cursor-pointer text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export (.xlsx)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ─── Infographics / Visual KPI Summary Cards ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Plans</span>
              <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-xl font-black text-slate-900">{totalCount}</div>
            <span className="text-[10px] font-bold text-slate-500 block">Submitted Cohorts</span>
          </div>

          <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Planned Topics</span>
              <BookOpen className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="text-xl font-black text-indigo-950">{plannedTopicsSum}</div>
            <span className="text-[10px] font-bold text-indigo-600 block">Scheduled Periods</span>
          </div>

          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Conducted</span>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-emerald-900">{conductedTopicsSum}</div>
            <span className="text-[10px] font-bold text-emerald-700 block">Completed in Tracker</span>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Pending Topics</span>
              <Clock3 className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-xl font-black text-amber-900">{pendingTopicsSum}</div>
            <span className="text-[10px] font-bold text-amber-700 block">Backlog / Upcoming</span>
          </div>

          <div className="p-3 bg-white border border-slate-100 rounded-2xl space-y-1 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Completion</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="text-xl font-black text-slate-900">{completionPercentage}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, completionPercentage)}%` }}
              />
            </div>
          </div>

          <div className="p-3 bg-white border border-slate-100 rounded-2xl space-y-1 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">SME Verified</span>
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800">
                {verifiedCount} ✓
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-100 text-indigo-800">
                {pendingCount} Pending
              </span>
              {revisionCount > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800">
                  {revisionCount} Rev
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ─── Filters Bar ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-100 mt-4">
          {allColleges.length > 1 && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Campus / College
              </label>
              <select
                aria-label="Campus / College"
                value={selectedCollege}
                onChange={e => setSelectedCollege(e.target.value)}
                className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">All Campuses</option>
                {allColleges.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Academic Week
            </label>
            <select
              aria-label="Academic Week"
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Academic Weeks</option>
              {Array.from({ length: 16 }, (_, i) => i + 1).map(w => (
                <option key={w} value={String(w)}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              SME Status
            </label>
            <select
              aria-label="SME Status"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="Submitted">Submitted (Pending SME Review)</option>
              <option value="Verified">Verified by SME</option>
              <option value="Needs Revision">Needs Revision</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <div className={allColleges.length <= 1 ? "md:col-span-2" : ""}>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label="Search"
                placeholder="Search mentor, subject, cohort..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Plans Table ─── */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse text-xs min-w-[850px]">
            <TableHeader>
              <TableRow className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                <TableHead className="p-3.5">Week</TableHead>
                <TableHead className="p-3.5">Dates</TableHead>
                <TableHead className="p-3.5">Faculty / Mentor</TableHead>
                <TableHead className="p-3.5">Class / Cohort</TableHead>
                <TableHead className="p-3.5">Subject</TableHead>
                <TableHead className="p-3.5 text-center">Type</TableHead>
                <TableHead className="p-3.5 text-center">Periods Planned</TableHead>
                <TableHead className="p-3.5 text-center">Conducted</TableHead>
                <TableHead className="p-3.5 text-center">SME Status</TableHead>
                <TableHead className="p-3.5 text-center">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 font-medium">
              {filteredPlans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-8 text-center text-slate-400 italic">
                    No weekly plans found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPlans.map(plan => {
                  const tasks = parseSessionPlan(plan.session_plan);
                  const filledPeriodsCount = tasks.filter(t => t.topic && t.topic.trim().length > 0).length;
                  const conductedCount = tasks.filter(
                    t => t.conductedStatus === "Completed" || t.status === "Completed"
                  ).length;

                  return (
                    <TableRow
                      key={plan.id}
                      onClick={() => setInspectingPlan(plan)}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                    >
                      <TableCell className="p-3.5 font-black text-indigo-700">Week {plan.week_number}</TableCell>
                      <TableCell className="p-3.5 text-slate-500 text-[11px]">
                        {plan.start_date || plan.end_date ? (
                          <span>
                            {plan.start_date || "—"} to {plan.end_date || "—"}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unscheduled</span>
                        )}
                      </TableCell>
                      <TableCell className="p-3.5">
                        <div className="font-extrabold text-slate-900">{plan.mentor_name || "Unassigned"}</div>
                        <div className="text-[10px] text-slate-400">{plan.mentor_id}</div>
                      </TableCell>
                      <TableCell className="p-3.5">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px]">
                          {plan.class_group}
                        </span>
                      </TableCell>
                      <TableCell className="p-3.5 font-bold text-slate-800">{plan.subject}</TableCell>
                      <TableCell className="p-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                            (plan.subject_type || "Academic") === "Skill"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          }`}
                        >
                          {plan.subject_type || "Academic"}
                        </span>
                      </TableCell>
                      <TableCell className="p-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700`}>
                          {tasks.length > 0 ? `${filledPeriodsCount} / ${tasks.length} Periods` : `${filledPeriodsCount} Period${filledPeriodsCount === 1 ? "" : "s"}`}
                        </span>
                      </TableCell>
                      <TableCell className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            conductedCount === filledPeriodsCount && filledPeriodsCount > 0
                              ? "bg-emerald-100 text-emerald-800"
                              : conductedCount > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {conductedCount} / {filledPeriodsCount} Conducted
                        </span>
                      </TableCell>
                      <TableCell className="p-3.5 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            plan.status === "Verified"
                              ? "bg-emerald-100 text-emerald-800"
                              : plan.status === "Needs Revision"
                              ? "bg-rose-100 text-rose-800"
                              : plan.status === "Submitted"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {plan.status}
                        </span>
                      </TableCell>
                      <TableCell className="p-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInspectingPlan(plan)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            <span>{isViewOnly ? "View Audit" : "Inspect"}</span>
                          </button>
                          {isSME && plan.status === "Submitted" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPlanForReview(plan);
                                setFeedbackInput(plan.sme_remarks || plan.cam_feedback || "");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle className="h-3 w-3" />
                              <span>Approve / Reject</span>
                            </button>
                          )}
                          {isSME && plan.status === "Verified" && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPlanForReview(plan);
                                setFeedbackInput(plan.sme_remarks || plan.cam_feedback || "");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-[10.5px] transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              <span>Re-verify</span>
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {filteredPlans.length > 0 && (
          <Pagination
            currentPage={safePage}
            totalItems={filteredPlans.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        )}
      </div>

      {/* ─── Detailed Plan Inspection Modal with Clean Period Schedule Table ─── */}
      {inspectingPlan && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) setInspectingPlan(null); }}
          ariaLabel="Weekly Plan Details"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          panelClassName="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl p-0 space-y-0 animate-scaleUp"
        >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                  <CalendarRange className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-black text-slate-900">
                      Week {inspectingPlan.week_number} Plan: {inspectingPlan.subject}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        inspectingPlan.status === "Verified"
                          ? "bg-emerald-100 text-emerald-800"
                          : inspectingPlan.status === "Needs Revision"
                          ? "bg-rose-100 text-rose-800"
                          : inspectingPlan.status === "Submitted"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {inspectingPlan.status}
                    </span>
                    {isViewOnly && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600">
                        View-Only Mode
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Faculty: <span className="font-bold text-slate-800">{inspectingPlan.mentor_name}</span> • Cohort:{" "}
                    <span className="font-bold text-slate-800">{inspectingPlan.class_group}</span>
                    {(inspectingPlan.start_date || inspectingPlan.end_date) && (
                      <span>
                        {" "}
                        • Dates: {inspectingPlan.start_date} to {inspectingPlan.end_date}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingPlan(null)}
                aria-label="Close plan details"
                className="h-8 w-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Summary Details Box */}


              {/* ─── Planned vs Completed Topics Comparison Table ─── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      Teaching Period Schedule & Conduction Audit
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700">
                      Cross-Referenced with Academic Tracker
                    </span>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <Table className="w-full text-left border-collapse text-xs">
                    <TableHeader>
                      <TableRow className="bg-slate-100/70 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                        <TableHead className="py-2.5 px-3 w-12 text-center">#</TableHead>
                        <TableHead className="py-2.5 px-3 w-28">Day</TableHead>
                        <TableHead className="py-2.5 px-3 w-28">Date</TableHead>
                        <TableHead className="py-2.5 px-3 w-24">Day Order</TableHead>
                        <TableHead className="py-2.5 px-3 w-40">Period Slot</TableHead>
                        <TableHead className="py-2.5 px-3 w-32">Mode</TableHead>
                        <TableHead className="py-2.5 px-3">Topic Planned</TableHead>
                        <TableHead className="py-2.5 px-3 w-44">Tracker Conduction Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {parseSessionPlan(inspectingPlan.session_plan).map((task, idx) => {
                        const isConducted = task.conductedStatus === "Completed" || task.status === "Completed";

                        return (
                          <TableRow key={idx} className={isConducted ? "bg-emerald-50/20" : ""}>
                            <TableCell className="py-2.5 px-3 text-center font-bold text-slate-500">P{idx + 1}</TableCell>
                            <TableCell className="py-2.5 px-3 font-extrabold text-slate-800">{task.day}</TableCell>
                            <TableCell className="py-2.5 px-3 text-slate-600">{task.date || "—"}</TableCell>
                            <TableCell className="py-2.5 px-3">
                              {task.dayOrder && task.dayOrder !== "None" ? (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                  {task.dayOrder}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 px-3 text-slate-700 font-medium">{task.periodSlot || "—"}</TableCell>
                            <TableCell className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                {task.teachingMode}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">
                                {task.topic || <span className="text-slate-400 italic">No topic specified</span>}
                              </div>
                              {task.objectives && (
                                <div className="text-[10.5px] text-slate-500 mt-0.5">{task.objectives}</div>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 px-3">
                              {isConducted ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Conducted</span>
                                </span>
                              ) : task.topic ? (
                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Pending</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* SME Remarks & Verification Details */}
              {(inspectingPlan.sme_remarks || inspectingPlan.cam_feedback) && (
                <div
                  className={`p-4 rounded-xl border ${
                    inspectingPlan.status === "Verified"
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <span
                    className={`text-xs font-black uppercase tracking-wider block ${
                      inspectingPlan.status === "Verified" ? "text-emerald-900" : "text-amber-900"
                    }`}
                  >
                    SME Remarks & Academic Feedback:
                  </span>
                  <p
                    className={`text-xs font-medium mt-1 ${
                      inspectingPlan.status === "Verified" ? "text-emerald-800" : "text-amber-800"
                    }`}
                  >
                    {inspectingPlan.sme_remarks || inspectingPlan.cam_feedback}
                  </p>
                  {inspectingPlan.verified_by && (
                    <span
                      className={`text-[10px] font-bold block mt-1 ${
                        inspectingPlan.status === "Verified" ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      Reviewed by {inspectingPlan.verified_by} on {inspectingPlan.verified_at}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <span className="text-xs text-slate-400 font-medium">Plan ID: {inspectingPlan.id}</span>
              <div className="flex items-center gap-2">
                {isSME && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlanForReview(inspectingPlan);
                      setFeedbackInput(inspectingPlan.sme_remarks || inspectingPlan.cam_feedback || "");
                      setInspectingPlan(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>SME Verify & Remarks</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectingPlan(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
        </Dialog>
      )}

      {/* ─── SME Review & Verification Decision Modal ─── */}
      {selectedPlanForReview && isSME && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) setSelectedPlanForReview(null); }}
          ariaLabel="SME Weekly Plan Verification"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          panelClassName="max-w-lg max-h-[90vh] rounded-2xl p-0 space-y-0 animate-scaleUp"
        >
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-purple-600" />
                    <span>SME Weekly Plan Verification</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Faculty: {selectedPlanForReview.mentor_name} • Week {selectedPlanForReview.week_number} •{" "}
                    {selectedPlanForReview.subject}
                    {(selectedPlanForReview.subject_type || "Academic") === "Skill" && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[9.5px] font-black uppercase">Skill</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPlanForReview(null)}
                  aria-label="Close SME verification"
                  className="h-7 w-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                {/* Current plan status context for SME */}
                <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Current Status</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    selectedPlanForReview.status === "Verified"       ? "bg-emerald-100 text-emerald-800" :
                    selectedPlanForReview.status === "Needs Revision" ? "bg-rose-100 text-rose-800" :
                    selectedPlanForReview.status === "Submitted"      ? "bg-indigo-100 text-indigo-800" :
                    "bg-slate-200 text-slate-600"
                  }`}>{selectedPlanForReview.status}</span>
                  {(selectedPlanForReview.sme_remarks || selectedPlanForReview.cam_feedback) && (
                    <span className="text-[10.5px] text-slate-500 font-medium ml-auto max-w-xs truncate">
                      Last remark: “{selectedPlanForReview.sme_remarks || selectedPlanForReview.cam_feedback}”
                    </span>
                  )}
                </div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  SME Remarks &amp; Decision
                </label>
                <textarea
                  aria-label="SME Remarks & Decision"
                  rows={4}
                  placeholder="Write your remarks, feedback, or approval note..."
                  value={feedbackInput}
                  onChange={e => setFeedbackInput(e.target.value)}
                  className="w-full p-3 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs text-slate-800 outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => setSelectedPlanForReview(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingReview || !feedbackInput.trim()}
                  onClick={() => handleReviewAction("Needs Revision")}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 cursor-pointer"
                >
                  Request Revision
                </button>
                {(selectedPlanForReview.subject_type || "Academic") === "Skill" && (
                  <button
                    type="button"
                    disabled={submittingReview || skillVerdictBusy}
                    onClick={() => handleSkillVerdict(selectedPlanForReview, "not_cleared")}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-white hover:bg-rose-50 border border-rose-300 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Skill: Not Cleared</span>
                  </button>
                )}
                {(selectedPlanForReview.subject_type || "Academic") === "Skill" && (
                  <button
                    type="button"
                    disabled={submittingReview || skillVerdictBusy}
                    onClick={() => handleSkillVerdict(selectedPlanForReview, "cleared")}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <Award className="h-3.5 w-3.5" />
                    <span>Skill: Cleared</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => handleReviewAction("Verified")}
                  className="px-4 py-2 rounded-xl text-xs font-black text-white bg-purple-600 hover:bg-purple-700 shadow-xs disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Verify & Approve Plan</span>
                </button>
              </div>
            </div>
        </Dialog>
      )}
    </div>
  );
};
