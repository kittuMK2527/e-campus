"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { Award, TrendingUp, CheckCircle2, BookOpen, Search, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";

interface DepartmentAverage {
  department: string;
  collegeName: string;
  totalStudents: number;
  avgCiaScore: number;
  avgLabScore: number;
  passRate: number;
  status: "Optimal" | "Moderate" | "Critical";
}

interface AssessmentBreakdown {
  assessmentType: string;
  weightage: string;
  targetAvg: number;
  actualAvg: number;
  compliance: string;
}

export const KAMAssessmentsOversight: React.FC<{
  selectedCollegeId?: string;
  kamId?: string;
}> = ({ selectedCollegeId = "all", kamId }) => {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const params = new URLSearchParams();
  if (selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
  if (kamId) params.set("kamId", kamId);
  const queryString = params.toString();

  const assessmentsQuery = useQuery({
    queryKey: qk.kamPanel("assessments", selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/assessments${queryString ? `?${queryString}` : ""}`);
      return json?.success ? json : null;
    },
  });
  const data = assessmentsQuery.data ?? null;
  const loading = assessmentsQuery.isPending;

  const summary = data?.summary || {
    totalStudents: 0,
    avgCiaScore: 0,
    overallPassRate: 0,
    topDepartment: "—",
    totalExamsRecorded: 0
  };

  const departments: DepartmentAverage[] = useMemo(() => {
    return (data?.departmentAverages || []).filter((d: DepartmentAverage) =>
      search ? d.department.toLowerCase().includes(search.toLowerCase()) || d.collegeName.toLowerCase().includes(search.toLowerCase()) : true
    );
  }, [data?.departmentAverages, search]);

  const breakdowns: AssessmentBreakdown[] = data?.assessmentBreakdown || [];

  const sortedDepartments = useMemo(() => {
    if (!sortKey) return departments;
    return [...departments].sort((a, b) => {
      const valA = a[sortKey as keyof DepartmentAverage];
      const valB = b[sortKey as keyof DepartmentAverage];
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
  }, [departments, sortKey, sortDirection]);

  const paginatedDepartments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDepartments.slice(start, start + pageSize);
  }, [sortedDepartments, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">Regional Assessment & CIA Exam Benchmark</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            Internal assessments, CIA scores, and departmental pass performance across supervised partner institutions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="brand" className="text-xs font-black px-3 py-1.5 rounded-xl">
            Pass Benchmark: ≥50% CIA
          </Badge>
        </div>
      </div>

      {/* Metric Cards with Shadcn Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Overall Pass Rate", value: `${summary.overallPassRate}%`, icon: Award, color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-200/60" },
          { label: "Average CIA Score", value: `${summary.avgCiaScore} / 100`, icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-500/10 border-indigo-200/60" },
          { label: "Top Performing Dept", value: summary.topDepartment, icon: CheckCircle2, color: "text-purple-600", bg: "bg-purple-500/10 border-purple-200/60" },
          { label: "Assessed Students", value: summary.totalStudents, icon: BookOpen, color: "text-amber-600", bg: "bg-amber-500/10 border-amber-200/60" }
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <Card key={idx} className={`p-4 rounded-2xl border ${card.bg} space-y-1.5 shadow-2xs`}>
              <CardContent className="p-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-slate-500">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <p className="text-xl font-black text-slate-900 truncate mt-1">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Assessment Cycle Milestone Breakdown */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-card space-y-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Regional Assessment Cycle Milestones</h3>
          <p className="text-xs font-semibold text-slate-400">Target vs achieved class score averages across internal evaluation phases</p>
        </div>

        {breakdowns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {breakdowns.map((b, idx) => (
              <Card key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 shadow-none">
                <CardContent className="p-0 space-y-2">
                  <div className="flex justify-between items-start">
                    {b.weightage ? (
                      <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        Weight: {b.weightage}
                      </span>
                    ) : <span />}
                    <span className="text-[10px] font-bold text-slate-500">{b.compliance}</span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900 leading-snug">{b.assessmentType}</h4>
                  <div className="flex justify-between text-[11px] font-extrabold pt-2 border-t border-slate-200">
                    <span className="text-slate-500">Achieved: <span className="text-slate-900">{b.actualAvg}%</span></span>
                    <span className="text-slate-400">Target: {b.targetAvg}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${b.actualAvg >= b.targetAvg ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(100, (b.actualAvg / b.targetAvg) * 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200/60 text-slate-400 text-xs font-semibold">
            No formal internal assessment / CIA exam schedules logged yet for this campus selection.
          </div>
        )}
      </div>

      {/* Department Scores Benchmark Table with Shadcn Table & Pagination */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">Departmental Exam & CIA Score Matrix</h3>
            <p className="text-xs font-semibold text-slate-400">Benchmarked performance per department across your institutions</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search department..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 pr-3 py-1.5 border border-slate-200 bg-slate-50 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-[#D528A2] font-semibold w-48"
            />
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50 border-b border-slate-200 font-extrabold text-[9px] uppercase tracking-wider text-slate-600">
                <TableHead onClick={() => handleSort("department")} className="cursor-pointer hover:text-slate-800">
                  <div className="flex items-center gap-1">Department <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead>Campus</TableHead>
                <TableHead onClick={() => handleSort("totalStudents")} className="text-center cursor-pointer hover:text-slate-800">
                  <div className="flex items-center justify-center gap-1">Assessed Batch <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead onClick={() => handleSort("avgCiaScore")} className="text-center cursor-pointer hover:text-slate-800">
                  <div className="flex items-center justify-center gap-1">Avg CIA Marks <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead onClick={() => handleSort("avgLabScore")} className="text-center cursor-pointer hover:text-slate-800">
                  <div className="flex items-center justify-center gap-1">Avg Lab Score <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead onClick={() => handleSort("passRate")} className="text-center cursor-pointer hover:text-slate-800">
                  <div className="flex items-center justify-center gap-1">Pass Rate <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 bg-white">
              {departments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                    {loading ? "Loading assessment score matrix..." : "No department exam records match the active scope."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedDepartments.map((dept, idx) => (
                  <TableRow key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <TableCell className="font-black text-slate-900">{dept.department}</TableCell>
                    <TableCell className="font-semibold text-slate-500">{dept.collegeName}</TableCell>
                    <TableCell className="text-center font-black text-slate-700">{dept.totalStudents} Students</TableCell>
                    <TableCell className="text-center font-black text-indigo-700">{dept.avgCiaScore} / 100</TableCell>
                    <TableCell className="text-center font-black text-purple-700">{dept.avgLabScore} / 100</TableCell>
                    <TableCell className="text-center font-black">
                      <Badge
                        variant={
                          dept.passRate >= 80 ? "success" :
                          dept.passRate >= 65 ? "warning" : "destructive"
                        }
                        className="text-[10px] font-black"
                      >
                        {dept.passRate}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          dept.status === "Optimal" ? "success" :
                          dept.status === "Moderate" ? "warning" : "destructive"
                        }
                        className="text-[10px] font-black uppercase"
                      >
                        {dept.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Standardized Pagination Bar */}
        {sortedDepartments.length > 0 && (
          <div className="pt-2">
            <Pagination
              currentPage={currentPage}
              totalItems={sortedDepartments.length}
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
