"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { Dialog } from "@/components/ui/dialog";
import {
  X,
  User,
  GraduationCap,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Award,
  Layers,
  Sparkles,
  TrendingUp,
  FileSpreadsheet,
  Building2,
  ArrowRightLeft,
  ChevronRight
} from "lucide-react";

interface Mentor360Props {
  mentorId: string;
  onClose: () => void;
}

export const Mentor360: React.FC<Mentor360Props> = ({ mentorId, onClose }) => {
  const [activeTab, setActiveTab] = useState<"schedule" | "courses" | "demos" | "handovers">("schedule");
  const [selectedDay, setSelectedDay] = useState<string>("Monday");

  const mentorQuery = useQuery({
    queryKey: qk.kamMentorProgress(mentorId),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/mentors/${encodeURIComponent(mentorId)}/progress`);
      if (!json?.success) throw new Error(json?.message || "Failed to load faculty member details");
      return json;
    },
  });
  const data = mentorQuery.data ?? null;
  const loading = mentorQuery.isPending;
  const error = mentorQuery.error ? (mentorQuery.error as Error).message : null;

  // Close on Escape Key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Export Faculty 360° Dossier to Excel
  const handleExportExcel = async () => {
    if (!data) return;
    try {
      const XLSX = await import("xlsx");
      const { mentor, slots, coursesHandled, demoSessions, handoversSent, handoversReceived } = data;
      const stats = mentor.stats;

      const wb = XLSX.utils.book_new();

      // Sheet 1: Faculty Overview & Workload
      const overviewHeaders = ["Field", "Value"];
      const overviewRows = [
        ["Faculty Name", mentor.name],
        ["Email", mentor.email],
        ["Department", mentor.department || "General"],
        ["Institution", mentor.collegeName || "Institution"],
        ["Faculty Classification", mentor.mentorGroup || "General Faculty"],
        ["Weekly Assigned Hours", `${stats.totalWeeklyHours} hrs / ${stats.targetCapacity} hrs target`],
        ["Capacity Load %", `${stats.capacityPct}%`],
        ["Workload Status", stats.workloadStatus],
        ["Distinct Courses Handled", stats.uniqueCoursesCount],
        ["SME Certified Demo Count", stats.demoCertificationsCount],
        ["Total Handovers Requested", stats.totalHandoversSent],
        ["Total Handovers Received", stats.totalHandoversReceived]
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet([overviewHeaders, ...overviewRows]);
      wsOverview["!cols"] = [{ wch: 28 }, { wch: 45 }];
      XLSX.utils.book_append_sheet(wb, wsOverview, "Faculty Profile");

      // Sheet 2: Weekly Timetable Schedule
      const scheduleHeaders = ["Day", "Time Slot", "Course Name", "Batch / Class Group", "Room Location", "Institution"];
      const scheduleRows = (slots || []).map((s: any) => [
        s.day,
        s.time,
        s.course,
        s.classGroup || "General Batch",
        s.location || "Default",
        s.college_name || mentor.collegeName
      ]);
      const wsSchedule = XLSX.utils.aoa_to_sheet([scheduleHeaders, ...scheduleRows]);
      wsSchedule["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 32 }, { wch: 24 }, { wch: 16 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, wsSchedule, "Weekly Timetable");

      // Sheet 3: Courses Handled
      const courseHeaders = ["Course Title", "Weekly Assigned Hours", "Batches Covered", "Teaching Days"];
      const courseRows = (coursesHandled || []).map((c: any) => [
        c.course,
        c.weeklyHours,
        (c.classGroups || []).join(", "),
        (c.days || []).join(", ")
      ]);
      const wsCourses = XLSX.utils.aoa_to_sheet([courseHeaders, ...courseRows]);
      wsCourses["!cols"] = [{ wch: 32 }, { wch: 22 }, { wch: 35 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsCourses, "Courses Handled");

      // Sheet 4: SME Demo Evaluations
      if (demoSessions && demoSessions.length > 0) {
        const demoHeaders = ["Date", "Subject Demo", "SME Evaluator", "Score / Marks", "Status", "Feedback Comments"];
        const demoRows = demoSessions.map((d: any) => [
          d.dateStr || "—",
          d.subject || "Domain Demo",
          d.sme_name || "SME Evaluator",
          d.marks !== undefined && d.marks !== null ? `${d.marks}/100` : "Pending",
          d.status?.toUpperCase() || "SCHEDULED",
          d.comments || "—"
        ]);
        const wsDemos = XLSX.utils.aoa_to_sheet([demoHeaders, ...demoRows]);
        wsDemos["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsDemos, "Demo Evaluations");
      }

      // Sheet 5: Handovers & Substitutions
      const allHandovers = [
        ...handoversSent.map((h: any) => ({ ...h, direction: "Requested (Sent)" })),
        ...handoversReceived.map((h: any) => ({ ...h, direction: "Received (Covering)" }))
      ];
      if (allHandovers.length > 0) {
        const hHeaders = ["Type", "Date", "Slot Time", "Course", "Peer Faculty", "Reason", "Status"];
        const hRows = allHandovers.map(h => [
          h.direction,
          h.dateStr,
          h.slotTime || "—",
          h.course || "—",
          h.direction.includes("Sent") ? (h.target_mentor_name || "Peer") : (h.requestor_mentor_name || "Requestor"),
          h.reason || "Substitution",
          h.status?.toUpperCase() || "PENDING"
        ]);
        const wsHandovers = XLSX.utils.aoa_to_sheet([hHeaders, ...hRows]);
        wsHandovers["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 25 }, { wch: 22 }, { wch: 30 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsHandovers, "Substitution History");
      }

      const safeName = mentor.name.replace(/[^a-zA-Z0-9]/g, "_");
      XLSX.writeFile(wb, `${safeName}_Faculty_360_Dossier.xlsx`);
    } catch (err: any) {
      console.error("Export failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-3 border border-slate-100">
          <div className="h-10 w-10 border-3 border-[#D528A2] border-t-transparent rounded-full animate-spin mx-auto" />
          <h3 className="text-sm font-black text-slate-900">Loading Faculty 360° Profile</h3>
          <p className="text-[11px] font-bold text-slate-400">Fetching teaching schedule & allocations…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Dialog
        open={true}
        onOpenChange={(next) => { if (!next) onClose(); }}
        ariaLabel="Error loading faculty profile"
        overlayClassName="bg-slate-900/60 backdrop-blur-xs"
        panelClassName="max-w-sm max-h-[90vh] rounded-2xl p-5 space-y-3 text-center border-slate-100"
      >
        <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
        <h3 className="text-sm font-black text-slate-900">Error Loading Faculty Profile</h3>
        <p role="alert" className="text-xs font-medium text-slate-500">{error || "Faculty member not found"}</p>
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
        >
          Close
        </button>
      </Dialog>
    );
  }

  const { mentor, slots, coursesHandled, demoSessions, handoversSent, handoversReceived } = data;
  const stats = mentor.stats;

  const daySlots = slots.filter((s: any) => s.day?.toLowerCase() === selectedDay.toLowerCase());

  return (
    <Dialog
      open={true}
      onOpenChange={(next) => { if (!next) onClose(); }}
      ariaLabel="Faculty 360 profile"
      overlayClassName="bg-slate-900/60 backdrop-blur-xs p-3 overflow-y-auto"
      panelClassName="max-w-3xl my-auto max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border-slate-200 animate-in zoom-in-95 duration-150 p-0 space-y-0"
    >
        {/* Compact Header Card with FacePrep Brand Gradient */}
        <div className="bg-gradient-to-r from-[#D528A2] via-pink-600 to-indigo-700 p-4 text-white relative shrink-0">
          <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportExcel}
              title="Export Faculty 360° Excel Report"
              className="h-7 px-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center gap-1 text-[10px] font-extrabold transition-all cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Dossier</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close faculty profile"
              className="h-7 w-7 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3 pr-24">
            <div className="h-11 w-11 rounded-xl bg-white/20 border border-white/30 backdrop-blur-md flex items-center justify-center text-white font-black text-lg shrink-0 shadow-inner">
              <User className="h-5.5 w-5.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black tracking-tight truncate">{mentor.name}</h2>
                <span className={`px-2 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider backdrop-blur-md ${
                  stats.workloadStatus === "Optimal"
                    ? "bg-emerald-500/30 text-emerald-100 border border-emerald-400/40"
                    : stats.workloadStatus === "Underload"
                    ? "bg-amber-500/30 text-amber-100 border border-amber-400/40"
                    : "bg-rose-500/30 text-rose-100 border border-rose-400/40"
                }`}>
                  {stats.workloadStatus}
                </span>
              </div>
              <p className="text-[11px] font-bold text-pink-100">
                Email: <span className="font-semibold text-white">{mentor.email}</span>
              </p>
              <p className="text-[10px] text-white/80 font-medium truncate mt-0.5 max-w-lg">
                {mentor.department} • {mentor.mentorGroup} • {mentor.collegeName}
              </p>
            </div>
          </div>

          {/* Compact 4-Card KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/20 text-center">
            <div className="bg-white/15 backdrop-blur-md rounded-xl p-1.5 border border-white/20">
              <span className="text-[9px] font-black text-pink-100 uppercase tracking-wider block">Weekly Hours</span>
              <p className="text-sm font-black text-white">{stats.totalWeeklyHours} / {stats.targetCapacity} hrs</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-xl p-1.5 border border-white/20">
              <span className="text-[9px] font-black text-pink-100 uppercase tracking-wider block">Capacity Load</span>
              <p className="text-sm font-black text-emerald-300">{stats.capacityPct}%</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-xl p-1.5 border border-white/20">
              <span className="text-[9px] font-black text-pink-100 uppercase tracking-wider block">Active Courses</span>
              <p className="text-sm font-black text-white">{stats.uniqueCoursesCount} Handled</p>
            </div>
            <div className="bg-white/15 backdrop-blur-md rounded-xl p-1.5 border border-white/20">
              <span className="text-[9px] font-black text-pink-100 uppercase tracking-wider block">SME Certified</span>
              <p className="text-sm font-black text-white">{stats.demoCertificationsCount} Demos</p>
            </div>
          </div>
        </div>

        {/* Compact Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/90 px-4 gap-1 shrink-0">
          {[
            { key: "schedule", label: "Weekly Schedule", icon: Calendar },
            { key: "courses", label: "Courses Handled", icon: BookOpen },
            { key: "demos", label: "SME Demos & Certifications", icon: Award },
            { key: "handovers", label: "Substitutions & Swaps", icon: ArrowRightLeft }
          ].map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key as any)}
                className={`flex items-center gap-1.5 py-2 px-2.5 text-[11px] font-extrabold border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? "border-[#D528A2] text-[#D528A2] bg-white font-black"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-3 w-3 ${isActive ? "text-[#D528A2]" : "text-slate-400"}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents - Scrollable */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* 1. Schedule Tab */}
          {activeTab === "schedule" && (
            <div className="space-y-4">
              {/* Day Selector Pills */}
              <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-50 p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] font-black text-slate-500 uppercase">Teaching Days:</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(d => {
                    const countForDay = slots.filter((s: any) => s.day?.toLowerCase() === d.toLowerCase()).length;
                    const isSelected = selectedDay.toLowerCase() === d.toLowerCase();
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedDay(d)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer flex items-center gap-1 ${
                          isSelected
                            ? "bg-gradient-to-r from-[#D528A2] to-pink-600 text-white shadow-2xs"
                            : "text-slate-600 hover:bg-slate-200/70"
                        }`}
                      >
                        <span>{d.slice(0, 3)}</span>
                        {countForDay > 0 && (
                          <span className={`px-1 py-0.2 rounded-full text-[8px] font-black ${isSelected ? "bg-white/25 text-white" : "bg-slate-200 text-slate-700"}`}>
                            {countForDay}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Day's Slot Cards */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-[11px] font-bold text-slate-500">
                  <span>Scheduled on {selectedDay}: {daySlots.length} Periods</span>
                  <span>Institutional Load: {stats.totalWeeklyHours} hrs/week</span>
                </div>

                {daySlots.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                    No teaching periods scheduled on {selectedDay}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {daySlots.map((s: any) => (
                      <div key={s.id} className="bg-slate-50 hover:bg-white rounded-2xl p-3 border border-slate-100 shadow-card space-y-1.5 transition-all">
                        <div className="flex justify-between items-center">
                          <span className="px-2 py-0.5 rounded-md text-[9.5px] font-black uppercase bg-pink-50 text-[#D528A2] border border-pink-100">
                            {s.time}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400">
                            Room: {s.location || "Default"}
                          </span>
                        </div>
                        <h4 className="text-xs font-black text-slate-900">{s.course}</h4>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold pt-1 border-t border-slate-200/70">
                          <span>{s.classGroup || "General Batch"}</span>
                          <span className="text-[9px] font-black text-indigo-600">{s.college_name || mentor.collegeName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Courses Handled Tab */}
          {activeTab === "courses" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {coursesHandled.map((c: any) => (
                  <div key={c.course} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 space-y-2 shadow-2xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-black text-slate-900">{c.course}</h4>
                        <span className="text-[10px] font-bold text-[#D528A2]">{c.weeklyHours} Assigned Hours/Week</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {c.classGroups?.length || 1} Cohorts
                      </span>
                    </div>

                    <div className="space-y-1 text-[10px] text-slate-500 font-medium pt-1.5 border-t border-slate-200/80">
                      <div>
                        <span className="font-bold text-slate-700">Batches:</span> {c.classGroups?.join(", ") || "General"}
                      </div>
                      <div>
                        <span className="font-bold text-slate-700">Teaching Days:</span> {c.days?.join(", ") || "All"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. SME Demo Certifications Tab */}
          {activeTab === "demos" && (
            <div className="space-y-3">
              {demoSessions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs">
                  No logged SME demo evaluations for this faculty member.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {demoSessions.map((d: any) => (
                    <div key={d.id} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-900">{d.subject || "Domain Demo Session"}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          d.status === "completed" || d.status === "approved"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : d.status === "scheduled"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-rose-100 text-rose-800 border border-rose-200"
                        }`}>
                          {d.status || "Scheduled"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                        <span>Evaluator: <strong className="text-slate-800">{d.sme_name || "SME Evaluator"}</strong></span>
                        <span>Score: <strong className="text-[#D528A2]">{d.marks !== undefined && d.marks !== null ? `${d.marks}/100` : "Pending"}</strong></span>
                      </div>
                      {d.comments && (
                        <p className="text-[10px] text-slate-600 bg-white p-2 rounded-2xl border border-slate-100 mt-1 italic shadow-card">
                          "{d.comments}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Substitutions & Handovers Tab */}
          {activeTab === "handovers" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Sent Handovers */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    Outbound Handover Requests ({handoversSent.length})
                  </h4>
                  {handoversSent.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-slate-100">No outbound swap requests</p>
                  ) : (
                    handoversSent.map((h: any) => (
                      <div key={h.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] space-y-1">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>{h.dateStr} • {h.slotTime || "Class"}</span>
                          <span className="text-[#D528A2] font-black">{h.status}</span>
                        </div>
                        <p className="text-slate-500">Target: {h.target_mentor_name || "Peer Faculty"}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Received Handovers */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                    Inbound Coverage Requests ({handoversReceived.length})
                  </h4>
                  {handoversReceived.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-50 p-4 rounded-xl text-center border border-slate-100">No inbound coverage requests</p>
                  ) : (
                    handoversReceived.map((h: any) => (
                      <div key={h.id} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] space-y-1">
                        <div className="flex justify-between font-bold text-slate-800">
                          <span>{h.dateStr} • {h.slotTime || "Class"}</span>
                          <span className="text-indigo-600 font-black">{h.status}</span>
                        </div>
                        <p className="text-slate-500">From: {h.requestor_mentor_name || "Requesting Faculty"}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Compact Footer */}
        <div className="bg-slate-50 p-3 px-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Export Faculty Dossier (.xlsx)</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-gradient-to-r from-[#D528A2] to-pink-600 hover:opacity-95 text-white text-xs font-black rounded-xl transition-all shadow-sm shadow-[#D528A2]/25 cursor-pointer active:scale-95"
          >
            Close
          </button>
        </div>
    </Dialog>
  );
};
