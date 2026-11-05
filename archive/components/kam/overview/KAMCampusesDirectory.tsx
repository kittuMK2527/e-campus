"use client";

import React, { useState } from "react";
import { Building2, Users, GraduationCap, Clock, ArrowUpRight, Search, Mail, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useApp } from "@/context/AppContext";

interface KAMCampusesDirectoryProps {
  colleges?: any[];
  kamId?: string;
  selectedCollegeId: string;
  onSelectCollege: (collegeId: string) => void;
  onNavigateTab: (tabId: string) => void;
}

export const KAMCampusesDirectory: React.FC<KAMCampusesDirectoryProps> = ({
  colleges: propColleges,
  kamId,
  selectedCollegeId,
  onSelectCollege,
  onNavigateTab
}) => {
  const { colleges: allColleges, currentKAM, students, mentors, studentAttendance } = useApp();
  const effectiveKamId = kamId || currentKAM?.id;
  const colleges = propColleges || (effectiveKamId ? allColleges.filter(c => c.kam_id === effectiveKamId || (c as any).kamId === effectiveKamId) : allColleges);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"institutions" | "cams">("institutions");

  const filteredColleges = colleges.filter(c =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Header & Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-slate-900">Supervised Institutions & CM Leadership</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            Institutional operational health, student-faculty ratios, and direct Campus Manager (CM) reports.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode("institutions")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "institutions" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              🏛️ Institutions ({colleges.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cams")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "cams" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              👔 CM Reports ({colleges.length})
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search campus or CM..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 bg-slate-50 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-[#D528A2] font-semibold w-48"
            />
          </div>
        </div>
      </div>

      {/* 1. Institutions View */}
      {viewMode === "institutions" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredColleges.map(c => {
            const cStudents = students.filter(s => s.college_id === c.id);
            const cMentors = mentors.filter(m => m.college_id === c.id);
            const isSelected = selectedCollegeId === c.id;

            const cStudentIds = new Set(cStudents.map(s => s.id));
            const cAtt = studentAttendance.filter(a => cStudentIds.has(a.studentId));
            const cPresent = cAtt.filter(a => a.status === "present" || a.status === "P").length;
            const cPct = cAtt.length > 0 ? Math.round((cPresent / cAtt.length) * 100) : null;

            return (
              <div
                key={c.id}
                onClick={() => onSelectCollege(isSelected ? "all" : c.id)}
                className={`bg-white rounded-2xl p-5 border shadow-card transition-all cursor-pointer hover:border-[#D528A2]/50 ${
                  isSelected ? "border-[#D528A2] ring-2 ring-[#D528A2]/10" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#D528A2]/10 text-[#D528A2] flex items-center justify-center font-black">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">{c.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400">
                        {(c as any).location || "Main Campus"} • Campus ID: {c.id}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0 ${
                    cPct === null ? "bg-slate-50 text-slate-500 border-slate-200" :
                    cPct >= 75 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    cPct >= 65 ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-rose-50 text-rose-700 border-rose-200"
                  }`}>
                    {cPct !== null ? `${cPct}% Attendance` : "No Attendance Data"}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 mt-4 py-3 border-y border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Enrolled Students</span>
                    <p className="text-xs font-black text-slate-800">{cStudents.length || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Active Faculty</span>
                    <p className="text-xs font-black text-slate-800">{cMentors.length || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Operating Schedule</span>
                    <p className="text-xs font-black text-slate-800">{c.working_days || 5} Days / Wk</p>
                  </div>
                </div>

                {/* Quick actions strip */}
                <div className="mt-3 flex items-center justify-between text-xs pt-1">
                  <span className="text-[10px] font-extrabold text-slate-500">
                    {isSelected ? "🟢 Active Filter Scope" : "Click card to focus scope"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCollege(c.id);
                        onNavigateTab("monitoring");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition-colors text-[10.5px] cursor-pointer"
                    >
                      Attendance
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCollege(c.id);
                        onNavigateTab("academic_delivery");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#D528A2]/10 text-[#D528A2] font-bold hover:bg-[#D528A2]/20 transition-colors text-[10.5px] cursor-pointer"
                    >
                      Syllabus SLA
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. CAM Direct Reports View */}
      {viewMode === "cams" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredColleges.map(c => {
            const camUsers = (mentors as any[]).filter((m: any) => m.role === "cam" && m.college_id === c.id);
            const cam = camUsers[0];
            const camName = cam?.name || `Lead Operations CM (${c.name.split(" ")[0]})`;
            const camEmail = cam?.email || `cam.${c.id.toLowerCase().replace(/[^a-z0-9]/g, "")}@faceprep.in`;
            const camPhone = cam?.phone || "+91 98400 00000";

            return (
              <div key={c.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">{camName}</h4>
                      <p className="text-[10px] text-slate-400 font-semibold">{camEmail}</p>
                      <span className="inline-block mt-0.5 px-2 py-0.2 rounded-md text-[8.5px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                        Reporting CM Lead
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                    🟢 Active On-Duty
                  </span>
                </div>

                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Supervised Campus:</span>
                    <span className="font-extrabold text-slate-800">{c.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Campus Code:</span>
                    <span className="font-extrabold text-slate-800">{(c as any).code || c.id}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">Direct Actions:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCollege(c.id);
                        onNavigateTab("academic_delivery");
                      }}
                      className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Syllabus SLA
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCollege(c.id);
                        onNavigateTab("academic_risk");
                      }}
                      className="px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      Risk Matrix
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
