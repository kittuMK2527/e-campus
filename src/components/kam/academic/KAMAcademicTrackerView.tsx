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
  Building2,
  ChevronRight,
  Info,
  BookOpenCheck,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/context/ToastContext";

interface SubjectDeliveryItem {
  id: string;
  name: string;
  department: string;
  semester: string;
  collegeId: string;
  collegeName: string;
  weeklyHours: number;
  completedTopics: number;
  conductedHours: number;
  lastConductedDate: string | null;
  mentors: string[];
  status: "Active" | "Pending" | string;
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
  onCollegeChange?: (collegeId: string) => void;
}

export function KAMAcademicTrackerView({ collegeId = "all", allowedColleges, onCollegeChange }: KAMAcademicTrackerViewProps) {
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
  const [selectedSubjectForTopics, setSelectedSubjectForTopics] = useState<SubjectDeliveryItem | null>(null);

  // Pagination States
  const [syllabusPage, setSyllabusPage] = useState<number>(1);
  const [sessionPage, setSessionPage] = useState<number>(1);
  const PAGE_SIZE = 12;

  // Sync external collegeId prop if provided
  React.useEffect(() => {
    if (collegeId) {
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
    let totalCompleted = 0;
    let totalHours = 0;
    let activeCount = 0;
    let pendingCount = 0;

    filteredSubjects.forEach(s => {
      totalCompleted += s.completedTopics;
      totalHours += s.conductedHours;
      if (s.completedTopics > 0) activeCount += 1;
      else pendingCount += 1;
    });

    return {
      totalDeliveredTopics: totalCompleted,
      totalTeachingHours: totalHours,
      activeModulesCount: activeCount,
      pendingModulesCount: pendingCount,
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

  // Matching session logs for selected subject drilldown modal
  const matchingTopicsForSubject = useMemo(() => {
    if (!selectedSubjectForTopics) return [];
    return rawSessionLogs.filter(log => {
      const nameMatch = (log.subject || "").toLowerCase().trim() === selectedSubjectForTopics.name.toLowerCase().trim();
      const collegeMatch = !selectedSubjectForTopics.collegeId || selectedSubjectForTopics.collegeId === "general" || !log.college_id || log.college_id === selectedSubjectForTopics.collegeId;
      return nameMatch && collegeMatch;
    });
  }, [selectedSubjectForTopics, rawSessionLogs]);

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
          "Topics Delivered",
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
                const val = e.target.value;
                setSelectedCollegeId(val);
                setSyllabusPage(1);
                setSessionPage(1);
                onCollegeChange?.(val);
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
          label="Topics Delivered"
          value={`${computedInfographics.totalDeliveredTopics} Topics`}
          badge={{
            text: `${filteredSubjects.length} Modules`,
            type: "neutral"
          }}
          accentColor="amber"
          icon={BookOpen}
        />
        <KAMKpiCard
          label="Conducted Teaching Hours"
          value={`${computedInfographics.totalTeachingHours} Hours`}
          badge={{
            text: "Recorded Time",
            type: "neutral"
          }}
          accentColor="indigo"
          icon={Clock}
        />
        <KAMKpiCard
          label="Active Subject Modules"
          value={computedInfographics.activeModulesCount}
          badge={{
            text: "In Progress",
            type: "positive"
          }}
          accentColor="emerald"
          icon={CheckCircle2}
        />
        <KAMKpiCard
          label="Pending Modules"
          value={computedInfographics.pendingModulesCount}
          badge={{
            text: "Awaiting Classes",
            type: computedInfographics.pendingModulesCount > 0 ? "warning" : "positive"
          }}
          accentColor={computedInfographics.pendingModulesCount > 0 ? "amber" : "emerald"}
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
            <span>Academic Subject Delivery ({filteredSubjects.length})</span>
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
                  <TableHead className="py-3 px-3 text-center">Topics Delivered</TableHead>
                  <TableHead className="py-3 px-3 text-center">Teaching Hours</TableHead>
                  <TableHead className="py-3 px-3 text-center">Last Taught</TableHead>
                  <TableHead className="py-3 px-3 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deliveryQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                      Loading syllabus delivery ledger...
                    </TableCell>
                  </TableRow>
                ) : paginatedSubjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-slate-400 font-bold">
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
                      <TableCell className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedSubjectForTopics(s)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60 transition-all cursor-pointer group font-extrabold text-xs"
                          title="Click to view detailed delivered topics list"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>{s.completedTopics} {s.completedTopics === 1 ? "Topic" : "Topics"}</span>
                          <ChevronRight className="w-3 h-3 text-amber-500 transition-transform group-hover:translate-x-0.5 ml-0.5" />
                        </button>
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                        {s.conductedHours} hrs
                      </TableCell>
                      <TableCell className="py-3 px-3 text-center text-slate-500 font-mono text-[11px]">
                        {s.lastConductedDate || "—"}
                      </TableCell>
                      <TableCell className="py-3 px-3 text-right">
                        <Badge variant={s.completedTopics > 0 ? "success" : "outline"}>
                          {s.completedTopics > 0 ? "Active" : "Pending"}
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

      {/* ── TOPIC BREAKDOWN & SYLLABUS DRILLDOWN MODAL ── */}
      {selectedSubjectForTopics && (
        <Dialog
          open={Boolean(selectedSubjectForTopics)}
          onOpenChange={open => !open && setSelectedSubjectForTopics(null)}
          panelClassName="max-w-3xl w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[85vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-800/40">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {selectedSubjectForTopics.name}
                </h3>
                <Badge variant="outline" className="text-[10px] font-bold">
                  {selectedSubjectForTopics.semester}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">
                {selectedSubjectForTopics.collegeName} • {selectedSubjectForTopics.department}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSubjectForTopics(null)}
              className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
            {/* Subject Delivery Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">
                  Topics Delivered
                </span>
                <span className="text-xl font-black text-amber-950 dark:text-amber-200 mt-0.5 block">
                  {selectedSubjectForTopics.completedTopics} {selectedSubjectForTopics.completedTopics === 1 ? "Topic" : "Topics"}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Teaching Hours
                </span>
                <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5 block">
                  {selectedSubjectForTopics.conductedHours} Hours
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Conducted Status
                </span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-1 block">
                  {selectedSubjectForTopics.completedTopics > 0 ? "Active Conduction" : "Pending First Class"}
                </span>
              </div>
            </div>

            {/* List of Delivered Topics */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Delivered Topics Audit Trail ({matchingTopicsForSubject.length})
                </h4>
                {matchingTopicsForSubject.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery(selectedSubjectForTopics.name);
                      setActiveSubTab("sessions");
                      setSelectedSubjectForTopics(null);
                    }}
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    View in Conduction Logs →
                  </button>
                )}
              </div>

              {matchingTopicsForSubject.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
                    <Info className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    No Topics Logged Yet for this Subject
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-md mx-auto font-medium">
                    When faculty mentors conduct a class and submit their period log via <strong>Mentor Dashboard → Academic Tracker → "+ Log Period"</strong> (or confirm topics during Timetable Attendance), the conducted unit and topic title will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-extrabold uppercase text-[10px] border-b border-slate-100 dark:border-slate-800">
                        <th className="py-2.5 px-3">Date & Slot</th>
                        <th className="py-2.5 px-3">Unit</th>
                        <th className="py-2.5 px-3">Topic Delivered</th>
                        <th className="py-2.5 px-3">Conducted By</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {matchingTopicsForSubject.map((t, idx) => (
                        <tr key={t.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            <span className="font-bold text-slate-900 dark:text-white block">{t.date}</span>
                            <span className="text-[10px] text-slate-400">{t.period_slot || "Regular"}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 font-semibold">{t.unit || "Unit 1"}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                            <div>{t.topic || "Regular Lecture"}</div>
                            {t.comments && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{t.comments}</div>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">{t.mentor_name || "Faculty Mentor"}</td>
                          <td className="py-2.5 px-3 text-right">
                            <Badge variant="success">Completed</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

