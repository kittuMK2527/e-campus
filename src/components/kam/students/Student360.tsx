"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import {
  X,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Award,
  Layers,
  Sparkles,
  TrendingUp,
  Download,
  ExternalLink,
  FileSpreadsheet
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";

interface Student360Props {
  studentId: string;
  collegeId?: string;
  onClose: () => void;
}

export const Student360: React.FC<Student360Props> = ({ studentId, collegeId, onClose }) => {
  const [activeTab, setActiveTab] = useState<"overview" | "subjects" | "timeline" | "attendance" | "achievements" | "coding">("overview");

  const progressQuery = useQuery({
    queryKey: qk.kamStudentProgress(studentId, collegeId || ""),
    queryFn: async () => {
      const query = collegeId ? `?collegeId=${encodeURIComponent(collegeId)}` : "";
      const json = await apiFetch<any>(`/api/kam/students/${encodeURIComponent(studentId)}/progress${query}`);
      if (!json?.success) throw new Error(json?.message || "Failed to load student progress data");
      return json;
    },
  });
  const achievementsQuery = useQuery<any[]>({
    queryKey: qk.studentAchievements(studentId),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/achievements?studentId=${encodeURIComponent(studentId)}`);
      return json?.success ? (json.records || []) : [];
    },
  });
  const codingStatsQuery = useQuery<any>({
    queryKey: qk.studentCodingStats(studentId, collegeId || ""),
    queryFn: async () => {
      const query = collegeId ? `&collegeId=${encodeURIComponent(collegeId)}` : "";
      const json = await apiFetch<any>(`/api/coding-stats?studentId=${encodeURIComponent(studentId)}${query}`);
      return json?.success ? json : null;
    },
  });

  const data = progressQuery.data ?? null;
  const loading = progressQuery.isPending;
  const error = progressQuery.error ? (progressQuery.error as Error).message : null;
  const achievements = achievementsQuery.data || [];
  const loadingAchievements = achievementsQuery.isPending;
  const codingStats = codingStatsQuery.data ?? null;
  const loadingCodingStats = codingStatsQuery.isPending;

  // Close on Escape Key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Export 360° Comprehensive Dossier to Excel
  const handleExportExcel = async () => {
    if (!data) return;
    try {
      const XLSX = await import("xlsx");
      const { student, subjectAnalytics, timeline, dailyAttendance } = data;
      const stats = student.stats;

      const wb = XLSX.utils.book_new();

      // Sheet 1: Student Overview & Metrics
      const overviewHeaders = ["Field", "Value"];
      const overviewRows = [
        ["Student Name", student.name],
        ["Roll Number", student.rollNumber],
        ["Register Number", student.registerNumber],
        ["Email", student.email || "—"],
        ["Phone", student.phone || "—"],
        ["Department", student.department || "General"],
        ["Batch / Cohort", student.classGroup || "General Batch"],
        ["Semester", student.semester || "—"],
        ["Institution", student.collegeName || "—"],
        ["Compliance Risk Tier", stats.risk],
        ["Overall Attendance %", `${stats.overallAttendancePct}%`],
        ["Total Conducted Periods", stats.totalPeriods],
        ["Present Periods (incl. OD)", stats.presentPeriods],
        ["Absent Periods", stats.absentPeriods],
        ["On Duty (OD) Periods", stats.odPeriods],
        ["Evaluated Interviews", stats.interviewsCount]
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet([overviewHeaders, ...overviewRows]);
      wsOverview["!cols"] = [{ wch: 25 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(wb, wsOverview, "Student Profile");

      // Sheet 2: Subject-Wise Breakdown
      const subjectHeaders = ["Subject Name", "Total Periods", "Present", "Absent", "OD", "Attendance %"];
      const subjectRows = (subjectAnalytics || []).map((s: any) => [
        s.subject,
        s.totalPeriods,
        s.presentPeriods,
        s.absentPeriods,
        s.odPeriods,
        `${s.attendancePct}%`
      ]);
      const wsSubjects = XLSX.utils.aoa_to_sheet([subjectHeaders, ...subjectRows]);
      wsSubjects["!cols"] = [{ wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsSubjects, "Subject Breakdown");

      // Sheet 3: Recent Attendance Logs
      const attHeaders = ["Date", "Day", "Time Slot", "Subject", "Status", "Room", "Marked By"];
      const attRows = (dailyAttendance || []).map((r: any) => [
        r.dateStr,
        r.day || "—",
        r.time || "—",
        r.subject || "Class",
        (r.status || "").toUpperCase(),
        r.location || "—",
        r.markedBy || "Faculty"
      ]);
      const wsAtt = XLSX.utils.aoa_to_sheet([attHeaders, ...attRows]);
      wsAtt["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsAtt, "Attendance Logs");

      // Sheet 4: Activity Timeline
      if (timeline && timeline.length > 0) {
        const timelineHeaders = ["Date", "Activity Type", "Title", "Status", "Details"];
        const timelineRows = timeline.map((t: any) => [
          t.date,
          t.type,
          t.title,
          t.status || "—",
          t.desc
        ]);
        const wsTimeline = XLSX.utils.aoa_to_sheet([timelineHeaders, ...timelineRows]);
        wsTimeline["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsTimeline, "Activity Timeline");
      }

      // Sheet 5: Live Coding & Contests
      if (codingStats) {
        const lc = codingStats.leetcode || {};
        const hr = codingStats.hackerrank || {};
        const codingHeaders = ["Platform / Dimension", "Metric Name", "Value"];
        const codingRows = [
          ["LeetCode", "Total Solved", lc.solvedTotal || 0],
          ["LeetCode", "Easy Solved", lc.solvedEasy || 0],
          ["LeetCode", "Medium Solved", lc.solvedMedium || 0],
          ["LeetCode", "Hard Solved", lc.solvedHard || 0],
          ["LeetCode", "Global Ranking", lc.ranking || "Unranked"],
          ["LeetCode", "Username", lc.username || "—"],
          ["LeetCode", "Profile URL", lc.profileUrl || "—"],
          ["HackerRank", "Contest Name", hr.contestName || "—"],
          ["HackerRank", "College Contest Rank", hr.rank ? `#${hr.rank}` : "—"],
          ["HackerRank", "Contest Score", hr.computedScore || 0],
          ["HackerRank", "Questions Solved", `${hr.solved || 0} / ${hr.totalQuestions || "—"}`],
          ["HackerRank", "Attempted", hr.attempted || 0],
          ["HackerRank", "Username", hr.username || "—"],
          ["HackerRank", "Contest Profile", hr.profileUrl || "—"]
        ];
        const wsCoding = XLSX.utils.aoa_to_sheet([codingHeaders, ...codingRows]);
        wsCoding["!cols"] = [{ wch: 20 }, { wch: 30 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsCoding, "Coding & Contests");
      }

      const safeName = student.name.replace(/[^a-zA-Z0-9]/g, "_");
      XLSX.writeFile(wb, `${safeName}_360_Progress_Report.xlsx`);
    } catch (err: any) {
      console.error("Export failed:", err);
    }
  };

  if (loading) {
    return (
      <Dialog
        open={true}
        onOpenChange={(next) => { if (!next) onClose(); }}
        ariaLabel="Loading student 360 profile"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto"
        panelClassName="max-w-3xl my-auto w-full flex flex-col overflow-hidden rounded-2xl border border-slate-100/80 bg-white/95 backdrop-blur-xl shadow-card-lg animate-scaleUp p-0 space-y-0"
      >
        {/* Soft UI Header Skeleton */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white relative shrink-0">
          <div className="absolute top-4 right-4">
            <button
              onClick={onClose}
              aria-label="Close student profile"
              className="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-md"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-4 pr-12">
            <div className="h-12 w-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0 animate-pulse">
              <User className="h-6 w-6 text-white/40" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 bg-white/20 rounded-lg animate-pulse" />
              <div className="h-3 w-64 bg-white/15 rounded-md animate-pulse" />
            </div>
          </div>

          {/* 4 Soft KPI Skeleton Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-white/10">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-2.5 space-y-1.5 animate-pulse text-center">
                <div className="h-2.5 w-16 bg-white/20 rounded mx-auto" />
                <div className="h-5 w-12 bg-white/30 rounded-lg mx-auto" />
              </div>
            ))}
          </div>
        </div>

        {/* Soft Tab Bar Skeleton */}
        <div className="p-3 bg-slate-50/80 border-b border-slate-100 flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-7 w-24 bg-slate-200/70 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* Soft Content Area Skeleton */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-slate-100/80 rounded-2xl border border-slate-200/50 animate-pulse" />
            ))}
          </div>
          <div className="h-48 bg-slate-100/60 rounded-2xl border border-slate-200/50 animate-pulse flex flex-col items-center justify-center gap-2">
            <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500">Loading Student 360° Profile & Analytics…</span>
            <span className="text-[11px] text-slate-400">Fetching attendance logs, trajectory, and coding metrics</span>
          </div>
        </div>
      </Dialog>
    );
  }

  if (error || !data) {
    return (
      <Dialog
        open={true}
        onOpenChange={(next) => { if (!next) onClose(); }}
        ariaLabel="Error loading student profile"
        overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
        panelClassName="max-w-md my-auto w-full rounded-2xl p-6 space-y-4 text-center border border-slate-100 bg-white shadow-card-lg"
      >
        <div className="h-12 w-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-black text-slate-900">Could Not Load Profile</h3>
          <p role="alert" className="text-xs font-semibold text-slate-500 leading-relaxed">
            {error || "Student record could not be loaded."}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => progressQuery.refetch()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </Dialog>
    );
  }

  const { student, subjectAnalytics, progressTrend, timeline, dailyAttendance } = data;
  const stats = student.stats;

  // Clean deduplicated subtitle
  const subtitleParts = [
    student.department,
    student.classGroup && student.classGroup !== student.department ? student.classGroup : null,
    student.semester,
    student.collegeName
  ].filter(Boolean);

  const cleanSubtitle = subtitleParts.join(" • ");

  return (
    <Dialog
      open={true}
      onOpenChange={(next) => { if (!next) onClose(); }}
      ariaLabel="Student 360 profile"
      overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto"
      panelClassName="max-w-3xl my-auto max-h-[92vh] w-full flex flex-col overflow-hidden rounded-2xl border border-slate-100/80 bg-white/95 backdrop-blur-xl shadow-card-lg animate-scaleUp p-0 space-y-0"
    >
        {/* Soft UI Executive Header Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white relative shrink-0">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              title="Export 360° Excel Report"
              className="h-8 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 hover:text-white backdrop-blur-md flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close student profile"
              className="h-8 w-8 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3.5 pr-28">
            <div className="h-12 w-12 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center text-white/90 font-black text-lg shrink-0 shadow-inner">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black tracking-tight truncate">{student.name}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider backdrop-blur-md ${
                  stats.risk === "HEALTHY"
                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-400/40"
                    : stats.risk === "AT RISK"
                    ? "bg-amber-500/25 text-amber-300 border border-amber-400/40"
                    : "bg-rose-500/25 text-rose-300 border border-rose-400/40"
                }`}>
                  {stats.risk}
                </span>
              </div>
              <p className="text-xs font-bold text-indigo-200 mt-0.5">
                Roll: <span className="font-black text-white">{student.rollNumber}</span> • Reg: {student.registerNumber}
              </p>
              <p className="text-[11px] text-white/70 font-medium truncate mt-0.5 max-w-lg">
                {cleanSubtitle}
              </p>
            </div>
          </div>

          {/* 4 Soft Frosted Glass KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-white/10 text-center">
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-2.5 shadow-xs space-y-0.5">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider block">Attendance</span>
              <p className="text-base font-black text-emerald-300">{stats.overallAttendancePct}%</p>
            </div>
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-2.5 shadow-xs space-y-0.5">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider block">Present / Total</span>
              <p className="text-base font-black text-white">{stats.presentPeriods} / {stats.totalPeriods}</p>
            </div>
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-2.5 shadow-xs space-y-0.5">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider block">Interviews</span>
              <p className="text-base font-black text-white">{stats.interviewsCount} Evaluated</p>
            </div>
            <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-2.5 shadow-xs space-y-0.5">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider block">Absences</span>
              <p className="text-base font-black text-rose-300">{stats.absentPeriods}</p>
            </div>
          </div>
        </div>

        {/* Soft UI Pill Navigation Tabs */}
        <div className="p-1.5 bg-slate-50/90 border-b border-slate-100 flex items-center gap-1.5 shrink-0 overflow-x-auto custom-scrollbar">
          {[
            { key: "overview", label: "Progress & Analytics", icon: Award },
            { key: "coding", label: `💻 Coding (${codingStats?.leetcode?.solvedTotal ? `${codingStats.leetcode.solvedTotal} LC` : "Stats"})`, icon: Sparkles },
            { key: "subjects", label: "Subject Breakdown", icon: BookOpen },
            { key: "timeline", label: "Timeline", icon: Clock },
            { key: "attendance", label: "Attendance Logs", icon: Calendar },
            { key: "achievements", label: `🏆 Honors (${achievements.length})`, icon: Sparkles }
          ].map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as any)}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-white text-indigo-950 font-black shadow-xs border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 font-bold"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents - Scrollable with Controlled Height */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* 1. Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Quick Coding Metrics Strip in Overview */}
              {codingStats && (
                <div className="p-3.5 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl text-white flex items-center justify-between gap-3 shadow-md border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-black text-xs shrink-0">
                      &lt;/&gt;
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-indigo-300 tracking-wider block">Competitive Coding Standing</span>
                      <p className="text-xs font-bold text-slate-200 mt-0.5">
                        {codingStats.leetcode?.found ? `LeetCode: ${codingStats.leetcode.solvedTotal} Solved` : "LeetCode: Active"}
                        {" • "}
                        {codingStats.hackerrank?.rank ? `HackerRank: Rank #${codingStats.hackerrank.rank}` : `HackerRank: ${codingStats.hackerrank?.solved || 0} Solved`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("coding")}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl text-xs font-bold text-white border border-white/20 transition-all cursor-pointer whitespace-nowrap backdrop-blur-md"
                  >
                    View Coding Dossier →
                  </button>
                </div>
              )}
              <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-100 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    Monthly Attendance Trajectory (%)
                  </h4>
                  <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                    Overall: {stats.overallAttendancePct}%
                  </span>
                </div>

                <div className="h-36 w-full">
                  {progressTrend && progressTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={progressTrend} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorStudentAtt" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 9, fontWeight: 700 }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} tickFormatter={v => `${v}%`} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "1rem",
                            border: "1px solid #e2e8f0",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                            fontSize: "11px",
                            fontWeight: 700
                          }}
                          formatter={(v: any) => [`${v}%`, "Attendance"]}
                        />
                        <Area type="monotone" dataKey="attendancePct" stroke="#4F46E5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorStudentAtt)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-slate-400 font-bold text-center py-8">No historical attendance logs</p>
                  )}
                </div>
              </div>

              {/* Subject quick preview */}
              <div>
                <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-2">
                  Subject-Wise Performance Snapshot
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {subjectAnalytics.map((s: any) => (
                    <div key={s.subject} className="bg-slate-50/70 hover:bg-white rounded-2xl p-3 border border-slate-100 shadow-card flex items-center justify-between transition-all">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-black text-slate-900 truncate">{s.subject}</p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {s.presentPeriods} of {s.totalPeriods} periods marked
                        </p>
                      </div>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0 ${
                        s.attendancePct >= 75
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : s.attendancePct >= 60
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}>
                        {s.attendancePct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. Subject Breakdown Tab */}
          {activeTab === "subjects" && (
            <div className="space-y-3">
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-card bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-100 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                      <TableHead className="py-2.5 px-3">Subject</TableHead>
                      <TableHead className="py-2.5 px-2 text-center">Total</TableHead>
                      <TableHead className="py-2.5 px-2 text-center text-emerald-700">Present</TableHead>
                      <TableHead className="py-2.5 px-2 text-center text-rose-700">Absent</TableHead>
                      <TableHead className="py-2.5 px-2 text-center text-purple-700">OD</TableHead>
                      <TableHead className="py-2.5 px-3 text-right text-indigo-600">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700 bg-white text-xs">
                    {subjectAnalytics.map((s: any) => (
                      <TableRow key={s.subject} className="hover:bg-slate-50/80 transition-colors">
                        <TableCell className="py-2.5 px-3 font-bold text-slate-900">{s.subject}</TableCell>
                        <TableCell className="py-2.5 px-2 text-center font-bold text-slate-600">{s.totalPeriods}</TableCell>
                        <TableCell className="py-2.5 px-2 text-center text-emerald-600 font-black">{s.presentPeriods}</TableCell>
                        <TableCell className="py-2.5 px-2 text-center text-rose-500 font-bold">{s.absentPeriods}</TableCell>
                        <TableCell className="py-2.5 px-2 text-center text-purple-600 font-bold">{s.odPeriods}</TableCell>
                        <TableCell className="py-2.5 px-3 text-right font-black text-indigo-600">{s.attendancePct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* 3. Activity Timeline Tab */}
          {activeTab === "timeline" && (
            <div className="space-y-3">
              {timeline.length === 0 ? (
                <div className="text-center py-8 text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No logged student activities or evaluations
                </div>
              ) : (
                <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200/80">
                  {timeline.map((item: any) => (
                    <div key={item.id} className="relative">
                      <div className="absolute -left-6 top-1 h-5 w-5 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center text-[8px] font-black text-indigo-600 shadow-xs">
                        •
                      </div>
                      <div className="bg-slate-50/70 hover:bg-white rounded-2xl p-3.5 border border-slate-100 shadow-card space-y-1 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">{item.title}</span>
                          <span className="text-[10px] font-bold text-slate-400">{item.date}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-600">{item.desc}</p>
                        {item.status && (
                          <span className="inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                            Status: {item.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Recent Attendance Logs */}
          {activeTab === "attendance" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {dailyAttendance.map((rec: any) => (
                  <div key={rec.id} className="bg-slate-50/80 hover:bg-white p-2.5 rounded-2xl border border-slate-100 text-xs flex justify-between items-center shadow-card transition-all">
                    <div>
                      <p className="font-bold text-slate-800">{rec.dateStr}</p>
                      <p className="text-[9px] text-slate-400 truncate max-w-[95px]">{rec.subject || "Class"}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${
                      rec.status === "present"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : rec.status === "absent"
                        ? "bg-rose-50 text-rose-800 border-rose-200"
                        : "bg-purple-50 text-purple-800 border-purple-200"
                    }`}>
                      {rec.status?.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. 🏆 Student Honors & Verified Achievements Tab */}
          {activeTab === "achievements" && (
            <div className="space-y-3">
              {loadingAchievements ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400 animate-pulse">
                  Loading verified student achievements...
                </div>
              ) : achievements.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl text-center space-y-2">
                  <Award className="h-8 w-8 text-slate-300 mx-auto" />
                  <h4 className="text-xs font-extrabold text-slate-700">No Verified Achievements Logged</h4>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    When the Campus Manager records hackathon wins, research papers, or symposium prizes for this student, they will be listed here and in the Campus E-Audit.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {achievements.map((ach) => {
                    const isTopPrize = ["Winner", "1st Place", "Gold Medalist"].includes(ach.badge);
                    let achPhotosList: string[] = [];
                    if (ach.photos) {
                      try {
                        achPhotosList = typeof ach.photos === "string" ? JSON.parse(ach.photos) : (Array.isArray(ach.photos) ? ach.photos : []);
                      } catch (_) {
                        achPhotosList = [ach.photos];
                      }
                    }

                    return (
                      <div
                        key={ach.id}
                        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-2xs hover:shadow-card transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide border ${
                              isTopPrize
                                ? "bg-amber-100 text-amber-800 border-amber-300"
                                : ach.badge === "Runner-Up" || ach.badge === "2nd Place" || ach.badge === "Silver Medalist"
                                  ? "bg-slate-100 text-slate-800 border-slate-300"
                                  : ach.badge === "Paper Published" || ach.badge === "Certification"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : "bg-indigo-100 text-indigo-800 border-indigo-300"
                            }`}
                          >
                            {ach.badge || "Accolade"}
                          </span>

                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {ach.date_str || "Verified"}
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 block">
                            {ach.category || "Student Honor"}
                          </span>
                          <h4 className="text-xs font-black text-slate-900 mt-0.5">
                            {ach.title}
                          </h4>
                          {ach.topic && (
                            <p className="text-[11px] font-bold text-indigo-900 mt-0.5 flex items-center gap-1">
                              <span className="text-[9px] uppercase font-black text-slate-400">Topic:</span>
                              <span>{ach.topic}</span>
                            </p>
                          )}
                        </div>

                        {ach.event_name && (
                          <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-[#4F46E5] shrink-0" />
                            <span className="truncate">Event: <strong className="text-slate-900">{ach.event_name}</strong></span>
                          </div>
                        )}

                        {ach.reward_prize && (
                          <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] font-black text-emerald-900 flex items-center gap-1.5">
                            <Award className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>Prize / Award: {ach.reward_prize}</span>
                          </div>
                        )}

                        {ach.description && (
                          <p className="text-[11px] text-slate-600 font-normal leading-relaxed">
                            {ach.description}
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs">
                          {ach.proof_link ? (
                            <a
                              href={ach.proof_link.startsWith("http") ? ach.proof_link : `https://${ach.proof_link}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Official Verification Link</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold">Campus Manager Verified</span>
                          )}

                          {achPhotosList.length > 0 && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              📸 {achPhotosList.length} photo(s) attached
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 6. Coding & Platform Performance Tab */}
          {activeTab === "coding" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 flex-wrap gap-2">
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span>💻 Algorithmic &amp; Contest Performance</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Real-time Sync Active
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    Real-time statistics synchronized from LeetCode practice logs and HackerRank college contest leaderboards.
                  </p>
                </div>
                {codingStats?.collegeMatched && (
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                    🏛️ {codingStats.collegeMatched}
                  </span>
                )}
              </div>

              {loadingCodingStats ? (
                <div className="p-8 text-center text-xs font-bold text-slate-400 animate-pulse flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Fetching live HackerRank &amp; LeetCode student records...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LeetCode Card */}
                  <div className="p-4 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/30 via-white to-orange-50/20 shadow-xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-[#FFA116] text-slate-950 flex items-center justify-center font-black text-xs shadow-xs">
                          LC
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">LeetCode Analytics</h4>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {codingStats?.leetcode?.username ? `@${codingStats.leetcode.username}` : "Linked Student Record"}
                          </p>
                        </div>
                      </div>
                      {codingStats?.leetcode?.ranking ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                          Rank #{codingStats.leetcode.ranking.toLocaleString()}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                          {codingStats?.leetcode?.found ? "Active Solver" : "Not Synced"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-900">
                        {codingStats?.leetcode?.solvedTotal || 0}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Problems Solved
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-center">
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/70">
                        <span className="text-[9px] font-black uppercase text-emerald-700 block">Easy</span>
                        <span className="text-xs font-black text-emerald-900">{codingStats?.leetcode?.solvedEasy || 0}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/70">
                        <span className="text-[9px] font-black uppercase text-amber-700 block">Med</span>
                        <span className="text-xs font-black text-amber-900">{codingStats?.leetcode?.solvedMedium || 0}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200/70">
                        <span className="text-[9px] font-black uppercase text-rose-700 block">Hard</span>
                        <span className="text-xs font-black text-rose-900">{codingStats?.leetcode?.solvedHard || 0}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">
                        {codingStats?.leetcode?.lastSyncedAt
                          ? `Synced: ${new Date(codingStats.leetcode.lastSyncedAt).toLocaleDateString()}`
                          : "College LeetCode DB"}
                      </span>
                      {codingStats?.leetcode?.profileUrl && (
                        <a
                          href={codingStats.leetcode.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-800 font-extrabold hover:underline flex items-center gap-1"
                        >
                          <span>Open Profile</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* HackerRank Card */}
                  <div className="p-4 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/30 via-white to-teal-50/20 shadow-xs space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-[#00EA64] text-slate-950 flex items-center justify-center font-black text-xs shadow-xs">
                          HR
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">HackerRank Contest</h4>
                          <p className="text-[11px] text-slate-500 font-medium truncate max-w-[160px]">
                            {codingStats?.hackerrank?.contestName || "Campus Algorithm Challenge"}
                          </p>
                        </div>
                      </div>
                      {codingStats?.hackerrank?.rank ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                          🏆 Rank #{codingStats.hackerrank.rank}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                          {codingStats?.hackerrank?.found ? "Contest Active" : "Not Synced"}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-[9px] font-black uppercase text-slate-400 block">Score</span>
                        <span className="text-xl font-black text-slate-900">
                          {codingStats?.hackerrank?.computedScore || 0}
                        </span>
                      </div>
                      <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-100">
                        <span className="text-[9px] font-black uppercase text-slate-400 block">Solved</span>
                        <span className="text-xl font-black text-emerald-700">
                          {codingStats?.hackerrank?.solved || 0}
                          <span className="text-xs font-bold text-slate-400 ml-1">
                            / {codingStats?.hackerrank?.totalQuestions || "—"}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-600 bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                      <span>Attempted: <strong>{codingStats?.hackerrank?.attempted || 0}</strong></span>
                      <span>Username: <strong>{codingStats?.hackerrank?.username || "—"}</strong></span>
                    </div>

                    <div className="pt-2 border-t border-emerald-100 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">
                        {codingStats?.hackerrank?.lastScrapedAt
                          ? `Scraped: ${new Date(codingStats.hackerrank.lastScrapedAt).toLocaleDateString()}`
                          : "Contest Leaderboard"}
                      </span>
                      {codingStats?.hackerrank?.profileUrl && (
                        <a
                          href={codingStats.hackerrank.profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-800 font-extrabold hover:underline flex items-center gap-1"
                        >
                          <span>Open Contest</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Soft UI Footer with Actions */}
        <div className="bg-slate-50/80 p-3.5 px-6 border-t border-slate-100 backdrop-blur-md flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>Export Dossier (.xlsx)</span>
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95"
          >
            Close
          </button>
        </div>
    </Dialog>
  );
};
