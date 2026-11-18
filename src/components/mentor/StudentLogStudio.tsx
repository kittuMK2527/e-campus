"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Award,
  BookOpen,
  Briefcase,
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  ExternalLink,
  GraduationCap,
  Clock,
  Sparkles,
  Layers,
  FileText,
  UserCheck
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useToast } from "@/context/ToastContext";

interface StudentLogStudioProps {
  mentorId: string;
  mentorName: string;
  collegeId: string;
  slots: any[];
  students: any[];
}

type LogCategory = "achievement" | "marks" | "placement" | "complaint";

export const StudentLogStudio: React.FC<StudentLogStudioProps> = ({
  mentorId,
  mentorName,
  collegeId,
  slots = [],
  students = []
}) => {
  const { toast } = useToast();

  // Class Groups handled by this mentor
  const mentorClassGroups = useMemo(() => {
    const groups = new Set<string>();
    slots
      .filter((s) => s.mentorId === mentorId || s.mentorid === mentorId)
      .forEach((s) => {
        const cg = s.classGroup || s.classgroup;
        if (cg) groups.add(cg);
      });
    return Array.from(groups).sort();
  }, [slots, mentorId]);

  const [selectedClassGroup, setSelectedClassGroup] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<LogCategory>("achievement");

  // Auto-select first class group if available
  useEffect(() => {
    if (!selectedClassGroup && mentorClassGroups.length > 0) {
      setSelectedClassGroup(mentorClassGroups[0]);
    }
  }, [mentorClassGroups, selectedClassGroup]);

  // Filter students based on class group and search
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const sClass = s.classGroup || s.classgroup || "";
      const matchesClass = !selectedClassGroup || sClass.toLowerCase() === selectedClassGroup.toLowerCase();
      const q = studentSearch.toLowerCase();
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.register_number || s.registerNumber || "").toLowerCase().includes(q) ||
        (s.roll_number || s.rollNumber || "").toLowerCase().includes(q);
      return matchesClass && matchesSearch;
    });
  }, [students, selectedClassGroup, studentSearch]);

  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Form States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logTitle, setLogTitle] = useState("");
  const [logDetails, setLogDetails] = useState("");

  // Category-specific fields
  // 1. Achievements
  const [achType, setAchType] = useState("Certification");
  const [achProofUrl, setAchProofUrl] = useState("");
  const [achDate, setAchDate] = useState(new Date().toISOString().slice(0, 10));

  // 2. Marks & Viva
  const [marksObtained, setMarksObtained] = useState<number | "">(85);
  const [maxMarks, setMaxMarks] = useState<number | "">(100);
  const [vivaRating, setVivaRating] = useState<number>(4);
  const [weakTopics, setWeakTopics] = useState("");

  // 3. Placement Readiness
  const [placementReadiness, setPlacementReadiness] = useState("Ready");
  const [leetcodeCount, setLeetcodeCount] = useState<number | "">(120);
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");

  // 4. Complaints & Warnings
  const [complaintSeverity, setComplaintSeverity] = useState<"low" | "medium" | "high">("medium");
  const [complaintType, setComplaintType] = useState("Frequent Absenteeism");

  // Recent Logs State
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const q = new URLSearchParams({ mentorId, collegeId });
      const res = await apiFetch<any>(`/api/mentor/student-logs?${q.toString()}`);
      if (res?.success && Array.isArray(res.logs)) {
        setRecentLogs(res.logs);
      }
    } catch (err: any) {
      console.warn("Failed to load logs:", err.message);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (mentorId) fetchLogs();
  }, [mentorId, collegeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      toast("Please select a student first", "error");
      return;
    }
    if (!logTitle.trim()) {
      toast("Please enter a title for the log", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      let metrics: any = {};
      if (activeCategory === "achievement") {
        metrics = { achievementType: achType, proofUrl: achProofUrl, achievementDate: achDate };
      } else if (activeCategory === "marks") {
        metrics = { marksObtained, maxMarks, vivaRating, weakTopics };
      } else if (activeCategory === "placement") {
        metrics = { placementReadiness, leetcodeCount, portfolioUrl, interviewNotes };
      } else if (activeCategory === "complaint") {
        metrics = { severity: complaintSeverity, complaintType };
      }

      const res = await apiFetch<any>("/api/mentor/student-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          college_id: selectedStudent.college_id || selectedStudent.collegeId || collegeId,
          mentor_id: mentorId,
          mentor_name: mentorName,
          student_id: selectedStudent.id,
          student_name: selectedStudent.name,
          student_reg_no: selectedStudent.register_number || selectedStudent.registerNumber || "",
          department: selectedStudent.department || "General",
          class_group: selectedClassGroup || selectedStudent.classGroup || "",
          subject: slots.find((s) => s.mentorId === mentorId)?.course || "Skill Development",
          category: activeCategory,
          title: logTitle.trim(),
          details: logDetails.trim(),
          metrics
        })
      });

      if (res?.success) {
        toast(`Recorded ${activeCategory} log for ${selectedStudent.name}!`, "success");
        setLogTitle("");
        setLogDetails("");
        setAchProofUrl("");
        setWeakTopics("");
        fetchLogs();
      } else {
        toast(res?.message || "Failed to record log", "error");
      }
    } catch (err: any) {
      toast(err.message || "Network error", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Are you sure you want to remove this log?")) return;
    try {
      const res = await apiFetch<any>(`/api/mentor/student-logs?id=${encodeURIComponent(logId)}`, {
        method: "DELETE"
      });
      if (res?.success) {
        toast("Log removed", "success");
        setRecentLogs((prev) => prev.filter((l) => l.id !== logId));
      }
    } catch (e: any) {
      toast(e.message || "Failed to delete", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-zinc-900 to-amber-950 text-white p-6 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4 border border-amber-500/20">
        <div>
          <div className="flex items-center gap-2.5">
            <GraduationCap className="h-6 w-6 text-amber-400" />
            <h2 className="text-xl font-black tracking-tight">Student Log Studio</h2>
          </div>
          <p className="text-xs text-slate-300 font-medium mt-1">
            Log student achievements, assessment marks, placement readiness, or complaints for your course batches.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs font-bold">
            <span className="text-amber-300 font-black">{recentLogs.length}</span> Total Logs Recorded
          </div>
        </div>
      </div>

      {/* Main Grid: Left Selector, Right Multi-Tab Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Course & Student Selection (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-3">
            <label className="text-xs font-black text-slate-900 uppercase tracking-wider block">
              1. Select Batch / Class Group
            </label>
            <select
              value={selectedClassGroup}
              onChange={(e) => {
                setSelectedClassGroup(e.target.value);
                setSelectedStudentId("");
              }}
              className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="">All My Class Groups ({mentorClassGroups.length})</option>
              {mentorClassGroups.map((cg) => (
                <option key={cg} value={cg}>
                  {cg}
                </option>
              ))}
            </select>

            <div className="pt-2">
              <label className="text-xs font-black text-slate-900 uppercase tracking-wider block mb-2">
                2. Select Course Student
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student name or roll..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="w-full pl-8 pr-3 h-9 border border-slate-200 rounded-xl text-xs font-medium bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
                {filteredStudents.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">No students found</div>
                ) : (
                  filteredStudents.map((st) => {
                    const isSelected = st.id === selectedStudentId;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setSelectedStudentId(st.id)}
                        className={`w-full text-left p-3 flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected ? "bg-amber-50 border-l-4 border-amber-500" : "hover:bg-slate-50"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-extrabold text-slate-900 truncate">{st.name}</p>
                          <span className="text-[10px] text-slate-500 font-bold block truncate">
                            {st.register_number || st.registerNumber || st.roll_number || "No Reg No"} •{" "}
                            {st.classGroup || st.classgroup || "Batch"}
                          </span>
                        </div>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {selectedStudent && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1 mt-2">
                <p className="text-[10px] uppercase font-black text-amber-800 tracking-wider">Active Student</p>
                <p className="text-xs font-black text-slate-900">{selectedStudent.name}</p>
                <p className="text-[10px] font-bold text-slate-600">
                  {selectedStudent.department || "Dept"} • {selectedStudent.email || "No Email"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Logging Studio (8 cols) */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-5">
            {/* Category Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
              {[
                { id: "achievement", label: "Achievements", icon: Award },
                { id: "marks", label: "Marks & Viva", icon: BookOpen },
                { id: "placement", label: "Placement Readiness", icon: Briefcase },
                { id: "complaint", label: "Complaints & Warnings", icon: AlertTriangle }
              ].map((tab) => {
                const isActive = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCategory(tab.id as LogCategory)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-slate-900 text-white shadow-sm ring-1 ring-slate-800 font-black"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200/80"
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Title / Subject of Record <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    activeCategory === "achievement"
                      ? "e.g. 1st Place at Smart India Hackathon / AWS Cloud Certified"
                      : activeCategory === "marks"
                      ? "e.g. Unit 3 Full Stack Assessment & Viva"
                      : activeCategory === "placement"
                      ? "e.g. Solved 150+ LeetCode problems & Full Stack Project Demo"
                      : "e.g. Repeated Absenteeism & Missed Project Deadline"
                  }
                  value={logTitle}
                  onChange={(e) => setLogTitle(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Category-Specific Form Inputs */}
              {activeCategory === "achievement" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Achievement Type</label>
                    <select
                      value={achType}
                      onChange={(e) => setAchType(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                    >
                      <option value="Certification">Industry Certification</option>
                      <option value="Hackathon">Hackathon / Competition</option>
                      <option value="Coding Badge">Coding Platform Milestone</option>
                      <option value="Academic Project">Project Publication</option>
                      <option value="Extracurricular">Extracurricular / Club</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Date Achieved</label>
                    <input
                      type="date"
                      value={achDate}
                      onChange={(e) => setAchDate(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Certificate / Proof Link</label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/..."
                      value={achProofUrl}
                      onChange={(e) => setAchProofUrl(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-medium"
                    />
                  </div>
                </div>
              )}

              {activeCategory === "marks" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Marks Obtained</label>
                    <input
                      type="number"
                      value={marksObtained}
                      onChange={(e) => setMarksObtained(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Maximum Marks</label>
                    <input
                      type="number"
                      value={maxMarks}
                      onChange={(e) => setMaxMarks(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Viva Performance (1-5)</label>
                    <select
                      value={vivaRating}
                      onChange={(e) => setVivaRating(Number(e.target.value))}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                    >
                      <option value={5}>⭐⭐⭐⭐⭐ 5 - Outstanding</option>
                      <option value={4}>⭐⭐⭐⭐ 4 - Good</option>
                      <option value={3}>⭐⭐⭐ 3 - Average</option>
                      <option value={2}>⭐⭐ 2 - Needs Improvement</option>
                      <option value={1}>⭐ 1 - Unsatisfactory</option>
                    </select>
                  </div>
                </div>
              )}

              {activeCategory === "placement" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Readiness Level</label>
                    <select
                      value={placementReadiness}
                      onChange={(e) => setPlacementReadiness(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                    >
                      <option value="Ready">Placement Ready </option>
                      <option value="Needs Polish">Needs Polish </option>
                      <option value="Struggling">Struggling / Needs Training </option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">LeetCode Solved</label>
                    <input
                      type="number"
                      value={leetcodeCount}
                      onChange={(e) => setLeetcodeCount(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Portfolio / GitHub Link</label>
                    <input
                      type="url"
                      placeholder="https://github.com/..."
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-medium"
                    />
                  </div>
                </div>
              )}

              {activeCategory === "complaint" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Concern Nature</label>
                    <select
                      value={complaintType}
                      onChange={(e) => setComplaintType(e.target.value)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                    >
                      <option value="Frequent Absenteeism">Frequent Absenteeism / Late Punch</option>
                      <option value="Behavioral Issue">Classroom Indiscipline / Behavioral Issue</option>
                      <option value="Incomplete Assignments">Incomplete Lab Assignments / No Submissions</option>
                      <option value="Academic Warning">Academic Slow Pace / Fails Assessments</option>
                      <option value="Proxy Attendance Attempt">Proxy Attendance Observed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Severity Flag</label>
                    <select
                      value={complaintSeverity}
                      onChange={(e) => setComplaintSeverity(e.target.value as any)}
                      className="w-full h-10 px-3 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                    >
                      <option value="low">Low - Warning Notice</option>
                      <option value="medium">Medium - Requires CM Attention</option>
                      <option value="high">High - Critical Escalation</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Detailed Remarks / Feedback</label>
                <textarea
                  rows={3}
                  placeholder="Provide detailed observation, marks feedback, or context for the Campus Manager..."
                  value={logDetails}
                  onChange={(e) => setLogDetails(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedStudent}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {isSubmitting ? "Recording Log..." : `Record ${activeCategory.toUpperCase()} Log`}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Bottom Ledger: Recent Logs by This Mentor */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Recent Logs Recorded for Course Students
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-500">{recentLogs.length} Records</span>
        </div>

        {recentLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No logs recorded yet. Use the form above to log achievements, viva marks, or complaints.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500">
                  <th className="p-3">Category</th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Title & Summary</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLogs.map((log) => {
                  const isComplaint = log.category === "complaint";
                  const isAch = log.category === "achievement";
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                            isComplaint
                              ? "bg-rose-50 text-rose-800 border-rose-200"
                              : isAch
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-blue-50 text-blue-800 border-blue-200"
                          }`}
                        >
                          {log.category}
                        </span>
                      </td>
                      <td className="p-3 font-extrabold text-slate-900">
                        {log.student_name}
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {log.student_reg_no || "No Reg"} • {log.class_group}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs">
                        <p className="font-extrabold text-slate-800">{log.title}</p>
                        {log.details && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{log.details}</p>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-500">
                        {log.created_at ? log.created_at.slice(0, 10) : "Today"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                          title="Remove Log"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
