"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { TableSurface } from "@/components/dashboard/TableSurface";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { getInstitutionDateStr } from "@/lib/localDate";
import {
  Search,
  Calendar,
  RotateCcw,
  BookOpen,
  User,
  Clock,
  Building,
  ArrowLeftRight,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import LndReallocateSmeModal from "./modals/LndReallocateSmeModal";

export interface LndLiveDemoTableProps {
  demoSessions: any[];
  mentors: any[];
  smes: any[];
  colleges: any[];
  subjectsList?: any[];
  demoReallocations?: any[];
  deleteDemoSession?: (id: string) => Promise<{ success: boolean; message?: string }>;
  refreshData?: () => Promise<any>;
}

export type DemoComputedStatus = "completed" | "incomplete" | "upcoming";

// Property resolution helpers to handle both camelCase (SQLite / PG adapted) and lowercase/snake_case
const getSessionDate = (s: any): string => s?.dateStr || s?.date_str || s?.datestr || "";
const getSessionTime = (s: any): string => s?.timeSlot || s?.time_slot || s?.timeslot || "";
const getSessionMentorId = (s: any): string => s?.mentorId || s?.mentor_id || s?.mentorid || "";
const getSessionSmeId = (s: any): string => s?.smeId || s?.sme_id || s?.smeid || "";
const getSessionMentorName = (s: any): string => s?.mentorName || s?.mentor_name || s?.mentorname || "";
const getSessionSmeName = (s: any): string => s?.smeName || s?.sme_name || s?.smename || "";

export default function LndLiveDemoTable({
  demoSessions = [],
  mentors = [],
  smes = [],
  colleges = [],
  subjectsList = [],
  demoReallocations = [],
  refreshData
}: LndLiveDemoTableProps) {
  // Filter States
  const [selectedCampus, setSelectedCampus] = useState<string>("all");
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Reallocation modal state
  const [reallocatingSession, setReallocatingSession] = useState<any | null>(null);

  // Set of session IDs with pending reallocation proposals
  const pendingReallocSessionIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of demoReallocations || []) {
      if (r.status === "pending") {
        const sid = r.demo_session_id || r.demoSessionId;
        if (sid) set.add(sid);
      }
    }
    return set;
  }, [demoReallocations]);

  // Reallocation required count
  const reallocationNeededCount = useMemo(() => {
    return demoSessions.filter((s: any) => {
      const raw = (s?.status || "").toLowerCase().trim();
      return raw === "reallocation_required" || pendingReallocSessionIds.has(s?.id);
    }).length;
  }, [demoSessions, pendingReallocSessionIds]);

  // Today reference date
  const todayStr = useMemo(() => getInstitutionDateStr(), []);

  // Lookup maps for fast cross-referencing
  const mentorsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of mentors) {
      if (m?.id) map.set(m.id, m);
    }
    return map;
  }, [mentors]);

  const smesById = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of smes) {
      if (s?.id) map.set(s.id, s);
    }
    return map;
  }, [smes]);

  const collegesById = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of colleges) {
      if (c?.id) map.set(c.id, c);
    }
    return map;
  }, [colleges]);

  // Fetch verified weekly plans across all campuses to match planned syllabus topics
  const weeklyPlansQuery = useQuery({
    queryKey: ["mentor-weekly-plans-ledger"],
    queryFn: async () => {
      const res = await apiFetch("/api/weekly-plan?collegeId=all");
      return res?.success ? (res.plans || []) : [];
    },
    staleTime: 60 * 1000
  });

  const weeklyPlans = weeklyPlansQuery.data || [];

  // Match planned topic for a given session
  const getSessionTopic = useCallback((session: any) => {
    if (session.topic && session.topic.trim()) {
      return session.topic.trim();
    }
    // Match by mentor ID and subject or week number
    const mentorId = getSessionMentorId(session);
    const matchedPlan = weeklyPlans.find((p: any) => {
      const mentorMatch = p.mentor_id === mentorId;
      if (!mentorMatch) return false;
      const subMatch = (p.subject || "").toLowerCase().trim() === (session.subject || "").toLowerCase().trim();
      const weekMatch = Number(p.week_number) === Number(session.week);
      return subMatch || weekMatch;
    });

    if (matchedPlan?.topics_planned && matchedPlan.topics_planned.trim()) {
      return matchedPlan.topics_planned.trim();
    }
    if (matchedPlan?.session_plan && Array.isArray(matchedPlan.session_plan) && matchedPlan.session_plan[0]?.topic) {
      return matchedPlan.session_plan[0].topic.trim();
    }
    return session.subject || "General Demo Session";
  }, [weeklyPlans]);

  // Compute status for a given session: completed, incomplete, or upcoming
  const getSessionStatus = useCallback((session: any): DemoComputedStatus => {
    const rawStatus = (session.status || "").toLowerCase().trim();
    if (
      rawStatus === "conducted" ||
      rawStatus === "completed" ||
      (session.marks !== null && session.marks !== undefined)
    ) {
      return "completed";
    }

    if (
      rawStatus === "not_conducted" ||
      rawStatus === "missed" ||
      rawStatus === "cancelled"
    ) {
      return "incomplete";
    }

    // Past date sessions without conducted/marks evaluation are marked incomplete
    const sessionDate = getSessionDate(session);
    if (sessionDate && sessionDate < todayStr) {
      return "incomplete";
    }

    // Sessions today or in the future
    return "upcoming";
  }, [todayStr]);

  // Distinct courses for dropdown filter
  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    for (const s of demoSessions) {
      if (s.subject && s.subject.trim()) set.add(s.subject.trim());
      if (s.stream && s.stream.trim()) set.add(s.stream.trim());
    }
    for (const sub of subjectsList) {
      if (sub.name && sub.name.trim()) set.add(sub.name.trim());
    }
    return Array.from(set).sort();
  }, [demoSessions, subjectsList]);

  // Filtered Sessions List
  const filteredSessions = useMemo(() => {
    return demoSessions.filter((session: any) => {
      const mentorId = getSessionMentorId(session);
      const mentor = mentorsById.get(mentorId);
      const mentorCollegeId = mentor?.college_id || mentor?.collegeId || "";

      // Campus filter
      if (selectedCampus !== "all") {
        if (mentorCollegeId !== selectedCampus) {
          return false;
        }
      }

      // Course filter
      if (selectedCourse !== "all") {
        const sub = (session.subject || "").toLowerCase();
        const stream = (session.stream || "").toLowerCase();
        const target = selectedCourse.toLowerCase();
        if (sub !== target && stream !== target && !sub.includes(target) && !stream.includes(target)) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== "all") {
        if (selectedStatus === "reallocation_required") {
          const raw = (session?.status || "").toLowerCase().trim();
          if (raw !== "reallocation_required" && !pendingReallocSessionIds.has(session?.id)) {
            return false;
          }
        } else {
          const status = getSessionStatus(session);
          if (status !== selectedStatus) {
            return false;
          }
        }
      }

      const sessionDate = getSessionDate(session);

      // Date Range filter
      if (startDate) {
        if (!sessionDate || sessionDate < startDate) {
          return false;
        }
      }
      if (endDate) {
        if (!sessionDate || sessionDate > endDate) {
          return false;
        }
      }

      // Search query filter (mentor name, SME name, topic, or subject)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mentorName = (getSessionMentorName(session) || mentor?.name || "").toLowerCase();
        const smeId = getSessionSmeId(session);
        const sme = smesById.get(smeId);
        const smeName = (getSessionSmeName(session) || sme?.name || "").toLowerCase();
        const subject = (session.subject || "").toLowerCase();
        const topic = getSessionTopic(session).toLowerCase();

        if (
          !mentorName.includes(q) &&
          !smeName.includes(q) &&
          !subject.includes(q) &&
          !topic.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    demoSessions,
    selectedCampus,
    selectedCourse,
    selectedStatus,
    startDate,
    endDate,
    searchQuery,
    mentorsById,
    smesById,
    getSessionStatus,
    getSessionTopic
  ]);

  // Summary counts based on current filters
  const metrics = useMemo(() => {
    let completed = 0;
    let incomplete = 0;
    let upcoming = 0;

    for (const s of filteredSessions) {
      const st = getSessionStatus(s);
      if (st === "completed") completed++;
      else if (st === "incomplete") incomplete++;
      else if (st === "upcoming") upcoming++;
    }

    return {
      total: filteredSessions.length,
      completed,
      incomplete,
      upcoming
    };
  }, [filteredSessions, getSessionStatus]);

  // Pagination hook
  const {
    pageItems: paginatedSessions,
    page,
    pageSize,
    setPage,
    setPageSize,
    pageSizeOptions
  } = usePagination(filteredSessions, {
    pageSize: 15,
    pageSizeOptions: [15, 25, 50, 100],
    resetKeys: [
      selectedCampus,
      selectedCourse,
      selectedStatus,
      startDate,
      endDate,
      searchQuery
    ]
  });

  const hasActiveFilters =
    selectedCampus !== "all" ||
    selectedCourse !== "all" ||
    selectedStatus !== "all" ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    Boolean(searchQuery.trim());

  const resetAllFilters = () => {
    setSelectedCampus("all");
    setSelectedCourse("all");
    setSelectedStatus("all");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
  };

  return (
    <div className="space-y-5">
      {/* ── TOP FILTER SURFACE ── */}
      <div className="bg-white dark:bg-[#131317] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <BookOpen className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Live Demo Management Table
              </h2>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Automatically synchronized faculty demo sessions, assigned evaluators, verified topics, and status progression.
              </p>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="self-start lg:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* 1. Campus Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
              Campus
            </label>
            <select
              aria-label="Filter by Campus"
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Campuses ({colleges.length})</option>
              {colleges.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.code || c.id}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Course / Department Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
              Course / Department
            </label>
            <select
              aria-label="Filter by Course"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Courses ({availableCourses.length})</option>
              {availableCourses.map((crs: string) => (
                <option key={crs} value={crs}>
                  {crs}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Demo Status Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
              Demo Status
            </label>
            <select
              aria-label="Filter by Status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="reallocation_required">
                Reallocation Needed {reallocationNeededCount > 0 ? `(${reallocationNeededCount})` : ""}
              </option>
              <option value="completed">Completed</option>
              <option value="incomplete">Incomplete</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </div>

          {/* 4. Start Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
              Start Date
            </label>
            <input
              type="date"
              aria-label="Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            />
          </div>

          {/* 5. End Date */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider block">
              End Date
            </label>
            <input
              type="date"
              aria-label="End Date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Reallocation Needed Alert Banner */}
        {reallocationNeededCount > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                {reallocationNeededCount} demo session{reallocationNeededCount === 1 ? "" : "s"} require SME reallocation or resolution.
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setSelectedStatus(selectedStatus === "reallocation_required" ? "all" : "reallocation_required")
              }
              className="px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-600 text-white shrink-0 shadow-xs cursor-pointer transition-all self-start sm:self-auto"
            >
              {selectedStatus === "reallocation_required" ? "Show All Demos" : "Filter Needs Reallocation"}
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by mentor name, SME evaluator, or planned syllabus topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-xs font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Live Filter Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-center">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
            <span className="text-[9.5px] font-bold uppercase text-slate-400 block">Total Demos</span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-0.5 block">{metrics.total}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40">
            <span className="text-[9.5px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">Completed</span>
            <span className="text-base font-black text-emerald-900 dark:text-emerald-200 mt-0.5 block">{metrics.completed}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-800/40">
            <span className="text-[9.5px] font-bold uppercase text-rose-800 dark:text-rose-300 block">Incomplete</span>
            <span className="text-base font-black text-rose-900 dark:text-rose-200 mt-0.5 block">{metrics.incomplete}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/40">
            <span className="text-[9.5px] font-bold uppercase text-indigo-800 dark:text-indigo-300 block">Upcoming</span>
            <span className="text-base font-black text-indigo-900 dark:text-indigo-200 mt-0.5 block">{metrics.upcoming}</span>
          </div>
        </div>
      </div>

      {/* ── MAIN TABLE SURFACE ── */}
      <TableSurface
        footer={
          filteredSessions.length > 0 ? (
            <Pagination
              currentPage={page}
              totalItems={filteredSessions.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={pageSizeOptions ? [...pageSizeOptions] : undefined}
            />
          ) : undefined
        }
      >
        <Table>
          <TableHeader>
            <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
              <TableHead className="font-black text-[10px] uppercase tracking-wider py-3.5 px-4">
                Mentor Name
              </TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-wider py-3.5 px-4">
                SME Evaluator
              </TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-wider py-3.5 px-4">
                Topic of the Mentor
              </TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-wider py-3.5 px-4">
                Demo Date &amp; Time
              </TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-wider py-3.5 px-4 text-center">
                Status
              </TableHead>
              <TableHead className="font-black text-[10px] uppercase tracking-wider py-3.5 px-4 text-center">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto text-slate-400">
                    <BookOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      No Demo Sessions Found
                    </p>
                    <p className="text-xs text-slate-400">
                      No records match your selected campus, course, status, or date range filters.
                    </p>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="mt-2 text-xs font-bold text-amber-600 hover:underline cursor-pointer"
                      >
                        Reset all filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedSessions.map((session: any) => {
                const mentorId = getSessionMentorId(session);
                const smeId = getSessionSmeId(session);
                const mentor = mentorsById.get(mentorId);
                const sme = smesById.get(smeId);
                const college = mentor?.college_id ? collegesById.get(mentor.college_id) : null;
                const topic = getSessionTopic(session);
                const status = getSessionStatus(session);
                const sessionDate = getSessionDate(session);
                const timeSlot = getSessionTime(session);
                const mentorName = getSessionMentorName(session) || mentor?.name || "Assigned Faculty";
                const smeName = getSessionSmeName(session) || sme?.name || "Assigned SME";
                const rawStatus = (session.status || "").toLowerCase().trim();
                const isReallocationRequired =
                  rawStatus === "reallocation_required" || pendingReallocSessionIds.has(session.id);

                return (
                  <TableRow
                    key={session.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80 transition-colors"
                  >
                    {/* 1. Mentor Name */}
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-xs shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-extrabold text-xs text-slate-900 dark:text-white leading-tight">
                            {mentorName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {college?.name && (
                              <span className="flex items-center gap-0.5">
                                <Building className="h-3 w-3 inline text-slate-400" />
                                <span>{college.name}</span>
                              </span>
                            )}
                            {mentor?.department && (
                              <span>· {mentor.department}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* 2. SME Evaluator */}
                    <TableCell className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black shrink-0">
                          SME
                        </div>
                        <div>
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">
                            {smeName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {sme?.email || session.stream || "Subject Domain Evaluator"}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* 3. Topic of the Mentor */}
                    <TableCell className="py-3 px-4 max-w-[240px]">
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-2 leading-snug" title={topic}>
                          {topic}
                        </div>
                        <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5 truncate">
                          {session.subject} {session.week ? `· Week ${session.week}` : ""}
                        </div>
                      </div>
                    </TableCell>

                    {/* 4. Demo Date & Time */}
                    <TableCell className="py-3 px-4 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{sessionDate || "Date TBD"}</span>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                          <span>{timeSlot || "Time TBD"}</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* 5. Status Badge */}
                    <TableCell className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        {status === "completed" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Completed
                          </span>
                        )}
                        {status === "incomplete" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            Incomplete
                          </span>
                        )}
                        {status === "upcoming" && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Upcoming
                          </span>
                        )}
                        {isReallocationRequired && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                            Reallocation Needed
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* 6. Actions */}
                    <TableCell className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        {isReallocationRequired ? (
                          <button
                            type="button"
                            onClick={() => setReallocatingSession(session)}
                            className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer border border-amber-600 active:scale-95"
                            title="Allocate SME Evaluator"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            <span>Allocate SME</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReallocatingSession(session)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Reallocate or Swap SME Evaluator"
                          >
                            <ArrowLeftRight className="h-3 w-3 text-slate-400" />
                            <span>Reallocate / Swap</span>
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
      </TableSurface>

      {/* ── REALLOCATE / SWAP SME MODAL ── */}
      {reallocatingSession && (
        <LndReallocateSmeModal
          isOpen={Boolean(reallocatingSession)}
          onClose={() => setReallocatingSession(null)}
          session={reallocatingSession}
          onSuccess={async () => {
            if (refreshData) await refreshData();
          }}
          colleges={colleges}
        />
      )}
    </div>
  );
}
