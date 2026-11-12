"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  RefreshCw,
  Download,
  CheckCircle,
  XCircle,
  Clock3,
  RotateCcw,
  Award,
  TrendingUp,
  Loader2,
  ShieldCheck,
  BookOpen,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  ExternalLink,
  Link2,
  Edit3,
  UploadCloud,
  FileUp,
  Trash2,
  Check,
  Paperclip,
  AlertCircle,
  Calendar
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
  topic_name?: string | null;
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
  submission_link?: string | null;
  task_given_date?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSubmissionType(url?: string | null): { label: string; icon: any; colorClass: string; isUploaded?: boolean } {
  if (!url) return { label: "No Submission", icon: FileText, colorClass: "text-slate-400" };
  const u = url.toLowerCase();
  const isUploaded = url.startsWith("/uploads/");
  if (u.includes(".pdf")) {
    return {
      label: isUploaded ? "PDF Document" : "PDF",
      icon: FileText,
      colorClass: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      isUploaded
    };
  }
  if (u.includes(".xls") || u.includes(".xlsx") || u.includes(".csv") || u.includes("docs.google.com/spreadsheets") || u.includes("excel")) {
    return {
      label: isUploaded ? "Excel Sheet" : "Excel / Sheet",
      icon: FileSpreadsheet,
      colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      isUploaded
    };
  }
  if (u.includes(".doc") || u.includes(".docx") || u.includes("docs.google.com/document")) {
    return {
      label: isUploaded ? "Word Document" : "Word / Doc",
      icon: FileText,
      colorClass: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      isUploaded
    };
  }
  if (u.includes(".ppt") || u.includes(".pptx") || u.includes("docs.google.com/presentation")) {
    return {
      label: isUploaded ? "Presentation" : "Slides / PPT",
      icon: FileText,
      colorClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      isUploaded
    };
  }
  return {
    label: isUploaded ? "Attached Document" : "Material Link",
    icon: isUploaded ? FileText : ExternalLink,
    colorClass: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
    isUploaded
  };
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

  // Filters (search bar removed for clean, focused dropdown filters)
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [weekFilter, setWeekFilter] = useState<string>("all");
  const [verdictFilter, setVerdictFilter] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Verdict modal state (SME only)
  const [verdictTarget, setVerdictTarget] = useState<{ row: MentorSkillRow; week: WeekRollup } | null>(null);
  const [verdictStatus, setVerdictStatus] = useState<"cleared" | "not_cleared" | "needs_revision">("cleared");
  const [verdictRemarks, setVerdictRemarks] = useState("");
  const [submittingVerdict, setSubmittingVerdict] = useState(false);

  // Submission link & document modal state (Mentor / SME)
  const [submissionTarget, setSubmissionTarget] = useState<{ row: MentorSkillRow; week: WeekRollup } | null>(null);
  const [submissionMode, setSubmissionMode] = useState<"file" | "link">("file");
  const [submissionUrlInput, setSubmissionUrlInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submittingLink, setSubmittingLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openSubmissionModal = (row: MentorSkillRow, week: WeekRollup) => {
    const existing = week.submission_link || "";
    setSubmissionTarget({ row, week });
    setSubmissionUrlInput(existing);
    setSelectedFile(null);
    setIsDragging(false);
    if (existing.startsWith("http://") || existing.startsWith("https://")) {
      setSubmissionMode("link");
    } else {
      setSubmissionMode("file");
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const submitSubmissionLink = async (clearLink = false) => {
    if (!submissionTarget) return;
    setSubmittingLink(true);
    try {
      let finalUrl = "";

      if (clearLink) {
        finalUrl = "";
      } else if (submissionMode === "file") {
        if (selectedFile) {
          // Upload file first
          const formData = new FormData();
          formData.append("file", selectedFile);
          const uploadRes = await fetch("/api/skill-tracker/upload", {
            method: "POST",
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (!uploadData.success) {
            toast(uploadData.message || "Failed to upload document", "error");
            setSubmittingLink(false);
            return;
          }
          finalUrl = uploadData.url;
        } else {
          // Keep existing if already attached
          finalUrl = submissionUrlInput.trim();
          if (!finalUrl) {
            toast("Please choose a document to upload or enter a link.", "warning");
            setSubmittingLink(false);
            return;
          }
        }
      } else {
        finalUrl = submissionUrlInput.trim();
        if (!finalUrl) {
          toast("Please enter a valid document link or URL.", "warning");
          setSubmittingLink(false);
          return;
        }
      }

      const res = await fetch("/api/skill-tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: submissionTarget.row.mentor_id,
          mentorName: submissionTarget.row.mentor_name,
          collegeId: submissionTarget.row.college_id,
          subject: submissionTarget.row.subject,
          weekNumber: submissionTarget.week.week_number,
          submissionLink: finalUrl
        })
      });
      const data = await res.json();
      if (data.success) {
        const isRevision = submissionTarget.week.verdict === "not_cleared" || submissionTarget.week.verdict === "needs_revision";
        toast(
          clearLink
            ? "Submission removed successfully."
            : isRevision
            ? "Revision submitted successfully! Status reset to Pending for SME re-evaluation."
            : submissionMode === "file" && selectedFile
            ? "Document uploaded and saved successfully."
            : "Submission updated successfully.",
          "success"
        );
        setSubmissionTarget(null);
        setSelectedFile(null);
        setSubmissionUrlInput("");
        queryClient.invalidateQueries({ queryKey: qk.skillTracker(collegeId || "all", mentorId) });
      } else {
        toast(data.message || "Failed to update submission", "error");
      }
    } catch (e: any) {
      toast("Error saving submission: " + e.message, "error");
    } finally {
      setSubmittingLink(false);
    }
  };

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
  }, [subjectFilter, semesterFilter, weekFilter, verdictFilter]);

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
        return true;
      });
  }, [rows, subjectFilter, semesterFilter, weekFilter, verdictFilter]);

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
            "Task Given Date": w.task_given_date || "—",
            "Topic": w.topic_name || w.topics?.map(t => t.topic).join(", ") || "—",
            "Week": `Week ${w.week_number}`,
            "Topics Planned": w.topics_planned,
            "Topics Conducted": w.topics_conducted,
            "Demo Status": w.demo_status || "—",
            "Demo Score": w.demo_marks ?? "—",
            "Submission Link": w.submission_link || "—",
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
      toast("Exported complete skill tracker to Excel.", "success");
    } catch (e: any) {
      toast("Export failed: " + e.message, "error");
    }
  };

  const mentorSubjectCount = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach(r => {
      map.set(r.mentor_id, (map.get(r.mentor_id) || 0) + 1);
    });
    return map;
  }, [rows]);

  const handleExportMentorExcel = async (targetMentorId: string, targetMentorName: string) => {
    try {
      const XLSX = await import("xlsx");
      // Find all rows for this mentor across ALL subjects
      const mentorSubjectRows = rows.filter(r => r.mentor_id === targetMentorId);
      if (mentorSubjectRows.length === 0) {
        toast("No records found for this mentor.", "warning");
        return;
      }

      const excelRows: any[] = [];
      const distinctSubjects = Array.from(new Set(mentorSubjectRows.map(r => r.subject)));

      mentorSubjectRows.forEach(r => {
        r.weeks.forEach(w => {
          excelRows.push({
            "Mentor Name": r.mentor_name || r.mentor_id,
            "Mentor ID": r.mentor_id,
            "Department": r.department || "—",
            "Subject": r.subject,
            "Semester": r.semester || "—",
            "Subject Type": r.subject_type,
            "Task Given Date": w.task_given_date || "—",
            "Topic": w.topic_name || w.topics?.map(t => t.topic).join(", ") || "—",
            "Week": `Week ${w.week_number}`,
            "Topics Planned": w.topics_planned,
            "Topics Conducted": w.topics_conducted,
            "Demo Status": w.demo_status || "—",
            "Demo Score": w.demo_marks ?? "—",
            "Submission Link": w.submission_link || "—",
            "SME Verdict": VERDICT_LABELS[w.verdict] || w.verdict,
            "SME Score": w.score ?? "—",
            "SME Remarks": w.remarks || "—",
            "Verified By": w.verified_by || "—",
            "Verified At": w.verified_at || "—"
          });
        });
      });

      const wb = XLSX.utils.book_new();

      // Master sheet with all subjects
      const wsAll = XLSX.utils.json_to_sheet(excelRows.length > 0 ? excelRows : [{ Info: "No data" }]);
      XLSX.utils.book_append_sheet(wb, wsAll, "All Subjects");

      // If mentor teaches multiple subjects, also create a separate tab per subject!
      if (distinctSubjects.length > 1) {
        distinctSubjects.forEach(subj => {
          const subjRows = excelRows.filter(r => r["Subject"] === subj);
          const wsSubj = XLSX.utils.json_to_sheet(subjRows);
          const cleanTabName = subj.slice(0, 30).replace(/[:\\\/\?\*\[\]]/g, "_");
          XLSX.utils.book_append_sheet(wb, wsSubj, cleanTabName);
        });
      }

      const cleanName = (targetMentorName || targetMentorId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const dateStr = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `Skill_Tracker_${cleanName}_${dateStr}.xlsx`);
      toast(`Exported complete skill report for ${targetMentorName || targetMentorId} (${distinctSubjects.length} subject${distinctSubjects.length > 1 ? "s" : ""}).`, "success");
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

  const VerdictBadge: React.FC<{ verdict: string; isResubmitted?: boolean }> = ({ verdict, isResubmitted }) => (
    <div className="inline-flex flex-col items-center gap-1">
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${VERDICT_STYLES[verdict] || VERDICT_STYLES.pending}`}>
        {VERDICT_LABELS[verdict] || verdict}
      </span>
      {isResubmitted && (
        <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
          Re-submitted
        </span>
      )}
    </div>
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
              <DropdownMenuContent align="end" className="w-48">
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
                  <span>Download Excel (.xlsx)</span>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-slate-100 mt-4">
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
        </div>
      </div>

      {/* Rows */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse text-xs min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-sunken border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                {role !== "mentor" && <TableHead className="p-3.5">Mentor</TableHead>}
                <TableHead className="p-3.5">Subject</TableHead>
                <TableHead className="p-3.5">Semester</TableHead>
                <TableHead className="p-3.5">Type</TableHead>
                <TableHead className="p-3.5">Task Given Date</TableHead>
                <TableHead className="p-3.5">Topic</TableHead>
                <TableHead className="p-3.5 text-center">Submission Document / Link</TableHead>
                <TableHead className="p-3.5 text-center">SME Verdict</TableHead>
                {role !== "mentor" && (
                  <TableHead className="p-3.5 text-center">Download</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <TableRow><TableCell colSpan={role !== "mentor" ? 9 : 7} className="p-8 text-center text-slate-400">Loading skill tracker...</TableCell></TableRow>
              ) : paginatedRows.length === 0 ? (
                <TableRow><TableCell colSpan={role !== "mentor" ? 9 : 7} className="p-8 text-center text-slate-400 italic">No skill development records found. Records appear once a skill-subject weekly plan or demo exists.</TableCell></TableRow>
              ) : (
                paginatedRows.map(row => (
                  <React.Fragment key={`${row.mentor_id}__${row.subject}`}>
                    {row.weeks.map((w, idx) => (
                      <TableRow key={`${row.mentor_id}__${row.subject}__${w.week_number}`} className="hover:bg-indigo-50/40 transition-colors">
                        {role !== "mentor" && (
                          <TableCell className="p-3.5">
                            <div>
                              <div className="font-extrabold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>{row.mentor_name || row.mentor_id}</span>
                                {(mentorSubjectCount.get(row.mentor_id) || 1) > 1 && idx === 0 && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200" title={`Teaches ${mentorSubjectCount.get(row.mentor_id)} subjects`}>
                                    {mentorSubjectCount.get(row.mentor_id)} Subjects
                                  </span>
                                )}
                              </div>
                              {idx === 0 && <div className="text-[10px] text-slate-400">{row.mentor_id}</div>}
                            </div>
                          </TableCell>
                        )}
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
                        <TableCell className="p-3.5">
                          <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs whitespace-nowrap">
                            <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{w.task_given_date || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="p-3.5">
                          {(() => {
                            const topicText = w.topic_name || (w.topics && w.topics.length > 0 ? w.topics.map(t => t.topic).filter(Boolean).join(", ") : "");
                            if (!topicText) {
                              return <span className="text-slate-400 text-xs italic">—</span>;
                            }
                            return (
                              <div className="space-y-1 max-w-[260px]">
                                <div className="font-extrabold text-slate-900 dark:text-slate-100 text-xs leading-snug" title={topicText}>
                                  {topicText}
                                </div>
                                {w.topics_planned > 0 && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black ${
                                      w.topics_conducted >= w.topics_planned
                                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : w.topics_conducted > 0
                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                    }`}>
                                      <span>{w.topics_conducted} / {w.topics_planned} covered</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="p-3.5 text-center">
                          {(() => {
                            const link = w.submission_link;
                            const typeInfo = getSubmissionType(link);
                            const TypeIcon = typeInfo.icon;
                            if (link) {
                              const isRevision = (w.verdict === "not_cleared" || w.verdict === "needs_revision") && role === "mentor";
                              return (
                                <div className="inline-flex items-center gap-1.5 justify-center flex-wrap">
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-extrabold border transition-all shadow-2xs hover:scale-105 ${typeInfo.colorClass}`}
                                    title={`Open: ${link}`}
                                  >
                                    <TypeIcon className="h-3 w-3 shrink-0" />
                                    <span>{typeInfo.label}</span>
                                    <ExternalLink className="h-2.5 w-2.5 opacity-70 shrink-0" />
                                  </a>
                                  {isRevision ? (
                                    <button
                                      type="button"
                                      onClick={() => openSubmissionModal(row, w)}
                                      title="SME requested revision. Click to re-submit corrected document or link."
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 transition-colors cursor-pointer shadow-2xs animate-pulse hover:animate-none"
                                    >
                                      <RotateCcw className="h-2.5 w-2.5" />
                                      <span>Re-submit</span>
                                    </button>
                                  ) : (role === "mentor" || canMark) ? (
                                    <button
                                      type="button"
                                      onClick={() => openSubmissionModal(row, w)}
                                      title="Edit or replace submission"
                                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    >
                                      <Edit3 className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </div>
                              );
                            }
                            if (role === "mentor" || canMark) {
                              const isRevision = (w.verdict === "not_cleared" || w.verdict === "needs_revision") && role === "mentor";
                              return (
                                <button
                                  type="button"
                                  onClick={() => openSubmissionModal(row, w)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-colors cursor-pointer shadow-2xs ${
                                    isRevision
                                      ? "text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                                      : "text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                                  }`}
                                >
                                  {isRevision ? <RotateCcw className="h-3 w-3 text-rose-600" /> : <FileUp className="h-3 w-3" />}
                                  <span>{isRevision ? "Re-submit Work" : "+ Add Submission"}</span>
                                </button>
                              );
                            }
                            return <span className="text-slate-400 text-[11px]">—</span>;
                          })()}
                        </TableCell>
                        <TableCell className="p-3.5 text-center">
                          <div className="space-y-1">
                            {canMark ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setVerdictTarget({ row, week: w });
                                  setVerdictStatus(w.verdict === "cleared" ? "cleared" : w.verdict === "not_cleared" ? "not_cleared" : "cleared");
                                  setVerdictRemarks(w.remarks || "");
                                }}
                                className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-transparent hover:border-purple-200 transition-all cursor-pointer hover:scale-102 active:scale-98"
                                title="Click to mark or update SME verdict"
                              >
                                <VerdictBadge
                                  verdict={w.verdict}
                                  isResubmitted={w.verdict === "pending" && !!w.remarks && !!w.submission_link}
                                />
                                <Edit3 className="h-2.5 w-2.5 text-slate-400 group-hover:text-purple-600 transition-colors shrink-0" />
                              </button>
                            ) : (
                              <VerdictBadge
                                verdict={w.verdict}
                                isResubmitted={w.verdict === "pending" && !!w.remarks && !!w.submission_link}
                              />
                            )}
                            {w.score != null && <div className="text-[10px] font-bold text-slate-500">Score: {w.score}</div>}
                            {w.remarks && (
                              <div
                                className={`text-[9px] max-w-[170px] mx-auto truncate font-medium p-1 rounded-md ${
                                  w.verdict === "not_cleared" || w.verdict === "needs_revision"
                                    ? "bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900"
                                    : "text-slate-500 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800"
                                }`}
                                title={`SME Remarks: ${w.remarks}`}
                              >
                                "{w.remarks}"
                              </div>
                            )}
                            {w.verified_by && (
                              <div
                                className="text-[9px] text-slate-400 font-medium flex items-center justify-center gap-1 pt-0.5"
                                title={`Verified by ${w.verified_by} ${w.verified_at ? `on ${w.verified_at}` : ""}`}
                              >
                                <ShieldCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                                <span>By {w.verified_by}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        {role !== "mentor" && (
                          <TableCell className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleExportMentorExcel(row.mentor_id, row.mentor_name || row.mentor_id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95"
                              title={`Download complete report for ${row.mentor_name || row.mentor_id} (All ${mentorSubjectCount.get(row.mentor_id) || 1} subject${(mentorSubjectCount.get(row.mentor_id) || 1) > 1 ? "s" : ""})`}
                            >
                              <Download className="h-3 w-3 text-emerald-600 shrink-0" />
                              <span>Download</span>
                            </button>
                          </TableCell>
                        )}
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

      {/* Submission Document & Link Modal (Mentor / SME) */}
      {submissionTarget && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) setSubmissionTarget(null); }}
          ariaLabel="Attach Submission Document or Link"
          overlayClassName="z-[200] p-4 bg-black/40"
          panelClassName="max-w-lg max-h-[90vh] p-6 space-y-4 rounded-2xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">
                {submissionTarget.week.verdict === "not_cleared" || submissionTarget.week.verdict === "needs_revision"
                  ? "Re-submit Weekly Work"
                  : "Weekly Work Submission"}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {submissionTarget.row.mentor_name} — {submissionTarget.row.subject} — Week {submissionTarget.week.week_number}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSubmissionTarget(null)}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>

          {/* Revision notice if previously rejected / requested revision by SME */}
          {(() => {
            const isRevision = submissionTarget.week.verdict === "not_cleared" || submissionTarget.week.verdict === "needs_revision";
            if (!isRevision) return null;
            return (
              <div className="p-3.5 bg-rose-50/90 border border-rose-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-black text-rose-800 uppercase text-[10px] tracking-wider">
                    <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
                    <span>Revision Requested by {submissionTarget.week.verified_by || "SME Reviewer"}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-200/80 text-rose-900 border border-rose-300">
                    {VERDICT_LABELS[submissionTarget.week.verdict] || submissionTarget.week.verdict}
                  </span>
                </div>
                {submissionTarget.week.remarks ? (
                  <div className="p-2.5 bg-white/90 rounded-lg border border-rose-100 text-rose-900 font-medium text-[11px] mt-1 shadow-2xs">
                    <span className="font-bold block text-rose-950 text-[10px] uppercase tracking-wider mb-0.5">SME Feedback / Remarks:</span>
                    "{submissionTarget.week.remarks}"
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-700">
                    Please review your work, attach the corrected document or link, and re-submit for clearance.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Mode Selector Tabs: Direct File Upload vs Paste Link */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setSubmissionMode("file")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                submissionMode === "file"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <UploadCloud className="h-4 w-4 text-purple-600" />
              <span>Direct File Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setSubmissionMode("link")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                submissionMode === "link"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Link2 className="h-4 w-4 text-indigo-600" />
              <span>Paste Web / Drive Link</span>
            </button>
          </div>

          {/* Tab 1: Direct File Upload */}
          {submissionMode === "file" && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
              />

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-purple-500 bg-purple-50/60"
                    : selectedFile
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-slate-200 hover:border-purple-300 hover:bg-slate-50/70"
                }`}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <FileUp className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900 line-clamp-1">{selectedFile.name}</p>
                      <p className="text-[11px] font-semibold text-slate-500">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <span className="text-[10px] font-bold text-purple-600 hover:underline">Click to change file</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <UploadCloud className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Drop document here, or <span className="text-purple-600 underline">browse device</span>
                      </p>
                      <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        Supports PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), up to 25 MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Existing file notice if already uploaded */}
              {submissionTarget.week.submission_link && !selectedFile && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-slate-600 truncate font-medium">
                      Current: {submissionTarget.week.submission_link}
                    </span>
                  </div>
                  <a
                    href={submissionTarget.week.submission_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-indigo-600 hover:underline shrink-0 ml-2"
                  >
                    View &rarr;
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Paste Link */}
          {submissionMode === "link" && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                <p className="font-semibold">Supported Cloud Links:</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Paste a link to Google Drive (PDF / Doc / Sheet), OneDrive, Dropbox, or any public document URL.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Document / Material Link
                </label>
                <input
                  type="url"
                  value={submissionUrlInput}
                  onChange={(e) => setSubmissionUrlInput(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... or https://example.com/doc.pdf"
                  className="w-full p-2.5 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-1 focus:ring-purple-500"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            {submissionTarget.week.submission_link ? (
              <button
                type="button"
                disabled={submittingLink}
                onClick={() => submitSubmissionLink(true)}
                className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSubmissionTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              {(() => {
                const isRevision = submissionTarget.week.verdict === "not_cleared" || submissionTarget.week.verdict === "needs_revision";
                return (
                  <button
                    type="button"
                    disabled={submittingLink || (submissionMode === "file" && !selectedFile && !submissionTarget.week.submission_link)}
                    onClick={() => submitSubmissionLink(false)}
                    className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all ${
                      isRevision
                        ? "bg-rose-600 hover:bg-rose-700 active:scale-95"
                        : "bg-purple-600 hover:bg-purple-700"
                    }`}
                  >
                    {submittingLink ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : isRevision ? (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Upload & Re-submit</span>
                      </>
                    ) : submissionMode === "file" && selectedFile ? (
                      <>
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Upload & Save</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Save Submission</span>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
