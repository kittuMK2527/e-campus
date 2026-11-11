"use client";

import React, { useState, useMemo } from "react";
import { Clock, Download, Loader2, Search, Copy, Check, X, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { College, Student, useApp } from "@/context/AppContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";

export interface MonitoringTabProps {
  students?: Student[];
  studentAttendance?: any[];
  colleges?: College[];
}

export const MonitoringTab: React.FC<MonitoringTabProps> = ({
  students: propStudents,
  studentAttendance: propStudentAttendance,
  colleges: propColleges
}) => {
  const app = useApp();
  const students = propStudents ?? app.students ?? [];
  const studentAttendance = propStudentAttendance ?? app.studentAttendance ?? [];
  const colleges = propColleges ?? app.colleges ?? [];
  const [attStartDate, setAttStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [attEndDate, setAttEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [attSearch, setAttSearch] = useState("");
  const [attCollegeFilter, setAttCollegeFilter] = useState("all");
  const [attDeptFilter, setAttDeptFilter] = useState("all");
  const [attBatchFilter, setAttBatchFilter] = useState("all");
  const [attSortField, setAttSortField] = useState<"name" | "present" | "absent" | "total" | "pct">("pct");
  const [attSortAsc, setAttSortAsc] = useState(false);
  const [isExportingAtt, setIsExportingAtt] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const attDeptOptions = useMemo(() => {
    const filteredStudents = attCollegeFilter === "all" ? students : students.filter(s => s.college_id === attCollegeFilter);
    return Array.from(new Set(filteredStudents.map(s => s.department).filter(Boolean))) as string[];
  }, [students, attCollegeFilter]);

  const attBatchOptions = useMemo(() => {
    let filteredStudents = attCollegeFilter === "all" ? students : students.filter(s => s.college_id === attCollegeFilter);
    if (attDeptFilter !== "all") {
      filteredStudents = filteredStudents.filter(s => s.department === attDeptFilter);
    }
    return Array.from(new Set(filteredStudents.map(s => s.classGroup).filter(Boolean))) as string[];
  }, [students, attCollegeFilter, attDeptFilter]);

  // Aggregate attendance within the chosen date range
  const attRows = useMemo(() => {
    // Build a Map of college_id → college name ONCE — not inside the per-student .map()
    const collegeMap = new Map<string, string>(
      colleges.map(c => [c.id, c.name])
    );

    // 1. Filter attendance records by date.
    //    The compact wire format uses `dateStr`, not `date`.
    const rangeRecords = (studentAttendance || []).filter((rec: any) => {
      const d = rec.dateStr || rec.date;
      if (!d) return false;
      return d >= attStartDate && d <= attEndDate;
    });

    // 2. Count present/total per studentId (the compact format uses `studentId`)
    const attMap = new Map<string, { present: number; total: number }>();
    for (const rec of rangeRecords) {
      const sid = rec.studentId || rec.student_id;
      if (!sid) continue;
      const cur = attMap.get(sid) || { present: 0, total: 0 };
      cur.total += 1;
      if (rec.status === "present" || rec.status === "Present" || rec.present === 1 || rec.present === true) {
        cur.present += 1;
      }
      attMap.set(sid, cur);
    }

    // 3. Match against students list with filters
    const q = attSearch.toLowerCase().trim();
    let rows = students
      .filter((s: any) => {
        if (attCollegeFilter !== "all" && s.college_id !== attCollegeFilter) return false;
        if (attDeptFilter !== "all" && s.department !== attDeptFilter) return false;
        if (attBatchFilter !== "all" && s.classGroup !== attBatchFilter) return false;
        if (q) {
          const matchName = s.name?.toLowerCase().includes(q);
          const matchRoll = (s.roll_number || s.register_number || "")?.toLowerCase().includes(q);
          if (!matchName && !matchRoll) return false;
        }
        return true;
      })
      .map((student: any) => {
        const stats = attMap.get(student.id) || { present: 0, total: 0 };
        const absent = Math.max(0, stats.total - stats.present);
        const pct = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;
        // O(1) map lookup instead of O(n) colleges.find() per student
        const campusName = collegeMap.get(student.college_id || "") || "Unassigned";
        return {
          student,
          campus: campusName,
          present: stats.present,
          absent,
          total: stats.total,
          pct
        };
      });

    // Sort
    rows.sort((a, b) => {
      let vA: any = a[attSortField as keyof typeof a];
      let vB: any = b[attSortField as keyof typeof b];
      if (attSortField === "name") {
        vA = a.student.name || "";
        vB = b.student.name || "";
      }
      if (vA < vB) return attSortAsc ? -1 : 1;
      if (vA > vB) return attSortAsc ? 1 : -1;
      return 0;
    });

    return rows;
  }, [students, studentAttendance, attStartDate, attEndDate, attCollegeFilter, attDeptFilter, attBatchFilter, attSearch, attSortField, attSortAsc, colleges]);

  const attStats = useMemo(() => {
    const total = attRows.length;
    if (total === 0) return { total: 0, avg: 0, onTrack: 0, atRisk: 0, critical: 0 };
    const sumPct = attRows.reduce((acc, r) => acc + r.pct, 0);
    const avg = Math.round(sumPct / total);
    const onTrack = attRows.filter(r => r.pct >= 75).length;
    const atRisk = attRows.filter(r => r.pct >= 65 && r.pct < 75).length;
    const critical = attRows.filter(r => r.pct < 65).length;
    return { total, avg, onTrack, atRisk, critical };
  }, [attRows]);

  const attToggleSort = (field: typeof attSortField) => {
    if (attSortField === field) {
      setAttSortAsc(!attSortAsc);
    } else {
      setAttSortField(field);
      setAttSortAsc(false);
    }
  };

  const handleExportAttendance = async () => {
    setIsExportingAtt(true);
    try {
      const XLSX = await import("xlsx");
      const data = attRows.map((r, i) => ({
        "S.No": i + 1,
        "Roll No": r.student.roll_number || r.student.register_number || "—",
        "Student Name": r.student.name,
        "Email": r.student.email,
        "Campus": r.campus,
        "Department": r.student.department || "—",
        "Batch": r.student.classGroup || "—",
        "Present Days": r.present,
        "Absent Days": r.absent,
        "Total Scheduled Days": r.total,
        "Attendance %": `${r.pct}%`
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Attendance Summary");
      XLSX.writeFile(wb, `attendance_summary_${attStartDate}_to_${attEndDate}.xlsx`);
    } catch {
      /* export failure */
    } finally {
      setIsExportingAtt(false);
    }
  };

  const pagination = usePagination(attRows, {
    pageSize: 25,
    pageSizeOptions: [25, 50, 100]
  });

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Clock}
        title="Attendance Monitoring Central"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportAttendance}
            disabled={isExportingAtt}
            className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-extrabold"
          >
            {isExportingAtt ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
            <span>{isExportingAtt ? "Exporting…" : "Export Excel"}</span>
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {[
          { label: "Students Tracked", value: attStats.total, cls: "text-zinc-900 dark:text-zinc-100" },
          { label: "Average %", value: `${attStats.avg}%`, cls: "text-amber-500" },
          { label: "On Track (≥75%)", value: attStats.onTrack, cls: "text-emerald-600" },
          { label: "At Risk (65–74%)", value: attStats.atRisk, cls: "text-amber-600" },
          { label: "Critical (<65%)", value: attStats.critical, cls: "text-rose-600" }
        ].map((card) => (
          <div key={card.label} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card">
            <div className={`text-2xl font-black ${card.cls}`}>{card.value}</div>
            <div className="text-xs font-semibold text-slate-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <FilterBar>
        <div className="flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50 px-3 shadow-2xs">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">From:</span>
          <Input
            aria-label="Attendance from date"
            type="date"
            value={attStartDate}
            onChange={(e) => setAttStartDate(e.target.value)}
            className="w-auto border-0 bg-transparent px-0 text-xs font-bold text-slate-800 focus:ring-0 cursor-pointer"
          />
        </div>
        <div className="flex h-9 items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50 px-3 shadow-2xs">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">To:</span>
          <Input
            aria-label="Attendance to date"
            type="date"
            value={attEndDate}
            onChange={(e) => setAttEndDate(e.target.value)}
            className="w-auto border-0 bg-transparent px-0 text-xs font-bold text-slate-800 focus:ring-0 cursor-pointer"
          />
        </div>

        {/* Quick Date Chips */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const to = now.toISOString().split("T")[0];
              const d = new Date();
              d.setDate(d.getDate() - 6);
              setAttStartDate(d.toISOString().split("T")[0]);
              setAttEndDate(to);
            }}
            className="h-8 px-2.5 rounded-xl text-[11px] font-bold border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer transition-all active:scale-95"
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const to = now.toISOString().split("T")[0];
              const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
              setAttStartDate(from);
              setAttEndDate(to);
            }}
            className="h-8 px-2.5 rounded-xl text-[11px] font-bold border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer transition-all active:scale-95"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const to = now.toISOString().split("T")[0];
              const d = new Date();
              d.setDate(d.getDate() - 29);
              setAttStartDate(d.toISOString().split("T")[0]);
              setAttEndDate(to);
            }}
            className="h-8 px-2.5 rounded-xl text-[11px] font-bold border border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer transition-all active:scale-95"
          >
            Last 30 Days
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            aria-label="Search students"
            placeholder="Search name, roll no..."
            value={attSearch}
            onChange={(e) => setAttSearch(e.target.value)}
            className="w-48 pl-8 pr-7"
          />
          {attSearch && (
            <button
              type="button"
              onClick={() => setAttSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              title="Clear search"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select
          aria-label="College filter"
          value={attCollegeFilter}
          onChange={(e) => {
            setAttCollegeFilter(e.target.value);
            setAttDeptFilter("all");
            setAttBatchFilter("all");
          }}
          className="w-auto min-w-[160px] cursor-pointer"
        >
          <option value="all">All Campuses</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Department filter"
          value={attDeptFilter}
          onChange={(e) => {
            setAttDeptFilter(e.target.value);
            setAttBatchFilter("all");
          }}
          className="w-auto min-w-[150px] cursor-pointer"
        >
          <option value="all">All Departments</option>
          {attDeptOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Batch filter"
          value={attBatchFilter}
          onChange={(e) => setAttBatchFilter(e.target.value)}
          className="w-auto min-w-[130px] cursor-pointer"
        >
          <option value="all">All Batches</option>
          {attBatchOptions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
      </FilterBar>

      {/* Data table */}
      {attRows.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card space-y-3">
          <Clock className="h-10 w-10 text-slate-300 mx-auto" />
          <div>
            <p className="text-sm text-slate-800 font-bold">No attendance records found</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Try adjusting your search query, campus, department, or date range.</p>
          </div>
          {(attSearch || attCollegeFilter !== "all" || attDeptFilter !== "all" || attBatchFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setAttSearch("");
                setAttCollegeFilter("all");
                setAttDeptFilter("all");
                setAttBatchFilter("all");
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer transition-all active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <TableSurface
          containerClassName="max-h-[62vh] overflow-y-auto"
          stickyHeader
          footer={
            <Pagination
              currentPage={pagination.page}
              totalItems={attRows.length}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={pagination.pageSizeOptions}
              ariaLabel="Attendance table pagination"
            />
          }
        >
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="cursor-pointer hover:text-indigo-600" onClick={() => attToggleSort("name")}>
                Roll No
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Campus</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead
                className="text-center text-emerald-700 cursor-pointer hover:text-emerald-600"
                onClick={() => attToggleSort("present")}
              >
                Present
              </TableHead>
              <TableHead
                className="text-center text-rose-700 cursor-pointer hover:text-rose-600"
                onClick={() => attToggleSort("absent")}
              >
                Absent
              </TableHead>
              <TableHead
                className="text-center cursor-pointer hover:text-indigo-600"
                onClick={() => attToggleSort("total")}
              >
                Total
              </TableHead>
              <TableHead
                className="text-center text-indigo-700 cursor-pointer hover:text-indigo-600"
                onClick={() => attToggleSort("pct")}
              >
                %
              </TableHead>
              <TableHead className="w-10 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((row, idx) => (
              <TableRow key={row.student.id}>
                <TableCell className="text-gray-400 font-bold">{pagination.startIndex + idx + 1}</TableCell>
                <TableCell className="font-bold whitespace-nowrap">
                  {row.student.roll_number || row.student.register_number || "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full btn-gradient flex items-center justify-center font-extrabold text-white text-[9px] shrink-0">
                      {row.student.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-gray-900 whitespace-nowrap">{row.student.name}</span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{row.campus}</TableCell>
                <TableCell className="whitespace-nowrap">{row.student.department || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{row.student.classGroup || "—"}</TableCell>
                <TableCell className="text-center font-black text-emerald-600">{row.present}</TableCell>
                <TableCell className="text-center font-black text-rose-600">{row.absent}</TableCell>
                <TableCell className="text-center font-bold">{row.total}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={row.pct >= 75 ? "success" : row.pct >= 65 ? "warning" : "destructive"}>
                    {row.pct}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ActionDropdownButton size="sm" title="Student Options" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 text-xs">
                      <DropdownMenuLabel>Student Options</DropdownMenuLabel>
                      {(row.student.roll_number || row.student.register_number) && (
                        <DropdownMenuItem
                          onClick={() =>
                            handleCopy(
                              `roll_${row.student.id}`,
                              (row.student.roll_number || row.student.register_number)!
                            )
                          }
                        >
                          {copiedKey === `roll_${row.student.id}` ? (
                            <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                          )}
                          Copy Roll No
                        </DropdownMenuItem>
                      )}
                      {row.student.email && (
                        <DropdownMenuItem
                          onClick={() => handleCopy(`email_${row.student.id}`, row.student.email)}
                        >
                          {copiedKey === `email_${row.student.id}` ? (
                            <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                          )}
                          Copy Email
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleCopy(`name_${row.student.id}`, row.student.name)}
                      >
                        {copiedKey === `name_${row.student.id}` ? (
                          <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                        )}
                        Copy Name
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </TableSurface>
      )}
    </div>
  );
};
