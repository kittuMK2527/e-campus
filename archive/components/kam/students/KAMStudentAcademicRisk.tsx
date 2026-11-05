"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { AlertTriangle, TrendingUp, Search, ArrowUpRight, GraduationCap, ShieldAlert, Award, ArrowUpDown } from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface StudentAcademicRecord {
  id: string;
  name: string;
  rollNumber: string;
  registerNumber: string;
  department: string;
  classGroup: string;
  collegeName: string;
  attendancePct: number;
  examAvgPct: number;
  labTasksSubmitted: number;
  labTaskAvgScore: number;
  interviewScore: number;
  hireScore: number;
  efsetScore: string;
  compositeScore: number;
  riskTier: "HIGH" | "MEDIUM" | "LOW";
}

export const KAMStudentAcademicRisk: React.FC<{
  selectedCollegeId?: string;
  kamId?: string;
  onOpenStudent360?: (studentId: string) => void;
}> = ({ selectedCollegeId = "all", kamId, onOpenStudent360 }) => {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    setCurrentPage(1);
  }, [search, riskFilter, deptFilter, selectedCollegeId]);

  const params = new URLSearchParams();
  if (selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
  if (kamId) params.set("kamId", kamId);
  const queryString = params.toString();

  const riskQuery = useQuery({
    queryKey: qk.kamPanel("student-performance", selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/student-performance${queryString ? `?${queryString}` : ""}`);
      return json?.success ? json : null;
    },
  });
  const data = riskQuery.data ?? null;
  const loading = riskQuery.isPending;

  const summary = data?.summary || {
    totalStudents: 0,
    highRiskCount: 0,
    mediumRiskCount: 0,
    lowRiskCount: 0,
    avgAcademicScore: 0
  };

  const students: StudentAcademicRecord[] = data?.students || [];

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.rollNumber.toLowerCase().includes(search.toLowerCase());
      const matchesRisk = riskFilter === "all" || s.riskTier.toLowerCase() === riskFilter.toLowerCase();
      const matchesDept = deptFilter === "all" || s.department === deptFilter;
      return matchesSearch && matchesRisk && matchesDept;
    });
  }, [students, search, riskFilter, deptFilter]);

  const distinctDepts = useMemo(() => {
    return Array.from(new Set(students.map(s => s.department).filter(Boolean))).sort();
  }, [students]);

  // Sorting
  const sortedStudents = useMemo(() => {
    if (!sortKey) return filteredStudents;
    return [...filteredStudents].sort((a, b) => {
      const valA = a[sortKey as keyof StudentAcademicRecord];
      const valB = b[sortKey as keyof StudentAcademicRecord];
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
  }, [filteredStudents, sortKey, sortDirection]);

  // Paginated slice
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedStudents.slice(start, start + pageSize);
  }, [sortedStudents, currentPage, pageSize]);

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
      {/* ── 1. Top Metric Cards with Shadcn Card ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Evaluated Pool</span>
              <GraduationCap className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.totalStudents}</span>
              <span className="text-xs font-bold text-slate-400">Students</span>
            </div>
            <p className="text-[10px] font-bold text-indigo-600 mt-1">Portfolio Academic Benchmark: {summary.avgAcademicScore}/100</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Critical Academic Risk</span>
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-700">{summary.highRiskCount}</span>
              <span className="text-xs font-bold text-rose-500">Immediate SLA</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Failing in exams, labs or attendance</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Moderate Risk</span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700">{summary.mediumRiskCount}</span>
              <span className="text-xs font-bold text-amber-600">Needs Followup</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Cautionary composite score</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Healthy & On Track</span>
              <Award className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{summary.lowRiskCount}</span>
              <span className="text-xs font-bold text-emerald-600">Top Quartile</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Optimal across all vectors</p>
          </CardContent>
        </Card>
      </div>

      {/* ── 2. Composite Academic Risk Matrix Table with Shadcn Table & Pagination ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-900">Holistic Student Academic Risk Matrix</h3>
            <p className="text-xs text-slate-400 font-medium">Cross-referencing Attendance + Exam Marks + Lab Tasks + Interview Score + HireScore</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search student or roll no..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none w-48"
              />
            </div>
            <select
              value={riskFilter}
              onChange={e => setRiskFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">🔴 High Risk</option>
              <option value="medium">🟡 Medium Risk</option>
              <option value="low">🟢 Low Risk</option>
            </select>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none"
            >
              <option value="all">All Departments</option>
              {distinctDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">Loading student academic risk matrix...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">No students found matching criteria.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                  <TableHead onClick={() => handleSort("name")} className="cursor-pointer hover:text-slate-800">
                    <div className="flex items-center gap-1">Student Name <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Department & Batch</TableHead>
                  <TableHead onClick={() => handleSort("attendancePct")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Attendance <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("examAvgPct")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">CIA / Exams <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("labTaskAvgScore")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Lab Tasks <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("interviewScore")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Mock Interview <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("hireScore")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">HireScore <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("compositeScore")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Composite Score <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-center">Risk Tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {paginatedStudents.map(s => (
                  <TableRow key={s.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => onOpenStudent360 && onOpenStudent360(s.id)}
                        className="text-left font-black text-slate-900 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{s.name}</span>
                        <ArrowUpRight className="h-3 w-3 text-slate-400" />
                      </button>
                      <p className="text-[10px] text-slate-400 font-medium">{s.rollNumber} • {s.collegeName}</p>
                    </TableCell>
                    <TableCell className="font-bold text-slate-700">
                      <p>{s.department}</p>
                      <p className="text-[10px] text-slate-400">{s.classGroup}</p>
                    </TableCell>
                    <TableCell className="text-center font-black">
                      <span className={s.attendancePct >= 75 ? "text-emerald-600" : s.attendancePct >= 65 ? "text-amber-600" : "text-rose-600"}>
                        {s.attendancePct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-black">
                      <span className={s.examAvgPct >= 60 ? "text-slate-800" : "text-rose-600"}>
                        {s.examAvgPct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      <span className="text-indigo-600 font-black">{s.labTaskAvgScore}</span> / 100
                    </TableCell>
                    <TableCell className="text-center font-bold">
                      <span className="text-indigo-600 font-black">{s.interviewScore}</span> / 100
                    </TableCell>
                    <TableCell className="text-center font-black text-slate-800">
                      {s.hireScore}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-black text-slate-900 text-xs px-2 py-0.5 rounded-lg bg-slate-100">
                        {s.compositeScore} / 100
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          s.riskTier === "HIGH"
                            ? "destructive"
                            : s.riskTier === "MEDIUM"
                            ? "warning"
                            : "success"
                        }
                        className="text-[10px] font-black uppercase"
                      >
                        {s.riskTier} RISK
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Standardized Pagination Bar */}
        {sortedStudents.length > 0 && (
          <div className="pt-2">
            <Pagination
              currentPage={currentPage}
              totalItems={sortedStudents.length}
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
