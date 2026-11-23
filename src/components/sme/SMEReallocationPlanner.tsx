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
  Search,
  Filter,
  Sparkles,
  BookOpen,
  CalendarDays
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
  affectedSessions?: any[];
  onReallocateSlot: (mentor: any, dateStr: string, timeSlot: string, existingSession?: any) => void;
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
  affectedSessions = [],
  onReallocateSlot
}: SMEReallocationPlannerProps) {
  // ── Date and Filtering State ──────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string>(() => getLocalDateStr());
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>("all");
  const [mentorSearch, setMentorSearch] = useState<string>("");
  const [filterAvailabilityOnly, setFilterAvailabilityOnly] = useState<boolean>(false);

  // ── Live Day Order State (from /api/daily-configs) ─────────────────
  const [dailyConfigsMap, setDailyConfigsMap] = useState<Map<string, CollegeDayConfig>>(new Map());
  const [loadingConfigs, setLoadingConfigs] = useState<boolean>(false);

  // Fetch real-time Day Order configs for the selected date across all campuses
  const fetchLiveDayOrders = useCallback(async (dateStr: string) => {
    setLoadingConfigs(true);
    try {
      const res = await apiFetch<any>(
        `/api/daily-configs?college_id=all&startDate=${dateStr}&endDate=${dateStr}`
      );
      const newMap = new Map<string, CollegeDayConfig>();
      if (res.success && Array.isArray(res.configs)) {
        res.configs.forEach((cfg: any) => {
          const colId = cfg.college_id || cfg.collegeId;
          if (colId) {
            newMap.set(colId, {
              dayOrder: cfg.day_order || "Day 1",
              dayType: cfg.day_type || "working",
              notes: cfg.notes || "",
              isHoliday: cfg.day_type === "holiday" || cfg.is_holiday === 1
            });
          }
        });
      }
      setDailyConfigsMap(newMap);
    } catch {
      // Fallback: If network / API error, keep empty map; defaults will apply
      setDailyConfigsMap(new Map());
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchLiveDayOrders(selectedDate);
    }
  }, [selectedDate, fetchLiveDayOrders]);

  // Calendar weekday derived from selected date
  const rawWeekday = useMemo(() => {
    try {
      const parsed = parseLocalDate(selectedDate);
      return parsed.toLocaleDateString("en-US", { weekday: "long" });
    } catch {
      return "Monday";
    }
  }, [selectedDate]);

  // Formatted date label for header
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

  // ── Mentors Filtered Under this SME ───────────────────────────────
  const mentorsUnderSme = useMemo(() => {
    // 1. Mentors who have sessions assigned to this SME
    const smeSessionMentorIds = new Set(
      demoSessions
        .filter(d => (d.smeId === currentSME?.id || (d as any).sme_id === currentSME?.id))
        .map(d => d.mentorId || (d as any).mentor_id)
        .filter(Boolean)
    );

    // 2. Mentors matching SME subject or department
    const smeSubject = (currentSME?.subject || "").toLowerCase().trim();
    const smeDept = (currentSME?.department || "").toLowerCase().trim();

    return mentors.filter(m => {
      // Match college filter
      if (selectedCollegeId !== "all" && m.college_id !== selectedCollegeId) {
        return false;
      }
      // Match search query
      if (mentorSearch.trim()) {
        const q = mentorSearch.toLowerCase().trim();
        const mName = (m.name || "").toLowerCase();
        const mDept = (m.department || "").toLowerCase();
        if (!mName.includes(q) && !mDept.includes(q)) {
          return false;
        }
      }

      // If mentor has a session with this SME, always include
      if (smeSessionMentorIds.has(m.id)) {
        return true;
      }

      // If SME subject matches mentor's subjects or department
      if (smeSubject) {
        const mDept = (m.department || "").toLowerCase();
        if (mDept.includes(smeSubject)) {
          return true;
        }

        const rawSubs = m.subjects;
        const subList: string[] = Array.isArray(rawSubs)
          ? rawSubs.map((s: any) => String(s).toLowerCase().trim())
          : typeof rawSubs === "string"
          ? rawSubs.split(/[\n,;/]+/).map((s: string) => s.toLowerCase().trim()).filter(Boolean)
          : [];

        if (subList.some((s: string) => s.includes(smeSubject) || smeSubject.includes(s))) {
          return true;
        }
      }
      if (smeDept && (m.department || "").toLowerCase().includes(smeDept)) {
        return true;
      }

      // Default: include mentors across campuses if no strict subject matches found
      return smeSessionMentorIds.size === 0;
    });
  }, [mentors, demoSessions, currentSME, selectedCollegeId, mentorSearch]);

  // Standard period slots across colleges
  const periodSlots = useMemo(() => {
    const colId = selectedCollegeId !== "all" ? selectedCollegeId : colleges[0]?.id;
    const derived = getCollegePeriodTimeSlots(colId, colleges, slots);
    return derived && derived.length > 0 ? derived : DEFAULT_PERIODS;
  }, [selectedCollegeId, colleges, slots]);

  // ── SME's Own Schedule on selectedDate ────────────────────────────
  const smeSchedule = useMemo(() => {
    const smeDemosOnDate = demoSessions.filter(d => {
      const isMySme = d.smeId === currentSME?.id || (d as any).sme_id === currentSME?.id;
      const isDate = (d.dateStr || (d as any).date_str) === selectedDate;
      const isActive = d.status !== "not_conducted";
      return isMySme && isDate && isActive;
    });

    // Check SME availability windows configured for this weekday / Day Order
    const activeWindows = (smeAvailability || []).filter((w: any) => {
      const matchSme = w.sme_id === currentSME?.id;
      const isAct = w.is_active !== 0;
      const dayMatch = (w.day_of_week || "").toLowerCase().trim() === rawWeekday.toLowerCase().trim();
      return matchSme && isAct && dayMatch;
    });

    return periodSlots.map(period => {
      // 1. Is there an active L&D demo session booked at this period?
      const bookedDemo = smeDemosOnDate.find(d => {
        const slot = d.timeSlot || (d as any).time_slot || "";
        return isTimeSlotMatch(slot, period);
      });

      // 2. Is this period within an active availability window?
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
          ? `Booked: ${bookedDemo.mentorName || "Candidate"} (${bookedDemo.subject})`
          : inWindow
          ? "Available for Evaluation"
          : "Outside Available Window"
      };
    });
  }, [demoSessions, currentSME, selectedDate, rawWeekday, smeAvailability, periodSlots]);

  // ── Mentors' Free Time Matrix Computation ─────────────────────────
  const mentorRowData = useMemo(() => {
    return mentorsUnderSme.map(mentor => {
      // Find campus config for this mentor's college
      const colConfig = dailyConfigsMap.get(mentor.college_id) || {
        dayOrder: "Day 1",
        dayType: "working",
        isHoliday: false
      };

      // Real-time Day Order mapping:
      // Map Day Order to timetable day of week
      const effectiveDay = colConfig.dayOrder && colConfig.dayOrder !== "None"
        ? mapDayOrderToDayName(colConfig.dayOrder, rawWeekday)
        : rawWeekday;

      // Check faculty leave for mentor on selectedDate
      const isOnLeave = (leaveRequests || []).some((l: any) => {
        const mMatch = (l.mentorId || l.mentor_id || l.userId) === mentor.id;
        const statusMatch = l.status === "approved" || l.status === "Approved";
        const start = l.startDate || l.start_date || l.dateStr || "";
        const end = l.endDate || l.end_date || start;
        return mMatch && statusMatch && selectedDate >= start && selectedDate <= end;
      });

      // Evaluate each period
      const periods = periodSlots.map(period => {
        // 1. Leave check
        if (isOnLeave) {
          return {
            period,
            isFree: false,
            reason: "On Approved Faculty Leave",
            isMutuallyFree: false,
            badgeType: "leave"
          };
        }

        // 2. Regular Teaching Slot check (using effectiveDay mapped from Day Order!)
        const teachingSlot = slots.find(s => {
          const mMatch = (s.mentor_id || s.mentorId) === mentor.id;
          const dayMatch = (s.day || "").toLowerCase().trim() === effectiveDay.toLowerCase().trim();
          const timeMatch = isTimeSlotMatch(s.time, period);
          return mMatch && dayMatch && timeMatch;
        });

        if (teachingSlot) {
          return {
            period,
            isFree: false,
            reason: `Teaching: ${teachingSlot.subject || "Class"} (${teachingSlot.class_group || "Regular"})`,
            isMutuallyFree: false,
            badgeType: "class"
          };
        }

        // 3. Demo Session check
        const activeDemo = demoSessions.find(d => {
          const mMatch = (d.mentorId || (d as any).mentor_id) === mentor.id;
          const dateMatch = (d.dateStr || (d as any).date_str) === selectedDate;
          const timeMatch = isTimeSlotMatch(d.timeSlot || (d as any).time_slot, period);
          const actMatch = d.status !== "not_conducted";
          return mMatch && dateMatch && timeMatch && actMatch;
        });

        if (activeDemo) {
          return {
            period,
            isFree: false,
            reason: `L&D Demo: ${activeDemo.subject || "Session"} (${activeDemo.status})`,
            isMutuallyFree: false,
            badgeType: "demo"
          };
        }

        // Mentor is FREE!
        // Now check if SME is also free at this period
        const smePeriod = smeSchedule.find(sp => sp.period === period);
        const isMutuallyFree = Boolean(smePeriod && smePeriod.isFree);

        return {
          period,
          isFree: true,
          reason: isMutuallyFree ? "Mutually Available" : "Mentor Free (SME Busy)",
          isMutuallyFree,
          badgeType: isMutuallyFree ? "mutual" : "free"
        };
      });

      const freePeriodCount = periods.filter(p => p.isFree).length;
      const mutualPeriodCount = periods.filter(p => p.isMutuallyFree).length;

      return {
        mentor,
        college: colleges.find(c => c.id === mentor.college_id),
        colConfig,
        effectiveDay,
        periods,
        freePeriodCount,
        mutualPeriodCount
      };
    });
  }, [mentorsUnderSme, dailyConfigsMap, rawWeekday, leaveRequests, selectedDate, slots, demoSessions, smeSchedule, periodSlots, colleges]);

  // Filter out mentors with zero mutual availability if toggle enabled
  const displayedRows = useMemo(() => {
    if (filterAvailabilityOnly) {
      return mentorRowData.filter(r => r.mutualPeriodCount > 0);
    }
    return mentorRowData;
  }, [mentorRowData, filterAvailabilityOnly]);

  // Find leave-affected or upcoming session for this mentor if any
  const getMentorSessionToReallocate = (mentorId: string) => {
    return affectedSessions.find(s => (s.mentorId === mentorId || (s as any).mentor_id === mentorId)) ||
      demoSessions.find(s => (s.mentorId === mentorId || (s as any).mentor_id === mentorId) && s.status !== "completed");
  };

  return (
    <div className="space-y-6 font-sans">
      {/* ── Top Control & Date Navigation Bar ────────────────────────── */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                Reallocation Availability Matrix
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  Live Day Order
                </span>
              </h2>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Inspect mentors&apos; timetable commitments and find mutually free periods for L&D demo reallocations.
              </p>
            </div>
          </div>

          {/* Date Picker & Quick Navigator */}
          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              onClick={() => setSelectedDate(getLocalDateStr())}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedDate === getLocalDateStr()
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateStr(getLocalDateStr(), 1))}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                selectedDate === shiftDateStr(getLocalDateStr(), 1)
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              Tomorrow
            </button>
          </div>
        </div>

        {/* ── Filter Bar: Colleges & Search ──────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Campus:
            </span>
            <button
              type="button"
              onClick={() => setSelectedCollegeId("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCollegeId === "all"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              All Campuses
            </button>
            {colleges.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCollegeId(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedCollegeId === c.id
                    ? "bg-amber-500 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <div className="relative flex-1 sm:w-60">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search mentor or department..."
                value={mentorSearch}
                onChange={e => setMentorSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setFilterAvailabilityOnly(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                filterAvailabilityOnly
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Mutually Free Only</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Real-Time Day Order Status Strip ─────────────────────────── */}
      <div className="p-3.5 bg-amber-50/40 dark:bg-amber-950/20 rounded-2xl border border-amber-200/70 dark:border-amber-800/40 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Live Campus Day Order Cycle ({rawWeekday})
          </span>
          {loadingConfigs && (
            <span className="text-[9.5px] font-bold text-slate-400 flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Synchronizing Day Orders...
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1">
          {colleges
            .filter(c => selectedCollegeId === "all" || c.id === selectedCollegeId)
            .map(c => {
              const cfg = dailyConfigsMap.get(c.id);
              const dayOrder = cfg?.dayOrder || "Day 1";
              const isHoliday = cfg?.isHoliday;
              const effectiveWeekday = mapDayOrderToDayName(dayOrder, rawWeekday);

              return (
                <div
                  key={c.id}
                  className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-amber-200/60 dark:border-amber-800/30 flex items-center justify-between gap-2 shadow-2xs"
                >
                  <div className="min-w-0">
                    <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                      {c.name}
                    </span>
                    <span className="text-[9.5px] font-semibold text-slate-400 block truncate">
                      {isHoliday ? "Campus Holiday" : `Follows ${effectiveWeekday} Timetable`}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        isHoliday
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/80"
                      }`}
                    >
                      {isHoliday ? "Holiday" : dayOrder}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* ── SME Existing Timetable Strip ─────────────────────────────── */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-violet-600" />
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
              My Existing SME Schedule for {formattedDateLabel}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Open Window
            </span>
            <span className="flex items-center gap-1.5 text-violet-700 dark:text-violet-400">
              <span className="h-2 w-2 rounded-full bg-violet-500" />
              Booked Demo Session
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          {smeSchedule.map((slot, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded-xl border flex flex-col justify-between gap-1.5 transition-all ${
                slot.bookedDemo
                  ? "bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800"
                  : slot.isFree
                  ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                  : "bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700 text-slate-400"
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider block text-slate-500">
                {slot.period.split(" ")[0]} {slot.period.split(" ")[1] || ""}
              </span>
              <span className="text-[9px] font-mono text-slate-400 block truncate">
                {slot.period.match(/\((.*?)\)/)?.[1] || slot.period}
              </span>

              <div className="pt-1">
                {slot.bookedDemo ? (
                  <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200 truncate block">
                    Demo: {slot.bookedDemo.mentorName}
                  </span>
                ) : slot.isFree ? (
                  <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 truncate block">
                    Free for Demo
                  </span>
                ) : (
                  <span className="text-[8.5px] font-bold text-slate-400 block truncate">
                    Outside Window
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── College Mentors Schedule & Free Time Matrix ──────────────── */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-amber-500" />
              Faculty Free Time Matrix ({displayedRows.length} Mentors Under Review)
            </h3>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
              Periods are aligned with each campus&apos;s active Day Order. Mutually free slots allow instant 1-click reallocation.
            </p>
          </div>
        </div>

        {displayedRows.length > 0 ? (
          <div className="space-y-3">
            {displayedRows.map(row => {
              const { mentor, college, colConfig, periods, mutualPeriodCount, freePeriodCount } = row;
              const pendingSession = getMentorSessionToReallocate(mentor.id);

              return (
                <div
                  key={mentor.id}
                  className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-amber-400/80 transition-all bg-white dark:bg-slate-900/60 shadow-2xs space-y-3"
                >
                  {/* Mentor Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-xs text-slate-700 dark:text-slate-300">
                        {mentor.name?.charAt(0) || "M"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {mentor.name}
                          </span>
                          <span className="text-[9.5px] font-bold text-slate-400">
                            ({mentor.department || "Faculty"})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold mt-0.5">
                          <span>{college?.name || "Campus"}</span>
                          <span>•</span>
                          <span className="text-amber-700 dark:text-amber-400 font-black">
                            {colConfig.dayOrder} ({row.effectiveDay})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-right">
                      <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {freePeriodCount} free periods
                      </span>
                      {mutualPeriodCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-md text-[9.5px] font-black bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/80 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          {mutualPeriodCount} Mutually Free
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-slate-100 text-slate-400">
                          No Mutual Slots
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Period Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {periods.map((p, pIdx) => {
                      const periodLabel = p.period.split(" ")[0] + " " + (p.period.split(" ")[1] || "");
                      const timingLabel = p.period.match(/\((.*?)\)/)?.[1] || "";

                      return (
                        <div
                          key={pIdx}
                          className={`p-2.5 rounded-xl border flex flex-col justify-between gap-2 text-left transition-all ${
                            p.isMutuallyFree
                              ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700 hover:scale-[1.02] shadow-2xs"
                              : p.isFree
                              ? "bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800 text-slate-500"
                              : p.badgeType === "leave"
                              ? "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-700"
                              : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-400"
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider text-slate-500">
                              <span>{periodLabel}</span>
                              <span className="font-mono text-[8px] text-slate-400">{timingLabel}</span>
                            </div>

                            <p className="text-[9.5px] font-bold mt-1 line-clamp-2" title={p.reason}>
                              {p.isMutuallyFree ? "Mutually Free" : p.reason}
                            </p>
                          </div>

                          {p.isMutuallyFree ? (
                            <button
                              type="button"
                              onClick={() => onReallocateSlot(mentor, selectedDate, p.period, pendingSession)}
                              className="w-full py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1"
                              title="Click to propose demo session at this slot"
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              Reallocate
                            </button>
                          ) : (
                            <span className="text-[8.5px] font-bold text-slate-400 block truncate">
                              {p.isFree ? "SME Busy" : "Unavailable"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-slate-400 text-xs font-bold italic border border-slate-200/80 dark:border-slate-800 rounded-xl">
            No mentors found matching the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
