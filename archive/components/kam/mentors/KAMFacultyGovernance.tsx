"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { UserCheck, Calendar, Award, Search, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const KAMFacultyGovernance: React.FC<{
  initialSubTab?: "punch" | "leaves" | "demos";
  selectedCollegeId?: string;
  kamId?: string;
  onOpenMentor360?: (mentorId: string) => void;
}> = ({ initialSubTab = "punch", selectedCollegeId = "all", kamId, onOpenMentor360 }) => {
  const [subTab, setSubTab] = useState<"punch" | "leaves" | "demos">(initialSubTab);
  const [search, setSearch] = useState("");

  // Pagination states
  const [punchPage, setPunchPage] = useState(1);
  const [punchPageSize, setPunchPageSize] = useState(15);
  const [punchSortKey, setPunchSortKey] = useState<string | null>(null);
  const [punchSortDirection, setPunchSortDirection] = useState<"asc" | "desc">("asc");

  const [leavePage, setLeavePage] = useState(1);
  const [leavePageSize, setLeavePageSize] = useState(10);

  const [demoPage, setDemoPage] = useState(1);
  const [demoPageSize, setDemoPageSize] = useState(10);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    setPunchPage(1);
  }, [search, selectedCollegeId]);

  const params = new URLSearchParams();
  if (selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
  if (kamId) params.set("kamId", kamId);
  const queryString = params.toString();

  const governanceQuery = useQuery({
    queryKey: qk.kamPanel("faculty-governance", selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/faculty-governance${queryString ? `?${queryString}` : ""}`);
      return json?.success ? json : null;
    },
  });
  const data = governanceQuery.data ?? null;
  const loading = governanceQuery.isPending;

  const punchSummary = data?.punchSummary || {
    totalFaculty: 0,
    presentToday: 0,
    odToday: 0,
    leaveToday: 0,
    latePunchesToday: 0,
    missingPunchesToday: 0,
    punchRatePct: 0
  };

  const mentorPunchRoster: any[] = data?.mentorPunchRoster || [];
  const upcomingLeaves: any[] = data?.upcomingLeaves || [];
  const demoSummary = data?.demoSummary || { totalDemos: 0, completedDemos: 0, avgDemoScore: 0 };
  const demoRoster: any[] = data?.demoRoster || [];

  const filteredPunchRoster = useMemo(() => {
    return mentorPunchRoster.filter(m =>
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.department.toLowerCase().includes(search.toLowerCase())
    );
  }, [mentorPunchRoster, search]);

  const sortedPunchRoster = useMemo(() => {
    if (!punchSortKey) return filteredPunchRoster;
    return [...filteredPunchRoster].sort((a, b) => {
      const valA = a[punchSortKey];
      const valB = b[punchSortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return punchSortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredPunchRoster, punchSortKey, punchSortDirection]);

  const paginatedPunchRoster = useMemo(() => {
    const start = (punchPage - 1) * punchPageSize;
    return sortedPunchRoster.slice(start, start + punchPageSize);
  }, [sortedPunchRoster, punchPage, punchPageSize]);

  const paginatedLeaves = useMemo(() => {
    const start = (leavePage - 1) * leavePageSize;
    return upcomingLeaves.slice(start, start + leavePageSize);
  }, [upcomingLeaves, leavePage, leavePageSize]);

  const paginatedDemos = useMemo(() => {
    const start = (demoPage - 1) * demoPageSize;
    return demoRoster.slice(start, start + demoPageSize);
  }, [demoRoster, demoPage, demoPageSize]);

  const handlePunchSort = (key: string) => {
    if (punchSortKey === key) {
      setPunchSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setPunchSortKey(key);
      setPunchSortDirection("asc");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { key: "punch", label: "Faculty Daily Punch & Biometrics", icon: UserCheck },
          { key: "leaves", label: "14-Day Leave & Coverage Radar", icon: Calendar },
          { key: "demos", label: "SME Demo Teaching Quality", icon: Award }
        ].map(t => {
          const Icon = t.icon;
          const isActive = subTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── SUB-TAB 1: FACULTY PUNCH IN & BIOMETRICS ── */}
      {subTab === "punch" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Faculty Presence Today</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">{punchSummary.punchRatePct}%</span>
                  <span className="text-xs font-bold text-emerald-600">On Campus</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-1">{punchSummary.presentToday + punchSummary.odToday} / {punchSummary.totalFaculty} Active Mentors</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Late Punches Today</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-amber-700">{punchSummary.latePunchesToday}</span>
                  <span className="text-xs font-bold text-amber-600">&gt;30m Window</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Requires CM late justification</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Faculty On Leave / OD</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-indigo-700">{punchSummary.leaveToday + punchSummary.odToday}</span>
                  <span className="text-xs font-bold text-indigo-600">Instructors</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-1">{punchSummary.odToday} OD • {punchSummary.leaveToday} Approved Leave</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Missing / Unmarked</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-rose-700">{punchSummary.missingPunchesToday}</span>
                  <span className="text-xs font-bold text-rose-500">Unpunched</span>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Unaccounted session absence</p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900">Faculty Daily Punch Log & Punctuality</h3>
                <p className="text-xs text-slate-400 font-medium">Real-time daily check-in timestamps and punctuality status across institutions</p>
              </div>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search faculty name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none w-56"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                    <TableHead onClick={() => handlePunchSort("name")} className="cursor-pointer hover:text-slate-800">
                      <div className="flex items-center gap-1">Faculty Name <ArrowUpDown className="h-3 w-3" /></div>
                    </TableHead>
                    <TableHead>Department & Campus</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Punch In Time</TableHead>
                    <TableHead className="text-center">Punctuality</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                        Loading punch records...
                      </TableCell>
                    </TableRow>
                  ) : sortedPunchRoster.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-slate-400 font-bold">
                        No faculty punch records match the active search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedPunchRoster.map(m => (
                      <TableRow key={m.id} className="hover:bg-slate-50/60 transition-colors">
                        <TableCell>
                          <p className="font-black text-slate-900">{m.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{m.email}</p>
                        </TableCell>
                        <TableCell>
                          <p className="font-bold text-slate-700">{m.department}</p>
                          <p className="text-[10px] text-slate-400">{m.collegeName}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              m.status.toLowerCase() === "present"
                                ? "success"
                                : m.status.toLowerCase() === "od"
                                ? "brand"
                                : m.status.toLowerCase() === "leave"
                                ? "warning"
                                : "destructive"
                            }
                            className="text-[10px] font-black uppercase"
                          >
                            {m.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold text-slate-800">
                          {m.punchTime}
                        </TableCell>
                        <TableCell className="text-center">
                          {m.isLate ? (
                            <Badge variant="warning" className="text-[10px] font-black">
                              ⚠️ Late Punch
                            </Badge>
                          ) : m.status.toLowerCase() === "present" ? (
                            <Badge variant="success" className="text-[10px] font-black">
                              🟢 On Time
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-[10px]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenMentor360 && onOpenMentor360(m.id)}
                            className="text-indigo-700 hover:bg-indigo-100 text-[10px] font-bold h-7 px-2.5"
                          >
                            Mentor 360°
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination for Punch Roster */}
            {sortedPunchRoster.length > 0 && (
              <div className="pt-2">
                <Pagination
                  currentPage={punchPage}
                  totalItems={sortedPunchRoster.length}
                  pageSize={punchPageSize}
                  onPageChange={setPunchPage}
                  onPageSizeChange={(newSize) => {
                    setPunchPageSize(newSize);
                    setPunchPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SUB-TAB 2: 14-DAY UPCOMING LEAVE & COVERAGE RADAR ── */}
      {subTab === "leaves" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900">Upcoming 14-Day Faculty Leave Schedule & Substitution Coverage</h3>
            <p className="text-xs text-slate-400 font-medium">Preventing unstaffed classroom blackouts by tracking coverage assignments</p>
          </div>

          {upcomingLeaves.length === 0 ? (
            <div className="py-12 text-center text-xs font-bold text-slate-400">No scheduled upcoming leaves for the next 14 days.</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                      <TableHead>Faculty Member</TableHead>
                      <TableHead>Campus & Dept</TableHead>
                      <TableHead>Leave Dates</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-center">Coverage Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {paginatedLeaves.map(lr => (
                      <TableRow key={lr.id} className="hover:bg-slate-50/60 transition-colors">
                        <TableCell className="font-black text-slate-900">{lr.mentorName}</TableCell>
                        <TableCell>
                          <p className="font-bold text-slate-700">{lr.department}</p>
                          <p className="text-[10px] text-slate-400">{lr.collegeName}</p>
                        </TableCell>
                        <TableCell className="font-bold text-indigo-600">
                          {lr.startDate} → {lr.endDate}
                        </TableCell>
                        <TableCell className="font-bold text-slate-700">{lr.leaveCategory}</TableCell>
                        <TableCell className="text-slate-500 text-[11px] max-w-xs truncate">{lr.reason}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={lr.coverageStatus.includes("Covered") ? "success" : "destructive"}
                            className="text-[10px] font-black"
                          >
                            {lr.coverageStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination for Leaves */}
              {upcomingLeaves.length > 0 && (
                <div className="pt-2">
                  <Pagination
                    currentPage={leavePage}
                    totalItems={upcomingLeaves.length}
                    pageSize={leavePageSize}
                    onPageChange={setLeavePage}
                    onPageSizeChange={(newSize) => {
                      setLeavePageSize(newSize);
                      setLeavePage(1);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SUB-TAB 3: SME DEMO TEACHING QUALITY ── */}
      {subTab === "demos" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Demo Sessions</span>
                <p className="text-2xl font-black text-slate-900 mt-2">{demoSummary.totalDemos}</p>
                <p className="text-[10px] font-bold text-indigo-600 mt-1">Conducted by Subject Matter Experts</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Completed Evaluations</span>
                <p className="text-2xl font-black text-emerald-700 mt-2">{demoSummary.completedDemos}</p>
                <p className="text-[10px] font-bold text-emerald-600 mt-1">Evaluated with structured rubrics</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 shadow-xs">
              <CardContent className="p-4">
                <span className="text-[10px] font-black uppercase text-slate-400">Average Quality Benchmark</span>
                <p className="text-2xl font-black text-indigo-700 mt-2">{demoSummary.avgDemoScore} / 100</p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Regional faculty quality index</p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">SME Teaching Evaluation Feed</h3>
              <p className="text-xs text-slate-400 font-medium">Recent instructor teaching demonstrations and SME assessment feedback</p>
            </div>

            <div className="space-y-3">
              {demoRoster.length === 0 ? (
                <div className="py-8 text-center text-xs font-bold text-slate-400">No demo teaching records found.</div>
              ) : (
                paginatedDemos.map(d => (
                  <div key={d.id} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 flex items-start justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">{d.mentorName}</span>
                        <span className="text-[10px] text-slate-400">• Subject: {d.subject}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 italic">"{d.comments}"</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1">Evaluator: {d.smeName} • {d.dateStr} {d.timeSlot}</p>
                    </div>
                    <Badge variant="brand" className="text-xs font-black shrink-0 px-2.5 py-1">
                      {d.marks} / 100
                    </Badge>
                  </div>
                ))
              )}
            </div>

            {/* Pagination for Demos */}
            {demoRoster.length > 0 && (
              <div className="pt-2">
                <Pagination
                  currentPage={demoPage}
                  totalItems={demoRoster.length}
                  pageSize={demoPageSize}
                  onPageChange={setDemoPage}
                  onPageSizeChange={(newSize) => {
                    setDemoPageSize(newSize);
                    setDemoPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
