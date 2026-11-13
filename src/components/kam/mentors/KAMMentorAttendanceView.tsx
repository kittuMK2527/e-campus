"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, Filter, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { College } from "@/context/AppContext";

interface MentorAttendanceRecord {
  mentorId: string;
  name: string;
  email: string;
  department: string;
  collegeId: string;
  status: string;
  punchInTime: string | null;
  punchOutTime: string | null;
  reason: string | null;
}

interface KAMMentorAttendanceViewProps {
  collegeId: string;
  scopedColleges: College[];
  onCollegeChange?: (collegeId: string) => void;
}

export function KAMMentorAttendanceView({
  collegeId,
  scopedColleges,
  onCollegeChange,
}: KAMMentorAttendanceViewProps) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().split("T")[0]);

  // Target college to query: if "all", use the first scoped college or pass empty
  const activeCampusId = collegeId === "all" ? (scopedColleges[0]?.id || "") : collegeId;

  const { data, isLoading } = useQuery({
    queryKey: ["kam_mentor_attendance", activeCampusId, dateStr],
    queryFn: async () => {
      if (!activeCampusId) return { records: [], summary: null };
      const res = await fetch(`/api/mentor-attendance?collegeId=${encodeURIComponent(activeCampusId)}&dateStr=${encodeURIComponent(dateStr)}`);
      const json = await res.json();
      return json.success ? json : { records: [], summary: null };
    },
    enabled: Boolean(activeCampusId),
    staleTime: 30 * 1000,
  });

  const records: MentorAttendanceRecord[] = data?.records || [];
  const summary = data?.summary || { total: 0, present: 0, od: 0, leave: 0, absent: 0, unpunched: 0 };

  const departments = useMemo(() => {
    return Array.from(new Set(records.map(r => r.department).filter(Boolean))).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || (r.email && r.email.toLowerCase().includes(search.toLowerCase()));
      const matchesDept = deptFilter === "all" || r.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [records, search, deptFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Present":
        return <Badge variant="success">Present</Badge>;
      case "OD":
        return <Badge variant="warning">On Duty (OD)</Badge>;
      case "Leave":
        return <Badge variant="outline" className="text-amber-600 border-amber-300">On Leave</Badge>;
      case "Absent":
        return <Badge variant="destructive">Absent</Badge>;
      case "Half-Day":
        return <Badge variant="outline" className="text-blue-600 border-blue-300">Half-Day</Badge>;
      default:
        return <Badge variant="outline" className="text-slate-400">Not Punched</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Executive Infographics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Faculty</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{summary.total}</div>
          <span className="text-[10px] text-slate-400 font-semibold mt-1 inline-block">Active Roster</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Present & OD</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{summary.present + summary.od}</div>
          <span className="text-[10px] text-emerald-600 font-semibold mt-1 inline-block">
            {summary.total > 0 ? Math.round(((summary.present + summary.od) / summary.total) * 100) : 0}% Attendance
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approved Leave</span>
          <div className="text-2xl font-black text-amber-500 mt-1">{summary.leave}</div>
          <span className="text-[10px] text-amber-500 font-semibold mt-1 inline-block">Authorized Absence</span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Absent / Unpunched</span>
          <div className="text-2xl font-black text-rose-500 mt-1">{summary.absent + summary.unpunched}</div>
          <span className="text-[10px] text-rose-500 font-semibold mt-1 inline-block">Requires Follow-up</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 border border-amber-200/60 dark:border-amber-800/60">
                <Clock className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Faculty Attendance Telemetry
              </h3>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Read-Only Audit
              </span>
            </div>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Daily punch-in logs, punctuality telemetry, and authorized leave status
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter Campus"
              value={collegeId}
              onChange={e => onCollegeChange?.(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
              {scopedColleges.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateStr}
              onChange={e => setDateStr(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none text-slate-700 dark:text-slate-200"
            />
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search mentor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none w-40"
              />
            </div>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs font-semibold">Loading attendance logs…</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-semibold">No attendance records found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="py-3 px-3">Faculty Name</th>
                  <th className="py-3 px-3">Department</th>
                  <th className="py-3 px-3">Punch-In Time</th>
                  <th className="py-3 px-3">Punch-Out Time</th>
                  <th className="py-3 px-3">Remarks / Reason</th>
                  <th className="py-3 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecords.map(r => (
                  <tr key={r.mentorId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {r.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate">{r.name}</span>
                        <span className="block text-[10px] text-slate-400 font-normal truncate">{r.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{r.department || "General"}</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">{r.punchInTime || "—"}</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">{r.punchOutTime || "—"}</td>
                    <td className="py-3 px-3 text-slate-500 text-[11px] italic">{r.reason || "—"}</td>
                    <td className="py-3 px-3 text-right">{getStatusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

