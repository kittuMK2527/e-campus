"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  Award,
  Calendar,
  Clock,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Save,
  Download,
  Users,
  Layers,
  GraduationCap,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Edit3,
  Sparkles,
  FileSpreadsheet,
  Check
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { isAnyPendingCmRequest } from "@/lib/requestStatus";

interface ExamItem {
  id: string;
  college_id: string;
  department: string;
  semester: string;
  exam_type: string;
  subject_name: string;
  subject_code?: string;
  exam_date: string;
  day_order?: string;
  session_time: string;
  start_time?: string;
  end_time?: string;
  hall_room: string;
  max_marks: number;
  passing_marks: number;
  status: string;
}

interface StudentRosterRow {
  student_id: string;
  student_name: string;
  roll_number: string;
  classGroup: string;
  department: string;
  marks_obtained: number | null;
  max_marks: number;
  is_absent: boolean;
  is_od?: boolean;
  grade: string | null;
  remarks: string;
  evaluated_by?: string;
  updated_at?: string;
}

export const MentorExamMarksStudio: React.FC = () => {
  const { currentMentor, coursesList, subjectsList } = useApp();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mentorCollegeId = currentMentor?.college_id || "";
  const examsQuery = useQuery({
    queryKey: qk.exams(mentorCollegeId || "all"),
    enabled: !!mentorCollegeId,
    queryFn: async () => {
      const data = await apiFetch(`/api/exams?college_id=${encodeURIComponent(mentorCollegeId)}`);
      return data?.success && Array.isArray(data.exams) ? (data.exams as ExamItem[]) : [];
    },
  });
  const exams = examsQuery.data || [];
  const loadingExams = examsQuery.isFetching;

  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  // Filter & Search states for exam list
  const [examTabFilter, setExamTabFilter] = useState<"all" | "ready" | "upcoming">("ready");
  const [examSearch, setExamSearch] = useState("");

  // Step 0: Exam type selection
  const [selectedExamType, setSelectedExamType] = useState<string | null>(null);

  // Evaluation Roster states
  const [selectedExam, setSelectedExam] = useState<ExamItem | null>(null);
  const [isSavingMarks, setIsSavingMarks] = useState(false);

  // Active marks & attendance editing state
  const [marksState, setMarksState] = useState<Record<string, { marks: string; isAbsent: boolean; isOD?: boolean; remarks: string }>>({});
  const [globalMaxMarks, setGlobalMaxMarks] = useState<number>(50);
  const [globalPassingMarks, setGlobalPassingMarks] = useState<number>(20);

  // Roster table filters
  const [rosterSearch, setRosterSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState("all");
  const [statusRosterFilter, setStatusRosterFilter] = useState<"all" | "evaluated" | "pending" | "absent" | "failed">("all");
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(25);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Subject/department scope: mentors must not see exams they do not teach.
  const mentorScope = useMemo(() => {
    const subjects = (currentMentor?.subjects || "")
      .split(/\n|\/|,|;/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const department = (currentMentor?.department || "").trim().toLowerCase();
    return { subjects, department };
  }, [currentMentor]);

  const matchesMentorScope = (ex: ExamItem) => {
    const subject = (ex.subject_name || "").toLowerCase();
    const department = (ex.department || "").toLowerCase();
    if (mentorScope.subjects.length > 0) {
      return !!subject && mentorScope.subjects.some((s) => subject.includes(s) || s.includes(subject));
    }
    if (mentorScope.department) return !!department && department.includes(mentorScope.department);
    return true;
  };

  // Filter exams matching mentor's taught subjects & department
  const filteredExams = useMemo(() => {
    return exams.filter((ex) => {
      if (!matchesMentorScope(ex)) return false;

      // Search query filter
      const q = examSearch.toLowerCase().trim();
      const matchesSearch = !q ||
        ex.exam_type.toLowerCase().includes(q) ||
        ex.subject_name.toLowerCase().includes(q) ||
        ex.department.toLowerCase().includes(q) ||
        ex.exam_date.includes(q);

      if (!matchesSearch) return false;

      // Status / Date Filter
      const isPastOrToday = ex.exam_date <= todayStr;
      if (examTabFilter === "ready" && !isPastOrToday) return false;
      if (examTabFilter === "upcoming" && isPastOrToday) return false;

      return true;
    });
  }, [exams, mentorScope, examSearch, examTabFilter, todayStr]);

  // Unique exam types for Step 0 grouping
  const uniqueExamTypes = useMemo(() => {
    const types = Array.from(new Set(filteredExams.map(e => e.exam_type))).sort();
    return types;
  }, [filteredExams]);

  // Exams filtered to the selected exam type (for Step 1 subject list)
  const examTypeExams = useMemo(() => {
    if (!selectedExamType) return filteredExams;
    return filteredExams.filter(e => e.exam_type === selectedExamType);
  }, [filteredExams, selectedExamType]);

  // Modal state for CAM Marks Edit Request
  const [editRequestModalOpen, setEditRequestModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRosterRow | null>(null);
  const [proposedMark, setProposedMark] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [isSubmittingEditReq, setIsSubmittingEditReq] = useState(false);

  // Check if exam is officially completed (date and end time have passed)
  const isExamOver = useMemo(() => {
    if (!selectedExam || !selectedExam.exam_date) return true;
    // Client-side, so the browser's own zone is the institution's zone for these
    // users; the UTC string would still read yesterday before 05:30 IST.
    const today = new Date().toLocaleDateString("en-CA");
    if (selectedExam.exam_date < today) return true;
    if (selectedExam.exam_date > today) return false;

    // Same day: check end time. session_time is free text and commonly
    // "9.00 AM to 12.00 PM", which has no hyphen to split on.
    const endTimeStr = (
      (selectedExam.session_time || "").split(/\s*(?:to|–|-)\s*/i)[1] ||
      selectedExam.end_time ||
      "05:00 PM"
    ).trim();
    const match = endTimeStr.match(/(\d+)(?::|\.)(\d+)\s*(AM|PM)?/i);
    if (!match) return true;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const isPM = (match[3] || "").toUpperCase() === "PM" || endTimeStr.toLowerCase().includes("pm");
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    const now = new Date();
    const endDateTime = new Date();
    endDateTime.setHours(h, m || 0, 0, 0);
    return now >= endDateTime;
  }, [selectedExam]);

  // Pending CAM edit requests for the selected exam (no prefetch: GET /api/requests has side effects)
  const editRequestsQuery = useQuery({
    queryKey: qk.examEditRequests(selectedExamId || "none"),
    enabled: !!selectedExamId,
    queryFn: async () => {
      // Server-side filter: this route returns every handover request in the
      // system, and the pending marks only ever concern the selected exam slot.
      const data = await apiFetch(`/api/requests?slotId=${encodeURIComponent(selectedExamId as string)}`);
      const pendingMap: Record<string, string> = {};
      if (data?.success && Array.isArray(data.requests)) {
        data.requests.forEach((r: any) => {
          if (r.slotId === selectedExamId && isAnyPendingCmRequest(r.status)) {
            const markMatch = (r.reason || "").match(/Proposed Mark:\s*([\d.]+)/i);
            if (markMatch) pendingMap[r.targetStaffId] = markMatch[1];
          }
        });
      }
      return pendingMap;
    },
  });
  const pendingEditRequests = editRequestsQuery.data || {};
  const fetchPendingEditRequests = (examId: string) =>
    queryClient.invalidateQueries({ queryKey: qk.examEditRequests(examId) });

  // Student roster for the selected exam
  const rosterQuery = useQuery({
    queryKey: qk.examRoster(selectedExamId || "none"),
    enabled: !!selectedExamId,
    queryFn: async () => {
      const data = await apiFetch(`/api/exams/marks?exam_id=${encodeURIComponent(selectedExamId as string)}`);
      return data?.success && Array.isArray(data.roster) ? (data.roster as StudentRosterRow[]) : [];
    },
  });
  const roster = rosterQuery.data || [];
  const loadingRoster = rosterQuery.isFetching;

  const seededRosterExamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedExamId || !rosterQuery.data) return;
    if (seededRosterExamRef.current === selectedExamId) return;
    seededRosterExamRef.current = selectedExamId;
    const initialMap: Record<string, { marks: string; isAbsent: boolean; isOD: boolean; remarks: string }> = {};
    rosterQuery.data.forEach((st: StudentRosterRow) => {
      initialMap[st.student_id] = {
        marks: st.marks_obtained !== null && st.marks_obtained !== undefined ? String(st.marks_obtained) : "",
        isAbsent: Boolean(st.is_absent),
        isOD: Boolean(st.is_od),
        remarks: st.remarks || ""
      };
    });
    setMarksState(initialMap);
  }, [selectedExamId, rosterQuery.data]);

  // 2. Select an exam for grading
  const selectExamForGrading = async (exam: ExamItem) => {
    seededRosterExamRef.current = null;
    setMarksState({});
    setSelectedExam(exam);
    setSelectedExamId(exam.id);
    setGlobalMaxMarks(exam.max_marks || 50);
    setGlobalPassingMarks(exam.passing_marks || ((exam.max_marks || 50) * 0.4));
  };

  // Compute Grade live helper
  const computeGrade = (marksVal: number | null, isAbsent: boolean, maxM: number, passM: number) => {
    if (isAbsent) return { grade: "AB", label: "Absent", color: "bg-slate-100 text-slate-600 border-slate-200" };
    if (marksVal === null || isNaN(marksVal)) return { grade: "—", label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200" };

    const pct = (marksVal / maxM) * 100;
    if (pct >= 90) return { grade: "O", label: "Outstanding", color: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    if (pct >= 80) return { grade: "A+", label: "Excellent", color: "bg-green-100 text-green-800 border-green-300" };
    if (pct >= 70) return { grade: "A", label: "Very Good", color: "bg-teal-100 text-teal-800 border-teal-300" };
    if (pct >= 60) return { grade: "B+", label: "Good", color: "bg-blue-100 text-blue-800 border-blue-300" };
    if (pct >= 50) return { grade: "B", label: "Above Average", color: "bg-indigo-100 text-indigo-800 border-indigo-300" };
    if (marksVal >= passM) return { grade: "C", label: "Pass", color: "bg-amber-100 text-amber-800 border-amber-300" };
    return { grade: "RA / F", label: "Re-Appear", color: "bg-rose-100 text-rose-800 border-rose-300" };
  };

  // Extract unique cohorts in current roster
  const availableCohorts = useMemo(() => {
    const list = Array.from(new Set(roster.map(r => r.classGroup).filter(Boolean))).sort();
    return list;
  }, [roster]);

  // Filtered Roster for UI
  const filteredRoster = useMemo(() => {
    return roster.filter(st => {
      const q = rosterSearch.toLowerCase().trim();
      const matchesSearch = !q ||
        st.student_name.toLowerCase().includes(q) ||
        st.roll_number.toLowerCase().includes(q) ||
        (st.classGroup || "").toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (cohortFilter !== "all" && st.classGroup !== cohortFilter) return false;

      const state = marksState[st.student_id];
      const hasMarks = state && state.marks.trim() !== "";
      const isAbs = state?.isAbsent;
      const numMarks = hasMarks ? parseFloat(state.marks) : null;
      const isFail = numMarks !== null && numMarks < globalPassingMarks && !isAbs;

      if (statusRosterFilter === "evaluated" && (!hasMarks && !isAbs)) return false;
      if (statusRosterFilter === "pending" && (hasMarks || isAbs)) return false;
      if (statusRosterFilter === "absent" && !isAbs) return false;
      if (statusRosterFilter === "failed" && !isFail) return false;

      return true;
    });
  }, [roster, rosterSearch, cohortFilter, statusRosterFilter, marksState, globalPassingMarks]);

  useEffect(() => {
    setRosterPage(1);
  }, [rosterSearch, cohortFilter, statusRosterFilter, selectedExam?.id]);

  const paginatedRoster = useMemo(() => {
    const start = (rosterPage - 1) * rosterPageSize;
    return filteredRoster.slice(start, start + rosterPageSize);
  }, [filteredRoster, rosterPage, rosterPageSize]);

  // Calculate live summary metrics
  const summaryStats = useMemo(() => {
    let evaluated = 0;
    let absent = 0;
    let passed = 0;
    let failed = 0;
    let totalScore = 0;
    let scoreCount = 0;

    roster.forEach(st => {
      const state = marksState[st.student_id];
      if (state?.isAbsent) {
        absent++;
        evaluated++;
      } else if (state && state.marks.trim() !== "") {
        evaluated++;
        const val = parseFloat(state.marks);
        if (!isNaN(val)) {
          totalScore += val;
          scoreCount++;
          if (val >= globalPassingMarks) passed++;
          else failed++;
        }
      }
    });

    const passPct = (passed + failed) > 0 ? Math.round((passed / (passed + failed)) * 100) : 0;
    const avgScore = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : "—";

    return {
      total: roster.length,
      evaluated,
      pending: roster.length - evaluated,
      absent,
      passed,
      failed,
      passPct,
      avgScore
    };
  }, [roster, marksState, globalPassingMarks]);

  // Batch mark all students attendance
  const handleMarkAllStudents = (status: "present" | "absent" | "od") => {
    if (!isExamOver) return;
    setMarksState((prev) => {
      const nextMap = { ...prev };
      roster.forEach((st) => {
        const cur = nextMap[st.student_id] || { marks: "", isAbsent: false, remarks: "" };
        nextMap[st.student_id] = {
          ...cur,
          isAbsent: status === "absent",
          isOD: status === "od",
          marks: status === "absent" ? "" : cur.marks
        };
      });
      return nextMap;
    });
    toast(`Marked all students as ${status.toUpperCase()}`, "info");
  };

  // Toggle single student attendance
  const handleToggleStudentAttendance = (studentId: string) => {
    if (!isExamOver) return;
    setMarksState((prev) => {
      const cur = prev[studentId] || { marks: "", isAbsent: false, remarks: "" };
      let isAbsent = false;
      let isOD = false;
      if (!cur.isAbsent && !cur.isOD) {
        isAbsent = true;
      } else if (cur.isAbsent) {
        isOD = true;
      } else {
        isAbsent = false;
        isOD = false;
      }
      return {
        ...prev,
        [studentId]: {
          ...cur,
          isAbsent,
          isOD,
          marks: isAbsent ? "" : cur.marks
        }
      };
    });
  };

  const handleMarkChange = (studentId: string, rawVal: string) => {
    if (rawVal === "") {
      setMarksState((prev) => ({
        ...prev,
        [studentId]: { ...(prev[studentId] || { marks: "", isAbsent: false, remarks: "" }), marks: "", isAbsent: false },
      }));
      return;
    }
    let num = parseFloat(rawVal);
    if (isNaN(num)) num = 0;
    if (num > globalMaxMarks) num = globalMaxMarks;
    if (num < 0) num = 0;

    setMarksState((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { marks: "", isAbsent: false, remarks: "" }),
        marks: String(num),
        isAbsent: false,
      },
    }));
  };

  // Handle Save Attendance & Marks
  const handleSaveMarks = async () => {
    if (!selectedExam) return;
    setIsSavingMarks(true);

    try {
      const payloadMarks = roster.map(st => {
        const state = marksState[st.student_id];
        const isAbsent = Boolean(state?.isAbsent);
        const isOD = Boolean(state?.isOD);
        const status = isAbsent ? "absent" : isOD ? "od" : "present";
        return {
          student_id: st.student_id,
          marks_obtained: isAbsent || !state?.marks.trim() ? null : parseFloat(state.marks),
          max_marks: globalMaxMarks,
          is_absent: isAbsent,
          status,
          remarks: state?.remarks || ""
        };
      });

      const data = await apiFetch("/api/exams/marks", {
        method: "POST",
        body: {
          exam_id: selectedExam.id,
          marks: payloadMarks,
          evaluated_by: currentMentor?.name || "Subject Mentor"
        }
      });

      if (data.success) {
        toast(`Attendance and Marks successfully published for ${roster.length} students!`, "success");
        seededRosterExamRef.current = null;
        await queryClient.invalidateQueries({ queryKey: ["exams"] });
      } else {
        toast(data.message || "Failed to save marks", "error");
      }
    } catch (err: any) {
      toast("Error saving marks: " + err.message, "error");
    } finally {
      setIsSavingMarks(false);
    }
  };

  // Handle Submit Mark Edit Request to CAM
  const handleSubmitMarkEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !selectedExam) return;
    if (!proposedMark.trim() || isNaN(parseFloat(proposedMark))) {
      toast("Please enter a valid proposed mark", "warning");
      return;
    }
    const num = parseFloat(proposedMark);
    if (num < 0 || num > globalMaxMarks) {
      toast(`Marks must be between 0 and ${globalMaxMarks}`, "warning");
      return;
    }
    if (!editReason.trim()) {
      toast("Please provide a mandatory reason for changing already entered marks", "warning");
      return;
    }

    setIsSubmittingEditReq(true);
    try {
      const data = await apiFetch("/api/requests", {
        method: "POST",
        body: {
          mentorId: currentMentor?.id || "mentor_1",
          slotId: selectedExam.id,
          dateStr: selectedExam.exam_date,
          dateFormatted: selectedExam.exam_date,
          targetStaffId: editingStudent.student_id,
          reason: `[Exam Mark Edit Request] Exam: ${selectedExam.exam_type} | Student: ${editingStudent.student_name} (${editingStudent.roll_number}) | Old Mark: ${editingStudent.marks_obtained} | Proposed Mark: ${proposedMark} | Reason: ${editReason.trim()}`,
          subjectName: selectedExam.subject_name
        }
      });
      if (data.success) {
        toast("Marks edit approval request submitted to Campus Manager (CM)!", "success");
        setEditRequestModalOpen(false);
        setEditingStudent(null);
        setProposedMark("");
        setEditReason("");
        fetchPendingEditRequests(selectedExam.id);
      } else {
        toast(data.message || "Failed to submit request", "error");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setIsSubmittingEditReq(false);
    }
  };

  // Export marksheet to CSV
  const handleExportCSV = () => {
    if (!selectedExam || roster.length === 0) return;

    let csv = "Roll Number,Student Name,Department,Cohort,Marks Obtained,Max Marks (Out Of),Percentage,Grade,Status,Remarks,Evaluator\n";
    roster.forEach(st => {
      const state = marksState[st.student_id];
      const isAbs = state?.isAbsent;
      const m = state?.marks && !isAbs ? parseFloat(state.marks) : null;
      const pct = m !== null ? ((m / globalMaxMarks) * 100).toFixed(1) + "%" : "—";
      const { grade, label } = computeGrade(m, Boolean(isAbs), globalMaxMarks, globalPassingMarks);
      csv += `"${st.roll_number}","${st.student_name}","${st.department || ""}","${st.classGroup || ""}","${isAbs ? "AB" : m ?? "—"}","${globalMaxMarks}","${pct}","${grade}","${label}","${state?.remarks || ""}","${currentMentor?.name || ""}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedExam.exam_type}_${selectedExam.subject_name}_Marksheet.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Marksheet CSV exported successfully!", "success");
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 md:p-6 rounded-2xl text-white shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Award className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-black tracking-tight">Faculty Exam Grading & Scorecard Studio</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => examsQuery.refetch()}
            disabled={loadingExams}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingExams ? "animate-spin" : ""}`} />
            <span>Refresh Schedules</span>
          </button>
        </div>
      </div>

      {!selectedExamId ? (
        /* STEP 0 + 1: EXAM TYPE PICKER → SUBJECT LIST */
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              {selectedExamType && (
                <button
                  type="button"
                  onClick={() => setSelectedExamType(null)}
                  className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  ← All Types
                </button>
              )}
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-indigo-600" />
                  {selectedExamType ? `${selectedExamType} — Select Subject` : "Select Assessment Type"}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedExamType
                    ? `${examTypeExams.length} subject(s) in ${selectedExamType}`
                    : "Pick an exam type to see its subjects and enter marks."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* Tab filters */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl">
                {(["ready", "upcoming", "all"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setExamTabFilter(t)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      examTabFilter === t
                        ? "bg-white text-indigo-700 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {t === "ready" ? "Ready" : t === "upcoming" ? "Upcoming" : "All"}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search subject or exam"
                  placeholder="Search subject or exam..."
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {loadingExams ? (
            <div className="py-16 text-center text-slate-400 font-bold text-xs space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
              <p>Loading examination timetables...</p>
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="py-14 text-center border-2 border-dashed border-slate-200 rounded-2xl p-6">
              <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                <Award className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Assessment Schedules Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                No exams match your current filter. When Campus Managers schedule assessments, they will appear here.
              </p>
            </div>
          ) : !selectedExamType ? (
            /* STEP 0: Exam Type Cards */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {uniqueExamTypes.map((examType) => {
                const typeExams = filteredExams.filter(e => e.exam_type === examType);
                const conductedCount = typeExams.filter(e => e.exam_date <= todayStr).length;
                const minDate = typeExams.map(e => e.exam_date).sort()[0];
                const maxDate = typeExams.map(e => e.exam_date).sort().reverse()[0];
                return (
                  <button
                    key={examType}
                    type="button"
                    onClick={() => setSelectedExamType(examType)}
                    className="p-5 rounded-2xl shadow-card border border-slate-100 hover:border-indigo-400 hover:shadow-card-lg transition-all bg-white flex flex-col items-start gap-3 text-left group cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-slate-900 border border-slate-800 text-amber-400 shadow-xs">
                        {examType}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {typeExams.length} subject{typeExams.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="w-full space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Conducted / Ready</span>
                        <span className="font-extrabold text-emerald-700">{conductedCount} / {typeExams.length}</span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${typeExams.length > 0 ? (conductedCount / typeExams.length) * 100 : 0}%` }}
                        />
                      </div>
                      {minDate && (
                        <p className="text-[10px] text-slate-400 font-medium">
                          {minDate === maxDate ? minDate : `${minDate} → ${maxDate}`}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-indigo-600 text-xs font-extrabold group-hover:gap-2 transition-all">
                      <span>Enter Marks</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            /* STEP 1: Subject Cards within selected Exam Type */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {examTypeExams.length === 0 ? (
                <div className="col-span-full py-10 text-center text-slate-400 text-sm font-bold">
                  No subjects found for <strong>{selectedExamType}</strong> matching the current filter.
                </div>
              ) : (
                examTypeExams.map((ex) => {
                  const isPastOrToday = ex.exam_date <= todayStr;
                  return (
                    <div
                      key={ex.id}
                      className="p-5 rounded-2xl shadow-card border border-slate-100 hover:border-indigo-400 hover:shadow-card-lg transition-all bg-white flex flex-col justify-between space-y-4 group"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {ex.exam_type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                            isPastOrToday
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {isPastOrToday ? "Ready" : "Upcoming"}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-amber-600 transition-colors">
                            {ex.subject_name}
                          </h3>
                          <div className="text-xs text-slate-500 font-semibold mt-0.5">
                            {ex.department} • {ex.semester}
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600 font-medium">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                              <span>Date: <strong>{ex.exam_date}</strong></span>
                            </div>
                            {ex.day_order && ex.day_order !== "None" && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[9.5px] font-black uppercase">
                                {ex.day_order}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                            <span>Timing: <strong>{ex.session_time || `${ex.start_time} - ${ex.end_time}`}</strong></span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => selectExamForGrading(ex)}
                        className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                      >
                        <Edit3 className="h-4 w-4" />
                        <span>{isPastOrToday ? "Mark Attendance & Enter Marks →" : "Preview Roster →"}</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      ) : (
        /* STEP 2: MARKS EVALUATION & ROSTER TABLE */
        <div className="space-y-5">
          {/* Active Exam Header & Config Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    seededRosterExamRef.current = null;
                    setSelectedExam(null);
                    setSelectedExamId(null);
                    setMarksState({});
                  }}
                  className="mt-0.5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                  title="Back to Exam Selection"
                >
                  ← Back
                </button>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-black text-xs uppercase border border-indigo-200">
                      {selectedExam?.exam_type}
                    </span>
                    {selectedExam?.day_order && selectedExam?.day_order !== "None" && (
                      <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 font-black text-xs uppercase border border-purple-200">
                        {selectedExam.day_order}
                      </span>
                    )}
                    <h2 className="text-base font-black text-slate-900">
                      {selectedExam?.subject_name}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    {selectedExam?.department} • {selectedExam?.semester} • Date: <strong>{selectedExam?.exam_date}</strong> • Timing: <strong>{selectedExam?.session_time || `${selectedExam?.start_time} - ${selectedExam?.end_time}`}</strong> • Hall: <strong>{selectedExam?.hall_room}</strong>
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Export Marksheet CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveMarks}
                  disabled={!isExamOver || isSavingMarks || loadingRoster}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingMarks ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Publishing Marks & Attendance...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save & Publish Attendance & Marks</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lock Banner when exam is in progress or in future */}
            {!isExamOver && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-2xs">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-extrabold text-xs uppercase tracking-wide text-amber-800">
                    🔒 Examination in Progress / Scheduled
                  </div>
                  <p className="text-xs text-amber-700 mt-0.5">
                    This examination concludes on <strong>{selectedExam?.exam_date}</strong> at <strong>{selectedExam?.session_time || `${selectedExam?.start_time} - ${selectedExam?.end_time}`}</strong>. You can preview the student roster, but marks and attendance entry will automatically unlock once the examination session is completed.
                  </p>
                </div>
              </div>
            )}

            {/* Scale Setting & Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {/* Max Marks Scale Config */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                <label className="text-[10px] font-black uppercase text-indigo-800 block mb-1">
                  Out Of (Max Marks)
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  aria-label="Out Of (Max Marks)"
                  disabled={!isExamOver}
                  value={globalMaxMarks}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 50;
                    setGlobalMaxMarks(val);
                    setGlobalPassingMarks(Math.round(val * 0.4));
                  }}
                  className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-sm font-black text-indigo-900 focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              {/* Passing Marks Config */}
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                <label className="text-[10px] font-black uppercase text-indigo-800 block mb-1">
                  Passing Marks
                </label>
                <input
                  type="number"
                  min={1}
                  max={globalMaxMarks}
                  aria-label="Passing Marks"
                  disabled={!isExamOver}
                  value={globalPassingMarks}
                  onChange={(e) => setGlobalPassingMarks(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1 text-sm font-black text-indigo-900 focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              {/* KPI 1: Evaluated */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                <span className="text-[9px] font-black uppercase text-slate-500 block">Evaluated</span>
                <span className="text-base font-black text-slate-800">{summaryStats.evaluated} / {summaryStats.total}</span>
              </div>

              {/* KPI 2: Passed */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <span className="text-[9px] font-black uppercase text-emerald-700 block">Passed</span>
                <span className="text-base font-black text-emerald-800">{summaryStats.passed} ({summaryStats.passPct}%)</span>
              </div>

              {/* KPI 3: Failed / Arrears */}
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-center">
                <span className="text-[9px] font-black uppercase text-rose-700 block">Arrears / Fail</span>
                <span className="text-base font-black text-rose-800">{summaryStats.failed}</span>
              </div>

              {/* KPI 4: Absent */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <span className="text-[9px] font-black uppercase text-amber-700 block">Absent (AB)</span>
                <span className="text-base font-black text-amber-800">{summaryStats.absent}</span>
              </div>
            </div>

            {/* Roster Table Filter & Batch Attendance Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    aria-label="Search student or roll no"
                    placeholder="Search student or roll no..."
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {availableCohorts.length > 1 && (
                  <select
                    value={cohortFilter}
                    onChange={(e) => setCohortFilter(e.target.value)}
                    className="py-1.5 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Cohorts ({availableCohorts.length})</option>
                    {availableCohorts.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}

                {/* Batch Attendance Buttons */}
                {isExamOver && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleMarkAllStudents("present")}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                    >
                      All Present
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkAllStudents("absent")}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                    >
                      All Absent
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkAllStudents("od")}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                    >
                      All OD
                    </button>
                  </div>
                )}
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
                {(["all", "evaluated", "pending", "absent", "failed"] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusRosterFilter(tab)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      statusRosterFilter === tab
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tab === "all" ? "All" : tab === "evaluated" ? "Graded" : tab === "pending" ? "Pending" : tab === "absent" ? "Absent" : "Failed"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student Marks Evaluation Table & Mobile Cards */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
            {/* Mobile Cards (< md) */}
            <div className="block md:hidden divide-y divide-slate-100 p-3 space-y-3">
              {loadingRoster ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto text-amber-500 mb-2" />
                  Loading student roster...
                </div>
              ) : filteredRoster.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-medium text-xs italic">
                  No students matching criteria.
                </div>
              ) : (
                paginatedRoster.map((st) => {
                  const state = marksState[st.student_id] || { marks: "", isAbsent: false, isOD: false, remarks: "" };
                  const marksNum = state.marks.trim() !== "" && !state.isAbsent ? parseFloat(state.marks) : null;
                  const { grade, label, color } = computeGrade(marksNum, state.isAbsent, globalMaxMarks, globalPassingMarks);
                  const isAlreadySubmitted = st.marks_obtained !== null && st.marks_obtained !== undefined;

                  return (
                    <div key={st.student_id} className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-extrabold text-slate-900 text-sm">{st.student_name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{st.roll_number || st.student_id} · {st.classGroup || st.department || "General"}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!isExamOver}
                          onClick={() => handleToggleStudentAttendance(st.student_id)}
                          className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer border shadow-2xs ${
                            state.isAbsent
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : state.isOD
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          } disabled:opacity-60`}
                        >
                          {state.isAbsent ? "Absent" : state.isOD ? "OD" : "Present"}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 items-center">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Marks (/{globalMaxMarks})</label>
                          {!isExamOver ? (
                            <div className="py-2 px-3 bg-slate-100 text-slate-400 font-bold text-xs rounded-lg border border-slate-200 text-center">
                              🔒 Locked
                            </div>
                          ) : isAlreadySubmitted ? (
                            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                              <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg">{st.marks_obtained}</span>
                              <span className="text-[10px] text-emerald-600 font-bold">Saved</span>
                            </div>
                          ) : state.isAbsent ? (
                            <div className="py-2 px-3 bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs rounded-lg text-center">
                              Absent
                            </div>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={globalMaxMarks}
                              placeholder={`0-${globalMaxMarks}`}
                              value={state.marks}
                              onChange={(e) => handleMarkChange(st.student_id, e.target.value)}
                              className="w-full min-h-[44px] px-3 py-2 text-sm font-bold border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                            />
                          )}
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 block mb-1 uppercase tracking-wider">Grade &amp; Status</label>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase border ${color}`}>
                              {grade}
                            </span>
                            <span className="text-xs text-slate-500 font-medium truncate">{label}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <input
                          type="text"
                          placeholder="Feedback / Remarks..."
                          value={state.remarks}
                          disabled={!isExamOver}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMarksState(prev => ({
                              ...prev,
                              [st.student_id]: { ...prev[st.student_id], remarks: val }
                            }));
                          }}
                          className="w-full min-h-[40px] px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table (>= md) */}
            <div className="hidden md:block overflow-x-auto max-h-[550px] scroll-touch">
              <Table className="w-full text-left text-xs border-collapse min-w-[850px]">
                <TableHeader className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-200 z-10">
                  <TableRow className="hover:bg-slate-50">
                    <TableHead className="p-3 text-center w-12">#</TableHead>
                    <TableHead className="p-3">Student Details</TableHead>
                    <TableHead className="p-3">Class / Cohort</TableHead>
                    <TableHead className="p-3 text-center w-36">Exam Attendance</TableHead>
                    <TableHead className="p-3 w-44 text-center">Marks Obtained</TableHead>
                    <TableHead className="p-3 text-center w-24">Scale</TableHead>
                    <TableHead className="p-3 text-center w-28">Grade</TableHead>
                    <TableHead className="p-3">Remarks / Feedback</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                  {loadingRoster ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-12 text-center text-slate-400 font-bold">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-600 mb-2" />
                        Loading student evaluation roster...
                      </TableCell>
                    </TableRow>
                  ) : filteredRoster.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-10 text-center text-slate-400 font-medium italic">
                        No students matching the selected filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRoster.map((st, idx) => {
                      const state = marksState[st.student_id] || { marks: "", isAbsent: false, remarks: "" };
                      const marksNum = state.marks.trim() !== "" && !state.isAbsent ? parseFloat(state.marks) : null;
                      const { grade, label, color } = computeGrade(marksNum, state.isAbsent, globalMaxMarks, globalPassingMarks);
                      const isAlreadySubmitted = st.marks_obtained !== null && st.marks_obtained !== undefined;
                      const pendingReqMark = pendingEditRequests[st.student_id];

                      return (
                        <TableRow key={st.student_id} className="hover:bg-slate-50/70 transition-colors">
                          <TableCell className="p-3 text-center font-mono text-[11px] text-slate-400">
                            {(rosterPage - 1) * rosterPageSize + idx + 1}
                          </TableCell>
                          <TableCell className="p-3">
                            <div className="font-extrabold text-slate-900">{st.student_name}</div>
                            <div className="font-mono text-[10px] text-slate-400">{st.roll_number || st.student_id}</div>
                          </TableCell>
                          <TableCell className="p-3">
                            <span className="font-semibold text-slate-700">{st.classGroup || st.department || "General"}</span>
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            <button
                              type="button"
                              disabled={!isExamOver}
                              onClick={() => handleToggleStudentAttendance(st.student_id)}
                              className={`px-3 py-1 rounded-full text-[11px] font-black uppercase transition-all cursor-pointer border shadow-2xs ${
                                state.isAbsent
                                  ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                  : state.isOD
                                  ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              } disabled:opacity-60 disabled:cursor-not-allowed`}
                              title="Click to toggle Present → Absent → OD"
                            >
                              {state.isAbsent ? "Absent (AB)" : state.isOD ? "On Duty (OD)" : "Present (P)"}
                            </button>
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            {!isExamOver ? (
                              <div className="py-1.5 px-3 bg-slate-100 text-slate-400 font-black text-xs rounded-xl border border-slate-200 text-center">
                                🔒 Locked
                              </div>
                            ) : isAlreadySubmitted ? (
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-black text-sm text-slate-900 px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg">
                                  {st.marks_obtained}
                                </span>
                                {pendingReqMark ? (
                                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black uppercase">
                                    Req: {pendingReqMark} (Pending CM)
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingStudent(st);
                                      setProposedMark(String(st.marks_obtained));
                                      setEditReason("");
                                      setEditRequestModalOpen(true);
                                    }}
                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[9.5px] font-black uppercase inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                    title="Marks have been submitted. Click to request CM approval to edit mark."
                                  >
                                    <Edit3 className="h-3 w-3" />
                                    <span>Edit (Req CM)</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="relative inline-block w-28">
                                <input
                                  type="number"
                                  min={0}
                                  max={globalMaxMarks}
                                  step="0.5"
                                  aria-label="Marks Obtained"
                                  disabled={state.isAbsent}
                                  placeholder="—"
                                  value={state.isAbsent ? "" : state.marks}
                                  onChange={(e) => {
                                    const rawVal = e.target.value;
                                    if (rawVal === "") {
                                      setMarksState(prev => ({ ...prev, [st.student_id]: { ...prev[st.student_id], marks: "", isAbsent: false } }));
                                      return;
                                    }
                                    let num = parseFloat(rawVal);
                                    if (isNaN(num)) num = 0;
                                    if (num > globalMaxMarks) num = globalMaxMarks;
                                    if (num < 0) num = 0;

                                    setMarksState(prev => ({
                                      ...prev,
                                      [st.student_id]: {
                                        ...prev[st.student_id],
                                        marks: String(num),
                                        isAbsent: false
                                      }
                                    }));
                                  }}
                                  className="w-full text-center font-black text-sm text-slate-900 bg-sunken border border-slate-200 inset-shadow-well rounded-xl py-1.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="p-3 text-center font-bold text-slate-500 font-mono text-[11px]">
                            / {globalMaxMarks}
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${color}`}>
                              {grade}
                            </span>
                          </TableCell>
                          <TableCell className="p-3">
                            <input
                              type="text"
                              aria-label="Remarks / Feedback"
                              disabled={!isExamOver}
                              placeholder="Feedback / Remarks..."
                              value={state.remarks}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMarksState(prev => ({
                                  ...prev,
                                  [st.student_id]: {
                                    ...prev[st.student_id],
                                    remarks: val
                                  }
                                }));
                              }}
                              className="w-full px-2.5 py-1 text-xs border border-slate-200 inset-shadow-well rounded-lg bg-sunken focus:bg-white focus:outline-none focus:border-indigo-500 disabled:bg-slate-100"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Table Footer with Pagination */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-semibold">
                Showing {filteredRoster.length} of {roster.length} students enrolled
              </span>

              {filteredRoster.length > 0 && (
                <div className="flex-1 max-w-md">
                  <Pagination
                    currentPage={rosterPage}
                    totalItems={filteredRoster.length}
                    pageSize={rosterPageSize}
                    onPageChange={setRosterPage}
                    onPageSizeChange={(newSize) => {
                      setRosterPageSize(newSize);
                      setRosterPage(1);
                    }}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveMarks}
                  disabled={!isExamOver || isSavingMarks || loadingRoster}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSavingMarks ? "Saving..." : "Save & Publish Marks"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ── POPUP MODAL: Request CAM Approval to Edit Marks ── */}
          {editRequestModalOpen && editingStudent && selectedExam && (
            <Dialog
              open={true}
              onOpenChange={(next) => {
                if (!next) {
                  setEditRequestModalOpen(false);
                  setEditingStudent(null);
                }
              }}
              ariaLabel="Request Marks Modification"
              overlayClassName="p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
              panelClassName="max-w-md max-h-[90vh] p-6 space-y-4 rounded-2xl"
            >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                      <Edit3 className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Request Marks Modification</h3>
                      <p className="text-[10.5px] text-slate-500 font-medium">CM Approval Required to alter submitted mark</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditRequestModalOpen(false);
                      setEditingStudent(null);
                    }}
                    aria-label="Close"
                    className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Student:</span>
                    <span className="font-bold text-slate-800">{editingStudent.student_name} ({editingStudent.roll_number})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Exam & Subject:</span>
                    <span className="font-bold text-slate-800">{selectedExam.exam_type} — {selectedExam.subject_name}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200/60 pt-1.5">
                    <span className="text-slate-500 font-semibold">Current Saved Mark:</span>
                    <span className="font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                      {editingStudent.marks_obtained ?? "—"} / {globalMaxMarks}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSubmitMarkEditRequest} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Proposed New Mark (Max: {globalMaxMarks})</label>
                    <input
                      type="number"
                      min={0}
                      max={globalMaxMarks}
                      step="0.5"
                      required
                      placeholder={`0 - ${globalMaxMarks}`}
                      value={proposedMark}
                      onChange={(e) => setProposedMark(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-black text-slate-900 focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Mandatory Justification / Reason</label>
                    <textarea
                      rows={3}
                      required
                      aria-label="Mandatory Justification / Reason"
                      placeholder="e.g. Paper re-evaluation verified by Head of Dept; correction in question 4 totaling."
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-600"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditRequestModalOpen(false);
                        setEditingStudent(null);
                      }}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingEditReq}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {isSubmittingEditReq ? "Submitting..." : "Send Request to CM"}
                    </button>
                  </div>
                </form>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
};
