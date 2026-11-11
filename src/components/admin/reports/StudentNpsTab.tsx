"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageSquareQuote, ThumbsUp, TrendingUp, Users } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useAdminCampusScope } from "@/components/admin/useAdminCampusScope";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/usePagination";
import { formatNps, monthLabel, npsTone, type NpsBand } from "@/lib/studentNps";

interface Summary {
  npsIndex: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  avg: number;
}

interface ResponseRow {
  month_key: string | null;
  score: number | null;
  mentor_score?: number | null;
  mentor_name?: string | null;
  student_name: string;
  department: string | null;
  class_group: string | null;
  likes: string | null;
  improve: string | null;
  submitted_at: string | null;
}

interface StudentNpsPayload {
  success: boolean;
  scope: { college_id: string | null; college: string | null; scoped: boolean };
  summary: Summary;
  trend: { month: string; label: string; npsIndex: number | null; avg: number; total: number }[];
  months: string[];
  coverage: { enrolled: number; respondents: number; ratePct: number | null };
  verbatims: { student: string; month: string; score: number | null; likes: string; improve: string }[];
  responses: ResponseRow[];
  truncated?: boolean;
}

const TONE_CARD: Record<ReturnType<typeof npsTone>, string> = {
  neutral: "border-slate-200 bg-white",
  danger: "border-rose-200 bg-rose-50/40",
  warn: "border-amber-200 bg-amber-50/40",
  good: "border-emerald-200 bg-emerald-50/40"
};

const TONE_TEXT: Record<ReturnType<typeof npsTone>, string> = {
  neutral: "text-slate-400",
  danger: "text-rose-600",
  warn: "text-amber-600",
  good: "text-emerald-600"
};

const TONE_BAR: Record<ReturnType<typeof npsTone>, string> = {
  neutral: "bg-slate-300",
  danger: "bg-rose-500",
  warn: "bg-amber-400",
  good: "bg-emerald-500"
};

function bandLabel(band: NpsBand): string {
  return band === "promoter" ? "Promoters" : band === "passive" ? "Passives" : "Detractors";
}

/**
 * Monthly student sentiment for one campus: the survey's NPS split, its month-over-month
 * movement, how much of the roster actually answered, and the written notes behind it.
 */
export function StudentNpsTab({ overrideCollegeId }: { overrideCollegeId?: string } = {}) {
  const adminScope = useAdminCampusScope();
  const collegeId = overrideCollegeId || adminScope.collegeId;
  const colleges = adminScope.colleges;
  const selectCollege = adminScope.selectCollege;
  const [month, setMonth] = useState("all");

  const activeCollege = colleges.find(c => c.id === collegeId);

  const { data, isLoading, isError, error, refetch } = useQuery<StudentNpsPayload>({
    queryKey: ["student-nps", collegeId, month],
    queryFn: () =>
      apiFetch(`/api/audit/student-nps?college_id=${encodeURIComponent(collegeId)}&month=${encodeURIComponent(month)}`),
    enabled: !!collegeId
  });

  const summary = data?.summary;
  const coverage = data?.coverage;
  const trend = data?.trend ?? [];
  const months = data?.months ?? [];
  const responses = useMemo(() => data?.responses ?? [], [data]);
  const pagination = usePagination(responses, { pageSize: 25, resetKeys: [collegeId, month] });

  const bandSplit = useMemo(() => {
    if (!summary || summary.total === 0) return null;
    const pct = (n: number) => Math.round((n / summary.total) * 100);
    return [
      { band: "promoter" as NpsBand, count: summary.promoters, pct: pct(summary.promoters) },
      { band: "passive" as NpsBand, count: summary.passives, pct: pct(summary.passives) },
      { band: "detractor" as NpsBand, count: summary.detractors, pct: pct(summary.detractors) }
    ];
  }, [summary]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ThumbsUp}
        title="Student NPS"
      />

      <FilterBar
        aside={
          <span className="text-[11px] font-semibold text-slate-500">
            {activeCollege?.name || "Pick a campus"}
            {data?.scope?.scoped ? ` · ${coverage?.respondents}/${coverage?.enrolled} answered` : ""}
          </span>
        }
      >
        <label htmlFor="student-nps-campus" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Campus
        </label>
        <Select
          id="student-nps-campus"
          className="w-full sm:w-72"
          value={collegeId}
          onChange={(e) => selectCollege(e.target.value)}
        >
          {colleges.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>

        <label htmlFor="student-nps-month" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Month
        </label>
        <Select
          id="student-nps-month"
          className="w-full sm:w-40"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="all">All months</option>
          {months.map(m => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </Select>
      </FilterBar>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200/80 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center space-y-2">
          <p className="text-xs font-bold text-rose-700">
            Could not load student feedback — {(error as any)?.message || "the report service did not answer."}
          </p>
          <button type="button" onClick={() => refetch()} className="text-[11px] font-black text-rose-700 underline cursor-pointer">
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-5 rounded-2xl border-2 shadow-xs text-center ${TONE_CARD[npsTone(summary?.npsIndex)]}`}>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">NPS index</span>
              <div className={`text-4xl font-black mt-1 ${TONE_TEXT[npsTone(summary?.npsIndex)]}`}>
                {formatNps(summary?.npsIndex)}
              </div>
              <span className="text-[10px] font-bold text-slate-500 block mt-1">
                {summary?.npsIndex == null
                  ? "No answers yet"
                  : summary.npsIndex >= 50
                    ? "Excellent advocacy"
                    : summary.npsIndex >= 0
                      ? "Mixed sentiment"
                      : "Needs attention"}
              </span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Avg score</span>
              <div className="text-4xl font-black mt-1 text-slate-900">
                {summary && summary.total > 0 ? summary.avg.toFixed(1) : "—"}
              </div>
              <span className="text-[10px] font-bold text-slate-500 block mt-1">out of 5</span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Responses</span>
              <div className="text-4xl font-black mt-1 text-slate-900">{summary?.total ?? 0}</div>
              <span className="text-[10px] font-bold text-slate-500 block mt-1">
                {month === "all" ? "all months" : monthLabel(month)}
              </span>
            </div>

            <div className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Coverage</span>
              <div className="text-4xl font-black mt-1 text-slate-900">
                {coverage?.ratePct != null ? `${coverage.ratePct}%` : "—"}
              </div>
              <span className="text-[10px] font-bold text-slate-500 block mt-1 flex items-center justify-center gap-1">
                <Users className="h-3 w-3" />
                {coverage?.ratePct != null
                  ? `${coverage.respondents} of ${coverage.enrolled} students`
                  : "No campus roster selected"}
              </span>
            </div>
          </div>

          {bandSplit ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Sentiment split</h3>
                <span className="text-[11px] font-bold text-slate-400">
                  5 promotes · 4 holds · 1–3 detracts (same rule as Mentor NPS)
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                {bandSplit.map(b => (
                  <div
                    key={b.band}
                    title={`${bandLabel(b.band)}: ${b.count}`}
                    className={b.band === "promoter" ? "bg-emerald-500" : b.band === "passive" ? "bg-amber-400" : "bg-rose-500"}
                    style={{ width: `${b.pct}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                {bandSplit.map(b => (
                  <span key={b.band} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${b.band === "promoter" ? "bg-emerald-500" : b.band === "passive" ? "bg-amber-400" : "bg-rose-500"}`}
                    />
                    {bandLabel(b.band)} · {b.count} ({b.pct}%)
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center space-y-1">
              <ThumbsUp className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-400">No student answers for this campus yet.</p>
              <p className="text-[10px] font-semibold text-slate-400">
                Students rate the month from the portal dashboard; the survey is open every month.
              </p>
            </div>
          )}

          {trend.length > 1 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-5 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Month over month
              </h3>
              <div className="space-y-2">
                {trend.map(point => {
                  const tone = npsTone(point.npsIndex);
                  const width = point.npsIndex == null ? 0 : Math.max(4, Math.abs(point.npsIndex));
                  return (
                    <div key={point.month} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-[11px] font-bold text-slate-500">{point.label}</span>
                      <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                        <div className={`h-full ${TONE_BAR[tone]}`} style={{ width: `${Math.min(100, width)}%` }} />
                      </div>
                      <span className={`w-12 shrink-0 text-right text-xs font-black ${TONE_TEXT[tone]}`}>
                        {formatNps(point.npsIndex)}
                      </span>
                      <span className="w-24 shrink-0 text-[10.5px] font-bold text-slate-400">
                        {point.total} answers · {point.avg.toFixed(1)}/5
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {data?.truncated ? (
            <p className="text-[11px] font-bold text-amber-600">
              This campus has more answers than the report reads at once — the numbers cover the most recent 5,000.
            </p>
          ) : null}

          <TableSurface
            footer={
              <Pagination
                currentPage={pagination.page}
                totalItems={responses.length}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
                pageSizeOptions={pagination.pageSizeOptions}
              />
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Month</TableHead>
                <TableHead className="w-16">Class</TableHead>
                <TableHead className="w-32">Faculty Mentor</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="w-36">Group</TableHead>
                <TableHead>Going well</TableHead>
                <TableHead>Should change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-xs font-bold text-slate-400">
                    Nothing logged for this filter yet.
                  </TableCell>
                </TableRow>
              ) : (
                pagination.pageItems.map((row, idx) => (
                  <TableRow key={`${row.student_name}-${row.month_key}-${row.submitted_at}-${idx}`}>
                    <TableCell className="text-[11px] font-bold text-slate-500">
                      {row.month_key ? monthLabel(row.month_key) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.score && row.score >= 4 ? "success" : row.score === 3 ? "warning" : "destructive"}>
                        {row.score ? `${row.score}/5` : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.mentor_score ? (
                        <div className="space-y-0.5">
                          <Badge variant={row.mentor_score >= 4 ? "success" : row.mentor_score === 3 ? "warning" : "destructive"} className="text-[10px]">
                            {row.mentor_score}/5
                          </Badge>
                          {row.mentor_name && (
                            <span className="block text-[10px] font-semibold text-slate-500 truncate max-w-[140px]" title={row.mentor_name}>
                              {row.mentor_name}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-800">{row.student_name}</TableCell>
                    <TableCell className="text-[11px] font-semibold text-slate-500">
                      {[row.department, row.class_group].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="text-[11px] font-semibold text-slate-600 max-w-[240px]">
                      {row.likes ? (
                        <span className="inline-flex items-start gap-1.5">
                          <MessageSquareQuote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                          <span>{row.likes}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] font-semibold text-slate-600 max-w-[240px]">
                      {row.improve ? (
                        <span className="inline-flex items-start gap-1.5">
                          <MessageSquareQuote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
                          <span>{row.improve}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </TableSurface>
        </>
      )}
    </div>
  );
}

export default StudentNpsTab;
