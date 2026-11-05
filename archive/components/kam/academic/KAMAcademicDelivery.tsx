"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { BookOpen, AlertTriangle, CheckCircle2, Clock, Search, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";

interface SubjectDelivery {
  id: string;
  name: string;
  department: string;
  semester: string;
  collegeName: string;
  weeklyHours: number;
  targetTopics: number;
  completedTopics: number;
  conductedHours: number;
  completionPct: number;
  expectedPct: number;
  gapPct: number;
  status: "On Track" | "Moderate" | "Lagging";
  mentors: string[];
}

interface CampusDelivery {
  id: string;
  name: string;
  code: string;
  totalSubjects: number;
  completedTopicsSum: number;
  targetTopicsSum: number;
  totalConductedHours: number;
  avgCompletionPct: number;
  laggingSubjectsCount: number;
  status: string;
}

export const KAMAcademicDelivery: React.FC<{ selectedCollegeId?: string; kamId?: string }> = ({ selectedCollegeId = "all", kamId }) => {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const params = new URLSearchParams();
  if (selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
  if (kamId) params.set("kamId", kamId);
  const queryString = params.toString();

  const deliveryQuery = useQuery({
    queryKey: qk.kamPanel("academic-delivery", selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/academic-delivery${queryString ? `?${queryString}` : ""}`);
      return json?.success ? json : null;
    },
  });
  const data = deliveryQuery.data ?? null;
  const loading = deliveryQuery.isPending;

  const summary = data?.summary || {
    totalSubjects: 0,
    avgCompletionPct: 0,
    expectedBenchmark: 65,
    onTrackCount: 0,
    laggingCount: 0,
    totalTeachingHours: 0
  };

  const campuses: CampusDelivery[] = data?.campusDelivery || [];
  const subjects: SubjectDelivery[] = data?.subjectDelivery || [];

  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => {
      const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.mentors || []).some(m => m.toLowerCase().includes(search.toLowerCase()));
      const matchesDept = deptFilter === "all" || s.department === deptFilter;
      const matchesStatus = statusFilter === "all" || s.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesDept && matchesStatus;
    });
  }, [subjects, search, deptFilter, statusFilter]);

  const distinctDepts = useMemo(() => {
    return Array.from(new Set(subjects.map(s => s.department).filter(Boolean))).sort();
  }, [subjects]);

  const sortedSubjects = useMemo(() => {
    if (!sortKey) return filteredSubjects;
    return [...filteredSubjects].sort((a, b) => {
      const valA = a[sortKey as keyof SubjectDelivery];
      const valB = b[sortKey as keyof SubjectDelivery];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredSubjects, sortKey, sortDirection]);

  const paginatedSubjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedSubjects.slice(start, start + pageSize);
  }, [sortedSubjects, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── 1. Top Summary Banner with Shadcn Card ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Portfolio Syllabus Pacing</span>
              <BookOpen className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.avgCompletionPct}%</span>
              <span className="text-xs font-bold text-slate-400">/ 65% Target</span>
            </div>
            <p className="text-[10px] font-bold text-emerald-600 mt-1">Across {summary.totalSubjects} curriculum subjects</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Delivery Status</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{summary.onTrackCount}</span>
              <span className="text-xs font-bold text-emerald-600">On Track</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Pacing within calendar schedule</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Lagging Subjects</span>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-700">{summary.laggingCount}</span>
              <span className="text-xs font-bold text-rose-500">Need Attention</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">&gt;10% behind expected syllabus</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Teaching Hours</span>
              <Clock className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.totalTeachingHours}h</span>
              <span className="text-xs font-bold text-indigo-600">Logged</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Conducted lecture & lab hours</p>
          </CardContent>
        </Card>
      </div>

      {/* ── 2. Campus Benchmark Breakdown ── */}
      {selectedCollegeId === "all" && campuses.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">Campus Syllabus Delivery Benchmark</h3>
              <p className="text-xs font-medium text-slate-400">Syllabus coverage progress across partner colleges</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campuses.map(c => (
              <Card key={c.id} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 shadow-none">
                <CardContent className="p-0 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">{c.name}</span>
                    <Badge variant={c.avgCompletionPct >= 65 ? "success" : "warning"} className="text-[10px] font-black">
                      {c.avgCompletionPct}%
                    </Badge>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${c.avgCompletionPct >= 65 ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${c.avgCompletionPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-200/60">
                    <span>{c.totalSubjects} Subjects</span>
                    <span>{c.laggingSubjectsCount > 0 ? `⚠️ ${c.laggingSubjectsCount} Lagging` : "🟢 All On Track"}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Subject-wise Syllabus Delivery Table with Shadcn Table & Pagination ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-900">Subject-by-Subject Syllabus Progress</h3>
            <p className="text-xs text-slate-400 font-medium">Topic coverage, assigned mentors, and pace gap against academic calendar</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search subject or faculty..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none w-48"
              />
            </div>
            <select
              value={deptFilter}
              onChange={e => {
                setDeptFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
            >
              <option value="all">All Departments</option>
              {distinctDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="on track">On Track</option>
              <option value="lagging">Lagging</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">Loading syllabus delivery data...</div>
        ) : filteredSubjects.length === 0 ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">No subjects matching filter criteria.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                  <TableHead onClick={() => handleSort("name")} className="cursor-pointer hover:text-slate-800">
                    <div className="flex items-center gap-1">Subject / Course <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Assigned Faculty</TableHead>
                  <TableHead onClick={() => handleSort("completedTopics")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Topics Delivered <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("completionPct")} className="cursor-pointer hover:text-slate-800">
                    <div className="flex items-center gap-1">Completion % <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("gapPct")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Delivery Gap <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {paginatedSubjects.map(s => (
                  <TableRow key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell>
                      <p className="font-black text-slate-900">{s.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{s.collegeName} • {s.weeklyHours}h/week</p>
                    </TableCell>
                    <TableCell className="font-bold text-slate-700">{s.department}</TableCell>
                    <TableCell className="text-xs text-slate-600 font-bold">
                      {s.mentors.length > 0 ? s.mentors.join(", ") : "Faculty Lead"}
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      <span className="text-indigo-600 font-black">{s.completedTopics}</span> / {s.targetTopics}
                    </TableCell>
                    <TableCell className="w-40">
                      <div className="flex items-center justify-between text-[10px] font-black mb-1">
                        <span>{s.completionPct}%</span>
                        <span className="text-slate-400">Target: {s.expectedPct}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            s.completionPct >= 65 ? "bg-emerald-500" : s.completionPct >= 50 ? "bg-amber-500" : "bg-rose-500"
                          }`}
                          style={{ width: `${s.completionPct}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-black">
                      <span className={s.gapPct >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {s.gapPct >= 0 ? `+${s.gapPct}%` : `${s.gapPct}%`}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={s.status === "On Track" ? "success" : s.status === "Moderate" ? "warning" : "destructive"}
                        className="text-[10px] font-black"
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Standardized Pagination Bar */}
        {sortedSubjects.length > 0 && (
          <div className="pt-2">
            <Pagination
              currentPage={currentPage}
              totalItems={sortedSubjects.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
