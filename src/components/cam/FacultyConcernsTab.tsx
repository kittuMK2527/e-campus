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
  Download,
  Edit3,
  Plus,
  Trash2,
  Save,
  BookOpen,
  MessageSquare,
  Sparkles,
  Calendar,
  AlertOctagon,
  Check
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
    recentMentorConcerns?: any[];
  }>({
    studentConcerns: [],
    mentorConcerns: [],
    clusterRollup: {},
    recentLogs: [],
    recentMentorConcerns: []
  });

  // Student Filters
  const [studentSearch, setStudentSearch] = useState("");
  const [studentDeptFilter, setStudentDeptFilter] = useState("all");
  const [studentCategoryFilter, setStudentCategoryFilter] = useState("all");
  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState<any | null>(null);

  // Mentor Filters
  const [mentorSearch, setMentorSearch] = useState("");
  const [mentorDeptFilter, setMentorDeptFilter] = useState("all");
  const [mentorRiskFilter, setMentorRiskFilter] = useState("all");
  const [selectedMentorForDetails, setSelectedMentorForDetails] = useState<any | null>(null);

  // Create Student Log Modal State (CM adding log for a student)
  const [creatingStudentLog, setCreatingStudentLog] = useState<{
    student_id: string;
    student_name: string;
    student_reg_no?: string;
    department?: string;
    class_group?: string;
    category: string;
    title: string;
    details: string;
    status: string;
    metrics: {
      achievementType?: string;
      proofUrl?: string;
      marksObtained?: string | number;
      maxMarks?: string | number;
      vivaRating?: string | number;
      severity?: string;
      readinessLevel?: string;
    };
  } | null>(null);
  const [isSubmittingStudentLog, setIsSubmittingStudentLog] = useState(false);

  // Edit Student Concern Modal State
  const [editingStudentLog, setEditingStudentLog] = useState<{
    id: string;
    student_id: string;
    student_name: string;
    student_reg_no?: string;
    department?: string;
    mentor_name?: string;
    title: string;
    details: string;
    category: string;
    status: string;
    metrics: {
      achievementType?: string;
      proofUrl?: string;
      marksObtained?: string | number;
      maxMarks?: string | number;
      vivaRating?: string | number;
      severity?: string;
      readinessLevel?: string;
    };
  } | null>(null);
  const [isSavingStudentLog, setIsSavingStudentLog] = useState(false);

  // Log Mentor Concern Modal State (Streamlined: no corrective action or target date)
  const [loggingMentorConcern, setLoggingMentorConcern] = useState<{
    mentor_id: string;
    mentor_name: string;
    category: string;
    severity: string;
    title: string;
    details: string;
  } | null>(null);
  const [isSavingMentorConcern, setIsSavingMentorConcern] = useState(false);

  // Edit / Resolve Mentor Concern Modal State (Streamlined)
  const [editingMentorConcern, setEditingMentorConcern] = useState<{
    id: string;
    mentor_id: string;
    mentor_name: string;
    category: string;
    severity: string;
    title: string;
    details: string;
    resolution_notes: string;
    status: string;
  } | null>(null);
  const [isUpdatingMentorConcern, setIsUpdatingMentorConcern] = useState(false);

  const fetchConcerns = async () => {
    setIsLoading(true);
    try {
      const q = new URLSearchParams({ collegeId });
      const res = await apiFetch<any>(`/api/campus/concerns?${q.toString()}`);
      if (res?.success && res.data) {
        setData(res.data);
        if (selectedMentorForDetails) {
          const updatedM = res.data.mentorConcerns.find((m: any) => m.id === selectedMentorForDetails.id);
          if (updatedM) setSelectedMentorForDetails(updatedM);
        }
        if (selectedStudentForDetails) {
          const updatedS = res.data.studentConcerns.find((s: any) => s.id === selectedStudentForDetails.id);
          if (updatedS) setSelectedStudentForDetails(updatedS);
        }
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
      else if (mentorRiskFilter === "cm_concerns") matchesRisk = (m.cm_open_concerns_count || 0) > 0;
      else if (mentorRiskFilter === "late_punch") matchesRisk = m.last_punch?.isLate === true;
      else if (mentorRiskFilter === "high_performers") matchesRisk = m.composite_score >= 85;

      return matchesSearch && matchesDept && matchesRisk;
    });
  }, [data.mentorConcerns, mentorSearch, mentorDeptFilter, mentorRiskFilter]);

  // =========================================================================
  // HANDLERS FOR CM CREATING NEW STUDENT LOG
  // =========================================================================
  const handleCreateStudentLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingStudentLog) return;
    if (!creatingStudentLog.student_id) {
      toast("Please select a student.", "warning");
      return;
    }
    if (!creatingStudentLog.title.trim()) {
      toast("Please enter a headline for the student log.", "warning");
      return;
    }

    setIsSubmittingStudentLog(true);
    try {
      const res = await apiFetch<any>("/api/mentor/student-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          college_id: collegeId,
          student_id: creatingStudentLog.student_id,
          student_name: creatingStudentLog.student_name,
          student_reg_no: creatingStudentLog.student_reg_no || "",
          department: creatingStudentLog.department || "",
          class_group: creatingStudentLog.class_group || "",
          category: creatingStudentLog.category,
          title: creatingStudentLog.title,
          details: creatingStudentLog.details,
          status: creatingStudentLog.status,
          metrics: creatingStudentLog.metrics
        })
      });

      if (res?.success) {
        toast("Student log recorded successfully.", "success");
        setCreatingStudentLog(null);
        await fetchConcerns();
      } else {
        toast(res?.error || res?.message || "Failed to record student log.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to communicate with server.", "error");
    } finally {
      setIsSubmittingStudentLog(false);
    }
  };

  // =========================================================================
  // HANDLERS FOR STUDENT LOG EDITING
  // =========================================================================
  const handleSaveStudentLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudentLog) return;
    if (!editingStudentLog.title.trim()) {
      toast("Please enter a headline for the concern.", "warning");
      return;
    }

    setIsSavingStudentLog(true);
    try {
      const res = await apiFetch<any>("/api/mentor/student-logs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingStudentLog.id,
          title: editingStudentLog.title,
          details: editingStudentLog.details,
          category: editingStudentLog.category,
          metrics: editingStudentLog.metrics,
          status: editingStudentLog.status
        })
      });

      if (res?.success) {
        toast("Student concern / achievement record updated successfully.", "success");

        // Update data in place
        setData((prev) => {
          const updatedStudentConcerns = prev.studentConcerns.map((s) => {
            if (s.id !== editingStudentLog.student_id) return s;
            const updatedLogs = (s.logs || []).map((l: any) => {
              if (l.id !== editingStudentLog.id) return l;
              return {
                ...l,
                title: editingStudentLog.title,
                details: editingStudentLog.details,
                category: editingStudentLog.category,
                status: editingStudentLog.status,
                metrics_json: JSON.stringify(editingStudentLog.metrics)
              };
            });
            return {
              ...s,
              logs: updatedLogs,
              has_complaints: updatedLogs.some((l: any) => l.category === "complaint"),
              achievements_count: updatedLogs.filter((l: any) => l.category === "achievement").length,
              complaints_count: updatedLogs.filter((l: any) => l.category === "complaint").length,
              marks_logs_count: updatedLogs.filter((l: any) => l.category === "marks").length
            };
          });
          return { ...prev, studentConcerns: updatedStudentConcerns };
        });

        // Also update open student details modal if open
        if (selectedStudentForDetails && selectedStudentForDetails.id === editingStudentLog.student_id) {
          setSelectedStudentForDetails((prev: any) => {
            if (!prev) return null;
            const updatedLogs = (prev.logs || []).map((l: any) => {
              if (l.id !== editingStudentLog.id) return l;
              return {
                ...l,
                title: editingStudentLog.title,
                details: editingStudentLog.details,
                category: editingStudentLog.category,
                status: editingStudentLog.status,
                metrics_json: JSON.stringify(editingStudentLog.metrics)
              };
            });
            return {
              ...prev,
              logs: updatedLogs,
              has_complaints: updatedLogs.some((l: any) => l.category === "complaint"),
              achievements_count: updatedLogs.filter((l: any) => l.category === "achievement").length,
              complaints_count: updatedLogs.filter((l: any) => l.category === "complaint").length
            };
          });
        }

        setEditingStudentLog(null);
      } else {
        toast(res?.error || res?.message || "Failed to update student concern.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to communicate with server.", "error");
    } finally {
      setIsSavingStudentLog(false);
    }
  };

  // =========================================================================
  // HANDLERS FOR MENTOR CONCERNS LOGGING & EDITING
  // =========================================================================
  const handleSaveMentorConcern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loggingMentorConcern) return;
    if (!loggingMentorConcern.mentor_id) {
      toast("Please select a faculty mentor.", "warning");
      return;
    }
    if (!loggingMentorConcern.title.trim()) {
      toast("Please enter a headline for the mentor concern.", "warning");
      return;
    }

    setIsSavingMentorConcern(true);
    try {
      const res = await apiFetch<any>("/api/campus/mentor-concerns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          college_id: collegeId,
          mentor_id: loggingMentorConcern.mentor_id,
          mentor_name: loggingMentorConcern.mentor_name,
          category: loggingMentorConcern.category,
          severity: loggingMentorConcern.severity,
          title: loggingMentorConcern.title,
          details: loggingMentorConcern.details
        })
      });

      if (res?.success) {
        toast("Faculty mentor concern recorded successfully.", "success");
        setLoggingMentorConcern(null);
        await fetchConcerns();
      } else {
        toast(res?.error || res?.message || "Failed to log concern.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to communicate with server.", "error");
    } finally {
      setIsSavingMentorConcern(false);
    }
  };

  const handleUpdateMentorConcern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMentorConcern) return;

    setIsUpdatingMentorConcern(true);
    try {
      const res = await apiFetch<any>("/api/campus/mentor-concerns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingMentorConcern)
      });

      if (res?.success) {
        toast("Mentor concern updated successfully.", "success");
        setEditingMentorConcern(null);
        await fetchConcerns();
      } else {
        toast(res?.error || res?.message || "Failed to update concern.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to communicate with server.", "error");
    } finally {
      setIsUpdatingMentorConcern(false);
    }
  };

  const handleDeleteMentorConcern = async (id: string) => {
    if (!confirm("Are you sure you want to remove this mentor concern log?")) return;
    try {
      const res = await apiFetch<any>(`/api/campus/mentor-concerns?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (res?.success) {
        toast("Mentor concern deleted successfully.", "success");
        await fetchConcerns();
      } else {
        toast(res?.error || "Could not delete concern.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to delete concern.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Dual Mode Switcher */}
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
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

        {/* Action Button on Top Bar */}
        {!readOnly && (
          <div>
            {activeConcernMode === "student" ? (
              <button
                type="button"
                onClick={() => {
                  const defaultStudent = filteredStudents[0] || data.studentConcerns[0] || null;
                  setCreatingStudentLog({
                    student_id: defaultStudent?.id || "",
                    student_name: defaultStudent?.name || "",
                    student_reg_no: defaultStudent?.register_number || defaultStudent?.roll_number || "",
                    department: defaultStudent?.department || "",
                    class_group: defaultStudent?.classGroup || "",
                    category: "complaint",
                    title: "",
                    details: "",
                    status: "active",
                    metrics: { severity: "medium" }
                  });
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Student Log</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setLoggingMentorConcern({
                    mentor_id: filteredMentors[0]?.id || data.mentorConcerns[0]?.id || "",
                    mentor_name: filteredMentors[0]?.name || data.mentorConcerns[0]?.name || "",
                    category: "punctuality",
                    severity: "medium",
                    title: "",
                    details: ""
                  });
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Log Mentor Concern</span>
              </button>
            )}
          </div>
        )}
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
                <option value="low_attendance">Low Attendance (&lt;75%)</option>
                <option value="fee_pending">Fee Arrears Pending</option>
                <option value="complaints">Mentor Complaints Logged</option>
                <option value="placement_risk">Placement At-Risk (Low HireScore)</option>
                <option value="achievements">Has Verified Achievements</option>
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
                          Att: {st.attendance_pct}%
                        </span>
                      )}
                      {st.is_fee_defaulter && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black">
                          Fee Due: ₹{st.fee_pending}
                        </span>
                      )}
                      {st.has_complaints && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-black">
                          {st.complaints_count} Complaints
                        </span>
                      )}
                      {st.achievements_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-black">
                          {st.achievements_count} Awards
                        </span>
                      )}
                      {st.hire_score && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black">
                          HireScore: {st.hire_score}
                        </span>
                      )}
                    </div>

                    {/* Latest Mentor Log Snippet */}
                    {st.logs.length > 0 && (
                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1 mt-2">
                        <div className="flex items-center justify-between text-[9.5px]">
                          <span className="font-bold text-slate-500">
                            Latest Log ({st.logs[0].mentor_name})
                          </span>
                          <span className="text-slate-400">{st.logs[0].created_at?.slice(0, 10)}</span>
                        </div>
                        <p className="text-[11px] font-extrabold text-slate-800 truncate">{st.logs[0].title}</p>
                      </div>
                    )}
                  </div>

                  {/* Card Actions: View Details and Add Log */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedStudentForDetails(st)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>View Details</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreatingStudentLog({
                            student_id: st.id,
                            student_name: st.name,
                            student_reg_no: st.register_number || st.roll_number || "",
                            department: st.department || "",
                            class_group: st.classGroup || "",
                            category: "complaint",
                            title: "",
                            details: "",
                            status: "active",
                            metrics: { severity: "medium" }
                          });
                        }}
                        className="w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Log</span>
                      </button>
                    )}
                  </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                Faculty Mentors
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
                CM Concerns Logged
              </span>
              <p className="text-2xl font-black text-amber-800 mt-1">
                {data.mentorConcerns.reduce((acc, m) => acc + (m.cm_open_concerns_count || 0), 0)}
              </p>
            </div>
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider block">
                Student Complaints
              </span>
              <p className="text-2xl font-black text-blue-800 mt-1">
                {data.mentorConcerns.filter((m) => m.tickets_count > 0).length}
              </p>
            </div>
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">
                Exemplary (≥ 85%)
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
                <option value="cm_concerns">Open CM Concerns</option>
                <option value="low_audit">Low Audit Score (&lt;70%)</option>
                <option value="complaints">Student Complaints Logged</option>
                <option value="late_punch">Irregular Punch-In</option>
                <option value="high_performers">Exemplary Performers (≥85%)</option>
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
                          Under Review (&lt;70%)
                        </span>
                      )}
                      {m.cm_open_concerns_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black">
                          {m.cm_open_concerns_count} CM Concern{m.cm_open_concerns_count === 1 ? "" : "s"}
                        </span>
                      )}
                      {m.tickets_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-800 text-[10px] font-black">
                          {m.tickets_count} Complaints
                        </span>
                      )}
                      {m.last_punch && (
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border flex items-center gap-1 ${
                            m.last_punch.isLate
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          <Clock className="h-3 w-3 shrink-0 text-slate-500" />
                          <span>Punch: {m.last_punch.time || "Punched"}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedMentorForDetails(m)}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>View Details</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setLoggingMentorConcern({
                            mentor_id: m.id,
                            mentor_name: m.name,
                            category: "punctuality",
                            severity: "medium",
                            title: "",
                            details: ""
                          });
                        }}
                        className="w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Log Concern</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. MODAL: STUDENT DETAILS & CONCERN HISTORY                          */}
      {/* ==================================================================== */}
      {selectedStudentForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                  Student Details & Concern History
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {selectedStudentForDetails.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedStudentForDetails.register_number || selectedStudentForDetails.roll_number || "No Reg"} •{" "}
                  {selectedStudentForDetails.department} • {selectedStudentForDetails.classGroup}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentForDetails(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div
                className={`p-3 rounded-2xl border ${
                  selectedStudentForDetails.is_low_attendance
                    ? "bg-rose-50 border-rose-200"
                    : "bg-slate-50 border-slate-100"
                }`}
              >
                <span className="text-[10px] font-black uppercase text-slate-400 block">Attendance</span>
                <span
                  className={`text-base font-black ${
                    selectedStudentForDetails.is_low_attendance ? "text-rose-700" : "text-slate-900"
                  }`}
                >
                  {selectedStudentForDetails.attendance_pct}%
                </span>
              </div>
              <div
                className={`p-3 rounded-2xl border ${
                  selectedStudentForDetails.is_fee_defaulter
                    ? "bg-amber-50 border-amber-200"
                    : "bg-slate-50 border-slate-100"
                }`}
              >
                <span className="text-[10px] font-black uppercase text-slate-400 block">Pending Fees</span>
                <span
                  className={`text-base font-black ${
                    selectedStudentForDetails.is_fee_defaulter ? "text-amber-800" : "text-emerald-700"
                  }`}
                >
                  ₹{selectedStudentForDetails.fee_pending}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400 block">HireScore</span>
                <span className="text-base font-black text-indigo-700">
                  {selectedStudentForDetails.hire_score || "N/A"}
                </span>
              </div>
            </div>

            {/* Mentor-Logged History & Add Log */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Recorded Logs & History ({selectedStudentForDetails.logs?.length || 0})
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Faculty mentor and campus manager observations
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingStudentLog({
                        student_id: selectedStudentForDetails.id,
                        student_name: selectedStudentForDetails.name,
                        student_reg_no: selectedStudentForDetails.register_number || selectedStudentForDetails.roll_number || "",
                        department: selectedStudentForDetails.department || "",
                        class_group: selectedStudentForDetails.classGroup || "",
                        category: "complaint",
                        title: "",
                        details: "",
                        status: "active",
                        metrics: { severity: "medium" }
                      });
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-black transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Log</span>
                  </button>
                )}
              </div>

              {selectedStudentForDetails.logs?.length === 0 ? (
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                  <p>No logs recorded for this student yet.</p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingStudentLog({
                          student_id: selectedStudentForDetails.id,
                          student_name: selectedStudentForDetails.name,
                          student_reg_no: selectedStudentForDetails.register_number || selectedStudentForDetails.roll_number || "",
                          department: selectedStudentForDetails.department || "",
                          class_group: selectedStudentForDetails.classGroup || "",
                          category: "complaint",
                          title: "",
                          details: "",
                          status: "active",
                          metrics: { severity: "medium" }
                        });
                      }}
                      className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Record First Log</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {selectedStudentForDetails.logs.map((log: any) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-2xl border text-xs space-y-1.5 ${
                        log.category === "complaint"
                          ? "bg-rose-50/50 border-rose-200"
                          : log.category === "achievement"
                          ? "bg-amber-50/50 border-amber-200"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="uppercase text-[9.5px] px-2 py-0.5 rounded-md bg-white border font-bold text-slate-700">
                          {log.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">
                            {log.mentor_name} • {log.created_at?.slice(0, 10)}
                          </span>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => {
                                let parsedMetrics = {};
                                try {
                                  if (log.metrics_json) parsedMetrics = JSON.parse(log.metrics_json);
                                } catch {}
                                setEditingStudentLog({
                                  id: log.id,
                                  student_id: log.student_id,
                                  student_name: log.student_name,
                                  student_reg_no: log.student_reg_no || selectedStudentForDetails.register_number,
                                  department: log.department || selectedStudentForDetails.department,
                                  mentor_name: log.mentor_name,
                                  title: log.title || "",
                                  details: log.details || "",
                                  category: log.category || "complaint",
                                  status: log.status || "active",
                                  metrics: parsedMetrics
                                });
                              }}
                              className="px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black flex items-center gap-1 transition-colors cursor-pointer"
                              title="Edit this student log"
                            >
                              <Edit3 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="font-extrabold text-slate-900">{log.title}</p>
                      {log.details && <p className="text-slate-600 text-[11px]">{log.details}</p>}
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
                {selectedStudentForDetails.github_id && (
                  <a
                    href={`https://github.com/${selectedStudentForDetails.github_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-800 font-bold flex items-center gap-1"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {selectedStudentForDetails.leetcode_link && (
                  <a
                    href={selectedStudentForDetails.leetcode_link}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-amber-50 hover:bg-amber-100 rounded-lg text-amber-800 font-bold flex items-center gap-1"
                  >
                    <span>LeetCode</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {selectedStudentForDetails.project_drive_link && (
                  <a
                    href={selectedStudentForDetails.project_drive_link}
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
                onClick={() => setSelectedStudentForDetails(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. MODAL: MENTOR PERFORMANCE & QUALITY DETAILS                       */}
      {/* ==================================================================== */}
      {selectedMentorForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">
                  Mentor Performance & Quality Details
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {selectedMentorForDetails.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedMentorForDetails.department} • {selectedMentorForDetails.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMentorForDetails(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* E-Audit Composite Scores */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-800">
                  Campus E-Audit Score
                </span>
                <span className="text-base font-black text-slate-900">
                  {selectedMentorForDetails.composite_score}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block">Skill (35%)</span>
                  <span className="font-black text-slate-800">{selectedMentorForDetails.skill_score}%</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block">Coursework (35%)</span>
                  <span className="font-black text-slate-800">{selectedMentorForDetails.coursework_score}%</span>
                </div>
                <div className="p-2 bg-white rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold block">Attendance (30%)</span>
                  <span className="font-black text-slate-800">{selectedMentorForDetails.attendance_score}%</span>
                </div>
              </div>
            </div>

            {/* CM Observations & Recorded Concerns (Streamlined: no corrective action or target date) */}
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                    CM Observations & Recorded Concerns ({(selectedMentorForDetails.cm_concerns || []).length})
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Operational and quality observations logged by Campus Management
                  </p>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setLoggingMentorConcern({
                        mentor_id: selectedMentorForDetails.id,
                        mentor_name: selectedMentorForDetails.name,
                        category: "punctuality",
                        severity: "medium",
                        title: "",
                        details: ""
                      });
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Record Concern</span>
                  </button>
                )}
              </div>

              {(!selectedMentorForDetails.cm_concerns || selectedMentorForDetails.cm_concerns.length === 0) ? (
                <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center text-xs text-slate-400 space-y-2">
                  <p>No operational concerns logged by CM for this mentor yet.</p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setLoggingMentorConcern({
                          mentor_id: selectedMentorForDetails.id,
                          mentor_name: selectedMentorForDetails.name,
                          category: "punctuality",
                          severity: "medium",
                          title: "",
                          details: ""
                        });
                      }}
                      className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Record First Concern</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {selectedMentorForDetails.cm_concerns.map((c: any) => (
                    <div
                      key={c.id}
                      className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${
                        c.status === "resolved"
                          ? "bg-slate-50 border-slate-200 opacity-80"
                          : c.severity === "critical" || c.severity === "high"
                          ? "bg-rose-50/60 border-rose-200"
                          : "bg-amber-50/60 border-amber-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9.5px] font-black uppercase tracking-wider ${
                              c.severity === "critical"
                                ? "bg-rose-700 text-white"
                                : c.severity === "high"
                                ? "bg-rose-100 text-rose-800"
                                : c.severity === "medium"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {c.severity} severity
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[9.5px] font-bold text-slate-700 uppercase">
                            {c.category?.replace(/_/g, " ")}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9.5px] font-black uppercase ${
                              c.status === "resolved"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.status === "in_progress"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {c.status?.replace(/_/g, " ")}
                          </span>
                        </div>
                        {!readOnly && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMentorConcern({
                                  id: c.id,
                                  mentor_id: c.mentor_id,
                                  mentor_name: c.mentor_name,
                                  category: c.category || "punctuality",
                                  severity: c.severity || "medium",
                                  title: c.title || "",
                                  details: c.details || "",
                                  resolution_notes: c.resolution_notes || "",
                                  status: c.status || "open"
                                });
                              }}
                              className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="h-3 w-3 text-amber-600" />
                              <span>Edit / Resolve</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMentorConcern(c.id)}
                              className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                              title="Delete Concern"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="font-extrabold text-slate-900 text-xs">{c.title}</p>
                        {c.details && <p className="text-slate-600 text-[11px] mt-0.5">{c.details}</p>}
                      </div>

                      {c.resolution_notes && (
                        <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100 text-[11px] space-y-0.5">
                          <span className="font-black text-emerald-800 text-[9.5px] uppercase block">
                            Resolution Notes
                          </span>
                          <p className="text-emerald-900 font-medium">{c.resolution_notes}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                        <span>
                          By {c.logged_by_name} ({c.logged_by_role?.toUpperCase()})
                        </span>
                        <span>
                          {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Student Complaints & Tickets */}
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Grievances & Student Tickets ({selectedMentorForDetails.tickets?.length || 0})
              </h4>
              {selectedMentorForDetails.tickets?.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl text-center text-xs text-slate-400">
                  No grievances or complaints filed against this mentor.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {selectedMentorForDetails.tickets.map((t: any) => (
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
                onClick={() => setSelectedMentorForDetails(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. MODAL: CM ADD NEW STUDENT LOG                                     */}
      {/* ==================================================================== */}
      {creatingStudentLog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                  Record Student Log
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Add Observation / Achievement
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Log an achievement, assessment score, readiness note, or concern
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreatingStudentLog(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudentLog} className="space-y-4">
              {/* Student Selector */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Student *
                </label>
                <select
                  required
                  value={creatingStudentLog.student_id}
                  onChange={(e) => {
                    const sel = data.studentConcerns.find((s) => s.id === e.target.value);
                    setCreatingStudentLog({
                      ...creatingStudentLog,
                      student_id: e.target.value,
                      student_name: sel?.name || "",
                      student_reg_no: sel?.register_number || sel?.roll_number || "",
                      department: sel?.department || "",
                      class_group: sel?.classGroup || ""
                    });
                  }}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                >
                  <option value="">Select a Student...</option>
                  {data.studentConcerns.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.register_number || s.roll_number || "No Reg"} • {s.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Category *
                  </label>
                  <select
                    value={creatingStudentLog.category}
                    onChange={(e) =>
                      setCreatingStudentLog({ ...creatingStudentLog, category: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="complaint">Disciplinary / Academic Concern</option>
                    <option value="achievement">Verified Achievement</option>
                    <option value="marks">Assessment & Viva Marks</option>
                    <option value="placement">Placement Readiness</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Status
                  </label>
                  <select
                    value={creatingStudentLog.status}
                    onChange={(e) =>
                      setCreatingStudentLog({ ...creatingStudentLog, status: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="under_review">Under Review</option>
                    <option value="resolved">Resolved / Addressed</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Headline / Title *
                </label>
                <input
                  type="text"
                  required
                  value={creatingStudentLog.title}
                  onChange={(e) =>
                    setCreatingStudentLog({ ...creatingStudentLog, title: e.target.value })
                  }
                  placeholder="e.g. 1st Place at Hackathon or Lab Attendance Deficiency"
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Dynamic Category Metrics */}
              {creatingStudentLog.category === "achievement" && (
                <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                  <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                    Achievement Details
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Type</label>
                      <select
                        value={creatingStudentLog.metrics?.achievementType || "Academic/Coding"}
                        onChange={(e) =>
                          setCreatingStudentLog({
                            ...creatingStudentLog,
                            metrics: { ...creatingStudentLog.metrics, achievementType: e.target.value }
                          })
                        }
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"
                      >
                        <option value="Hackathon / Contest Win">Hackathon / Contest Win</option>
                        <option value="Paper / Project Presentation">Paper / Project Presentation</option>
                        <option value="Course Certification">Course Certification</option>
                        <option value="Industry Internship Offer">Industry Internship Offer</option>
                        <option value="Competitive Programming Milestone">Competitive Programming Milestone</option>
                        <option value="Other Recognition">Other Recognition</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Proof / Cert URL</label>
                      <input
                        type="url"
                        value={creatingStudentLog.metrics?.proofUrl || ""}
                        onChange={(e) =>
                          setCreatingStudentLog({
                            ...creatingStudentLog,
                            metrics: { ...creatingStudentLog.metrics, proofUrl: e.target.value }
                          })
                        }
                        placeholder="https://..."
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {creatingStudentLog.category === "marks" && (
                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-3">
                  <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider block">
                    Assessment Metrics
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Marks Got</label>
                      <input
                        type="number"
                        value={creatingStudentLog.metrics?.marksObtained || ""}
                        onChange={(e) =>
                          setCreatingStudentLog({
                            ...creatingStudentLog,
                            metrics: { ...creatingStudentLog.metrics, marksObtained: e.target.value }
                          })
                        }
                        placeholder="e.g. 85"
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Max Marks</label>
                      <input
                        type="number"
                        value={creatingStudentLog.metrics?.maxMarks || 100}
                        onChange={(e) =>
                          setCreatingStudentLog({
                            ...creatingStudentLog,
                            metrics: { ...creatingStudentLog.metrics, maxMarks: e.target.value }
                          })
                        }
                        placeholder="100"
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Viva Rating (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={creatingStudentLog.metrics?.vivaRating || 4}
                        onChange={(e) =>
                          setCreatingStudentLog({
                            ...creatingStudentLog,
                            metrics: { ...creatingStudentLog.metrics, vivaRating: e.target.value }
                          })
                        }
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {creatingStudentLog.category === "complaint" && (
                <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-2xl space-y-2">
                  <span className="text-[10px] font-black uppercase text-rose-800 tracking-wider block">
                    Severity Level
                  </span>
                  <div className="flex gap-2">
                    {["low", "medium", "high"].map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() =>
                          setCreatingStudentLog({
                            ...creatingStudentLog,
                            metrics: { ...creatingStudentLog.metrics, severity: sev }
                          })
                        }
                        className={`flex-1 py-1 rounded-lg text-xs font-black uppercase border transition-all cursor-pointer ${
                          (creatingStudentLog.metrics?.severity || "medium") === sev
                            ? "bg-rose-700 text-white border-rose-700"
                            : "bg-white text-slate-700 border-slate-200"
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Details Textarea */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Observations & Remarks
                </label>
                <textarea
                  rows={3}
                  value={creatingStudentLog.details}
                  onChange={(e) =>
                    setCreatingStudentLog({ ...creatingStudentLog, details: e.target.value })
                  }
                  placeholder="Provide context, dates, faculty remarks, or details..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreatingStudentLog(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStudentLog}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSubmittingStudentLog ? "Saving..." : "Record Log"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. MODAL: CM EDIT STUDENT CONCERN                                    */}
      {/* ==================================================================== */}
      {editingStudentLog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-600 tracking-wider block">
                  Edit Student Log
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Update Observation / Concern
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Student: <span className="font-bold text-slate-800">{editingStudentLog.student_name}</span> ({editingStudentLog.student_reg_no || "No Reg"})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudentLog(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudentLog} className="space-y-4">
              {/* Category & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Category
                  </label>
                  <select
                    value={editingStudentLog.category}
                    onChange={(e) =>
                      setEditingStudentLog({ ...editingStudentLog, category: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="achievement">Verified Achievement</option>
                    <option value="marks">Assessment & Viva Marks</option>
                    <option value="placement">Placement Readiness</option>
                    <option value="complaint">Disciplinary / Academic Concern</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Status
                  </label>
                  <select
                    value={editingStudentLog.status}
                    onChange={(e) =>
                      setEditingStudentLog({ ...editingStudentLog, status: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="under_review">Under Review</option>
                    <option value="resolved">Resolved / Addressed</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Headline / Title *
                </label>
                <input
                  type="text"
                  required
                  value={editingStudentLog.title}
                  onChange={(e) =>
                    setEditingStudentLog({ ...editingStudentLog, title: e.target.value })
                  }
                  placeholder="e.g. 1st Place at Hackathon or Unexcused Absence"
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Dynamic Category Metrics */}
              {editingStudentLog.category === "achievement" && (
                <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                  <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
                    Achievement Details
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Type</label>
                      <select
                        value={editingStudentLog.metrics?.achievementType || "Academic/Coding"}
                        onChange={(e) =>
                          setEditingStudentLog({
                            ...editingStudentLog,
                            metrics: { ...editingStudentLog.metrics, achievementType: e.target.value }
                          })
                        }
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium bg-white"
                      >
                        <option value="Hackathon / Contest Win">Hackathon / Contest Win</option>
                        <option value="Paper / Project Presentation">Paper / Project Presentation</option>
                        <option value="Course Certification">Course Certification</option>
                        <option value="Industry Internship Offer">Industry Internship Offer</option>
                        <option value="Competitive Programming Milestone">Competitive Programming Milestone</option>
                        <option value="Other Recognition">Other Recognition</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Proof / Cert URL</label>
                      <input
                        type="url"
                        value={editingStudentLog.metrics?.proofUrl || ""}
                        onChange={(e) =>
                          setEditingStudentLog({
                            ...editingStudentLog,
                            metrics: { ...editingStudentLog.metrics, proofUrl: e.target.value }
                          })
                        }
                        placeholder="https://..."
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingStudentLog.category === "marks" && (
                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-3">
                  <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider block">
                    Assessment Metrics
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Marks Got</label>
                      <input
                        type="number"
                        value={editingStudentLog.metrics?.marksObtained || ""}
                        onChange={(e) =>
                          setEditingStudentLog({
                            ...editingStudentLog,
                            metrics: { ...editingStudentLog.metrics, marksObtained: e.target.value }
                          })
                        }
                        placeholder="e.g. 85"
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Max Marks</label>
                      <input
                        type="number"
                        value={editingStudentLog.metrics?.maxMarks || 100}
                        onChange={(e) =>
                          setEditingStudentLog({
                            ...editingStudentLog,
                            metrics: { ...editingStudentLog.metrics, maxMarks: e.target.value }
                          })
                        }
                        placeholder="100"
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9.5px] font-bold text-slate-500 block mb-1">Viva Rating (1-5)</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={editingStudentLog.metrics?.vivaRating || 4}
                        onChange={(e) =>
                          setEditingStudentLog({
                            ...editingStudentLog,
                            metrics: { ...editingStudentLog.metrics, vivaRating: e.target.value }
                          })
                        }
                        className="w-full h-8 px-2 border border-slate-200 rounded-lg text-xs font-medium outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingStudentLog.category === "complaint" && (
                <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-2xl space-y-2">
                  <span className="text-[10px] font-black uppercase text-rose-800 tracking-wider block">
                    Severity Level
                  </span>
                  <div className="flex gap-2">
                    {["low", "medium", "high"].map((sev) => (
                      <button
                        key={sev}
                        type="button"
                        onClick={() =>
                          setEditingStudentLog({
                            ...editingStudentLog,
                            metrics: { ...editingStudentLog.metrics, severity: sev }
                          })
                        }
                        className={`flex-1 py-1 rounded-lg text-xs font-black uppercase border transition-all cursor-pointer ${
                          (editingStudentLog.metrics?.severity || "medium") === sev
                            ? "bg-rose-700 text-white border-rose-700"
                            : "bg-white text-slate-700 border-slate-200"
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Details Textarea */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Observations & Remarks
                </label>
                <textarea
                  rows={3}
                  value={editingStudentLog.details}
                  onChange={(e) =>
                    setEditingStudentLog({ ...editingStudentLog, details: e.target.value })
                  }
                  placeholder="Add detailed context, remarks, or corrective notes..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudentLog(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStudentLog}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingStudentLog ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. MODAL: CM LOG MENTOR CONCERN (STREAMLINED)                        */}
      {/* ==================================================================== */}
      {loggingMentorConcern && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                  Faculty Concerns
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Record Mentor Concern
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Log an operational or quality observation regarding faculty conduct or performance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoggingMentorConcern(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMentorConcern} className="space-y-4">
              {/* Mentor Selector */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Faculty Mentor *
                </label>
                <select
                  required
                  value={loggingMentorConcern.mentor_id}
                  onChange={(e) => {
                    const selectedM = data.mentorConcerns.find((m) => m.id === e.target.value);
                    setLoggingMentorConcern({
                      ...loggingMentorConcern,
                      mentor_id: e.target.value,
                      mentor_name: selectedM?.name || ""
                    });
                  }}
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                >
                  <option value="">Select a Faculty Mentor...</option>
                  {data.mentorConcerns.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.department} • {m.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Category & Severity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Category *
                  </label>
                  <select
                    value={loggingMentorConcern.category}
                    onChange={(e) =>
                      setLoggingMentorConcern({ ...loggingMentorConcern, category: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="punctuality">Punctuality & Late Punch</option>
                    <option value="coursework_delay">Coursework Delivery Delay</option>
                    <option value="student_complaint">Student Feedback & Grievances</option>
                    <option value="conduct">Classroom Conduct & Standards</option>
                    <option value="appraisal">Performance Review / Appraisal</option>
                    <option value="commendation">Commendation / Recognition</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Severity Level *
                  </label>
                  <select
                    value={loggingMentorConcern.severity}
                    onChange={(e) =>
                      setLoggingMentorConcern({ ...loggingMentorConcern, severity: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="low">Low - Minor Observation</option>
                    <option value="medium">Medium - Attention Needed</option>
                    <option value="high">High - Serious Issue</option>
                    <option value="critical">Critical - Immediate Action</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Concern Headline / Summary *
                </label>
                <input
                  type="text"
                  required
                  value={loggingMentorConcern.title}
                  onChange={(e) =>
                    setLoggingMentorConcern({ ...loggingMentorConcern, title: e.target.value })
                  }
                  placeholder="e.g. Recurring late punch-in or Coursework syllabus lagging"
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Details */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Observations & Details
                </label>
                <textarea
                  rows={4}
                  value={loggingMentorConcern.details}
                  onChange={(e) =>
                    setLoggingMentorConcern({ ...loggingMentorConcern, details: e.target.value })
                  }
                  placeholder="Provide context, dates, batch numbers, or specific observations..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLoggingMentorConcern(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMentorConcern}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingMentorConcern ? "Recording..." : "Record Concern"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 8. MODAL: CM EDIT / RESOLVE MENTOR CONCERN (STREAMLINED)             */}
      {/* ==================================================================== */}
      {editingMentorConcern && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider block">
                  Resolve / Update Concern
                </span>
                <h3 className="text-base font-black text-slate-900">
                  Mentor Concern Resolution
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Mentor: <span className="font-bold text-slate-800">{editingMentorConcern.mentor_name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMentorConcern(null)}
                className="p-1 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateMentorConcern} className="space-y-4">
              {/* Status & Severity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Workflow Status
                  </label>
                  <select
                    value={editingMentorConcern.status}
                    onChange={(e) =>
                      setEditingMentorConcern({ ...editingMentorConcern, status: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved / Addressed</option>
                    <option value="escalated_to_kam">Escalated to KAM</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Severity Level
                  </label>
                  <select
                    value={editingMentorConcern.severity}
                    onChange={(e) =>
                      setEditingMentorConcern({ ...editingMentorConcern, severity: e.target.value })
                    }
                    className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Concern Headline
                </label>
                <input
                  type="text"
                  required
                  value={editingMentorConcern.title}
                  onChange={(e) =>
                    setEditingMentorConcern({ ...editingMentorConcern, title: e.target.value })
                  }
                  className="w-full h-9 px-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Details */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Details & Observations
                </label>
                <textarea
                  rows={3}
                  value={editingMentorConcern.details}
                  onChange={(e) =>
                    setEditingMentorConcern({ ...editingMentorConcern, details: e.target.value })
                  }
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                />
              </div>

              {/* Resolution Notes */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Resolution Notes / Outcome Remarks
                </label>
                <textarea
                  rows={3}
                  value={editingMentorConcern.resolution_notes}
                  onChange={(e) =>
                    setEditingMentorConcern({ ...editingMentorConcern, resolution_notes: e.target.value })
                  }
                  placeholder="Explain how this issue was resolved, discussion summary, or outcome..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMentorConcern(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingMentorConcern}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isUpdatingMentorConcern ? "Updating..." : "Update Concern"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
