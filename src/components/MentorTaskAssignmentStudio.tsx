"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  CheckCircle,
  Clock,
  RotateCcw,
  Download,
  Upload,
  Calendar,
  BookOpen,
  UserCheck,
  Search,
  PlusCircle,
  ExternalLink,
  FileSpreadsheet,
  AlertCircle,
  X,
  Loader2,
  RefreshCw,
  Building2,
  Check
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { Dialog } from "@/components/ui/dialog";
import {
  BULK_TASK_TEMPLATE_COLUMNS,
  BULK_TASK_TEMPLATE_HEADERS,
  BULK_TASK_TEMPLATE_COL_WIDTHS,
  validateAndParseBulkTaskRows,
  type ParsedBulkTask,
  type BulkTaskRowError
} from "@/lib/skillTaskBulkImport";

interface MentorTaskAssignmentStudioProps {
  role: "admin" | "sme";
  currentCollegeId?: string;
  reviewerName?: string;
  onClose?: () => void;
  onTaskAssigned?: () => void;
}

interface MentorOption {
  id: string;
  name: string;
  email?: string;
  college_id?: string;
  department?: string;
  subjects?: string;
}

interface CollegeOption {
  id: string;
  name: string;
  code?: string;
}

interface SubjectOption {
  id: string;
  name: string;
  type?: string;
  semester?: string;
  department?: string;
  college_id?: string;
}

interface AssignedTaskItem {
  id: string;
  mentor_id: string;
  employee_id?: string;
  mentor_name: string;
  college_id?: string;
  department?: string;
  subject: string;
  semester?: string;
  week_number: number;
  task_number?: number;
  task_given_date: string;
  deadline?: string;
  submission_date?: string | null;
  topic: string;
  description?: string;
  instructions?: string;
  reference_url?: string;
  assigned_by?: string;
  assigned_role?: string;
  submission_link?: string;
  status: "pending" | "cleared" | "not_cleared" | "needs_revision";
  score?: number | null;
  remarks?: string | null;
  created_at?: string;
}

export const MentorTaskAssignmentStudio: React.FC<MentorTaskAssignmentStudioProps> = ({
  role,
  currentCollegeId,
  reviewerName,
  onClose,
  onTaskAssigned
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form State
  const [selectedCollege, setSelectedCollege] = useState<string>(currentCollegeId || "all");
  const [selectedMentorId, setSelectedMentorId] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<string>("Semester 1");
  const [topicName, setTopicName] = useState<string>("");
  const [taskGivenDate, setTaskGivenDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [taskDescription, setTaskDescription] = useState<string>("");
  const [referenceUrl, setReferenceUrl] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Bulk Import Modal State
  const [bulkModalOpen, setBulkModalOpen] = useState<boolean>(false);
  const [parsedBulkTasks, setParsedBulkTasks] = useState<ParsedBulkTask[]>([]);
  const [bulkRowErrors, setBulkRowErrors] = useState<BulkTaskRowError[]>([]);
  const [bulkTotalRows, setBulkTotalRows] = useState<number>(0);
  const [bulkFileName, setBulkFileName] = useState<string>("");
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const resetBulkState = () => {
    setParsedBulkTasks([]);
    setBulkRowErrors([]);
    setBulkTotalRows(0);
    setBulkFileName("");
  };

  // Search Filter for History Table
  const [historySearch, setHistorySearch] = useState<string>("");

  // Fetch Metadata & Recent Tasks
  const tasksQuery = useQuery({
    queryKey: ["mentor-skill-tasks", selectedCollege],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCollege && selectedCollege !== "all") params.set("collegeId", selectedCollege);
      const res = await apiFetch(`/api/skill-tracker/tasks?${params.toString()}`);
      if (!res?.success) throw new Error(res?.message || "Failed to load tasks metadata");
      return res as {
        mentors: MentorOption[];
        allMentors?: MentorOption[];
        colleges: CollegeOption[];
        skillSubjects: SubjectOption[];
        assignedTasks: AssignedTaskItem[];
      };
    }
  });

  const mentors = tasksQuery.data?.mentors || [];
  const allMentors = tasksQuery.data?.allMentors || mentors;
  const colleges = tasksQuery.data?.colleges || [];
  const skillSubjects = tasksQuery.data?.skillSubjects || [];
  const assignedTasks = tasksQuery.data?.assignedTasks || [];
  const loading = tasksQuery.isPending;

  // Selected Mentor details
  const selectedMentor = useMemo(() => {
    return mentors.find(m => m.id === selectedMentorId) || null;
  }, [mentors, selectedMentorId]);

  const selectedMentorCampus = useMemo(() => {
    if (!selectedMentor?.college_id) return "";
    return colleges.find(c => c.id === selectedMentor.college_id)?.name || "";
  }, [selectedMentor, colleges]);

  // Filtered Subject Options (prioritize mentor's assigned subjects if available)
  const availableSubjects = useMemo(() => {
    if (!selectedMentor?.subjects) return skillSubjects;
    const mentorSubjNames = selectedMentor.subjects.split(",").map(s => s.trim().toLowerCase());
    const matched = skillSubjects.filter(s => mentorSubjNames.includes(s.name.toLowerCase()));
    return matched.length > 0 ? matched : skillSubjects;
  }, [selectedMentor, skillSubjects]);

  // Handle Single Task Submit
  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMentorId) {
      toast("Please select a faculty mentor.", "warning");
      return;
    }
    if (!selectedSubject) {
      toast("Please select a skill subject.", "warning");
      return;
    }
    if (!topicName.trim()) {
      toast("Please enter a topic name for the task.", "warning");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/skill-tracker/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mentorId: selectedMentorId,
          mentorName: selectedMentor?.name || selectedMentorId,
          collegeId: selectedMentor?.college_id || (selectedCollege !== "all" ? selectedCollege : undefined),
          department: selectedMentor?.department,
          subject: selectedSubject,
          semester: selectedSemester,
          topic: topicName.trim(),
          taskGivenDate: taskGivenDate || new Date().toISOString().slice(0, 10),
          weekNumber: weekNumber || 1,
          description: taskDescription.trim() || undefined,
          referenceUrl: referenceUrl.trim() || undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        toast(`Task assigned successfully to ${selectedMentor?.name || "mentor"}!`, "success");
        // Reset inputs
        setTopicName("");
        setTaskDescription("");
        setReferenceUrl("");
        setWeekNumber(prev => Math.min(16, prev + 1));
        // Invalidate queries
        tasksQuery.refetch();
        queryClient.invalidateQueries({ queryKey: ["skill-tracker"] });
        if (onTaskAssigned) onTaskAssigned();
      } else {
        toast(data.message || "Failed to assign task", "error");
      }
    } catch (err: any) {
      toast("Error assigning task: " + err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download Bulk Import Template (Sheet 1: ready-to-fill template, Sheet 2: live ref data, Sheet 3: field guide + sample)
  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      const collegeMap = new Map(colleges.map(c => [c.id, c.name]));

      // Sheet 1: Empty upload template with exact headers (no sample rows to accidentally import)
      const wsTemplate = XLSX.utils.aoa_to_sheet([BULK_TASK_TEMPLATE_HEADERS]);
      wsTemplate["!cols"] = BULK_TASK_TEMPLATE_COL_WIDTHS;

      // Sheet 2: Live reference list of Mentors and Skill Courses
      const refMentors = mentors.length > 0 ? mentors : allMentors;
      const seenCourseKeys = new Set<string>();
      const uniqueSkillCourses = skillSubjects.filter(s => {
        const key = `${s.name.toLowerCase()}|${(s.semester || "").toLowerCase()}`;
        if (seenCourseKeys.has(key)) return false;
        seenCourseKeys.add(key);
        return true;
      });

      const refHeader = ["Employee ID", "Mentor Name", "Email ID", "Campus", "", "Skill Course Name", "Semester"];
      const maxRefLen = Math.max(refMentors.length, uniqueSkillCourses.length, 1);
      const refRows: any[][] = [refHeader];
      for (let i = 0; i < maxRefLen; i++) {
        const m = refMentors[i];
        const s = uniqueSkillCourses[i];
        refRows.push([
          m ? m.id : "",
          m ? m.name : "",
          m ? (m.email || "") : "",
          m && m.college_id ? (collegeMap.get(m.college_id) || m.college_id) : "",
          "",
          s ? s.name : "",
          s ? (s.semester || "Semester 1") : ""
        ]);
      }
      const wsRef = XLSX.utils.aoa_to_sheet(refRows);
      wsRef["!cols"] = [
        { wch: 18 },
        { wch: 26 },
        { wch: 30 },
        { wch: 24 },
        { wch: 4 },
        { wch: 32 },
        { wch: 14 }
      ];

      // Sheet 3: Field Guide + 1 completed example row
      const sampleMentor = refMentors[0];
      const sampleCourse = uniqueSkillCourses[0];
      const sampleDeadline = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const guideRows: any[][] = [
        ["Column Header", "Required", "Accepted Format & Notes"],
        ...BULK_TASK_TEMPLATE_COLUMNS.map(col => [
          col.header,
          col.required ? "Required" : "Optional",
          col.description
        ]),
        [],
        ["Sample Filled Row (Copy format into Sheet 1 - Task_Import_Template)"],
        BULK_TASK_TEMPLATE_HEADERS,
        [
          1,
          sampleMentor?.id || "EMP001",
          sampleMentor?.name || "Dr. Ramesh Kumar",
          sampleMentor?.email || "ramesh.k@faceprep.ed.in",
          (sampleMentor?.college_id && collegeMap.get(sampleMentor.college_id)) || colleges[0]?.name || "Main Campus",
          sampleCourse?.name || "Full Stack Development",
          sampleCourse?.semester || "Semester 5",
          1,
          "Building REST APIs with Express",
          sampleDeadline,
          "Implement 5 CRUD endpoints with JWT authentication and test cases.",
          "https://drive.google.com/sample-guide.pdf"
        ]
      ];
      const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
      wsGuide["!cols"] = [
        { wch: 26 },
        { wch: 16 },
        { wch: 68 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsTemplate, "Task_Import_Template");
      XLSX.utils.book_append_sheet(wb, wsRef, "Mentors_And_Courses_Ref");
      XLSX.utils.book_append_sheet(wb, wsGuide, "Field_Guide");
      XLSX.writeFile(wb, "Mentor_Skill_Task_Import_Template.xlsx");
      toast("Downloaded bulk task import template (.xlsx).", "success");
    } catch (e: any) {
      toast("Error generating template: " + e.message, "error");
    }
  };

  // File Upload & Strict Validation for Bulk Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkFileName(file.name);
    setParsedBulkTasks([]);
    setBulkRowErrors([]);
    setBulkTotalRows(0);

    try {
      const XLSX = await import("xlsx");
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const targetSheetName = wb.Sheets["Task_Import_Template"]
        ? "Task_Import_Template"
        : wb.SheetNames[0];
      const sheet = wb.Sheets[targetSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const result = validateAndParseBulkTaskRows(rows, {
        mentors: allMentors,
        colleges,
        skillSubjects
      });

      setBulkTotalRows(result.totalDataRows);
      setParsedBulkTasks(result.validTasks);
      setBulkRowErrors(result.rowErrors);

      if (result.totalDataRows === 0) {
        toast("The template sheet has no task rows yet. Add rows in Sheet 1 starting at Row 2.", "warning");
      } else if (result.rowErrors.length > 0) {
        toast(`Found ${result.rowErrors.length} row error(s). Please fix them before importing.`, "warning");
      } else {
        toast(`Validated ${result.validTasks.length} task(s) with 0 errors. Ready to import.`, "success");
      }
    } catch (err: any) {
      toast("Failed to parse file: " + err.message, "error");
    } finally {
      // Allow re-uploading the same filename after edits
      e.target.value = "";
    }
  };

  // Execute Bulk Import
  const handleExecuteBulkImport = async () => {
    if (bulkRowErrors.length > 0) {
      toast("Please resolve all spreadsheet row errors before importing.", "warning");
      return;
    }
    if (parsedBulkTasks.length === 0) {
      toast("No valid tasks to import.", "warning");
      return;
    }

    try {
      setIsImporting(true);
      const res = await fetch("/api/skill-tracker/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: parsedBulkTasks })
      });

      const data = await res.json();
      if (data.success) {
        if (data.rejectedCount > 0) {
          toast(`Imported ${data.count} task(s); ${data.rejectedCount} row(s) rejected by server.`, "warning");
        } else {
          toast(`Successfully imported ${data.count} skill task(s)!`, "success");
        }
        setBulkModalOpen(false);
        resetBulkState();
        tasksQuery.refetch();
        queryClient.invalidateQueries({ queryKey: ["skill-tracker"] });
        if (onTaskAssigned) onTaskAssigned();
      } else {
        toast(data.message || "Failed to import tasks", "error");
      }
    } catch (err: any) {
      toast("Error importing tasks: " + err.message, "error");
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return assignedTasks;
    return assignedTasks.filter(t =>
      t.mentor_name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.topic.toLowerCase().includes(q) ||
      (t.assigned_by || "").toLowerCase().includes(q)
    );
  }, [assignedTasks, historySearch]);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-zinc-900 text-amber-400 border border-white/10 shadow-xs flex items-center justify-center shrink-0">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Mentor Skill Task Assignment
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-zinc-900 text-zinc-100 border border-zinc-800">
                  {role === "admin" ? "Admin Oversight" : "SME Task Studio"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-50 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98"
              title="Download Excel template for bulk task assignment"
            >
              <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Download Template (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setBulkModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98"
            >
              <Upload className="h-4 w-4 text-amber-500" />
              <span>Bulk Import Tasks</span>
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Back to Skill Tracker"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="pt-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" />
              <span>Campus:</span>
            </label>
            <select
              aria-label="Campus / College Scope"
              value={selectedCollege}
              onChange={e => setSelectedCollege(e.target.value)}
              className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
            >
              <option value="all">All Campuses</option>
              {colleges.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => tasksQuery.refetch()}
            disabled={tasksQuery.isFetching}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${tasksQuery.isFetching ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Form on Left (or Top) and History Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Task Assignment Form */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <PlusCircle className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Assign New Skill Task
            </h3>
          </div>

          <form onSubmit={handleAssignTask} className="space-y-3.5">
            {/* Mentor Selector */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Faculty Mentor (Emp ID / Name) *
              </label>
              <select
                aria-label="Faculty Mentor"
                value={selectedMentorId}
                onChange={e => {
                  setSelectedMentorId(e.target.value);
                  const m = mentors.find(x => x.id === e.target.value);
                  if (m?.subjects) {
                    const firstSubj = m.subjects.split(",")[0]?.trim();
                    if (firstSubj) setSelectedSubject(firstSubj);
                  }
                }}
                required
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
              >
                <option value="">-- Select Faculty Mentor --</option>
                {mentors.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} [{m.id}] {m.email ? `• ${m.email}` : ""}
                  </option>
                ))}
              </select>

              {/* Matched Mentor Info Pill / Card */}
              {selectedMentor && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-slate-100">
                      <UserCheck className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>{selectedMentor.name}</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md font-mono font-black text-[10px] bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
                      ID: {selectedMentor.id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                    <span>Email: <strong className="text-slate-700 dark:text-slate-300">{selectedMentor.email || "—"}</strong></span>
                    <span>Campus: <strong className="text-slate-700 dark:text-slate-300">{selectedMentorCampus || colleges.find(c => c.id === selectedCollege)?.name || "All Campuses"}</strong></span>
                  </div>
                </div>
              )}
            </div>

            {/* Subject Selector */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Skill Course Name *
              </label>
              <select
                aria-label="Skill Course Name"
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                required
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
              >
                <option value="">-- Select Skill Course --</option>
                {availableSubjects.map(s => (
                  <option key={s.id || s.name} value={s.name}>
                    {s.name} ({s.type || "Skill"})
                  </option>
                ))}
              </select>
            </div>

            {/* Semester & Task Number */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Semester
                </label>
                <select
                  aria-label="Semester"
                  value={selectedSemester}
                  onChange={e => setSelectedSemester(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
                >
                  {Array.from({ length: 8 }, (_, i) => `Semester ${i + 1}`).map(sem => (
                    <option key={sem} value={sem}>{sem}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Task Number (Max 40) *
                </label>
                <select
                  aria-label="Task Number"
                  value={weekNumber}
                  onChange={e => setWeekNumber(parseInt(e.target.value, 10))}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
                >
                  {Array.from({ length: 40 }, (_, i) => i + 1).map(wk => (
                    <option key={wk} value={wk}>Task {wk}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Topic Name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Task Title / Topic *
              </label>
              <input
                type="text"
                value={topicName}
                onChange={e => setTopicName(e.target.value)}
                required
                placeholder="e.g. Dynamic Programming - 0/1 Knapsack"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>

            {/* Deadline */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Deadline / Target Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={taskGivenDate}
                  onChange={e => setTaskGivenDate(e.target.value)}
                  required
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>
            </div>

            {/* Instructions / Objectives */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Instructions / Objectives
              </label>
              <textarea
                value={taskDescription}
                onChange={e => setTaskDescription(e.target.value)}
                rows={2}
                placeholder="Specific guidance, code exercises, or topics to prepare..."
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-none"
              />
            </div>

            {/* Reference URL / Guideline Link */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Reference Material (Link)
              </label>
              <input
                type="url"
                value={referenceUrl}
                onChange={e => setReferenceUrl(e.target.value)}
                placeholder="https://drive.google.com/... or syllabus doc link"
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold text-white btn-gradient disabled:opacity-50 transition-all cursor-pointer shadow-xs hover:scale-102 active:scale-98 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  <span>Assigning Task...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 text-amber-400" />
                  <span>Assign Task to Mentor</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Assigned Tasks Oversight & History */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Assigned Skill Tasks ({filteredHistory.length})
              </h3>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search mentor, topic..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400 text-xs font-medium flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading task records...</span>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-medium italic">
                No skill tasks found matching your filter. Use the form on the left to assign the first task!
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="p-2.5 min-w-[90px]">Employee ID</th>
                    <th className="p-2.5 min-w-[130px]">Mentor Name</th>
                    <th className="p-2.5">Skill Course</th>
                    <th className="p-2.5 text-center">Task No</th>
                    <th className="p-2.5">Topic</th>
                    <th className="p-2.5">Deadline</th>
                    <th className="p-2.5">Submission Date</th>
                    <th className="p-2.5 text-center">Submission Link</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filteredHistory.map(task => (
                    <tr key={task.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {task.mentor_id}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100">{task.mentor_name}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{task.subject}</div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Task {task.week_number}
                        </span>
                      </td>
                      <td className="p-2.5 max-w-[200px]">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate" title={task.topic}>
                          {task.topic}
                        </div>
                        {task.description && (
                          <div className="text-[10px] text-slate-400 truncate" title={task.description}>
                            {task.description}
                          </div>
                        )}
                        {task.assigned_by && (
                          <div className="text-[9px] text-slate-400">
                            By {task.assigned_by}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 font-bold text-[11px]">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>{task.deadline || task.task_given_date || "—"}</span>
                        </div>
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          {task.submission_date || (task.submission_link ? "Submitted" : "—")}
                        </span>
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        {task.submission_link ? (
                          <a
                            href={task.submission_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 hover:underline"
                          >
                            <span>View Proof</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">Pending</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          task.status === "cleared"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : task.status === "not_cleared"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : task.status === "needs_revision"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}>
                          {task.status === "cleared" && <Check className="h-3 w-3" />}
                          {task.status === "pending" && <Clock className="h-3 w-3" />}
                          <span>{task.status.replace("_", " ")}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Import Modal */}
      {bulkModalOpen && (
        <Dialog
          open={true}
          onOpenChange={(open) => { if (!open) setBulkModalOpen(false); }}
          ariaLabel="Bulk Import Skill Tasks"
          overlayClassName="z-[200] p-4 bg-black/40 backdrop-blur-xs"
          panelClassName="max-w-2xl max-h-[90vh] p-6 space-y-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Upload className="h-4 w-4 text-amber-500" />
                <span>Bulk Import Mentor Skill Tasks</span>
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setBulkModalOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[68vh] pr-1">
            {/* Step 1: Download Template */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Step 1: Download Bulk Import Template</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  Fill rows in Sheet 1 (`Task_Import_Template`). Copy IDs &amp; courses from `Mentors_And_Courses_Ref`.
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-emerald-200 dark:border-emerald-800 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Download Template (.xlsx)</span>
              </button>
            </div>

            {/* Step 2: Upload File */}
            <div className="p-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center space-y-2 hover:border-amber-400 transition-colors">
              <FileSpreadsheet className="h-8 w-8 text-amber-500 mx-auto" />
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {bulkFileName ? bulkFileName : "Step 2: Choose filled Excel (.xlsx) or CSV file"}
              </div>
              <p className="text-[10px] text-slate-400">Accepted formats: .xlsx, .xls, .csv</p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="px-3.5 py-1.5 btn-gradient text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs inline-flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5 text-amber-400" />
                    <span>{bulkFileName ? "Replace Spreadsheet" : "Select Spreadsheet"}</span>
                  </span>
                </label>
                {bulkFileName && (
                  <button
                    type="button"
                    onClick={resetBulkState}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Validation Errors Box */}
            {bulkRowErrors.length > 0 && (
              <div className="space-y-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900">
                <div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{bulkRowErrors.length} row(s) have validation errors — fix these in your sheet to import safely</span>
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {bulkRowErrors.map((errItem) => (
                    <div
                      key={errItem.rowNumber}
                      className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-rose-100 dark:border-rose-900/60 text-[11px]"
                    >
                      <div className="font-extrabold text-rose-700 dark:text-rose-400">
                        Row {errItem.rowNumber}
                        {(errItem.employeeId || errItem.mentorName) && (
                          <span className="text-slate-600 dark:text-slate-300 font-semibold ml-1.5">
                            ({[errItem.employeeId, errItem.mentorName].filter(Boolean).join(" - ")})
                          </span>
                        )}
                      </div>
                      <ul className="list-disc list-inside text-rose-600 dark:text-rose-300 mt-0.5 space-y-0.5">
                        {errItem.errors.map((msg, i) => (
                          <li key={i}>{msg}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parsed Valid Tasks Preview */}
            {parsedBulkTasks.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center justify-between gap-1">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>{parsedBulkTasks.length} valid task(s) parsed {bulkTotalRows > 0 ? `(out of ${bulkTotalRows} row(s))` : ""}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Schema validated</span>
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                  {parsedBulkTasks.map((t, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div className="min-w-[120px]">
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 block">{t.mentorName}</span>
                        <span className="text-[9px] font-mono text-slate-400 block">
                          Row {t.rowNumber} • {t.employeeId || t.mentorId}
                        </span>
                      </div>
                      <div className="min-w-[100px]">
                        <span className="font-bold text-slate-700 dark:text-slate-300 block truncate max-w-[120px]">{t.subject}</span>
                        <span className="text-[9px] text-amber-600 font-extrabold block">
                          Task {t.taskNumber} • {t.semester}
                        </span>
                      </div>
                      <div className="flex-1 truncate max-w-[170px]">
                        <span className="font-bold text-slate-900 dark:text-slate-100 block truncate" title={t.topic}>{t.topic}</span>
                        {t.instructions && <span className="text-[9px] text-slate-400 block truncate" title={t.instructions}>{t.instructions}</span>}
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 block">Due: {t.deadline}</span>
                        {t.campus && <span className="text-[9px] text-slate-400 block truncate max-w-[85px]">{t.campus}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setBulkModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteBulkImport}
              disabled={parsedBulkTasks.length === 0 || bulkRowErrors.length > 0 || isImporting}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-white btn-gradient disabled:opacity-50 cursor-pointer transition-all shadow-xs flex items-center gap-1.5"
            >
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <Upload className="h-3.5 w-3.5 text-amber-400" />}
              <span>Import {parsedBulkTasks.length} Task{parsedBulkTasks.length === 1 ? "" : "s"}</span>
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};
