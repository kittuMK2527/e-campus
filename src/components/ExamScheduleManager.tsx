"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { announceDataChanged } from "@/lib/dataSync";
import { getLocalDateStr } from "@/lib/localDate";
import { qk } from "@/lib/queryKeys";
import { getSemestersForCourse } from "@/lib/semesters";
import { generateId } from "@/lib/id";
import {
  Award,
  Calendar,
  Clock,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Download,
  Search,
  BookOpen,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
  Layers,
  Sparkles,
  Printer,
  CalendarRange,
  RefreshCw,
  Building2,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  ArrowLeft
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import {
  getCollegeOperatingHours,
  parseTimeToMinutes
} from "@/lib/utils";

interface ExamSchedule {
  id: string;
  college_id: string;
  department: string;
  semester: string;
  exam_type: string;
  subject_name: string;
  subject_code?: string;
  subject_type?: string;
  exam_date: string;
  session_time: string;
  start_time: string;
  end_time: string;
  day_order?: string;
  hall_room?: string;
  max_marks?: number;
  passing_marks?: number;
  created_by?: string;
  status: "Scheduled" | "Ongoing" | "Completed" | "Cancelled";
  created_at?: string;
}

interface SubjectFormRow {
  subject_name: string;
  subject_code?: string;
  subject_type?: string;
  included: boolean;
  exam_date: string;
  day_order: string;
  start_time: string;
  end_time: string;
  hall_room?: string;
}

const PRESET_EXAM_SUGGESTIONS = [
  "CIA 1",
  "CIA 2",
  "CIA 3",
  "Model Exam",
  "Unit Test 1",
  "Unit Test 2",
  "Mid-Term Assessment",
  "Practical Lab Exam",
  "End Semester Final"
];

export const ExamScheduleManager: React.FC<{
  /** Admin passes the campus it is inspecting; CMs fall back to their own college. */
  overrideCollegeId?: string;
  /** Who the schedule is attributed to when there is no signed-in Campus Manager. */
  actorName?: string;
  /** When rendered within an existing tab container with its own PageHeader (e.g. ExaminationsTab) */
  embedded?: boolean;
}> = ({ overrideCollegeId, actorName, embedded = false }) => {
  const { currentCAM, departmentsList, coursesList, subjectsList, colleges, slots } = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const queryClient = useQueryClient();

  const [selectedDeptFilter, setSelectedDeptFilter] = useState("all");
  const [selectedSemFilter, setSelectedSemFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sub-Tab Switcher: Timetable Schedule vs Performance & Marks Registry
  const [activeMainTab, setActiveMainTab] = useState<"schedules" | "marks_registry">("schedules");
  const [marksExamTypeFilter, setMarksExamTypeFilter] = useState<string>("all");
  const [marksDeptFilter, setMarksDeptFilter] = useState<string>("all");
  const [marksStatusFilter, setMarksStatusFilter] = useState<"all" | "passed" | "arrears" | "absent">("all");
  const [marksSearchQuery, setMarksSearchQuery] = useState<string>("");

  // Accordion open/close state for dashboard groups
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  // Modal: Batch Timetable Creator Popup
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [batchExamName, setBatchExamName] = useState("CIA 1");
  const [batchDept, setBatchDept] = useState("");
  const [batchSem, setBatchSem] = useState("Semester 1");
  const [batchStartDate, setBatchStartDate] = useState(getLocalDateStr());
  const [batchDefaultHall, setBatchDefaultHall] = useState("");
  const [batchDefaultDayOrder, setBatchDefaultDayOrder] = useState("Day 1");
  const [batchCustomStartTime, setBatchCustomStartTime] = useState("10:00 AM");
  const [batchCustomEndTime, setBatchCustomEndTime] = useState("01:00 PM");

  // Subject rows inside modal accordion
  const [subjectRows, setSubjectRows] = useState<SubjectFormRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const collegeId = overrideCollegeId || currentCAM?.college_id || colleges[0]?.id || "";

  // Helper to format 12-hour time string
  const formatTimeLabel = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? "PM" : "AM";
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    const displayMinutes = minutes < 10 ? "0" + minutes : String(minutes);
    return `${String(displayHours).padStart(2, "0")}:${displayMinutes} ${ampm}`;
  };

  // Helper to format minutes to 24h "HH:mm" for native <input type="time">
  const formatMinutesTo24h = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  // Helper to convert any time string (12h or 24h) to 24h "HH:mm" for <input type="time">
  const timeTo24h = (timeStr?: string): string => {
    if (!timeStr) return "";
    const clean = timeStr.trim();
    if (/^\d{2}:\d{2}$/.test(clean)) return clean;
    const mins = parseTimeToMinutes(clean);
    return formatMinutesTo24h(mins);
  };

  // Helper to convert any time string (24h or 12h) to canonical 12h format (e.g. "10:00 AM")
  const timeTo12h = (timeStr?: string): string => {
    if (!timeStr) return "";
    const mins = parseTimeToMinutes(timeStr);
    let hours = Math.floor(mins / 60) % 24;
    const minutes = mins % 60;
    const ampm = hours >= 12 ? "PM" : "AM";
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${ampm}`;
  };

  // College operating hours resolved from timetable slots and shift configurations
  const collegeHours = useMemo(() => {
    return getCollegeOperatingHours(collegeId, colleges, slots);
  }, [collegeId, colleges, slots]);

  // 24-hour boundary strings for native <input type="time" min="..." max="..." />
  const collegeMin24 = useMemo(() => formatMinutesTo24h(collegeHours.startMinutes), [collegeHours]);
  const collegeMax24 = useMemo(() => formatMinutesTo24h(collegeHours.endMinutes), [collegeHours]);

  // Handler for global batch start time input
  const handleBatchStartTimeChange = (newVal24: string) => {
    if (!newVal24) return;
    let mins = parseTimeToMinutes(newVal24);
    if (mins < collegeHours.startMinutes) {
      mins = collegeHours.startMinutes;
      toast(`Exam cannot start earlier than college opening time (${collegeHours.startTimeStr})`, "warning");
    } else if (mins > collegeHours.endMinutes) {
      mins = collegeHours.endMinutes;
      toast(`Exam cannot start later than college closing time (${collegeHours.endTimeStr})`, "warning");
    }

    const newStart12 = timeTo12h(formatMinutesTo24h(mins));
    setBatchCustomStartTime(newStart12);

    const currentEndMins = parseTimeToMinutes(batchCustomEndTime);
    let newEnd12 = batchCustomEndTime;
    if (currentEndMins <= mins) {
      const adjustedEndMins = Math.min(mins + 180, collegeHours.endMinutes);
      newEnd12 = timeTo12h(formatMinutesTo24h(adjustedEndMins));
      setBatchCustomEndTime(newEnd12);
    }

    setSubjectRows((prev) =>
      prev.map((r) => ({
        ...r,
        start_time: newStart12,
        end_time: currentEndMins <= mins ? newEnd12 : r.end_time
      }))
    );
  };

  // Handler for global batch end time input
  const handleBatchEndTimeChange = (newVal24: string) => {
    if (!newVal24) return;
    let mins = parseTimeToMinutes(newVal24);
    const startMins = parseTimeToMinutes(batchCustomStartTime);

    if (mins > collegeHours.endMinutes) {
      mins = collegeHours.endMinutes;
      toast(`Exam cannot end later than college closing time (${collegeHours.endTimeStr})`, "warning");
    } else if (mins < collegeHours.startMinutes) {
      mins = Math.min(startMins + 60, collegeHours.endMinutes);
      toast(`Exam end time cannot be earlier than college start time (${collegeHours.startTimeStr})`, "warning");
    } else if (mins <= startMins) {
      mins = Math.min(startMins + 60, collegeHours.endMinutes);
      toast("Exam end time must be after the start time", "warning");
    }

    const newEnd12 = timeTo12h(formatMinutesTo24h(mins));
    setBatchCustomEndTime(newEnd12);

    setSubjectRows((prev) =>
      prev.map((r) => ({
        ...r,
        end_time: newEnd12
      }))
    );
  };

  // Auto-syncs dates and day orders sequentially across subject rows
  const applyStartDateToRows = (newDate: string = batchStartDate, orderStr: string = batchDefaultDayOrder) => {
    if (!newDate) return;

    let currentDate = parseLocalDate(newDate);
    while (currentDate.getDay() === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const match = orderStr.match(/\d+/);
    const startDay = match ? parseInt(match[0], 10) : 1;

    let seqIdx = 0;
    setSubjectRows((prev) =>
      prev.map((row) => {
        if (!row.included) return row;
        if (seqIdx > 0) {
          currentDate.setDate(currentDate.getDate() + 1);
          while (currentDate.getDay() === 0) {
            currentDate.setDate(currentDate.getDate() + 1);
          }
        }
        const orderNum = ((startDay - 1 + seqIdx) % 6) + 1;
        seqIdx++;

        return {
          ...row,
          exam_date: formatLocalDate(currentDate),
          day_order: orderStr !== "None" ? `Day ${orderNum}` : row.day_order || "None",
          start_time: row.start_time || batchCustomStartTime,
          end_time: row.end_time || batchCustomEndTime
        };
      })
    );
  };

  // Handler for global batch start date change - auto-syncs dates sequentially to subject rows below
  const handleBatchStartDateChange = (newDate: string) => {
    setBatchStartDate(newDate);
    if (newDate) {
      applyStartDateToRows(newDate, batchDefaultDayOrder);
    }
  };

  // Handler for global batch day order change - auto-syncs day orders sequentially to subject rows below
  const handleBatchDayOrderChange = (newOrder: string) => {
    setBatchDefaultDayOrder(newOrder);
    applyStartDateToRows(batchStartDate, newOrder);
  };

  // Handler for individual subject row start time
  const handleRowStartTimeChange = (idx: number, newVal24: string) => {
    if (!newVal24) return;
    let mins = parseTimeToMinutes(newVal24);
    if (mins < collegeHours.startMinutes) {
      mins = collegeHours.startMinutes;
      toast(`Exam cannot start earlier than college opening time (${collegeHours.startTimeStr})`, "warning");
    } else if (mins > collegeHours.endMinutes) {
      mins = collegeHours.endMinutes;
      toast(`Exam cannot start later than college closing time (${collegeHours.endTimeStr})`, "warning");
    }

    const newStart12 = timeTo12h(formatMinutesTo24h(mins));
    const currentRow = subjectRows[idx];
    const currentEndMins = parseTimeToMinutes(currentRow?.end_time);
    const updates: Partial<SubjectFormRow> = { start_time: newStart12 };

    if (currentEndMins <= mins) {
      const adjustedEndMins = Math.min(mins + 180, collegeHours.endMinutes);
      updates.end_time = timeTo12h(formatMinutesTo24h(adjustedEndMins));
    }

    updateSubjectRow(idx, updates);
  };

  // Handler for individual subject row end time
  const handleRowEndTimeChange = (idx: number, newVal24: string) => {
    if (!newVal24) return;
    let mins = parseTimeToMinutes(newVal24);
    const currentRow = subjectRows[idx];
    const startMins = parseTimeToMinutes(currentRow?.start_time);

    if (mins > collegeHours.endMinutes) {
      mins = collegeHours.endMinutes;
      toast(`Exam cannot end later than college closing time (${collegeHours.endTimeStr})`, "warning");
    } else if (mins < collegeHours.startMinutes) {
      mins = Math.min(startMins + 60, collegeHours.endMinutes);
      toast(`Exam end time cannot be earlier than college start time (${collegeHours.startTimeStr})`, "warning");
    } else if (mins <= startMins) {
      mins = Math.min(startMins + 60, collegeHours.endMinutes);
      toast("Exam end time must be after the start time", "warning");
    }

    const newEnd12 = timeTo12h(formatMinutesTo24h(mins));
    updateSubjectRow(idx, { end_time: newEnd12 });
  };

  // Ensure default custom start and end times stay bounded within college operating hours
  useEffect(() => {
    const sMin = parseTimeToMinutes(batchCustomStartTime);
    const eMin = parseTimeToMinutes(batchCustomEndTime);
    if (sMin < collegeHours.startMinutes || sMin >= collegeHours.endMinutes) {
      setBatchCustomStartTime(formatTimeLabel(collegeHours.startMinutes));
    }
    if (eMin <= collegeHours.startMinutes || eMin > collegeHours.endMinutes) {
      const defaultEnd = Math.min(collegeHours.startMinutes + 180, collegeHours.endMinutes);
      setBatchCustomEndTime(formatTimeLabel(defaultEnd));
    }
  }, [collegeHours]);

  // Derive department options strictly from database
  const availableDepartments = useMemo(() => {
    const fromDepts = (departmentsList || [])
      .filter((d: any) => !d.college_id || d.college_id === collegeId)
      .map((d: any) => d.name.trim());
    const fromCourses = (coursesList || [])
      .filter((c: any) => !c.college_id || c.college_id === collegeId)
      .map((c: any) => c.name.trim());
    return Array.from(new Set([...fromDepts, ...fromCourses])).filter(Boolean).sort();
  }, [departmentsList, coursesList, collegeId]);

  // Set default selected department on load
  useEffect(() => {
    if (availableDepartments.length > 0 && !batchDept) {
      setBatchDept(availableDepartments[0]);
    }
  }, [availableDepartments, batchDept]);

  const batchSemesters = useMemo(() => {
    const matched = (coursesList || []).find(c => c.name.toLowerCase() === batchDept.toLowerCase());
    return getSemestersForCourse(matched?.years || 3);
  }, [coursesList, batchDept]);

  const allAvailableSemesters = useMemo(() => {
    const maxYears = Math.max(...(coursesList || []).map(c => c.years || 3), 3);
    return getSemestersForCourse(maxYears);
  }, [coursesList]);

  const examsQuery = useQuery({
    queryKey: qk.exams(collegeId),
    queryFn: async () => {
      const data = await apiFetch(`/api/exams?college_id=${encodeURIComponent(collegeId)}`);
      return data?.success && Array.isArray(data.exams) ? (data.exams as ExamSchedule[]) : [];
    },
  });
  const exams = examsQuery.data || [];
  const isInitialLoading = examsQuery.isPending && exams.length === 0;
  const isSyncing = examsQuery.isFetching && exams.length > 0;

  useEffect(() => {
    if (exams.length > 0) {
      const firstKey = `${exams[0].exam_type}_${exams[0].department}_${exams[0].semester}`;
      setOpenAccordions((prev) => (prev[firstKey] ? prev : { ...prev, [firstKey]: true }));
    }
  }, [exams]);

  const marksQuery = useQuery({
    queryKey: qk.examMarks(collegeId),
    enabled: activeMainTab === "marks_registry",
    queryFn: async () => {
      const data = await apiFetch(`/api/exams/marks?college_id=${encodeURIComponent(collegeId)}`);
      return data?.success && Array.isArray(data.marks) ? (data.marks as any[]) : [];
    },
  });
  const campusMarksList = marksQuery.data || [];
  const loadingCampusMarks = marksQuery.isFetching;

  // Helper to format local Date object to YYYY-MM-DD cleanly without timezone shift
  const formatLocalDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper to parse YYYY-MM-DD as local date (00:00:00 local time)
  const parseLocalDate = (dateStr?: string): Date => {
    if (!dateStr) return new Date();
    const parts = dateStr.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  };

  // Flexible subject matching helper
  const isDeptMatch = (sDept?: string, targetDept?: string) => {
    if (!sDept || !targetDept) return false;
    const cleanS = sDept.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanT = targetDept.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanS === cleanT) return true;
    if (cleanS.includes(cleanT) || cleanT.includes(cleanS)) return true;
    return false;
  };

  // Dynamic subjects matching chosen Department & Semester (deduplicated by name)
  const deptSubjects = useMemo(() => {
    if (!batchDept) return [];
    const matched = (subjectsList || []).filter((s: any) => {
      if (s.college_id && s.college_id !== collegeId) return false;
      return isDeptMatch(s.department, batchDept);
    });

    // Check if any match batchSem
    const semMatched = matched.filter((s: any) => {
      if (!s.semester || !batchSem) return false;
      const sSem = s.semester.toLowerCase().replace(/\D/g, "");
      const bSem = batchSem.toLowerCase().replace(/\D/g, "");
      return sSem && bSem && sSem === bSem;
    });

    const pool = semMatched.length > 0 ? semMatched : matched;

    // Deduplicate by normalized subject name
    const seen = new Set<string>();
    const uniqueSubjects: any[] = [];
    for (const sub of pool) {
      const normName = (sub.name || "").trim().toLowerCase();
      if (normName && !seen.has(normName)) {
        seen.add(normName);
        uniqueSubjects.push(sub);
      }
    }
    return uniqueSubjects;
  }, [subjectsList, batchDept, batchSem, collegeId]);

  // Initialize or re-populate modal subject rows when department or modal opens
  useEffect(() => {
    if (!isPopupOpen) return;

    if (deptSubjects.length === 0) {
      setSubjectRows([
        {
          subject_name: "",
          subject_code: "",
          subject_type: "ACADEMIC",
          included: true,
          exam_date: batchStartDate || formatLocalDate(new Date()),
          day_order: batchDefaultDayOrder || "Day 1",
          start_time: batchCustomStartTime,
          end_time: batchCustomEndTime
        }
      ]);
      return;
    }

    let currentDate = parseLocalDate(batchStartDate);
    while (currentDate.getDay() === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const match = batchDefaultDayOrder.match(/\d+/);
    const startDay = match ? parseInt(match[0], 10) : 1;

    let startT = batchCustomStartTime;
    let endT = batchCustomEndTime;
    if (parseTimeToMinutes(startT) < collegeHours.startMinutes) {
      startT = collegeHours.startTimeStr;
    }
    if (parseTimeToMinutes(endT) > collegeHours.endMinutes) {
      endT = collegeHours.endTimeStr;
    }

    const initialRows: SubjectFormRow[] = deptSubjects.map((sub: any, idx: number) => {
      if (idx > 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate.getDay() === 0) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      const dStr = formatLocalDate(currentDate);
      const orderNum = ((startDay - 1 + idx) % 6) + 1;
      const dOrder = batchDefaultDayOrder !== "None" ? `Day ${orderNum}` : "None";

      return {
        subject_name: sub.name,
        subject_code: sub.code || undefined,
        subject_type: (sub.type || "ACADEMIC").toUpperCase(),
        included: true,
        exam_date: dStr,
        day_order: dOrder,
        start_time: startT,
        end_time: endT
      };
    });

    setSubjectRows(initialRows);
  }, [isPopupOpen, batchDept, batchSem, deptSubjects]);

  // Auto-recalculate dates sequentially
  const handleAutoSequenceDates = () => {
    if (!batchStartDate) {
      toast("Please pick a starting date first", "warning");
      return;
    }

    let currentDate = parseLocalDate(batchStartDate);
    while (currentDate.getDay() === 0) {
      // Skip Sunday on start date
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const match = batchDefaultDayOrder.match(/\d+/);
    const startDay = match ? parseInt(match[0], 10) : 1;

    let seqIdx = 0;
    const updated = subjectRows.map((row) => {
      if (!row.included) return row;
      if (seqIdx > 0) {
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate.getDay() === 0) {
          // Skip Sunday
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
      const orderNum = ((startDay - 1 + seqIdx) % 6) + 1;
      seqIdx++;

      return {
        ...row,
        exam_date: formatLocalDate(currentDate),
        day_order: batchDefaultDayOrder !== "None" ? `Day ${orderNum}` : "None"
      };
    });

    setSubjectRows(updated);
    toast("Auto-sequenced consecutive exam dates and Day Orders (skipping Sundays)", "success");
  };

  const handleAddSubjectRow = () => {
    let nextDate = parseLocalDate(batchStartDate);
    const count = subjectRows.length;
    for (let i = 0; i < count; i++) {
      nextDate.setDate(nextDate.getDate() + 1);
      while (nextDate.getDay() === 0) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
    }
    while (nextDate.getDay() === 0) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    const match = batchDefaultDayOrder.match(/\d+/);
    const startDay = match ? parseInt(match[0], 10) : 1;
    const orderNum = ((startDay - 1 + count) % 6) + 1;

    setSubjectRows(prev => [
      ...prev,
      {
        subject_name: "",
        subject_code: "",
        subject_type: "ACADEMIC",
        included: true,
        exam_date: formatLocalDate(nextDate),
        day_order: batchDefaultDayOrder !== "None" ? `Day ${orderNum}` : "None",
        start_time: batchCustomStartTime,
        end_time: batchCustomEndTime
      }
    ]);
  };

  const handleRemoveSubjectRow = (index: number) => {
    setSubjectRows(prev => prev.filter((_, idx) => idx !== index));
  };

  // Toggle single subject inclusion
  const toggleSubjectIncluded = (index: number) => {
    setSubjectRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, included: !row.included } : row))
    );
  };

  // Update specific subject row field
  const updateSubjectRow = (index: number, updates: Partial<SubjectFormRow>) => {
    setSubjectRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...updates } : row))
    );
  };

  // Submit complete batch exam timetable
  const handlePublishTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchExamName.trim()) {
      toast("Please enter an exam title (e.g. CIA 1)", "warning");
      return;
    }
    if (!batchDept) {
      toast("Please select a department", "warning");
      return;
    }

    const selectedToSchedule = subjectRows.filter((r) => r.included);
    if (selectedToSchedule.length === 0) {
      toast("Please select at least one subject to schedule", "warning");
      return;
    }

    // Validate that all exam timings fall strictly within college operating hours and end > start
    for (const row of selectedToSchedule) {
      const sMin = parseTimeToMinutes(row.start_time);
      const eMin = parseTimeToMinutes(row.end_time);

      if (!sMin || !eMin) {
        toast(`Please choose valid start and end times for ${row.subject_name}`, "warning");
        return;
      }
      if (eMin <= sMin) {
        toast(`End time must be later than start time for ${row.subject_name} (${row.start_time} - ${row.end_time})`, "warning");
        return;
      }
      if (sMin < collegeHours.startMinutes) {
        toast(`Start time (${row.start_time}) cannot be earlier than college start time (${collegeHours.startTimeStr}) for ${row.subject_name}`, "warning");
        return;
      }
      if (eMin > collegeHours.endMinutes) {
        toast(`End time (${row.end_time}) cannot exceed college closing time (${collegeHours.endTimeStr}) for ${row.subject_name}`, "warning");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payloadSchedules = selectedToSchedule.map((row) => {
        const sessionTimeStr = `${row.start_time} - ${row.end_time}`;

        return {
          id: generateId("exam"),
          college_id: collegeId,
          department: batchDept,
          semester: batchSem,
          exam_type: batchExamName.trim(),
          subject_name: row.subject_name,
          subject_code: row.subject_code,
          subject_type: row.subject_type || "ACADEMIC",
          exam_date: row.exam_date,
          day_order: row.day_order || batchDefaultDayOrder || "Day 1",
          start_time: row.start_time,
          end_time: row.end_time,
          session_time: sessionTimeStr,
          hall_room: row.hall_room || "",
          created_by: currentCAM?.name || actorName || "Campus Manager"
        };
      });

      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedules: payloadSchedules })
      });
      const data = await res.json();

      if (data.success) {
        toast(`Published ${payloadSchedules.length} exam slots for "${batchExamName}" (${batchDept})!`, "success");
        setIsPopupOpen(false);
        await queryClient.invalidateQueries({ queryKey: qk.exams(collegeId) });
        // Notify student & mentor dashboards to update schedule and timetable
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_exams_updated", { detail: { college_id: collegeId } }));
          window.dispatchEvent(new CustomEvent("fp_schedule_updated", { detail: { college_id: collegeId } }));
        }
        announceDataChanged("exams");
        // Open the newly created group accordion
        const newKey = `${batchExamName.trim()}_${batchDept}_${batchSem}`;
        setOpenAccordions((prev) => ({ ...prev, [newKey]: true }));
      } else {
        toast(data.message || "Failed to publish timetable", "error");
      }
    } catch (err: any) {
      toast("Error: " + err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete an entire Exam Timetable Batch
  const handleDeleteBatch = async (batchKey: string, batchTitle: string, examIds: string[]) => {
    const ok = await showConfirm({
      title: "Delete Exam Timetable Batch",
      message: `Are you sure you want to delete all ${examIds.length} scheduled exam slots for "${batchTitle}"?`,
      danger: true,
      confirmLabel: "Delete Full Timetable"
    });
    if (!ok) return;

    try {
      let failed = 0;
      for (const id of examIds) {
        const res = await fetch(`/api/exams?id=${id}`, { method: "DELETE" });
        const d = await res.json();
        if (!d.success) failed++;
      }

      if (failed === 0) {
        toast(`Deleted exam timetable batch "${batchTitle}"`, "success");
      } else {
        toast(`Deleted exam timetable with ${failed} warnings`, "warning");
      }
      await queryClient.invalidateQueries({ queryKey: qk.exams(collegeId) });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("fp_exams_updated", { detail: { college_id: collegeId } }));
        window.dispatchEvent(new CustomEvent("fp_schedule_updated", { detail: { college_id: collegeId } }));
      }
    } catch (err: any) {
      toast("Error deleting batch: " + err.message, "error");
    }
  };

  // Delete Single Slot
  const handleDeleteSingleExam = async (id: string, title: string) => {
    const ok = await showConfirm({
      title: "Delete Exam Slot",
      message: `Delete exam slot "${title}"?`,
      danger: true,
      confirmLabel: "Delete Slot"
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/exams?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast("Exam slot deleted", "success");
        await queryClient.invalidateQueries({ queryKey: qk.exams(collegeId) });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("fp_exams_updated", { detail: { college_id: collegeId } }));
          window.dispatchEvent(new CustomEvent("fp_schedule_updated", { detail: { college_id: collegeId } }));
        }
        announceDataChanged("exams");
      } else {
        toast(data.message || "Failed to delete exam", "error");
      }
    } catch (err: any) {
      toast("Error deleting: " + err.message, "error");
    }
  };

  // Group exams by [Exam Title + Department + Semester] for Accordion View
  const groupedExamBatches = useMemo(() => {
    const groups: Record<
      string,
      {
        key: string;
        exam_type: string;
        department: string;
        semester: string;
        slots: ExamSchedule[];
        minDate: string;
        maxDate: string;
      }
    > = {};

    exams.forEach((ex) => {
      // Apply filters
      if (selectedDeptFilter !== "all" && !ex.department.toLowerCase().includes(selectedDeptFilter.toLowerCase())) {
        return;
      }
      if (selectedSemFilter !== "all" && ex.semester !== selectedSemFilter) {
        return;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          ex.exam_type.toLowerCase().includes(q) ||
          ex.subject_name.toLowerCase().includes(q) ||
          ex.department.toLowerCase().includes(q) ||
          ex.subject_type?.toLowerCase().includes(q);
        if (!matches) return;
      }

      const canonicalDept = ex.department.replace(/^b\.?sc\.?\s+/i, "").trim();
      const key = `${ex.exam_type.trim()}_${canonicalDept.toLowerCase()}_${ex.semester.trim()}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          exam_type: ex.exam_type,
          department: ex.department,
          semester: ex.semester,
          slots: [],
          minDate: ex.exam_date,
          maxDate: ex.exam_date
        };
      }

      const isDuplicateSlot = groups[key].slots.some(
        (s) => s.id === ex.id || (s.subject_name.toLowerCase().trim() === ex.subject_name.toLowerCase().trim() && s.exam_date === ex.exam_date)
      );
      if (!isDuplicateSlot) {
        groups[key].slots.push(ex);
        if (ex.exam_date < groups[key].minDate) groups[key].minDate = ex.exam_date;
        if (ex.exam_date > groups[key].maxDate) groups[key].maxDate = ex.exam_date;
      }
    });

    // Sort slots inside each group by exam_date
    Object.values(groups).forEach((g) => {
      g.slots.sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    });

    return Object.values(groups);
  }, [exams, selectedDeptFilter, selectedSemFilter, searchQuery]);

  const toggleAccordion = (key: string) => {
    setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filtered Campus Marks for Performance Registry
  const filteredCampusMarks = useMemo(() => {
    return campusMarksList.filter(m => {
      if (marksExamTypeFilter !== "all" && m.exam_type !== marksExamTypeFilter) return false;
      if (marksDeptFilter !== "all") {
        const d = (m.exam_department || m.student_department || "").toLowerCase();
        if (!d.includes(marksDeptFilter.toLowerCase())) return false;
      }
      const isAbs = Boolean(m.is_absent);
      const mNum = m.marks_obtained !== null && m.marks_obtained !== undefined ? parseFloat(m.marks_obtained) : null;
      const maxM = parseFloat(m.max_marks || 50);
      const passM = parseFloat(m.passing_marks || (maxM * 0.4) || 20);
      const isPass = mNum !== null && mNum >= passM;

      if (marksStatusFilter === "passed" && (!isPass || isAbs)) return false;
      if (marksStatusFilter === "arrears" && (isPass || isAbs || mNum === null)) return false;
      if (marksStatusFilter === "absent" && !isAbs) return false;

      if (marksSearchQuery.trim()) {
        const q = marksSearchQuery.toLowerCase().trim();
        const matches = (m.student_name || "").toLowerCase().includes(q) ||
          (m.roll_number || "").toLowerCase().includes(q) ||
          (m.subject_name || "").toLowerCase().includes(q) ||
          (m.classGroup || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [campusMarksList, marksExamTypeFilter, marksDeptFilter, marksStatusFilter, marksSearchQuery]);

  const [marksPage, setMarksPage] = useState<number>(1);
  const [marksPageSize, setMarksPageSize] = useState<number>(25);

  const paginatedCampusMarks = useMemo(() => {
    const start = (marksPage - 1) * marksPageSize;
    return filteredCampusMarks.slice(start, start + marksPageSize);
  }, [filteredCampusMarks, marksPage, marksPageSize]);

  // Overall Campus Exam KPIs
  const campusMarksStats = useMemo(() => {
    let total = campusMarksList.length;
    let evaluated = 0;
    let passed = 0;
    let arrears = 0;
    let absent = 0;
    let totalPct = 0;

    campusMarksList.forEach(m => {
      if (m.is_absent) {
        absent++;
        arrears++;
      } else if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
        evaluated++;
        const val = parseFloat(m.marks_obtained);
        const maxM = parseFloat(m.max_marks || 50);
        const passM = parseFloat(m.passing_marks || (maxM * 0.4) || 20);
        totalPct += (val / maxM) * 100;
        if (val >= passM) passed++;
        else arrears++;
      }
    });

    const passRate = (passed + (arrears - absent)) > 0 ? Math.round((passed / (passed + (arrears - absent))) * 100) : 0;
    const avgScore = evaluated > 0 ? (totalPct / evaluated).toFixed(1) : "—";

    return { total, evaluated, passed, arrears, absent, passRate, avgScore };
  }, [campusMarksList]);

  // Export CSV of Scheduled Exams (Filtered & Deduplicated)
  const handleExportCSV = () => {
    // Gather all currently filtered exam slots from grouped batches
    const activeSlots = groupedExamBatches.flatMap((b) => b.slots);
    if (activeSlots.length === 0) {
      toast("No scheduled exams to export", "warning");
      return;
    }

    // Deduplicate by composite key
    const seen = new Set<string>();
    const deduplicatedSlots: ExamSchedule[] = [];
    for (const ex of activeSlots) {
      const key = `${ex.exam_type}__${ex.department}__${ex.semester}__${ex.subject_name}__${ex.exam_date}__${ex.session_time || ex.start_time}`.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        deduplicatedSlots.push(ex);
      }
    }

    const headers = ["Department", "Semester", "Exam_Name", "Subject_Name", "Subject_Type", "Exam_Date", "Day_Order", "Session_Time"];
    const rows = deduplicatedSlots.map((ex) => [
      `"${(ex.department || "").replace(/"/g, '""')}"`,
      `"${(ex.semester || "").replace(/"/g, '""')}"`,
      `"${(ex.exam_type || "").replace(/"/g, '""')}"`,
      `"${(ex.subject_name || "").replace(/"/g, '""')}"`,
      `"${(ex.subject_type || "").replace(/"/g, '""')}"`,
      `"${(ex.exam_date || "").replace(/"/g, '""')}"`,
      `"${(ex.day_order || "Day 1").replace(/"/g, '""')}"`,
      `"${(ex.session_time || `${ex.start_time} - ${ex.end_time}`).replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `exam_schedules_${collegeId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(`Exported ${deduplicatedSlots.length} exam schedules to CSV`, "success");
  };

  // Export CSV of Campus Exam Marksheets
  const handleExportMarksCSV = () => {
    if (filteredCampusMarks.length === 0) return;
    let csv = "Roll Number,Student Name,Department,Cohort,Exam Type,Subject Name,Subject Code,Exam Date,Marks Obtained,Max Marks,Percentage,Grade,Status,Evaluator Mentor,Remarks\n";
    filteredCampusMarks.forEach(m => {
      const isAbs = Boolean(m.is_absent);
      const mNum = m.marks_obtained !== null && m.marks_obtained !== undefined ? parseFloat(m.marks_obtained) : null;
      const maxM = parseFloat(m.max_marks || 50);
      const pct = mNum !== null ? ((mNum / maxM) * 100).toFixed(1) + "%" : "—";
      const passM = parseFloat(m.passing_marks || (maxM * 0.4) || 20);
      const isPass = mNum !== null && mNum >= passM;
      const status = isAbs ? "ABSENT" : isPass ? "PASSED" : "ARREAR / RE-APPEAR";
      csv += `"${m.roll_number || ""}","${m.student_name || ""}","${m.exam_department || m.student_department || ""}","${m.classGroup || ""}","${m.exam_type || ""}","${m.subject_name || ""}","${m.subject_code || ""}","${m.exam_date || ""}","${isAbs ? "AB" : mNum ?? "—"}","${maxM}","${pct}","${m.grade || ""}","${status}","${m.evaluated_by || ""}","${m.remarks || ""}"\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Campus_Exam_Mark_Submissions_${collegeId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast("Campus mark submissions exported to CSV", "success");
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16 font-sans">
      {/* Header Banner */}
      {!embedded ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 md:p-6 shadow-card flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Exam Timetable &amp; Performance Studio
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider">
                  Internal Assessments &amp; Semester
                </span>
                {isSyncing && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 animate-pulse bg-indigo-50/60 px-2 py-0.5 rounded-md">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Syncing...
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
            {/* Main Sub-Tab Pill Switcher */}
            <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/50">
              <button
                type="button"
                onClick={() => setActiveMainTab("schedules")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeMainTab === "schedules"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Timetables ({exams.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveMainTab("marks_registry")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeMainTab === "marks_registry"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Mark Submissions ({campusMarksList.length})
              </button>
            </div>

            {/* Action Buttons Group */}
            <div className="flex items-center gap-2 shrink-0">
              {activeMainTab === "schedules" ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setIsPopupOpen(true); setFormStep(1); }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 btn-gradient text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Schedule Timetable</span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ActionDropdownButton />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onClick={handleExportCSV}
                        className="gap-2 cursor-pointer text-xs"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Export CSV</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => marksQuery.refetch()}
                    disabled={loadingCampusMarks}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-sunken hover:bg-white border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingCampusMarks ? "animate-spin text-indigo-600" : ""}`} />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportMarksCSV}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <Download className="h-4 w-4 text-emerald-600" />
                    <span>Export Marksheet CSV</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Embedded Toolbar Mode */
        <div className="bg-white border border-slate-100 rounded-2xl p-3.5 sm:p-4 shadow-card flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/50">
              <button
                type="button"
                onClick={() => setActiveMainTab("schedules")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeMainTab === "schedules"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Timetables ({exams.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveMainTab("marks_registry")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeMainTab === "marks_registry"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Mark Submissions ({campusMarksList.length})
              </button>
            </div>
            {isSyncing && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 animate-pulse bg-indigo-50/60 px-2 py-0.5 rounded-md">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Syncing...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 justify-end">
            {activeMainTab === "schedules" ? (
              <>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-sunken hover:bg-white border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-700 shadow-2xs transition-all cursor-pointer"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setIsPopupOpen(true); setFormStep(1); }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 btn-gradient text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Schedule Timetable</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => marksQuery.refetch()}
                  disabled={loadingCampusMarks}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-sunken hover:bg-white border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-700 transition-all cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingCampusMarks ? "animate-spin text-indigo-600" : ""}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportMarksCSV}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                >
                  <Download className="h-4 w-4 text-emerald-600" />
                  <span>Export Marksheet CSV</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeMainTab === "schedules" ? (
        <>
          {/* KPI Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-slate-300/80 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Timetable Batches</p>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <CalendarRange className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">{groupedExamBatches.length}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Active scheduled batches</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-indigo-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Total Exam Slots</p>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-indigo-600 mt-1">{exams.length}</p>
              <p className="text-[11px] text-indigo-400/90 font-medium mt-0.5">Subject time slots</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-teal-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Departments Active</p>
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {Array.from(new Set(exams.map((e) => e.department))).length}
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Academic departments</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-purple-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Assessment Types</p>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Award className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-purple-600 mt-1">
                {Array.from(new Set(exams.map((e) => e.exam_type))).length}
              </p>
              <p className="text-[11px] text-purple-400/90 font-medium mt-0.5">CIA &amp; Semester finals</p>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="bg-white border border-slate-100 rounded-2xl p-3.5 sm:p-4 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Department Filter */}
              <div className="relative inline-flex items-center">
                <span className="absolute left-3 text-slate-400 text-[10px] font-bold uppercase pointer-events-none">Dept:</span>
                <select
                  aria-label="Department"
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                  className="h-10 pl-14 pr-8 bg-sunken hover:bg-white/80 border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer appearance-none transition-all focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="all">All Departments</option>
                  {availableDepartments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Semester Filter */}
              <div className="relative inline-flex items-center">
                <span className="absolute left-3 text-slate-400 text-[10px] font-bold uppercase pointer-events-none">Sem:</span>
                <select
                  aria-label="Semester"
                  value={selectedSemFilter}
                  onChange={(e) => setSelectedSemFilter(e.target.value)}
                  className="h-10 pl-13 pr-8 bg-sunken hover:bg-white/80 border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer appearance-none transition-all focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="all">All Semesters</option>
                  {allAvailableSemesters.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>

              {(selectedDeptFilter !== "all" || selectedSemFilter !== "all" || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeptFilter("all");
                    setSelectedSemFilter("all");
                    setSearchQuery("");
                  }}
                  className="h-10 px-3 inline-flex items-center gap-1 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100/80 hover:bg-slate-200/80 transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                aria-label="Search exam, subject, hall"
                placeholder="Search exam, subject, hall..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full pl-9 pr-8 bg-sunken border border-slate-200 inset-shadow-well rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Main Accordion View: Grouped by Exam Batches */}
          <div className="space-y-4">
            {isInitialLoading ? (
              <div className="space-y-3">
                {[1, 2].map((idx) => (
                  <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-slate-200" />
                        <div className="space-y-2">
                          <div className="h-4 w-48 bg-slate-200 rounded-md" />
                          <div className="h-3 w-32 bg-slate-100 rounded-md" />
                        </div>
                      </div>
                      <div className="h-8 w-20 bg-slate-100 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : groupedExamBatches.length === 0 ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-card">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-1">
                    <Award className="h-6 w-6" />
                  </div>
                  <p className="font-extrabold text-slate-700 text-sm">No Exam Timetables Published</p>
                  <p className="text-xs text-slate-400 max-w-md">
                    Click <strong>&quot;Schedule Timetable&quot;</strong> above to select a department and schedule assessment dates for all subjects.
                  </p>
                </div>
              </div>
            ) : (
              groupedExamBatches.map((batch) => {
                const isOpen = Boolean(openAccordions[batch.key]);
                const batchTitle = `${batch.exam_type} — ${batch.department} (${batch.semester})`;
                const allIds = batch.slots.map((s) => s.id);

                return (
                  <div
                    key={batch.key}
                    className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden transition-all duration-200"
                  >
                    {/* Accordion Header */}
                    <div
                      onClick={() => toggleAccordion(batch.key)}
                      className="p-4.5 sm:p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none bg-slate-50/50 hover:bg-slate-50 transition-colors border-b border-slate-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-extrabold text-xs">
                          {batch.exam_type.substring(0, 3)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-extrabold text-slate-900">{batchTitle}</h3>
                            <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black uppercase">
                              {batch.slots.length} {batch.slots.length === 1 ? "Subject" : "Subjects"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span className="flex items-center gap-1 font-semibold text-slate-600">
                              <Calendar className="h-3 w-3 text-indigo-500 shrink-0" />
                              {batch.minDate} {batch.minDate !== batch.maxDate ? `to ${batch.maxDate}` : ""}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span>{batch.department}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDeleteBatch(batch.key, batchTitle, allIds)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition-all cursor-pointer"
                          title="Delete Full Timetable Batch"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAccordion(batch.key)}
                          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
                        >
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Accordion Body: Table of Subjects */}
                    {isOpen && (
                      <div className="overflow-x-auto">
                        <Table className="w-full text-left text-xs border-collapse min-w-[650px]">
                          <TableHeader>
                            <TableRow className="bg-sunken border-b border-slate-200 text-slate-400 font-bold uppercase text-[9px]">
                              <TableHead className="p-3.5 w-12 text-center">#</TableHead>
                              <TableHead className="p-3.5">Subject & Code</TableHead>
                              <TableHead className="p-3.5">Type</TableHead>
                              <TableHead className="p-3.5">Exam Date & Day Order</TableHead>
                              <TableHead className="p-3.5">Timing & Session</TableHead>
                              <TableHead className="p-3.5 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-slate-100 font-medium text-slate-700">
                            {batch.slots.map((slot, sIdx) => {
                              const subObj = subjectsList.find(s => s.name?.toLowerCase().trim() === slot.subject_name?.toLowerCase().trim());
                              const subjectType = ((slot as any).subject_type || subObj?.type || "ACADEMIC").toUpperCase();

                              return (
                                <TableRow key={slot.id} className="hover:bg-slate-50/70 transition-colors">
                                  <TableCell className="p-3.5 text-center font-mono text-[11px] text-slate-400">
                                    {sIdx + 1}
                                  </TableCell>
                                  <TableCell className="p-3.5">
                                    <span className="font-extrabold text-slate-900 block">{slot.subject_name}</span>
                                    {slot.subject_code && (
                                      <span className="text-[10px] text-slate-400 font-mono">{slot.subject_code}</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="p-3.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                      subjectType === "SKILL"
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        : subjectType === "LAB"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                        : subjectType === "GENERAL" || subjectType === "ELECTIVE"
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-slate-100 text-slate-700 border-slate-200"
                                    }`}>
                                      {subjectType}
                                    </span>
                                  </TableCell>
                                  <TableCell className="p-3.5 font-bold text-slate-800">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                        <span>{slot.exam_date}</span>
                                      </div>
                                      {slot.day_order && slot.day_order !== "None" ? (
                                        <span className="inline-flex items-center w-max px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[9.5px] font-black uppercase">
                                          {slot.day_order}
                                        </span>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                  <TableCell className="p-3.5 text-slate-600">
                                    <div className="flex items-center gap-1.5">
                                      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                      <span className="font-semibold text-slate-800">{slot.session_time || `${slot.start_time} - ${slot.end_time}`}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="p-3.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSingleExam(slot.id, slot.subject_name)}
                                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition-all"
                                      title="Delete Single Slot"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* MARK SUBMISSIONS & PERFORMANCE VIEW */
        <div className="space-y-5">
          {/* Performance Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-slate-300/80 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Records</p>
                <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">{campusMarksStats.total}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Submitted grades</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-emerald-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Passed Records</p>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-emerald-700 mt-1">{campusMarksStats.passed}</p>
              <p className="text-[11px] text-emerald-600/80 font-medium mt-0.5">Scored ≥ passing</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-rose-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Arrears / Fail</p>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-rose-700 mt-1">{campusMarksStats.arrears}</p>
              <p className="text-[11px] text-rose-600/80 font-medium mt-0.5">Need re-appearance</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-amber-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Absentees</p>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-amber-700 mt-1">{campusMarksStats.absent}</p>
              <p className="text-[11px] text-amber-600/80 font-medium mt-0.5">Missed assessments</p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card hover:border-indigo-200 transition-all">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Campus Pass Rate</p>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-indigo-700 mt-1">{campusMarksStats.passRate}%</p>
              <p className="text-[11px] text-indigo-600/80 font-medium mt-0.5">Overall qualification</p>
            </div>
          </div>

          {/* Marks Filter & Search Bar */}
          <div className="bg-white border border-slate-100 rounded-2xl p-3.5 sm:p-4 shadow-card flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Exam Type Pill Tabs */}
              <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/50 flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setMarksExamTypeFilter("all")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    marksExamTypeFilter === "all"
                      ? "bg-white text-indigo-700 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All Assessments
                </button>
                {Array.from(
                  new Set([
                    ...PRESET_EXAM_SUGGESTIONS,
                    ...campusMarksList.map((m: any) => m.exam_type).filter(Boolean),
                  ])
                ).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setMarksExamTypeFilter(ex)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                      marksExamTypeFilter === ex
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {/* Department Filter */}
              <div className="relative inline-flex items-center">
                <span className="absolute left-3 text-slate-400 text-[10px] font-bold uppercase pointer-events-none">Dept:</span>
                <select
                  aria-label="Department"
                  value={marksDeptFilter}
                  onChange={(e) => setMarksDeptFilter(e.target.value)}
                  className="h-10 pl-14 pr-8 bg-sunken hover:bg-white/80 border border-slate-200 inset-shadow-well rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer appearance-none transition-all focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="all">All Departments</option>
                  {availableDepartments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>

              {/* Status Tabs */}
              <div className="flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/50">
                {(["all", "passed", "arrears", "absent"] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMarksStatusFilter(tab)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      marksStatusFilter === tab
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab === "all" ? "All Status" : tab === "passed" ? "Passed" : tab === "arrears" ? "Arrears" : "Absent"}
                  </button>
                ))}
              </div>

              {(marksExamTypeFilter !== "all" || marksDeptFilter !== "all" || marksStatusFilter !== "all" || marksSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setMarksExamTypeFilter("all");
                    setMarksDeptFilter("all");
                    setMarksStatusFilter("all");
                    setMarksSearchQuery("");
                  }}
                  className="h-10 px-3 inline-flex items-center gap-1 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100/80 hover:bg-slate-200/80 transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                aria-label="Search student, roll no, subject"
                placeholder="Search student, roll no, subject..."
                value={marksSearchQuery}
                onChange={(e) => setMarksSearchQuery(e.target.value)}
                className="h-10 w-full pl-9 pr-8 bg-sunken border border-slate-200 inset-shadow-well rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              {marksSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMarksSearchQuery("")}
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Student Exam Mark Submissions Table */}
          <div className="space-y-3">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] scroll-touch">
                <Table className="w-full text-left text-xs border-collapse min-w-[850px]">
                  <TableHeader className="bg-sunken text-slate-500 font-extrabold uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-200 z-10">
                    <TableRow>
                      <TableHead className="p-3.5 text-center w-12">#</TableHead>
                      <TableHead className="p-3.5">Student Details</TableHead>
                      <TableHead className="p-3.5">Department / Cohort</TableHead>
                      <TableHead className="p-3.5">Exam & Subject</TableHead>
                      <TableHead className="p-3.5 text-center">Score (Out of)</TableHead>
                      <TableHead className="p-3.5 text-center">Score %</TableHead>
                      <TableHead className="p-3.5 text-center">Grade</TableHead>
                      <TableHead className="p-3.5 text-center">Status</TableHead>
                      <TableHead className="p-3.5">Evaluator Mentor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                    {loadingCampusMarks ? (
                      <TableRow>
                        <TableCell colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-indigo-600 mb-2" />
                          Loading campus mark submissions...
                        </TableCell>
                      </TableRow>
                    ) : filteredCampusMarks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="p-12 text-center text-slate-400 italic">
                          No evaluated exam marks found matching the criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedCampusMarks.map((m, idx) => {
                        const isAbs = Boolean(m.is_absent);
                        const mNum = m.marks_obtained !== null && m.marks_obtained !== undefined ? parseFloat(m.marks_obtained) : null;
                        const maxM = parseFloat(m.max_marks || 50);
                        const pct = mNum !== null ? Math.round((mNum / maxM) * 100) : 0;
                        const passM = parseFloat(m.passing_marks || (maxM * 0.4) || 20);
                        const isPass = mNum !== null && mNum >= passM;
                        const itemIndex = (marksPage - 1) * marksPageSize + idx + 1;

                        return (
                          <TableRow key={m.id || idx} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="p-3.5 text-center font-mono text-[11px] text-slate-400">
                              {itemIndex}
                            </TableCell>
                            <TableCell className="p-3.5">
                              <div className="font-extrabold text-slate-900">{m.student_name}</div>
                              <div className="font-mono text-[10px] text-slate-400">{m.roll_number}</div>
                            </TableCell>
                            <TableCell className="p-3.5">
                              <div className="font-semibold text-slate-800">{m.exam_department || m.student_department}</div>
                              <div className="text-[10px] text-slate-400">{m.classGroup || m.semester}</div>
                            </TableCell>
                            <TableCell className="p-3.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase">
                                  {m.exam_type}
                                </span>
                                <span className="font-extrabold text-slate-900">{m.subject_name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">Date: {m.exam_date}</div>
                            </TableCell>
                            <TableCell className="p-3.5 text-center font-mono font-bold text-slate-900">
                              {isAbs ? (
                                <span className="text-rose-600">ABSENT</span>
                              ) : mNum !== null ? (
                                <span>{mNum} / {maxM}</span>
                              ) : (
                                <span className="text-amber-600 italic">Pending</span>
                              )}
                            </TableCell>
                            <TableCell className="p-3.5 text-center font-bold">
                              {isAbs || mNum === null ? "—" : `${pct}%`}
                            </TableCell>
                            <TableCell className="p-3.5 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isAbs
                                  ? "bg-slate-100 text-slate-600"
                                  : m.grade === "O" || m.grade === "A+" || m.grade === "A"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : m.grade === "B+" || m.grade === "B"
                                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  : isPass
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}>
                                {isAbs ? "AB" : m.grade || (isPass ? "PASS" : "RA")}
                              </span>
                            </TableCell>
                            <TableCell className="p-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                isAbs
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : isPass
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}>
                                {isAbs ? "Absent" : isPass ? "Pass" : "Arrear"}
                              </span>
                            </TableCell>
                            <TableCell className="p-3.5 text-slate-600 text-[11px]">
                              <div className="font-semibold text-slate-800">{m.evaluated_by || "Faculty Mentor"}</div>
                              {m.remarks && <div className="text-slate-400 text-[10px] italic">{m.remarks}</div>}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {filteredCampusMarks.length > 0 && (
              <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-card">
                <Pagination
                  currentPage={marksPage}
                  totalItems={filteredCampusMarks.length}
                  pageSize={marksPageSize}
                  onPageChange={setMarksPage}
                  onPageSizeChange={(newSize) => {
                    setMarksPageSize(newSize);
                    setMarksPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPUP MODAL: Schedule Exam Timetable (Two-Step Workflow) */}
      {isPopupOpen && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) { setIsPopupOpen(false); setFormStep(1); } }}
          ariaLabel="Schedule Exam Timetable"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4 overflow-y-auto"
          panelClassName="max-w-3xl overflow-hidden animate-scaleUp my-8 max-h-[90vh] flex flex-col p-0 space-y-0 rounded-2xl"
        >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <CalendarRange className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Schedule Exam Timetable</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {formStep === 1 ? "Step 1: Configure parameters" : `Step 2: ${batchDept} • ${batchSem}`}
                  </p>
                </div>
              </div>

              {/* Step Navigation Indicator */}
              <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setFormStep(1)}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    formStep === 1
                      ? "bg-white text-indigo-600 shadow-xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  1. Setup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!batchExamName.trim()) {
                      toast("Please enter an Exam Title", "warning");
                      return;
                    }
                    if (!batchDept) {
                      toast("Please select a Department", "warning");
                      return;
                    }
                    if (!batchStartDate) {
                      toast("Please pick a starting date", "warning");
                      return;
                    }
                    applyStartDateToRows(batchStartDate, batchDefaultDayOrder);
                    setFormStep(2);
                  }}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    formStep === 2
                      ? "bg-white text-indigo-600 shadow-xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  2. Timetable
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setIsPopupOpen(false); setFormStep(1); }}
                aria-label="Close"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handlePublishTimetable} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
                {formStep === 1 ? (
                  /* ═════════ STEP 1: CONFIGURATION ═════════ */
                  <div className="space-y-4">
                    {/* Exam Name */}
                    <div className="space-y-1.5">
                      <label className="block text-[10.5px] font-extrabold text-slate-700 uppercase tracking-wider">
                        Exam Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        aria-label="Exam Title"
                        placeholder="e.g. CIA 1, CIA 2, Model Exam, Semester End"
                        value={batchExamName}
                        onChange={(e) => setBatchExamName(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 inset-shadow-well rounded-xl bg-sunken focus:bg-white text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {PRESET_EXAM_SUGGESTIONS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setBatchExamName(preset)}
                            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer ${
                              batchExamName.trim().toLowerCase() === preset.toLowerCase()
                                ? "bg-indigo-600 text-white shadow-2xs"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Department & Semester */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Department <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          aria-label="Department"
                          value={batchDept}
                          onChange={(e) => setBatchDept(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {availableDepartments.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Semester <span className="text-rose-500">*</span>
                        </label>
                        <select
                          required
                          aria-label="Semester"
                          value={batchSem}
                          onChange={(e) => setBatchSem(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          {batchSemesters.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Dates & Day Order */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Starting Exam Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          aria-label="Starting Exam Date"
                          value={batchStartDate}
                          onChange={(e) => handleBatchStartDateChange(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Starting Day Order
                        </label>
                        <select
                          aria-label="Starting Day Order"
                          value={batchDefaultDayOrder}
                          onChange={(e) => handleBatchDayOrderChange(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="Day 1">Day 1</option>
                          <option value="Day 2">Day 2</option>
                          <option value="Day 3">Day 3</option>
                          <option value="Day 4">Day 4</option>
                          <option value="Day 5">Day 5</option>
                          <option value="Day 6">Day 6</option>
                          <option value="None">None</option>
                        </select>
                      </div>
                    </div>

                    {/* Exam Timings */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Default Start Time</label>
                          <span className="text-[9.5px] text-indigo-600 font-bold">Min: {collegeHours.startTimeStr}</span>
                        </div>
                        <input
                          type="time"
                          min={collegeMin24}
                          max={collegeMax24}
                          aria-label="Start Time"
                          value={timeTo24h(batchCustomStartTime)}
                          onChange={(e) => handleBatchStartTimeChange(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Default End Time</label>
                          <span className="text-[9.5px] text-indigo-600 font-bold">Max: {collegeHours.endTimeStr}</span>
                        </div>
                        <input
                          type="time"
                          min={timeTo24h(batchCustomStartTime) || collegeMin24}
                          max={collegeMax24}
                          aria-label="End Time"
                          value={timeTo24h(batchCustomEndTime)}
                          onChange={(e) => handleBatchEndTimeChange(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ═════════ STEP 2: SUBJECTS TIMETABLE TABLE ═════════ */
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                          {batchDept} Subjects Timetable
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {subjectRows.filter((r) => r.included).length} / {subjectRows.length} Included
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAutoSequenceDates}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                          <span>Auto-Sequence</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleAddSubjectRow}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Subject</span>
                        </button>
                      </div>
                    </div>

                    {subjectRows.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                        <p className="text-xs font-bold text-slate-500">No subjects found for {batchDept}.</p>
                        <button
                          type="button"
                          onClick={handleAddSubjectRow}
                          className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 cursor-pointer shadow-xs"
                        >
                          + Add Subject
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                        {subjectRows.map((row, idx) => (
                          <div
                            key={`${row.subject_name}_${idx}`}
                            className={`p-3 rounded-xl border transition-all ${
                              row.included
                                ? "bg-white border-slate-200 hover:border-indigo-200 shadow-2xs"
                                : "bg-slate-50/70 border-slate-200/70 opacity-50"
                            }`}
                          >
                            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5">
                              {/* Include Checkbox & Subject Name */}
                              <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                                <input
                                  type="checkbox"
                                  checked={row.included}
                                  onChange={() => toggleSubjectIncluded(idx)}
                                  className="h-4 w-4 text-indigo-600 rounded cursor-pointer accent-indigo-600 shrink-0"
                                  title="Include in exam timetable"
                                />
                                <div className="flex-1 min-w-0">
                                  {row.subject_name ? (
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="font-extrabold text-slate-900 text-xs truncate">{row.subject_name}</p>
                                        <span
                                          className={`text-[9.5px] font-black uppercase px-1.5 py-0.5 rounded-md border ${
                                            row.subject_type === "SKILL"
                                              ? "bg-purple-50 text-purple-700 border-purple-200"
                                              : row.subject_type === "LAB"
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                              : row.subject_type === "GENERAL" || row.subject_type === "ELECTIVE"
                                              ? "bg-amber-50 text-amber-700 border-amber-200"
                                              : "bg-blue-50 text-blue-700 border-blue-200"
                                          }`}
                                        >
                                          {row.subject_type || "ACADEMIC"}
                                        </span>
                                      </div>
                                      {row.subject_code && (
                                        <p className="text-[10px] text-slate-400 font-mono">{row.subject_code}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <input
                                      type="text"
                                      required
                                      placeholder="Subject Name"
                                      value={row.subject_name}
                                      onChange={(e) => updateSubjectRow(idx, { subject_name: e.target.value })}
                                      className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold w-full outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                    />
                                  )}
                                </div>
                              </div>

                              {/* Form Inputs (Date, Day Order, Time, Type, Delete) */}
                              {row.included && (
                                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                                  <input
                                    type="date"
                                    required
                                    value={row.exam_date}
                                    onChange={(e) => updateSubjectRow(idx, { exam_date: e.target.value })}
                                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 cursor-pointer"
                                    title="Exam Date"
                                  />

                                  <select
                                    value={row.day_order}
                                    onChange={(e) => updateSubjectRow(idx, { day_order: e.target.value })}
                                    className="px-2 py-1.5 border border-purple-200 rounded-lg text-xs font-bold bg-purple-50 text-purple-700 cursor-pointer"
                                    title="Day Order"
                                  >
                                    <option value="Day 1">Day 1</option>
                                    <option value="Day 2">Day 2</option>
                                    <option value="Day 3">Day 3</option>
                                    <option value="Day 4">Day 4</option>
                                    <option value="Day 5">Day 5</option>
                                    <option value="Day 6">Day 6</option>
                                    <option value="None">None</option>
                                  </select>

                                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                    <input
                                      type="time"
                                      min={collegeMin24}
                                      max={collegeMax24}
                                      value={timeTo24h(row.start_time)}
                                      onChange={(e) => handleRowStartTimeChange(idx, e.target.value)}
                                      className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                                      title="Start Time"
                                    />
                                    <span className="text-slate-400 text-xs font-bold">–</span>
                                    <input
                                      type="time"
                                      min={timeTo24h(row.start_time) || collegeMin24}
                                      max={collegeMax24}
                                      value={timeTo24h(row.end_time)}
                                      onChange={(e) => handleRowEndTimeChange(idx, e.target.value)}
                                      className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
                                      title="End Time"
                                    />
                                  </div>

                                  <select
                                    aria-label="Subject Type"
                                    value={row.subject_type || "ACADEMIC"}
                                    onChange={(e) => updateSubjectRow(idx, { subject_type: e.target.value })}
                                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-700 cursor-pointer"
                                    title="Subject Type"
                                  >
                                    <option value="ACADEMIC">ACADEMIC</option>
                                    <option value="SKILL">SKILL</option>
                                    <option value="LAB">LAB</option>
                                    <option value="GENERAL">GENERAL</option>
                                  </select>

                                  {subjectRows.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSubjectRow(idx)}
                                      aria-label="Remove subject row"
                                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                      title="Remove subject"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                {formStep === 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setIsPopupOpen(false); setFormStep(1); }}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!batchExamName.trim()) {
                          toast("Please enter an Exam Title", "warning");
                          return;
                        }
                        if (!batchDept) {
                          toast("Please select a Department", "warning");
                          return;
                        }
                        if (!batchStartDate) {
                          toast("Please pick a starting date", "warning");
                          return;
                        }
                        applyStartDateToRows(batchStartDate, batchDefaultDayOrder);
                        setFormStep(2);
                      }}
                      className="px-5 py-2 btn-gradient text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Next: Build Timetable</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setFormStep(1)}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back to Setup</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || subjectRows.filter((r) => r.included).length === 0}
                      className="px-5 py-2 btn-gradient text-white rounded-xl text-xs font-extrabold shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? "Publishing Timetable..." : `Publish ${subjectRows.filter((r) => r.included).length} Subjects`}
                    </button>
                  </>
                )}
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
};
