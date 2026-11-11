"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Award,
  CheckCircle2,
  AlertTriangle,
  Percent,
  Search,
  Calendar,
  Clock,
  Check,
} from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { CourseInfoButton } from "../CourseInfoModal";
import { getLocalDateStr } from "@/lib/localDate";

interface StudentExamsTabProps {
  currentStudent: any;
  studentExamsList: any[];
  studentMarksList: any[];
  examsLoading: boolean;
}

export default function StudentExamsTab({
  currentStudent,
  studentExamsList = [],
  studentMarksList = [],
  examsLoading = false,
}: StudentExamsTabProps) {
  const [examSubTab, setExamSubTab] = useState<"results" | "schedule">("results");
  const [marksTypeFilter, setMarksTypeFilter] = useState<string>("all");
  const [marksSearchTerm, setMarksSearchTerm] = useState<string>(" ");

  const todayStr = getLocalDateStr();
  const allExams = studentExamsList || [];
  const pastExams = allExams.filter((ex: any) => ex.exam_date < todayStr);
  const upcomingExams = allExams.filter((ex: any) => ex.exam_date >= todayStr);
  const displayMarks = studentMarksList || [];

  // Compute summary stats for student results
  let totalMarks = 0;
  let totalMaxMarks = 0;
  let passedCount = 0;
  let arrearsCount = 0;
  let absentCount = 0;

  displayMarks.forEach((m: any) => {
    if (m.is_absent) {
      absentCount++;
      arrearsCount++;
    } else if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
      totalMarks += parseFloat(m.marks_obtained);
      totalMaxMarks += parseFloat(m.max_marks || 50);
      const passM = parseFloat(m.passing_marks || m.max_marks * 0.4 || 20);
      if (parseFloat(m.marks_obtained) >= passM) passedCount++;
      else arrearsCount++;
    }
  });

  const overallPct = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : "—";

  const availableExamTypes = Array.from(
    new Set([...displayMarks.map((m: any) => m.exam_type), ...allExams.map((ex: any) => ex.exam_type)].filter(Boolean))
  ).sort();

  const examGroups = availableExamTypes
    .map((type: string) => {
      const typeMarks = displayMarks.filter((m: any) => m.exam_type === type);
      const typeScheduled = allExams.filter((ex: any) => ex.exam_type === type);

      const evaluatedSubjectKeys = new Set(
        typeMarks.map((m: any) => (m.subject_code || m.subject_name || "").toLowerCase())
      );
      const pendingExams = typeScheduled.filter((ex: any) => {
        const key = (ex.subject_code || ex.subject_name || "").toLowerCase();
        return key ? !evaluatedSubjectKeys.has(key) : true;
      });

      let scoreTotal = 0;
      let maxTotal = 0;
      let passCount = 0;
      let arrearCount = 0;
      let evalCount = 0;

      typeMarks.forEach((m: any) => {
        if (m.is_absent) {
          arrearCount++;
          evalCount++;
        } else if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
          evalCount++;
          const s = parseFloat(m.marks_obtained);
          const mx = parseFloat(m.max_marks || 50);
          const passM = parseFloat(m.passing_marks || mx * 0.4 || 20);
          scoreTotal += s;
          maxTotal += mx;
          if (s >= passM) passCount++;
          else arrearCount++;
        }
      });

      const allDates = [...typeMarks.map((m: any) => m.exam_date), ...typeScheduled.map((ex: any) => ex.exam_date)]
        .filter(Boolean)
        .sort();
      const minDate = allDates[0];
      const maxDate = allDates[allDates.length - 1];
      const dateRangeStr = minDate ? (minDate === maxDate ? minDate : `${minDate} → ${maxDate}`) : "";

      const q = marksSearchTerm.toLowerCase().trim();
      const matchesQuery = (subName: string, subCode: string, evalBy?: string) => {
        if (!q) return true;
        return (
          type.toLowerCase().includes(q) ||
          (subName || "").toLowerCase().includes(q) ||
          (subCode || "").toLowerCase().includes(q) ||
          (evalBy || "").toLowerCase().includes(q)
        );
      };

      const filteredTypeMarks = typeMarks.filter((m: any) =>
        matchesQuery(m.subject_name, m.subject_code, m.evaluated_by)
      );
      const filteredPendingExams = pendingExams.filter((ex: any) =>
        matchesQuery(ex.subject_name, ex.subject_code)
      );

      const totalSubjects = typeMarks.length + pendingExams.length;
      const hasMatches = !q || filteredTypeMarks.length > 0 || filteredPendingExams.length > 0;

      return {
        type,
        typeMarks: filteredTypeMarks,
        pendingExams: filteredPendingExams,
        totalSubjects,
        evalCount,
        scoreTotal,
        maxTotal,
        passCount,
        arrearCount,
        pct: maxTotal > 0 ? ((scoreTotal / maxTotal) * 100).toFixed(1) : null,
        dateRangeStr,
        hasMatches,
      };
    })
    .filter((g: any) => {
      if (marksTypeFilter !== "all" && g.type !== marksTypeFilter) return false;
      if (marksSearchTerm.trim() && !g.hasMatches) return false;
      return true;
    });

  const examTableRows = (exams: any[], isPast: boolean) =>
    exams.map((ex: any, idx: number) => {
      return (
        <TableRow key={ex.id || idx} className={`hover:bg-slate-50/70 transition-colors ${isPast ? "opacity-60" : ""}`}>
          <TableCell className="p-3">
            <div className="flex flex-col gap-1">
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] font-bold w-max">
                {ex.exam_type}
              </span>
              {isPast && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-bold uppercase w-max">
                  Completed
                </span>
              )}
            </div>
          </TableCell>
          <TableCell className="p-3">
            <div className="font-bold text-slate-900 truncate max-w-[240px]">{ex.subject_name}</div>
            {ex.subject_code && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ex.subject_code}</div>}
          </TableCell>
          <TableCell className="p-3 text-slate-700 font-semibold whitespace-nowrap">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                <span>{ex.exam_date}</span>
              </div>
              {ex.day_order && ex.day_order !== "None" ? (
                <span className="inline-flex items-center w-max px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-bold uppercase">
                  {ex.day_order}
                </span>
              ) : null}
            </div>
          </TableCell>
          <TableCell className="p-3 text-slate-600">
            <div className="flex items-center gap-1.5 text-[11px]">
              <Clock className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-800">
                {ex.session_time || `${ex.start_time} - ${ex.end_time}`}
              </span>
            </div>
          </TableCell>
          <TableCell className="p-3">
            <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-[11px] text-slate-700 font-bold">
              Target: Out of {ex.max_marks || 50} Marks
            </span>
          </TableCell>
          <TableCell className="p-3 text-center">
            {isPast ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                <Check className="h-3 w-3" />
                Concluded
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase">
                <Clock className="h-3 w-3" />
                Scheduled
              </span>
            )}
          </TableCell>
        </TableRow>
      );
    });

  return (
    <div className="space-y-6 font-sans">
      {/* Header Navigation & Sub-Tabs */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Examinations & Test Marks
                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase inline-flex items-center gap-1">
                  <span>{currentStudent?.department || "Department"}</span>
                  {currentStudent?.department && (
                    <CourseInfoButton
                      course={currentStudent.department}
                      collegeId={currentStudent.college_id}
                      size="xs"
                    />
                  )}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Track evaluated scores, pass/fail metrics, faculty feedback, and upcoming assessment timetables.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setExamSubTab("results")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  examSubTab === "results" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Test Marks & Scorecard ({displayMarks.length})
              </button>
              <button
                type="button"
                onClick={() => setExamSubTab("schedule")}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  examSubTab === "schedule" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Upcoming Tests ({upcomingExams.length})
              </button>
            </div>
          </div>
        </div>

        {/* Scorecard Quick KPIs */}
        {examSubTab === "results" && displayMarks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Evaluated Tests</span>
                <Award className="h-4 w-4 text-indigo-500" />
              </div>
              <span className="text-xl font-black text-indigo-950 mt-1 block">{displayMarks.length}</span>
              <span className="text-[11px] text-indigo-600 font-medium">Recorded scorecards</span>
            </div>
            <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Passed</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xl font-black text-emerald-950 mt-1 block">{passedCount}</span>
              <span className="text-[11px] text-emerald-700 font-medium">Cleared cutoff</span>
            </div>
            <div
              className={`p-3.5 rounded-xl border ${
                arrearsCount > 0 ? "bg-rose-50/50 border-rose-100" : "bg-teal-50/50 border-teal-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    arrearsCount > 0 ? "text-rose-700" : "text-teal-700"
                  }`}
                >
                  Arrears / Re-Appear
                </span>
                {arrearsCount > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />
                )}
              </div>
              <span className={`text-xl font-black mt-1 block ${arrearsCount > 0 ? "text-rose-950" : "text-teal-950"}`}>
                {arrearsCount > 0 ? arrearsCount : "0 (Cleared)"}
              </span>
              <span className={`text-[11px] font-medium ${arrearsCount > 0 ? "text-rose-600" : "text-teal-700"}`}>
                {arrearsCount > 0 ? "Needs re-assessment" : "All tests passed"}
              </span>
            </div>
            <div className="p-3.5 bg-purple-50/50 border border-purple-100 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Cumulative Score</span>
                <Percent className="h-4 w-4 text-purple-500" />
              </div>
              <span className="text-xl font-black text-purple-950 mt-1 block">{overallPct}%</span>
              <span className="text-[11px] text-purple-700 font-medium">
                {totalMarks.toFixed(0)} / {totalMaxMarks.toFixed(0)} Total Marks
              </span>
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: ASSESSMENT RESULTS & SCORECARD */}
      {examSubTab === "results" && (
        <div className="space-y-4">
          {availableExamTypes.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">Filter Test:</span>
                <button
                  type="button"
                  onClick={() => setMarksTypeFilter("all")}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    marksTypeFilter === "all"
                      ? "bg-indigo-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All ({displayMarks.length})
                </button>
                {availableExamTypes.map((t: string) => {
                  const count = displayMarks.filter((m: any) => m.exam_type === t).length;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMarksTypeFilter(t)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        marksTypeFilter === t
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {t} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search subject or test..."
                  value={marksSearchTerm}
                  onChange={(e) => setMarksSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>
            </div>
          )}

          {examsLoading ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-500 font-semibold shadow-xs">
              Loading evaluated test scores...
            </div>
          ) : availableExamTypes.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-500 shadow-xs">
              <div className="flex flex-col items-center justify-center gap-2">
                <BookOpen className="h-8 w-8 text-slate-300" />
                <p className="font-bold text-slate-700 text-sm">No Test Marks Published Yet</p>
                <p className="text-xs text-slate-400 max-w-md">
                  As your subject mentors evaluate your test papers, your marks, percentages, and feedback will be posted here in real-time.
                </p>
              </div>
            </div>
          ) : examGroups.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-slate-500 text-xs shadow-xs">
              No test marks matching your current filter.{" "}
              <button
                type="button"
                onClick={() => {
                  setMarksTypeFilter("all");
                  setMarksSearchTerm("");
                }}
                className="text-indigo-600 underline font-bold"
              >
                Reset filters
              </button>
            </div>
          ) : (
            examGroups.map((group: any) => {
              return (
                <div
                  key={group.type}
                  className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden transition-all hover:border-slate-300"
                >
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50/80 to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs uppercase">
                        {group.type.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 tracking-tight">{group.type}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {group.evalCount} / {group.totalSubjects} Evaluated
                          </span>
                          {group.pct !== null && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                parseFloat(group.pct) >= 75
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : parseFloat(group.pct) >= 40
                                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              Avg {group.pct}%
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                          {group.dateRangeStr && <span>📅 {group.dateRangeStr}</span>}
                          {group.arrearCount > 0 && (
                            <span className="text-rose-600 font-bold">• {group.arrearCount} Needs Attention</span>
                          )}
                          {group.arrearCount === 0 && group.evalCount > 0 && (
                            <span className="text-emerald-700 font-bold">• All Cleared</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {group.maxTotal > 0 && (
                      <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
                        <div className="text-right">
                          <div className="text-[9px] font-bold uppercase text-slate-400">Total Scored</div>
                          <div className="font-mono font-bold text-slate-900">
                            {group.scoreTotal.toFixed(0)} / {group.maxTotal.toFixed(0)}
                          </div>
                        </div>
                        <div className="h-6 w-px bg-slate-200" />
                        <div className="text-right">
                          <div className="text-[9px] font-bold uppercase text-slate-400">Pass Rate</div>
                          <div
                            className={`font-mono font-bold ${
                              group.arrearCount === 0 ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {group.evalCount > 0 ? `${group.passCount}/${group.evalCount}` : "—"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto scroll-touch">
                    <Table className="w-full border-collapse text-left text-xs min-w-[700px]">
                      <TableHeader>
                        <TableRow className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px] whitespace-nowrap">
                          <TableHead className="p-3">Subject Details</TableHead>
                          <TableHead className="p-3">Test Date</TableHead>
                          <TableHead className="p-3 text-center">Marks Scored</TableHead>
                          <TableHead className="p-3 text-center">Score %</TableHead>
                          <TableHead className="p-3 text-center">Grade</TableHead>
                          <TableHead className="p-3 text-center">Status</TableHead>
                          <TableHead className="p-3">Evaluator & Remarks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                        {group.typeMarks.map((m: any, idx: number) => {
                          const isAbs = Boolean(m.is_absent);
                          const marksNum =
                            m.marks_obtained !== null && m.marks_obtained !== undefined
                              ? parseFloat(m.marks_obtained)
                              : null;
                          const maxM = parseFloat(m.max_marks || 50);
                          const passM = parseFloat(m.passing_marks || maxM * 0.4 || 20);
                          const pct = marksNum !== null && maxM > 0 ? Math.round((marksNum / maxM) * 100) : 0;
                          const isPass = marksNum !== null && marksNum >= passM;

                          return (
                            <TableRow key={m.id || `mark-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                              <TableCell className="p-3">
                                <div className="font-bold text-slate-900">{m.subject_name}</div>
                                {m.subject_code && (
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{m.subject_code}</div>
                                )}
                              </TableCell>
                              <TableCell className="p-3 text-slate-700 font-bold whitespace-nowrap">
                                {m.exam_date}
                              </TableCell>
                              <TableCell className="p-3 text-center font-bold">
                                {isAbs ? (
                                  <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 font-mono text-[11px] font-bold">
                                    ABSENT
                                  </span>
                                ) : marksNum !== null ? (
                                  <div className="inline-flex items-baseline gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                    <span
                                      className={`font-mono text-xs font-bold ${
                                        isPass ? "text-slate-900" : "text-rose-600"
                                      }`}
                                    >
                                      {marksNum}
                                    </span>
                                    <span className="text-slate-400 font-medium text-[10px]">/ {maxM}</span>
                                  </div>
                                ) : (
                                  <span className="text-amber-600 italic text-[11px]">Pending evaluation</span>
                                )}
                              </TableCell>
                              <TableCell className="p-3 text-center">
                                {isAbs || marksNum === null ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="font-bold text-slate-800 text-[11px]">{pct}%</span>
                                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          pct >= 75 ? "bg-emerald-500" : pct >= passM ? "bg-indigo-500" : "bg-rose-500"
                                        }`}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="p-3 text-center">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    isAbs
                                      ? "bg-slate-100 text-slate-600"
                                      : m.grade === "O" || m.grade === "A+" || m.grade === "A"
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : m.grade === "B+" || m.grade === "B"
                                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                      : isPass
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {isAbs ? "AB" : m.grade || (isPass ? "PASS" : "RA")}
                                </span>
                              </TableCell>
                              <TableCell className="p-3 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                    isAbs
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : isPass
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}
                                >
                                  {isAbs ? "Absent" : isPass ? "Passed" : "Re-Appear"}
                                </span>
                              </TableCell>
                              <TableCell className="p-3 text-[11px] text-slate-600 max-w-[200px]">
                                <div className="font-bold text-slate-800">{m.evaluated_by || "Subject Mentor"}</div>
                                {m.remarks ? (
                                  <div className="text-slate-500 text-[10px] italic mt-0.5 line-clamp-2">{m.remarks}</div>
                                ) : (
                                  <div className="text-slate-400 text-[10px] italic">Verified</div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}

                        {group.pendingExams.map((ex: any, idx: number) => (
                          <TableRow
                            key={ex.id || `pending-${idx}`}
                            className="hover:bg-amber-50/20 transition-colors bg-slate-50/40"
                          >
                            <TableCell className="p-3">
                              <div className="font-bold text-slate-800">{ex.subject_name}</div>
                              {ex.subject_code && (
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ex.subject_code}</div>
                              )}
                            </TableCell>
                            <TableCell className="p-3 text-slate-600 font-medium whitespace-nowrap">
                              {ex.exam_date}
                              {ex.session_time && (
                                <div className="text-[10px] text-slate-400 font-normal">{ex.session_time}</div>
                              )}
                            </TableCell>
                            <TableCell className="p-3 text-center">
                              <span className="text-amber-600 italic text-[11px] font-medium">Pending evaluation</span>
                            </TableCell>
                            <TableCell className="p-3 text-center text-slate-400">—</TableCell>
                            <TableCell className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold uppercase">
                                Scheduled
                              </span>
                            </TableCell>
                            <TableCell className="p-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                Pending
                              </span>
                            </TableCell>
                            <TableCell className="p-3 text-[11px] text-slate-400 italic">
                              Awaiting faculty evaluation
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: UPCOMING TESTS SCHEDULE */}
      {examSubTab === "schedule" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-4 py-3 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-indigo-700 tracking-wider">
                  Upcoming Scheduled Tests
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                  {upcomingExams.length}
                </span>
              </div>
              <span className="text-xs text-indigo-600 font-medium">Prepare well for your assessments!</span>
            </div>
            <div className="overflow-x-auto scroll-touch">
              <Table className="w-full border-collapse text-left text-xs min-w-[650px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px] whitespace-nowrap">
                    <TableHead className="p-3">Exam / Assessment</TableHead>
                    <TableHead className="p-3">Subject Details</TableHead>
                    <TableHead className="p-3">Exam Date & Day Order</TableHead>
                    <TableHead className="p-3">Session & Timings</TableHead>
                    <TableHead className="p-3">Total Marks</TableHead>
                    <TableHead className="p-3 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                  {examsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                        Loading assessment schedule...
                      </TableCell>
                    </TableRow>
                  ) : upcomingExams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="p-8 text-center text-slate-400 italic">
                        No upcoming examination schedules published for your enrolled courses.
                      </TableCell>
                    </TableRow>
                  ) : (
                    examTableRows(upcomingExams, false)
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {pastExams.length > 0 && (
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  Past Tests & Examinations
                </span>
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">
                  {pastExams.length}
                </span>
              </div>
              <div className="overflow-x-auto scroll-touch">
                <Table className="w-full border-collapse text-left text-xs min-w-[650px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px] whitespace-nowrap">
                      <TableHead className="p-3">Exam / Assessment</TableHead>
                      <TableHead className="p-3">Subject Details</TableHead>
                      <TableHead className="p-3">Exam Date & Day Order</TableHead>
                      <TableHead className="p-3">Session & Timings</TableHead>
                      <TableHead className="p-3">Total Marks</TableHead>
                      <TableHead className="p-3 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                    {examTableRows(pastExams, true)}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

