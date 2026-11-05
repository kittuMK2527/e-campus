"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { Code, CheckCircle2, AlertCircle, Clock, Search, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";

export const KAMPracticalSkills: React.FC<{ selectedCollegeId?: string; kamId?: string }> = ({ selectedCollegeId = "all", kamId }) => {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const params = new URLSearchParams();
  if (selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
  if (kamId) params.set("kamId", kamId);
  const queryString = params.toString();

  const skillsQuery = useQuery({
    queryKey: qk.kamPanel("practical-skills", selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/practical-skills${queryString ? `?${queryString}` : ""}`);
      return json?.success ? json : null;
    },
  });
  const data = skillsQuery.data ?? null;
  const loading = skillsQuery.isPending;

  const summary = data?.summary || {
    totalWeeklyTasks: 0,
    totalSubmissions: 0,
    totalVerified: 0,
    totalRework: 0,
    totalPending: 0,
    completionRate: 0,
    verificationThroughput: 0
  };

  const mentorBacklogs: any[] = data?.mentorBacklogs || [];
  const subjectProgress: any[] = data?.subjectProgress || [];

  const filteredMentors = useMemo(() => {
    if (!search.trim()) return mentorBacklogs;
    const q = search.toLowerCase().trim();
    return mentorBacklogs.filter(m =>
      (m.mentorName && m.mentorName.toLowerCase().includes(q)) ||
      (m.department && m.department.toLowerCase().includes(q))
    );
  }, [mentorBacklogs, search]);

  const sortedMentors = useMemo(() => {
    if (!sortKey) return filteredMentors;
    return [...filteredMentors].sort((a, b) => {
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
  }, [filteredMentors, sortKey, sortDirection]);

  const paginatedMentors = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedMentors.slice(start, start + pageSize);
  }, [sortedMentors, currentPage, pageSize]);

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
      {/* ── 1. Top Summary Metric Cards with Shadcn Card ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Code Submissions</span>
              <Code className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.totalSubmissions.toLocaleString()}</span>
              <span className="text-xs font-bold text-slate-400">Repositories</span>
            </div>
            <p className="text-[10px] font-bold text-emerald-600 mt-1">{summary.completionRate}% Portfolio Submission Rate</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Verified & Cleared</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{summary.totalVerified.toLocaleString()}</span>
              <span className="text-xs font-bold text-emerald-600">Passed</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">{summary.verificationThroughput}% Grading Throughput</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Pending Mentor Grading</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700">{summary.totalPending}</span>
              <span className="text-xs font-bold text-amber-600">Submissions</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Awaiting mentor code review</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Rework Required</span>
              <AlertCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-700">{summary.totalRework}</span>
              <span className="text-xs font-bold text-rose-500">Returned</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Returned for code improvements</p>
          </CardContent>
        </Card>
      </div>

      {/* ── 2. Subject-wise Lab Completion Progress ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Technical Skill & Lab Subject Completion</h3>
            <p className="text-xs text-slate-400 font-medium">Progress across core technical domains, practical tasks, and submission rates</p>
          </div>
        </div>

        {subjectProgress.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjectProgress.map((s, idx) => (
              <div key={idx} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800">{s.subject}</span>
                  <Badge variant="brand" className="text-[10px] font-black">
                    {s.completionPct}%
                  </Badge>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all"
                    style={{ width: `${s.completionPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-200/60">
                  <span>{s.submissions} Submissions</span>
                  <span className="text-emerald-600 font-bold">{s.verified} Verified</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200/60 text-slate-400 text-xs font-semibold">
            No active practical lab courses recorded for this selection.
          </div>
        )}
      </div>

      {/* ── 3. Mentor Grading Backlog & Turnaround with Shadcn Table & Pagination ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-black text-slate-900">Mentor Lab Grading Turnaround & Backlog</h3>
            <p className="text-xs text-slate-400 font-medium">Tracking mentor code review velocity and outstanding unverified submissions</p>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search mentor or dept..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none w-48"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">Loading mentor turnaround data...</div>
        ) : filteredMentors.length === 0 ? (
          <div className="py-12 text-center text-xs font-bold text-slate-400">No active mentor backlogs recorded.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                  <TableHead onClick={() => handleSort("mentorName")} className="cursor-pointer hover:text-slate-800">
                    <div className="flex items-center gap-1">Faculty / Mentor <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead onClick={() => handleSort("tasksCreated")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Tasks Created <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("assignedSubmissions")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Assigned Submissions <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("verifiedSubmissions")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Verified <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("pendingBacklog")} className="text-center cursor-pointer hover:text-slate-800">
                    <div className="flex items-center justify-center gap-1">Pending Backlog <ArrowUpDown className="h-3 w-3" /></div>
                  </TableHead>
                  <TableHead className="text-center">Review Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {paginatedMentors.map(m => (
                  <TableRow key={m.mentorId} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell className="font-black text-slate-900">{m.mentorName}</TableCell>
                    <TableCell className="font-bold text-slate-600">{m.department}</TableCell>
                    <TableCell className="text-center font-bold">{m.tasksCreated}</TableCell>
                    <TableCell className="text-center font-bold">{m.assignedSubmissions}</TableCell>
                    <TableCell className="text-center font-black text-emerald-600">{m.verifiedSubmissions}</TableCell>
                    <TableCell className="text-center font-black">
                      <span className={m.pendingBacklog > 10 ? "text-rose-600" : m.pendingBacklog > 0 ? "text-amber-600" : "text-emerald-600"}>
                        {m.pendingBacklog}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          m.turnaroundStatus === "Optimal"
                            ? "success"
                            : m.turnaroundStatus === "Moderate Delay"
                            ? "warning"
                            : "destructive"
                        }
                        className="text-[10px] font-black"
                      >
                        {m.turnaroundStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Standardized Pagination Bar */}
        {sortedMentors.length > 0 && (
          <div className="pt-2">
            <Pagination
              currentPage={currentPage}
              totalItems={sortedMentors.length}
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
