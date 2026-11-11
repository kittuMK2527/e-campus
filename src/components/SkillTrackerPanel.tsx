"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  RefreshCw,
  Download,
  Search,
  CheckCircle,
  XCircle,
  Clock3,
  RotateCcw,
  Award,
  TrendingUp,
  Loader2,
  ShieldCheck,
  BookOpen,
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/context/ToastContext";
import { Pagination } from "@/components/ui/Pagination";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";

/* ─────────────────────────────────────────────────────────────────────────
   Mentor Skill Development Tracker — shared panel (mentor / sme / cm roles)

   - mentor: read-only, own data (mentorId prop)
   - sme:    read-only + verdict marking (Cleared / Not Cleared / Needs Revision)
   - cm:     read-only campus roll-up
   Data source: /api/skill-tracker (GET roll-up, POST verdicts).
   ───────────────────────────────────────────────────────────────────────── */

export type SkillTrackerRole = "mentor" | "sme" | "cm" | "kam" | "admin";

export interface SkillTrackerPanelProps {
  role: SkillTrackerRole;
  mentorId?: string;
  mentorName?: string;
  collegeId?: string;
  collegeName?: string;
  reviewerName?: string;
}

interface WeekRollup {
  week_number: number;
  topics: { topic: string; planned: boolean; conducted: boolean }[];
  topics_planned: number;
  topics_conducted: number;
  demo_status: string | null;
  demo_marks: number | null;
  demo_id: string | null;
  verdict: "pending" | "cleared" | "not_cleared" | "needs_revision";
  score: number | null;
  remarks: string | null;
  verified_by: string | null;
  verified_at: string | null;
  weekly_plan_id: string | null;
  plan_status: string | null;
}

interface MentorSkillRow {
  mentor_id: string;
  mentor_name: string | null;
  college_id: string | null;
  subject: string;
  subject_type: "Skill" | "Academic";
  semester?: string | null;
  department?: string | null;
  weeks: WeekRollup[];
}

interface Summary {
  mentors: number;
  total_weeks: number;
  cleared: number;
  not_cleared: number;
  pending: number;
  needs_revision: number;
  completion_pct: number;
}

const VERDICT_STYLES: Record<string, string> = {
  cleared: "bg-emerald-100 text-emerald-800 border-emerald-200",
  not_cleared: "bg-rose-100 text-rose-800 border-rose-200",
  needs_revision: "bg-amber-100 text-amber-800 border-amber-200",
  pending: "bg-slate-100 text-slate-600 border-slate-200"
};

const VERDICT_LABELS: Record<string, string> = {
  cleared: "Cleared",
  not_cleared: "Not Cleared",
  needs_revision: "Needs Revision",
  pending: "Pending"
};

export const SkillTrackerPanel: React.FC<SkillTrackerPanelProps> = ({
  role,
  mentorId,
  mentorName,
  collegeId,
  collegeName,
  reviewerName
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canMark = role === "sme";

  // Filters
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Verdict modal state
  const [verdictTarget, setVerdictTarget] = useState<{ row: MentorSkillRow; week: WeekRollup } | null>(null);
  const [verdictStatus, setVerdictStatus] = useState<"cleared" | "not_cleared" | "needs_revision">("cleared");
  const [verdictRemarks, setVerdictRemarks] = useState("");
  const [submittingVerdict, setSubmittingVerdict] = useState(false);

  const trackerQuery = useQuery({
    queryKey: qk.skillTracker(collegeId || "all", mentorId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mentorId) params.set("mentorId", mentorId);
      if (collegeId) params.set("collegeId", collegeId);
      const data = await apiFetch(`/api/skill-tracker?${params.toString()}`);
      if (!data?.success) throw new Error(data?.message || "Failed to load skill tracker");
      return data as { mentors: MentorSkillRow[]; summary: Summary | null };
    },
  });

  const rows = trackerQuery.data?.mentors || [];
  const summary = trackerQuery.data?.summary || null;
  const loading = trackerQuery.isPending;

  useEffect(() => {
    if (trackerQuery.isError) {
      toast("Error loading skill tracker: " + (trackerQuery.error as Error)?.message, "error");
    }
  }, [trackerQuery.isError, trackerQuery.error, toast]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [subjectFilter, semesterFilter, weekFilter, verdictFilter, search]);

  const subjects = useMemo(
    () => Array.from(new Set(rows.map(r => r.subject))).sort(),
    [rows]
  );

  const availableSemesters = useMemo(() => {
    const semSet = new Set<string>();
    rows.forEach(r => {
      if (r.semester) semSet.add(r.semester);
    });
    if (semSet.size === 0) {
      return Array.from({ length: 8 }, (_, i) => `Semester ${i + 1}`);
    }
    return Array.from(semSet).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows
      .map(r => {
        let weeks = r.weeks;
        if (weekFilter !== "all") weeks = weeks.filter(w => String(w.week_number) === weekFilter);
        if (verdictFilter !== "all") weeks = weeks.filter(w => w.verdict === verdictFilter);
        return { ...r, weeks };
      })
      .filter(r => {
        if (subjectFilter !== "all" && r.subject !== subjectFilter) return false;
        if (semesterFilter !== "all" && r.semester !== semesterFilter) return false;
        if (r.weeks.length === 0) return false;
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const m = (r.mentor_name || "").toLowerCase().includes(q) ||
            r.subject.toLowerCase().includes(q) ||
            (r.semester || "").toLowerCase().includes(q) ||
            (r.department || "").toLowerCase().includes(q);
          if (!m) return false;
        }
        return true;
      });
  }, [rows, subjectFilter, semesterFilter, weekFilter, verdictFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize]
  );

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const excelRows: any[] = [];
      filteredRows.forEach(r => {
        r.weeks.forEach(w => {
          excelRows.push({
            "Mentor": r.mentor_name || r.mentor_id,
            "Mentor ID": r.mentor_id,
            "Subject": r.subject,
            "Semester": r.semester || "—",
            "Department": r.department || "—",
            "Subject Type": r.subject_type,
            "Week": `Week ${w.week_number}`,
            "Topics Planned": w.topics_planned,
            "Topics Conducted": w.topics_conducted,
            "Demo Status": w.demo_status || "—",
            "Demo Score": w.demo_marks ?? "—",
            "SME Verdict": VERDICT_LABELS[w.verdict] || w.verdict,
            "SME Score": w.score ?? "—",
            "SME Remarks": w.remarks || "—",
            "Verified By": w.verified_by || "—",
            "Verified At": w.verified_at || "—"
          });
        });
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelRows.length > 0 ? excelRows : [{ Info: "No data" }]);
      XLSX.utils.book_append_sheet(wb, ws, "Skill Tracker");
      XLSX.writeFile(wb, `Mentor_Skill_Tracker_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast("Exported skill tracker to Excel.", "success");
    } catch (e: any) {
      toast("Export failed: " + e.message, "error");
    }
  };

  const submitVerdict = async () => {
    if (!verdictTarget) return;
    if (verdictStatus === "cleared" && !verdictTarget.week.demo_id && !verdictRemarks.trim()) {
      toast("Remarks are required when clearing a week without a demo-backed evaluation.", "warning");
      return;
    }
    setSubmittingVerdict(true);
    try {
      const data = await apiFetch("/api/skill-tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: {
          mentorId: verdictTarget.row.mentor_id,
          mentorName: verdictTarget.row.mentor_name,
          collegeId: verdictTarget.row.college_id,
          subject: verdictTarget.row.subject,
          subjectType: verdictTarget.row.subject_type,
          weekNumber: verdictTarget.week.week_number,
          scope: "week",
          weeklyPlanId: verdictTarget.week.weekly_plan_id,
          status: verdictStatus,
          score: verdictTarget.week.demo_marks ?? undefined,
          remarks: verdictRemarks.trim(),
          verifiedBy: reviewerName || "Subject Matter Expert"
        }
      });
      if (data.success) {
        toast(`Verdict saved: ${VERDICT_LABELS[verdictStatus]}`, "success");
        setVerdictTarget(null);
        setVerdictRemarks("");
        await queryClient.invalidateQueries({ queryKey: qk.skillTracker(collegeId || "all", mentorId) });
        queryClient.invalidateQueries({ queryKey: ["skill-development"] });
      } else {
        toast(data.message || "Failed to save verdict", "error");
      }
    } catch (e: any) {
      toast("Error saving verdict: " + e.message, "error");
    } finally {
      setSubmittingVerdict(false);
    }
  };

  const VerdictBadge: React.FC<{ verdict: string }> = ({ verdict }) => (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${VERDICT_STYLES[verdict] || VERDICT_STYLES.pending}`}>
      {VERDICT_LABELS[verdict] || verdict}
    </span>
  );

  const SubjectTypeChip: React.FC<{ type: string }> = ({ type }) => (
    <span
      className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${
        type === "Skill"
          ? "bg-purple-50 text-purple-700 border-purple-200"
          : "bg-slate-100 text-slate-600 border-slate-200"
      }`}
    >
      {type}
    </span>
  );

  return (
    <div className="space-y-5 font-sans">
      {/* Header */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border ${
              role === "sme"
                ? "bg-purple-50 border-purple-100 text-purple-600"
                : "bg-indigo-50 border-indigo-100 text-indigo-600"
            }`}>
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900">
                  {role === "mentor" ? "My Skill Tracker" : role === "sme" ? "Mentor Skill Development Approvals" : "Mentor Skill Development Tracker"}
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
                  onClick={() => trackerQuery.refetch()}
                  disabled={trackerQuery.isFetching}
                  className="gap-2 cursor-pointer text-xs"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${trackerQuery.isFetching ? "animate-spin" : ""}`} />
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

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mentors</span>
                <BookOpen className="h-4 w-4 text-slate-400" />
              </div>
              <div className="text-xl font-black text-slate-900">{summary.mentors}</div>
            </div>
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">Weeks Tracked</span>
                <Award className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-xl font-black text-indigo-950">{summary.total_weeks}</div>
            </div>
            <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Cleared</span>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-emerald-900">{summary.cleared}</div>
            </div>
            <div className="p-3 bg-rose-50/70 border border-rose-200/80 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Not Cleared</span>
                <XCircle className="h-4 w-4 text-rose-600" />
              </div>
              <div className="text-xl font-black text-rose-900">{summary.not_cleared}</div>
            </div>
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Pending</span>
                <Clock3 className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-xl font-black text-amber-900">{summary.pending + summary.needs_revision}</div>
            </div>
            <div className="p-3 bg-white border border-slate-100 rounded-2xl space-y-1 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Clearance</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-xl font-black text-slate-900">{summary.completion_pct}%</div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, summary.completion_pct)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-4 border-t border-slate-100 mt-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Subject</label>
            <select
              aria-label="Subject"
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Subjects</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Semester</label>
            <select
              aria-label="Semester"
              value={semesterFilter}
              onChange={e => setSemesterFilter(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Semesters</option>
              {availableSemesters.map(sem => (
                <option key={sem} value={sem}>{sem}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Week</label>
            <select
              aria-label="Week"
              value={weekFilter}
              onChange={e => setWeekFilter(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Weeks</option>
              {Array.from({ length: 16 }, (_, i) => i + 1).map(w => (
                <option key={w} value={String(w)}>Week {w}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Verdict</label>
            <select
              value={verdictFilter}
              onChange={e => setVerdictFilter(e.target.value)}
              className="w-full p-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">All Verdicts</option>
              <option value="cleared">Cleared</option>
              <option value="not_cleared">Not Cleared</option>
              <option value="needs_revision">Needs Revision</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Search</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search mentor, subject..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse text-xs min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-sunken border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                <TableHead className="p-3.5">Mentor</TableHead>
                <TableHead className="p-3.5">Subject</TableHead>
                <TableHead className="p-3.5">Semester</TableHead>
                <TableHead className="p-3.5">Type</TableHead>
                <TableHead className="p-3.5">Week</TableHead>
                <TableHead className="p-3.5 text-center">Topics (Conducted / Planned)</TableHead>
                <TableHead className="p-3.5 text-center">Demo</TableHead>
                <TableHead className="p-3.5 text-center">SME Verdict</TableHead>
                <TableHead className="p-3.5 text-center">
                  {canMark ? "Action" : "Verified By"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <TableRow><TableCell colSpan={9} className="p-8 text-center text-slate-400">Loading skill tracker...</TableCell></TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="p-8 text-center text-slate-400 italic">No skill development records found. Weeks appear once a skill-subject weekly plan or demo exists.</TableCell></TableRow>
              ) : (
                paginatedRows.map(row => (
                  <React.Fragment key={`${row.mentor_id}__${row.subject}`}>
                    {row.weeks.map((w, idx) => (
                      <TableRow key={`${row.mentor_id}__${row.subject}__${w.week_number}`} className="hover:bg-indigo-50/40 transition-colors">
                        <TableCell className="p-3.5">
                          <div>
                            <div className="font-extrabold text-slate-900">{row.mentor_name || row.mentor_id}</div>
                            {idx === 0 && <div className="text-[10px] text-slate-400">{row.mentor_id}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="p-3.5">
                          <span className="font-bold text-slate-800">{row.subject}</span>
                        </TableCell>
                        <TableCell className="p-3.5">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                            {row.semester || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="p-3.5">
                          <SubjectTypeChip type={row.subject_type} />
                        </TableCell>
                        <TableCell className="p-3.5 font-black text-indigo-700">Week {w.week_number}</TableCell>
                        <TableCell className="p-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            w.topics_planned > 0 && w.topics_conducted === w.topics_planned
                              ? "bg-emerald-100 text-emerald-800"
                              : w.topics_conducted > 0
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {w.topics_conducted} / {w.topics_planned}
                          </span>
                        </TableCell>
                        <TableCell className="p-3.5 text-center">
                          {w.demo_status ? (
                            <div className="space-y-0.5">
                              <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                w.demo_status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                              }`}>
                                {w.demo_status}
                              </div>
                              {w.demo_marks != null && <div className="text-[10px] font-bold text-slate-500">{w.demo_marks}/100</div>}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="p-3.5 text-center">
                          <div className="space-y-1">
                            <VerdictBadge verdict={w.verdict} />
                            {w.score != null && <div className="text-[10px] font-bold text-slate-500">Score: {w.score}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="p-3.5 text-center">
                          {canMark ? (
                            <button
                              type="button"
                              onClick={() => {
                                setVerdictTarget({ row, week: w });
                                setVerdictStatus(w.verdict === "cleared" ? "cleared" : w.verdict === "not_cleared" ? "not_cleared" : "cleared");
                                setVerdictRemarks(w.remarks || "");
                              }}
                              className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-purple-600 hover:bg-purple-700 text-white shadow-xs cursor-pointer transition-all"
                            >
                              Mark Verdict
                            </button>
                          ) : w.verified_by ? (
                            <div>
                              <div className="text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1">
                                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                {w.verified_by}
                              </div>
                              {w.verified_at && <div className="text-[9px] text-slate-400">{w.verified_at}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          currentPage={safePage}
          totalItems={filteredRows.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Verdict Modal (SME only) */}
      {verdictTarget && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) setVerdictTarget(null); }}
          ariaLabel="Mark Skill Verdict"
          overlayClassName="z-[200] p-4 bg-black/40"
          panelClassName="max-w-md max-h-[90vh] p-5 space-y-4 rounded-2xl"
        >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">Mark Skill Verdict</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {verdictTarget.row.mentor_name} — {verdictTarget.row.subject} — Week {verdictTarget.week.week_number}
                </p>
              </div>
              <button type="button" onClick={() => setVerdictTarget(null)} aria-label="Close" className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            {verdictTarget.week.demo_status && (
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs font-medium text-indigo-900">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span>
                    Demo {verdictTarget.week.demo_status}
                    {verdictTarget.week.demo_marks != null ? ` — scored ${verdictTarget.week.demo_marks}/100` : ""}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["cleared", "not_cleared", "needs_revision"] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setVerdictStatus(s)}
                  className={`px-2 py-2.5 rounded-xl text-[10px] font-black uppercase border-2 transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    verdictStatus === s
                      ? s === "cleared"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : s === "not_cleared"
                        ? "border-rose-500 bg-rose-50 text-rose-700"
                        : "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {s === "cleared" ? <CheckCircle className="h-4 w-4" /> : s === "not_cleared" ? <XCircle className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                  {VERDICT_LABELS[s]}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Remarks {verdictStatus === "cleared" && !verdictTarget.week.demo_id ? "(required — no demo backing this week)" : "(optional)"}
              </label>
              <textarea
                value={verdictRemarks}
                onChange={e => setVerdictRemarks(e.target.value)}
                rows={3}
                placeholder="SME observations, strengths, improvement areas..."
                className="w-full p-2.5 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVerdictTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingVerdict}
                onClick={submitVerdict}
                className="px-4 py-2 rounded-xl text-xs font-black bg-purple-600 hover:bg-purple-700 text-white shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingVerdict ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Save Verdict
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
};
