"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { useApp } from "@/context/AppContext";
import { KAMKpiCard } from "@/components/kam/shared/KAMKpiCard";
import {
  BookOpen,
  Calendar,
  Clock,
  Download,
  Filter,
  Layers,
  Search,
  TrendingUp,
  UserCheck,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Building2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/context/ToastContext";

interface SubjectDeliveryItem {
  id: string;
  name: string;
  department: string;
  semester: string;
  collegeId: string;
  collegeName: string;
  weeklyHours: number;
  targetTopics: number;
  completedTopics: number;
  conductedHours: number;
  lastConductedDate: string | null;
  mentors: string[];
  completionPct: number;
  expectedPct: number;
  gapPct: number;
  status: "On Track" | "Moderate" | "Lagging";
}

interface ConductionLogItem {
  id: string;
  date: string;
  period_slot?: string;
  college_id?: string;
  college_name?: string;
  class_group: string;
  subject: string;
  mentor_id?: string;
  mentor_name?: string;
  unit?: string;
  topic?: string;
  comments?: string;
  status?: string;
}

interface KAMAcademicTrackerViewProps {
  collegeId?: string;
  allowedColleges?: Array<{ id: string; name: string }>;
}

export function KAMAcademicTrackerView({ collegeId = "all", allowedColleges }: KAMAcademicTrackerViewProps) {
  const { currentKAM, colleges: rawColleges } = useApp();
  const { toast } = useToast();

  const effectiveAllowedColleges = useMemo(() => {
    if (allowedColleges && allowedColleges.length > 0) return allowedColleges;
    if (!currentKAM?.id) return rawColleges.map(c => ({ id: c.id, name: c.name }));
    const filtered = rawColleges.filter(c => c.kam_id === currentKAM.id || (c as any).kamId === currentKAM.id);
    return (filtered.length > 0 ? filtered : rawColleges).map(c => ({ id: c.id, name: c.name }));
  }, [allowedColleges, rawColleges, currentKAM?.id]);

  // Internal Filter States
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>(collegeId);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [selectedSem, setSelectedSem] = useState<string>("all");
  const [selectedMentor, setSelectedMentor] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sub-Tab State
  const [activeSubTab, setActiveSubTab] = useState<"syllabus" | "sessions">("syllabus");

  // Pagination States
  const [syllabusPage, setSyllabusPage] = useState<number>(1);
  const [sessionPage, setSessionPage] = useState<number>(1);
  const PAGE_SIZE = 12;

  // Sync external collegeId prop if provided and not "all"
  React.useEffect(() => {
    if (collegeId && collegeId !== "all") {
      setSelectedCollegeId(collegeId);
    }
  }, [collegeId]);

  // Query 1: KAM Academic Delivery Data (Syllabus Completion, Topics, Mentors)
  const deliveryQuery = useQuery({
    queryKey: ["kam", "academic-delivery", currentKAM?.id, selectedCollegeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentKAM?.id) params.set("kamId", currentKAM.id);
      if (selectedCollegeId && selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
      return apiFetch<{
        success: boolean;
        summary: {
          totalSubjects: number;
          avgCompletionPct: number;
          expectedBenchmark: number;
          onTrackCount: number;
          laggingCount: number;
          totalTeachingHours: number;
        };
        campusDelivery: any[];
        subjectDelivery: SubjectDeliveryItem[];
      }>(`/api/kam/academic-delivery?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  // Query 2: Detailed Session Conduction Logs from academic_tracker
  const sessionQuery = useQuery({
    queryKey: ["kam", "session-conduction-logs", selectedCollegeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCollegeId && selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
      return apiFetch<{
        success: boolean;
        entries: ConductionLogItem[];
      }>(`/api/academic-tracker?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  const subjectDelivery = useMemo(() => {
    return deliveryQuery.data?.subjectDelivery || [];
  }, [deliveryQuery.data]);

  const rawSessionLogs = useMemo(() => {
    return sessionQuery.data?.entries || [];
  }, [sessionQuery.data]);

  // Dynamic filter options derived from subjectDelivery
  const departments = useMemo(() => {
    return Array.from(new Set(subjectDelivery.map(s => s.department).filter(Boolean))).sort();
  }, [subjectDelivery]);

  const semesters = useMemo(() => {
    return Array.from(new Set(subjectDelivery.map(s => s.semester).filter(Boolean))).sort();
  }, [subjectDelivery]);

  const mentorsList = useMemo(() => {
    const mentorSet = new Set<string>();
    subjectDelivery.forEach(s => {
      (s.mentors || []).forEach(m => {
        if (m) mentorSet.add(m);
      });
    });
    return Array.from(mentorSet).sort();
  }, [subjectDelivery]);

  // Filtered Subject Delivery Slice
  const filteredSubjects = useMemo(() => {
    return subjectDelivery.filter(s => {
      if (selectedDept !== "all" && s.department !== selectedDept) return false;
      if (selectedSem !== "all" && s.semester !== selectedSem) return false;
      if (selectedStatus !== "all" && s.status !== selectedStatus) return false;
      if (selectedMentor !== "all" && !(s.mentors || []).includes(selectedMentor)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = (s.name || "").toLowerCase().includes(q);
        const matchDept = (s.department || "").toLowerCase().includes(q);
        const matchCollege = (s.collegeName || "").toLowerCase().includes(q);
        const matchMentor = (s.mentors || []).some(m => m.toLowerCase().includes(q));
        if (!matchName && !matchDept && !matchCollege && !matchMentor) return false;
      }
      return true;
    });
  }, [subjectDelivery, selectedDept, selectedSem, selectedStatus, selectedMentor, searchQuery]);

  // Filtered Session Conduction Logs Slice
  const filteredSessions = useMemo(() => {
    return rawSessionLogs.filter(log => {
      if (selectedDept !== "all" && !log.class_group?.toLowerCase().includes(selectedDept.toLowerCase())) return false;
      if (selectedMentor !== "all" && log.mentor_name !== selectedMentor) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchSubj = (log.subject || "").toLowerCase().includes(q);
        const matchTopic = (log.topic || "").toLowerCase().includes(q);
        const matchMentor = (log.mentor_name || "").toLowerCase().includes(q);
        const matchGroup = (log.class_group || "").toLowerCase().includes(q);
        if (!matchSubj && !matchTopic && !matchMentor && !matchGroup) return false;
      }
      return true;
    });
  }, [rawSessionLogs, selectedDept, selectedMentor, searchQuery]);

  // Dynamically Recalculated Infographics (computed strictly from the filtered slice)
  const computedInfographics = useMemo(() => {
    if (filteredSubjects.length === 0) {
      return {
        avgPace: 0,
        totalTeachingHours: 0,
        onTrackCount: 0,
        laggingCount: 0,
      };
    }

    let totalCompleted = 0;
    let totalTarget = 0;
    let totalHours = 0;
    let onTrack = 0;
    let lagging = 0;

    filteredSubjects.forEach(s => {
      totalCompleted += s.completedTopics;
      totalTarget += s.targetTopics;
      totalHours += s.conductedHours;
      if (s.status === "On Track") onTrack += 1;
      else if (s.status === "Lagging") lagging += 1;
    });

    const avgPace = totalTarget > 0 ? Math.round((totalCompleted / totalTarget) * 100) : 0;

    return {
      avgPace,
      totalTeachingHours: totalHours,
      onTrackCount: onTrack,
      laggingCount: lagging,
    };
  }, [filteredSubjects]);

  // Paginated Views
  const paginatedSubjects = useMemo(() => {
    const start = (syllabusPage - 1) * PAGE_SIZE;
    return filteredSubjects.slice(start, start + PAGE_SIZE);
  }, [filteredSubjects, syllabusPage]);

  const paginatedSessions = useMemo(() => {
    const start = (sessionPage - 1) * PAGE_SIZE;
    return filteredSessions.slice(start, start + PAGE_SIZE);
  }, [filteredSessions, sessionPage]);

  // Excel Export Handler
  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      if (activeSubTab === "syllabus") {
        const headers = [
          "S.No",
          "Subject / Module",
          "Department",
          "Semester",
          "Supervised Campus",
          "Assigned Faculty",
          "Completed Topics",
          "Target Topics",
          "Completion %",
          "Conducted Hours",
          "Last Taught Date",
          "Status",
        ];
        const rows = filteredSubjects.map((s, idx) => [
          idx + 1,
          s.name,
          s.department,
          s.semester,
          s.collegeName,
          (s.mentors || []).join(", ") || "Unassigned",
          s.completedTopics,
          s.targetTopics,
          `${s.completionPct}%`,
          s.conductedHours,
          s.lastConductedDate || "Pending",
          s.status,
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Syllabus_Progress");
        XLSX.writeFile(wb, `KAM_Syllabus_Delivery_Audit.xlsx`);
      } else {
        const headers = [
          "S.No",
          "Date",
          "Period Slot",
          "Class Group",
          "Subject",
          "Faculty Member",
          "Unit",
          "Topic Covered",
          "Delivery Remarks",
        ];
        const rows = filteredSessions.map((s, idx) => [
          idx + 1,
          s.date,
          s.period_slot || "Regular",
          s.class_group,
          s.subject,
          s.mentor_name || "Assigned Faculty",
          s.unit || "—",
          s.topic || "—",
          s.comments || "—",
        ]);
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Session_Conduction_Logs");
        XLSX.writeFile(wb, `KAM_Session_Conduction_Logs.xlsx`);
      }
      toast("Academic audit ledger exported to Excel", "success");
    } catch (err: any) {
      toast("Export failed: " + err.message, "error");
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* ── TOP ASYNC FILTER BAR ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Campus Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <Building2 className="w-3.5 h-3.5 text-amber-500" />
            <select
              aria-label="Filter Campus"
              value={selectedCollegeId}
              onChange={e => {
                setSelectedCollegeId(e.target.value);
                setSyllabusPage(1);
                setSessionPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none"
            >
              <option value="all">All Supervised Campuses ({effectiveAllowedColleges.length})</option>
              {effectiveAllowedColleges.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <select
            aria-label="Filter Department"
            value={selectedDept}
            onChange={e => {
              setSelectedDept(e.target.value);
              setSyllabusPage(1);
              setSessionPage(1);
            }}
            className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Semester Filter */}
          <select
            aria-label="Filter Semester"
            value={selectedSem}
            onChange={e => {
              setSelectedSem(e.target.value);
              setSyllabusPage(1);
            }}
            className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="all">All Semesters</option>
            {semesters.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Faculty / Mentor Filter */}
          <select
            aria-label="Filter Faculty"
            value={selectedMentor}
            onChange={e => {
              setSelectedMentor(e.target.value);
              setSyllabusPage(1);
              setSessionPage(1);
            }}
            className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 outline-none max-w-[160px] truncate"
          >
            <option value="all">All Teaching Mentors</option>
            {mentorsList.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            aria-label="Filter Status"
            value={selectedStatus}
            onChange={e => {
              setSelectedStatus(e.target.value);
              setSyllabusPage(1);
            }}
            className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-700 dark:text-slate-200 outline-none"
          >
            <option value="all">All Pace Statuses</option>
            <option value="On Track">On Track (≥65%)</option>
            <option value="Moderate">Moderate (50-64%)</option>
            <option value="Lagging">Lagging (&lt;50%)</option>
          </select>
        </div>

        {/* Search & Export Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search module or mentor..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setSyllabusPage(1);
                setSessionPage(1);
              }}
              className="pl-8 pr-3 py-1.5 text-xs font-bold border border-slate-200/80 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none w-48 text-slate-800 dark:text-slate-200"
            />
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold transition-all cursor-pointer shadow-2xs"
            title="Export to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* ── FILTER-DRIVEN RECALCULATED INFOGRAPHICS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KAMKpiCard
          label="Syllabus Completion Pace"
          value={`${computedInfographics.avgPace}%`}
          badge={{
            text: computedInfographics.avgPace >= 65 ? "On Track" : "Lagging",
            type: computedInfographics.avgPace >= 65 ? "positive" : "negative"
          }}
          accentColor={computedInfographics.avgPace >= 65 ? "emerald" : "rose"}
          icon={TrendingUp}
        />
        <KAMKpiCard
          label="Conducted Teaching Hours"
          value={`${computedInfographics.totalTeachingHours} Hours`}
          badge={{
            text: `${filteredSubjects.length} Modules`,
            type: "neutral"
          }}
          accentColor="indigo"
          icon={Clock}
        />
        <KAMKpiCard
          label="On-Track Modules"
          value={computedInfographics.onTrackCount}
          badge={{
            text: "≥65% Benchmark",
            type: "positive"
          }}
          accentColor="emerald"
          icon={CheckCircle2}
        />
        <KAMKpiCard
          label="Lagging Modules"
          value={computedInfographics.laggingCount}
          badge={{
            text: computedInfographics.laggingCount > 0 ? "Review Needed" : "Optimal",
            type: computedInfographics.laggingCount > 0 ? "warning" : "positive"
          }}
          accentColor={computedInfographics.laggingCount > 0 ? "amber" : "emerald"}
          icon={AlertCircle}
        />
      </div>

      {/* ── WORKSPACE SUB-TAB SWITCHER ── */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab("syllabus")}
            className={`px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === "syllabus"
                ? "bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-500" />
            <span>Syllabus Progress Ledger ({filteredSubjects.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("sessions")}
            className={`px-3.5 py-1.5 text-xs font-extrabold rounded-lg transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === "sessions"
                ? "bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-500" />
            <span>Session Conduction Logs ({filteredSessions.length})</span>
          </button>
        </div>
      </div>

      {/* ── SUB-VIEW 1: SYLLABUS PROGRESS LEDGER ── */}
      {activeSubTab === "syllabus" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-xs border-collapse">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                  <TableHead className="py-3 px-3 w-10 text-center">#</TableHead>
                  <TableHead className="py-3 px-3">Subject / Module</TableHead>
                  <TableHead className="py-3 px-3">Campus & Dept</TableHead>
                  <TableHead className="py-3 px-3">Assigned Faculty (Who Taught)</TableHead>
                  <TableHead className="py-3 px-3 text-center">Topics Completed</TableHead>
                  <TableHead className="py-3 px-3 text-center">Progress %</TableHead>
                  <TableHead className="py-3 px-3 text-center">Teaching Hours</TableHead>
                  <TableHead className="py-3 px-3">Last Taught</TableHead>
                  <TableHead className="py-3 px-3 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deliveryQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                      Loading syllabus delivery ledger...
                    </TableCell>
                  </TableRow>
                ) : paginatedSubjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                      No academic delivery records found matching the active filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSubjects.map((s, idx) => (
                    <TableRow key={s.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <TableCell className="py-3 px-3 text-center font-mono text-[11px] text-slate-400">
                        {(syllabusPage - 1) * PAGE_SIZE + idx + 1}
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <span className="font-extrabold text-slate-900 dark:text-white block">{s.name}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{s.semester}</span>
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{s.collegeName}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{s.department}</span>
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(s.mentors && s.mentors.length > 0) ? (
                            s.mentors.map((m, mIdx) => (
                              <div
                                key={mIdx}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-200"
                              >
                                <div className="w-4 h-4 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-black flex items-center justify-center">
                                  {m.substring(0, 2).toUpperCase()}
                                </div>
                                <span>{m}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-400 text-[11px] italic font-semibold">Pending Faculty Assignment</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center font-bold text-slate-900 dark:text-white">
                        <span className="text-amber-600 dark:text-amber-400">{s.completedTopics}</span>
                        <span className="text-slate-400"> / {s.targetTopics} Topics</span>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                s.completionPct >= 65
                                  ? "bg-emerald-500"
                                  : s.completionPct >= 50
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                              }`}
                              style={{ width: `${Math.min(100, s.completionPct)}%` }}
                            />
                          </div>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200 text-xs">
                            {s.completionPct}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                        {s.conductedHours} hrs
                      </TableCell>
                      <TableCell className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {s.lastConductedDate || "—"}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right">
                        <Badge
                          variant={
                            s.status === "On Track"
                              ? "success"
                              : s.status === "Moderate"
                              ? "warning"
                              : "destructive"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredSubjects.length > PAGE_SIZE && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <Pagination
                currentPage={syllabusPage}
                totalItems={filteredSubjects.length}
                pageSize={PAGE_SIZE}
                onPageChange={(p: number) => setSyllabusPage(p)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── SUB-VIEW 2: SESSION CONDUCTION LOGS ── */}
      {activeSubTab === "sessions" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-xs border-collapse">
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                  <TableHead className="py-3 px-3 w-10 text-center">#</TableHead>
                  <TableHead className="py-3 px-3">Date & Slot</TableHead>
                  <TableHead className="py-3 px-3">Class Group</TableHead>
                  <TableHead className="py-3 px-3">Academic Subject</TableHead>
                  <TableHead className="py-3 px-3">Faculty Member (Conducted By)</TableHead>
                  <TableHead className="py-3 px-3">Unit</TableHead>
                  <TableHead className="py-3 px-3">Topic Covered</TableHead>
                  <TableHead className="py-3 px-3">Delivery Remarks</TableHead>
                  <TableHead className="py-3 px-3 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700">
                {sessionQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                      Loading session conduction records...
                    </TableCell>
                  </TableRow>
                ) : paginatedSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-slate-400 font-bold">
                      No session conduction entries recorded for this selection.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedSessions.map((session, idx) => (
                    <TableRow key={session.id || idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                      <TableCell className="py-3 px-3 text-center font-mono text-[11px] text-slate-400">
                        {(sessionPage - 1) * PAGE_SIZE + idx + 1}
                      </TableCell>
                      <TableCell className="py-3 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        <div className="font-bold text-slate-900 dark:text-white">{session.date}</div>
                        <div className="text-[10px] text-slate-400">{session.period_slot || "Regular Session"}</div>
                      </TableCell>
                      <TableCell className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                        {session.class_group}
                      </TableCell>
                      <TableCell className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {session.subject}
                      </TableCell>
                      <TableCell className="py-3 px-3">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          <div className="w-4 h-4 rounded-full bg-amber-500 text-zinc-950 text-[9px] font-black flex items-center justify-center">
                            {(session.mentor_name || "FA").substring(0, 2).toUpperCase()}
                          </div>
                          <span>{session.mentor_name || "Assigned Faculty"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-slate-500 font-semibold">
                        {session.unit || "—"}
                      </TableCell>
                      <TableCell className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200 max-w-xs truncate">
                        {session.topic || "Regular Curriculum Delivery"}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-slate-500 text-[11px] max-w-xs truncate">
                        {session.comments || "Completed as scheduled"}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right">
                        <Badge variant="success">Conducted</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredSessions.length > PAGE_SIZE && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <Pagination
                currentPage={sessionPage}
                totalItems={filteredSessions.length}
                pageSize={PAGE_SIZE}
                onPageChange={(p: number) => setSessionPage(p)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

