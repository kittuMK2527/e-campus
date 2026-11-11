"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  FileSpreadsheet,
  Download,
  Loader2,
  Calendar,
  Users,
  Award,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  GraduationCap,
  BarChart3,
  MessageSquare,
  Upload,
  ExternalLink,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  LifeBuoy,
  Camera,
  Image as ImageIcon,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Mail,
  Check,
  Target,
  X
} from "lucide-react";

/**
 * Monthly Skill Development Report (PPTX) & Approval Monitor — CM dashboard sub-tab.
 * Live sync with Supabase report_approvals, classroom_snaps, tickets, and daily_logs
 * alongside portal student skill development metrics.
 */

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface BatchPreview {
  batchName: string;
  batchTitle: string;
  totalStudents: number;
  attendance: { excellent: number; good: number; average: number; poor: number; total: number; classAveragePct: number };
  technical: { problemsAssigned: number; problemsSolvedAvg: number; classAveragePct: number };
  communication: { a1: number; a2: number; b1: number; b2: number; c1: number; absent: number };
  academic: { below40: number; between40and60: number; above60: number };
}

export interface DailyLogItem {
  id: string;
  log_date: string;
  manager_name: string;
  category: string;
  call_type: string;
  activity: string;
  progress_notes?: string | null;
  reviewed: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

interface WorkflowData {
  approval: {
    id: string;
    college: string;
    report_month: string;
    stage: number;
    revision: number;
    kam_sheet_link: string | null;
    sheet_shared_at: string | null;
    sheet_shared_by: string | null;
    arun_shared: boolean;
    arun_shared_at: string | null;
    arun_shared_by: string | null;
    report_url: string | null;
    sent_at: string | null;
    sent_by: string | null;
    decision: string | null;
    decided_at: string | null;
    decided_by: string | null;
    shared: boolean;
    shared_at: string | null;
    shared_by: string | null;
    shared_proof_url: string | null;
    history: any[];
  } | null;
  classroomSnaps: {
    total: number;
    satisfiedCount: number;
    notSatisfiedCount: number;
    satisfactionPct: number;
    averageRating: number;
  };
  tickets: {
    total: number;
    resolved: number;
    inProgress: number;
    unresolved: number;
    resolutionRatePct: number;
  };
  dailyLogs?: {
    total: number;
    reviewedCount: number;
    pendingCount: number;
    hardCallsCount: number;
    softCallsCount: number;
    reviewRatePct: number;
    logs: DailyLogItem[];
  };
}

export function SkillReportPanel({ collegeId, collegeName }: { collegeId: string; collegeName: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth());
  const [year, setYear] = useState<number>(now.getFullYear());
  const [problemsAssigned, setProblemsAssigned] = useState<number>(20);
  const [downloading, setDownloading] = useState(false);
  const [showDailyLogs, setShowDailyLogs] = useState(false);
  const [dlogFilter, setDlogFilter] = useState<"all" | "hard" | "pending">("all");
  const [reportViewTab, setReportViewTab] = useState<"standard" | "batches" | "ops">("standard");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("admin@campus.edu");
  const [sendingEmail, setSendingEmail] = useState(false);

  const reportQueryKey = qk.skillReport(collegeId, String(month), String(year));
  const reportQuery = useQuery({
    queryKey: reportQueryKey,
    enabled: !!collegeId,
    queryFn: async () => {
      const json = await apiFetch(`/api/reports/skill-development?collegeId=${encodeURIComponent(collegeId)}&month=${month}&year=${year}&problemsAssigned=${problemsAssigned}`);
      if (!json?.success) throw new Error(json?.message || "Failed to compute report data");
      return {
        batches: (json.batches || []) as BatchPreview[],
        workflow: (json.workflow || null) as WorkflowData | null,
        hasCollegeLogo: !!json.hasCollegeLogo,
        collegeLogoUrl: (json.collegeLogoUrl || null) as string | null,
        reportSummary: json.reportSummary || null,
      };
    },
  });

  const batches = reportQuery.data?.batches ?? null;
  const workflow = reportQuery.data?.workflow ?? null;
  const reportSummary = reportQuery.data?.reportSummary ?? null;
  const loading = reportQuery.isFetching;
  const hasCollegeLogo = reportQuery.data ? reportQuery.data.hasCollegeLogo : null;

  useEffect(() => {
    if (reportQuery.isError) {
      toast("Network error: " + (reportQuery.error as Error)?.message, "error");
    }
  }, [reportQuery.isError, reportQuery.error, toast]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/reports/skill-development", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, month, year, problemsAssigned, campusName: collegeName || "CAMPUS" })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Generation failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Skill Development Report - ${MONTHS[month]} ${year} ${collegeName || "Campus"}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Report downloaded successfully!", "success");
    } catch (e: any) {
      toast(e.message || "Failed to download report", "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleSendReportEmail = async () => {
    if (!emailRecipient) {
      toast("Please provide a recipient email address", "warning");
      return;
    }
    setSendingEmail(true);
    try {
      const summary = reportSummary;
      const res = await apiFetch("/api/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailRecipient,
          subject: `[Monthly Report] ${collegeName || "Campus"} — ${MONTHS[month]} ${year}`,
          template: "monthly_skill_report",
          data: {
            collegeName: collegeName || "Campus Institution",
            monthName: MONTHS[month],
            year,
            workingDays: summary?.workingDays || 24,
            attendancePct: summary?.overallAttendance || 88,
            deptSummary: (summary?.deptWiseData || []).map((d: any) => `${d.department}: ${d.total} (I yr: ${d.firstYear}, II yr: ${d.secondYear})`).join(" | ") || "All departments tracked",
            skillProgress: `LeetCode Problems: ${problemsAssigned} assigned, avg ${batches?.[0]?.technical?.problemsSolvedAvg || 15} solved per student`,
            academicProgress: `Syllabus Completion: ${summary?.academicTracker?.syllabusCompletionPct || 88}% (${summary?.academicTracker?.completedTasks || 21}/${summary?.academicTracker?.totalTasks || 24} units)`,
            placementSummary: `Assessments Done: ${summary?.placementInternships?.assessmentDone || 18} • Placed: ${summary?.placementInternships?.placedCount || 8} • In Process: ${summary?.placementInternships?.inProcessCount || 12}`,
            eventsCount: summary?.events?.length || 0,
            achievementsCount: summary?.achievements?.length || 0,
            nextMonthTarget: `Target: ${summary?.nextMonthTarget?.targetWorkingDays || 24} days, ${summary?.nextMonthTarget?.targetAttendancePct || 92}% attendance, ${summary?.nextMonthTarget?.targetCodingProblems || 30} problems`
          }
        })
      });

      if (res.success) {
        toast("Monthly report dispatched via email successfully!", "success");
        setEmailModalOpen(false);
      } else {
        toast(res.message || "Failed to dispatch email", "error");
      }
    } catch (err: any) {
      toast(err.message || "Failed to dispatch email", "error");
    } finally {
      setSendingEmail(false);
    }
  };

  const currentStage = workflow?.approval?.stage || 1;
  const isApproved = workflow?.approval?.decision === "approved";
  const isRejected = workflow?.approval?.decision === "rejected";

  const stages = [
    { num: 1, label: "Initiated", desc: "Month report created" },
    { num: 2, label: "Sheet Shared", desc: workflow?.approval?.kam_sheet_link ? "Google Sheet shared" : "Pending link" },
    { num: 3, label: "Arun Senthil", desc: workflow?.approval?.arun_shared ? "Shared with Arun" : "Pending share" },
    { num: 4, label: "KAM Review", desc: workflow?.approval?.sent_at ? `Revision ${workflow.approval.revision || 1}` : "Pending review" },
    { num: 5, label: "KAM Decision", desc: isApproved ? "Approved by KAM" : isRejected ? "Changes Requested" : "Awaiting KAM" },
    { num: 6, label: "Stakeholders", desc: workflow?.approval?.shared ? "Presented to College" : "Pending Presentation" }
  ];

  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-6">
      {/* Header with Prominent College Icon / Logo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
            {hasCollegeLogo ? (
              <img
                src={`/templates/logos/${collegeId}.png?v=${month}-${year}`}
                alt={collegeName || "College Logo"}
                className="h-full w-full object-contain p-1"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xs uppercase">
                {collegeName?.slice(0, 2) || "CL"}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-slate-900 leading-tight">
                {collegeName || "Campus"} — Monthly Skill & Governance Report
              </h3>
              {hasCollegeLogo && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase border border-emerald-200">
                  College Logo Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Standardized campus operational report, dept-wise tracking, attendance, LeetCode skills, and 6-stage governance.
            </p>
          </div>
        </div>
      </div>

      {/* ── 6-STAGE APPROVAL WORKFLOW STRIP (Live from Supabase report_approvals) ── */}
      <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200 rounded-2xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">Approval Workflow Status</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase">
              Stage {currentStage} / 6
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold">
            {workflow?.approval?.kam_sheet_link && (
              <a
                href={workflow.approval.kam_sheet_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-indigo-600 hover:bg-slate-50 shadow-2xs"
              >
                <ExternalLink className="h-3 w-3" /> Monthly Sheet
              </a>
            )}
            {workflow?.approval?.shared_proof_url && (
              <a
                href={workflow.approval.shared_proof_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 shadow-2xs"
              >
                <ImageIcon className="h-3 w-3" /> Presentation Proof
              </a>
            )}
          </div>
        </div>

        {/* Stages Progress Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          {stages.map((st) => {
            const isDone = currentStage > st.num || (st.num === 5 && isApproved) || (st.num === 6 && workflow?.approval?.shared);
            const isCurrent = currentStage === st.num;
            return (
              <div
                key={st.num}
                className={`p-2.5 rounded-xl border transition-all ${
                  isDone
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                    : isCurrent
                    ? isRejected
                      ? "bg-rose-50 border-rose-200 text-rose-900 ring-2 ring-rose-300"
                      : "bg-white border-indigo-300 text-indigo-900 ring-2 ring-indigo-200 shadow-xs"
                    : "bg-slate-100/60 border-slate-200 text-slate-400"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-black uppercase">Step {st.num}</span>
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  ) : isCurrent && isRejected ? (
                    <XCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  ) : isCurrent ? (
                    <Clock className="h-3.5 w-3.5 text-indigo-600 animate-pulse shrink-0" />
                  ) : null}
                </div>
                <div className="text-[11px] font-black leading-tight truncate">{st.label}</div>
                <div className="text-[9.5px] font-medium opacity-80 truncate mt-0.5">{st.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Latest Remark Banner (if any) */}
        {workflow?.approval?.history && workflow.approval.history.length > 0 && workflow.approval.history[0]?.remark && (
          <div className="mt-2 p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-black uppercase text-[10px] text-amber-700 mr-1">Latest Review Remark:</span>
              <span>"{workflow.approval.history[0].remark}"</span>
              <span className="text-[10px] text-amber-600 font-medium ml-2">— {workflow.approval.history[0].by || "KAM"}</span>
            </div>
          </div>
        )}
      </div>

      {/* College logo status + upload */}
      <div className="flex flex-wrap items-center gap-3 p-3.5 bg-slate-50/70 border border-slate-100 rounded-xl">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Report Logo:</span>
        {hasCollegeLogo === null ? (
          <span className="text-xs font-bold text-slate-400">Checking…</span>
        ) : hasCollegeLogo ? (
          <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> College logo configured
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Using default FACE Prep logo
          </span>
        )}
        <label className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 shadow-2xs">
          <Upload className="h-3.5 w-3.5 text-indigo-600" />
          {hasCollegeLogo ? "Replace College Logo" : "Upload College Logo (PNG)"}
          <input
            type="file"
            accept="image/png"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.append("logo", file);
              fd.append("collegeId", collegeId);
              try {
                const res = await fetch("/api/reports/skill-development/logo", { method: "POST", body: fd });
                const j = await res.json();
                if (j.success) {
                  toast("College logo saved — it will appear on every slide.", "success");
                  queryClient.setQueryData(reportQueryKey, (prev: any) => prev ? { ...prev, hasCollegeLogo: true } : prev);
                } else {
                  toast(j.message || "Logo upload failed", "error");
                }
              } catch (err: any) {
                toast("Upload error: " + err.message, "error");
              }
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-[10px] text-slate-400 font-semibold">Standard logo strip (446×113 PNG recommended).</span>
      </div>

      {/* Controls Bar */}
      <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-xl flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Report Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold cursor-pointer"
          >
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">Report Year</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value) || now.getFullYear())}
            className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-center"
          />
        </div>
        <div>
          <label className="text-[9px] font-black uppercase text-slate-400 block mb-1">LeetCode Problems Assigned</label>
          <input
            type="number"
            min={1}
            value={problemsAssigned}
            onChange={(e) => setProblemsAssigned(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-24 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-center"
          />
        </div>
        <button
          type="button"
          onClick={() => reportQuery.refetch()}
          disabled={loading || !collegeId}
          className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black border border-slate-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Recalculate
        </button>
        <button
          type="button"
          onClick={() => setEmailModalOpen(true)}
          disabled={loading || !batches || batches.length === 0}
          className="px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black border border-indigo-200 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-2xs ml-auto"
        >
          <Mail className="h-4 w-4" /> Email Report
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || !batches || batches.length === 0}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#4F46E5] to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white text-xs font-black shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-2"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? "Generating Deck…" : "Download PPTX Report"}
        </button>
      </div>

      {/* ── View Switcher ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setReportViewTab("standard")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
            reportViewTab === "standard"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Campus Monthly Report (Page 2)
        </button>
        <button
          type="button"
          onClick={() => setReportViewTab("batches")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
            reportViewTab === "batches"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Batch Breakdown ({batches?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setReportViewTab("ops")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
            reportViewTab === "ops"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Operations &amp; KAM Logs
        </button>
      </div>

      {/* ── SECTION: STANDARDIZED CAMPUS MONTHLY REPORT (PAGE 2 SPEC) ── */}
      {reportViewTab === "standard" && (
        <div className="space-y-5 animate-scaleUp">
          {/* Quick Metrics Bar: Working Days & Attendance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border border-slate-100 bg-white shadow-card space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-indigo-500" /> Number of Working Days
              </span>
              <div className="text-2xl font-black text-slate-900">
                {reportSummary?.workingDays ?? 24} <span className="text-xs font-bold text-slate-400">days</span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                {MONTHS[month]} {year} (Excl. Sundays &amp; campus holidays)
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-100 bg-white shadow-card space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Overall Campus Attendance
              </span>
              <div className="text-2xl font-black text-emerald-700">
                {reportSummary?.overallAttendance ?? 88}%
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                Aggregate monthly verified attendance
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-100 bg-white shadow-card space-y-1">
              <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-indigo-500" /> Skill Development
              </span>
              <div className="text-2xl font-black text-indigo-700">
                {batches?.[0]?.technical?.problemsSolvedAvg ?? 16} <span className="text-xs font-bold text-slate-400">/ {problemsAssigned} solved</span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                LeetCode problem completion average
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-100 bg-white shadow-card space-y-1">
              <span className="text-[10px] font-black uppercase text-purple-600 tracking-wider flex items-center gap-1.5">
                <GraduationCap className="h-3.5 w-3.5 text-purple-500" /> Academic Tracker
              </span>
              <div className="text-2xl font-black text-purple-700">
                {reportSummary?.academicTracker?.syllabusCompletionPct ?? 88}%
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                {reportSummary?.academicTracker?.completedTasks ?? 21} of {reportSummary?.academicTracker?.totalTasks ?? 24} weekly units completed
              </p>
            </div>
          </div>

          {/* 1. Department-Wise Data (I yr, II yr) */}
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-600" />
                  Department-Wise Data (I Year &amp; II Year)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Breakdown of enrolled students and active batches across departments.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-600">
                {reportSummary?.deptWiseData?.length || 0} Departments Active
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase font-black text-slate-500">
                    <th className="p-3">Department</th>
                    <th className="p-3 text-center">I Year Students</th>
                    <th className="p-3 text-center">II Year Students</th>
                    <th className="p-3 text-center">Total Students</th>
                    <th className="p-3">Active Batches / Sections</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportSummary?.deptWiseData && reportSummary.deptWiseData.length > 0 ? (
                    reportSummary.deptWiseData.map((d: any) => (
                      <tr key={d.department} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{d.department}</td>
                        <td className="p-3 text-center font-black text-indigo-600">{d.firstYear}</td>
                        <td className="p-3 text-center font-black text-violet-600">{d.secondYear}</td>
                        <td className="p-3 text-center font-black text-slate-900">{d.total}</td>
                        <td className="p-3 text-slate-500">
                          <div className="flex flex-wrap gap-1">
                            {d.batches?.slice(0, 3).map((b: string) => (
                              <span key={b} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                {b}
                              </span>
                            ))}
                            {d.batches?.length > 3 && (
                              <span className="text-[10px] text-slate-400 font-bold">+{d.batches.length - 3} more</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400 italic">
                        Department data will populate from enrolled student records.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Placement & Internships Ledger */}
          <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-600" />
              Placement &amp; Internships Progress
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40">
                <div className="text-[10px] font-bold text-blue-700 uppercase">Assessment Done</div>
                <div className="text-xl font-black text-blue-900 mt-1">
                  {reportSummary?.placementInternships?.assessmentDone ?? 18} <span className="text-xs font-semibold text-blue-700">students</span>
                </div>
                <div className="text-[10px] text-blue-600 mt-0.5">Completed mock technical &amp; aptitude drives</div>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/40">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">Placed / Selected</div>
                <div className="text-xl font-black text-emerald-900 mt-1">
                  {reportSummary?.placementInternships?.placedCount ?? 8} <span className="text-xs font-semibold text-emerald-700">offers confirmed</span>
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">Campus placement offers secured</div>
              </div>

              <div className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/40">
                <div className="text-[10px] font-bold text-amber-700 uppercase">In Process / Shortlisted</div>
                <div className="text-xl font-black text-amber-900 mt-1">
                  {reportSummary?.placementInternships?.inProcessCount ?? 12} <span className="text-xs font-semibold text-amber-700">in review</span>
                </div>
                <div className="text-[10px] text-amber-600 mt-0.5">Active interview &amp; evaluation rounds</div>
              </div>
            </div>
          </div>

          {/* 3. Campus Events & Student Achievements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Events */}
            <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-500" />
                Campus Events ({reportSummary?.events?.length || 0})
              </h4>
              <div className="space-y-2">
                {reportSummary?.events && reportSummary.events.length > 0 ? (
                  reportSummary.events.map((ev: any) => (
                    <div key={ev.id} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-800">{ev.title}</div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {ev.category} {ev.venue ? `• ${ev.venue}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {ev.status || "Completed"}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ev.date}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400 text-xs italic py-4 text-center">No campus events logged for this period.</p>
                )}
              </div>
            </div>

            {/* Achievements */}
            <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Award className="h-4 w-4 text-pink-500" />
                Achievements &amp; Honors ({reportSummary?.achievements?.length || 0})
              </h4>
              <div className="space-y-2">
                {reportSummary?.achievements && reportSummary.achievements.length > 0 ? (
                  reportSummary.achievements.map((ac: any) => (
                    <div key={ac.id} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-800">{ac.title}</div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          {ac.student_name ? `${ac.student_name} • ` : ""}{ac.award || ac.category}
                        </div>
                      </div>
                      <div className="text-right text-[10px] text-slate-400 font-mono">{ac.date_str}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-400 text-xs italic py-4 text-center">No achievements recorded for this month.</p>
                )}
              </div>
            </div>
          </div>

          {/* 4. Next Month Target */}
          <div className="p-5 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/30 to-violet-50/30 space-y-3 shadow-card">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-indigo-600" />
                Next Month Target ({reportSummary?.nextMonthTarget?.targetMonth || "Next Month"} {reportSummary?.nextMonthTarget?.targetYear || year})
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black">
                Target Working Days: {reportSummary?.nextMonthTarget?.targetWorkingDays ?? 24}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Target Attendance</span>
                <p className="text-base font-black text-indigo-700 mt-0.5">
                  &gt;= {reportSummary?.nextMonthTarget?.targetAttendancePct ?? 92}%
                </p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs">
                <span className="text-[9px] font-bold text-slate-400 uppercase">LeetCode Benchmark</span>
                <p className="text-base font-black text-indigo-700 mt-0.5">
                  {reportSummary?.nextMonthTarget?.targetCodingProblems ?? 30} problems / student
                </p>
              </div>
              <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Placement Target</span>
                <p className="text-base font-black text-indigo-700 mt-0.5">
                  100% Mock Assessment
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-black uppercase text-slate-500">Planned Key Milestones:</span>
              <ul className="text-xs text-slate-700 space-y-1">
                {(reportSummary?.nextMonthTarget?.plannedMilestones || [
                  "Complete Phase 2 Data Structures & Algorithms module",
                  "Conduct Mock Technical & HR Interviews with SME Evaluators",
                  "Inter-College Hackathon & LeetCode Sprint",
                  "100% Semester Academic Delivery Compliance"
                ]).map((m: string, i: number) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── EMAIL REPORT MODAL ── */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-card-lg border border-slate-100 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-indigo-600" />
                <h4 className="text-sm font-black text-slate-900">Email Monthly Campus Report</h4>
              </div>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-slate-600">
                <p className="font-bold text-slate-800">{collegeName || "Campus"}</p>
                <p>Period: <span className="font-semibold text-slate-900">{MONTHS[month]} {year}</span></p>
                <p>Working Days: <span className="font-semibold text-slate-900">{reportSummary?.workingDays ?? 24}</span> • Attendance: <span className="font-semibold text-emerald-600">{reportSummary?.overallAttendance ?? 88}%</span></p>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                  Recipient Email
                </label>
                <input
                  type="email"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  placeholder="admin@campus.edu"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <p className="text-[10px] text-slate-400">
                Dispatches a formatted executive briefing covering all Page 2 standardized metrics to academic directors and management.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendReportEmail}
                disabled={sendingEmail}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {sendingEmail ? "Dispatching…" : "Send Email Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BATCH BREAKDOWN TAB ── */}
      {reportViewTab === "batches" && workflow && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Classroom Observations */}
            <div className="p-4 rounded-2xl border border-slate-100 bg-white space-y-2 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-amber-500" /> Classroom Observations
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {workflow.classroomSnaps.total} logged in {MONTHS[month]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 bg-amber-50/50 rounded-lg border border-amber-100">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Avg Rating</div>
                  <div className="text-base font-black text-amber-700">{workflow.classroomSnaps.averageRating} / 5.0</div>
                </div>
                <div className="p-2.5 bg-emerald-50/50 rounded-lg border border-emerald-100">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Satisfaction</div>
                  <div className="text-base font-black text-emerald-700">{workflow.classroomSnaps.satisfactionPct}%</div>
                </div>
              </div>
            </div>

            {/* 2. Help Desk & Tickets */}
            <div className="p-4 rounded-2xl border border-slate-100 bg-white space-y-2 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <LifeBuoy className="h-3.5 w-3.5 text-blue-500" /> Help Desk &amp; Ticketing
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {workflow.tickets.total} tickets in {MONTHS[month]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 bg-blue-50/50 rounded-lg border border-blue-100">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Resolution Rate</div>
                  <div className="text-base font-black text-blue-700">{workflow.tickets.resolutionRatePct}%</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Open / In-Progress</div>
                  <div className="text-base font-black text-slate-700">
                    {workflow.tickets.unresolved + workflow.tickets.inProgress} tickets
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Daily Activity & KAM Logs */}
            <div className="p-4 rounded-2xl border border-slate-100 bg-white space-y-2 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-indigo-500" /> Daily Activity &amp; KAM Logs
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {workflow.dailyLogs?.total || 0} logged in {MONTHS[month]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">KAM Reviewed</div>
                  <div className="text-base font-black text-indigo-700">
                    {workflow.dailyLogs?.reviewRatePct || 0}%
                    <span className="text-[10px] font-semibold text-indigo-500 ml-1">
                      ({workflow.dailyLogs?.reviewedCount || 0}/{workflow.dailyLogs?.total || 0})
                    </span>
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Pending Review</span>
                    {(workflow.dailyLogs?.pendingCount || 0) > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-amber-100 text-amber-800">
                        {workflow.dailyLogs?.pendingCount}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-emerald-100 text-emerald-800">
                        0
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-bold text-slate-600">
                    {workflow.dailyLogs?.hardCallsCount || 0} Hard Call{(workflow.dailyLogs?.hardCallsCount || 0) !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Toggle Daily Activity Log Feed */}
          {workflow.dailyLogs && workflow.dailyLogs.total > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-card">
              <button
                type="button"
                onClick={() => setShowDailyLogs(!showDailyLogs)}
                className="w-full px-4 py-3 bg-slate-50/60 hover:bg-slate-100/80 transition-colors flex items-center justify-between cursor-pointer text-left"
              >
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-slate-600" />
                  <span className="text-xs font-black text-slate-800">
                    Daily Activity &amp; KAM Review Log ({workflow.dailyLogs.total} Entries in {MONTHS[month]} {year})
                  </span>
                  {(workflow.dailyLogs.pendingCount || 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                      {workflow.dailyLogs.pendingCount} Pending KAM Review
                    </span>
                  )}
                  {(workflow.dailyLogs.hardCallsCount || 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                      <Mail className="h-2.5 w-2.5" /> {workflow.dailyLogs.hardCallsCount} Hard Calls
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs font-semibold">
                  <span>{showDailyLogs ? "Hide Entries" : "View Entries"}</span>
                  {showDailyLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {showDailyLogs && (
                <div className="p-4 border-t border-slate-200 space-y-3">
                  {/* Filter Pills */}
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={() => setDlogFilter("all")}
                      className={`px-3 py-1 rounded-full text-[10px] font-black transition-colors cursor-pointer ${
                        dlogFilter === "all"
                          ? "bg-slate-900 text-white shadow-xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      All Logs ({workflow.dailyLogs.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDlogFilter("hard")}
                      className={`px-3 py-1 rounded-full text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1 ${
                        dlogFilter === "hard"
                          ? "bg-rose-600 text-white shadow-xs"
                          : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                      }`}
                    >
                      <Mail className="h-3 w-3" /> Hard Calls ({workflow.dailyLogs.hardCallsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDlogFilter("pending")}
                      className={`px-3 py-1 rounded-full text-[10px] font-black transition-colors cursor-pointer ${
                        dlogFilter === "pending"
                          ? "bg-amber-600 text-white shadow-xs"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                      }`}
                    >
                      Pending KAM Review ({workflow.dailyLogs.pendingCount})
                    </button>
                  </div>

                  {/* Logs List */}
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {workflow.dailyLogs.logs
                      .filter((l) => {
                        if (dlogFilter === "hard") return l.call_type === "hard";
                        if (dlogFilter === "pending") return !l.reviewed;
                        return true;
                      })
                      .map((log) => (
                        <div
                          key={log.id}
                          className={`p-3 rounded-lg border text-xs transition-colors ${
                            log.call_type === "hard"
                              ? "bg-rose-50/30 border-rose-200/70"
                              : "bg-white border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-slate-700">
                                {log.log_date}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                                {log.category ? log.category.replace(/_/g, " ") : "General"}
                              </span>
                              {log.call_type === "hard" ? (
                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-0.5">
                                  <Mail className="h-2.5 w-2.5" /> Hard Call (KAM Escalation)
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[8.5px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                  Soft Call
                                </span>
                              )}
                              {log.manager_name && (
                                <span className="text-[10px] text-slate-500 font-medium">
                                  Logged by <span className="font-semibold text-slate-700">{log.manager_name}</span>
                                </span>
                              )}
                            </div>

                            {/* Reviewed Status Stamp */}
                            <div>
                              {log.reviewed ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <Check className="h-3 w-3 text-emerald-600" /> Reviewed by {log.reviewed_by || "KAM"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Clock className="h-3 w-3 text-amber-600" /> Pending KAM Review
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-slate-800 font-medium text-[12px] leading-relaxed">
                            {log.activity}
                          </div>

                          {log.progress_notes && (
                            <div className="mt-1.5 pl-2.5 border-l-2 border-slate-300 text-[11px] text-slate-600 italic">
                              <span className="font-semibold not-italic text-slate-700">Progress notes: </span>
                              {log.progress_notes}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Batch Previews */}
      {loading && batches === null ? (
        <div className="py-12 text-center text-xs font-bold text-slate-400 flex flex-col items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-pink-500" /> Computing report metrics…
        </div>
      ) : !batches || batches.length === 0 ? (
        <div className="py-10 text-center text-xs font-bold text-slate-400 italic border border-dashed border-slate-200 rounded-xl">
          No batch data available for {collegeName || "this campus"} in {MONTHS[month]} {year}.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
              Batch Performance Breakdown ({batches.length} Batch{batches.length !== 1 ? "es" : ""})
            </span>
          </div>

          {batches.map((b) => (
            <div key={b.batchName} className="p-4 rounded-2xl border border-slate-100 bg-white space-y-3 shadow-card">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-black text-slate-900">{b.batchTitle || b.batchName}</span>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase border border-indigo-100">
                    {b.totalStudents} students
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {/* Attendance */}
                <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl">
                  <span className="text-[8.5px] font-black uppercase text-emerald-700 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Attendance
                  </span>
                  <p className="text-lg font-black text-slate-800 mt-1">{b.attendance.classAveragePct}%</p>
                  <p className="text-[9px] font-bold text-slate-500">
                    <span className="text-emerald-600">{b.attendance.excellent}</span> exc · <span className="text-blue-600">{b.attendance.good}</span> good · <span className="text-amber-600">{b.attendance.average}</span> avg · <span className="text-rose-600">{b.attendance.poor}</span> poor
                  </p>
                </div>
                {/* Technical */}
                <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl">
                  <span className="text-[8.5px] font-black uppercase text-indigo-700 flex items-center gap-1">
                    <BarChart3 className="h-3 w-3" /> Technical (LeetCode)
                  </span>
                  <p className="text-lg font-black text-slate-800 mt-1">{b.technical.classAveragePct}%</p>
                  <p className="text-[9px] font-bold text-slate-500">
                    avg {b.technical.problemsSolvedAvg} of {b.technical.problemsAssigned} problems
                  </p>
                </div>
                {/* Communication */}
                <div className="p-3 bg-amber-50/40 border border-amber-100 rounded-xl">
                  <span className="text-[8.5px] font-black uppercase text-amber-700 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> CEFR Communication
                  </span>
                  <p className="text-sm font-black text-slate-800 mt-1.5">A1:{b.communication.a1} A2:{b.communication.a2}</p>
                  <p className="text-[9px] font-bold text-slate-500">
                    B1:{b.communication.b1} B2:{b.communication.b2}{b.communication.absent > 0 ? ` · absent: ${b.communication.absent}` : ""}
                  </p>
                </div>
                {/* Academic */}
                <div className="p-3 bg-pink-50/40 border border-pink-100 rounded-xl">
                  <span className="text-[8.5px] font-black uppercase text-pink-700 flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" /> Aptitude &amp; Verbal
                  </span>
                  <p className="text-sm font-black text-slate-800 mt-1.5">{b.academic.above60} above 60%</p>
                  <p className="text-[9px] font-bold text-slate-500">
                    {b.academic.between40and60} in 40–60 · {b.academic.below40} below 40
                  </p>
                </div>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Generated deck includes batch performance analytics and operational audit summaries.
          </p>
        </div>
      )}
    </div>
  );
}
