"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { useApp } from "../context/AppContext";
import { useToast } from "../context/ToastContext";
import {
  Clock,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  Settings,
  Grid,
  Compass,
  Users,
  Upload,
  Download,
  FileSpreadsheet,
  ChevronRight,
  Search
} from "lucide-react";
import { formatTimeLabel, isTimeSlotMatch } from "../lib/utils";
import { getLocalDateStr, shiftDateStr } from "../lib/localDate";
import {
  consecutiveHardClash,
  autoAssignSmes
} from "../lib/lndAllocationEngine";
import { buildLndDemoTemplate } from "../lib/lndExcelTemplate";
import { parseLndDemoWorkbook } from "../lib/lndExcelImport";
import LndMasterMatrix from "./lnd/LndMasterMatrix";
import LndSmeTimetable from "./lnd/LndSmeTimetable";
import LndStatsHeader from "./lnd/LndStatsHeader";
import LndFilterBar from "./lnd/LndFilterBar";
import LndPeriodTable from "./lnd/LndPeriodTable";
import LndRulesTab from "./lnd/LndRulesTab";
import LndQueueTab from "./lnd/LndQueueTab";
import LndPreviewModal from "./lnd/modals/LndPreviewModal";
import LndOverrideModal from "./lnd/modals/LndOverrideModal";
import LndCellDetailsModal from "./lnd/modals/LndCellDetailsModal";
import LndSwapRequestsModal from "./lnd/modals/LndSwapRequestsModal";
import LndImportPreviewModal from "./lnd/modals/LndImportPreviewModal";
import LndTemplateChooserModal from "./lnd/modals/LndTemplateChooserModal";
import { PageHeader } from "./ui/PageHeader";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { TableSurface } from "./dashboard/TableSurface";
import { Pagination } from "./ui/Pagination";
import { usePagination } from "../hooks/usePagination";
import { useLndGridModel } from "../hooks/useLndGridModel";
import { mentorGroupOf } from "../lib/lndFilterOptions";

const EMPTY_DAILY_CONFIGS = new Map<string, any>();

const EXCEL_IMPORT_ACCEPT = ".xlsx,.xls,.csv";

export function LndAllocationDashboard() {
  const {
    colleges,
    mentors,
    slots,
    smes,
    demoSessions,
    setDemoSessions,
    demoRules,
    subjectsList,
    subjectGroups,
    daysOfWeek,
    updateMentor,
    refreshData,
    smeAvailability,
    bookDemoSession,
    bulkBookDemoSessions,
    deleteDemoSession,
    createDemoRule,
    deleteDemoRule,
    leaveRequests,
    facultyLeaves,
    holidays,
    demoSwapRequests,
    resolveDemoSwap
  } = useApp();

  const { toast, confirm: showConfirm } = useToast();
  const queryClient = useQueryClient();

  // ── Leave-driven L&D Reallocation queue (L & D review) ──
  const [decidingReallocId, setDecidingReallocId] = useState<string | null>(null);
  const [reallocNotesMap, setReallocNotesMap] = useState<Record<string, string>>({});

  const demoReallocationsQuery = useQuery<any[]>({
    queryKey: qk.demoReallocations("all"),
    queryFn: async () => {
      const json = await apiFetch<any>("/api/demo-reallocations?status=all");
      return json?.success ? (json.requests || []) : [];
    },
  });
  const demoReallocations = demoReallocationsQuery.data || [];
  const loadingReallocations = demoReallocationsQuery.isPending;
  const fetchDemoReallocations = () =>
    queryClient.invalidateQueries({ queryKey: qk.demoReallocations("all") });

  const decideDemoReallocation = async (requestId: string, decision: "approved" | "rejected") => {
    setDecidingReallocId(requestId);
    const notes = (reallocNotesMap[requestId] || "").trim();
    try {
      const res = await fetch("/api/demo-reallocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          requestId,
          decision,
          decidedBy: "L & D",
          decisionNotes: notes || undefined
        })
      });
      const json = await res.json();
      if (json.success) {
        toast(json.message || `Reallocation ${decision}.`, "success");
        setReallocNotesMap(prev => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        await fetchDemoReallocations();
        // One institution-wide read instead of one request per campus, so approving a
        // request cannot hide another campus's rows and does not multiply round trips.
        try {
          const res = await apiFetch<any>("/api/demo-sessions?college_id=all");
          if (res?.success && Array.isArray(res.records)) {
            setDemoSessions(res.records);
          } else {
            toast("Session list may be stale — the refresh after that decision failed.", "error");
          }
        } catch (e: any) {
          toast("Session list may be stale: " + (e?.message || "refresh failed"), "error");
        }
      } else {
        toast(json.message || `Failed to ${decision} reallocation`, "error");
      }
    } catch (e: any) {
      toast("Error: " + e.message, "error");
    } finally {
      setDecidingReallocId(null);
    }
  };


  // Filters State
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("All");

  // Date selection - defaults dynamically to current date
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getLocalDateStr());



  const todayStr = getLocalDateStr();
  const isCurrentWeek = selectedDateStr === todayStr;

  const setWeekOffset = (deltaWeeks: number) => {
    setSelectedDateStr(shiftDateStr(selectedDateStr, deltaWeeks * 7));
  };

  // Scheduling generation states
  const [targetDemosCount, setTargetDemosCount] = useState<number>(1);
  const [previewSessions, setPreviewSessions] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<"idle" | "generating" | "done">("idle");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSwapRequestsModal, setShowSwapRequestsModal] = useState(false);
  const [swapRequestsTab, setSwapRequestsTab] = useState<"pending" | "resolved">("pending");

  // Excel Timetable & Allocation Import/Export States
  const [showDemoExcelImportModal, setShowDemoExcelImportModal] = useState(false);
  const [demoImportPreview, setDemoImportPreview] = useState<{ parsed: any[]; warnings: string[]; validCount: number; targetSubjectGroup: string } | null>(null);
  const [isImportingDemoExcel, setIsImportingDemoExcel] = useState(false);
  const [showExcelDropdown, setShowExcelDropdown] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateMentorGroup, setTemplateMentorGroup] = useState<string>("");

  // Left Sidebar & Tab Navigation States
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"matrix" | "rules" | "queue">("matrix");
  const [rulesSelectedGroup, setRulesSelectedGroup] = useState<string>("All");

  // Per-Mentor Custom Weekly L&D Targets state
  const [mentorTargets, setMentorTargets] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("fp_mentor_demo_targets");
        if (saved) return JSON.parse(saved);
      } catch (_) { }
    }
    return {};
  });

  const handleSetMentorTarget = (mentorId: string, count: number) => {
    const updated = { ...mentorTargets, [mentorId]: Math.max(0, count) };
    setMentorTargets(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("fp_mentor_demo_targets", JSON.stringify(updated));
    }
  };

  // Search filter for Real-Time Mentor Weekly Hours & Quota Monitor
  const [mentorQuotaSearch, setMentorQuotaSearch] = useState("");
  // The monitor's totals live in the dashboard header, so the table starts collapsed.
  const [quotaOpen, setQuotaOpen] = useState(false);

  // Grid display mode: Unified Master L&D Grid (SME Settings) vs College Timetable Period View
  const [gridDisplayMode, setGridDisplayMode] = useState<"master" | "periods">("master");
  // Filter by specific Evaluator / SME on UI Master Grid
  const [selectedSmeId, setSelectedSmeId] = useState<string>("all");

  // Dept rules input state — local editable values before saving
  const [deptRuleInputs, setDeptRuleInputs] = useState<Record<string, number>>({});

  // Daily Configs Map (Day Orders, Holidays, Events configured by CAM)
  const lndCollegeIds = useMemo(() => colleges.map(c => c.id).filter(Boolean), [colleges]);
  const lndCollegeIdsKey = lndCollegeIds.join(",");
  const dailyConfigsQuery = useQuery<Map<string, any>>({
    queryKey: qk.lndDailyConfigs(lndCollegeIdsKey, selectedCollegeId),
    enabled: lndCollegeIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, any>();
      await Promise.all(
        lndCollegeIds.map(async (cId) => {
          try {
            const json = await apiFetch<any>(`/api/daily-configs?college_id=${encodeURIComponent(cId)}&limit=500`);
            if (json?.success && Array.isArray(json.configs)) {
              json.configs.forEach((c: any) => {
                const dStr = c.dateStr || c.datestr;
                if (dStr) {
                  const item = {
                    ...c,
                    college_id: cId,
                    dateStr: dStr,
                    day_order: c.day_order || c.dayorder || "None",
                    day_type: c.day_type || c.daytype || "working"
                  };
                  map.set(`${cId}_${dStr}`, item);
                  if (selectedCollegeId === cId || !map.has(dStr) || item.day_order !== "None") {
                    map.set(dStr, item);
                  }
                }
              });
            }
          } catch (_) { }
        })
      );
      return map;
    },
  });
  const dailyConfigsMap = dailyConfigsQuery.data || EMPTY_DAILY_CONFIGS;
  const fetchDailyConfigs = () =>
    queryClient.invalidateQueries({ queryKey: ["daily-configs"] });


  // ── Derived grid model: week dates, day orders, quota rows, slot rows, capacity, free mentors ──
  // Pure logic lives in lib/lndGridModel; React wiring lives in hooks/useLndGridModel.
  const {
    currentWeekDates,
    selectedWeek,
    getEffectiveDayOrderInfo,
    getCollegeTimetablePeriodList,
    getCollegeTimetableDayStatus,
    allCollegesTimetableStatus,
    currentCollege,
    classGroups,
    mentorGroups,
    ruleTargetsBySubject,
    collegesById,
    mentorsById,
    filteredMentors,
    quotaMentorsSummary,
    displayedQuotaMentors,
    collegeTimeSlots,
    standardShiftSlots,
    slotSnapshot,
    getSmesForSubjectGroup,
    isSmeFree,
    activeDemoSlots,
    getCollegePeriodLabels,
    gridPeriodRows,
    getSmeSlotStatus,
    mentorOptionLabel,
    getFreeMentorsForSlotCached,
    gridScopeSmes,
    activeGridSmes,
    allocProgress,
    gridWindowCapacity,
    getMentorStatusAtSlot,
    totalFreeSlotsCount,
    unassignedMentors
  } = useLndGridModel({
    colleges, mentors, slots, smes, demoSessions, demoRules, facultyLeaves, holidays,
    smeAvailability, subjectGroups, dailyConfigsMap,
    selectedDateStr, selectedCollegeId, selectedGroupId, selectedSmeId,
    mentorTargets, mentorQuotaSearch, previewSessions, generationStep
  });

  const weekRangeLabel = currentWeekDates.length > 0
    ? `${currentWeekDates[0].formatted || currentWeekDates[0].dateStr} – ${currentWeekDates[currentWeekDates.length - 1].formatted || currentWeekDates[currentWeekDates.length - 1].dateStr}`
    : selectedDateStr;

  // The timetable check reads generated slots (app data) plus day-order rotation and
  // holidays (daily configs), so a refresh has to settle both before it claims success.
  const [isTimetableRefreshing, setIsTimetableRefreshing] = useState(false);
  const refreshTimetableView = async () => {
    setIsTimetableRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["daily-configs"] }),
        refreshData(true),
      ]);
      toast("Refreshed campus timetables and day orders.", "success");
    } catch (err: any) {
      toast(`Refresh failed: ${err?.message || "could not read the latest timetable."}`, "error");
    } finally {
      setIsTimetableRefreshing(false);
    }
  };


  // Manual Override States
  const [editSession, setEditSession] = useState<any | null>(null);

  // Exceptions list for unplaced sessions
  const [exceptions, setExceptions] = useState<any[]>([]);

  // Cell Popover State for viewing mentors
  const [cellPopover, setCellPopover] = useState<any | null>(null);

  // Sync target L&D sessions count from dept rules when department filter changes
  React.useEffect(() => {
    if (selectedGroupId && selectedGroupId !== "All") {
      const rule = demoRules?.find(r => r.subject?.toLowerCase().trim() === selectedGroupId.toLowerCase().trim());
      setTargetDemosCount(rule ? rule.target : 1);
    } else {
      setTargetDemosCount(1);
    }
  }, [selectedGroupId, demoRules]);

  // Standardized helper to resolve canonical mentor group (module-level: stable identity keeps memos honest)
  const getMentorGroup = mentorGroupOf;

  const quotaPagination = usePagination(displayedQuotaMentors, {
    pageSize: 15,
    pageSizeOptions: [15, 30, 50, 100],
    resetKeys: [mentorQuotaSearch, selectedCollegeId, selectedGroupId, selectedWeek]
  });

















  // Handler for quick one-click dropdown allocation from UI Master Grid
  const handleQuickAllocateMentor = async (smeId: string, mentorId: string, dateStr: string, timeSlot: string, existingSessionId?: string) => {
    if (mentorId === "__CLEAR__") {
      if (existingSessionId) {
        const ok = await showConfirm({
          title: "Clear This Session",
          message: "Removing the assigned mentor will delete this booked session and free the slot. Continue?",
          danger: true,
          confirmLabel: "Clear Session"
        });
        if (!ok) return;
        const res = await deleteDemoSession(existingSessionId);
        if (res.success) {
          toast("Session cleared. Slot is now free.", "info");
        } else {
          toast(res.message || "Failed to clear the session.", "error");
        }
      }
      return;
    }
    if (!mentorId) return;
    const mentor = mentors.find(m => m.id === mentorId);
    const sme = smes.find(s => s.id === smeId);
    if (!mentor || !sme) return;

    try {
      if (existingSessionId) {
        await deleteDemoSession(existingSessionId);
      }
      const res = await bookDemoSession(
        mentor.id,
        mentor.name,
        sme.id,
        sme.name,
        dateStr,
        timeSlot,
        getMentorGroup(mentor),
        "General Stream",
        selectedWeek
      );

      if (res.success) {
        toast(`Allocated ${mentor.name} (${timeSlot})!`, "success");
      } else {
        toast(res.message || "Failed to allocate session.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error allocating session.", "error");
    }
  };





  const leaveAffectedCount = demoSessions.filter(d => d.status === "reallocation_required").length;
  const pendingReallocCount = demoReallocations.filter(r => r.status === "pending").length;

  const lndActiveFilters = [
    selectedCollegeId !== "all" && (currentCollege?.name || "Campus"),
    selectedGroupId !== "All" && selectedGroupId,
    selectedSmeId !== "all" && (smes.find(s => s.id === selectedSmeId)?.name || "Evaluator")
  ].filter(Boolean) as string[];

  const clearLndFilters = () => {
    setSelectedCollegeId("all");
    setSelectedGroupId("All");
    setSelectedSmeId("all");
  };


  // Helper: check if a class group (stream) is free on a given date/time
  const isGroupFree = (groupName: string, dateStr: string, time: string) => {
    const dayName = currentWeekDates.find(w => w.dateStr === dateStr)?.day || "";
    const hasClass = slots.some(s => s.classGroup === groupName && s.day === dayName && s.time === time);
    if (hasClass) return false;

    const hasDemo = demoSessions.some(ds => ds.stream === groupName && ds.dateStr === dateStr && ds.timeSlot === time);
    return !hasDemo;
  };


  // Helper: Hard block for 3 consecutive busy periods
  const checkConsecutiveHardClash = (
    entityId: string, isSme: boolean, dateStr: string, timeSlot: string, currentGenerated: any[] = []
  ) => consecutiveHardClash(slotSnapshot, entityId, isSme, dateStr, timeSlot, currentGenerated);

  // Pre-validate a pending swap request against constraints in real time
  const validateProposedSwap = (req: any) => {
    if (!req) return { valid: false, message: "Invalid request details." };

    const isMentorSwap = req.swapType === "mentor" || req.swapType === "internal";
    const isTimeSwap = req.swapType === "time" || req.swapType === "reallocation";

    if (isMentorSwap) {
      const targetMentorId = req.proposedMentorId || req.mentorId;
      const targetMentorName = req.proposedMentorName || req.mentorName;
      const mentorStatus = getMentorStatusAtSlot(targetMentorId, req.dateStr, req.timeSlot);
      if (mentorStatus.status !== "free") {
        return { valid: false, message: `Mentor ${targetMentorName} is busy: ${mentorStatus.label || mentorStatus.details}` };
      }

      const dailyLoad = demoSessions.filter(ds => ds.mentorId === targetMentorId && ds.dateStr === req.dateStr).length;
      if (dailyLoad >= 2) {
        return { valid: false, message: `Mentor ${targetMentorName} daily load exceeds limit (2/day).` };
      }

      if (checkConsecutiveHardClash(targetMentorId, false, req.dateStr, req.timeSlot)) {
        return { valid: false, message: `Mentor ${targetMentorName} consecutive limit exceeded.` };
      }

      return { valid: true, message: "Conflict-Free Match" };

    } else if (isTimeSwap) {
      const targetDate = req.proposedDateStr || req.dateStr;
      const targetTime = req.proposedTimeSlot || req.timeSlot;
      const targetSmeId = req.proposedSmeId || req.smeId;

      const isHoliday = holidays.some(h => h.date === targetDate);
      if (isHoliday) return { valid: false, message: `Proposed date is a holiday.` };

      const mentorStatus = getMentorStatusAtSlot(req.mentorId, targetDate, targetTime);
      if (mentorStatus.status !== "free") {
        return { valid: false, message: `Mentor ${req.mentorName} is busy: ${mentorStatus.label || mentorStatus.details}` };
      }

      if (!isSmeFree(targetSmeId, targetDate, targetTime)) {
        return { valid: false, message: `SME ${req.smeName} is busy.` };
      }

      if (!isGroupFree(req.stream, targetDate, targetTime)) {
        return { valid: false, message: `Group stream ${req.stream} is busy.` };
      }

      const mentorDailyLoad = demoSessions.filter(ds => ds.mentorId === req.mentorId && ds.dateStr === targetDate).length;
      if (mentorDailyLoad >= 2) {
        return { valid: false, message: `Mentor ${req.mentorName} daily load exceeds limit (2/day).` };
      }

      const smeDailyLoad = demoSessions.filter(ds => ds.smeId === targetSmeId && ds.dateStr === targetDate).length;
      if (smeDailyLoad >= 2) {
        return { valid: false, message: `SME ${req.smeName} daily load exceeds limit (2/day).` };
      }

      if (checkConsecutiveHardClash(req.mentorId, false, targetDate, targetTime)) {
        return { valid: false, message: `Mentor ${req.mentorName} consecutive limit exceeded.` };
      }
      if (checkConsecutiveHardClash(targetSmeId, true, targetDate, targetTime)) {
        return { valid: false, message: `SME ${req.smeName} consecutive limit exceeded.` };
      }

      return { valid: true, message: "Conflict-Free Match" };
    }

    return { valid: false, message: "Unsupported swap type." };
  };

  // ── Excel Timetable Slot SME Auto-Assigner (Rule Engine) ──
  // Takes uploaded timetable slots (or target mentor slots) and automatically
  // assigns qualified, conflict-free SMEs as per configured department rules.
  const autoAssignSmesToSlots = useCallback(
    (targetSlots: any[], previousAllocations: any[] = []) =>
      autoAssignSmes(slotSnapshot, targetSlots, previousAllocations),
    [slotSnapshot]
  );

  const handleTriggerGenerate = () => {
    if (!selectedCollegeId) {
      toast("Please select a college first", "error");
      return;
    }

    // Build target slots from mentors' free availability windows or imported slots
    const targetSlots: any[] = [];
    const datesToSchedule = currentWeekDates
      .map(w => w.dateStr)
      .filter(dateStr => !holidays.some(h => h.date === dateStr));

    filteredMentors.forEach(mentor => {
      const subjectGroup = getMentorGroup(mentor);
      const mentorClasses = slots.filter(s => s.mentorId === mentor.id && s.classGroup);
      const stream = (mentorClasses.length > 0 ? mentorClasses[0].classGroup : null) || "General Stream";

      datesToSchedule.forEach(dateStr => {
        collegeTimeSlots.forEach(timeSlot => {
          if (timeSlot.toLowerCase().includes("lunch") || timeSlot.toLowerCase().includes("break")) return;
          const status = getMentorStatusAtSlot(mentor.id, dateStr, timeSlot);
          if (status.status === "free") {
            targetSlots.push({
              mentorId: mentor.id,
              mentorName: mentor.name,
              collegeName: currentCollege?.name || "College",
              dateStr,
              timeSlot,
              subject: subjectGroup,
              stream,
              week: selectedWeek
            });
          }
        });
      });
    });

    if (targetSlots.length === 0) {
      toast("No free timetable slots found to auto-assign SMEs.", "warning");
      return;
    }

    const prevSessions = [...previewSessions];
    setPreviewSessions([]);
    setExceptions([]);
    setGenerationStep("generating");
    setIsGenerating(true);
    setShowPreviewModal(true);

    setTimeout(() => {
      const { generated, exceptions } = autoAssignSmesToSlots(targetSlots, prevSessions);
      setPreviewSessions(generated);
      setExceptions(exceptions);
      setGenerationStep("done");
      setIsGenerating(false);

      if (generated.length === 0 && exceptions.length === 0) {
        toast("No SME assignments could be made. SMEs may be fully occupied.", "warning");
      } else if (exceptions.length > 0) {
        toast(`Auto-assigned SMEs for ${generated.length} slots. ${exceptions.length} unassigned due to rules/conflicts.`, "warning");
      } else {
        toast(`Successfully auto-assigned SMEs for ${generated.length} timetable slots as per rules!`, "success");
      }
    }, 800);
  };

  const handleSavePreview = async () => {
    if (previewSessions.length === 0) return;
    try {
      const res = await bulkBookDemoSessions(previewSessions);
      if (res.success) {
        toast("Schedule successfully saved!", "success");
        setPreviewSessions([]);
        setShowPreviewModal(false);
        // bulkBookDemoSessions already surgically updates demoSessions state — no refreshData needed
      } else {
        toast(res.message || "Failed to save schedule.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred.", "error");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSession) return;
    try {
      const selectedSme = smes.find(s => s.id === editSession.smeId);
      const payload = {
        sessionId: editSession.id,
        dateStr: editSession.dateStr,
        timeSlot: editSession.timeSlot,
        smeId: editSession.smeId,
        smeName: selectedSme ? selectedSme.name : editSession.smeName,
        mentorId: editSession.mentorId,
        mentorName: editSession.mentorName,
        subject: editSession.subject,
        stream: editSession.stream,
        week: editSession.week
      };

      const fetchRes = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", ...payload })
      });
      const data = await fetchRes.json();

      if (data.success) {
        toast("L&D session updated successfully.", "success");
        // Surgical update: reflect edits in local demoSessions state
        setDemoSessions(prev => prev.map(s => s.id === editSession.id ? { ...s, ...payload } : s));
        setEditSession(null);
      } else {
        toast(data.message || "Failed to update session details.", "error");
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  };

  // Helper to save department demo rule to database
  const saveDepartmentRule = async (subject: string, targetVal: number) => {
    try {
      const existing = demoRules?.find(r => r.subject?.toLowerCase().trim() === subject.toLowerCase().trim());
      if (existing) {
        await deleteDemoRule(existing.id);
      }
      const res = await createDemoRule(subject, 1, targetVal);
      if (res.success) {
        toast(`Rule saved: ${subject} target is now ${targetVal} L&D session(s)/week.`, "success");
      } else {
        toast(res.message || "Failed to update rule.", "error");
      }
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  /* ==========================================================================
     EXCEL TEMPLATE DOWNLOAD, IMPORT & EXPORT HANDLERS (SUBJECT-GROUP BASED)
     ========================================================================== */

  const handleOpenTemplateModal = () => {
    fetchDailyConfigs();
    setShowTemplateModal(true);
  };

  const handleDownloadDemoTemplate = async (targetGroupInput?: string) => {
    // The workbook itself is built in lndExcelTemplate from the same snapshot the grid renders.
    const workbook = await buildLndDemoTemplate({
      snap: slotSnapshot,
      toast,
      selectedGroupId,
      demoRules: demoRules || [],
      mentorTargets,
      activeDemoSlots,
      mentorsById,
      collegesById,
      collegePeriodLabels: getCollegePeriodLabels,
      collegeTimetablePeriodList: getCollegeTimetablePeriodList,
      collegeDayStatus: getCollegeTimetableDayStatus,
      timetableCoverage: {
        collegesWithTimetable: allCollegesTimetableStatus.collegesWithTimetable,
        collegesSkipped: allCollegesTimetableStatus.collegesSkipped
      }
    }, targetGroupInput);
    if (!workbook) return;

    // Write buffer & trigger download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `L&D Session_Schedule_Template_All_Colleges_${selectedDateStr}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(downloadUrl);

    const included = allCollegesTimetableStatus.collegesWithTimetable;
    const skipped = allCollegesTimetableStatus.collegesSkipped;
    toast(`Downloaded Excel L&D Timetable template for ${included.length} colleges${skipped.length ? ` (skipped ${skipped.length} without a timetable)` : ""}!`, "success");
    setShowTemplateModal(false);
  };

  const importInputRef = useRef<HTMLInputElement>(null);
  const [isConsoleRefreshing, setIsConsoleRefreshing] = useState(false);

  // The shell header only reloads the context bundle; the L&D queues and per-campus
  // day orders live in the query cache, so this console refresh has to invalidate both.
  const handleConsoleRefresh = useCallback(async () => {
    if (isConsoleRefreshing) return;
    setIsConsoleRefreshing(true);
    try {
      await Promise.all([
        refreshData(true),
        queryClient.invalidateQueries({ queryKey: qk.demoReallocations("all") }),
        queryClient.invalidateQueries({ queryKey: qk.lndDailyConfigs(lndCollegeIdsKey, selectedCollegeId) })
      ]);
      toast("Refreshed timetable data.", "success");
    } finally {
      setIsConsoleRefreshing(false);
    }
  }, [
    isConsoleRefreshing,
    lndCollegeIdsKey,
    queryClient,
    refreshData,
    selectedCollegeId,
    toast
  ]);

  const handleDemoExcelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      // Sheet selection, row matching and conflict checks all live in lndExcelImport.
      const outcome = await parseLndDemoWorkbook(evt.target?.result, {
        snap: slotSnapshot,
        selectedGroupId,
        selectedDateStr
      });
      if (outcome.kind === "empty") {
        toast("The uploaded spreadsheet contains no valid allocation rows.", "warning");
        return;
      }
      if (outcome.kind === "error") {
        toast("Failed to parse Excel file: " + outcome.message, "error");
        return;
      }
      setDemoImportPreview({
        parsed: outcome.parsed,
        warnings: outcome.warnings,
        validCount: outcome.validCount,
        targetSubjectGroup: outcome.targetSubjectGroup
      });
      setShowDemoExcelImportModal(true);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleConfirmDemoExcelImport = async () => {
    if (!demoImportPreview || demoImportPreview.parsed.length === 0) return;
    const validSessions = demoImportPreview.parsed.filter(p => p.isValid);
    if (validSessions.length === 0) {
      toast("No valid conflict-free rows to import.", "warning");
      return;
    }
    setIsImportingDemoExcel(true);
    try {
      const payload = validSessions.map(s => ({
        mentorId: s.mentorId,
        mentorName: s.mentorName,
        collegeName: s.collegeName,
        smeId: s.smeId,
        smeName: s.smeName,
        dateStr: s.dateStr,
        timeSlot: s.timeSlot,
        subject: s.subject,
        stream: s.stream,
        week: s.week
      }));

      const res = await bulkBookDemoSessions(payload);
      if (res.success) {
        toast(`Successfully imported ${validSessions.length} L&D session allocations!`, "success");
        setShowDemoExcelImportModal(false);
        setDemoImportPreview(null);
        // bulkBookDemoSessions already surgically updates demoSessions state — no refreshData needed
      } else {
        toast(res.message || "Failed to save L&D allocations.", "error");
      }
    } catch (err: any) {
      toast("Error importing L&D session schedule: " + err.message, "error");
    } finally {
      setIsImportingDemoExcel(false);
    }
  };

  const handleExportDemoSchedule = async () => {
    const activeCollegeName = currentCollege?.name || "All_Colleges";
    const exportRows = demoSessions
      .filter(ds => {
        const matchesCollege = selectedCollegeId === "all" || mentorsById.get(ds.mentorId)?.college_id === selectedCollegeId;
        const matchesWeek = currentWeekDates.some(w => w.dateStr === ds.dateStr);
        const isActive = ds.status !== "cancelled" && ds.status !== "not_conducted";
        return matchesCollege && matchesWeek && isActive;
      })
      .map(ds => {
        const dayInfo = currentWeekDates.find(w => w.dateStr === ds.dateStr);
        return {
          "Date": ds.dateStr,
          "Day of Week": dayInfo ? dayInfo.day : "Scheduled",
          "Time Slot": ds.timeSlot,
          "Faculty Mentor": ds.mentorName,
          "Assigned SME": ds.smeName,
          "Subject Group": ds.subject,
          "Class Cohort / Stream": ds.stream,
          "Status": ds.status || "scheduled"
        };
      });

    if (exportRows.length === 0) {
      toast("No active L&D allocations to export.", "warning");
      return;
    }

    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Active_L&D Session_Schedule");

    const safeColName = activeCollegeName.replace(/[^a-zA-Z0-9]/g, "_");
    XLSX.writeFile(wb, `L&D Session_Allocations_${safeColName}_${selectedDateStr}.xlsx`);
    toast(`Exported ${exportRows.length} L&D allocations to Excel!`, "success");
  };



  const pendingQueueCount =
    (demoSwapRequests?.filter((r: any) => r.status === "pending").length || 0) +
    (demoReallocations?.filter((r: any) => r.status === "pending").length || 0);

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-warm-canvas text-slate-800 dark:text-slate-200 font-sans h-full overflow-hidden">

      {/* FLOATING COLLAPSIBLE LEFT SIDEBAR NAVIGATION */}
      <aside className={`hidden md:flex shrink-0 flex-col justify-between sticky top-6 z-30 floating-sidebar transition-all duration-300 ${isCollapsed ? "w-20 p-3" : "w-64 p-5"}`}>
        <div className="flex flex-col flex-1 overflow-visible">

          {/* Sidebar Header Toggle */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200/70 dark:border-slate-800">
            {!isCollapsed && (
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-amber-500">
                  <Compass className="h-4.5 w-4.5" />
                </div>
                <div>
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white block leading-tight">
                    Learning &amp; Dev
                  </span>
                  <span className="text-[9.5px] font-bold text-slate-400 block">L&amp;D Portal</span>
                </div>
              </div>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors mx-auto cursor-pointer"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isCollapsed ? "" : "rotate-180"}`} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <nav className="py-4 space-y-1.5">
            <button
              onClick={() => setActiveTab("matrix")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "matrix"
                ? "sidebar-active-item font-black border-none"
                : "text-slate-600 hover:text-slate-900 hover:bg-zinc-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                }`}
            >
              <Grid className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span>Allocation Matrix</span>}
            </button>

            <button
              onClick={() => setActiveTab("rules")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "rules"
                ? "sidebar-active-item font-black border-none"
                : "text-slate-600 hover:text-slate-900 hover:bg-zinc-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                }`}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span>Excel Rules &amp; Targets</span>}
            </button>

            <button
              onClick={() => setActiveTab("queue")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${activeTab === "queue"
                ? "sidebar-active-item font-black border-none"
                : "text-slate-600 hover:text-slate-900 hover:bg-zinc-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                }`}
            >
              <RefreshCw className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span>Reallocation Queue</span>}
              {((demoSwapRequests?.filter((r: any) => r.status === "pending").length || 0) + (demoReallocations?.filter((r: any) => r.status === "pending").length || 0)) > 0 && (
                <span className="ml-auto px-2 py-0.5 bg-rose-500 text-white rounded-full text-[9px] font-black">
                  {(demoSwapRequests?.filter((r: any) => r.status === "pending").length || 0) + (demoReallocations?.filter((r: any) => r.status === "pending").length || 0)}
                </span>
              )}
            </button>
          </nav>
        </div>
      </aside>

      {/* Mobile bottom navigation — the sidebar is hidden below md */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 flex md:hidden mobile-bottom-nav"
        aria-label="L&D workspace sections"
      >
        <div className="flex w-full items-center justify-around px-1 py-2">
          {[
            { id: "matrix" as const, label: "Matrix", icon: Grid },
            { id: "rules" as const, label: "Rules", icon: Settings },
            { id: "queue" as const, label: "Queue", icon: RefreshCw },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[3.5rem] rounded-xl transition-colors cursor-pointer ${
                  isActive ? "text-zinc-950 dark:text-white" : "text-slate-400"
                }`}
              >
                <span className="relative">
                  <Icon className={`h-4.5 w-4.5 transition-transform ${isActive ? "scale-110 text-amber-500" : ""}`} aria-hidden="true" />
                  {tab.id === "queue" && pendingQueueCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[7px] font-bold text-white">
                      {pendingQueueCount}
                    </span>
                  )}
                </span>
                <span className="text-[9px] font-bold leading-none">{tab.label}</span>
                {isActive && <span className="absolute top-0 inset-x-2 h-0.5 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* MAIN WORKSPACE AREA */}
      <div className="flex-1 overflow-y-auto p-3 pb-24 md:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* Page Top Header — the only place these four actions exist */}
        <PageHeader
          title="L&D Console"
          icon={Sparkles}
          meta={
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Users className="h-3 w-3" aria-hidden="true" />
              {smes.length} evaluators · {demoSessions.length} scheduled sessions
            </span>
          }
          actions={
            <>
              <Button
                variant="brand"
                size="default"
                icon={<Download className="h-4 w-4" aria-hidden="true" />}
                onClick={handleOpenTemplateModal}
              >
                Download Template
              </Button>
              <Button
                variant="success"
                size="default"
                icon={<Upload className="h-4 w-4" aria-hidden="true" />}
                onClick={() => importInputRef.current?.click()}
              >
                Import Excel Schedule
              </Button>
              <Button
                variant="outline"
                size="default"
                icon={<FileSpreadsheet className="h-4 w-4 text-[#7C3AED]" aria-hidden="true" />}
                onClick={handleExportDemoSchedule}
              >
                Export Active
              </Button>
              <Button
                variant="ghost"
                size="default"
                icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                isLoading={isConsoleRefreshing}
                loadingText="Refreshing"
                onClick={handleConsoleRefresh}
              >
                Refresh
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept={EXCEL_IMPORT_ACCEPT}
                onChange={handleDemoExcelFileSelect}
                tabIndex={-1}
                aria-label="Choose L&D Excel schedule file"
                className="sr-only"
              />
            </>
          }
        />

        {/* Unified dashboard header - the only KPI strip on this screen */}
        <LndStatsHeader
          scheduledHours={allocProgress.scheduled}
          targetHours={allocProgress.target}
          evaluatorCount={gridScopeSmes.length}
          openWindows={gridWindowCapacity.open}
          totalWindows={gridWindowCapacity.total}
          leaveAffected={leaveAffectedCount}
          pendingReallocations={pendingReallocCount}
          quotaSatisfied={allocProgress.satisfied}
          quotaTotal={allocProgress.total}
        />

        {/* TAB 1: ALLOCATION MATRIX */}
        {activeTab === "matrix" && (
          <div className="space-y-6">



            {/* Filters Bar & View Switcher */}
            <LndFilterBar
              colleges={colleges}
              mentors={mentors}
              smes={smes}
              selectedCollegeId={selectedCollegeId}
              selectedGroupId={selectedGroupId}
              selectedSmeId={selectedSmeId}
              onSelectCollege={(val) => {
                setSelectedCollegeId(val);
                setSelectedGroupId("All");
              }}
              onSelectGroup={setSelectedGroupId}
              onSelectSme={setSelectedSmeId}
              selectedWeek={selectedWeek}
              weekRangeLabel={weekRangeLabel}
              onWeekOffset={setWeekOffset}
              isCurrentWeek={isCurrentWeek}
              onThisWeek={() => setSelectedDateStr(todayStr)}
              lndActiveFilters={lndActiveFilters}
              onClearFilters={clearLndFilters}
              gridScopeSmes={gridScopeSmes}
              gridDisplayMode={gridDisplayMode}
              onGridDisplayMode={setGridDisplayMode}
              getMentorGroup={getMentorGroup}
            />

            {/*MASTER L&D GRID (SME PORTAL TIMINGS & REAL-TIME DROPDOWNS) */}
            {gridDisplayMode === "master" ? (
              <div className="space-y-6">
                {activeGridSmes.length === 0 && (
                  <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-[#131317]/70 text-center space-y-3">
                    <div className="mx-auto h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Users className="h-5 w-5 text-slate-400" aria-hidden="true" />
                    </div>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                      No evaluator matches these filters
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      {selectedCollegeId !== "all"
                        ? `No SME serves the departments posted to ${currentCollege?.name || "this campus"}.`
                        : "No SME is registered for the selected department group."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearLndFilters}
                      disabled={lndActiveFilters.length === 0}
                    >
                      Clear filters and show all evaluators
                    </Button>
                  </div>
                )}
                {selectedSmeId === "all" ? (
                  <LndMasterMatrix
                    smes={activeGridSmes}
                    slots={gridPeriodRows}
                    weekDates={currentWeekDates}
                    collegeId={selectedCollegeId !== "all" ? selectedCollegeId : undefined}
                    dayOrderFor={getEffectiveDayOrderInfo}
                    slotStatusAt={getSmeSlotStatus}
                    freeMentorsFor={getFreeMentorsForSlotCached}
                    mentorOptionLabel={mentorOptionLabel}
                    onAllocate={handleQuickAllocateMentor}
                    onOpenSession={setEditSession}
                  />
                ) : (
                activeGridSmes.map((sme) => (
                  <LndSmeTimetable
                    key={sme.id}
                    sme={sme}
                    currentWeekDates={currentWeekDates}
                    gridPeriodRows={gridPeriodRows}
                    selectedCollegeId={selectedCollegeId}
                    getEffectiveDayOrderInfo={getEffectiveDayOrderInfo}
                    getSmeSlotStatus={getSmeSlotStatus}
                    getFreeMentorsForSlotCached={getFreeMentorsForSlotCached}
                    mentorOptionLabel={mentorOptionLabel}
                    mentorsById={mentorsById}
                    collegesById={collegesById}
                    handleQuickAllocateMentor={handleQuickAllocateMentor}
                    setEditSession={setEditSession}
                  />
                ))
                )}
              </div>
            ) : (
              /* CAMPUS PERIOD TIMETABLE TABLE */
              <LndPeriodTable
                currentWeekDates={currentWeekDates}
                getEffectiveDayOrderInfo={getEffectiveDayOrderInfo}
                selectedCollegeId={selectedCollegeId}
                collegeTimeSlots={collegeTimeSlots}
                standardShiftSlots={standardShiftSlots}
                filteredMentors={filteredMentors}
                getMentorStatusAtSlot={getMentorStatusAtSlot}
                getMentorGroup={getMentorGroup}
                getSmesForSubjectGroup={getSmesForSubjectGroup}
                smes={smes}
                slots={slots}
                selectedWeek={selectedWeek}
                setEditSession={setEditSession}
                setCellPopover={setCellPopover}
                toast={toast}
              />

            )}

            {/*REAL-TIME FACULTY WEEKLY L&D HOURS & QUOTA MONITOR (WEB UI) */}
            <div className="bg-white/90 dark:bg-[#131317]/90 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-5 shadow-card space-y-4 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-2">
                      Mentor Weekly Quota
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Week {selectedWeek} · {weekRangeLabel}
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {allocProgress.total - allocProgress.satisfied > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      {allocProgress.total - allocProgress.satisfied} pending quota
                    </span>
                  )}
                  {mentorQuotaSearch.trim() && (
                    <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 max-w-[220px] truncate">
                      Search: {mentorQuotaSearch.trim()}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setQuotaOpen(open => !open)}
                    aria-expanded={quotaOpen}
                    aria-controls="lnd-quota-panel"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:border-slate-900/50 dark:hover:border-amber-500/50 transition-colors cursor-pointer"
                  >
                    {quotaOpen ? "Hide" : "Show"} {displayedQuotaMentors.length} faculty
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${quotaOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {quotaOpen && (
                <div id="lnd-quota-panel" className="space-y-4">
                  {/* Quick Search */}
                  <div className="relative min-w-[220px]">
                    <label htmlFor="lnd-quota-search" className="sr-only">
                      Search faculty in the quota monitor
                    </label>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="lnd-quota-search"
                      type="search"
                      value={mentorQuotaSearch}
                      onChange={(e) => setMentorQuotaSearch(e.target.value)}
                      placeholder="Search faculty, dept or campus..."
                      aria-describedby="lnd-quota-count"
                      className="h-8 py-1.5 pl-8 pr-3 text-xs font-medium bg-slate-50 dark:bg-slate-800/60"
                    />
                  </div>

                  <p id="lnd-quota-count" role="status" className="text-[10px] text-slate-400 font-semibold">
                    {displayedQuotaMentors.length} of {quotaMentorsSummary.length} faculty in scope
                  </p>

              {/* Real-time Table */}
              <TableSurface
                stickyHeader
                containerClassName="max-h-[300px]"
                tableClassName="text-left text-xs"
                footer={
                  <Pagination
                    currentPage={quotaPagination.page}
                    totalItems={displayedQuotaMentors.length}
                    pageSize={quotaPagination.pageSize}
                    onPageChange={quotaPagination.setPage}
                    onPageSizeChange={quotaPagination.setPageSize}
                    pageSizeOptions={quotaPagination.pageSizeOptions}
                    ariaLabel="Faculty weekly quota monitor pagination"
                  />
                }
              >
                  <thead className="bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Faculty / Mentor</th>
                      <th className="p-3">Campus & Dept</th>
                      <th className="p-3 text-center">Weekly Target</th>
                      <th className="p-3 text-center">Scheduled (This Wk)</th>
                      <th className="p-3 text-center">Remaining</th>
                      <th className="p-3">Progress</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {quotaPagination.pageItems.length > 0 ? (
                      quotaPagination.pageItems.map(({ mentor, group, collegeName, customTarget, scheduledCount, remainingCount, isSatisfied, isOver }) => {
                        const pct = Math.min(100, Math.round((scheduledCount / Math.max(1, customTarget)) * 100));
                        return (
                          <tr key={mentor.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="p-3 font-bold text-slate-900 dark:text-white">
                              {mentor.name}
                            </td>
                            <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px]">
                              <span>{collegeName}</span>
                              <span className="mx-1 text-slate-300 dark:text-slate-600">•</span>
                              <span className="text-slate-600 dark:text-slate-300 font-semibold">{group}</span>
                            </td>
                            <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSetMentorTarget(mentor.id, Math.max(0, customTarget - 1))}
                                  className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-black hover:bg-slate-300 text-[10px]"
                                  title="Decrease quota"
                                >
                                  -
                                </button>
                                <span className="min-w-[18px]">{customTarget}</span>
                                <button
                                  type="button"
                                  onClick={() => handleSetMentorTarget(mentor.id, customTarget + 1)}
                                  className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center font-black hover:bg-slate-300 text-[10px]"
                                  title="Increase quota"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-center font-extrabold text-indigo-600 dark:text-indigo-400">
                              {scheduledCount} hr{scheduledCount !== 1 ? "s" : ""}
                            </td>
                            <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">
                              {remainingCount} hr{remainingCount !== 1 ? "s" : ""}
                            </td>
                            <td className="p-3 min-w-[120px]">
                              <div className="space-y-1">
                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isSatisfied ? "bg-emerald-500" : "bg-indigo-500"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-slate-400 font-semibold block">{pct}%</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              {isSatisfied ? (
                                <Badge variant="success">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {isOver ? `Over (+${scheduledCount - customTarget})` : "Satisfied"}
                                </Badge>
                              ) : (
                                <Badge variant="warning">
                                  <Clock className="h-3 w-3" />
                                  Pending ({remainingCount} left)
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400 text-xs font-semibold">
                          {mentorQuotaSearch.trim()
                            ? <>No faculty found matching &ldquo;{mentorQuotaSearch}&rdquo;</>
                            : "No faculty in the current campus / department scope."}
                        </td>
                      </tr>
                    )}
                  </tbody>
              </TableSurface>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: AUTO-SCHEDULER ENGINE & DEPARTMENT RULES */}
        {activeTab === "rules" && (
          <LndRulesTab
            mentors={mentors}
            mentorGroups={mentorGroups}
            demoRules={demoRules}
            selectedCollegeId={selectedCollegeId}
            currentCollege={currentCollege}
            rulesSelectedGroup={rulesSelectedGroup}
            setRulesSelectedGroup={setRulesSelectedGroup}
            getMentorGroup={getMentorGroup}
            ruleTargetsBySubject={ruleTargetsBySubject}
            mentorTargets={mentorTargets}
            collegesById={collegesById}
            targetDemosCount={targetDemosCount}
            setTargetDemosCount={setTargetDemosCount}
            deptRuleInputs={deptRuleInputs}
            setDeptRuleInputs={setDeptRuleInputs}
            saveDepartmentRule={saveDepartmentRule}
            handleSetMentorTarget={handleSetMentorTarget}
          />
        )}


        {/* TAB 3: REALLOCATION QUEUE & DIAGNOSTICS */}
        {activeTab === "queue" && (
          <LndQueueTab
            demoSessions={demoSessions}
            demoSwapRequests={demoSwapRequests}
            demoReallocations={demoReallocations}
            fetchDemoReallocations={fetchDemoReallocations}
            loadingReallocations={loadingReallocations}
            reallocNotesMap={reallocNotesMap}
            setReallocNotesMap={setReallocNotesMap}
            decidingReallocId={decidingReallocId}
            decideDemoReallocation={decideDemoReallocation}
            swapRequestsTab={swapRequestsTab}
            setSwapRequestsTab={setSwapRequestsTab}
            resolveDemoSwap={resolveDemoSwap}
            toast={toast}
          />
        )}

        {/*AUTOMATED GENERATION PREVIEW MODAL */}
        {showPreviewModal && (
          <LndPreviewModal
            collegeTimeSlots={collegeTimeSlots}
            collegesById={collegesById}
            currentCollege={currentCollege}
            currentWeekDates={currentWeekDates}
            exceptions={exceptions}
            filteredMentors={filteredMentors}
            generationStep={generationStep}
            handleSavePreview={handleSavePreview}
            handleTriggerGenerate={handleTriggerGenerate}
            isGenerating={isGenerating}
            mentorsById={mentorsById}
            previewSessions={previewSessions}
            selectedCollegeId={selectedCollegeId}
            selectedGroupId={selectedGroupId}
            setEditSession={setEditSession}
            setShowPreviewModal={setShowPreviewModal}
            showPreviewModal={showPreviewModal}
            totalFreeSlotsCount={totalFreeSlotsCount}
            unassignedMentors={unassignedMentors}
          />
        )}

        {/* MANUAL OVERRIDE / CREATE MODAL */}
        {editSession !== null && (
          <LndOverrideModal
            bookDemoSession={bookDemoSession}
            classGroups={classGroups}
            collegeTimeSlots={collegeTimeSlots}
            deleteDemoSession={deleteDemoSession}
            editSession={editSession}
            handleSaveEdit={handleSaveEdit}
            setEditSession={setEditSession}
            showConfirm={showConfirm}
            smes={smes}
            toast={toast}
          />
        )}

        {/*CELL DETAILS POPUP / VIEW MENTORS DRAWER */}
        {cellPopover !== null && (
          <LndCellDetailsModal
            cellPopover={cellPopover}
            filteredMentors={filteredMentors}
            getMentorGroup={getMentorGroup}
            getMentorStatusAtSlot={getMentorStatusAtSlot}
            getSmesForSubjectGroup={getSmesForSubjectGroup}
            selectedWeek={selectedWeek}
            setCellPopover={setCellPopover}
            setEditSession={setEditSession}
            slots={slots}
            smes={smes}
            toast={toast}
          />
        )}

        {/*SWAP REQUESTS RESOLUTION MODAL */}
        {showSwapRequestsModal && (
          <LndSwapRequestsModal
            demoSwapRequests={demoSwapRequests}
            resolveDemoSwap={resolveDemoSwap}
            setShowSwapRequestsModal={setShowSwapRequestsModal}
            setSwapRequestsTab={setSwapRequestsTab}
            showSwapRequestsModal={showSwapRequestsModal}
            swapRequestsTab={swapRequestsTab}
            toast={toast}
            validateProposedSwap={validateProposedSwap}
          />
        )}



        {/*L&D SCHEDULE EXCEL IMPORT PREVIEW MODAL */}
        {showDemoExcelImportModal && demoImportPreview && (
          <LndImportPreviewModal
            demoImportPreview={demoImportPreview}
            handleConfirmDemoExcelImport={handleConfirmDemoExcelImport}
            isImportingDemoExcel={isImportingDemoExcel}
            setShowDemoExcelImportModal={setShowDemoExcelImportModal}
            showDemoExcelImportModal={showDemoExcelImportModal}
          />
        )}

        {/*SELECT MENTOR GROUP TEMPLATE CHOOSER MODAL (MULTI-CAMPUS & DAY-ORDER GATED) */}
        {showTemplateModal && (
          <LndTemplateChooserModal
            allCollegesTimetableStatus={allCollegesTimetableStatus}
            colleges={colleges}
            currentWeekDates={currentWeekDates}
            getCollegeTimetableDayStatus={getCollegeTimetableDayStatus}
            getEffectiveDayOrderInfo={getEffectiveDayOrderInfo}
            getMentorGroup={getMentorGroup}
            getSmesForSubjectGroup={getSmesForSubjectGroup}
            handleDownloadDemoTemplate={handleDownloadDemoTemplate}
            isTimetableRefreshing={isTimetableRefreshing}
            mentorGroups={mentorGroups}
            mentors={mentors}
            refreshTimetableView={refreshTimetableView}
            setShowTemplateModal={setShowTemplateModal}
            setTemplateMentorGroup={setTemplateMentorGroup}
            showTemplateModal={showTemplateModal}
            smes={smes}
            templateMentorGroup={templateMentorGroup}
          />
        )}


      </div>
    </div>
  );
}

