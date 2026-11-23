"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  Clock,
  Building2,
  User,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  BookOpen,
  CalendarDays,
  Check,
  X,
  ArrowRight,
  Inbox,
  AlertCircle,
  ShieldAlert
} from "lucide-react";
import { getLocalDateStr, shiftDateStr, parseLocalDate } from "@/lib/localDate";
import { mapDayOrderToDayName, getCollegePeriodTimeSlots, isTimeSlotMatch } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

export interface SMEReallocationPlannerProps {
  currentSME: any;
  mentors: any[];
  colleges: any[];
  slots: any[];
  demoSessions: any[];
  smeAvailability: any[];
  leaveRequests: any[];
  inboundRequests?: any[];
  affectedSessions?: any[];
  onResolveRequest?: (request: any, decision: "approved" | "rejected") => Promise<void>;
  onReallocateSlot?: (mentor: any, dateStr: string, timeSlot: string, existingSession?: any) => void;
  onInitiateManualRealloc?: () => void;
}

interface NormalizedReallocRequest {
  id: string;
  sourceType: "inbound_proposal" | "affected_session";
  rawItem: any;
  mentorId: string;
  mentorName: string;
  mentor: any;
  college: any;
  subject: string;
  originalDate: string;
  originalSlot: string;
  proposedDate: string;
  proposedSlot: string;
  reason: string;
}

interface CollegeDayConfig {
  dayOrder: string;
  dayType: string;
  notes?: string;
  isHoliday?: boolean;
}

const DEFAULT_PERIODS = [
  "Period 1 (08:30 - 09:25)",
  "Period 2 (09:25 - 10:20)",
  "Period 3 (10:40 - 11:35)",
  "Period 4 (11:35 - 12:30)",
  "Period 5 (01:25 - 02:20)",
  "Period 6 (02:20 - 03:15)"
];

export default function SMEReallocationPlanner({
  currentSME,
  mentors,
  colleges,
  slots,
  demoSessions,
  smeAvailability,
  leaveRequests,
  inboundRequests = [],
  affectedSessions = [],
  onResolveRequest,
  onReallocateSlot,
  onInitiateManualRealloc
}: SMEReallocationPlannerProps) {
  // ── Normalize Active Reallocation Requests ─────────────────────────
  // Pool only mentors who actually raised a reallocation proposal or have an affected session
  const activeRequests: NormalizedReallocRequest[] = useMemo(() => {
    const list: NormalizedReallocRequest[] = [];

    // 1. Inbound proposals targeting this SME
    for (const req of inboundRequests) {
      const mId = req.mentorId || req.mentor_id;
      const mentor = mentors.find(m => m.id === mId) || {
        id: mId,
        name: req.mentorName || req.mentor_name || "Faculty Mentor",
        department: req.department || req.stream || "Engineering",
        college_id: req.college_id || req.collegeId
      };
      const college = colleges.find(c => c.id === mentor.college_id);

      list.push({
        id: req.id,
        sourceType: "inbound_proposal",
        rawItem: req,
        mentorId: mId,
        mentorName: req.mentorName || req.mentor_name || mentor.name,
        mentor,
        college,
        subject: req.subject || "L&D Demo Evaluation",
        originalDate: req.original_date_str || req.dateStr || getLocalDateStr(),
        originalSlot: req.original_time_slot || req.timeSlot || "Period 1 (08:30 - 09:25)",
        proposedDate: req.proposed_date_str || req.proposedDateStr || req.dateStr || getLocalDateStr(),
        proposedSlot: req.proposed_time_slot || req.proposedTimeSlot || req.timeSlot || "Period 2 (09:25 - 10:20)",
        reason: req.reason || "Faculty Reschedule Proposal"
      });
    }

    // 2. Sessions requiring reallocation due to leave or clash
    for (const sess of affectedSessions) {
      // Avoid duplicate if already covered by an inbound proposal for the same session
      if (list.some(r => r.rawItem.demo_session_id === sess.id || r.id === sess.id)) {
        continue;
      }
      const mId = sess.mentorId || sess.mentor_id;
      const mentor = mentors.find(m => m.id === mId) || {
        id: mId,
        name: sess.mentorName || sess.mentor_name || "Faculty Mentor",
        department: sess.department || sess.stream || "Engineering",
        college_id: sess.college_id || sess.collegeId
      };
      const college = colleges.find(c => c.id === mentor.college_id);

      list.push({
        id: sess.id,
        sourceType: "affected_session",
        rawItem: sess,
        mentorId: mId,
        mentorName: sess.mentorName || sess.mentor_name || mentor.name,
        mentor,
        college,
        subject: sess.subject || "L&D Demo Evaluation",
        originalDate: sess.dateStr || getLocalDateStr(),
        originalSlot: sess.timeSlot || "Period 1 (08:30 - 09:25)",
        proposedDate: sess.dateStr || getLocalDateStr(),
        proposedSlot: sess.timeSlot || "Period 1 (08:30 - 09:25)",
        reason: sess.comments || "Session affected by approved faculty leave / conflict"
      });
    }

    return list;
  }, [inboundRequests, affectedSessions, mentors, colleges]);

  // Selected Request ID (default to first active request)
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");

  useEffect(() => {
    if (activeRequests.length > 0) {
      if (!selectedRequestId || !activeRequests.some(r => r.id === selectedRequestId)) {
        setSelectedRequestId(activeRequests[0].id);
      }
    } else {
      setSelectedRequestId("");
    }
  }, [activeRequests, selectedRequestId]);

  const currentRequest = useMemo(() => {
    return activeRequests.find(r => r.id === selectedRequestId) || activeRequests[0] || null;
  }, [activeRequests, selectedRequestId]);

  // Selected Date for Inspection (defaults to the proposed date of the current request)
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateStr());

  // Update selected date whenever currentRequest changes
  useEffect(() => {
    if (currentRequest) {
      setSelectedDate(currentRequest.proposedDate || currentRequest.originalDate || getLocalDateStr());
    }
  }, [currentRequest]);

  // ── Live Day Order State for the Requesting Mentor's Campus ────────
  const [campusDayConfig, setCampusDayConfig] = useState<CollegeDayConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);

  const requestingMentor = currentRequest?.mentor || null;
  const requestingCollege = currentRequest?.college || null;
  const mentorCollegeId = requestingMentor?.college_id || requestingCollege?.id || null;

  const fetchLiveCampusDayOrder = useCallback(async (collegeId: string | null, dateStr: string) => {
    if (!collegeId) {
      setCampusDayConfig({ dayOrder: "Day 1", dayType: "working", isHoliday: false });
      return;
    }
    setLoadingConfig(true);
    try {
      const res = await apiFetch<any>(
        `/api/daily-configs?college_id=${collegeId}&startDate=${dateStr}&endDate=${dateStr}`
      );
      if (res.success && Array.isArray(res.configs) && res.configs.length > 0) {
        const cfg = res.configs.find((c: any) => (c.college_id || c.collegeId) === collegeId) || res.configs[0];
        setCampusDayConfig({
          dayOrder: cfg.day_order || "Day 1",
          dayType: cfg.day_type || "working",
          notes: cfg.notes || "",
          isHoliday: cfg.day_type === "holiday" || cfg.is_holiday === 1
        });
      } else {
        setCampusDayConfig({ dayOrder: "Day 1", dayType: "working", isHoliday: false });
      }
    } catch {
      setCampusDayConfig({ dayOrder: "Day 1", dayType: "working", isHoliday: false });
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    if (mentorCollegeId && selectedDate) {
      fetchLiveCampusDayOrder(mentorCollegeId, selectedDate);
    } else {
      setCampusDayConfig({ dayOrder: "Day 1", dayType: "working", isHoliday: false });
    }
  }, [mentorCollegeId, selectedDate, fetchLiveCampusDayOrder]);

  // Calendar weekday derived from selected date
  const rawWeekday = useMemo(() => {
    try {
      const parsed = parseLocalDate(selectedDate);
      return parsed.toLocaleDateString("en-US", { weekday: "long" });
    } catch {
      return "Monday";
    }
  }, [selectedDate]);

  // Formatted date label
  const formattedDateLabel = useMemo(() => {
    try {
      const parsed = parseLocalDate(selectedDate);
      return parsed.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Standard period slots for this college
  const periodSlots = useMemo(() => {
    const derived = getCollegePeriodTimeSlots(mentorCollegeId, colleges, slots);
    return derived && derived.length > 0 ? derived : DEFAULT_PERIODS;
  }, [mentorCollegeId, colleges, slots]);

  // Effective academic day mapped from real-time Day Order
  const effectiveDay = useMemo(() => {
    const order = campusDayConfig?.dayOrder;
    if (order && order !== "None" && order !== "none") {
      return mapDayOrderToDayName(order, rawWeekday);
    }
    return rawWeekday;
  }, [campusDayConfig, rawWeekday]);

  // ── SME Schedule on selectedDate ──────────────────────────────────
  const smeSchedule = useMemo(() => {
    const smeDemosOnDate = demoSessions.filter(d => {
      const isMySme = d.smeId === currentSME?.id || (d as any).sme_id === currentSME?.id;
      const isDate = (d.dateStr || (d as any).date_str) === selectedDate;
      const isActive = d.status !== "not_conducted";
      // Ignore the session currently being rescheduled if it's this SME's own
      if (currentRequest && (d.id === currentRequest.id || d.id === currentRequest.rawItem.demo_session_id)) {
        return false;
      }
      return isMySme && isDate && isActive;
    });

    const activeWindows = (smeAvailability || []).filter((w: any) => {
      const matchSme = w.sme_id === currentSME?.id;
      const isAct = w.is_active !== 0;
      const dayMatch = (w.day_of_week || "").toLowerCase().trim() === rawWeekday.toLowerCase().trim();
      return matchSme && isAct && dayMatch;
    });

    return periodSlots.map((period: string) => {
      const bookedDemo = smeDemosOnDate.find(d => {
        const slot = d.timeSlot || (d as any).time_slot || "";
        return isTimeSlotMatch(slot, period);
      });

      const inWindow = activeWindows.length === 0 || activeWindows.some((w: any) => {
        const winStart = w.start_time || "09:00 AM";
        const winEnd = w.end_time || "05:30 PM";
        return isTimeSlotMatch(`${winStart} - ${winEnd}`, period);
      });

      const isFree = !bookedDemo && inWindow;

      return {
        period,
        isFree,
        bookedDemo,
        hasWindow: inWindow,
        statusText: bookedDemo
          ? `Booked: ${bookedDemo.mentorName || "Candidate"} (${bookedDemo.subject || "Demo"})`
          : inWindow
          ? "Available for Evaluation"
          : "Outside Available Window"
      };
    });
  }, [demoSessions, currentSME, selectedDate, rawWeekday, smeAvailability, periodSlots, currentRequest]);

  // ── Requesting Mentor Schedule on selectedDate ─────────────────────
  const requestingMentorSchedule = useMemo(() => {
    if (!requestingMentor) return [];

    // Check faculty leave for mentor on selectedDate
    const isOnLeave = (leaveRequests || []).some((l: any) => {
      const mMatch = (l.mentorId || l.mentor_id || l.userId) === requestingMentor.id;
      const statusMatch = l.status === "approved" || l.status === "Approved";
      const start = l.startDate || l.start_date || l.dateStr || "";
      const end = l.endDate || l.end_date || start;
      return mMatch && statusMatch && selectedDate >= start && selectedDate <= end;
    });

    return periodSlots.map((period: string) => {
      // 1. Leave Check
      if (isOnLeave) {
        return {
          period,
          isFree: false,
          reason: "On Approved Faculty Leave",
          badgeType: "leave"
        };
      }

      // 2. Regular Teaching Slot (using effectiveDay from live Day Order!)
      const teachingSlot = slots.find(s => {
        const mMatch = (s.mentor_id || s.mentorId) === requestingMentor.id;
        const dayMatch = (s.day || "").toLowerCase().trim() === effectiveDay.toLowerCase().trim();
        const timeMatch = isTimeSlotMatch(s.time, period);
        return mMatch && dayMatch && timeMatch;
      });

      if (teachingSlot) {
        return {
          period,
          isFree: false,
          reason: `Teaching: ${teachingSlot.subject || "Class"} (${teachingSlot.class_group || "Regular"})`,
          badgeType: "class"
        };
      }

      // 3. Demo Session Check (other demos not being rescheduled)
      const otherDemo = demoSessions.find(d => {
        const mMatch = (d.mentorId || (d as any).mentor_id) === requestingMentor.id;
        const dateMatch = (d.dateStr || (d as any).date_str) === selectedDate;
        const timeMatch = isTimeSlotMatch(d.timeSlot || (d as any).time_slot, period);
        const actMatch = d.status !== "not_conducted";
        const isSelf = currentRequest && (d.id === currentRequest.id || d.id === currentRequest.rawItem.demo_session_id);
        return mMatch && dateMatch && timeMatch && actMatch && !isSelf;
      });

      if (otherDemo) {
        return {
          period,
          isFree: false,
          reason: `Other Demo: ${otherDemo.subject || "Session"} (${otherDemo.status})`,
          badgeType: "demo"
        };
      }

      return {
        period,
        isFree: true,
        reason: "Mentor Free (No Class)",
        badgeType: "free"
      };
    });
  }, [requestingMentor, leaveRequests, selectedDate, periodSlots, slots, effectiveDay, demoSessions, currentRequest]);

  // ── Combined Mutual Availability Matrix ────────────────────────────
  const combinedPeriods = useMemo(() => {
    return periodSlots.map((period: string, idx: number) => {
      const smeP = smeSchedule[idx] || { isFree: false, statusText: "Unavailable" };
      const mentorP = requestingMentorSchedule[idx] || { isFree: false, reason: "Unavailable", badgeType: "unavailable" };

      const isMutuallyFree = Boolean(smeP.isFree && mentorP.isFree);
      const isProposedSlot = Boolean(
        currentRequest &&
        selectedDate === currentRequest.proposedDate &&
        isTimeSlotMatch(currentRequest.proposedSlot, period)
      );

      return {
        period,
        isMutuallyFree,
        isProposedSlot,
        smeFree: smeP.isFree,
        mentorFree: mentorP.isFree,
        smeStatus: smeP.statusText,
        mentorStatus: mentorP.reason,
        badgeType: isMutuallyFree
          ? "mutual"
          : mentorP.badgeType === "leave"
          ? "leave"
          : !mentorP.isFree
          ? "mentor_busy"
          : "sme_busy"
      };
    });
  }, [periodSlots, smeSchedule, requestingMentorSchedule, currentRequest, selectedDate]);

  const mutualSlotCount = combinedPeriods.filter((p: any) => p.isMutuallyFree).length;
  const isProposedSlotAvailable = useMemo(() => {
    return combinedPeriods.some((p: any) => p.isProposedSlot && p.isMutuallyFree);
  }, [combinedPeriods]);

  // Resolving state
  const [resolvingDecision, setResolvingDecision] = useState<string | null>(null);

  const handleApproveProposed = async () => {
    if (!currentRequest || !onResolveRequest) return;
    setResolvingDecision("approved");
    try {
      await onResolveRequest(currentRequest.rawItem, "approved");
    } finally {
      setResolvingDecision(null);
    }
  };

  const handleReject = async () => {
    if (!currentRequest || !onResolveRequest) return;
    setResolvingDecision("rejected");
    try {
      await onResolveRequest(currentRequest.rawItem, "rejected");
    } finally {
      setResolvingDecision(null);
    }
  };

  const handleSelectAlternativeSlot = (period: string) => {
    if (!currentRequest || !onReallocateSlot) return;
    onReallocateSlot(currentRequest.mentor, selectedDate, period, currentRequest.rawItem);
  };

  // ── Empty State: Zero Reallocation Requests ────────────────────────
  if (activeRequests.length === 0) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 mx-auto flex items-center justify-center border border-emerald-200/60 dark:border-emerald-800/40">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
            No Pending Reallocation Requests
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
            All faculty mentor demo evaluations under your supervision are currently scheduled without conflict.
            When a mentor raises a reschedule proposal or a session is affected by approved leave, their live timetable,
            campus Day Order, and mutual free slots will appear here for conflict-free resolution.
          </p>
        </div>
        {onInitiateManualRealloc && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onInitiateManualRealloc}
              className="px-4 py-2 rounded-xl text-xs font-black bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-slate-900 shadow-2xs cursor-pointer transition-all inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reallocate an Upcoming Demo Manually
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* ── Active Request Switcher (Only Requesting Mentors) ──────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5 text-amber-500" />
            Active Reallocation Requests ({activeRequests.length} Requiring Decision)
          </span>
          <span className="text-[10px] font-bold text-slate-400">
            Select a request to inspect that mentor&apos;s live Day Order and timetable
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeRequests.map(req => {
            const isSelected = req.id === currentRequest?.id;
            return (
              <div
                key={req.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRequestId(req.id)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedRequestId(req.id);
                  }
                }}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? "bg-amber-50/60 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600 shadow-sm ring-1 ring-amber-400/50"
                    : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs"
                }`}
              >
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="min-w-0 flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-[10px] text-slate-700 dark:text-slate-300 shrink-0">
                      {req.mentorName.charAt(0) || "M"}
                    </div>
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {req.mentorName}
                    </span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase shrink-0 ${
                      req.sourceType === "inbound_proposal"
                        ? "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    {req.sourceType === "inbound_proposal" ? "Proposal" : "Leave Clash"}
                  </span>
                </div>

                <div className="pt-2 space-y-1">
                  <div className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">
                    {req.subject} • <span className="text-slate-400 font-semibold">{req.college?.name || "Campus"}</span>
                  </div>
                  <div className="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <span>{req.originalDate}</span>
                    <ArrowRight className="h-2.5 w-2.5 text-amber-500" />
                    <span className="font-bold text-amber-700 dark:text-amber-400">{req.proposedDate} ({req.proposedSlot.split(" ")[0]})</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Request Details & Real-Time Day Order Strip ───────────────── */}
      {currentRequest && (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            {/* Requesting Mentor Identity */}
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 font-black text-sm">
                {currentRequest.mentorName.charAt(0) || "M"}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {currentRequest.mentorName}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">
                    ({currentRequest.mentor?.department || "Faculty"})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {currentRequest.college?.name || "Campus"}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                  Subject: <strong className="text-slate-800 dark:text-slate-200">{currentRequest.subject}</strong>
                  {" • "}
                  Reason: <span className="italic">&quot;{currentRequest.reason}&quot;</span>
                </p>
              </div>
            </div>

            {/* Date Switcher for Target Day Inspection */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-1">
                <button
                  type="button"
                  onClick={() => setSelectedDate(shiftDateStr(selectedDate, -1))}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="px-3 flex items-center gap-2 text-xs font-black text-slate-800 dark:text-white">
                  <Calendar className="h-3.5 w-3.5 text-amber-500" />
                  <span>{formattedDateLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDate(shiftDateStr(selectedDate, 1))}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {currentRequest.proposedDate && currentRequest.proposedDate !== selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(currentRequest.proposedDate)}
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-300 cursor-pointer transition-all"
                  title="Jump to Mentor's Requested Date"
                >
                  Requested Date ({currentRequest.proposedDate})
                </button>
              )}
            </div>
          </div>

          {/* Real-Time Campus Day Order Banner for this Mentor */}
          <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/80 dark:border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs font-black text-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 block">
                  Campus Real-Time Day Order ({currentRequest.college?.name || "Campus"})
                </span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span>{campusDayConfig?.isHoliday ? "Campus Holiday" : campusDayConfig?.dayOrder || "Day 1"}</span>
                  <span className="text-slate-400 font-semibold">•</span>
                  <span className="text-amber-700 dark:text-amber-400 font-bold">
                    {campusDayConfig?.isHoliday ? "No Timetable" : `Follows ${effectiveDay} Academic Timetable`}
                  </span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {loadingConfig && (
                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Syncing Day Order...
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-300 shadow-2xs">
                {campusDayConfig?.isHoliday ? "Campus Closed" : `${campusDayConfig?.dayOrder || "Day 1"} Active`}
              </span>
            </div>
          </div>

          {/* ── SME vs Mentor Side-by-Side Schedule Comparison ─────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-violet-600" />
                  Day Schedule &amp; Free Time Comparison ({formattedDateLabel})
                </h4>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                  Green periods highlight mutually free slots where both the mentor has no classes and the SME has open evaluation time.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/80 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  {mutualSlotCount} Mutually Free Periods
                </span>
              </div>
            </div>

            {/* Periods Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {combinedPeriods.map((slot: any, idx: number) => {
                const periodLabel = slot.period.split(" ")[0] + " " + (slot.period.split(" ")[1] || "");
                const timingLabel = slot.period.match(/\((.*?)\)/)?.[1] || "";

                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 text-left transition-all ${
                      slot.isProposedSlot && slot.isMutuallyFree
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-500/60 shadow-sm"
                        : slot.isMutuallyFree
                        ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700 shadow-2xs"
                        : slot.isProposedSlot
                        ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-300 dark:border-rose-700"
                        : "bg-slate-50/80 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-500"
                    }`}
                  >
                    <div>
                      {/* Period Header */}
                      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-700 dark:text-slate-300">{periodLabel}</span>
                        <span className="font-mono text-[8px] text-slate-400">{timingLabel}</span>
                      </div>

                      {/* Mentor Status */}
                      <div className="pt-1.5 space-y-1">
                        <div className="text-[8.5px] font-black uppercase tracking-wider text-slate-400">
                          {currentRequest.mentorName.split(" ")[0]}:
                        </div>
                        <div className={`text-[9.5px] font-bold line-clamp-2 ${
                          slot.mentorFree ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                        }`}>
                          {slot.mentorStatus}
                        </div>
                      </div>

                      {/* SME Status */}
                      <div className="pt-2 space-y-1 border-t border-slate-100/80 dark:border-slate-800/60 mt-1.5">
                        <div className="text-[8.5px] font-black uppercase tracking-wider text-slate-400">
                          My Schedule:
                        </div>
                        <div className={`text-[9.5px] font-bold line-clamp-2 ${
                          slot.smeFree ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"
                        }`}>
                          {slot.smeStatus}
                        </div>
                      </div>
                    </div>

                    {/* Action Trigger for this slot */}
                    <div className="pt-2">
                      {slot.isProposedSlot && slot.isMutuallyFree ? (
                        <div className="space-y-1">
                          <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-emerald-600 text-white block text-center shadow-2xs">
                            Requested Slot (Free!)
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(resolvingDecision)}
                            onClick={handleApproveProposed}
                            className="w-full py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" /> Approve Slot
                          </button>
                        </div>
                      ) : slot.isMutuallyFree ? (
                        <button
                          type="button"
                          onClick={() => handleSelectAlternativeSlot(slot.period)}
                          className="w-full py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider bg-white dark:bg-slate-800 hover:bg-emerald-50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <RefreshCw className="h-2.5 w-2.5" /> Reallocate Here
                        </button>
                      ) : slot.isProposedSlot ? (
                        <span className="px-1.5 py-1 rounded text-[8.5px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 block text-center border border-rose-200">
                          Requested Slot (Has Clash)
                        </span>
                      ) : (
                        <span className="text-[8.5px] font-bold text-slate-400 block text-center">
                          Unavailable
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Primary Action Decision Bar ──────────────────────────── */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Mentor Requested: {currentRequest.proposedDate} • {currentRequest.proposedSlot}
              </span>
              <p className="text-[10.5px] text-slate-500 mt-0.5">
                {isProposedSlotAvailable ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Requested period is mutually free with zero teaching or demo clashes!
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Requested period has a clash on {selectedDate}. Choose another mutually free period above.
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onResolveRequest && (
                <button
                  type="button"
                  disabled={Boolean(resolvingDecision)}
                  onClick={handleReject}
                  className="px-3.5 py-2 text-xs font-black border border-rose-200 hover:border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5 inline mr-1" />
                  {resolvingDecision === "rejected" ? "Rejecting..." : "Reject Request"}
                </button>
              )}

              {onResolveRequest && isProposedSlotAvailable && (
                <button
                  type="button"
                  disabled={Boolean(resolvingDecision)}
                  onClick={handleApproveProposed}
                  className="px-4 py-2 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {resolvingDecision === "approved" ? "Approving..." : "Approve Proposed Slot"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
