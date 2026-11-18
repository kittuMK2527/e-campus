"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  AlertTriangle,
  UserCheck,
  Search,
  Filter,
  GraduationCap,
  Award,
  IndianRupee,
  Clock,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  AlertCircle,
  FileText,
  Briefcase,
  Users,
  Building2,
  Download
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/context/ToastContext";

interface FacultyConcernsTabProps {
  collegeId: string;
  collegeName?: string;
  isKAMView?: boolean;
  readOnly?: boolean;
  onRefresh?: () => void;
}

export const FacultyConcernsTab: React.FC<FacultyConcernsTabProps> = ({
  collegeId,
  collegeName = "Campus",
  isKAMView = false,
  readOnly = false
}) => {
  const { toast } = useToast();

  const [activeConcernMode, setActiveConcernMode] = useState<"student" | "mentor">("student");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    studentConcerns: any[];
    mentorConcerns: any[];
    clusterRollup: any;
    recentLogs: any[];
  }>({
    studentConcerns: [],
    mentorConcerns: [],
    clusterRollup: {},
    recentLogs: []
  });

  // Student Filters
  const [studentSearch, setStudentSearch] = useState("");
  const [studentDeptFilter, setStudentDeptFilter] = useState("all");
  const [studentCategoryFilter, setStudentCategoryFilter] = useState("all");
  const [selectedStudentForDossier, setSelectedStudentForDossier] = useState<any | null>(null);

  // Mentor Filters
  const [mentorSearch, setMentorSearch] = useState("");
  const [mentorDeptFilter, setMentorDeptFilter] = useState("all");
  const [mentorRiskFilter, setMentorRiskFilter] = useState("all");
  const [selectedMentorForDossier, setSelectedMentorForDossier] = useState<any | null>(null);

  const fetchConcerns = async () => {
    setIsLoading(true);
    try {
      const q = new URLSearchParams({ collegeId });
      const res = await apiFetch<any>(`/api/campus/concerns?${q.toString()}`);
      if (res?.success && res.data) {
        setData(res.data);
      }
    } catch (e: any) {
      console.warn("Failed to load campus concerns:", e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (collegeId) {
      fetchConcerns();
    }
  }, [collegeId]);

  // Distinct Student Departments
  const studentDepts = useMemo(() => {
    const set = new Set<string>();
    data.studentConcerns.forEach((s) => {
      if (s.department) set.add(s.department);
    });
    return Array.from(set).sort();
  }, [data.studentConcerns]);

  // Distinct Mentor Departments
  const mentorDepts = useMemo(() => {
    const set = new Set<string>();
    data.mentorConcerns.forEach((m) => {
      if (m.department) set.add(m.department);
    });
    return Array.from(set).sort();
  }, [data.mentorConcerns]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return data.studentConcerns.filter((s) => {
      const q = studentSearch.toLowerCase();
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.register_number || "").toLowerCase().includes(q) ||
        (s.roll_number || "").toLowerCase().includes(q);

      const matchesDept =
        studentDeptFilter === "all" ||
        (s.department || "").toLowerCase() === studentDeptFilter.toLowerCase();

      let matchesCat = true;
      if (studentCategoryFilter === "low_attendance") matchesCat = s.is_low_attendance;
      else if (studentCategoryFilter === "fee_pending") matchesCat = s.is_fee_defaulter;
      else if (studentCategoryFilter === "complaints") matchesCat = s.has_complaints;
      else if (studentCategoryFilter === "achievements") matchesCat = s.achievements_count > 0;
      else if (studentCategoryFilter === "placement_risk") matchesCat = !s.hire_score || Number(s.hire_score) < 50;

      return matchesSearch && matchesDept && matchesCat;
    });
  }, [data.studentConcerns, studentSearch, studentDeptFilter, studentCategoryFilter]);

  // Filtered Mentors
  const filteredMentors = useMemo(() => {
    return data.mentorConcerns.filter((m) => {
      const q = mentorSearch.toLowerCase();
      const matchesSearch =
        !q ||
        (m.name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q);

      const matchesDept =
        mentorDeptFilter === "all" ||
        (m.department || "").toLowerCase() === mentorDeptFilter.toLowerCase();

      let matchesRisk = true;
      if (mentorRiskFilter === "low_audit") matchesRisk = m.is_low_audit;
      else if (mentorRiskFilter === "complaints") matchesRisk = m.tickets_count > 0;
      else if (mentorRiskFilter === "late_punch") matchesRisk = m.last_punch?.isLate === true;
      else if (mentorRiskFilter === "high_performers") matchesRisk = m.composite_score >= 85;

      return matchesSearch && matchesDept && matchesRisk;
    });
  }, [data.mentorConcerns, mentorSearch, mentorDeptFilter, mentorRiskFilter]);

  return (
    <div className="space-y-6">
      {/* Top Navigation Mode Pill Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <h3 className="text-base font-black text-slate-900 tracking-tight">
              {collegeName} • Operational & Performance Concerns
            </h3>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Holistic governance hub monitoring student logs, fees, attendance flags, mentor quality, and campus complaints.
          </p>
        </div>

        {/* Dual Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveConcernMode("student")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeConcernMode === "student"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <GraduationCap className="h-4 w-4 text-amber-500" />
            <span>Student Concerns ({data.studentConcerns.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveConcernMode("mentor")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeConcernMode === "mentor"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users className="h-4 w-4 text-emerald-600" />
            <span>Mentor Concerns ({data.mentorConcerns.length})</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. STUDENT CONCERNS VIEW                                             */}
      {/* ==================================================================== */}
      {activeConcernMode === "student" && (
        <div className="space-y-5">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                Total Students Monitored
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">{data.studentConcerns.length}</p>
            </div>
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                Low Attendance (&lt;75%)
              </span>
              <p className="text-2xl font-black text-rose-700 mt-1">
                {data.studentConcerns.filter((s) => s.is_low_attendance).length}
              </p>
            </div>
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                Fee Arrears Defaulters
              </span>
              <p className="text-2xl font-black text-amber-800 mt-1">
                {data.studentConcerns.filter((s) => s.is_fee_defaulter).length}
              </p>
            </div>
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider block">
                Mentor-Logged Complaints
              </span>
              <p className="text-2xl font-black text-blue-800 mt-1">
                {data.studentConcerns.filter((s) => s.has_complaints).length}
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search student name, roll number, or reg number..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Department Filter"
                value={studentDeptFilter}
                onChange={(e) => setStudentDeptFilter(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
              >
                <option value="all">All Departments ({studentDepts.length})</option>
                {studentDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                aria-label="Concern Filter"
                value={studentCategoryFilter}
                onChange={(e) => setStudentCategoryFilter(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
              >
                <option value="all">All Concern Statuses</option>
                <option value="low_attendance">⚠️ Low Attendance (&lt;75%)</option>
                <option value="fee_pending">💰 Fee Arrears Pending</option>
                <option value="complaints">🚨 Mentor Complaints Logged</option>
                <option value="placement_risk">💼 Placement At-Risk (Low HireScore)</option>
                <option value="achievements">🏆 Has Verified Achievements</option>
              </select>
            </div>
          </div>

          {/* Student Concerns Grid */}
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400 font-bold">Loading student concerns data...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
              No students match the selected filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStudents.map((st) => (
                <div
                  key={st.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-900 truncate" title={st.name}>
                          {st.name}
                        </h4>
                        <span className="text-[11px] text-slate-500 font-medium block truncate">
                          {st.register_number || st.roll_number || "No Reg"} • {st.department || "Dept"}
                        </span>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase">
                        {st.classGroup || "Batch"}
                      </span>
                    </div>

                    {/* Concern Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {st.is_low_attendance && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black">
                          ⚠️ Att: {st.attendance_pct}%
                        </span>
                      )}
                      {st.is_fee_defaulter && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black">
                          💰 Fee Due: ₹{st.fee_pending}
                        </span>
                      )}
                      {st.has_complaints && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-black">
                          🚨 {st.complaints_count} Complaints
                        </span>
                      )}
                      {st.achievements_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black">
                          🏆 {st.achievements_count} Awards
                        </span>
                      )}
                      {st.hire_score && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black">
                          🎯 HireScore: {st.hire_score}
                        </span>
                      )}
                    </div>

                    {/* Latest Mentor Log Snippet */}
                    {st.logs.length > 0 && (
                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1 mt-2">
                        <div className="flex items-center justify-between text-[9.5px]">
                          <span className="font-bold text-slate-500">
                            Mentor Log ({st.logs[0].mentor_name})
                          </span>
                          <span className="text-slate-400">{st.logs[0].created_at?.slice(0, 10)}</span>
                        </div>
                        <p className="text-[11px] font-extrabold text-slate-800 truncate">{st.logs[0].title}</p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedStudentForDossier(st)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>Inspect 360° Dossier</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. MENTOR CONCERNS VIEW                                              */}
      {/* ==================================================================== */}
      {activeConcernMode === "mentor" && (
        <div className="space-y-5">
          {/* Summary Metric Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                Total Faculty Mentors
              </span>
              <p className="text-2xl font-black text-slate-900 mt-1">{data.mentorConcerns.length}</p>
            </div>
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                Under Review (Audit &lt; 70%)
              </span>
              <p className="text-2xl font-black text-rose-700 mt-1">
                {data.mentorConcerns.filter((m) => m.is_low_audit).length}
              </p>
            </div>
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                Student Complaints Logged
              </span>
              <p className="text-2xl font-black text-amber-800 mt-1">
                {data.mentorConcerns.filter((m) => m.tickets_count > 0).length}
              </p>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">
                Exemplary Mentors (≥ 85%)
              </span>
              <p className="text-2xl font-black text-emerald-800 mt-1">
                {data.mentorConcerns.filter((m) => m.composite_score >= 85).length}
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search mentor name or email..."
                value={mentorSearch}
                onChange={(e) => setMentorSearch(e.target.value)}
                className="w-full pl-9 pr-3 h-9 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Mentor Department Filter"
                value={mentorDeptFilter}
                onChange={(e) => setMentorDeptFilter(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
              >
                <option value="all">All Departments ({mentorDepts.length})</option>
                {mentorDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                aria-label="Mentor Risk Filter"
                value={mentorRiskFilter}
                onChange={(e) => setMentorRiskFilter(e.target.value)}
                className="h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
              >
                <option value="all">All Faculty Statuses</option>
                <option value="low_audit">⚠️ Low Audit Score (&lt;70%)</option>
                <option value="complaints">🚨 Student Complaints Logged</option>
                <option value="late_punch">⏰ Irregular Punch-In</option>
                <option value="high_performers">🏆 Exemplary Performers (≥85%)</option>
              </select>
            </div>
          </div>

          {/* Mentor Concerns Grid */}
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400 font-bold">Loading mentor performance data...</div>
          ) : filteredMentors.length === 0 ? (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-400">
              No mentors match the selected filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMentors.map((m) => (
                <div
                  key={m.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-900 truncate" title={m.name}>
                          {m.name}
                        </h4>
                        <span className="text-[11px] text-slate-500 font-medium block truncate">
                          {m.department} • {m.email}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 px-2.5 py-0.5 rounded-lg text-xs font-black border ${
                          m.composite_score >= 85
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : m.composite_score >= 70
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}
                      >
                        {m.composite_score}% Audit
                      </span>
                    </div>

                    {/* Operational telemetry */}
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-400 block font-bold">Skill</span>
                        <span className="font-extrabold text-slate-800">{m.skill_score}%</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-400 block font-bold">Coursework</span>
                        <span className="font-extrabold text-slate-800">{m.coursework_score}%</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-400 block font-bold">Attendance</span>
                        <span className="font-extrabold text-slate-800">{m.attendance_score}%</span>
                      </div>
                    </div>

                    {/* Concern Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {m.is_low_audit && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black">
                          ⚠️ Under Review (&lt;70%)
                        </span>
                      )}
                      {m.tickets_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black">
                          🚨 {m.tickets_count} Complaints
                        </span>
                      )}
                      {m.last_punch && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                            m.last_punch.isLate
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          ⏰ Punch: {m.last_punch.time || "Punched"}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedMentorForDossier(m)}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>Inspect Mentor Dossier</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. MODAL: 360° STUDENT CONCERN DOSSIER                               */}
      {/* ==================================================================== */}
      {selectedStudentForDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                  360° Student Concern Dossier
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {selectedStudentForDossier.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedStudentForDossier.register_number || selectedStudentForDossier.roll_number || "No Reg"} •{" "}
                  {selectedStudentForDossier.department} • {selectedStudentForDossier.classGroup}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentForDossier(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div
                className={`p-3 rounded-2xl border ${
                  selectedStudentForDossier.is_low_attendance
                    ? "bg-rose-50 border-rose-200"
                    : "bg-slate-50 border-slate-100"
                }`}
              >
                <span className="text-[10px] font-black uppercase text-slate-400 block">Attendance</span>
                <span
                  className={`text-base font-black ${
                    selectedStudentForDossier.is_low_attendance ? "text-rose-700" : "text-slate-900"
                  }`}
                >
                  {selectedStudentForDossier.attendance_pct}%
                </span>
              </div>
              <div
                className={`p-3 rounded-2xl border ${
                  selectedStudentForDossier.is_fee_defaulter
                    ? "bg-amber-50 border-amber-200"
                    : "bg-slate-50 border-slate-100"
                }`}
              >
                <span className="text-[10px] font-black uppercase text-slate-400 block">Pending Fees</span>
                <span
                  className={`text-base font-black ${
                    selectedStudentForDossier.is_fee_defaulter ? "text-amber-800" : "text-emerald-700"
                  }`}
                >
                  ₹{selectedStudentForDossier.fee_pending}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 block">HireScore</span>
                <span className="text-base font-black text-indigo-700">
                  {selectedStudentForDossier.hire_score || "N/A"}
                </span>
              </div>
            </div>

            {/* Mentor-Logged History */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Course Mentor Logs & Notes ({selectedStudentForDossier.logs?.length || 0})
              </h4>
              {selectedStudentForDossier.logs?.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl text-center text-xs text-slate-400">
                  No mentor logs recorded for this student yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {selectedStudentForDossier.logs.map((log: any) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-2xl border text-xs space-y-1 ${
                        log.category === "complaint"
                          ? "bg-rose-50/50 border-rose-200"
                          : log.category === "achievement"
                          ? "bg-amber-50/50 border-amber-200"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="uppercase text-[9.5px] px-2 py-0.5 rounded-md bg-white border">
                          {log.category}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {log.mentor_name} • {log.created_at?.slice(0, 10)}
                        </span>
                      </div>
                      <p className="font-extrabold text-slate-900">{log.title}</p>
                      {log.details && <p className="text-slate-600">{log.details}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Coding & Placement Links */}
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Placement & Coding Links
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedStudentForDossier.github_id && (
                  <a
                    href={`https://github.com/${selectedStudentForDossier.github_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-800 font-bold flex items-center gap-1"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {selectedStudentForDossier.leetcode_link && (
                  <a
                    href={selectedStudentForDossier.leetcode_link}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-amber-50 hover:bg-amber-100 rounded-lg text-amber-800 font-bold flex items-center gap-1"
                  >
                    <span>LeetCode</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {selectedStudentForDossier.project_drive_link && (
                  <a
                    href={selectedStudentForDossier.project_drive_link}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-800 font-bold flex items-center gap-1"
                  >
                    <span>Project Drive</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedStudentForDossier(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. MODAL: MENTOR OPERATIONAL QUALITY DOSSIER                         */}
      {/* ==================================================================== */}
      {selectedMentorForDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">
                  Mentor Performance & Quality Dossier
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {selectedMentorForDossier.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedMentorForDossier.department} • {selectedMentorForDossier.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMentorForDossier(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* E-Audit Composite Scores */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-800">
                  Campus E-Audit Genuineness Score
                </span>
                <span className="text-base font-black text-slate-900">
                  {selectedMentorForDossier.composite_score}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block">Skill (35%)</span>
                  <span className="font-black text-slate-800">{selectedMentorForDossier.skill_score}%</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block">Coursework (35%)</span>
                  <span className="font-black text-slate-800">{selectedMentorForDossier.coursework_score}%</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block">Attendance (30%)</span>
                  <span className="font-black text-slate-800">{selectedMentorForDossier.attendance_score}%</span>
                </div>
              </div>
            </div>

            {/* Student Complaints & Tickets */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Grievances & Student Tickets ({selectedMentorForDossier.tickets?.length || 0})
              </h4>
              {selectedMentorForDossier.tickets?.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl text-center text-xs text-slate-400">
                  No grievances or complaints filed against this mentor.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {selectedMentorForDossier.tickets.map((t: any) => (
                    <div key={t.id} className="p-3 bg-rose-50/50 border border-rose-200 rounded-2xl text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-rose-800 font-black">{t.category || "Complaint"}</span>
                        <span className="text-[10px] text-slate-400">{t.created_at?.slice(0, 10)}</span>
                      </div>
                      <p className="font-extrabold text-slate-900">{t.title}</p>
                      {t.description && <p className="text-slate-600">{t.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMentorForDossier(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
