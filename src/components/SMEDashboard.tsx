"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { prefetchRoleTab } from "@/lib/prefetch";
import { apiFetch } from "@/lib/apiFetch";
import { getLocalDateStr } from "@/lib/localDate";
import { Card } from "@/components/Card";
import { Panel } from "@/components/Panel";
import { Pagination } from "@/components/ui/Pagination";
import { Dialog } from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Sparkles,
  Pencil,
  ClipboardList,
  ClipboardCheck,
  CheckCircle,
  AlertCircle,
  FileText,
  User,
  Award,
  Calendar,
  RefreshCw,
  Check,
  Search,
  Clock,
  Eye,
  ChevronDown,
  ChevronUp,
  Lock,
  X,
  AlertTriangle,
  Download,
  Target,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  Activity,
  UserCheck,
  Plus,
  Trash2,
  Save,
  SlidersHorizontal,
  CheckSquare,
  CalendarRange,
  GraduationCap,
  Menu,
  Video,
  Link2,
  RotateCcw
} from "lucide-react";
import { WeeklyPlanViewer } from "./WeeklyPlanStudio";
import { SkillTrackerPanel } from "./SkillTrackerPanel";
import { DemoEvalCriteriaPanel, EvaluationChecklist, ChecklistEntry } from "./DemoEvalCriteriaPanel";
import { SMEProfileTab } from "@/components/sme/SMEProfileTab";
import SMEReallocationPlanner from "@/components/sme/SMEReallocationPlanner";
import {
  MAX_CRITERION_MARKS,
  roundMarks,
  clampCriterionMax,
  clampCriterionScore,
  calculateScaledMark
} from "@/lib/demoScoring";
import {
  buildScoreBreakdown,
  resolveSessionDisplayScores,
  parseChecklistSnapshot,
  formatEvalTimestamp
} from "@/lib/demoEvaluationRecord";

type TabKey = "overview" | "demo_list" | "weekly_plans" | "skill_approvals" | "availability" | "reallocation" | "history" | "calendar" | "reallocation_hub" | "eval_criteria" | "more_menu" | "profile";

interface SMEDashboardProps {
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
}

export interface ScoringCriterion {
  key: string;
  label: string;
  max: number;
}

const DEFAULT_EVAL_CRITERIA: ScoringCriterion[] = [
  { key: "attendance", label: "Attendance", max: MAX_CRITERION_MARKS },
  { key: "subjectKnowledge", label: "Subject Knowledge", max: MAX_CRITERION_MARKS },
  { key: "teachingMethodology", label: "Teaching Methodology", max: MAX_CRITERION_MARKS },
  { key: "communicationSkills", label: "Communication Skills", max: MAX_CRITERION_MARKS },
  { key: "technicalSkills", label: "Technical Skills", max: MAX_CRITERION_MARKS },
  { key: "studentInteraction", label: "Student Interaction", max: MAX_CRITERION_MARKS },
  { key: "classroomManagement", label: "Classroom Management", max: MAX_CRITERION_MARKS },
  { key: "questionHandling", label: "Question Handling", max: MAX_CRITERION_MARKS },
  { key: "timeManagement", label: "Time Management", max: MAX_CRITERION_MARKS },
  { key: "overallRemarks", label: "Overall Remarks", max: MAX_CRITERION_MARKS },
];

const EVAL_CRITERIA = DEFAULT_EVAL_CRITERIA;

const DEFAULT_SCORES: Record<string, number> = {
  attendance: 4,
  subjectKnowledge: 4,
  teachingMethodology: 4,
  communicationSkills: 4,
  technicalSkills: 4,
  studentInteraction: 4,
  classroomManagement: 4,
  questionHandling: 4,
  timeManagement: 4,
  overallRemarks: 4,
};

export function SMEDashboard({ activeTab: propTab, onTabChange }: SMEDashboardProps = {}) {
  const {
    currentSME,
    smes,
    demoSessions,
    demoRules,
    evaluateDemoSession,
    requestDemoSwap,
    mentors,
    slots,
    holidays,
    leaveRequests,
    weekDates,
    colleges,
    demoSwapRequests,
    demoReallocations,
    coursesList,
    resolveDemoSwap,
    refreshData,
    subjectGroups,
    smeAvailability,
    saveSmeAvailability,
    deleteSmeAvailabilityWindow
  } = useApp();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sidebar collapse state
  const sidebarRef = useRef<HTMLElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fp_sidebar_collapsed") === "true";
      setIsCollapsed(stored || false);
    }
  }, []);

  // Tab state
  const [internalTab, setInternalTab] = useState<TabKey>("overview");
  const rawActiveTab: TabKey = propTab || internalTab;

  // Map legacy route keys to the primary SME tabs
  const activeTab: TabKey = useMemo(() => {
    if (rawActiveTab === "calendar") return "availability";
    if (rawActiveTab === "reallocation_hub") return "reallocation";
    if (rawActiveTab === "demo_list") return "overview";
    return rawActiveTab;
  }, [rawActiveTab]);

  const handleTabChange = (key: TabKey) => {
    const targetKey = key === "demo_list" ? "overview" : key;
    if (onTabChange) {
      onTabChange(targetKey);
    } else {
      setInternalTab(targetKey);
    }
    setPage(1);
  };

  // Pagination state for Demo List
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Pagination state for History List
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyPageSize, setHistoryPageSize] = useState<number>(10);

  // Evaluation modal state
  // Dynamic Evaluation Criteria (CRUD) state — each criterion capped at <= 5 marks (decimals supported)
  const [criteriaList, setCriteriaList] = useState<ScoringCriterion[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("fp_sme_eval_scoring_criteria");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((c: any) => ({
              key: String(c?.key || `crit_${Date.now()}`),
              label: String(c?.label || "Criterion"),
              max: clampCriterionMax(c?.max)
            }));
          }
        }
      } catch (_) {}
    }
    return DEFAULT_EVAL_CRITERIA;
  });

  const saveCriteriaList = (updated: ScoringCriterion[]) => {
    const normalized = updated.map(c => ({
      ...c,
      max: clampCriterionMax(c.max)
    }));
    setCriteriaList(normalized);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("fp_sme_eval_scoring_criteria", JSON.stringify(normalized));
      } catch (_) {}
    }
  };

  const handleResetCriteriaDefaults = () => {
    saveCriteriaList(DEFAULT_EVAL_CRITERIA);
    toast("Reset evaluation criteria to system defaults (Max 5 marks each).", "success");
  };

  // Evaluation Criteria Sub-tab (Rubric vs Compliance Checklist)
  const [evalCriteriaSubTab, setEvalCriteriaSubTab] = useState<"rubric" | "compliance">("rubric");

  const [evaluationModalSession, setEvaluationModalSession] = useState<any | null>(null);
  const [evalScores, setEvalScores] = useState<Record<string, number | string>>({ ...DEFAULT_SCORES });
  const [comments, setComments] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  // Phase C: department compliance checklist entries for the open evaluation
  const [checklistEntries, setChecklistEntries] = useState<ChecklistEntry[]>([]);

  // Read-only View Evaluation modal
  const [viewEvalSession, setViewEvalSession] = useState<any | null>(null);

  // Reallocation Modal state
  const [swapModalSession, setSwapModalSession] = useState<any | null>(null);
  const [swapReason, setSwapReason] = useState<string>("CM Approved Mentor Leave");
  const [swapRemarks, setSwapRemarks] = useState<string>("");
  const [swapStep, setSwapStep] = useState<number>(1);
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);
  const [selectedProposedMentor, setSelectedProposedMentor] = useState<any | null>(null);
  const [selectedProposedTime, setSelectedProposedTime] = useState<any | null>(null);

  // Dynamic Availability Editor state
  const [showAvailModal, setShowAvailModal] = useState(false);
  const [selectedAvailDay, setSelectedAvailDay] = useState<string>("ALL");
  const [dayWindows, setDayWindows] = useState<Array<{ id?: string; startTime: string; endTime: string; slotType: "demo" | "training" | "other"; notes?: string }>>([
    { startTime: "09:00 AM", endTime: "05:30 PM", slotType: "demo" }
  ]);
  const [isSavingAvail, setIsSavingAvail] = useState(false);

  // Constant Course Google Meet Link State
  const [showCourseMeetModal, setShowCourseMeetModal] = useState(false);
  const [selectedCourseForMeet, setSelectedCourseForMeet] = useState<any | null>(null);
  const [courseMeetInput, setCourseMeetInput] = useState("");
  const [savingCourseMeet, setSavingCourseMeet] = useState(false);

  const handleSaveCourseMeet = async () => {
    setSavingCourseMeet(true);
    try {
      const res = await apiFetch<any>("/api/courses/meet-link", {
        method: "POST",
        body: JSON.stringify({
          subject: currentSME?.subject || "All Assigned Courses",
          meetLink: courseMeetInput.trim()
        })
      });
      if (res.success) {
        toast("Permanent Google Meet link updated successfully!", "success");
        setShowCourseMeetModal(false);
        await refreshData();
      } else {
        toast(res.message || "Failed to update Google Meet link", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to update link", "error");
    } finally {
      setSavingCourseMeet(false);
    }
  };

  // Time format conversion helpers
  const to24Hour = (time12: string) => {
    if (!time12) return "09:00";
    const match = time12.match(/^(\d+)(?:\.(\d+)|:(\d+))?\s*(AM|PM)/i);
    if (!match) return time12.length === 5 ? time12 : "09:00";
    let hr = parseInt(match[1]);
    const min = match[2] ? match[2] : (match[3] ? match[3] : "00");
    const isPm = match[4].toUpperCase() === "PM";
    if (isPm && hr < 12) hr += 12;
    if (!isPm && hr === 12) hr = 0;
    return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  };

  const to12Hour = (time24: string) => {
    if (!time24) return "09:00 AM";
    const parts = time24.split(":");
    if (parts.length < 2) return time24;
    let hr = parseInt(parts[0]);
    const min = parts[1];
    const isPm = hr >= 12;
    if (hr > 12) hr -= 12;
    if (hr === 0) hr = 12;
    return `${String(hr).padStart(2, "0")}:${min} ${isPm ? "PM" : "AM"}`;
  };

  // Helper to ensure external links have absolute https:// protocol
  const ensureAbsoluteUrl = (url?: string | null): string => {
    if (!url) return "";
    const trimmed = String(url).trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  // Helper to parse time string to minutes (supports period-prefixed, 12h & 24h formats)
  const parseTimeToMin = (t: string) => {
    if (!t) return 9999;
    const str = String(t).trim();
    const match = str.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/i);
    if (!match) return 9999;
    let hr = parseInt(match[1], 10);
    const min = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3] ? match[3].toUpperCase() : null;
    if (ampm === "PM" && hr < 12) hr += 12;
    if (ampm === "AM" && hr === 12) hr = 0;
    return hr * 60 + min;
  };

  // Helper to parse timetable time slot window into start & end minutes (handles period names)
  const parseSlotWindow = (t: string) => {
    if (!t) return { startMin: 0, endMin: 0 };
    const matches = Array.from(String(t).matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?/gi));
    if (matches.length >= 2) {
      let s = parseTimeToMin(matches[0][0]);
      let e = parseTimeToMin(matches[1][0]);
      const m1Ampm = matches[0][3];
      const m2Ampm = matches[1][3];
      if (!m1Ampm && m2Ampm) {
        const sHr = parseInt(matches[0][1], 10);
        const eHr = parseInt(matches[1][1], 10);
        if (m2Ampm.toUpperCase() === "PM" && sHr < 12 && sHr <= eHr) {
          s += 12 * 60;
        }
      }
      if (e <= s) e = s + 50;
      return { startMin: Math.max(0, s), endMin: Math.max(s, e) };
    }
    if (matches.length === 1) {
      const s = parseTimeToMin(matches[0][0]);
      return { startMin: Math.max(0, s), endMin: Math.max(0, s + 50) };
    }
    return { startMin: 0, endMin: 0 };
  };

  // Precise time-slot evaluation gating rule: SME can evaluate during scheduled slot plus a 45-minute grace window
  const getDemoEvaluationTiming = (demo: any): {
    canEvaluate: boolean;
    status: "completed" | "upcoming" | "active" | "expired";
    badgeText: string;
    reason: string;
  } => {
    if (demo.status === "completed") {
      return { canEvaluate: false, status: "completed", badgeText: "Completed", reason: "Session already evaluated." };
    }

    const today = getLocalDateStr();
    if (demo.dateStr > today) {
      return {
        canEvaluate: false,
        status: "upcoming",
        badgeText: "Upcoming",
        reason: `Evaluation locked: demo is scheduled for ${demo.dateStr}. Evaluation opens during its scheduled time slot.`
      };
    }
    if (demo.dateStr < today) {
      return {
        canEvaluate: false,
        status: "expired",
        badgeText: "Slot Expired",
        reason: `Evaluation window closed: demo was scheduled for ${demo.dateStr} and the time slot has expired.`
      };
    }

    // It is today! Check scheduled time slot window
    const { startMin, endMin } = parseSlotWindow(demo.timeSlot);
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    // If slot format could not be parsed to numeric bounds, allow evaluation
    if (startMin <= 0 && endMin <= 0) {
      return {
        canEvaluate: true,
        status: "active",
        badgeText: "Ready",
        reason: "Ready for evaluation."
      };
    }

    if (currentMin < startMin) {
      const waitMins = startMin - currentMin;
      const waitHours = Math.floor(waitMins / 60);
      const remainingMins = waitMins % 60;
      const timeRemaining = waitHours > 0 ? `${waitHours}h ${remainingMins}m` : `${remainingMins}m`;
      return {
        canEvaluate: false,
        status: "upcoming",
        badgeText: `Starts in ${timeRemaining}`,
        reason: `Evaluation locked: demo slot starts at ${demo.timeSlot}. Evaluation opens when the session begins.`
      };
    }

    // 45 minutes grace window after session ends
    if (currentMin > endMin + 45) {
      return {
        canEvaluate: false,
        status: "expired",
        badgeText: "Slot Expired",
        reason: `Evaluation window closed: scheduled slot (${demo.timeSlot}) has expired. Expired sessions cannot be evaluated and must be formally rescheduled.`
      };
    }

    return {
      canEvaluate: true,
      status: "active",
      badgeText: currentMin > endMin ? "Grace Window" : "Active Slot",
      reason: currentMin > endMin ? "Session completed (grace window active). You can evaluate now." : "Session is active. You can evaluate now."
    };
  };

  // Sync dayWindows whenever selectedAvailDay or smeAvailability changes (explicit user configuration only, no auto-popup)
  useEffect(() => {
    if (!currentSME) return;
    const targetDay = selectedAvailDay === "ALL" ? "Monday" : selectedAvailDay;
    const currentSmeWindows = (smeAvailability || [])
      .filter((a: any) => a.sme_id === currentSME.id && a.day_of_week?.toLowerCase().trim() === targetDay.toLowerCase().trim() && a.is_active !== 0)
      .map((a: any) => ({
        id: a.id,
        startTime: a.start_time || "09:00 AM",
        endTime: a.end_time || "05:30 PM",
        slotType: ((a.slot_type === "training" || a.slot_type === "other") ? a.slot_type : "demo") as "demo" | "training" | "other",
        notes: a.notes || ""
      }));

    if (currentSmeWindows.length > 0) {
      setDayWindows(currentSmeWindows);
    } else {
      setDayWindows([{ startTime: "09:00 AM", endTime: "05:30 PM", slotType: "demo" }]);
    }
  }, [selectedAvailDay, smeAvailability, currentSME]);

  // Dynamic matrix rows starting strictly from SME's configured earliest start time
  const matrixTimeSlots = useMemo(() => {
    const currentSmeWindows = (smeAvailability || []).filter(
      (a: any) => a.sme_id === currentSME?.id && a.is_active !== 0
    );

    if (currentSmeWindows.length === 0) {
      return ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:30 PM", "02:30 PM", "03:30 PM", "04:30 PM"];
    }

    // Find min start and max end in minutes across all active windows for this SME
    let minStart = 9999;
    let maxEnd = 0;
    currentSmeWindows.forEach((w: any) => {
      const s = parseTimeToMin(w.start_time);
      const e = parseTimeToMin(w.end_time);
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
    });

    if (minStart >= 9999) minStart = 540; // 09:00 AM
    if (maxEnd <= 0) maxEnd = 1050; // 05:30 PM

    const slots: string[] = [];
    for (let m = minStart; m < maxEnd; m += 60) {
      const nextM = Math.min(m + 60, maxEnd);

      const formatMin = (val: number) => {
        let hr = Math.floor(val / 60);
        const min = val % 60;
        const isPm = hr >= 12;
        let displayHr = hr > 12 ? hr - 12 : hr;
        if (displayHr === 0) displayHr = 12;
        return `${String(displayHr).padStart(2, "0")}:${String(min).padStart(2, "0")} ${isPm ? "PM" : "AM"}`;
      };

      slots.push(`${formatMin(m)} - ${formatMin(nextM)}`);
    }

    return slots.length > 0 ? slots : [
      "09:00 AM - 10:00 AM",
      "10:00 AM - 11:00 AM",
      "11:00 AM - 12:00 PM",
      "12:00 PM - 01:00 PM",
      "01:30 PM - 02:30 PM",
      "02:30 PM - 03:30 PM",
      "03:30 PM - 04:30 PM",
      "04:30 PM - 05:30 PM"
    ];
  }, [smeAvailability, currentSME]);

  // Demo List Filters
  const [filterCollege, setFilterCollege] = useState<string>("All");
  const [filterSubject, setFilterSubject] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterGroup, setFilterGroup] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // History search
  const [historySearch, setHistorySearch] = useState<string>("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const totalMaxMarks = useMemo(() => {
    return roundMarks(criteriaList.reduce((sum, c) => sum + clampCriterionMax(c.max), 0)) || MAX_CRITERION_MARKS;
  }, [criteriaList]);

  // Calculated total marks (decimal safe)
  const marks = useMemo(() => {
    return roundMarks(
      criteriaList.reduce((sum, c) => sum + clampCriterionScore(evalScores[c.key] ?? 0, c.max), 0)
    );
  }, [evalScores, criteriaList]);

  const marksOutOf5 = useMemo(() => {
    return calculateScaledMark(marks, totalMaxMarks, 5);
  }, [marks, totalMaxMarks]);

  const marksNormalized = useMemo(() => {
    if (totalMaxMarks <= 0 || Number.isNaN(marks)) return 0;
    const calc = Math.round((marks / totalMaxMarks) * 100);
    return Number.isFinite(calc) ? Math.max(0, Math.min(100, calc)) : 0;
  }, [marks, totalMaxMarks]);

  if (!currentSME) {
    return (
      <div className="h-64 flex items-center justify-center text-xs font-bold text-slate-500">
        Loading SME Workspace...
      </div>
    );
  }

  // ── Data Derivations ──────────────────────────────────────────────
  // Filter demos for this SME according to assignment & subject group
  const myDemos = demoSessions.filter(ds => {
    if (ds.smeId === currentSME.id) return true;
    if (currentSME.subject && ds.subject?.toLowerCase().trim() === currentSME.subject.toLowerCase().trim()) return true;
    return false;
  });

  // demo_sessions.dateStr is stored as YYYY-MM-DD (see /api/demo-sessions book + getWeekDates)
  const todayStr = getLocalDateStr();
  const todayDemos = myDemos.filter(ds => ds.dateStr === todayStr);

  const confirmedDemos = myDemos.filter(ds => ds.status === "confirmed" || ds.status === "scheduled");
  const completedDemos = myDemos.filter(ds => ds.status === "completed");
  const affectedLeaveDemos = myDemos.filter(ds => ds.status === "reallocation_required");
  const notConductedDemos = myDemos.filter(ds => ds.status === "not_conducted");
  const pendingSmeDemos = myDemos.filter(ds => ds.status === "pending_sme");

  const totalAssigned = myDemos.length;
  const completedCount = completedDemos.length;
  const confirmedCount = confirmedDemos.length;
  const affectedCount = affectedLeaveDemos.length;
  const notConductedCount = notConductedDemos.length;

  const avgScore = completedCount > 0
    ? Math.round(completedDemos.reduce((sum, d) => sum + (d.marks || 0), 0) / completedCount)
    : 0;

  // Courses corresponding to this SME's subject domain
  const smeCourses = (coursesList || []).filter((c: any) => {
    const cName = (c.name || "").toLowerCase().trim();
    const cCode = (c.code || "").toLowerCase().trim();
    const smeSub = (currentSME?.subject || "").toLowerCase().trim();
    return !smeSub || cName.includes(smeSub) || smeSub.includes(cName) || cCode === smeSub;
  });

  // Inbound Reallocation Requests targeting this SME (both modern reallocation_requests and legacy swaps)
  const reallocRequestsForSme = (demoReallocations || []).filter(
    (r: any) => r.sme_id === currentSME.id || r.smeId === currentSME.id
  );
  const pendingInboundRequests = [
    ...reallocRequestsForSme.filter((r: any) => r.status === "pending"),
    ...(demoSwapRequests?.filter(
      (r: any) =>
        (r.proposedSmeId === currentSME.id || r.smeId === currentSME.id) &&
        (r.status === "pending" || r.status === "pending_sme")
    ) || [])
  ];

  // Outbound Reallocation Requests sent by this SME
  const outboundRequests = [
    ...reallocRequestsForSme.filter((r: any) => r.proposed_by === currentSME.name),
    ...(demoSwapRequests?.filter((r: any) => r.smeId === currentSME.id) || [])
  ];

  // Target Rule Derivation for SME's Subject
  const smeSubjectRule = demoRules.find(r => r.subject?.toLowerCase().trim() === (currentSME.subject || "").toLowerCase().trim());
  const weeklyTargetCount = smeSubjectRule?.target || 10;
  const targetProgressPct = Math.min(100, Math.round((completedCount / weeklyTargetCount) * 100));

  // Unique colleges, subjects, and groups for filters
  const uniqueColleges = Array.from(new Set(
    myDemos.map(d => {
      const mentor = mentors.find(m => m.id === d.mentorId);
      return mentor ? colleges.find(c => c.id === mentor.college_id)?.name || "" : "";
    }).filter(Boolean)
  ));
  const uniqueSubjects = Array.from(new Set(myDemos.map(d => d.subject).filter(Boolean)));
  const uniqueGroups = Array.from(new Set(
    myDemos.map(d => {
      const mentor = mentors.find(m => m.id === d.mentorId);
      return mentor?.department || mentor?.mentor_group || d.stream || "";
    }).filter(Boolean)
  ));

  // Notification Counts for Primary SME Sidebar Items
  const sidebarNavItems = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard, count: totalAssigned },
    { id: "weekly_plans", label: "Weekly Plans", icon: CalendarRange, count: 0 },
    { id: "skill_approvals", label: "Skill Approvals", icon: GraduationCap, count: 0 },
    { id: "eval_criteria", label: "Evaluation Criteria", icon: SlidersHorizontal, count: 0 },
    { id: "availability", label: "Availability", icon: Calendar, count: 0 },
    { id: "reallocation", label: "Reallocation", icon: RefreshCw, count: pendingInboundRequests.length + affectedCount },
    { id: "history", label: "History", icon: FileText, count: completedCount }
  ];

  // ── Filtered demo queue for SME Demo List ───────────────────────────
  const filteredDemos = useMemo(() => {
    return myDemos.filter(d => {
      if (filterStatus !== "All") {
        if (filterStatus === "Confirmed" && d.status !== "confirmed" && d.status !== "scheduled") return false;
        if (filterStatus === "Completed" && d.status !== "completed") return false;
        if (filterStatus === "Reallocation Required" && d.status !== "reallocation_required") return false;
        if (filterStatus === "Pending Approval" && d.status !== "pending_sme" && d.status !== "pending") return false;
        if (filterStatus === "Not Conducted" && d.status !== "not_conducted") return false;
      }
      if (filterSubject !== "All" && d.subject !== filterSubject) return false;
      if (filterGroup !== "All") {
        const mentor = mentors.find(m => m.id === d.mentorId);
        const grp = mentor?.department || mentor?.mentor_group || d.stream || "";
        if (grp !== filterGroup) return false;
      }
      if (filterCollege !== "All") {
        const mentor = mentors.find(m => m.id === d.mentorId);
        const collegeName = mentor ? colleges.find(c => c.id === mentor.college_id)?.name : "";
        if (collegeName !== filterCollege) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchMentor = d.mentorName?.toLowerCase().includes(q);
        const matchSubject = d.subject?.toLowerCase().includes(q);
        const matchStream = d.stream?.toLowerCase().includes(q);
        const matchDate = d.dateStr?.toLowerCase().includes(q);
        if (!matchMentor && !matchSubject && !matchStream && !matchDate) return false;
      }
      return true;
    });
  }, [myDemos, filterStatus, filterSubject, filterGroup, filterCollege, searchQuery, mentors, colleges]);

  const paginatedDemos = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredDemos.slice(startIndex, startIndex + pageSize);
  }, [filteredDemos, page, pageSize]);

  // ── History Filtered & Paginated ──────────────────────────────────
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return completedDemos;
    const q = historySearch.toLowerCase();
    return completedDemos.filter(d => {
      const mentor = mentors.find(m => m.id === d.mentorId);
      const collegeName = mentor ? (colleges.find(c => c.id === mentor.college_id)?.name || "") : "";
      return (
        d.mentorName?.toLowerCase().includes(q) ||
        d.subject?.toLowerCase().includes(q) ||
        d.dateStr?.toLowerCase().includes(q) ||
        d.stream?.toLowerCase().includes(q) ||
        d.smeName?.toLowerCase().includes(q) ||
        collegeName.toLowerCase().includes(q)
      );
    });
  }, [completedDemos, historySearch, mentors, colleges]);

  const paginatedHistory = useMemo(() => {
    const startIndex = (historyPage - 1) * historyPageSize;
    return filteredHistory.slice(startIndex, startIndex + historyPageSize);
  }, [filteredHistory, historyPage, historyPageSize]);

  // CSV Export Utility for Demo Schedule
  const handleExportCSV = () => {
    if (filteredDemos.length === 0) {
      toast("No demos to export.", "error");
      return;
    }
    const headers = ["Mentor Name", "College", "Department", "Subject", "Date", "Time Slot", "Status", "Score", "Comments"];
    const rows = filteredDemos.map(d => [
      `"${d.mentorName || ''}"`,
      `"${getMentorCollege(d.mentorId) || ''}"`,
      `"${getMentorDept(d.mentorId) || ''}"`,
      `"${d.subject || ''}"`,
      `"${d.dateStr || ''}"`,
      `"${d.timeSlot || ''}"`,
      `"${d.status || ''}"`,
      `"${d.marks || ''}"`,
      `"${(d.comments || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SME_LND_Sessions_${currentSME.name.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("SME demo schedule exported to CSV successfully!", "success");
  };

  // CSV Export Utility for Evaluation History
  const handleExportHistoryCSV = () => {
    if (filteredHistory.length === 0) {
      toast("No evaluation history records to export.", "error");
      return;
    }
    const headers = ["Mentor Name", "College", "Department", "Subject", "Date", "Time Slot", "Marks Awarded (out of 100)", "Result", "Evaluation Feedback"];
    const rows = filteredHistory.map(d => [
      `"${d.mentorName || ''}"`,
      `"${getMentorCollege(d.mentorId) || ''}"`,
      `"${getMentorDept(d.mentorId) || ''}"`,
      `"${d.subject || ''}"`,
      `"${d.dateStr || ''}"`,
      `"${d.timeSlot || ''}"`,
      `"${d.marks ?? 'N/A'}"`,
      `"${(d.marks ?? 0) >= 60 ? 'Passed' : 'Needs Improvement'}"`,
      `"${(d.comments || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SME_Evaluation_History_${currentSME.name.replace(/\s+/g, "_")}_${getLocalDateStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("SME evaluation history exported to CSV successfully!", "success");
  };

  // ── Handlers ──────────────────────────────────────────────────────
  const handleOpenEvaluate = (session: any) => {
    if (session.status === "completed") {
      setViewEvalSession(session);
      return;
    }
    if (session.status !== "confirmed" && session.status !== "scheduled") {
      toast("Evaluation is only allowed for confirmed demo sessions.", "warning");
      return;
    }

    const timing = getDemoEvaluationTiming(session);
    if (!timing.canEvaluate) {
      if (timing.status === "upcoming") {
        toast(`Evaluation locked: demo slot starts at ${session.timeSlot}. Please evaluate during the session.`, "warning");
      } else if (timing.status === "expired") {
        toast(`Evaluation window closed: scheduled slot (${session.timeSlot}) has expired. Evaluation is stuck/locked.`, "error");
      }
      return;
    }

    setEvaluationModalSession(session);
    const initialScores: Record<string, number | string> = {};
    criteriaList.forEach(c => {
      const safeMax = clampCriterionMax(c.max);
      initialScores[c.key] = roundMarks(safeMax * 0.8);
    });
    setEvalScores(initialScores);
    setComments("");
    setChecklistEntries([]);
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handleOpenSwapModal = (session: any, prefillSlot?: { dateStr: string; timeSlot: string }) => {
    setSwapModalSession(session);
    setSwapReason(session.status === "reallocation_required" ? "CM Approved Mentor Leave" : "SME Unavailable");
    setSwapRemarks("");
    if (prefillSlot) {
      setSelectedProposedTime({
        dateStr: prefillSlot.dateStr,
        timeSlot: prefillSlot.timeSlot,
        score: 100,
        reason: "Mutually available slot from daily availability matrix"
      });
      setSwapStep(2);
    } else {
      setSwapStep(1);
      setSelectedProposedMentor(null);
      setSelectedProposedTime(null);
    }
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handlePlannerReallocate = (
    mentor: any,
    dateStr: string,
    timeSlot: string,
    targetSession?: any,
    swapWithSession?: any
  ) => {
    // 1. Resolve actual demo session from demoSessions array
    const realSessionId = targetSession?.demo_session_id || targetSession?.sessionId || targetSession?.id;
    let foundDemo = demoSessions.find((d: any) => d.id === realSessionId);
    if (!foundDemo && mentor?.id) {
      foundDemo = demoSessions.find((d: any) =>
        (d.mentorId === mentor.id || d.mentor_id === mentor.id) && d.status !== "completed"
      );
    }
    if (!foundDemo && mentor?.id) {
      foundDemo = affectedLeaveDemos.find((d: any) => (d.mentorId === mentor.id || d.mentor_id === mentor.id)) ||
        confirmedDemos.find((d: any) => (d.mentorId === mentor.id || d.mentor_id === mentor.id));
    }

    // 2. Synthesize completely normalized session object with zero missing fields
    const session = {
      id: foundDemo?.id || realSessionId || `demo_${mentor?.id || "m"}_${Date.now()}`,
      demo_session_id: foundDemo?.id || realSessionId,
      mentorId: foundDemo?.mentorId || foundDemo?.mentor_id || targetSession?.mentorId || targetSession?.mentor_id || mentor?.id,
      mentorName: foundDemo?.mentorName || foundDemo?.mentor_name || targetSession?.mentorName || targetSession?.mentor_name || mentor?.name || "Faculty Mentor",
      college_id: foundDemo?.college_id || mentor?.college_id || targetSession?.college_id,
      smeId: foundDemo?.smeId || foundDemo?.sme_id || targetSession?.smeId || targetSession?.sme_id || currentSME?.id,
      smeName: foundDemo?.smeName || foundDemo?.sme_name || targetSession?.smeName || targetSession?.sme_name || currentSME?.name || "Subject Matter Expert",
      subject: foundDemo?.subject || targetSession?.subject || mentor?.department || currentSME?.subject || "L&D Demo Evaluation",
      stream: foundDemo?.stream || targetSession?.stream || mentor?.department || "Engineering",
      dateStr: foundDemo?.dateStr || foundDemo?.date_str || targetSession?.dateStr || targetSession?.original_date_str || targetSession?.proposed_date_str || dateStr,
      timeSlot: foundDemo?.timeSlot || foundDemo?.time_slot || targetSession?.timeSlot || targetSession?.original_time_slot || targetSession?.proposed_time_slot || timeSlot,
      status: foundDemo?.status || "reallocation_required"
    };

    if (swapWithSession) {
      setSwapModalSession(session);
      setSwapReason("Mutual Faculty Slot Swap");
      setSwapRemarks(`Swapping periods with ${swapWithSession.mentorName || "candidate"} (${swapWithSession.subject || "Session"} at ${swapWithSession.timeSlot || timeSlot})`);
      setSelectedProposedMentor(swapWithSession);
      setSelectedProposedTime({
        dateStr,
        timeSlot,
        score: 100,
        reason: `2-Way Swap with ${swapWithSession.mentorName || "Faculty"} (${swapWithSession.subject || "Demo"})`
      });
      setSwapStep(2);
      return;
    }

    handleOpenSwapModal(session, { dateStr, timeSlot });
  };

  const updateScore = (key: string, rawValue: string, max: number) => {
    const safeMax = clampCriterionMax(max);
    if (rawValue === "") {
      setEvalScores(prev => ({ ...prev, [key]: "" }));
      return;
    }
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    if (parsed > safeMax) {
      toast(`Score cannot exceed max ${safeMax} for this criterion.`, "warning");
      setEvalScores(prev => ({ ...prev, [key]: safeMax }));
      return;
    }
    if (parsed < 0) {
      setEvalScores(prev => ({ ...prev, [key]: 0 }));
      return;
    }
    // Preserve intermediate decimal string while typing (e.g. "2." or "2.7")
    setEvalScores(prev => ({ ...prev, [key]: rawValue }));
  };

  // Free-Time Checker for Reallocation Modal (Availability-Driven)
  const getSwapRecommendations = (session: any) => {
    if (!session) return { mentorSwaps: [], timeSwaps: [] };

    const subjectGroup = session.subject;
    const currentWeekDates = weekDates.map(w => w.dateStr);

    const uniqueSlots = new Set<string>();
    slots.forEach(s => { if (s.time) uniqueSlots.add(s.time.trim()); });

    const parseTimeToMinutes = (t: string) => {
      const match = t.match(/^(\d+)(?:\.(\d+))?\s*(AM|PM)/i);
      if (!match) return 9999;
      let hr = parseInt(match[1]);
      const min = match[2] ? parseInt(match[2]) : 0;
      const isPm = match[3].toUpperCase() === "PM";
      if (isPm && hr < 12) hr += 12;
      if (!isPm && hr === 12) hr = 0;
      return hr * 60 + min;
    };
    const derivedTimeSlots = Array.from(uniqueSlots).sort((a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b));

    const timeSwaps: any[] = [];
    currentWeekDates.forEach(dateStr => {
      const isHoliday = holidays.some(h => h.date === dateStr);
      if (isHoliday) return;
      derivedTimeSlots.forEach(timeSlot => {
        if (timeSlot.toLowerCase().includes("lunch") || timeSlot.toLowerCase().includes("break")) return;
        if (dateStr === session.dateStr && timeSlot === session.timeSlot) return;
        const isMentorOnLeave = leaveRequests?.some((l: any) => l.mentorId === session.mentorId && l.dateStr === dateStr && l.status === "approved");
        if (isMentorOnLeave) return;
        const dayName = weekDates.find(w => w.dateStr === dateStr)?.day || "";
        const hasMentorClass = slots.some(s => s.mentorId === session.mentorId && s.day === dayName && s.time === timeSlot);
        if (hasMentorClass) return;
        const isSmeBusy = demoSessions.some(ds => ds.smeId === currentSME.id && ds.dateStr === dateStr && ds.timeSlot === timeSlot && ds.status === "confirmed");
        if (isSmeBusy) return;

        let score = 50;
        if (dateStr === session.dateStr) score += 30; // Same date priority
        score += 20;

        timeSwaps.push({ dateStr, timeSlot, score: Math.min(100, score), reason: "Timetable Slot Free & Verified" });
      });
    });

    timeSwaps.sort((a, b) => b.score - a.score);
    return { mentorSwaps: [], timeSwaps: timeSwaps.slice(0, 5) };
  };

  const currentSwapRecommendations = useMemo(() => {
    const recs = getSwapRecommendations(swapModalSession);
    if (selectedProposedTime) {
      const exists = recs.timeSwaps.some(
        t => t.dateStr === selectedProposedTime.dateStr && t.timeSlot === selectedProposedTime.timeSlot
      );
      if (!exists) {
        recs.timeSwaps.unshift({
          dateStr: selectedProposedTime.dateStr,
          timeSlot: selectedProposedTime.timeSlot,
          score: 100,
          reason: selectedProposedTime.reason || "Mutually Free Verified Slot"
        });
      }
    }
    return recs;
  }, [swapModalSession, mentors, slots, weekDates, colleges, leaveRequests, demoSessions, selectedProposedTime]);

  const handleSubmitSwapRequest = async () => {
    if (!swapModalSession) return;
    if (!selectedProposedTime) { setErrorMsg("Please select a suggested replacement timeslot."); return; }
    setSubmitting(true); setErrorMsg(""); setSuccessMsg("");

    const targetDate = selectedProposedTime.dateStr || swapModalSession.dateStr || getLocalDateStr();
    const targetSlot = selectedProposedTime.timeSlot || swapModalSession.timeSlot || "Period 1 (08:30 - 09:25)";

    const payload = {
      sessionId: swapModalSession.id || swapModalSession.demo_session_id || swapModalSession.sessionId || `sess_${Date.now()}`,
      mentorId: swapModalSession.mentorId || swapModalSession.mentor_id || "mentor",
      mentorName: swapModalSession.mentorName || swapModalSession.mentor_name || "Faculty Mentor",
      smeId: swapModalSession.smeId || swapModalSession.sme_id || currentSME?.id || "sme",
      smeName: swapModalSession.smeName || swapModalSession.sme_name || currentSME?.name || "Subject Matter Expert",
      dateStr: swapModalSession.dateStr || swapModalSession.original_date_str || swapModalSession.proposed_date_str || targetDate,
      timeSlot: swapModalSession.timeSlot || swapModalSession.original_time_slot || swapModalSession.proposed_time_slot || targetSlot,
      subject: swapModalSession.subject || "L&D Demo Evaluation",
      stream: swapModalSession.stream || swapModalSession.department || "Engineering",
      reason: swapReason || "SME Schedule Reallocation",
      remarks: swapRemarks || "",
      swapType: selectedProposedMentor ? "mentor" : "reallocation",
      proposedMentorId: selectedProposedMentor?.mentorId || selectedProposedMentor?.mentor_id || selectedProposedMentor?.id || null,
      proposedMentorName: selectedProposedMentor?.mentorName || selectedProposedMentor?.mentor_name || selectedProposedMentor?.name || null,
      proposedSmeId: currentSME?.id,
      proposedSmeName: currentSME?.name,
      proposedDateStr: targetDate,
      proposedTimeSlot: targetSlot
    };
    try {
      const res = await requestDemoSwap(payload);
      if (res.success) {
        setSuccessMsg("L&D session reallocation proposal submitted successfully!");
        setSwapModalSession(null);
        await refreshData();
      } else {
        setErrorMsg(res.message);
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to submit reallocation request.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveReallocation = async (req: any, decision: "approved" | "rejected") => {
    if (resolvingSwapId) return;
    setResolvingSwapId(req.id);
    try {
      if (String(req.id || "").startsWith("drr")) {
        const res = await apiFetch<any>("/api/demo-reallocations", {
          method: "POST",
          body: JSON.stringify({
            action: "resolve",
            requestId: req.id,
            decision,
            decidedBy: currentSME.name,
            decisionNotes: decision === "approved" ? "Approved by assigned SME" : "Rejected by SME"
          })
        });
        if (res.success) {
          toast(`Reallocation proposal ${decision} successfully!`, "success");
          await refreshData();
        } else {
          toast(res.message || `Failed to ${decision} proposal`, "error");
        }
      } else {
        const res = await resolveDemoSwap(req.id, decision);
        if (res.success) toast(`Swap request ${decision}.`, "success");
        else toast(res.message || `Failed to ${decision} swap request.`, "error");
      }
    } catch (err: any) {
      toast(err?.message || "An error occurred", "error");
    } finally {
      setResolvingSwapId(null);
    }
  };

  const handleConfirmEvaluation = async () => {
    if (!evaluationModalSession) return;

    const timing = getDemoEvaluationTiming(evaluationModalSession);
    if (!timing.canEvaluate) {
      setErrorMsg(timing.reason);
      toast(timing.reason, "error");
      return;
    }

    if (marks < 0 || marks > totalMaxMarks) {
      setErrorMsg(`Marks must be between 0 and ${totalMaxMarks}.`);
      return;
    }
    if (!comments.trim()) {
      setErrorMsg("Please provide comments/feedback for the evaluation.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const scoreBreakdown = buildScoreBreakdown(criteriaList, evalScores);
      const res = await evaluateDemoSession(
        evaluationModalSession.id,
        marksNormalized,
        comments,
        checklistEntries,
        scoreBreakdown
      );
      if (res.success) {
        setSuccessMsg(`Evaluation submitted successfully for ${evaluationModalSession.mentorName}!`);
        setEvaluationModalSession(null);
        toast(`Evaluation submitted successfully for ${evaluationModalSession.mentorName}!`, "success");
      } else {
        setErrorMsg(res.message);
        toast(res.message, "error");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to submit evaluation.");
      toast(e.message || "Failed to submit evaluation.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getMentorCollege = (mentorId: string) => {
    const mentor = mentors.find(m => m.id === mentorId);
    if (!mentor) return "";
    return colleges.find(c => c.id === mentor.college_id)?.name || "";
  };
  const getMentorDept = (mentorId: string) => {
    const mentor = mentors.find(m => m.id === mentorId);
    return mentor?.department || mentor?.mentor_group || "";
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
      case "scheduled":
        return <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><CheckCircle className="h-3 w-3 shrink-0" /> Confirmed</span>;
      case "completed":
        return <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-indigo-950/20 dark:text-amber-400 dark:border-indigo-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><Award className="h-3 w-3 shrink-0" /> Completed</span>;
      case "reallocation_required":
        return <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> On Hold (Awaiting Mentor Reschedule)</span>;
      case "pending":
      case "pending_sme":
        return <span className="px-2.5 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><Clock className="h-3 w-3 shrink-0" /> Pending Approval</span>;
      case "not_conducted":
        return <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" /> Not Conducted</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-black uppercase">{status}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-warm-canvas text-slate-800 dark:text-slate-100 font-sans h-full overflow-hidden">

      {/* ── 5 SME Sidebar Items Navigation ── */}
      <aside ref={sidebarRef} className={`hidden md:flex shrink-0 flex-col justify-between sticky top-6 z-30 floating-sidebar transition-all duration-300 ${isCollapsed ? "w-20 p-3" : "w-64 p-5"}`}>
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Sidebar Header */}
          {!isCollapsed ? (
            <div className="mb-5 pb-4 border-b border-slate-200/60 dark:border-slate-800">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-1">SME Portal</p>
              <h2 className="text-base font-black text-slate-800 dark:text-white leading-tight">SME Workspace</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                {currentSME.subject ? `${currentSME.subject} Expert` : "Subject Matter Expert"}
              </p>
            </div>
          ) : (
            <div className="mb-4 pb-3 border-b border-slate-200/60 dark:border-slate-800 text-center">
              <Sparkles className="h-5 w-5 text-amber-500 dark:text-amber-400 mx-auto" />
            </div>
          )}

          {/* 5 Primary Sidebar Navigation Tabs */}
          <nav className="sidebar-role-sme space-y-1.5 py-1">
            {sidebarNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => prefetchRoleTab(queryClient, "sme", item.id, {})}
                  onClick={() => handleTabChange(item.id as any)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center transition-all duration-150 cursor-pointer rounded-xl font-bold ${isCollapsed ? "justify-center px-0 py-3" : "justify-between px-3.5 py-2.5 text-xs"
                    } ${isActive
                      ? "bg-zinc-900 text-white shadow-xs border border-white/10 dark:bg-zinc-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-zinc-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-amber-400" : "text-slate-400 dark:text-slate-500"}`} />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </div>
                  {item.count > 0 && (
                    <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${isActive ? "bg-amber-500 text-zinc-950 font-black" : "bg-zinc-900 text-white"
                      }`}>
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer Collapse Toggle */}
        <div className="border-t border-slate-100/85 dark:border-slate-800 pt-3.5 space-y-3 shrink-0">
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setIsCollapsed(prev => {
                const next = !prev;
                localStorage.setItem("fp_sidebar_collapsed", String(next));
                return next;
              })}
              className="h-8.5 w-8.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-all cursor-pointer"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main Content Body Area ── */}
      <main className="flex-1 w-full overflow-y-auto h-full pb-24 md:pb-12 scroll-touch">
        <div className="p-3 md:p-6 space-y-6 max-w-[1400px] mx-auto animate-scaleUp">


          {/* System Alerts */}
          {successMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3 text-xs font-bold shadow-xs animate-scaleUp">
              <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
              <button onClick={() => setSuccessMsg("")} className="ml-auto text-emerald-500 hover:text-emerald-700 cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
          )}
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center gap-3 text-xs font-bold shadow-xs animate-scaleUp">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg("")} className="ml-auto text-rose-500 hover:text-rose-700 cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
          )}

          {/* Mobile Navigation Pill Tabs Bar */}
          <div className="md:hidden flex items-center p-1.5 bg-slate-50/80 dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-x-auto">
            {sidebarNavItems.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${activeTab === tab.id
                    ? "bg-slate-900 text-white dark:btn-gradient dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[9px] font-black ${activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ═══════════════ TAB 0: DASHBOARD (DAILY OVERVIEW) ═══════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Daily Overview KPI Cards with Interactive Tab Drill-Down */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div onClick={() => { setFilterStatus("All"); sessionsRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="cursor-pointer hover:scale-[1.02] transition-transform">
                  <Card
                    label="Today's L&D Sessions"
                    value={todayDemos.length}
                    icon={<Calendar className="h-4 w-4 text-blue-600" />}
                  />
                </div>
                <div onClick={() => { setFilterStatus("Confirmed"); sessionsRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="cursor-pointer hover:scale-[1.02] transition-transform">
                  <Card
                    label="Upcoming Confirmed"
                    value={confirmedCount}
                    icon={<CheckCircle className="h-4 w-4 text-emerald-600" />}
                  />
                </div>
                <div onClick={() => handleTabChange("reallocation")} className="cursor-pointer hover:scale-[1.02] transition-transform">
                  <Card
                    label="Pending Requests"
                    value={pendingInboundRequests.length}
                    icon={<Clock className="h-4 w-4 text-violet-600" />}
                  />
                </div>
                <div onClick={() => handleTabChange("reallocation")} className="cursor-pointer hover:scale-[1.02] transition-transform">
                  <Card
                    label="Reallocation Required"
                    value={affectedCount}
                    icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                  />
                </div>
                <div onClick={() => handleTabChange("history")} className="cursor-pointer hover:scale-[1.02] transition-transform">
                  <Card
                    label="Completed (Avg)"
                    value={completedCount > 0 ? `${completedCount} (${avgScore}%)` : "0"}
                    icon={<Award className="h-4 w-4 text-pink-600" />}
                  />
                </div>
              </div>

              {/* Weekly Evaluation Target & Delivery Progress Bar */}
              <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-card space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                      <Target className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wide">
                        Weekly Evaluation Target ({currentSME.subject || "Domain"})
                      </h4>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                        Performance towards assigned weekly demo reviews and SLA quota.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 block">Completed / Target</span>
                      <span className="text-sm font-black text-slate-900 dark:text-white">
                        {completedCount} <span className="text-slate-400 font-bold">/</span> {weeklyTargetCount} Demos
                      </span>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase border ${
                      targetProgressPct >= 80
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : targetProgressPct >= 50
                          ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
                    }`}>
                      {targetProgressPct}% Delivered
                    </div>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      targetProgressPct >= 80 ? "bg-emerald-500" : targetProgressPct >= 50 ? "bg-amber-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(4, targetProgressPct))}%` }}
                  />
                </div>
              </div>

              {/* Constant Course Google Meet Link Card */}
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-800/60 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    <Video className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-blue-700 dark:text-blue-300 block">Permanent Google Meet Link</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {currentSME?.google_meet_link || smeCourses.find((c: any) => c.google_meet_link)?.google_meet_link || "No permanent Meet link set yet for your domain"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const primary = smeCourses[0] || (coursesList && coursesList[0]) || null;
                    setSelectedCourseForMeet(primary);
                    setCourseMeetInput(
                      currentSME?.google_meet_link ||
                      smeCourses.find((c: any) => c.google_meet_link)?.google_meet_link ||
                      primary?.google_meet_link ||
                      ""
                    );
                    setShowCourseMeetModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Link2 className="h-3.5 w-3.5" /> Configure Course Meet Link
                </button>
              </div>

              {/* Action Required Banner if pending requests or affected demos exist */}
              {(pendingInboundRequests.length > 0 || affectedCount > 0) && (
                <div className="p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-extrabold text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Action Required ({pendingInboundRequests.length + affectedCount} items)
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {pendingInboundRequests.length > 0 && (
                      <button
                        onClick={() => handleTabChange("reallocation")}
                        className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-extrabold flex items-center gap-1 hover:bg-amber-600 cursor-pointer shadow-2xs"
                      >
                        Review {pendingInboundRequests.length} Pending Requests <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                    {affectedCount > 0 && (
                      <button
                        onClick={() => handleTabChange("reallocation")}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-extrabold flex items-center gap-1 hover:bg-amber-700 cursor-pointer shadow-2xs"
                      >
                        Resolve {affectedCount} L&D Sessions Requiring Reallocation <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Compact Today's Schedule & Action Indicators */}
              <Panel
                title="TODAY'S SCHEDULE"
              >
                {todayDemos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {todayDemos.map(demo => {
                      const courseObj = (coursesList || []).find((c: any) =>
                        (c.name || "").toLowerCase().trim() === (demo.subject || "").toLowerCase().trim() ||
                        (c.code || "").toLowerCase().trim() === (demo.subject || "").toLowerCase().trim()
                      );
                      const effectiveMeetLink = demo.meet_link || courseObj?.google_meet_link || null;
                      return (
                      <div key={demo.id} className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-card">
                        <div className="space-y-0.5">
                          <div className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                            {demo.mentorName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold">{demo.dateStr} • {demo.timeSlot}</div>
                          <div className="text-[9px] text-amber-500 dark:text-amber-400 font-bold uppercase">{demo.subject} • {getMentorDept(demo.mentorId) || demo.stream}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {effectiveMeetLink && (
                            <a
                              href={ensureAbsoluteUrl(effectiveMeetLink)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] font-black flex items-center gap-1 transition-colors"
                              title="Join Google Meet"
                            >
                              <Video className="h-3.5 w-3.5" /> Meet
                            </a>
                          )}
                          {renderStatusBadge(demo.status)}
                          {(() => {
                            if (demo.status === "completed") {
                              return (
                                <button onClick={() => setViewEvalSession(demo)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-extrabold hover:bg-emerald-100 cursor-pointer flex items-center gap-1">
                                  <Award className="h-3 w-3" /> View Score
                                </button>
                              );
                            }
                            const timing = getDemoEvaluationTiming(demo);
                            if (timing.status === "upcoming") {
                              return (
                                <button
                                  type="button"
                                  disabled
                                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-not-allowed opacity-80"
                                  title={timing.reason}
                                >
                                  <Clock className="h-3 w-3 text-slate-400" /> {timing.badgeText}
                                </button>
                              );
                            }
                            if (timing.status === "expired") {
                              return (
                                <button
                                  type="button"
                                  disabled
                                  className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-not-allowed opacity-75"
                                  title={timing.reason}
                                >
                                  <Lock className="h-3 w-3 text-rose-500" /> Slot Expired
                                </button>
                              );
                            }
                            return (
                              <button
                                type="button"
                                onClick={() => handleOpenEvaluate(demo)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-extrabold cursor-pointer shadow-xs flex items-center gap-1 border border-emerald-500 animate-pulse"
                                title="Time slot active! Click to evaluate."
                              >
                                <CheckSquare className="h-3 w-3" /> Evaluate Session
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    ); })}
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs font-bold italic bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl">
                    No confirmed demos scheduled for today ({todayStr}).
                  </div>
                )}
              </Panel>

              {/* Combined My L&D Sessions Ledger inside Dashboard */}
              <div ref={sessionsRef}>
                <Panel
                  title="MY L&D SESSIONS"
                >
                  <div className="space-y-5">
                    {/* Sub-tab Status Filters */}
                <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3 overflow-x-auto">
                  {[
                    { label: "All L&D Sessions", value: "All" },
                    { label: "Confirmed", value: "Confirmed" },
                    { label: "Reallocation Required", value: "Reallocation Required" },
                    { label: "Pending Approval", value: "Pending Approval" },
                    { label: "Completed", value: "Completed" }
                  ].map(tab => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => { setFilterStatus(tab.value); setPage(1); }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer whitespace-nowrap ${filterStatus === tab.value
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Filter Toolbar */}
                <div className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3.5 rounded-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select aria-label="College filter" value={filterCollege} onChange={e => { setFilterCollege(e.target.value); setPage(1); }}
                      className="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500 cursor-pointer">
                      <option value="All">All Colleges</option>
                      {uniqueColleges.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select aria-label="Subject filter" value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setPage(1); }}
                      className="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500 cursor-pointer">
                      <option value="All">All Subjects</option>
                      {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select aria-label="Mentor group filter" value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(1); }}
                      className="px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500 cursor-pointer">
                      <option value="All">All Groups</option>
                      {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" placeholder="Search mentor, date, subject..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                        className="w-full pl-8 pr-8 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500" />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => { setSearchQuery(""); setPage(1); }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                          title="Clear search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-cards List (Mentor, Group, College, Subject, Demo Time, Head SME, Status) */}
                <div className="grid grid-cols-1 gap-4">
                  {paginatedDemos.length > 0 ? (
                    paginatedDemos.map(demo => (
                      <div key={demo.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card space-y-3.5 hover:border-pink-300/80 dark:hover:border-pink-800 transition-all">
                        {/* Sub-boxes Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                            <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Mentor</span>
                            <span className="text-xs font-black text-slate-900 dark:text-white truncate block flex items-center gap-1">
                              <User className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                              {demo.mentorName}
                            </span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                            <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Group & College</span>
                            <span className="text-xs font-black text-amber-500 dark:text-amber-400 truncate block">
                              {getMentorDept(demo.mentorId) || demo.stream || "General"}
                            </span>
                            <span className="text-[9px] text-slate-400 font-semibold truncate block">{getMentorCollege(demo.mentorId)}</span>
                          </div>
                          <div className="p-3 bg-pink-50/40 dark:bg-pink-950/20 rounded-lg border border-pink-100 dark:border-pink-900/40">
                            <span className="text-[8.5px] font-black uppercase tracking-wider text-pink-600 dark:text-pink-400 block mb-0.5">Subject & Head SME</span>
                            <span className="text-xs font-black text-pink-700 dark:text-pink-300 truncate block">{demo.subject}</span>
                            <span className="text-[9px] text-slate-400 font-semibold truncate block">Head: {currentSME.name}</span>
                          </div>
                          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                            <span className="text-[8.5px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">L&D Session Time</span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block font-mono">{demo.dateStr}</span>
                            <span className="text-[9px] text-slate-500 font-medium block">{demo.timeSlot}</span>
                          </div>
                        </div>

                        {/* Card Action Row with unified buttons & Timetable shortcut */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-extrabold uppercase text-slate-400">Status:</span>
                            {renderStatusBadge(demo.status)}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleTabChange("availability")}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer flex items-center gap-1"
                              title="Show on Availability Calendar"
                            >
                              <Calendar className="h-3.5 w-3.5" /> Timetable
                            </button>

                            {demo.status === "completed" ? (
                              <button onClick={() => setViewEvalSession(demo)} className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-extrabold flex items-center gap-1 hover:bg-emerald-100 transition-all cursor-pointer">
                                <Award className="h-3.5 w-3.5" /> View Scorecard ({demo.marks}/100)
                              </button>
                            ) : demo.status === "confirmed" ? (
                              <>
                                {(() => {
                                  const timing = getDemoEvaluationTiming(demo);
                                  if (timing.status === "upcoming") {
                                    return (
                                      <button
                                        type="button"
                                        disabled
                                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-not-allowed opacity-80"
                                        title={timing.reason}
                                      >
                                        <Clock className="h-3.5 w-3.5 text-slate-400" /> Upcoming
                                      </button>
                                    );
                                  }
                                  if (timing.status === "expired") {
                                    return (
                                      <button
                                        type="button"
                                        disabled
                                        className="px-3.5 py-1.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-lg text-xs font-bold flex items-center gap-1 cursor-not-allowed opacity-75"
                                        title={timing.reason}
                                      >
                                        <Lock className="h-3.5 w-3.5 text-rose-500" /> Slot Expired
                                      </button>
                                    );
                                  }
                                  return (
                                    <button onClick={() => handleOpenEvaluate(demo)} className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-2xs flex items-center gap-1 border border-emerald-500 animate-pulse">
                                      <CheckSquare className="h-3.5 w-3.5" /> Evaluate Session
                                    </button>
                                  );
                                })()}
                                <button onClick={() => handleOpenSwapModal(demo)} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center gap-1">
                                  <RefreshCw className="h-3.5 w-3.5" /> Reallocate
                                </button>
                              </>
                            ) : (
                              <button onClick={() => handleOpenSwapModal(demo)} className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-extrabold transition-all cursor-pointer shadow-2xs flex items-center gap-1">
                                <RefreshCw className="h-3.5 w-3.5" /> Reallocate Slot
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-10 text-center text-slate-400 text-xs font-bold italic bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-card">
                      No L&D sessions found matching your filters.
                    </div>
                  )}
                </div>

                {/* Table Pagination */}
                {filteredDemos.length > 0 && (
                  <div className="pt-2">
                    <Pagination
                      currentPage={page}
                      totalItems={filteredDemos.length}
                      pageSize={pageSize}
                      onPageChange={setPage}
                      onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
                    />
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* --- TAB: WEEKLY TEACHING PLANS (SME CURRICULUM OVERSIGHT) --- */}
      {activeTab === "weekly_plans" && (
            <WeeklyPlanViewer
              role="sme"
              reviewerName={currentSME?.name || "Subject Matter Expert"}
              allColleges={colleges.map(c => ({ id: c.id, name: c.name }))}
            />
          )}

          {/* ═══════════════ TAB: SKILL APPROVALS (MENTOR SKILL DEVELOPMENT TRACKER — SME MARKING) ═══════════════ */}
          {activeTab === "skill_approvals" && (
            <SkillTrackerPanel
              role="sme"
              reviewerName={currentSME?.name || "Subject Matter Expert"}
            />
          )}

          {/* ═══════════════ TAB: EVALUATION CRITERIA (SCORING RUBRIC & COMPLIANCE CRUD) ═══════════════ */}
          {activeTab === "eval_criteria" && (
            <div className="space-y-6">
              {/* Sub-tab Switcher: Scoring Rubric vs Department Compliance */}
              <div className="flex items-center justify-between gap-4 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 rounded-xl shadow-2xs border border-slate-200/70 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEvalCriteriaSubTab("rubric")}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                      evalCriteriaSubTab === "rubric"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <Award className="h-3.5 w-3.5" />
                    <span>Scoring Rubric (Marks)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvalCriteriaSubTab("compliance")}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                      evalCriteriaSubTab === "compliance"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span>Compliance Checklist (Rules)</span>
                  </button>
                </div>

                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 pr-2 hidden sm:block">
                  {evalCriteriaSubTab === "rubric" ? "Active: Faculty Demo Scoring Scale" : "Active: Department Checklist Parameters"}
                </div>
              </div>

              {evalCriteriaSubTab === "rubric" ? (
                /* Scoring Rubric Criteria CRUD Manager Panel */
                <Panel
                  title="SCORING RUBRIC CRITERIA"
                  subtitle="Configure the scoring parameters and maximum marks used during faculty demo evaluations"
                >
                  <div className="space-y-4">
                    {/* Top Bar: Summary & Restore Defaults */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-xs">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                          Default Standard Evaluation Rubric (10 Parameters • Max {MAX_CRITERION_MARKS} Marks Each)
                        </span>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Fixed institutional criteria applied across all faculty demo evaluations.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetCriteriaDefaults}
                        className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                        <span>Restore Defaults</span>
                      </button>
                    </div>

                    {/* Summary Bar */}
                    <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300">
                        Total Criteria: <strong>{criteriaList.length}</strong>{" "}
                        <span className="text-[10px] font-semibold text-slate-500">(max {MAX_CRITERION_MARKS} marks each; scaled to /5 threshold)</span>
                      </span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                        Cumulative Scale: {totalMaxMarks} Marks (Normalized: 5.00 / 5)
                      </span>
                    </div>

                    {/* Criteria List */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {criteriaList.map(crit => (
                        <div key={crit.key} className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shadow-xs">
                          <div className="space-y-0.5 flex-1 truncate">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block truncate">{crit.label}</span>
                            <span className="text-[10px] text-slate-400 font-semibold">Weightage: Max {crit.max} marks</span>
                          </div>
                          <span className="px-2.5 py-1 text-[10px] font-black rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Max {crit.max}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
              ) : (
                /* Department Compliance Checklist Rules */
                <DemoEvalCriteriaPanel
                  departments={["General"]}
                  smeName={currentSME.name}
                />
              )}
            </div>
          )}

          {/* ═══════════════ TAB: MORE TOOLS & PORTALS (MOBILE HUB) ═══════════════ */}
          {activeTab === "more_menu" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Menu className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">More SME Workspaces</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Additional evaluation and tracking portals.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    id: "skill_approvals",
                    label: "Skill Approvals",
                    subtitle: "Verify & approve student coding milestones",
                    icon: GraduationCap,
                    bg: "bg-amber-50 text-amber-500 dark:bg-indigo-950/40 dark:text-amber-400"
                  },
                  {
                    id: "eval_criteria",
                    label: "Evaluation Criteria",
                    subtitle: "Rubrics, scoring parameters & checklist",
                    icon: SlidersHorizontal,
                    bg: "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400"
                  },
                  {
                    id: "reallocation",
                    label: "Reallocation Requests",
                    subtitle: "Manage demo swaps and leave requests",
                    icon: RefreshCw,
                    bg: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
                    count: pendingInboundRequests.length + affectedCount
                  },
                  {
                    id: "history",
                    label: "Evaluation History",
                    subtitle: "Archives of completed demo evaluations",
                    icon: FileText,
                    bg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
                    count: completedCount
                  }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabChange(item.id as any)}
                      className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center justify-between gap-3 shadow-card cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`h-10 w-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{item.label}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block truncate">{item.subtitle}</span>
                        </div>
                      </div>
                      {Boolean(item.count) && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white shrink-0">
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════════ TAB 2: AVAILABILITY ═══════════════ */}
          {activeTab === "availability" && (
            <div className="space-y-6">
              {/* Top Banner Card: Clean Summary */}
              <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    SME Working Windows & Schedule Settings
                  </h3>
                  <p className="text-xs text-slate-500 font-medium max-w-2xl">
                    Configure your dedicated Demo Evaluation windows vs Faculty Training hours. The L&amp;D Timetable System strictly matches mentor demos only during your Demo Time slots.
                  </p>

                  {/* Configured Days Badges Preview */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d => {
                      const wins = (smeAvailability || []).filter(
                        (a: any) => a.sme_id === currentSME?.id && a.day_of_week?.toLowerCase().trim() === d.toLowerCase().trim() && a.is_active !== 0
                      );
                      const hasTraining = wins.some((w: any) => (w.slot_type || w.slotType) === "training");
                      const hasOther = wins.some((w: any) => (w.slot_type || w.slotType) === "other");
                      const hasDemo = wins.some((w: any) => (w.slot_type || w.slotType) === "demo" || (!w.slot_type && !w.slotType));

                      return (
                        <div
                          key={d}
                          onClick={() => { setSelectedAvailDay(d); setShowAvailModal(true); }}
                          className="px-2.5 py-1 bg-sunken dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 rounded-lg border border-slate-200 inset-shadow-well/80 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer transition-all"
                          title="Click to configure this day"
                        >
                          <span className="font-extrabold text-slate-900 dark:text-amber-400">{d.slice(0, 3)}:</span>
                          {wins.length === 0 ? (
                            <span className="text-slate-400">9–5:30 (Default)</span>
                          ) : (
                            <span>
                              {wins.length} {wins.length === 1 ? "window" : "windows"}
                              {[
                                hasDemo ? "Demo" : null,
                                hasTraining ? "Train" : null,
                                hasOther ? "Other" : null
                              ].filter(Boolean).length > 0
                                ? ` (${[
                                    hasDemo ? "Demo" : null,
                                    hasTraining ? "Train" : null,
                                    hasOther ? "Other" : null
                                  ].filter(Boolean).join(" + ")})`
                                : ""}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Central Dynamic Matrix Grid */}
              <Panel
                title="SME AVAILABILITY & TIMETABLE MATRIX"
              >
                <div className="space-y-6">
                  {/* Legend & Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-xs font-bold">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[10px] font-black uppercase text-slate-400">Legend:</span>
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md text-[10px] font-bold">Free L&D Slot</span>
                      <span className="px-2.5 py-1 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-md text-[10px] font-bold">Training / Workshop Time</span>
                      <span className="px-2.5 py-1 bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300 border border-pink-200 dark:border-pink-800 rounded-md text-[10px] font-bold">Confirmed L&D (Booked)</span>
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md text-[10px] font-bold">Class / Duty</span>
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-md text-[10px] font-bold">Leave</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAvailModal(true)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 shadow-xs flex items-center gap-2 cursor-pointer transition-all shrink-0 ml-auto"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Edit My Timings & Windows
                    </button>
                  </div>

                  {/* Time-Slot Availability Matrix Grid */}
                  <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                    <table className="w-full text-center text-xs min-w-[650px]">
                      <thead>
                        <tr className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="p-3 text-left">Time Slot</th>
                          {weekDates.map(w => (
                            <th key={w.dateStr} className="p-3">{w.day} ({w.dateStr?.split(" ").slice(0, 2).join(" ")})</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
                        {matrixTimeSlots.map(timeRange => (
                          <tr key={timeRange} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="p-3 text-left font-mono text-[10.5px] font-black text-slate-700 dark:text-slate-300 bg-slate-50/30 dark:bg-slate-900/50 whitespace-nowrap">{timeRange}</td>
                            {weekDates.map(w => {
                              const startTimePart = timeRange.split("-")[0]?.trim() || timeRange;
                              const slotMin = parseTimeToMin(startTimePart);
                              const dayWins = (smeAvailability || []).filter(
                                (a: any) => a.sme_id === currentSME?.id && a.day_of_week?.toLowerCase().trim() === w.day?.toLowerCase().trim() && a.is_active !== 0
                              );
                              const matchingWin = dayWins.find((win: any) => {
                                const wStart = parseTimeToMin(win.start_time);
                                const wEnd = parseTimeToMin(win.end_time);
                                return slotMin >= wStart && slotMin < wEnd;
                              });

                              const demoOnSlot = myDemos.find(d => {
                                if (d.dateStr !== w.dateStr || d.status !== "confirmed") return false;
                                const demoMin = parseTimeToMin(d.timeSlot);
                                return demoMin >= slotMin && demoMin < slotMin + 60;
                              });
                              const slotOnSlot = slots.find(s => (s as any).smeId === currentSME?.id && s.day === w.day && parseTimeToMin(s.time) >= slotMin && parseTimeToMin(s.time) < slotMin + 60);
                              const isLeave = leaveRequests?.some((l: any) => l.smeId === currentSME?.id && l.dateStr === w.dateStr && l.status === "approved");

                              if (isLeave) {
                                return (
                                  <td key={w.dateStr} className="p-2">
                                    <span className="px-2.5 py-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] font-black block">
                                      Leave
                                    </span>
                                  </td>
                                );
                              } else if (demoOnSlot) {
                                return (
                                  <td key={w.dateStr} className="p-2">
                                    <span
                                      onClick={() => handleOpenEvaluate(demoOnSlot)}
                                      className="px-2.5 py-1.5 bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300 border border-pink-200 dark:border-pink-800 rounded-lg text-[10px] font-black block cursor-pointer hover:scale-[1.02] transition-transform"
                                    >
                                      Demo ({demoOnSlot.mentorName?.split(" ")[0]})
                                    </span>
                                  </td>
                                );
                              } else if (matchingWin && (matchingWin.slot_type === "training" || matchingWin.slotType === "training")) {
                                return (
                                  <td key={w.dateStr} className="p-2">
                                    <span className="px-2.5 py-1.5 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-lg text-[10px] font-bold block">
                                      Training Time
                                    </span>
                                  </td>
                                );
                              } else if (matchingWin && (matchingWin.slot_type === "other" || matchingWin.slotType === "other")) {
                                return (
                                  <td key={w.dateStr} className="p-2">
                                    <span className="px-2.5 py-1.5 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] font-bold block truncate" title={matchingWin.notes || "Other Duty"}>
                                      {matchingWin.notes || "Other Duty"}
                                    </span>
                                  </td>
                                );
                              } else if (matchingWin) {
                                return (
                                  <td key={w.dateStr} className="p-2">
                                    <span className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[10px] font-black block">
                                      Free Demo Slot
                                    </span>
                                  </td>
                                );
                              } else {
                                return (
                                  <td key={w.dateStr} className="p-2">
                                    <span className="px-2.5 py-1.5 bg-slate-50 text-slate-400 dark:bg-slate-800/30 dark:text-slate-500 rounded-lg text-[10px] font-medium block">
                                      Off-Duty
                                    </span>
                                  </td>
                                );
                              }
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {/* ═══════════════ TAB 3: REALLOCATION ═══════════════ */}
          {activeTab === "reallocation" && (
            <Panel
              title="REALLOCATION HUB & DAILY AVAILABILITY"
            >
              <div className="space-y-6">
                {/* Visual Daily Reallocation Studio for Requesting Mentors & Live Day Order */}
                <SMEReallocationPlanner
                  currentSME={currentSME}
                  mentors={mentors}
                  colleges={colleges}
                  slots={slots}
                  demoSessions={demoSessions}
                  smeAvailability={smeAvailability}
                  leaveRequests={leaveRequests}
                  inboundRequests={pendingInboundRequests}
                  affectedSessions={affectedLeaveDemos}
                  onResolveRequest={handleResolveReallocation}
                  onReallocateSlot={handlePlannerReallocate}
                  onInitiateManualRealloc={confirmedDemos.length > 0 ? () => handleOpenSwapModal(confirmedDemos[0]) : undefined}
                />

                {/* Quick Action Bar to initiate manual reallocation */}
                {confirmedDemos.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-bold">
                      Need to reschedule an upcoming demo due to emergency or clash?
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(resolvingSwapId)}
                      onClick={() => handleOpenSwapModal(confirmedDemos[0])}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-zinc-900 hover:bg-zinc-800 text-white shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all shrink-0 border border-white/10 disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Reallocate an Upcoming Demo
                    </button>
                  </div>
                )}
              </div>
            </Panel>
          )}

          {/* ═══════════════ TAB 4: HISTORY ═══════════════ */}
          {activeTab === "history" && (
            <Panel
              title="EVALUATION HISTORY LOG"
            >
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative flex-1 w-full">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search evaluations by mentor, subject, or date..." value={historySearch} onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                      className="w-full pl-10 pr-9 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500" />
                    {historySearch && (
                      <button
                        type="button"
                        onClick={() => { setHistorySearch(""); setHistoryPage(1); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                        title="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleExportHistoryCSV}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-black border border-slate-200 dark:border-slate-700 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                    title="Export completed L&D evaluations and scorecards"
                  >
                    <Download className="h-3.5 w-3.5" /> Export Evaluation History
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200/80 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                  {paginatedHistory.length > 0 ? (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {paginatedHistory.map(demo => {
                        const { breakdown, marksOutOf5, marksNormalized, thresholdMet } = resolveSessionDisplayScores(demo);
                        const checklistItems = parseChecklistSnapshot(demo.checklist);
                        const metChecks = checklistItems.filter(c => c.met).length;
                        const unmetChecks = checklistItems.length - metChecks;
                        const collegeName = getMentorCollege(demo.mentorId);

                        return (
                          <div
                            key={demo.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setViewEvalSession(demo)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setViewEvalSession(demo);
                              }
                            }}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/90 dark:hover:bg-slate-800/40 focus:outline-none focus:bg-slate-50/90 dark:focus:bg-slate-800/40 transition-colors cursor-pointer group"
                          >
                            <div className="flex items-start sm:items-center gap-3 min-w-0">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                                thresholdMet
                                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900"
                                  : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900"
                              }`}>
                                <Award className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h3 className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{demo.mentorName}</h3>
                                  {demo.week ? (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-extrabold uppercase">
                                      Week {demo.week}
                                    </span>
                                  ) : null}
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${
                                    thresholdMet
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                                      : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800"
                                  }`}>
                                    {thresholdMet ? "Pass >= 3.5/5" : "Below Threshold"}
                                  </span>
                                  {unmetChecks > 0 ? (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[9px] font-bold">
                                      {unmetChecks} Unmet Check{unmetChecks > 1 ? "s" : ""}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate">
                                  {demo.dateStr}{demo.timeSlot ? ` • ${demo.timeSlot}` : ""} • {demo.subject}{demo.stream ? ` (${demo.stream})` : ""}
                                </p>
                                <p className="text-[9.5px] text-amber-600 dark:text-amber-400 font-bold truncate">
                                  {collegeName || "Campus N/A"}
                                  {demo.smeName ? <span className="text-slate-400 font-semibold"> • SME: {demo.smeName}</span> : null}
                                  {checklistItems.length > 0 ? (
                                    <span className="text-slate-400 font-semibold"> • {metChecks}/{checklistItems.length} checks met</span>
                                  ) : null}
                                  {breakdown ? (
                                    <span className="text-slate-400 font-semibold"> • {breakdown.criteria.length} criteria ({breakdown.totalScored}/{breakdown.totalMaxMarks})</span>
                                  ) : null}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pl-13 sm:pl-0">
                              <div className="text-left sm:text-right">
                                <span className="text-[8px] font-black uppercase text-slate-400 block">Final Mark</span>
                                <div className="flex items-baseline gap-1.5 sm:justify-end">
                                  <span className={`text-sm font-black ${
                                    marksOutOf5 >= 3.5 ? "text-emerald-600 dark:text-emerald-400" : marksOutOf5 >= 2.5 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"
                                  }`}>
                                    {marksOutOf5} / 5
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400">({marksNormalized}%)</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewEvalSession(demo);
                                }}
                                className="px-3.5 py-1.5 bg-emerald-50 group-hover:bg-emerald-100 dark:bg-emerald-950/30 dark:group-hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" /> View Details
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-10 text-center text-slate-400 text-xs font-bold italic">
                      {historySearch ? "No evaluations match your search." : "No completed evaluations recorded yet."}
                    </div>
                  )}

                  {/* History Pagination */}
                  {filteredHistory.length > 0 && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800">
                      <Pagination
                        currentPage={historyPage}
                        totalItems={filteredHistory.length}
                        pageSize={historyPageSize}
                        onPageChange={setHistoryPage}
                        onPageSizeChange={(sz) => { setHistoryPageSize(sz); setHistoryPage(1); }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {/* ═══════════════ TAB 5: EVALUATOR PROFILE ═══════════════ */}
          {activeTab === "profile" && (
            <SMEProfileTab />
          )}

          {/* ═══════════════ REALLOCATION MODAL (AVAILABILITY WIZARD) ═══════════════ */}
          {swapModalSession && (
            <Dialog
              open={Boolean(swapModalSession)}
              onOpenChange={(next) => {
                if (!next) setSwapModalSession(null);
              }}
              ariaLabel="Reallocate L&D session"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm"
              panelClassName="max-w-lg rounded-xl p-6 space-y-5 max-h-[90vh] bg-white dark:bg-slate-900"
            >
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <RefreshCw className="h-4.5 w-4.5 text-amber-500" />
                    Reallocate L&D Session
                  </h3>
                  <button onClick={() => setSwapModalSession(null)} className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">Close</button>
                </div>

                {swapStep === 1 ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      <p><strong>Faculty Candidate:</strong> {swapModalSession.mentorName} ({swapModalSession.subject})</p>
                      <p><strong>Scheduled:</strong> {swapModalSession.dateStr} • {swapModalSession.timeSlot}</p>
                      <p><strong>College:</strong> {getMentorCollege(swapModalSession.mentorId)}</p>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 block mb-1.5">Reason for Reallocation</label>
                      <select value={swapReason} onChange={e => setSwapReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500 font-bold cursor-pointer"
                        aria-label="Reason for Reallocation">
                        <option value="CM Approved Mentor Leave">CM Approved Mentor Leave</option>
                        <option value="SME Unavailable">SME Unavailable</option>
                        <option value="Timetable Conflict">Timetable Conflict</option>
                        <option value="Emergency">Emergency</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 block mb-1.5">Remarks (Optional)</label>
                      <textarea rows={3} value={swapRemarks} onChange={e => setSwapRemarks(e.target.value)} placeholder="Provide context..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500"
                        aria-label="Remarks (Optional)" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={() => setSwapModalSession(null)} className="flex-1 px-4 py-2.5 text-xs font-extrabold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer">Cancel</button>
                      <button type="button" onClick={() => setSwapStep(2)} className="flex-1 px-4 py-2.5 text-xs font-extrabold text-white bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg transition-all cursor-pointer shadow-2xs">Find Free Slot Options</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Available Timetable Slot Recommendations</span>
                    <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                      {currentSwapRecommendations.timeSwaps.length > 0 ? (
                        currentSwapRecommendations.timeSwaps.map((cand, idx) => (
                          <div key={idx} onClick={() => setSelectedProposedTime(cand)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${selectedProposedTime?.dateStr === cand.dateStr && selectedProposedTime?.timeSlot === cand.timeSlot ? "border-amber-500 bg-amber-50/20 dark:bg-indigo-950/20" : "border-slate-200/80 dark:border-slate-800 hover:border-amber-400"}`}>
                            <div className="flex-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">{cand.dateStr}</span>
                              <span className="text-xs text-slate-500 block font-semibold">{cand.timeSlot}</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">{cand.reason}</span>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <div>
                                <span className="text-[8px] font-black uppercase text-amber-500 block">Match</span>
                                <span className="text-xs font-black text-amber-500 dark:text-amber-400">{cand.score}%</span>
                              </div>
                              {selectedProposedTime?.dateStr === cand.dateStr && selectedProposedTime?.timeSlot === cand.timeSlot && <Check className="h-4.5 w-4.5 text-amber-500 animate-fadeIn" />}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-6 font-bold">No alternate free timeslots found this week.</p>
                      )}
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button type="button" onClick={() => setSwapStep(1)} className="flex-1 px-4 py-2.5 text-xs font-extrabold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer">Back</button>
                      <button type="button" disabled={submitting} onClick={handleSubmitSwapRequest}
                        className="flex-1 px-4 py-2.5 text-xs font-extrabold text-white bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg disabled:opacity-50 transition-all cursor-pointer shadow-2xs">
                        {submitting ? "Submitting..." : "Submit Reallocation"}
                      </button>
                    </div>
                  </div>
                )}
            </Dialog>
          )}

          {/* ═══════════════ EVALUATION MODAL (100-MARK RUBRIC) ═══════════════ */}
          {evaluationModalSession && (
            <Dialog
              open={Boolean(evaluationModalSession)}
              onOpenChange={(next) => {
                if (!next) setEvaluationModalSession(null);
              }}
              ariaLabel="SME L&D evaluation form"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm"
              panelClassName="max-w-lg rounded-xl p-6 space-y-5 max-h-[90vh] bg-white dark:bg-slate-900"
            >
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    SME L&D Evaluation Form
                  </h3>
                  <button onClick={() => setEvaluationModalSession(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">Close</button>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Faculty Candidate</span>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{evaluationModalSession.mentorName}</p>
                      <p className="text-[9px] text-amber-500 font-bold uppercase mt-0.5">{getMentorCollege(evaluationModalSession.mentorId)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Subject</span>
                      <span className="px-2 py-0.5 bg-pink-50 dark:bg-pink-950/20 text-pink-700 dark:text-pink-400 rounded-md text-[9px] font-bold">
                        {evaluationModalSession.subject}
                      </span>
                      <div className="mt-1">
                        <span className="text-[9px] text-slate-400">{evaluationModalSession.dateStr} • {evaluationModalSession.timeSlot}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9.5px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                        Evaluation Criteria ({criteriaList.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleResetCriteriaDefaults}
                        className="px-2.5 py-1 text-[10px] font-extrabold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                        title="Restore criteria to system defaults (Max 5 marks each)"
                      >
                        <RotateCcw className="h-3 w-3 text-slate-500" />
                        <span>Restore Defaults</span>
                      </button>
                    </div>

                    {criteriaList.map(crit => (
                      <div key={crit.key} className="flex items-center justify-between gap-3 p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">
                          {crit.label} <span className="text-slate-400 font-semibold text-[9.5px]">(0-{crit.max})</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            aria-label={crit.label}
                            type="number"
                            min={0}
                            max={crit.max}
                            step="0.1"
                            value={evalScores[crit.key] !== undefined ? evalScores[crit.key] : roundMarks(crit.max * 0.8)}
                            onChange={e => updateScore(crit.key, e.target.value, crit.max)}
                            onBlur={() =>
                              setEvalScores(prev => ({
                                ...prev,
                                [crit.key]: clampCriterionScore(prev[crit.key] ?? 0, crit.max)
                              }))
                            }
                            className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center p-3 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl text-xs font-bold">
                    <span className="text-slate-800 dark:text-slate-200">Calculated Total Marks:</span>
                    <span className={`text-sm font-black ${marksOutOf5 >= 3.5 ? "text-emerald-600" : marksOutOf5 >= 2.5 ? "text-amber-600" : "text-rose-600"}`}>
                      {marksOutOf5} / 5 <span className="text-[11px] font-bold text-slate-500">({marks} / {totalMaxMarks} • {marksNormalized}%)</span>
                    </span>
                  </div>

                  {/* Phase C: department compliance checklist (drives KAM/CM escalation mail) */}
                  <EvaluationChecklist
                    department={getMentorDept(evaluationModalSession.mentorId) || evaluationModalSession.stream || "General"}
                    marks={marks}
                    totalMaxMarks={totalMaxMarks}
                    entries={checklistEntries}
                    onChange={setChecklistEntries}
                  />

                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                      Pedagogical Comments & Feedback
                    </label>
                    <textarea
                      rows={4}
                      value={comments}
                      onChange={e => setComments(e.target.value)}
                      placeholder="Provide feedback on course knowledge, presentation delivery, confidence, student interaction..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 bg-sunken dark:bg-slate-800 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500"
                      aria-label="Pedagogical Comments &amp; Feedback"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setEvaluationModalSession(null)}
                    className="flex-1 px-4 py-2.5 text-xs font-extrabold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer">
                    Cancel
                  </button>
                  <button type="button" disabled={submitting} onClick={handleConfirmEvaluation}
                    className="flex-1 px-4 py-2.5 text-xs font-extrabold text-white bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg disabled:opacity-50 transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer">
                    {submitting ? "Submitting..." : "Submit Evaluation"}
                  </button>
                </div>
            </Dialog>
          )}

          {/* ═══════════════ VIEW EVALUATION (READ-ONLY) MODAL ═══════════════ */}
          {viewEvalSession && (() => {
            const mentorObj = mentors.find(m => m.id === viewEvalSession.mentorId);
            const mentorCollege = getMentorCollege(viewEvalSession.mentorId) || "Not specified";
            const mentorDept = getMentorDept(viewEvalSession.mentorId) || "Not specified";
            const { breakdown, marksOutOf5, marksNormalized, thresholdMet } = resolveSessionDisplayScores(viewEvalSession);
            const checklistItems = parseChecklistSnapshot(viewEvalSession.checklist);
            const metChecks = checklistItems.filter(c => c.met).length;
            const unmetChecks = checklistItems.length - metChecks;
            const recordedAt = formatEvalTimestamp(viewEvalSession.created_at);

            return (
              <Dialog
                open={Boolean(viewEvalSession)}
                onOpenChange={(next) => {
                  if (!next) setViewEvalSession(null);
                }}
                ariaLabel="SME evaluation record details"
                overlayClassName="bg-slate-950/60 backdrop-blur-sm"
                panelClassName="max-w-2xl rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900"
              >
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Lock className="h-4 w-4 text-emerald-500" />
                      Evaluation Record Details
                    </h3>
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                      Record ID: <span className="font-mono">{viewEvalSession.id}</span> • Recorded {recordedAt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewEvalSession(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    aria-label="Close evaluation details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Score & Threshold Summary Banner */}
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  thresholdMet
                    ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60"
                    : "bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60"
                }`}>
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Evaluated Faculty</span>
                    <p className="text-base font-black text-slate-900 dark:text-white truncate">{viewEvalSession.mentorName}</p>
                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 truncate">
                      {mentorCollege} • {mentorDept}
                    </p>
                    {mentorObj?.designation ? (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{mentorObj.designation}</p>
                    ) : null}
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Final Evaluation Mark</span>
                    <div className="flex items-baseline gap-2 sm:justify-end">
                      <span className={`text-2xl font-black ${
                        marksOutOf5 >= 3.5 ? "text-emerald-600 dark:text-emerald-400" : marksOutOf5 >= 2.5 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"
                      }`}>
                        {marksOutOf5} / 5
                      </span>
                      <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                        ({marksNormalized} / 100)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end mt-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                        thresholdMet
                          ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700"
                          : "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700"
                      }`}>
                        {thresholdMet ? "Meets >= 3.5/5 Threshold" : "Below 3.5/5 Threshold"}
                      </span>
                      {breakdown ? (
                        <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-[10px] font-extrabold text-slate-600 dark:text-slate-300">
                          Raw: {breakdown.totalScored} / {breakdown.totalMaxMarks}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Faculty Profile & Session Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <User className="h-3 w-3 text-slate-400" /> Faculty Details
                    </span>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Mentor ID:</span> {viewEvalSession.mentorId || "N/A"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Email:</span> {mentorObj?.email || "Not available"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Phone:</span> {mentorObj?.phone || "Not available"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Department:</span> {mentorDept}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Campus:</span> {mentorCollege}</p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" /> Session &amp; Evaluator Details
                    </span>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Subject:</span> {viewEvalSession.subject || "N/A"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Stream:</span> {viewEvalSession.stream || "Not specified"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Week:</span> {viewEvalSession.week ? `Week ${viewEvalSession.week}` : "Not specified"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Schedule:</span> {viewEvalSession.dateStr} • {viewEvalSession.timeSlot || "Slot N/A"}</p>
                      <p><span className="font-bold text-slate-800 dark:text-slate-200">Evaluated By:</span> {viewEvalSession.smeName || "SME"} {viewEvalSession.smeId ? `(${viewEvalSession.smeId})` : ""}</p>
                    </div>
                  </div>
                </div>

                {/* Rubric Criteria Score Breakdown */}
                <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-indigo-500" />
                      Rubric Criteria Breakdown
                    </span>
                    {breakdown ? (
                      <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400">
                        {breakdown.criteria.length} Criteria • {breakdown.totalScored} / {breakdown.totalMaxMarks} Marks ({breakdown.marksOutOf5} / 5)
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400">Consolidated Record</span>
                    )}
                  </div>

                  {breakdown && breakdown.criteria.length > 0 ? (
                    <div className="space-y-2.5">
                      {breakdown.criteria.map((crit) => {
                        const pct = crit.max > 0 ? Math.min(100, Math.round((crit.score / crit.max) * 100)) : 0;
                        const barTone = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
                        return (
                          <div key={crit.key} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-slate-700 dark:text-slate-200 truncate">{crit.label}</span>
                              <span className="font-black text-slate-800 dark:text-white shrink-0">
                                {crit.score} / {crit.max} <span className="text-[10px] font-semibold text-slate-400">({pct}%)</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                      Consolidated score recorded as <strong>{marksOutOf5} / 5</strong> ({marksNormalized} / 100). Detailed per-criterion breakdown was not captured for this earlier evaluation.
                    </p>
                  )}
                </div>

                {/* Full Compliance Checklist Status */}
                <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Compliance Checklist
                    </span>
                    {checklistItems.length > 0 ? (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                        unmetChecks === 0
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                          : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800"
                      }`}>
                        {metChecks} / {checklistItems.length} Checks Met
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400">Not Recorded</span>
                    )}
                  </div>

                  {checklistItems.length > 0 ? (
                    <div className="space-y-1.5">
                      {checklistItems.map((item, idx) => (
                        <div
                          key={item.criterionId || `${item.label}_${idx}`}
                          className={`p-2 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                            item.met
                              ? "bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-200/70 dark:border-emerald-900/50 text-emerald-900 dark:text-emerald-200"
                              : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {item.met ? (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="font-bold block truncate">{item.label}</span>
                              {item.detail ? <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{item.detail}</span> : null}
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                            item.met
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                          }`}>
                            {item.met ? "Met" : "Unmet"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No compliance checklist snapshot recorded for this session.</p>
                  )}
                </div>

                {/* Pedagogical Feedback Comments */}
                <div className="p-3.5 bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/50 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-600" />
                    Pedagogical Comments &amp; Feedback
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {viewEvalSession.comments || "No comments recorded."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setViewEvalSession(null)}
                  className="w-full px-4 py-2.5 text-xs font-extrabold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Close
                </button>
              </Dialog>
            );
          })()}

          {/* ═══════════════ AVAILABILITY CONFIGURATION MODAL ═══════════════ */}
          {showAvailModal && (
            <Dialog
              open={showAvailModal}
              onOpenChange={(next) => {
                if (!next) setShowAvailModal(false);
              }}
              ariaLabel="Configure working windows and slot timings"
              overlayClassName="bg-slate-950/60 backdrop-blur-sm overflow-y-auto"
              panelClassName="max-w-2xl rounded-2xl p-0 space-y-0 overflow-hidden bg-white dark:bg-slate-900 my-8 max-h-[90vh]"
            >
                {/* Modal Header */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                      <SlidersHorizontal className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">
                        Configure Working Windows & Slot Timings
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Set your dedicated Demo Evaluation windows and Faculty Training hours for each weekday
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAvailModal(false)}
                    aria-label="Close availability settings"
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                  {/* Day Picker Pills with All Weekdays Default Option */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Schedule Scope:</span>
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedAvailDay("ALL")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          selectedAvailDay === "ALL"
                            ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs"
                            : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                        }`}
                      >
                        All Weekdays (Mon - Fri)
                      </button>

                      <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block" />

                      {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setSelectedAvailDay(d)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            selectedAvailDay === d
                              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-amber-400 shadow-xs font-black"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-900"
                          }`}
                        >
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Context Help Banner */}
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-xs flex items-center justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-300 font-bold">
                      {selectedAvailDay === "ALL" ? (
                        <span>Standard Schedule Mode: Setting once applies to <strong>all 5 weekdays (Monday – Friday)</strong>.</span>
                      ) : (
                        <span>Single-Day Override: Editing <strong>{selectedAvailDay} only</strong> (Will not affect the other 4 days).</span>
                      )}
                    </span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      {selectedAvailDay === "ALL" ? "5 Days" : "1 Day"}
                    </span>
                  </div>

                  {/* Quick Presets */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">Quick Schedule Presets:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDayWindows([{ startTime: "09:00 AM", endTime: "05:30 PM", slotType: "demo" }])}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Full Day Demo (09:00 - 17:30)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayWindows([
                          { startTime: "09:00 AM", endTime: "12:30 PM", slotType: "demo" },
                          { startTime: "01:30 PM", endTime: "05:30 PM", slotType: "training" }
                        ])}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Demo + Training Split
                      </button>
                      <button
                        type="button"
                        onClick={() => setDayWindows([{ startTime: "08:30 AM", endTime: "01:00 PM", slotType: "demo" }])}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                      >
                        Morning Demo Only
                      </button>
                    </div>
                  </div>

                  {/* Window Cards List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        Configured Windows for {selectedAvailDay}:
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {dayWindows.length} {dayWindows.length === 1 ? "window" : "windows"}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {dayWindows.map((win, idx) => (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border ${
                            win.slotType === "training"
                              ? "bg-violet-50/60 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800/80"
                              : win.slotType === "other"
                                ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80"
                                : "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80"
                          } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                        >
                          <div className="flex items-center gap-3 flex-wrap flex-1">
                            <div>
                              <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Window Purpose</span>
                              <select aria-label="Window purpose"
                                value={win.slotType}
                                onChange={(e) => {
                                  const copy = [...dayWindows];
                                  copy[idx].slotType = e.target.value as any;
                                  setDayWindows(copy);
                                }}
                                className="text-xs font-extrabold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 cursor-pointer shadow-xs"
                              >
                                <option value="demo">Demo (Available for L&D Demos)</option>
                                <option value="training">Training (Blocked for Demos)</option>
                                <option value="other">Other Activity (Blocked for Demos)</option>
                              </select>
                            </div>

                            {win.slotType === "other" && (
                              <div className="w-full sm:w-auto flex-1 min-w-[200px]">
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Activity Name / Description</span>
                                <input
                                  type="text"
                                  placeholder="e.g. Department Meeting, Lab Supervision..."
                                  value={win.notes || ""}
                                  onChange={(e) => {
                                    const copy = [...dayWindows];
                                    copy[idx].notes = e.target.value;
                                    setDayWindows(copy);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Start Time</span>
                                <input aria-label="Start time"
                                  type="time"
                                  value={to24Hour(win.startTime)}
                                  onChange={(e) => {
                                    const copy = [...dayWindows];
                                    copy[idx].startTime = to12Hour(e.target.value);
                                    setDayWindows(copy);
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs focus:ring-2 focus:ring-slate-900 dark:focus:ring-amber-500 cursor-pointer"
                                />
                              </div>
                              <span className="text-slate-400 font-black mt-4">→</span>
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">End Time</span>
                                <input aria-label="End time"
                                  type="time"
                                  value={to24Hour(win.endTime)}
                                  onChange={(e) => {
                                    const copy = [...dayWindows];
                                    copy[idx].endTime = to12Hour(e.target.value);
                                    setDayWindows(copy);
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs focus:ring-2 focus:ring-slate-900 dark:focus:ring-amber-500 cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>

                          {dayWindows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setDayWindows(dayWindows.filter((_, i) => i !== idx));
                              }}
                              className="p-2 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/40 rounded-xl cursor-pointer transition-colors self-end sm:self-center"
                              title="Delete window"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Add Window Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setDayWindows([...dayWindows, { startTime: "01:30 PM", endTime: "05:30 PM", slotType: "training" }]);
                        }}
                        className="w-full p-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-amber-500 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-amber-400 flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        Add Another Time Window
                      </button>
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-3">
                  {selectedAvailDay !== "ALL" ? (
                    <button
                      type="button"
                      disabled={isSavingAvail}
                      onClick={async () => {
                        if (!currentSME) return;
                        setIsSavingAvail(true);
                        const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                        const bulkWindows: any[] = [];
                        allDays.forEach(d => {
                          dayWindows.forEach(w => {
                            bulkWindows.push({ day: d, startTime: w.startTime, endTime: w.endTime, slotType: w.slotType, notes: w.notes || null });
                          });
                        });
                        const res = await saveSmeAvailability(currentSME.id, bulkWindows);
                        setIsSavingAvail(false);
                        if (res.success) {
                          toast(`Applied ${selectedAvailDay}'s schedule to All Weekdays (Mon – Fri)!`, "success");
                          setShowAvailModal(false);
                        } else {
                          toast(res.error || "Failed to save", "error");
                        }
                      }}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      Apply {selectedAvailDay} to All Weekdays
                    </button>
                  ) : <div />}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAvailModal(false)}
                      className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      disabled={isSavingAvail}
                      onClick={async () => {
                        if (!currentSME) return;
                        setIsSavingAvail(true);

                        if (selectedAvailDay === "ALL") {
                          const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
                          const bulkWindows: any[] = [];
                          allDays.forEach(d => {
                            dayWindows.forEach(w => {
                              bulkWindows.push({ day: d, startTime: w.startTime, endTime: w.endTime, slotType: w.slotType, notes: w.notes || null });
                            });
                          });
                          const res = await saveSmeAvailability(currentSME.id, bulkWindows);
                          setIsSavingAvail(false);
                          if (res.success) {
                            toast("Saved standard schedule for All Weekdays (Mon – Fri) successfully!", "success");
                            setShowAvailModal(false);
                          } else {
                            toast(res.error || "Failed to save", "error");
                          }
                        } else {
                          // Save strictly this individual day alone
                          const res = await saveSmeAvailability(currentSME.id, dayWindows, selectedAvailDay);
                          setIsSavingAvail(false);
                          if (res.success) {
                            toast(`Saved availability for ${selectedAvailDay} only!`, "success");
                            setShowAvailModal(false);
                          } else {
                            toast(res.error || "Failed to save", "error");
                          }
                        }
                      }}
                      className="px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 shadow-md flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Save className="h-4 w-4" />
                      {isSavingAvail
                        ? "Saving..."
                        : selectedAvailDay === "ALL"
                          ? "Save for All Weekdays (Mon - Fri)"
                          : `Save ${selectedAvailDay} Only`}
                    </button>
                  </div>
                </div>
            </Dialog>
          )}

          {/* Constant Course Google Meet Link Configuration Modal */}
          {showCourseMeetModal && (
            <Dialog
              open={showCourseMeetModal}
              onOpenChange={(open) => { if (!open) setShowCourseMeetModal(false); }}
              ariaLabel="Configure Constant Course Google Meet Link"
              overlayClassName="bg-slate-950/60 backdrop-blur-xs p-4 flex items-center justify-center"
              panelClassName="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-scaleUp"
            >
              <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
                    <Video className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">
                      Course Google Meet Link
                    </h3>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      Set a permanent meeting URL that mentors join for demo evaluations
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCourseMeetModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block">Assigned Domain / Subject</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                      {currentSME?.subject || selectedCourseForMeet?.name || "All Assigned Courses"}
                    </span>
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-extrabold uppercase">
                    Permanent Link
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 block mb-1">
                    Permanent Google Meet URL
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      placeholder="https://meet.google.com/abc-defg-hij"
                      value={courseMeetInput}
                      onChange={(e) => setCourseMeetInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-400 font-semibold mt-1">
                    This link will be automatically attached to demo sessions and shown on the Mentor&apos;s schedule card with a 1-click Join button.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCourseMeetModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingCourseMeet}
                  onClick={handleSaveCourseMeet}
                  className="px-5 py-2 text-xs font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {savingCourseMeet ? "Saving..." : "Save Google Meet Link"}
                </button>
              </div>
            </Dialog>
          )}

        </div>
      </main>

      {/* ── Mobile Bottom Navigation Bar (Persistent 1-Tap Thumb Navigation) ── */}
      <nav className="sidebar-role-sme flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav safe-area-bottom" aria-label="SME sections">
        <div className="flex w-full items-stretch justify-around px-1 py-1">
          {[
            { id: "overview" as const, label: "Dashboard", icon: LayoutDashboard, count: totalAssigned },
            { id: "weekly_plans" as const, label: "Plans", icon: CalendarRange },
            { id: "availability" as const, label: "Schedule", icon: Calendar },
            {
              id: "more_menu" as const,
              label: "More",
              icon: Menu,
              count: (pendingInboundRequests.length + affectedCount)
            }
          ].map((t) => {
            const Icon = t.icon;
            const isMoreTab = ["skill_approvals", "eval_criteria", "reallocation", "history"].includes(activeTab);
            const isActive = t.id === "more_menu" ? isMoreTab : activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabChange(t.id as any)}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer ${
                  isActive ? "text-zinc-950 dark:text-white" : "text-slate-400 dark:text-slate-500"
                }`}
              >
                <div className="relative">
                  <Icon className={`h-4.5 w-4.5 transition-transform ${isActive ? "scale-110 text-amber-500 dark:text-amber-400" : ""}`} />
                  {Boolean(t.count) && (t.count ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[1rem] h-3.5 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {t.count}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-bold leading-none tracking-tight ${isActive ? "text-zinc-950 dark:text-white font-black" : "text-slate-500 dark:text-slate-400"}`}>
                  {t.label}
                </span>
                {isActive && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
