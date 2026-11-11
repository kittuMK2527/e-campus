"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { Search, User, Eye, ArrowUpDown, Building2, FileSpreadsheet, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Student360 } from "./Student360";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StudentDirectoryProps {
  initialCollegeId?: string;
  initialDepartment?: string;
  initialClassGroup?: string;
  initialRiskFilter?: string;
  kamId?: string;
}

export const StudentDirectory: React.FC<StudentDirectoryProps> = ({
  initialCollegeId,
  initialDepartment,
  initialClassGroup,
  initialRiskFilter,
  kamId
}) => {
  const { colleges: rawColleges, currentKAM } = useApp ? useApp() : { colleges: [], currentKAM: null };
  const effectiveKamId = kamId || currentKAM?.id;
  const colleges = effectiveKamId ? rawColleges.filter((c: any) => c.kam_id === effectiveKamId || (c as any).kamId === effectiveKamId) : rawColleges;
  const [selectedCollegeId, setSelectedCollegeId] = useState(initialCollegeId || "all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState(initialRiskFilter || "all");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCollegeId, riskFilter]);

  const params = new URLSearchParams();
  if (selectedCollegeId && selectedCollegeId !== "all") params.append("collegeId", selectedCollegeId);
  if (effectiveKamId) params.append("kamId", effectiveKamId);
  if (initialDepartment && initialDepartment !== "all") params.append("department", initialDepartment);
  if (initialClassGroup && initialClassGroup !== "all") params.append("classGroup", initialClassGroup);
  if (riskFilter !== "all") params.append("risk", riskFilter);
  if (debouncedSearch) params.append("q", debouncedSearch);
  params.append("limit", "500");
  const queryString = params.toString();

  const studentsQuery = useQuery<{ students: any[]; distribution: any }>({
    queryKey: qk.kamStudents(selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/students?${queryString}`);
      return {
        students: json?.success ? (json.students || []) : [],
        distribution: json?.success ? (json.distribution || { healthy: 0, atRisk: 0, critical: 0, total: 0 }) : { healthy: 0, atRisk: 0, critical: 0, total: 0 }
      };
    },
    placeholderData: (prev) => prev
  });
  const students = studentsQuery.data?.students || [];
  const distribution = studentsQuery.data?.distribution || { healthy: 0, atRisk: 0, critical: 0, total: 0 };
  const loading = studentsQuery.isPending;

  // Sorting logic
  const sortedStudents = useMemo(() => {
    if (!sortKey) return students;
    return [...students].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
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
  }, [students, sortKey, sortDirection]);

  // Paginated slice
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedStudents.slice(start, start + pageSize);
  }, [sortedStudents, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const handleExportStudents = async () => {
    try {
      const XLSX = await import("xlsx");
      const headers = [
        "Sl. No.",
        "Roll No",
        "Register No",
        "Student Name",
        "Email",
        "Phone",
        "Institution",
        "Department",
        "Batch / Cohort",
        "Total Conducted Periods",
        "Present Periods",
        "Absent Periods",
        "OD Periods",
        "Attendance %",
        "Risk Tier"
      ];

      const rows = sortedStudents.map((st, idx) => [
        idx + 1,
        st.rollNumber || st.id,
        st.registerNumber || "—",
        st.name,
        st.email || "—",
        st.phone || "—",
        st.collegeName || "—",
        st.department || "General",
        st.classGroup || "General Batch",
        st.totalMarks || 0,
        st.presentMarks || 0,
        st.absentMarks || 0,
        st.odMarks || 0,
        st.attendancePct >= 0 ? `${st.attendancePct}%` : "No Data",
        st.risk.toUpperCase()
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Students Directory");
      XLSX.writeFile(wb, `Student_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      console.error("Export failed:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Risk Filter Chips & College Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Embedded College Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-2xl border border-slate-200">
            <Building2 className="h-3.5 w-3.5 text-amber-500" />
            <select
              value={selectedCollegeId}
              onChange={e => setSelectedCollegeId(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
            >
              <option value="all">🏢 All Campuses ({colleges.length})</option>
              {colleges.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:block w-px h-6 bg-slate-200" />

          <span className="text-xs font-black uppercase tracking-wider text-slate-400 mr-1">Risk:</span>
          {[
            { key: "all", label: "All Students", count: distribution.total, color: "bg-slate-100 text-slate-700" },
            { key: "healthy", label: "Healthy (≥75%)", count: distribution.healthy, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { key: "at_risk", label: "At Risk (60-74%)", count: distribution.atRisk, color: "bg-amber-50 text-amber-700 border-amber-200" },
            { key: "critical", label: "Critical (<60%)", count: distribution.critical, color: "bg-rose-50 text-rose-700 border-rose-200" }
          ].map(r => {
            const isActive = riskFilter === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setRiskFilter(r.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                  isActive
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                    : `${r.color} hover:opacity-80`
                }`}
              >
                {r.label} ({r.count || 0})
              </button>
            );
          })}
        </div>

        {/* Search & Export Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name, roll no, reg no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs font-semibold bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportStudents}
            disabled={students.length === 0}
            className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-extrabold"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 mr-1" />
            <span className="hidden sm:inline">Export Excel</span>
          </Button>
        </div>
      </div>

      {/* Students Table with Shadcn Table & Pagination */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                <TableHead onClick={() => handleSort("name")} className="cursor-pointer hover:text-slate-800">
                  <div className="flex items-center gap-1">Student <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead onClick={() => handleSort("rollNumber")} className="cursor-pointer hover:text-slate-800">
                  <div className="flex items-center gap-1">Roll / Reg No <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead>Campus & Dept</TableHead>
                <TableHead>Batch / Cohort</TableHead>
                <TableHead onClick={() => handleSort("totalMarks")} className="text-center cursor-pointer hover:text-slate-800">
                  <div className="flex items-center justify-center gap-1">Marks Logged <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead onClick={() => handleSort("attendancePct")} className="text-center cursor-pointer hover:text-slate-800">
                  <div className="flex items-center justify-center gap-1">Attendance % <ArrowUpDown className="h-3 w-3" /></div>
                </TableHead>
                <TableHead className="text-center">Risk Status</TableHead>
                <TableHead className="text-right">360° Profile</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading student directory…
                  </TableCell>
                </TableRow>
              ) : sortedStudents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    No students match the selected filters or search query.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedStudents.map(st => (
                  <TableRow
                    key={st.id}
                    onClick={() => setSelectedStudentId(st.id)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          <User className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {st.name}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">{st.email || "No email"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px] font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                        {st.rollNumber}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-bold text-slate-800 line-clamp-1">{st.collegeName}</p>
                      <p className="text-[10px] text-slate-400">{st.department}</p>
                    </TableCell>
                    <TableCell className="text-slate-600 text-[11px]">
                      {st.classGroup}
                    </TableCell>
                    <TableCell className="text-center font-bold text-slate-800">
                      {st.totalMarks}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-black text-xs ${
                        st.attendancePct >= 75
                          ? "text-emerald-600"
                          : st.attendancePct >= 60
                          ? "text-amber-600"
                          : "text-rose-600"
                      }`}>
                        {st.attendancePct >= 0 ? `${st.attendancePct}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          st.risk === "healthy"
                            ? "success"
                            : st.risk === "at_risk"
                            ? "warning"
                            : st.risk === "critical"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[10px] uppercase font-black"
                      >
                        {st.risk.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStudentId(st.id);
                        }}
                        className="h-7 w-7 text-indigo-600 hover:bg-indigo-600 hover:text-white"
                        title="View Student 360"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Standardized Pagination Bar */}
        {sortedStudents.length > 0 && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50">
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

      {/* Student 360 Modal */}
      {selectedStudentId && (
        <Student360
          studentId={selectedStudentId}
          collegeId={students.find(s => s.id === selectedStudentId)?.college_id || (selectedCollegeId !== "all" ? selectedCollegeId : undefined)}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
};
