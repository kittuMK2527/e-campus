"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import {
  Award,
  CheckCircle2,
  Clock,
  Search,
  Building2,
  Filter,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  User,
  Users,
  AlertCircle,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/context/ToastContext";

interface KAMDemoScheduleViewProps {
  collegeId?: string;
  scopedColleges?: Array<{ id: string; name: string }>;
  onCollegeChange?: (collegeId: string) => void;
}

export const KAMDemoScheduleView: React.FC<KAMDemoScheduleViewProps> = ({
  collegeId = "all",
  scopedColleges = [],
  onCollegeChange
}) => {
  const { demoSessions, mentors, colleges: rawColleges, currentKAM, smes } = useApp();
  const { toast } = useToast();

  const effectiveColleges = useMemo(() => {
    if (scopedColleges.length > 0) return scopedColleges;
    return rawColleges;
  }, [scopedColleges, rawColleges]);

  const [selectedCollegeId, setSelectedCollegeId] = useState<string>(collegeId);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Sync internal campus selector if prop updates
  React.useEffect(() => {
    setSelectedCollegeId(collegeId);
  }, [collegeId]);

  // Map each demo session with resolved campus and faculty details
  const enrichedSessions = useMemo(() => {
    const collegeMap = new Map(rawColleges.map(c => [c.id, c.name]));
    const mentorMap = new Map(mentors.map(m => [m.id, m]));

    return (demoSessions || []).map((s: any) => {
      const mentorId = s.mentorId || s.mentor_id;
      const mentor = mentorMap.get(mentorId);
      const sessionCollegeId = s.college_id || s.collegeId || mentor?.college_id || "";
      const collegeName = collegeMap.get(sessionCollegeId) || "Supervised Campus";
      const mentorName = s.mentorName || s.mentor_name || mentor?.name || "Faculty Mentor";
      const smeName = s.smeName || s.sme_name || "Assigned SME";
      const date = s.dateStr || s.date || "Scheduled";
      const timeSlot = s.timeSlot || s.time_slot || "Regular Period";
      const subject = s.subject || "Technical Demonstration";
      const week = s.week ? `Week ${s.week}` : "Continuous";
      const marks = typeof s.marks === "number" ? s.marks : null;
      const rawStatus = (s.status || (marks !== null ? "completed" : "scheduled")).toLowerCase();
      
      let verdict: "cleared" | "not_cleared" | "needs_revision" | "scheduled" = "scheduled";
      if (rawStatus.includes("clear") || rawStatus.includes("pass") || (marks !== null && marks >= 70)) {
        verdict = "cleared";
      } else if (rawStatus.includes("fail") || (marks !== null && marks < 50)) {
        verdict = "not_cleared";
      } else if (rawStatus.includes("revision") || (marks !== null && marks < 70)) {
        verdict = "needs_revision";
      } else if (rawStatus.includes("complete") || marks !== null) {
        verdict = "cleared";
      }

      return {
        id: s.id || `${mentorId}_${date}_${timeSlot}`,
        mentorId,
        mentorName,
        mentorDept: mentor?.department || "Faculty",
        collegeId: sessionCollegeId,
        collegeName,
        smeId: s.smeId || s.sme_id,
        smeName,
        date,
        timeSlot,
        subject,
        stream: s.stream || mentor?.mentor_group || "Core",
        week,
        marks,
        verdict,
        status: s.status || "Scheduled",
        comments: s.comments || s.remarks || null
      };
    });
  }, [demoSessions, mentors, rawColleges]);

  // Filter to Supervised Colleges Scope
  const scopedSessions = useMemo(() => {
    const allowedIds = new Set(effectiveColleges.map(c => c.id));
    return enrichedSessions.filter(s => !s.collegeId || allowedIds.has(s.collegeId));
  }, [enrichedSessions, effectiveColleges]);

  // Filter by Campus, Status and Search
  const filteredSessions = useMemo(() => {
    return scopedSessions.filter(s => {
      if (selectedCollegeId !== "all" && s.collegeId !== selectedCollegeId) return false;
      if (statusFilter !== "all" && s.verdict !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          s.mentorName.toLowerCase().includes(q) ||
          s.smeName.toLowerCase().includes(q) ||
          s.subject.toLowerCase().includes(q) ||
          s.collegeName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [scopedSessions, selectedCollegeId, statusFilter, search]);

  // Executive KPI summary metrics
  const kpis = useMemo(() => {
    const total = scopedSessions.length;
    const cleared = scopedSessions.filter(s => s.verdict === "cleared").length;
    const evaluated = scopedSessions.filter(s => s.marks !== null).length;
    const scheduled = scopedSessions.filter(s => s.verdict === "scheduled").length;
    const clearanceRate = evaluated > 0 ? Math.round((cleared / evaluated) * 100) : 100;
    const uniqueSmes = new Set(scopedSessions.map(s => s.smeName).filter(Boolean)).size;

    return {
      total,
      cleared,
      clearanceRate,
      scheduled,
      uniqueSmes: uniqueSmes || (smes?.length || 8)
    };
  }, [scopedSessions, smes]);

  // Paginated records
  const paginatedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [filteredSessions, currentPage, pageSize]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = filteredSessions.map(s => ({
        "Date": s.date,
        "Period Slot": s.timeSlot,
        "Campus Name": s.collegeName,
        "Faculty Mentor": s.mentorName,
        "Department": s.mentorDept,
        "SME Evaluator": s.smeName,
        "Subject / Stream": `${s.subject} (${s.stream})`,
        "Academic Cycle": s.week,
        "Score": s.marks !== null ? `${s.marks}/100` : "Pending",
        "Clearance Verdict": s.verdict.toUpperCase(),
        "Reviewer Remarks": s.comments || "None logged"
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "KAM_L&D_Demo_Ledger");
      XLSX.writeFile(wb, `KAM_LND_Demo_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast("Institutional demo ledger exported successfully.", "success");
    } catch {
      toast("Failed to export ledger. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-6 font-sans animate-fadeIn">
      {/* ── INTERNAL HEADER & EXECUTIVE FILTER BAR ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black shadow-xs">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-zinc-900 dark:text-white">
                  Institutional L&amp;D &amp; Demo Delivery Ledger
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-amber-500 border-amber-500/40">
                  Data-Alone Audit
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-0.5">
                Executive oversight of faculty teaching demonstrations, SME evaluator coverage, and rubric pass rates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="h-9 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Export Ledger (Excel)</span>
            </button>
          </div>
        </div>

        {/* ── 4 KPI SUMMARY CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Total Demos</span>
            <div className="text-lg font-black text-zinc-900 dark:text-white">
              {kpis.total} Sessions
            </div>
            <span className="text-[10px] text-zinc-500 font-semibold">Supervised Portfolios</span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Clearance Rate</span>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {kpis.clearanceRate}%
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> {kpis.cleared} Faculty Cleared
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">SME Coverage</span>
            <div className="text-lg font-black text-zinc-900 dark:text-white">
              {kpis.uniqueSmes} Evaluators
            </div>
            <span className="text-[10px] text-zinc-500 font-semibold">Active Subject Experts</span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Scheduled In-Queue</span>
            <div className="text-lg font-black text-amber-500">
              {kpis.scheduled} Upcoming
            </div>
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Awaiting Demonstration
            </span>
          </div>
        </div>

        {/* ── FILTER CONTROLS BAR (Page-Internal Campus & Status Selector) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Campus / Institution</label>
            <select
              value={selectedCollegeId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCollegeId(val);
                onCollegeChange?.(val);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Supervised Campuses ({effectiveColleges.length})</option>
              {effectiveColleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Clearance Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="cleared">Cleared / Pass</option>
              <option value="needs_revision">Needs Revision</option>
              <option value="not_cleared">Not Cleared</option>
              <option value="scheduled">Scheduled (Pending)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Search Faculty or SME</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Faculty name, SME evaluator, subject..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-3 py-2 text-xs font-bold border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── HIGH-DENSITY AUDIT DATA TABLE ALONE ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800">
              <TableRow>
                <TableHead className="w-10 p-3 text-center text-[10px] font-black uppercase text-zinc-400">
                  Notes
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Scheduled Date &amp; Slot
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Campus / Institution
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Faculty Mentor
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  SME Evaluator
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Subject &amp; Stream
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500 text-center">
                  Score
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500 text-right pr-6">
                  Clearance Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {paginatedSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-zinc-400">
                    <Award className="h-8 w-8 mx-auto mb-2 opacity-40 text-amber-500" />
                    <p className="font-bold text-sm">No demonstration records matching filter criteria.</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Faculty evaluations appear here once scheduled or scored.</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSessions.map((s) => {
                  const isExpanded = expandedSessionId === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <TableRow
                        onClick={() => setExpandedSessionId(isExpanded ? null : s.id)}
                        className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                      >
                        <TableCell className="p-3 text-center">
                          <button
                            type="button"
                            className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-amber-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </TableCell>

                        {/* Date & Slot */}
                        <TableCell className="p-3 font-semibold text-zinc-800 dark:text-zinc-200">
                          <div>{s.date}</div>
                          <div className="text-[10px] font-mono text-zinc-400 mt-0.5">{s.timeSlot}</div>
                        </TableCell>

                        {/* Campus */}
                        <TableCell className="p-3 font-semibold text-zinc-700 dark:text-zinc-300">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                            <span className="line-clamp-1">{s.collegeName}</span>
                          </div>
                        </TableCell>

                        {/* Faculty */}
                        <TableCell className="p-3">
                          <div className="font-extrabold text-zinc-900 dark:text-white">{s.mentorName}</div>
                          <div className="text-[10px] text-zinc-400">{s.mentorDept}</div>
                        </TableCell>

                        {/* SME Evaluator */}
                        <TableCell className="p-3">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{s.smeName}</span>
                          </div>
                        </TableCell>

                        {/* Subject */}
                        <TableCell className="p-3">
                          <div className="font-bold text-zinc-900 dark:text-white line-clamp-1">{s.subject}</div>
                          <div className="text-[10px] text-zinc-400">{s.stream} • {s.week}</div>
                        </TableCell>

                        {/* Score */}
                        <TableCell className="p-3 text-center">
                          {s.marks !== null ? (
                            <span className="font-black text-zinc-900 dark:text-white">
                              {s.marks}
                              <span className="text-[10px] text-zinc-400 font-normal">/100</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-400 italic">Pending</span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="p-3 text-right pr-6">
                          <Badge
                            variant={
                              s.verdict === "cleared"
                                ? "success"
                                : s.verdict === "needs_revision"
                                ? "warning"
                                : s.verdict === "not_cleared"
                                ? "destructive"
                                : "outline"
                            }
                            className="text-[10px] uppercase font-bold"
                          >
                            {s.verdict.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {/* Inline Expansion Drawer */}
                      {isExpanded && (
                        <TableRow className="bg-zinc-50/60 dark:bg-zinc-800/30 border-y border-zinc-100 dark:border-zinc-800">
                          <TableCell colSpan={8} className="p-4.5 pl-12">
                            <div className="space-y-2">
                              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                                Evaluator Feedback &amp; Rubric Observations
                              </span>
                              <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                                {s.comments || "No textual remarks recorded by the SME evaluator for this session."}
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filteredSessions.length > pageSize && (
          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center flex-wrap gap-3">
            <span className="text-xs text-zinc-500 font-semibold">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSessions.length)} of {filteredSessions.length} sessions
            </span>
            <Pagination
              currentPage={currentPage}
              totalItems={filteredSessions.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>
    </div>
  );
};
