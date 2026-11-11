"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp, Slot, StudentAttendance } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { getLocalDateStr } from "@/lib/localDate";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "./Button";
import {
  Calendar,
  User,
  Clock,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Download,
  Book,
  FileText,
  CreditCard,
  Sparkles,
  Award,
  Activity,
  CheckSquare,
  ArrowUpRight,
  Check,
  X,
  GraduationCap,
  Upload,
  RefreshCw,
  Menu,
  Edit2,
  Loader2,
  Video,
  ExternalLink,
  Percent,
  AlertTriangle
} from "lucide-react";
import { formatTimeLabel, calculateShiftSchedule, resolveClassGroupDetailsFromState, parseDbDate, isCohortMatch, isCohortMatching, getDeptFromClassGroup, isSubjectNameMatch, evaluateDailyStudentAttendance, isExamDate, isSkillSubject, calculateWeekOffsetForDate, isSlotOverlappingExamWindow } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { CourseInfoButton } from "./CourseInfoModal";
import { StudentMonthlyNpsCard } from "@/components/student/StudentMonthlyNpsCard";

// Library Books Interface
interface BookItem {
  id: string;
  title: string;
  author: string;
  subject: string;
  shelf: string;
  status: "Available" | "Issued";
  expectedReturn?: string;
}

// Official HackerRank Hexagon SVG Logo
const HackerRankLogo: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 32 32" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M16 0L1.713 8.248v15.504L16 32l14.287-8.248V8.248L16 0z"
      fill="#00EA64"
    />
    <path
      d="M13.882 22.353h-2.824V9.647h2.824v4.941h4.236V9.647h2.824v12.706h-2.824v-5.224h-4.236v5.224z"
      fill="#000000"
    />
  </svg>
);

// Official LeetCode Emblem SVG Logo
const LeetCodeLogo: React.FC<{ className?: string }> = ({ className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193a3.14 3.14 0 0 1-.671-.963 3.04 3.04 0 0 1-.186-1.265 2.923 2.923 0 0 1 .636-1.11l3.854-4.126 5.406-5.788a1.37 1.37 0 0 0-.012-1.936A1.365 1.365 0 0 0 13.483 0z"
      fill="#FFA116"
    />
    <path
      d="M9.833 11.233a1.38 1.38 0 0 0-1.38 1.38 1.38 1.38 0 0 0 1.38 1.38h11.78a1.38 1.38 0 0 0 1.38-1.38 1.38 1.38 0 0 0-1.38-1.38h-11.78z"
      fill="#FFFFFF"
    />
  </svg>
);

export interface StudentDashboardProps {
  activeTab?: "dashboard" | "schedule" | "exams" | "materials" | "library" | "fees" | "profile" | "tracker" | "interviews" | "more_menu";
  onTabChange?: (tab: "dashboard" | "schedule" | "exams" | "materials" | "library" | "fees" | "profile" | "tracker" | "interviews" | "more_menu") => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  activeTab: propActiveTab,
  onTabChange
}) => {
  const {
    slots,
    studentAttendance,
    currentStudent,
    timeSlots,
    daysOfWeek,
    weekDates,
    weekOffset,
    setWeekOffset,
    subjectsList,
    mentors,
    approvedHandovers,
    currentShift,
    setCurrentShift,
    updateStudent,
    interviews,
    interviewEvaluations,
    colleges,
    coursesList,
    weeklyTasks,
    studentTracker,
    gradeStudentTask,
    weeklyAcademicTasks,
    studentAcademicTracker,
    academicTracker,
    gradeStudentAcademicTask
  } = useApp();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [localActiveTab, setLocalActiveTab] = useState<"dashboard" | "schedule" | "exams" | "materials" | "library" | "fees" | "profile" | "tracker" | "interviews" | "more_menu">("dashboard");

  const studentTabAliases: Record<string, typeof localActiveTab> = {
    "home": "dashboard",
    "overview": "dashboard",
    "dashboard": "dashboard",
    "timetable": "schedule",
    "schedule": "schedule",
    "marks": "exams",
    "exams": "exams",
    "tasks": "tracker",
    "submissions": "tracker",
    "tracker": "tracker",
    "interview": "interviews",
    "interviews": "interviews",
    "fee": "fees",
    "fees": "fees",
    "dues": "fees",
    "books": "library",
    "library": "library",
    "profile": "profile",
    "materials": "materials"
  };
  const STUDENT_TAB_IDS = ["dashboard", "schedule", "exams", "materials", "library", "fees", "profile", "tracker", "interviews", "more_menu"];
  // Unknown slugs (e.g. a stale notification link stored in the DB) fall back to the
  // default tab instead of rendering an empty workspace.
  const resolvedPropTab = (() => {
    if (!propActiveTab) return undefined;
    const mapped: string = studentTabAliases[propActiveTab] || propActiveTab;
    return STUDENT_TAB_IDS.includes(mapped) ? mapped : undefined;
  })();
  const activeTab = (resolvedPropTab || localActiveTab) as typeof localActiveTab;
  const setActiveTab = onTabChange || setLocalActiveTab;

  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [highlightedWeek, setHighlightedWeek] = useState<number | null>(null);

  // Handle notification jumps, search queries, and dynamic class/tab switching
  useEffect(() => {
    const handleNavigation = (targetUrl?: string, targetDate?: string, tabHint?: string) => {
      let urlStr = targetUrl || (typeof window !== "undefined" ? window.location.search : "");
      let dateParam = targetDate;
      let tabParam = tabHint;

      const params = new URLSearchParams(
        urlStr.includes("?")
          ? urlStr.split("?")[1]
          : (typeof window !== "undefined" ? window.location.search : "")
      );

      if (!dateParam) {
        dateParam = params.get("date") || undefined;
      }
      if (!tabParam) {
        tabParam = params.get("tab") || undefined;
      }

      const catParam = params.get("category");
      const subjParam = params.get("subject");
      const weekParam = params.get("week");
      const targetIdParam = params.get("targetId");

      if (catParam === "skill" || catParam === "academic") {
        setStudentTrackerCategory(catParam);
      }
      if (subjParam) {
        if (catParam === "academic") {
          setStudentAcadSubject(subjParam);
        } else {
          const matchSub =
            assignedMentorSubjects.find(
              (s) => s.toLowerCase().trim() === subjParam.toLowerCase().trim()
            ) ||
            studentSubjects.find(
              (s) => s.name.toLowerCase().trim() === subjParam.toLowerCase().trim()
            )?.name ||
            subjParam;
          setStudentTrackerSubject(matchSub);
        }
      }
      if (weekParam) {
        const wkNum = parseInt(weekParam, 10);
        if (!isNaN(wkNum)) {
          setStudentTrackerWeek(wkNum);
          setHighlightedWeek(wkNum);
          let attempts = 0;
          const scrollTarget = () => {
            attempts++;
            const el =
              document.getElementById(`skill-task-week-${wkNum}`) ||
              document.getElementById(`acad-task-week-${wkNum}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            } else if (attempts < 10) {
              setTimeout(scrollTarget, 100);
            }
          };
          setTimeout(scrollTarget, 100);
          setTimeout(() => setHighlightedWeek(null), 6000);
        }
      }
      if (targetIdParam) {
        let attempts = 0;
        const scrollTargetId = () => {
          attempts++;
          const el = document.getElementById(targetIdParam);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          } else if (attempts < 10) {
            setTimeout(scrollTargetId, 100);
          }
        };
        setTimeout(scrollTargetId, 100);
      }

      if (dateParam) {
        const offset = calculateWeekOffsetForDate(dateParam);
        setWeekOffset(offset);
        setHighlightedDate(dateParam);
        setActiveTab("schedule");

        // Auto scroll to target date row after render
        setTimeout(() => {
          const el = document.getElementById(`date-row-${dateParam}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 300);

        setTimeout(() => {
          setHighlightedDate(null);
        }, 6000);
      } else if (tabParam && ["dashboard", "schedule", "marks", "exams", "library", "fees", "profile", "tracker", "interviews"].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    };

    // 1. Check intent stored from notification click
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("fp_notif_target");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Date.now() - (parsed.timestamp || 0) < 30000) {
            handleNavigation(parsed.url, parsed.date);
          }
          sessionStorage.removeItem("fp_notif_target");
        } else {
          handleNavigation();
        }
      } catch (_) {
        handleNavigation();
      }
    }

    // 2. Global event listener for instant reactive navigation while on this page
    const onNavEvent = (e: any) => {
      if (e?.detail) {
        handleNavigation(e.detail.url, e.detail.date);
      }
    };
    window.addEventListener("fp_navigate_target", onNavEvent);
    return () => window.removeEventListener("fp_navigate_target", onNavEvent);
  }, [activeTab, setActiveTab, setWeekOffset]);

  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fp_sidebar_collapsed") === "true";
      setIsCollapsed(stored);
    }
  }, []);

  // Student Tracker states (Skill vs Academic)
  const [studentTrackerCategory, setStudentTrackerCategory] = useState<"skill" | "academic">("academic");
  const [studentTrackerSubject, setStudentTrackerSubject] = useState("");
  const [studentAcadSubject, setStudentAcadSubject] = useState("");
  const [studentTrackerWeek, setStudentTrackerWeek] = useState<number>(1);
  const [submittingUrlMap, setSubmittingUrlMap] = useState<Record<number, boolean>>({});
  const [studentUploadType, setStudentUploadType] = useState<Record<number, "url" | "file">>({});
  const [editSubmissionMode, setEditSubmissionMode] = useState<Record<number, boolean>>({});

  // State for OPAC library search
  const [librarySearch, setLibrarySearch] = useState("");

  // State for Dues payment
  const [paidFees, setPaidFees] = useState<Record<string, boolean>>({});

  const [examSubTab, setExamSubTab] = useState<"schedule" | "results">("results");
  const [marksTypeFilter, setMarksTypeFilter] = useState<string>("all");
  const [marksSearchTerm, setMarksSearchTerm] = useState<string>("");

  const studentExamScope = `${currentStudent?.department || ""}|${currentStudent?.classGroup || ""}|${currentStudent?.semester || ""}`;
  const studentExamsQuery = useQuery({
    queryKey: qk.studentExams(currentStudent?.id || "none", currentStudent?.college_id || "none", studentExamScope),
    enabled: !!currentStudent?.id && !!currentStudent?.college_id,
    queryFn: async () => {
      const params = new URLSearchParams({
        college_id: currentStudent!.college_id!,
        department: currentStudent!.department || "",
      });
      if (currentStudent!.classGroup) params.set("class_group", currentStudent!.classGroup);
      if (currentStudent!.semester) params.set("semester", currentStudent!.semester);
      const [examsData, marksData] = await Promise.all([
        apiFetch(`/api/exams?${params.toString()}`),
        apiFetch(`/api/exams/marks?student_id=${encodeURIComponent(currentStudent!.id)}`),
      ]);
      return {
        exams: examsData?.success ? (examsData.exams || []) : [],
        marks: marksData?.success ? (marksData.marks || []) : [],
      };
    },
  });
  const studentExamsList = studentExamsQuery.data?.exams || [];
  const studentMarksList = studentExamsQuery.data?.marks || [];
  const examsLoading = studentExamsQuery.isFetching;

  const dailyConfigsQuery = useQuery({
    queryKey: qk.dailyConfigs(currentStudent?.college_id || colleges[0]?.id || ""),
    queryFn: async () => {
      const data = await apiFetch(`/api/daily-configs?college_id=${encodeURIComponent(currentStudent?.college_id || colleges[0]?.id || "")}`);
      return data?.success ? (data.configs || []) : [];
    },
  });
  const dailyConfigsList = dailyConfigsQuery.data || [];

  useEffect(() => {
    const handleUpdates = () => {
      queryClient.invalidateQueries({ queryKey: ["student-exams"] });
      queryClient.invalidateQueries({ queryKey: ["daily-configs"] });
    };
    window.addEventListener("fp_exams_updated", handleUpdates);
    window.addEventListener("fp_schedule_updated", handleUpdates);
    return () => {
      window.removeEventListener("fp_exams_updated", handleUpdates);
      window.removeEventListener("fp_schedule_updated", handleUpdates);
    };
  }, [queryClient]);

  const [payingFeeId, setPayingFeeId] = useState<string | null>(null);

  // Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(currentStudent?.name || "");
  const [editEmail, setEditEmail] = useState(currentStudent?.email || "");
  const [editId, setEditId] = useState(currentStudent?.id || "");
  const [editDepartment, setEditDepartment] = useState(currentStudent?.department || "");
  const [editClassGroup, setEditClassGroup] = useState(currentStudent?.classGroup || "");
  const [editCollegeId, setEditCollegeId] = useState(currentStudent?.college_id || colleges[0]?.id || "");
  const [editRegisterNumber, setEditRegisterNumber] = useState(currentStudent?.register_number || "");
  const [editRollNumber, setEditRollNumber] = useState(currentStudent?.roll_number || "");
  const [editTenthMark, setEditTenthMark] = useState(currentStudent?.tenth_mark || "");
  const [editEleventhMark, setEditEleventhMark] = useState(currentStudent?.eleventh_mark || "");
  const [editTwelfthMark, setEditTwelfthMark] = useState(currentStudent?.twelfth_mark || "");
  const [editAcademicGroup, setEditAcademicGroup] = useState(currentStudent?.academic_group || "");
  const [editMedium, setEditMedium] = useState(currentStudent?.medium || "");
  const [editBloodGroup, setEditBloodGroup] = useState(currentStudent?.blood_group || "");
  const [editDob, setEditDob] = useState(currentStudent?.dob || "");
  const [editPhone, setEditPhone] = useState(currentStudent?.phone || "");
  const [editParentPhone, setEditParentPhone] = useState(currentStudent?.parent_phone || "");
  const [editAadharNumber, setEditAadharNumber] = useState(currentStudent?.aadhar_number || "");
  const [editLinkedinLink, setEditLinkedinLink] = useState(currentStudent?.linkedin_link || "");
  const [editGithubId, setEditGithubId] = useState(currentStudent?.github_id || "");
  const [editProjectDriveLink, setEditProjectDriveLink] = useState(currentStudent?.project_drive_link || "");
  const [editHackerrankLink, setEditHackerrankLink] = useState(currentStudent?.hackerrank_link || "");
  const [editLeetcodeLink, setEditLeetcodeLink] = useState(currentStudent?.leetcode_link || "");
  const [editFigmaLink, setEditFigmaLink] = useState(currentStudent?.figma_link || "");

  const profileEditPolicyQuery = useQuery<{ classes: string[] }>({
    queryKey: ["profile-edit-policy"],
    queryFn: async () => {
      const data = await apiFetch("/api/profile-edit-policy");
      return { classes: data?.success && Array.isArray(data.classes) ? data.classes : [] };
    },
    staleTime: 60_000,
  });
  const allowedProfileEditClasses = profileEditPolicyQuery.data?.classes || [];

  // State for Bunk Target Slider
  const [bunkTarget, setBunkTarget] = useState(75);

  // Pagination states
  const [booksPage, setBooksPage] = useState(1);
  const [booksPageSize, setBooksPageSize] = useState(25);

  // State for Class Attendance Calendar Month Navigation
  const [attendanceMonthOffset, setAttendanceMonthOffset] = useState<number>(0);

  const studentInterviewsQuery = useQuery<any[]>({
    queryKey: qk.studentInterviews(
      currentStudent?.id || "none",
      `${currentStudent?.classGroup || ""}|${currentStudent?.college_id || ""}`
    ),
    enabled: !!currentStudent?.id,
    queryFn: async () => {
      const data = await apiFetch(`/api/interviews?role=student&studentId=${encodeURIComponent(currentStudent!.id)}&classGroup=${encodeURIComponent(currentStudent!.classGroup || "")}&collegeId=${encodeURIComponent(currentStudent!.college_id || "")}`);
      return data?.success ? (data.interviews || []) : [];
    },
  });
  const studentInterviews = studentInterviewsQuery.data || [];

  const studentAchievementsQuery = useQuery({
    queryKey: qk.studentAchievements(currentStudent?.id || "none"),
    enabled: !!currentStudent?.id,
    queryFn: async () => {
      const data = await apiFetch(`/api/achievements?studentId=${encodeURIComponent(currentStudent!.id)}`);
      return data?.success && Array.isArray(data.records) ? (data.records as any[]) : [];
    },
  });
  const studentAchievements = studentAchievementsQuery.data || [];
  const loadingStudentAchievements = studentAchievementsQuery.isFetching;

  // HackerRank & LeetCode Contest links (Fetched dynamically per college from external database)
  const contestQuery = useQuery({
    queryKey: qk.contestLinks(
      currentStudent?.college_id || "",
      colleges?.find(c => c.id === currentStudent?.college_id)?.name || "",
      currentStudent?.department || "",
      currentStudent?.classGroup || ""
    ),
    enabled: !!currentStudent,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentStudent!.college_id) params.set("collegeId", currentStudent!.college_id);
      const clgObj = colleges?.find(c => c.id === currentStudent!.college_id);
      if (clgObj?.name) params.set("collegeName", clgObj.name);
      if (currentStudent!.department) params.set("department", currentStudent!.department);
      if (currentStudent!.classGroup) params.set("classGroup", currentStudent!.classGroup);
      const data = await apiFetch(`/api/student/contest-links?${params.toString()}`);
      return data?.success ? data : null;
    },
  });
  const contestData = contestQuery.data || null;
  const loadingContests = contestQuery.isFetching;

  // Live LeetCode & HackerRank student performance data
  const codingStatsQuery = useQuery({
    queryKey: qk.studentCodingStats(
      currentStudent?.id || "none",
      [
        currentStudent?.register_number || currentStudent?.roll_number || "",
        currentStudent?.email || "",
        currentStudent?.name || "",
        currentStudent?.college_id || "",
        currentStudent?.leetcode_link || "",
        currentStudent?.hackerrank_link || "",
      ].join("|")
    ),
    enabled: !!currentStudent,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentStudent!.id) params.set("studentId", currentStudent!.id);
      const reg = currentStudent!.register_number || currentStudent!.roll_number;
      if (reg) params.set("registerNumber", reg);
      if (currentStudent!.email) params.set("email", currentStudent!.email);
      if (currentStudent!.name) params.set("name", currentStudent!.name);
      if (currentStudent!.college_id) params.set("collegeId", currentStudent!.college_id);
      const clgObj = colleges?.find(c => c.id === currentStudent!.college_id);
      if (clgObj?.name) params.set("collegeName", clgObj.name);
      if (currentStudent!.leetcode_link) params.set("leetcodeUrl", currentStudent!.leetcode_link);
      if (currentStudent!.hackerrank_link) params.set("hackerrankUrl", currentStudent!.hackerrank_link);
      const data = await apiFetch(`/api/coding-stats?${params.toString()}`);
      return data?.success ? data : null;
    },
  });
  const codingStatsData = codingStatsQuery.data || null;
  const loadingCodingStats = codingStatsQuery.isFetching;

  useEffect(() => {
    if (currentStudent) {
      setEditName(currentStudent.name);
      setEditEmail(currentStudent.email || "");
      setEditId(currentStudent.id);
      setEditDepartment(currentStudent.department || "");
      setEditClassGroup(currentStudent.classGroup || "");
      setEditCollegeId(currentStudent.college_id || colleges[0]?.id || "");
      setEditRegisterNumber(currentStudent.register_number || "");
      setEditRollNumber(currentStudent.roll_number || "");
      setEditTenthMark(currentStudent.tenth_mark || "");
      setEditEleventhMark(currentStudent.eleventh_mark || "");
      setEditTwelfthMark(currentStudent.twelfth_mark || "");
      setEditAcademicGroup(currentStudent.academic_group || "");
      setEditMedium(currentStudent.medium || "");
      setEditBloodGroup(currentStudent.blood_group || "");
      setEditDob(currentStudent.dob || "");
      setEditPhone(currentStudent.phone || "");
      setEditParentPhone(currentStudent.parent_phone || "");
      setEditAadharNumber(currentStudent.aadhar_number || "");
      setEditLinkedinLink(currentStudent.linkedin_link || "");
      setEditGithubId(currentStudent.github_id || "");
      setEditProjectDriveLink(currentStudent.project_drive_link || "");
      setEditHackerrankLink(currentStudent.hackerrank_link || "");
      setEditLeetcodeLink(currentStudent.leetcode_link || "");
      setEditFigmaLink(currentStudent.figma_link || "");
    }
  }, [currentStudent]);

  const startEditingProfile = () => {
    if (currentStudent) {
      setEditName(currentStudent.name);
      setEditEmail(currentStudent.email || "");
      setEditId(currentStudent.id);
      setEditDepartment(currentStudent.department || "");
      setEditClassGroup(currentStudent.classGroup || "");
      setEditCollegeId(currentStudent.college_id || colleges[0]?.id || "");
      setEditRegisterNumber(currentStudent.register_number || "");
      setEditRollNumber(currentStudent.roll_number || "");
      setEditTenthMark(currentStudent.tenth_mark || "");
      setEditEleventhMark(currentStudent.eleventh_mark || "");
      setEditTwelfthMark(currentStudent.twelfth_mark || "");
      setEditAcademicGroup(currentStudent.academic_group || "");
      setEditMedium(currentStudent.medium || "");
      setEditBloodGroup(currentStudent.blood_group || "");
      setEditDob(currentStudent.dob || "");
      setEditPhone(currentStudent.phone || "");
      setEditParentPhone(currentStudent.parent_phone || "");
      setEditAadharNumber(currentStudent.aadhar_number || "");
      setEditLinkedinLink(currentStudent.linkedin_link || "");
      setEditGithubId(currentStudent.github_id || "");
      setEditProjectDriveLink(currentStudent.project_drive_link || "");
      setEditHackerrankLink(currentStudent.hackerrank_link || "");
      setEditLeetcodeLink(currentStudent.leetcode_link || "");
      setEditFigmaLink(currentStudent.figma_link || "");
      setIsEditingProfile(true);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast("Name is required.", "warning");
      return;
    }
    const res = await updateStudent({
      id: editId,
      name: editName,
      email: editEmail,
      role: "student",
      department: editDepartment,
      classGroup: editClassGroup,
      college_id: editCollegeId,
      register_number: editRegisterNumber,
      roll_number: editRollNumber,
      tenth_mark: editTenthMark,
      eleventh_mark: editEleventhMark,
      twelfth_mark: editTwelfthMark,
      academic_group: editAcademicGroup,
      medium: editMedium,
      blood_group: editBloodGroup,
      dob: editDob,
      phone: editPhone,
      parent_phone: editParentPhone,
      // ROLE_UI_AUDIT S1 (P0): never send Aadhaar from student self-edit — the
      // field is CAM/Admin-managed. Omitting it keeps the stored value intact.
      linkedin_link: editLinkedinLink,
      github_id: editGithubId,
      project_drive_link: editProjectDriveLink,
      hackerrank_link: editHackerrankLink,
      leetcode_link: editLeetcodeLink,
      figma_link: editFigmaLink
    });
    if (res.success) {
      toast("Profile updated successfully!", "success");
      setIsEditingProfile(false);
    } else {
      toast("Error: " + res.message, "error");
    }
  };

  if (!currentStudent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500 mb-4 animate-pulse">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Loading Student Portal…</h3>
        <p className="text-xs text-slate-500 max-w-sm">
          Fetching your academic timetable, attendance history, and course records.
        </p>
      </div>
    );
  }

  // Helper: normalize a classGroup string for fuzzy comparison (Bug #1+#5 fix)
  const normalizeClassGroup = (cg: string): string => {
    if (!cg) return "";
    return cg
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")   // strip all non-alphanumeric
      .replace(/shift[12]/g, "");  // ignore shift suffix in comparison
  };

  const studentGroupNorm = normalizeClassGroup(currentStudent.classGroup);

  // Helper to parse student's classGroup into clean components
  const getStudentClassDetails = (classGroup?: string) => {
    if (!classGroup) return { course: "", shift: "", sem: "", year: "" };

    const { department, semester, year } = resolveClassGroupDetailsFromState(
      classGroup,
      subjectsList,
      coursesList
    );

    // Extract Shift
    let shift = "";
    if (classGroup.toLowerCase().includes("shift 1") || classGroup.toLowerCase().includes("shift_1")) {
      shift = "Shift 1";
    } else if (classGroup.toLowerCase().includes("shift 2") || classGroup.toLowerCase().includes("shift_2")) {
      shift = "Shift 2";
    } else {
      shift = "General Shift";
    }

    const num = parseInt(year.replace(/[^0-9]/g, ""), 10);
    const ordinalMap = ["", "1st Year", "2nd Year", "3rd Year", "4th Year"];
    const yearDisplay = ordinalMap[num] || year;

    return { course: department, shift, sem: semester, year: yearDisplay };
  };

  const studentClassDetails = getStudentClassDetails(currentStudent?.classGroup);
  const studentSubjects = subjectsList.filter(s => {
    if (s.college_id && currentStudent?.college_id && s.college_id !== currentStudent.college_id) return false;
    if (s.semester && studentClassDetails.sem && s.semester.toLowerCase().trim() !== studentClassDetails.sem.toLowerCase().trim()) return false;
    if (!studentClassDetails.course) return true;
    const sDept = (s.department || "").toLowerCase().trim();
    const cLower = studentClassDetails.course.toLowerCase().trim();
    return sDept === cLower || sDept.includes(cLower) || cLower.includes(sDept);
  });

  // 1. Get all slots for student's class group — using robust fuzzy + cohort matching
  const myClassSlots = slots.filter((s) => {
    if (!currentStudent) return false;

    // Check college_id if set on slot and student
    if (s.college_id && currentStudent.college_id && s.college_id !== currentStudent.college_id) {
      return false;
    }

    // A. Direct or normalized classGroup match
    if (s.classGroup) {
      if (normalizeClassGroup(s.classGroup) === studentGroupNorm) return true;
      if (isCohortMatching(s.classGroup, currentStudent.classGroup, coursesList, subjectsList)) return true;
    }

    // B. Department and semester fallback matching
    const studentDept = currentStudent.department || "";
    const studentSem = currentStudent.semester || (currentStudent.classGroup ? currentStudent.classGroup.match(/Semester\s*\d+/i)?.[0] : "") || "";

    const slotDept = s.department || (s.classGroup ? getDeptFromClassGroup(s.classGroup) : "");
    const slotSem = s.semester || (s.classGroup ? s.classGroup.match(/Semester\s*\d+/i)?.[0] : "") || "";

    if (studentDept && slotDept && studentSem && slotSem) {
      const dMatch = studentDept.toLowerCase().trim() === slotDept.toLowerCase().trim() ||
        getDeptFromClassGroup(studentDept).toLowerCase() === getDeptFromClassGroup(slotDept).toLowerCase();
      const sMatch = studentSem.toLowerCase().trim() === slotSem.toLowerCase().trim();
      if (dMatch && sMatch) return true;
    }

    // C. Subject match fallback: slot course matches one of student's semester subjects
    if (s.course && studentClassDetails?.sem) {
      const isSubjMatch = studentSubjects.some(sub => isSubjectNameMatch(sub.name, s.course));
      if (isSubjMatch) return true;
    }

    return false;
  });

  // Synchronize the current active shift with the student's actual timetable slot shift
  useEffect(() => {
    let studentShift: "shift_1" | "shift_2" | "general" = "general";
    if (myClassSlots.length > 0) {
      studentShift = myClassSlots[0].shift as "shift_1" | "shift_2" | "general";
    } else if (currentStudent?.classGroup) {
      const groupLower = currentStudent.classGroup.toLowerCase();
      if (groupLower.includes("shift 1") || groupLower.includes("shift_1")) {
        studentShift = "shift_1";
      } else if (groupLower.includes("shift 2") || groupLower.includes("shift_2")) {
        studentShift = "shift_2";
      }
    }

    if (studentShift && currentShift !== studentShift) {
      setCurrentShift(studentShift);
    }
  }, [myClassSlots, currentStudent, currentShift, setCurrentShift]);

  useEffect(() => {
    if (studentSubjects.length > 0 && !studentTrackerSubject) {
      setStudentTrackerSubject(studentSubjects[0].name);
    }
  }, [studentSubjects, studentTrackerSubject]);

  // 2. Get all attendance records for this student (Memoized)
  const myAttendance = useMemo(() => {
    return studentAttendance.filter((a) => a.studentId === currentStudent.id);
  }, [studentAttendance, currentStudent.id]);

  // Daily-evaluated Stats Calculations (1 period absent = full day absent, exam day single marking is enough)
  const evaluatedDailyStats = useMemo(() => {
    const recordsByDate = new Map<string, any[]>();
    myAttendance.forEach(att => {
      const arr = recordsByDate.get(att.dateStr) || [];
      arr.push(att);
      recordsByDate.set(att.dateStr, arr);
    });

    let totalDays = 0;
    let presentDays = 0;
    let absentDays = 0;

    recordsByDate.forEach((recs, dStr) => {
      const d = parseDbDate(dStr);
      const isSunday = d.getDay() === 0;
      const isExam = isExamDate(dStr, dailyConfigsList, myAttendance);
      if (isSunday && !isExam) return; // Skip invalid Sunday records

      totalDays++;
      const evalRes = evaluateDailyStudentAttendance(recs, 0, isExam);
      presentDays += evalRes.presentDays;
      absentDays += evalRes.absentDays;
    });

    const overallPercentage = totalDays > 0 ? (presentDays / totalDays) * 100 : 100;
    return {
      totalClasses: totalDays,
      presentClasses: presentDays,
      absentClasses: absentDays,
      overallPercentage
    };
  }, [myAttendance, dailyConfigsList]);

  const totalClasses = evaluatedDailyStats.totalClasses;
  const presentClasses = evaluatedDailyStats.presentClasses;
  const absentClasses = evaluatedDailyStats.absentClasses;
  const overallPercentage = evaluatedDailyStats.overallPercentage;

  // Compute Bunk / Attendance Projection calculations (Memoized)
  const bunkStats = useMemo(() => {
    if (totalClasses === 0) return { status: "no_data", value: 0 };

    if (overallPercentage >= bunkTarget) {
      const targetRatio = bunkTarget / 100;
      const maxTotal = Math.floor(presentClasses / targetRatio);
      const safeSkip = maxTotal - totalClasses;
      return {
        status: "safe",
        value: safeSkip >= 0 ? safeSkip : 0
      };
    } else {
      const targetPct = bunkTarget;
      const numerator = targetPct * totalClasses - 100 * presentClasses;
      const denominator = 100 - targetPct;
      const requiredConsecutive = Math.ceil(numerator / denominator);
      return {
        status: "shortage",
        value: requiredConsecutive >= 0 ? requiredConsecutive : 0
      };
    }
  }, [totalClasses, overallPercentage, presentClasses, bunkTarget]);

  // Group attendance by Course (Memoized)
  const courseStats = useMemo(() => {
    const statsObj: Record<string, { present: number; absent: number; total: number }> = {};

    myClassSlots.forEach((slot) => {
      if (slot.course && !statsObj[slot.course]) {
        statsObj[slot.course] = { present: 0, absent: 0, total: 0 };
      }
    });

    myAttendance.forEach((att) => {
      const slot = slots.find((s) => s.id === att.slotId);
      if (slot && slot.course) {
        if (!statsObj[slot.course]) {
          statsObj[slot.course] = { present: 0, absent: 0, total: 0 };
        }
        if (att.status === "present") {
          statsObj[slot.course].present++;
        } else {
          statsObj[slot.course].absent++;
        }
        statsObj[slot.course].total++;
      }
    });

    return statsObj;
  }, [myClassSlots, myAttendance, slots]);

  // Memoized Attendance Calendar Month view for Dashboard Class Attendance
  const attendanceCalendarData = useMemo(() => {
    const baseDate = new Date();
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + attendanceMonthOffset, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthName = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Monday = 0, Tuesday = 1, ... Sunday = 6
    const firstDayIndex = (d.getDay() + 6) % 7;
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const attendanceByDate = new Map<string, { present: number; absent: number; total: number }>();
    myAttendance.forEach(att => {
      const entry = attendanceByDate.get(att.dateStr) || { present: 0, absent: 0, total: 0 };
      if (att.status === "present") entry.present++;
      else entry.absent++;
      entry.total++;
      attendanceByDate.set(att.dateStr, entry);
    });

    const days: Array<{
      type: "pad" | "day";
      day?: number;
      dateStr?: string;
      status?: "present" | "absent" | "holiday" | "event" | "exam" | "unmarked";
      dayConfig?: any;
      attRecord?: any;
      key: string;
    }> = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ type: "pad", key: `pad-${i}` });
    }

    let monthPresentDays = 0;
    let monthAbsentDays = 0;
    let monthTotalMarked = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayDate = new Date(year, month, day);
      const isSunday = dayDate.getDay() === 0;

      const dayConfig = dailyConfigsList.find((c: any) => c.dateStr === dateStr);
      const isHoliday = isSunday || dayConfig?.day_type === "holiday";
      const isEvent = dayConfig?.day_type === "event";
      const isExam = dayConfig?.day_type === "exam_day" || dayConfig?.day_type === "exam";

      // Sundays are weekly holidays and never have regular working attendance
      const attRecord = !isSunday || isExam || isEvent ? attendanceByDate.get(dateStr) : undefined;
      let status: "present" | "absent" | "holiday" | "event" | "exam" | "unmarked" = "unmarked";

      if (attRecord && attRecord.total > 0) {
        monthTotalMarked++;
        if (attRecord.absent > 0) {
          status = "absent";
          monthAbsentDays++;
        } else {
          status = "present";
          monthPresentDays++;
        }
      } else if (isHoliday) {
        status = isSunday ? "unmarked" : "holiday";
      } else if (isEvent) {
        status = "event";
      } else if (isExam) {
        status = "exam";
      }

      days.push({
        type: "day",
        day,
        dateStr,
        status,
        dayConfig,
        attRecord,
        key: dateStr
      });
    }

    const monthPercentage = monthTotalMarked > 0 ? Math.round((monthPresentDays / monthTotalMarked) * 100) : 100;

    return {
      monthName,
      days,
      monthPresentDays,
      monthAbsentDays,
      monthTotalMarked,
      monthPercentage
    };
  }, [attendanceMonthOffset, myAttendance, dailyConfigsList]);

  // Cohort Weekly Tasks for Dashboard View
  const dashboardCohortTasks = useMemo(() => {
    return (weeklyTasks || []).filter(task =>
      isCohortMatching(task.class_group, currentStudent?.classGroup, coursesList, subjectsList) ||
      (currentStudent?.department && task.class_group.toLowerCase().includes(currentStudent.department.toLowerCase().trim()))
    ).slice(0, 4);
  }, [weeklyTasks, currentStudent, coursesList, subjectsList]);

  // Subjects with mentor-assigned weekly tasks or marked as skill subjects for this student's class group
  const assignedMentorSubjects = useMemo(() => {
    const matchingTasks = (weeklyTasks || []).filter(task =>
      isCohortMatching(task.class_group, currentStudent?.classGroup, coursesList, subjectsList) ||
      (currentStudent?.department && task.class_group.toLowerCase().includes(currentStudent.department.toLowerCase().trim()))
    );
    const taskSubjects = Array.from(new Set(matchingTasks.map(t => t.subject).filter(Boolean))).filter(s => isSkillSubject(s));

    // Also include enrolled semester subjects that are explicitly marked as skill subjects
    const skillEnrolledSubjects = (studentSubjects || []).filter(s => isSkillSubject(s)).map(s => s.name);

    const combined = Array.from(new Set([...taskSubjects, ...skillEnrolledSubjects])).filter(Boolean);
    return combined;
  }, [weeklyTasks, currentStudent, coursesList, subjectsList, studentSubjects]);

  // Automatically sync studentTrackerSubject with assignedMentorSubjects
  useEffect(() => {
    if (assignedMentorSubjects.length > 0) {
      if (
        !studentTrackerSubject ||
        !assignedMentorSubjects.some(
          (s) =>
            isSubjectNameMatch(s, studentTrackerSubject) ||
            s.toLowerCase().trim() === studentTrackerSubject.toLowerCase().trim()
        )
      ) {
        setStudentTrackerSubject(assignedMentorSubjects[0]);
      }
    } else if (studentSubjects.length > 0 && !studentTrackerSubject) {
      const skillSub = studentSubjects.find((s) => isSkillSubject(s));
      if (skillSub) {
        setStudentTrackerSubject(skillSub.name);
      }
    }
  }, [assignedMentorSubjects, studentSubjects, studentTrackerSubject]);



  // Ensure Saturday is dynamically included in weekDates whenever 6-day working, Saturday slots exist, or Saturday has daily config
  const effectiveWeekDates = useMemo(() => {
    if (weekDates.length >= 6) return weekDates;
    if (weekDates.length === 0) return weekDates;

    const mon = new Date(weekDates[0].dateStr);
    const sat = new Date(mon);
    sat.setDate(mon.getDate() + 5);
    const satDateStr = sat.toISOString().split("T")[0];

    const hasSatConfig = dailyConfigsList.some((c: any) => {
      if (c.dateStr !== satDateStr) return false;
      return (c.day_order && c.day_order !== "None") || c.day_type === "working" || c.day_type === "regular" || c.day_type === "event" || c.day_type === "exam_day";
    });

    const hasSatSlots = myClassSlots.some(s => s.day === "Saturday");
    const activeCollege = colleges.find(c => c.id === currentStudent?.college_id);
    const is6DaysCollege = Number(activeCollege?.working_days) === 6;

    if (is6DaysCollege || hasSatSlots || hasSatConfig) {
      return [
        ...weekDates,
        {
          day: "Saturday",
          dateStr: satDateStr,
          formatted: sat.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        }
      ];
    }

    return weekDates;
  }, [weekDates, dailyConfigsList, myClassSlots, colleges, currentStudent]);

  // Helper to resolve the active day for a calendar date, accounting for CAM Day Order overrides
  const getMappedDayForDate = (dateStr: string, defaultDay: string) => {
    const dailyConfig = dailyConfigsList.find((c: any) => c.dateStr === dateStr);

    // If it's a holiday, return a special holiday flag
    if (dailyConfig && dailyConfig.day_type === "holiday") {
      return "holiday";
    }

    if (dailyConfig && dailyConfig.day_order && dailyConfig.day_order !== "None") {
      const match = dailyConfig.day_order.match(/^Day (\d+)$/i);
      if (match) {
        const orderNum = parseInt(match[1]);
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (orderNum >= 1 && orderNum <= dayNames.length) {
          return dayNames[orderNum - 1];
        }
      }
    }

    return defaultDay;
  };

  // Helper to find slot attendance for a specific day/date and time slot
  const getAttendanceForCell = (day: string, dateStr: string, time: string) => {
    const dailyConfig = dailyConfigsList.find((c: any) => c.dateStr === dateStr);

    // 1. Holiday handling
    if (dailyConfig && dailyConfig.day_type === "holiday") {
      return {
        type: "holiday" as const,
        config: dailyConfig,
        attendance: null,
        slot: null,
        handover: null
      };
    }

    const queryDay = getMappedDayForDate(dateStr, day);

    // Look for date-level attendance (e.g. exam / event / general day attendance)
    const dayAttendance = myAttendance.find((a) => a.dateStr === dateStr);

    const normalizeTimeStr = (t?: string) => {
      if (!t) return "";
      return t.toLowerCase()
        .replace(/\./g, ":")
        .replace(/\s+/g, "")
        .replace(/^0/, "");
    };

    const normCellTime = normalizeTimeStr(time);

    // Find the slot for this class group at this time using flexible time matching
    const slot = myClassSlots.find((s) => {
      if (s.day !== queryDay) return false;
      if (s.time === time) return true;

      const normSlotTime = normalizeTimeStr(s.time);
      if (normSlotTime === normCellTime) return true;

      // Compare start times e.g. "9:00 AM" vs "09:00 AM - 10:00 AM"
      const cellStart = formatTimeLabel(time).toLowerCase().replace(/[^a-z0-9]/g, "");
      const slotStart = formatTimeLabel(s.time).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cellStart && slotStart && cellStart === slotStart) return true;

      return false;
    });

    // Check if there is an active exam for this student on this date whose start & end time window overlaps this specific period slot
    const examsOnDate = (studentExamsList || []).filter((ex: any) => ex.exam_date === dateStr);
    const overlappingExam = examsOnDate.find((ex: any) =>
      isSlotOverlappingExamWindow(time, ex.start_time, ex.end_time)
    );

    if (overlappingExam) {
      return {
        type: "exam" as const,
        config: dailyConfig || null,
        exam: overlappingExam,
        attendance: dayAttendance || (slot ? myAttendance.find((a) => a.slotId === slot.id && a.dateStr === dateStr) : null) || null,
        slot: slot || null,
        handover: null
      };
    }

    if (!slot) {
      if (dailyConfig && dailyConfig.day_type === "event") {
        return {
          type: "event" as const,
          config: dailyConfig,
          exam: null,
          attendance: dayAttendance || null,
          slot: null,
          handover: null
        };
      }
      return null;
    }

    // Check if there is an approved handover (substitution) for this slot on this date
    const handover = (approvedHandovers || []).find((h) => h.slotId === slot.id && h.dateStr === dateStr);

    // Find if student has an attendance marked for this slot on this date or day-level attendance
    const att = myAttendance.find((a) => a.slotId === slot.id && a.dateStr === dateStr) ||
      (dailyConfig?.day_type === "event" ? dayAttendance : null);

    return {
      type: "slot" as const,
      slot,
      handover,
      exam: null,
      attendance: att || null,
      config: dailyConfig || null
    };
  };

  // Generate timetable rows with break/lunch intervals dynamically
  const rows: (
    | { type: "slot"; time: string; index?: number }
    | { type: "break" | "lunch"; label: string; timeRange: string }
  )[] = [];

  const collegeObj = colleges.find(c => c.id === currentStudent.college_id);
  const details = getStudentClassDetails(currentStudent.classGroup);

  const getCleanSemesterKey = (sem?: string) => {
    if (!sem) return "";
    const clean = sem.toLowerCase().trim();
    if (clean.includes("sem i") || clean.includes("sem 1") || clean.includes("semester 1") || clean.includes("semester i")) return "Semester 1";
    if (clean.includes("sem ii") || clean.includes("sem 2") || clean.includes("semester 2") || clean.includes("semester ii")) return "Semester 2";
    if (clean.includes("sem iii") || clean.includes("sem 3") || clean.includes("semester 3") || clean.includes("semester iii")) return "Semester 3";
    if (clean.includes("sem iv") || clean.includes("sem 4") || clean.includes("semester 4") || clean.includes("semester iv")) return "Semester 4";
    if (clean.includes("sem v") || clean.includes("sem 5") || clean.includes("semester 5") || clean.includes("semester v")) return "Semester 5";
    if (clean.includes("sem vi") || clean.includes("sem 6") || clean.includes("semester 6") || clean.includes("semester vi")) return "Semester 6";
    if (clean.includes("sem vii") || clean.includes("sem 7") || clean.includes("semester 7") || clean.includes("semester vii")) return "Semester 7";
    if (clean.includes("sem viii") || clean.includes("sem 8") || clean.includes("semester 8") || clean.includes("semester viii")) return "Semester 8";
    return sem;
  };

  let activeParams: any = null;
  if (collegeObj && collegeObj.shift_configs) {
    try {
      const parsed = JSON.parse(collegeObj.shift_configs);
      const semKey = getCleanSemesterKey(details.sem);
      if (semKey && parsed.semesters?.[semKey]?.[currentShift]) {
        activeParams = parsed.semesters[semKey][currentShift]?.custom_shift_params || null;
      }
      if (!activeParams && parsed.custom_shift_params?.[currentShift]) {
        activeParams = parsed.custom_shift_params[currentShift];
      }
    } catch (_) { }
  }

  let scheduleItems: any[] = [];
  if (activeParams) {
    const res = calculateShiftSchedule(activeParams);
    if (res && !res.error && res.items.length > 0) {
      scheduleItems = res.items;
    }
  }

  if (scheduleItems.length > 0) {
    scheduleItems.forEach((item) => {
      if (item.type === "period") {
        rows.push({
          type: "slot",
          time: `${item.startTimeStr} - ${item.endTimeStr}`,
          index: item.index
        });
      } else {
        rows.push({
          type: "break",
          label: item.name,
          timeRange: `${item.startTimeStr} - ${item.endTimeStr}`
        });
      }
    });
  } else {
    // Dynamic chronological fallback matching actual time gaps
    const fallbackSlots = timeSlots || [];
    fallbackSlots.forEach((time, index) => {
      rows.push({ type: "slot", time });

      if (index < fallbackSlots.length - 1) {
        const partsCur = time.split(/\s*-\s*/);
        const partsNext = fallbackSlots[index + 1].split(/\s*-\s*/);

        if (partsCur.length >= 2 && partsNext.length >= 1) {
          const parseTimeMinutes = (tStr: string) => {
            if (!tStr) return { mins: 0, formatted: "" };
            const cleaned = tStr.trim();
            const match = cleaned.match(/(\d+)(?::|\.)(\d+)\s*(AM|PM)?/i);
            if (!match) return { mins: 0, formatted: cleaned };
            let h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const isPM = (match[3] || "").toUpperCase() === "PM" || (cleaned.toLowerCase().includes("pm") && !cleaned.toLowerCase().includes("am"));
            const period = isPM ? "PM" : "AM";
            let h24 = h;
            if (isPM && h24 !== 12) h24 += 12;
            if (!isPM && h24 === 12) h24 = 0;
            const mins = h24 * 60 + m;
            const formatted = `${h}:${m.toString().padStart(2, "0")} ${period}`;
            return { mins, formatted };
          };

          const endCur = parseTimeMinutes(partsCur[1]);
          const startNext = parseTimeMinutes(partsNext[0]);
          const diffMins = startNext.mins - endCur.mins;

          if (diffMins > 5) {
            const isLunch = diffMins >= 35 || (endCur.mins >= 700 && endCur.mins <= 800);
            rows.push({
              type: isLunch ? "lunch" : "break",
              label: isLunch ? "Lunch Break" : "Break",
              timeRange: `${endCur.formatted} - ${startNext.formatted}`
            });
          }
        }
      }
    });
  }

  // Dynamically map library resources from active DB subjectsList
  const libraryBooks: BookItem[] = useMemo(() => {
    const list = studentSubjects.length > 0 ? studentSubjects : (subjectsList || []);
    return list.map((subj, idx) => ({
      id: `BK-${subj.id || (idx + 1)}`,
      title: `${subj.name} — Curriculum Textbook & Reference Guide`,
      author: "Dept. Curriculum Faculty & Board of Studies",
      subject: subj.name,
      shelf: `Rack ${String.fromCharCode(65 + (idx % 8))}-${(idx % 4) + 1}`,
      status: "Available" as const
    }));
  }, [studentSubjects, subjectsList]);

  // Filter OPAC Books based on query
  const filteredBooks = libraryBooks.filter((book) => {
    const q = librarySearch.toLowerCase();
    return (
      book.title.toLowerCase().includes(q) ||
      book.author.toLowerCase().includes(q) ||
      book.subject.toLowerCase().includes(q) ||
      book.id.toLowerCase().includes(q)
    );
  });

  // Real fee state from /api/fees
  const feeQuery = useQuery({
    queryKey: qk.studentFees(currentStudent?.id || "none"),
    enabled: !!currentStudent?.id,
    queryFn: async () => apiFetch(`/api/fees?role=student&studentId=${encodeURIComponent(currentStudent!.id)}`),
  });
  const feeData = feeQuery.data || null;
  const feeLoading = feeQuery.isFetching;
  const [feePayModal, setFeePayModal] = useState<any | null>(null);
  const [feePayAmount, setFeePayAmount] = useState("");
  const [feePayMethod, setFeePayMethod] = useState("online");
  const [feePaySubmitting, setFeePaySubmitting] = useState(false);
  const [feePaySuccess, setFeePaySuccess] = useState<string | null>(null);

  // Subject Materials (Unit-Wise Study Hub) Real State
  const [selectedMaterialSubject, setSelectedMaterialSubject] = useState<string>("");
  const [selectedMaterialUnit, setSelectedMaterialUnit] = useState<number | "all">("all");
  const [materialTypeFilter, setMaterialTypeFilter] = useState<string>("all");
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");
  const [previewMaterial, setPreviewMaterial] = useState<any | null>(null);

  const materialsQuery = useQuery<any[]>({
    queryKey: qk.studentMaterials(currentStudent?.college_id || "all", selectedMaterialSubject || "none"),
    enabled: activeTab === "materials" && !!selectedMaterialSubject,
    queryFn: async () => {
      const params = new URLSearchParams({ subject: selectedMaterialSubject });
      if (currentStudent?.college_id) params.set("collegeId", currentStudent.college_id);
      const data = await apiFetch(`/api/materials?${params.toString()}`);
      return data?.success ? (data.materials || []) : [];
    },
    placeholderData: (prev) => prev,
  });
  const materialsList = materialsQuery.data || [];
  const materialsLoading = materialsQuery.isFetching;

  useEffect(() => {
    if (studentSubjects.length > 0 && !selectedMaterialSubject) {
      setSelectedMaterialSubject(studentSubjects[0].name);
    }
  }, [studentSubjects, selectedMaterialSubject]);

  const handleFeePayment = async () => {
    if (!feePayModal || !feePayAmount || !currentStudent) return;
    setFeePaySubmitting(true);
    try {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeId: feePayModal.id,
          studentId: currentStudent.id,
          amount: Number(feePayAmount),
          paymentMethod: feePayMethod,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeePaySuccess(json.receiptNo || "Recorded");
        await feeQuery.refetch();
      } else {
        toast(json.message || "Payment could not be recorded.", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Payment could not be recorded.", "error");
    } finally { setFeePaySubmitting(false); }
  };

  // Student Interview Hub reads the same cached query as the calendar widgets.
  const studentInterviewsList = studentInterviews;
  const loadingStudentInterviews = studentInterviewsQuery.isFetching;

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-warm-canvas text-slate-800 h-full overflow-hidden">
      {/* Dynamic sidebar for student portal modules */}
      {(() => {
        const pendingTrackerCount = weeklyTasks.filter(t => {
          const isMatch = isCohortMatching(t.class_group, currentStudent?.classGroup, coursesList, subjectsList);
          if (!isMatch) return false;
          const entry = studentTracker.find(e => e.student_id === currentStudent?.id && e.week_number === t.week_number && e.subject.toLowerCase().trim() === t.subject.toLowerCase().trim());
          return !entry || !entry.submission_url;
        }).length;

        const getNotificationCount = (tabId: string) => {
          if (tabId === "tracker") return pendingTrackerCount;
          if (tabId === "fees") return feeData?.stats?.unpaidCount || 0;
          return 0;
        };

        return (
          <aside className={`hidden md:flex shrink-0 flex-col justify-between floating-sidebar transition-all duration-300 ${isCollapsed ? "w-20 p-3" : "w-64 p-6"}`}>
            <div className="flex flex-col flex-1 overflow-y-auto">
              {/* Sidebar Link items */}
              <nav className="space-y-1 pt-2">
                {[
                  { id: "dashboard", label: "Dashboard", icon: Activity },
                  { id: "schedule", label: "Schedule", icon: Calendar },
                  { id: "interviews", label: "My Interviews", icon: Award },
                  { id: "tracker", label: "Skill Development", icon: GraduationCap },
                  { id: "exams", label: "Exams & Marks", icon: BookOpen },
                  { id: "materials", label: "Subject Materials", icon: Book },
                  { id: "fees", label: "Fees", icon: CreditCard },
                  { id: "profile", label: "My Profile", icon: User }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id || (tab.id === "materials" && activeTab === "library");
                  const count = getNotificationCount(tab.id);
                  return (
                    <a
                      key={tab.id}
                      href={`/student/${tab.id}`}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey || e.button === 1) return;
                        e.preventDefault();
                        if (tab.id === "tracker") {
                          setStudentTrackerCategory("skill");
                        }
                        setActiveTab(tab.id as typeof activeTab);
                      }}
                      className={`w-full flex items-center rounded-xl text-xs font-bold tracking-tight transition-all duration-200 cursor-pointer group ${isCollapsed ? "justify-center px-0 py-3" : "justify-start gap-3 px-3.5 py-2.5 text-left"
                        } ${isActive
                          ? "bg-zinc-900 text-white ring-1 ring-inset ring-zinc-800 font-extrabold shadow-sm dark:bg-zinc-900 dark:text-white"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10"
                        }`}
                    >
                      <div className="relative flex items-center justify-center">
                        <Icon className={`h-4.5 w-4.5 shrink-0 transition-colors ${isActive ? "text-amber-400" : "text-slate-400 group-hover:text-amber-500"}`} />
                        {isCollapsed && count > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 block h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
                        )}
                      </div>
                      {!isCollapsed && <span>{tab.label}</span>}
                      {!isCollapsed && count > 0 && (
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? "bg-amber-500 text-zinc-950 font-black" : "bg-rose-500 text-white"}`}>
                          {count}
                        </span>
                      )}
                    </a>
                  );
                })}
              </nav>
            </div>

            {/* User profile card & collapse button at bottom */}
            <div className="border-t border-slate-100/85 pt-4 space-y-3 shrink-0">
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setIsCollapsed((prev) => {
                    const next = !prev;
                    localStorage.setItem("fp_sidebar_collapsed", String(next));
                    return next;
                  })}
                  className="h-8.5 w-8.5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-xs transition-all cursor-pointer"
                  title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                >
                  {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </aside>
        );
      })()}

      {/* Mobile Bottom Navigation — visible only on small screens */}
      <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav">
        <div className="flex w-full justify-around items-center py-2 px-0.5">
          {[
            { id: "dashboard", label: "Home", icon: Activity },
            { id: "schedule", label: "Schedule", icon: Calendar },
            { id: "tracker", label: "Skills", icon: GraduationCap },
            { id: "materials", label: "Materials", icon: Book },
            { id: "more_menu", label: "More", icon: Menu },
          ].map(t => {
            const Icon = t.icon;
            const isActive = activeTab === t.id || (t.id === "materials" && activeTab === "library") || (t.id === "more_menu" && ["exams", "fees", "profile"].includes(activeTab));
            const pendingCount = t.id === "tracker"
              ? weeklyTasks.filter(task => {
                const isMatch = isCohortMatching(task.class_group, currentStudent?.classGroup, coursesList, subjectsList);
                if (!isMatch) return false;
                const entry = studentTracker.find(e => e.student_id === currentStudent?.id && e.week_number === task.week_number && e.subject.toLowerCase().trim() === task.subject.toLowerCase().trim());
                return !entry || !entry.submission_url;
              }).length
              : t.id === "fees" ? (feeData?.stats?.unpaidCount || 0) : 0;
            return (
              <a
                key={t.id}
                href={`/student/${t.id}`}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.button === 1) return;
                  e.preventDefault();
                  if (t.id === "tracker") {
                    setStudentTrackerCategory("skill");
                  }
                  setActiveTab(t.id as typeof activeTab);
                }}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] flex-1 rounded-xl transition-all cursor-pointer ${isActive ? "text-zinc-950 dark:text-white" : "text-slate-400"
                  }`}
              >
                <div className="relative">
                  <Icon className={`h-4.5 w-4.5 transition-transform ${isActive ? "scale-110 text-amber-500" : ""}`} />
                  {pendingCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 h-3 w-3 bg-rose-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <span className={`text-[8px] font-semibold tracking-wide leading-none ${isActive ? "text-zinc-950 dark:text-white" : "text-slate-400"}`}>
                  {t.label}
                </span>
                {isActive && <span className="absolute top-0 inset-x-1 h-0.5 bg-amber-500 rounded-full" />}
              </a>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 floating-main-panel p-4 md:p-6 lg:p-8 space-y-6 pb-20 md:pb-12 overflow-y-auto h-full scroll-touch">
        {/* Portal Header Summary */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
              {activeTab === "dashboard" && "Dashboard"}
              {activeTab === "schedule" && "Class Timetable"}
              {activeTab === "interviews" && "Mock Interviews"}
              {activeTab === "tracker" && "Skill Development"}
              {activeTab === "exams" && "Exams & Marks"}
              {(activeTab === "materials" || activeTab === "library") && "Study Materials"}
              {activeTab === "fees" && "Fee Details"}
              {activeTab === "profile" && "My Profile"}
              {activeTab === "more_menu" && "More Options"}
            </h1>
            <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {(() => {
              const details = getStudentClassDetails(currentStudent.classGroup);
              return (
                <span className="text-xs text-slate-500 font-bold flex items-center gap-2 flex-wrap">
                  <span>{details.course}</span>
                  <span className="text-slate-300">•</span>
                  <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-black text-amber-800">{details.year}</span>
                  <span className="text-slate-300">•</span>
                  <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-100 text-[10px] font-black text-teal-700">{details.sem}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-400">{details.shift}</span>
                </span>
              );
            })()}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* HackerRank Direct Department Contest Link */}
            {contestData?.hackerrank?.contestUrl && (
              <a
                href={contestData.hackerrank.contestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 transition-all hover:scale-105 shadow-2xs group cursor-pointer"
                title={contestData.hackerrank.contestName ? `HackerRank: ${contestData.hackerrank.contestName}` : "HackerRank Contest"}
              >
                <HackerRankLogo className="h-5 w-5 drop-shadow-sm group-hover:scale-105 transition-transform" />
              </a>
            )}

            {/* LeetCode Direct Contest Link */}
            {contestData?.leetcode?.contestUrl && (
              <a
                href={contestData.leetcode.contestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-8 w-8 rounded-xl bg-slate-900 hover:bg-slate-800 transition-all hover:scale-105 shadow-2xs group cursor-pointer"
                title="LeetCode Contest"
              >
                <LeetCodeLogo className="h-5 w-5 drop-shadow-sm group-hover:scale-105 transition-transform" />
              </a>
            )}

            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full text-amber-800">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-[9px] font-extrabold uppercase tracking-widest">
                Academic Session
              </span>
            </div>
          </div>
        </div>

        {/* Tab More Menu: Grid of remaining tabs */}
        {activeTab === "more_menu" && (
          <div className="space-y-6 animate-fadeIn pb-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <a
                href="/student/interviews"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.button === 1) return;
                  e.preventDefault();
                  setActiveTab("interviews");
                }}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-purple-50 dark:bg-purple-900/25 flex items-center justify-center text-purple-600 shrink-0 group-hover:scale-105 transition-transform">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">My Interviews</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Join Google Meet, view slots & rubric scores</span>
                </div>
              </a>

              <a
                href="/student/exams"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.button === 1) return;
                  e.preventDefault();
                  setActiveTab("exams");
                }}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-rose-50 dark:bg-rose-900/25 flex items-center justify-center text-rose-500 shrink-0 group-hover:scale-105 transition-transform">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">Examinations & Test Marks</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">View test marks, scorecards & timetables</span>
                </div>
              </a>

              <a
                href="/student/materials"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.button === 1) return;
                  e.preventDefault();
                  setActiveTab("materials");
                }}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-teal-50 dark:bg-teal-900/25 flex items-center justify-center text-teal-500 shrink-0 group-hover:scale-105 transition-transform">
                  <Book className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">Subject Materials</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Unit-wise notes, slides & question banks</span>
                </div>
              </a>

              <a
                href="/student/fees"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.button === 1) return;
                  e.preventDefault();
                  setActiveTab("fees");
                }}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center gap-4 shadow-card cursor-pointer group"
              >
                <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/25 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 transition-transform">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">Fees</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {(feeData?.stats?.unpaidCount || 0) > 0
                      ? `${feeData?.stats?.unpaidCount} fee record${feeData?.stats?.unpaidCount === 1 ? "" : "s"} pending`
                      : "Semester fees, receipts & payment links"}
                  </span>
                </div>
              </a>

              <a
                href="/student/profile"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || e.button === 1) return;
                  e.preventDefault();
                  setActiveTab("profile");
                }}
                className="p-5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center gap-4 shadow-card cursor-pointer group sm:col-span-2"
              >
                <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0 group-hover:scale-105 transition-transform">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">My Profile</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Personal info and settings</span>
                </div>
              </a>
            </div>
          </div>
        )}

        {/* Tab 1: Dashboard Attendance & Bunk Predictor */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            {/* Left Columns (Col Span 2) */}
            <div className="lg:col-span-2 space-y-6">

              {/* Real-Time Overview Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* 3. Academic Mock Interviews Summary Tile */}
                {(() => {
                  const upcomingInterview = (studentInterviews || []).find((inv: any) => inv.status !== "evaluated") || (studentInterviews || [])[0];
                  const evaluatedCount = (studentInterviews || []).filter((inv: any) => inv.status === "evaluated").length;

                  return (
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card relative flex flex-col justify-between group hover:shadow-card-lg transition-all">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Mock Interviews</span>
                          <span className="text-lg font-black text-slate-900">
                            {upcomingInterview ? upcomingInterview.subject || "Interview Round" : "No Pending Rounds"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("interviews")}
                          className="p-2 bg-sunken border border-slate-200 inset-shadow-well text-slate-700 rounded-full shrink-0 shadow-2xs hover:bg-white cursor-pointer"
                          title="Open Interviews"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                        <span className="text-[10.5px] font-bold text-slate-500">
                          {upcomingInterview?.target_date ? `Date: ${upcomingInterview.target_date}` : `${evaluatedCount} Evaluated`}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-zinc-100 text-zinc-900 border border-zinc-200">
                          {upcomingInterview ? upcomingInterview.status || "Scheduled" : "Active"}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* 4. Fees & Dues Standing Tile */}
                {(() => {
                  const unpaidAmt = feeData?.stats?.totalUnpaidAmount || feeData?.stats?.pendingAmount || 0;
                  const isClear = unpaidAmt === 0;

                  return (
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-card relative flex flex-col justify-between group hover:shadow-card-lg transition-all">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Semester Fees</span>
                          <span className="text-xl font-black text-slate-900">
                            {isClear ? "All Dues Cleared" : `₹${unpaidAmt.toLocaleString("en-IN")}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("fees")}
                          className="p-2 bg-sunken border border-slate-200 inset-shadow-well text-slate-700 rounded-full shrink-0 shadow-2xs hover:bg-white cursor-pointer"
                          title="Open Fees"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                        <span className="text-[10.5px] font-bold text-slate-500">
                          {isClear ? "Receipts available" : "Pending installment"}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${isClear ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}>
                          {isClear ? "Clear" : "Unpaid"}
                        </span>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Monthly class feedback (feeds admin Reports & Insight → Student NPS) */}
              <StudentMonthlyNpsCard studentId={currentStudent?.id || ""} />

              {/* Curriculum Tasks & Weekly Submissions */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100/80 pb-4">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Curriculum Tasks & Submissions</h2>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Assigned weekly practicals, lab exercises, and term evaluations</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentTrackerCategory("skill");
                      setActiveTab("tracker");
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold cursor-pointer shadow-xs transition-all hover:scale-105"
                  >
                    <span>Open Tracker</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Tasks List from DB / Context */}
                <div className="space-y-3.5">
                  {dashboardCohortTasks.length > 0 ? (
                    dashboardCohortTasks.map((task) => {
                      const studentSub = (studentTracker || []).find(
                        (st) =>
                          st.student_id === currentStudent.id &&
                          st.week_number === task.week_number &&
                          st.subject.toLowerCase().trim() === task.subject.toLowerCase().trim()
                      );
                      const isGraded = typeof studentSub?.marks === "number";
                      const isSubmitted = !!studentSub?.submission_url;
                      const formattedDate = task.created_at ? parseDbDate(task.created_at).toLocaleDateString() : undefined;

                      return (
                        <div
                          key={task.id || `${task.subject}-${task.week_number}`}
                          className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl hover:bg-slate-50 hover:shadow-xs transition-all duration-200"
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-black uppercase ${isGraded
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                : isSubmitted
                                  ? "bg-zinc-100 text-zinc-900 border border-zinc-200"
                                  : "bg-amber-100 text-amber-800 border border-amber-200"
                              }`}>
                              W{task.week_number}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-800 block truncate leading-tight">
                                {task.task_name}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-wider">
                                  {task.subject}
                                </span>
                                {formattedDate && (
                                  <span className="text-[9.5px] text-slate-400 font-medium flex items-center gap-0.5">
                                    • Assigned: {formattedDate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider select-none ${isGraded
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200/50"
                                : isSubmitted
                                  ? "bg-amber-50 text-amber-800 border border-amber-200/50"
                                  : "bg-amber-50 text-amber-700 border border-amber-200/50"
                              }`}>
                              {isGraded ? `Score: ${studentSub.marks}/10` : isSubmitted ? "Submitted" : "Pending"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                window.dispatchEvent(new CustomEvent("fp_navigate_target", {
                                  detail: { url: `/student/tracker?category=skill&subject=${encodeURIComponent(task.subject)}&week=${task.week_number}` }
                                }));
                                setActiveTab("tracker");
                              }}
                              className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer shadow-2xs transition-colors"
                              title="Go to submission"
                            >
                              <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                      <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">No active weekly submissions</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Assigned faculty tasks and lab practicals will appear here.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setStudentTrackerCategory("skill");
                          setActiveTab("tracker");
                        }}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <span>View Skill Tracker</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Right Column (Col Span 1) */}
            <div className="lg:col-span-1 space-y-6">

              {/* Class Attendance Calendar Card with Dates & Ticks */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Class attendance</h2>
                    <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                      {attendanceCalendarData.monthName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setAttendanceMonthOffset(prev => prev - 1)}
                      className="p-1.5 rounded-lg bg-sunken hover:bg-white border border-slate-200 inset-shadow-well/80 text-slate-600 cursor-pointer shadow-2xs transition-colors"
                      title="Previous Month"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceMonthOffset(0)}
                      className={`px-2 py-1 text-[9px] font-black rounded-lg border transition-all cursor-pointer ${attendanceMonthOffset === 0
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                    >
                      Current
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceMonthOffset(prev => prev + 1)}
                      className="p-1.5 rounded-lg bg-sunken hover:bg-white border border-slate-200 inset-shadow-well/80 text-slate-600 cursor-pointer shadow-2xs transition-colors"
                      title="Next Month"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Calendar 7-Day Header */}
                  <div className="grid grid-cols-7 text-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>

                  {/* Calendar Date Grid */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {attendanceCalendarData.days.map((item) => {
                      if (item.type === "pad") {
                        return <div key={item.key} className="h-9 w-full" />;
                      }

                      const dayNum = item.day;
                      const status = item.status;
                      const dateStr = item.dateStr || "";

                      if (status === "present") {
                        return (
                          <div
                            key={item.key}
                            className="h-9 rounded-xl flex flex-col items-center justify-center bg-emerald-50 border border-emerald-200 text-emerald-800 transition-all hover:scale-105 shadow-2xs cursor-default relative group"
                            title={`Date: ${dateStr} - Present (Attended)`}
                          >
                            <span className="text-[9px] font-black leading-none">{dayNum}</span>
                            <Check className="h-3 w-3 text-emerald-600 stroke-[3] mt-0.5" />
                          </div>
                        );
                      }

                      if (status === "absent") {
                        return (
                          <div
                            key={item.key}
                            className="h-9 rounded-xl flex flex-col items-center justify-center bg-rose-50 border border-rose-200 text-rose-800 transition-all hover:scale-105 shadow-2xs cursor-default relative group"
                            title={`Date: ${dateStr} - Absent`}
                          >
                            <span className="text-[9px] font-black leading-none">{dayNum}</span>
                            <X className="h-3 w-3 text-rose-600 stroke-[3] mt-0.5" />
                          </div>
                        );
                      }

                      if (status === "holiday") {
                        return (
                          <div
                            key={item.key}
                            className="h-9 rounded-xl flex flex-col items-center justify-center bg-rose-50/40 border border-dashed border-rose-200/80 text-rose-600 cursor-default"
                            title={`Date: ${dateStr} - Holiday (${item.dayConfig?.notes || "College Holiday"})`}
                          >
                            <span className="text-[9px] font-black leading-none">{dayNum}</span>
                            <span className="text-[7.5px] font-black text-rose-500 mt-0.5 uppercase">H</span>
                          </div>
                        );
                      }

                      if (status === "event") {
                        return (
                          <div
                            key={item.key}
                            className="h-9 rounded-xl flex flex-col items-center justify-center bg-amber-50/60 border border-amber-200 text-amber-700 cursor-default"
                            title={`Date: ${dateStr} - Campus Event (${item.dayConfig?.notes || "Activity"})`}
                          >
                            <span className="text-[9px] font-black leading-none">{dayNum}</span>
                            <span className="text-[7.5px] font-black text-amber-600 mt-0.5 uppercase">E</span>
                          </div>
                        );
                      }

                      if (status === "exam") {
                        return (
                          <div
                            key={item.key}
                            className="h-9 rounded-xl flex flex-col items-center justify-center bg-purple-50/60 border border-purple-200 text-purple-700 cursor-default"
                            title={`Date: ${dateStr} - Exam Day (${item.dayConfig?.notes || "Assessment"})`}
                          >
                            <span className="text-[9px] font-black leading-none">{dayNum}</span>
                            <span className="text-[7.5px] font-black text-purple-600 mt-0.5 uppercase">Ex</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.key}
                          className="h-9 rounded-xl flex items-center justify-center border border-slate-100 bg-slate-50/40 text-slate-400 text-[10px] font-bold"
                          title={`Date: ${dateStr}`}
                        >
                          {dayNum}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Calendar Legend & Stats Bar */}
                <div className="space-y-2 border-t border-slate-100/70 pt-3">
                  <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-500">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      <span>Present: <strong className="text-slate-800">{attendanceCalendarData.monthPresentDays}</strong></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <span>Absent: <strong className="text-slate-800">{attendanceCalendarData.monthAbsentDays}</strong></span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/60">
                        {attendanceCalendarData.monthPercentage}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* My Schedule Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">My schedule</h2>
                  <span className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Today
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Today's Scheduled Interview Banner if any */}
                  {(() => {
                    const todayStr = getLocalDateStr();
                    const todayInterview = studentInterviews.find(inv => inv.target_date === todayStr);
                    if (!todayInterview) return null;

                    const mySlot = (todayInterview.student_slots || []).find((s: any) =>
                      s.student_id === currentStudent?.id || s.roll_number === currentStudent?.roll_number
                    );
                    const isInternal = todayInterview.type === "internal" || mySlot?.mode === "in_person";
                    const meetLink = !isInternal ? (mySlot?.gmeet_link || todayInterview.gmeet_link) : null;
                    const evaluator = mySlot?.mentor_name || todayInterview.mentor_name || "Faculty Evaluator";
                    const timing = mySlot?.slot_start_time || todayInterview.preferred_start_time || "Time TBA";

                    return (
                      <div className="p-4 bg-purple-50/80 border border-purple-200 rounded-xl flex items-center justify-between gap-4 shadow-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8.5 w-8.5 rounded-full bg-purple-100 border border-purple-200 flex items-center justify-center font-bold text-purple-700 text-xs shrink-0 select-none">
                            I
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-black text-purple-950 block truncate">{todayInterview.subject}</span>
                            <span className="text-[10px] text-purple-700 block truncate font-semibold mt-0.5">
                              Evaluator: {evaluator} • {timing} {isInternal ? "• In-Person" : ""}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {!isInternal && meetLink ? (
                            <a
                              href={meetLink}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 rounded-lg text-[9.5px] font-black inline-flex items-center gap-1 shadow-2xs"
                            >
                              <Video className="w-3 h-3" /> Join Room
                            </a>
                          ) : isInternal ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg text-[9.5px] font-bold border border-purple-200">
                              <User className="w-3 h-3 text-purple-600" /> In-Person
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9.5px] font-bold border border-slate-200">
                              <Video className="w-3 h-3 text-slate-400" /> Link not shared yet
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {myClassSlots.map((slot, index) => {
                    const mentor = mentors.find(m => m.id === slot.mentorId);
                    const teacherName = mentor?.name || (slot.department ? `${slot.department} Faculty` : "Faculty Instructor");
                    const initial = teacherName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "FA";

                    return (
                      <div key={slot.id || index} className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8.5 w-8.5 rounded-full bg-indigo-50 border border-slate-100 flex items-center justify-center font-bold text-amber-600 text-xs shrink-0 select-none">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 block truncate">{slot.course || "Scheduled Period"}</span>
                            <span className="text-[10px] text-slate-500 block truncate font-semibold mt-0.5">{teacherName}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[9.5px] font-extrabold text-slate-500 block">{slot.time.split(" - ")[0]}</span>
                          <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-200/50 rounded-lg text-[8.5px] font-extrabold text-slate-600 mt-1 font-mono uppercase">
                            {slot.location || "Classroom"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {myClassSlots.length === 0 && !studentInterviews.some(inv => inv.target_date === getLocalDateStr()) && (
                    <div className="text-center py-6 text-slate-400 text-xs italic font-semibold">
                      No classes scheduled for today.
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}


        {/* Tab 2: e-Campus Timetable */}
        {activeTab === "schedule" && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Weekly Class Timetable</h2>
                <p className="text-[11px] text-slate-400 mt-1">Displays scheduled courses and period attendance status for the selected week.</p>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 shadow-inner shrink-0">
                <button
                  type="button"
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className="p-1 hover:bg-white rounded-lg text-slate-600 hover:text-amber-600 transition-all cursor-pointer"
                  title="Previous Week"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] font-bold text-slate-800 px-2 min-w-[130px] text-center select-none font-sans">
                  {weekOffset === 0 ? "Current Week" : `${effectiveWeekDates[0]?.formatted} – ${effectiveWeekDates[effectiveWeekDates.length - 1]?.formatted}`}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  className="p-1 hover:bg-white rounded-lg text-slate-600 hover:text-amber-600 transition-all cursor-pointer"
                  title="Next Week"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[70vh] rounded-xl border border-slate-200 shadow-sm relative no-scrollbar">
              <table className="w-full table-fixed border-collapse text-left min-w-[800px]">
                <thead>
                  <tr className="text-xs text-slate-500 dark:text-slate-300 font-bold uppercase">
                    <th className="sticky top-0 left-0 z-30 p-4 w-[12%] text-slate-700 dark:text-slate-200 bg-slate-100/95 dark:bg-[#141419] backdrop-blur-xs border-r border-b border-slate-200 dark:border-white/5">Day / Date</th>
                    {(() => {
                      let slotCounter = 0;
                      return rows.map((col, idx) => {
                        if (col.type === "break" || col.type === "lunch") {
                          return (
                            <th key={idx} className="sticky top-0 z-20 p-4 text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider text-center select-none bg-slate-50/95 dark:bg-[#0f0f14] backdrop-blur-xs border-b border-slate-200 dark:border-white/5 w-[8%]">
                              <div>{col.label}</div>
                              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-normal mt-0.5">{formatTimeLabel(col.timeRange)}</div>
                            </th>
                          );
                        }
                        if (col.type === "slot") {
                          slotCounter++;
                          return (
                            <th key={col.time} className="sticky top-0 z-20 p-4 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50/95 dark:bg-[#141419] backdrop-blur-xs border-b border-slate-200 dark:border-white/5 w-[12%]">
                              <div>Period {slotCounter}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-400 font-normal mt-0.5">{formatTimeLabel(col.time)}</div>
                            </th>
                          );
                        }
                        return null;
                      });
                    })()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-[#101015]">
                  {effectiveWeekDates.map((date) => {
                    const dayConfig = dailyConfigsList.find((c: any) => c.dateStr === date.dateStr);
                    const isHighlighted = highlightedDate === date.dateStr;

                    return (
                      <tr
                        key={date.day}
                        id={`date-row-${date.dateStr}`}
                        className={`h-24 transition-all duration-500 ${isHighlighted
                            ? "bg-amber-500/10 dark:bg-amber-950/30 ring-2 ring-amber-500 ring-inset shadow-md"
                            : "hover:bg-slate-50/10 dark:hover:bg-white/[0.02]"
                          }`}
                      >
                        {/* First Cell: Day / Date */}
                        <td className="sticky left-0 z-10 p-3 text-xs font-bold text-slate-700 border-r border-slate-200 bg-slate-50/95 dark:bg-[#141419] dark:border-white/5 backdrop-blur-xs align-middle">
                          <div className="flex flex-col justify-center items-center">
                            <span className="text-sm font-black text-slate-900 leading-none">{date.day}</span>
                            <span className="text-[9px] text-slate-400 font-extrabold uppercase mt-1 leading-none">{date.formatted}</span>
                            {dayConfig?.day_type === "holiday" && (
                              <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[7.5px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 shrink-0" title={dayConfig.notes || "Holiday"}>
                                Holiday
                              </span>
                            )}
                            {dayConfig?.day_type === "event" && (
                              <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[7.5px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 shrink-0" title={dayConfig.notes || "Campus Event"}>
                                Event
                              </span>
                            )}
                            {(dayConfig?.day_type === "exam_day" || dayConfig?.day_type === "exam") && (
                              <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[7.5px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 shrink-0" title={dayConfig.notes || "Exam Day"}>
                                Exam Day
                              </span>
                            )}
                            {dayConfig?.day_order && dayConfig.day_order !== "None" && dayConfig.day_type !== "holiday" && (
                              <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[7.5px] font-black uppercase bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                {dayConfig.day_order}
                              </span>
                            )}
                            {(!dayConfig?.day_order || dayConfig?.day_order === "None") && dayConfig?.day_type !== "holiday" && (
                              <span className="mt-1.5 px-1.5 py-0.5 rounded-full text-[7.5px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0" title="Day order not configured">
                                No Order
                              </span>
                            )}
                            {studentInterviews.some((inv: any) => inv.target_date === date.dateStr) && (
                              <span className="mt-1 px-1.5 py-0.5 rounded-full text-[7.5px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
                                Interview
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Columns */}
                        {rows.map((col, cIdx) => {
                          if (col.type === "break" || col.type === "lunch") {
                            return (
                              <td
                                key={`break-${cIdx}`}
                                className="p-2 text-center text-xs font-extrabold text-slate-500 bg-slate-50/5 uppercase tracking-widest italic select-none border-r border-slate-100 last:border-r-0 align-middle"
                              >
                                {col.label}
                              </td>
                            );
                          }

                          if (col.type !== "slot") return null;
                          const time = col.time;
                          const cellData = getAttendanceForCell(date.day, date.dateStr, time);

                          // Check for student's scheduled interview session on this date & period
                          const interviewForSlot = studentInterviews?.find((inv: any) => {
                            if (inv.target_date !== date.dateStr) return false;
                            const prefTime = inv.preferred_start_time || "08:20 AM - 09:10 AM";
                            const slotTimeNorm = time.replace(/\s+/g, "").toLowerCase();
                            const prefTimeNorm = prefTime.replace(/\s+/g, "").toLowerCase();
                            if (slotTimeNorm.includes(prefTimeNorm) || prefTimeNorm.includes(slotTimeNorm)) return true;

                            // Check student slots
                            if (inv.student_slots && inv.student_slots.some((s: any) =>
                              (s.student_id === currentStudent?.id || s.roll_number === currentStudent?.roll_number) &&
                              (s.slot_start_time?.includes(time) || time.includes(s.slot_start_time))
                            )) return true;

                            // Match by start hour
                            const startHourMin = prefTime.split("-")[0].trim().toLowerCase().replace(".", ":");
                            const cellStartHourMin = time.split("-")[0].trim().toLowerCase().replace(".", ":");
                            if (startHourMin && cellStartHourMin && (startHourMin.includes(cellStartHourMin) || cellStartHourMin.includes(startHourMin))) return true;

                            // If assigned and Period 1:
                            if ((time.startsWith("8.20") || time.startsWith("08:20") || time.startsWith("9.00") || time.startsWith("09:00")) && (inv.status === "assigned" || inv.status === "completed" || inv.status === "pending_verification")) return true;

                            return false;
                          });

                          if (interviewForSlot) {
                            const isCompleted = interviewForSlot.status === "completed";
                            const mySlot = (interviewForSlot.student_slots || []).find((s: any) =>
                              s.student_id === currentStudent?.id || s.roll_number === currentStudent?.roll_number
                            );
                            const isInternal = interviewForSlot.type === "internal" || mySlot?.mode === "in_person";
                            const meetLink = !isInternal ? (mySlot?.gmeet_link || interviewForSlot.gmeet_link) : null;
                            const evaluatorName = mySlot?.mentor_name || interviewForSlot.mentor_name || "Faculty Evaluator";
                            const slotTiming = mySlot?.slot_start_time || interviewForSlot.preferred_start_time || "Time TBA";

                            return (
                              <td key={time} className="p-1.5 h-24 border-r border-slate-100 dark:border-white/5 last:border-r-0 align-top bg-white dark:bg-[#101015]">
                                <div className={`h-full flex flex-col justify-between p-2 rounded-xl border text-xs shadow-xs transition-all ${isCompleted
                                    ? "bg-emerald-50/80 border-emerald-300 text-emerald-950"
                                    : "bg-purple-50/80 border-purple-300 text-purple-950 hover:shadow-sm"
                                  }`}>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1 mb-1 max-w-full">
                                      <span className="px-1.5 py-0.5 rounded bg-purple-200/80 border border-purple-300 text-[7.5px] font-black text-purple-800 uppercase tracking-wide">
                                        INTERVIEW ({interviewForSlot.type?.toUpperCase() || "EXTERNAL"})
                                      </span>
                                    </div>
                                    <div className="font-extrabold text-[10px] leading-tight mb-1 text-purple-950 line-clamp-1" title={interviewForSlot.subject}>
                                      {interviewForSlot.subject}
                                    </div>
                                    <div className="text-[8px] text-purple-700 font-semibold truncate leading-none">
                                      Evaluator: {evaluatorName}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-[8px] mt-1 pt-1.5 border-t border-purple-200/60 font-black uppercase">
                                    {!isInternal && meetLink ? (
                                      <a
                                        href={meetLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-amber-600 hover:underline inline-flex items-center gap-0.5 font-bold"
                                      >
                                        <Video className="w-2.5 h-2.5" /> GMeet
                                      </a>
                                    ) : (
                                      <span className="text-purple-600 font-mono">{isInternal ? "In-Person" : slotTiming}</span>
                                    )}
                                    <span className={`px-1.5 py-0.5 rounded text-[7.5px] ${isCompleted
                                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                        : "bg-purple-100 text-purple-800 border border-purple-300"
                                      }`}>
                                      {isCompleted ? "Evaluated" : "Scheduled"}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          if (cellData?.type === "holiday") {
                            return (
                              <td key={time} className="p-1.5 h-24 border-r border-slate-100 dark:border-white/5 last:border-r-0 align-middle bg-rose-50/10 dark:bg-rose-950/5">
                                <div className="h-full flex flex-col items-center justify-center p-2 rounded-xl border border-dashed border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-center">
                                  <span className="text-[8.5px] font-black uppercase text-rose-700 dark:text-rose-400">College Holiday</span>
                                  <span className="text-[8px] text-rose-500 font-medium truncate max-w-full mt-0.5">{cellData.config?.notes || "No Classes Scheduled"}</span>
                                </div>
                              </td>
                            );
                          }

                          if (cellData?.type === "event") {
                            return (
                              <td key={time} className="p-1.5 h-24 border-r border-slate-100 dark:border-white/5 last:border-r-0 align-top bg-amber-50/15 dark:bg-amber-950/5">
                                <div className="h-full flex flex-col justify-between p-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 shadow-xs">
                                  <div>
                                    <span className="px-1.5 py-0.5 rounded bg-amber-200/80 border border-amber-300 text-[7.5px] font-black text-amber-800 uppercase tracking-wide">
                                      CAMPUS EVENT
                                    </span>
                                    <div className="text-[9.5px] font-bold text-amber-950 dark:text-amber-200 mt-1 line-clamp-1">
                                      {cellData.config?.notes || "Campus Activity"}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-[8px] mt-1 pt-1 border-t border-amber-200/60 font-black uppercase">
                                    <span className="text-amber-700">Event Session</span>
                                    {cellData.attendance ? (
                                      <span className={`px-1.5 py-0.5 rounded ${cellData.attendance.status === "present"
                                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                          : "bg-rose-100 text-rose-800 border border-rose-300"
                                        }`}>
                                        {cellData.attendance.status}
                                      </span>
                                    ) : (
                                      <span className="text-amber-600/70 italic">Unmarked</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          if (cellData?.type === "exam") {
                            const examInfo = cellData.exam;
                            return (
                              <td key={time} className="p-1.5 h-24 border-r border-slate-100 dark:border-white/5 last:border-r-0 align-top bg-purple-50/20 dark:bg-purple-950/10">
                                <div className="h-full flex flex-col justify-between p-2 rounded-xl border border-purple-300 dark:border-purple-800/60 bg-purple-50/70 dark:bg-purple-950/30 shadow-xs">
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <span className="px-1.5 py-0.5 rounded bg-purple-600 text-[7.5px] font-black text-white uppercase tracking-wider">
                                        📝 {examInfo?.exam_type || "EXAMINATION"}
                                      </span>
                                      {examInfo?.hall_room && (
                                        <span className="text-[7.5px] font-bold text-purple-700 dark:text-purple-300 truncate max-w-[80px]">
                                          📍 {examInfo.hall_room}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] font-extrabold text-purple-950 dark:text-purple-100 line-clamp-1 leading-tight">
                                      {examInfo?.subject_name || cellData.config?.notes || "Assessment Session"}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-[8px] mt-1 pt-1 border-t border-purple-200/60 dark:border-purple-800/40 font-black uppercase">
                                    <span className="text-purple-700 dark:text-purple-300 font-mono">
                                      {examInfo?.session_time || formatTimeLabel(time)}
                                    </span>
                                    {cellData.attendance ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[7.5px] ${cellData.attendance.status === "present"
                                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                          : "bg-rose-100 text-rose-800 border border-rose-300"
                                        }`}>
                                        {cellData.attendance.status}
                                      </span>
                                    ) : (
                                      <span className="text-purple-600/70 italic text-[7.5px]">Exam Mode</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td key={time} className="p-1.5 h-24 border-r border-slate-100 dark:border-white/5 last:border-r-0 align-top bg-white dark:bg-[#101015]">
                              {!cellData || !cellData.slot ? (
                                <div className="h-full flex items-center justify-center text-[9px] text-slate-400 italic border border-dashed border-slate-100 rounded-xl bg-slate-50/30">
                                  Free Period
                                </div>
                              ) : (
                                <div className="h-full flex flex-col justify-between p-2 rounded-xl border border-slate-100 dark:border-white/8 bg-slate-50/20 dark:bg-[#1c1c26] shadow-sm relative overflow-hidden">
                                  <div className="space-y-1">
                                    <div className="text-[9px] font-extrabold text-amber-600 truncate" title={cellData.handover?.course || cellData.slot.course}>
                                      {cellData.handover?.course || cellData.slot.course}
                                    </div>
                                    <div className="text-[8px] text-slate-400 dark:text-slate-300 font-bold truncate">
                                      {cellData.handover ? (
                                        <span className="text-slate-700 font-extrabold">{cellData.handover.coverStaffName}</span>
                                      ) : (
                                        mentors.find((m) => m.id === cellData.slot.mentorId)?.name || "Faculty"
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex justify-between items-center text-[8.5px] mt-2 border-t border-slate-100 pt-1.5">
                                    <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-300 font-semibold bg-white dark:bg-[#1c1c26] border border-slate-200 dark:border-white/10 px-1 rounded">
                                      <MapPin className="h-2 w-2 shrink-0" />
                                      {cellData.slot.location ? cellData.slot.location.split(" ")[0] : "Class"}
                                    </span>

                                    {cellData.attendance ? (
                                      <span
                                        className={`px-1 py-0.5 rounded text-[8px] font-black uppercase ${cellData.attendance.status === "present"
                                            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                                            : "bg-rose-50 border border-rose-200 text-rose-700"
                                          }`}
                                      >
                                        {cellData.attendance.status}
                                      </span>
                                    ) : (
                                      <span className="text-[8px] text-slate-400 dark:text-slate-300 italic">Unmarked</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}



        {/* Tab: My Interviews & Evaluation Marks */}
        {activeTab === "interviews" && (
          <div className="space-y-6 font-sans">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">My Interview Sessions &amp; Evaluation Marks</h2>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    View scheduled interview dates, evaluator ratings (Communication, Technical, Content, Confidence), questions asked, and clearance status.
                  </p>
                </div>
              </div>

              {(() => {
                const myCohortInterviews = (interviews || []).filter((inv: any) =>
                  inv.status !== "cancelled" && inv.status !== "declined" && (
                    (inv.class_group && inv.class_group.toLowerCase().trim() === currentStudent.classGroup?.toLowerCase().trim()) ||
                    (inv.student_slots && inv.student_slots.some((s: any) => s.student_id === currentStudent.id)) ||
                    inv.student_id === currentStudent.id
                  )
                );

                if (myCohortInterviews.length === 0) {
                  return (
                    <div className="text-center py-12 border border-slate-100 rounded-xl bg-slate-50/50">
                      <Award className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-700">No Interview Sessions Scheduled</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Your cohort has no active interview allocations scheduled at this time.</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {myCohortInterviews.map((inv: any) => {
                      const mySlot = (inv.student_slots || []).find(
                        (s: any) => s.student_id === currentStudent.id
                      );
                      const myEval = (interviewEvaluations || []).find(
                        (e: any) => e.interview_id === inv.id && e.student_id === currentStudent.id
                      );

                      const isInternal = inv.type === "internal" || mySlot?.mode === "in_person";
                      const isAllocated = Boolean(mySlot) || (!inv.student_slots?.length && inv.status === "assigned");
                      const assignedTime = mySlot ? `${mySlot.slot_start_time} - ${mySlot.slot_end_time}` : (inv.preferred_start_time || "Time TBA");
                      const assignedMentor = mySlot?.mentor_name || inv.mentor_name || "Assigned Faculty Evaluator";
                      const meetLink = !isInternal ? (mySlot?.gmeet_link || inv.gmeet_link) : null;
                      const isVerified = inv.status === "completed";

                      return (
                        <div key={inv.id} className="p-5 rounded-xl border border-slate-100 bg-slate-50/30 space-y-3.5 shadow-xs">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              {(inv.type || "internal").toUpperCase()} INTERVIEW
                            </span>
                            <span className="text-[10px] font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
                              Target Date: {inv.target_date}
                            </span>
                          </div>

                          <div>
                            <h3 className="font-extrabold text-sm text-slate-900">{inv.subject}</h3>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">Topics: {inv.topics || "General Technical & Viva Review"}</p>
                          </div>

                          {/* Allocation & Time Slot Window */}
                          {isAllocated ? (
                            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 space-y-2 shadow-card">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                                <span className="flex items-center gap-1.5 text-amber-700">
                                  <Clock className="w-3.5 h-3.5" /> Assigned Time: {assignedTime}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Evaluator: <strong className="text-slate-800">{assignedMentor}</strong>
                                </span>
                              </div>

                              {!isInternal && meetLink ? (
                                <div className="pt-1 flex items-center justify-between">
                                  <span className="text-[10px] font-semibold text-slate-400">Virtual Meeting Room:</span>
                                  <a
                                    href={meetLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-[11px] font-black px-3 py-1.5 rounded-lg transition-all shadow-2xs"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" /> Join Live Google Meet
                                  </a>
                                </div>
                              ) : isInternal ? (
                                <div className="pt-1 flex items-center justify-between">
                                  <span className="text-[10px] font-semibold text-slate-500">Evaluation Mode:</span>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-200">
                                    <User className="w-3 h-3 text-amber-600" /> In-Person Evaluation (Faculty Cabin)
                                  </span>
                                </div>
                              ) : (
                                <div className="pt-1 flex items-center justify-between">
                                  <span className="text-[10px] font-semibold text-slate-400">Virtual Meeting Room:</span>
                                  <span className="text-[10px] font-bold text-slate-500">Link will be shared by your evaluator</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-center text-[11px] font-semibold text-amber-800">
                              You are unallocated in this current batch (Capacity limited to {inv.allocated_students || inv.student_count || 10} students). You will be scheduled in the next upcoming cycle.
                            </div>
                          )}

                          {/* Evaluation Status & Multi-criteria Scores */}
                          {myEval ? (
                            <div className="bg-white p-3.5 rounded-2xl border border-slate-100 space-y-2.5 shadow-card">
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${myEval.status === "Cleared" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                    myEval.status === "Needs Improvement" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                      "bg-rose-50 text-rose-700 border border-rose-200"
                                  }`}>
                                  {isVerified ? `✓ Conducted & Verified — ${myEval.status}` : `Conducted — Pending CM Verification`}
                                </span>
                                <span className="text-xs font-black text-amber-700">Total Score: {myEval.total_score || 0}/10 ({Math.round((Number(myEval.total_score) || 0) * 10)}%)</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-[10px] bg-slate-50 p-2 rounded-lg font-bold border border-slate-100">
                                <div><span className="text-slate-400 block text-[8px]">COMM.</span>{myEval.communication_score}/10</div>
                                <div><span className="text-slate-400 block text-[8px]">CONTENT</span>{myEval.content_score}/10</div>
                                <div><span className="text-slate-400 block text-[8px]">TECH</span>{myEval.technical_score}/10</div>
                                <div><span className="text-slate-400 block text-[8px]">CONF.</span>{myEval.confidence_score}/10</div>
                              </div>

                              {myEval.questions_asked && (() => {
                                let qList: any[] = [];
                                try {
                                  const parsed = typeof myEval.questions_asked === "string" ? JSON.parse(myEval.questions_asked) : myEval.questions_asked;
                                  if (Array.isArray(parsed)) qList = parsed;
                                } catch (_) {}

                                if (qList.length > 0) {
                                  return (
                                    <div className="space-y-1.5 pt-1">
                                      <span className="text-[10px] font-black uppercase text-slate-400 block">Questions &amp; Ratings:</span>
                                      <div className="space-y-1">
                                        {qList.map((q: any, qi: number) => (
                                          <div key={q.id || qi} className="text-[10.5px] bg-slate-50 p-2 rounded-lg border border-slate-200/80 flex items-center justify-between gap-2">
                                            <span className="text-slate-700 font-semibold truncate">
                                              <strong className="text-amber-600 font-mono">Q{qi + 1}:</strong> {q.question || "Technical Question"}
                                            </span>
                                            <span className="text-[10px] font-black text-amber-700 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                                              {q.score ?? 7}/10
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div className="text-[10.5px] text-slate-600">
                                    <strong>Questions Asked:</strong> &ldquo;{myEval.questions_asked}&rdquo;
                                  </div>
                                );
                              })()}
                              {myEval.remarks && (
                                <div className="text-[10.5px] text-amber-700 italic">
                                  <strong>Evaluator Remarks:</strong> &ldquo;{myEval.remarks}&rdquo;
                                </div>
                              )}
                            </div>
                          ) : isAllocated ? (
                            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-[11px] font-bold text-amber-800">
                              ⏳ Scheduled & Ready — Awaiting Evaluation by {assignedMentor}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Tab 5: Examinations, Test Marks & Assessment Hub */}
        {activeTab === "exams" && (() => {
          const todayStr = getLocalDateStr();
          const allExams = studentExamsList || [];
          const pastExams = allExams.filter((ex: any) => ex.exam_date < todayStr);
          const upcomingExams = allExams.filter((ex: any) => ex.exam_date >= todayStr);
          const displayMarks = studentMarksList || [];

          // Compute summary stats for student results
          let totalMarks = 0;
          let totalMaxMarks = 0;
          let passedCount = 0;
          let arrearsCount = 0;
          let absentCount = 0;

          displayMarks.forEach((m: any) => {
            if (m.is_absent) {
              absentCount++;
              arrearsCount++;
            } else if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
              totalMarks += parseFloat(m.marks_obtained);
              totalMaxMarks += parseFloat(m.max_marks || 50);
              const passM = parseFloat(m.passing_marks || (m.max_marks * 0.4) || 20);
              if (parseFloat(m.marks_obtained) >= passM) passedCount++;
              else arrearsCount++;
            }
          });

          const overallPct = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : "—";

          const availableExamTypes = Array.from(
            new Set([
              ...displayMarks.map((m: any) => m.exam_type),
              ...allExams.map((ex: any) => ex.exam_type),
            ].filter(Boolean))
          ).sort();

          const examGroups = availableExamTypes.map((type: string) => {
            const typeMarks = displayMarks.filter((m: any) => m.exam_type === type);
            const typeScheduled = allExams.filter((ex: any) => ex.exam_type === type);

            // Scheduled exams not yet evaluated
            const evaluatedSubjectKeys = new Set(
              typeMarks.map((m: any) => (m.subject_code || m.subject_name || "").toLowerCase())
            );
            const pendingExams = typeScheduled.filter((ex: any) => {
              const key = (ex.subject_code || ex.subject_name || "").toLowerCase();
              return key ? !evaluatedSubjectKeys.has(key) : true;
            });

            // Calculate metrics for this exam type
            let scoreTotal = 0;
            let maxTotal = 0;
            let passCount = 0;
            let arrearCount = 0;
            let evalCount = 0;

            typeMarks.forEach((m: any) => {
              if (m.is_absent) {
                arrearCount++;
                evalCount++;
              } else if (m.marks_obtained !== null && m.marks_obtained !== undefined) {
                evalCount++;
                const s = parseFloat(m.marks_obtained);
                const mx = parseFloat(m.max_marks || 50);
                const passM = parseFloat(m.passing_marks || (mx * 0.4) || 20);
                scoreTotal += s;
                maxTotal += mx;
                if (s >= passM) passCount++;
                else arrearCount++;
              }
            });

            const allDates = [
              ...typeMarks.map((m: any) => m.exam_date),
              ...typeScheduled.map((ex: any) => ex.exam_date),
            ].filter(Boolean).sort();
            const minDate = allDates[0];
            const maxDate = allDates[allDates.length - 1];
            const dateRangeStr = minDate ? (minDate === maxDate ? minDate : `${minDate} → ${maxDate}`) : "";

            // Filter rows by marksSearchTerm if active
            const q = marksSearchTerm.toLowerCase().trim();
            const matchesQuery = (subName: string, subCode: string, evalBy?: string) => {
              if (!q) return true;
              return (
                type.toLowerCase().includes(q) ||
                (subName || "").toLowerCase().includes(q) ||
                (subCode || "").toLowerCase().includes(q) ||
                (evalBy || "").toLowerCase().includes(q)
              );
            };

            const filteredTypeMarks = typeMarks.filter((m: any) =>
              matchesQuery(m.subject_name, m.subject_code, m.evaluated_by)
            );
            const filteredPendingExams = pendingExams.filter((ex: any) =>
              matchesQuery(ex.subject_name, ex.subject_code)
            );

            const totalSubjects = typeMarks.length + pendingExams.length;
            const hasMatches = !q || filteredTypeMarks.length > 0 || filteredPendingExams.length > 0;

            return {
              type,
              typeMarks: filteredTypeMarks,
              pendingExams: filteredPendingExams,
              totalSubjects,
              evalCount,
              scoreTotal,
              maxTotal,
              passCount,
              arrearCount,
              pct: maxTotal > 0 ? ((scoreTotal / maxTotal) * 100).toFixed(1) : null,
              dateRangeStr,
              hasMatches,
            };
          }).filter((g: any) => {
            if (marksTypeFilter !== "all" && g.type !== marksTypeFilter) return false;
            if (marksSearchTerm.trim() && !g.hasMatches) return false;
            return true;
          });

          return (
            <div className="space-y-5 font-sans">
              {/* Header Navigation & Sub-Tabs */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        Examinations & Test Marks Hub
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[9px] font-black uppercase inline-flex items-center gap-1">
                          <span>{currentStudent?.department || "Department"}</span>
                          {currentStudent?.department && (
                            <CourseInfoButton course={currentStudent.department} collegeId={currentStudent.college_id} size="xs" />
                          )}
                        </span>
                      </h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Track your test marks, evaluated scores, pass/fail status, evaluator feedback, and upcoming assessment timetables.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Sub-tab pills */}
                    <div className="flex items-center p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setExamSubTab("results")}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${examSubTab === "results"
                            ? "bg-zinc-900 text-white shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                          }`}
                      >
                        Test Marks & Scorecard ({displayMarks.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setExamSubTab("schedule")}
                        className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${examSubTab === "schedule"
                            ? "bg-zinc-900 text-white shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                          }`}
                      >
                        Upcoming Tests Schedule ({upcomingExams.length})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scorecard Quick KPIs (When on results view) */}
                {examSubTab === "results" && displayMarks.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-800">Evaluated Tests</span>
                        <Award className="h-4 w-4 text-amber-500" />
                      </div>
                      <span className="text-xl font-black text-zinc-950 mt-1 block">{displayMarks.length}</span>
                      <span className="text-[10px] text-amber-600 font-medium">Recorded scorecards</span>
                    </div>
                    <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Passed</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="text-xl font-black text-emerald-950 mt-1 block">{passedCount}</span>
                      <span className="text-[10px] text-emerald-700 font-medium">Cleared cutoff</span>
                    </div>
                    <div className={`p-3.5 rounded-xl border ${arrearsCount > 0 ? "bg-rose-50 border-rose-200" : "bg-teal-50 border-teal-200"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-black uppercase tracking-wider ${arrearsCount > 0 ? "text-rose-800" : "text-teal-800"}`}>
                          Arrears / Re-Appear
                        </span>
                        {arrearsCount > 0 ? (
                          <AlertTriangle className="h-4 w-4 text-rose-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-teal-600" />
                        )}
                      </div>
                      <span className={`text-xl font-black mt-1 block ${arrearsCount > 0 ? "text-rose-950" : "text-teal-950"}`}>
                        {arrearsCount > 0 ? arrearsCount : "0 (All Cleared)"}
                      </span>
                      <span className={`text-[10px] font-medium ${arrearsCount > 0 ? "text-rose-600" : "text-teal-700"}`}>
                        {arrearsCount > 0 ? "Needs re-assessment" : "All tests passed"}
                      </span>
                    </div>
                    <div className="p-3.5 bg-purple-50/80 border border-purple-200 rounded-xl">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-purple-800">Cumulative Score</span>
                        <Percent className="h-4 w-4 text-purple-500" />
                      </div>
                      <span className="text-xl font-black text-purple-950 mt-1 block">{overallPct}%</span>
                      <span className="text-[10px] text-purple-700 font-medium">
                        {totalMarks.toFixed(0)} / {totalMaxMarks.toFixed(0)} Total Marks
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* VIEW 1: ASSESSMENT RESULTS & SCORECARD (EXAM-WISE) */}
              {examSubTab === "results" && (
                <div className="space-y-4">
                  {/* Filter and search bar */}
                  {availableExamTypes.length > 0 && (
                    <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-card flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">Filter Test:</span>
                        <button
                          type="button"
                          onClick={() => setMarksTypeFilter("all")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                            marksTypeFilter === "all"
                              ? "bg-zinc-900 text-white shadow-2xs ring-1 ring-zinc-800"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          All ({displayMarks.length})
                        </button>
                        {availableExamTypes.map((t: string) => {
                          const count = displayMarks.filter((m: any) => m.exam_type === t).length;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setMarksTypeFilter(t)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                marksTypeFilter === t
                                  ? "bg-zinc-900 text-white shadow-2xs ring-1 ring-zinc-800"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {t} ({count})
                            </button>
                          );
                        })}
                      </div>

                      <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search subject or test..."
                          value={marksSearchTerm}
                          onChange={(e) => setMarksSearchTerm(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-sunken border border-slate-200 inset-shadow-well rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Exam-wise Grouped Cards */}
                  {examsLoading ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 font-bold shadow-card">
                      Loading evaluated test scores...
                    </div>
                  ) : availableExamTypes.length === 0 ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-400 shadow-card">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <BookOpen className="h-8 w-8 text-slate-300" />
                        <p className="font-bold text-slate-600 text-sm">No Test Marks Published Yet</p>
                        <p className="text-xs text-slate-400 max-w-md">
                          As your subject mentors evaluate your test papers, your marks, percentages, and feedback will be posted here in real-time.
                        </p>
                      </div>
                    </div>
                  ) : examGroups.length === 0 ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-slate-500 text-xs shadow-card">
                      No test marks matching your current filter.{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setMarksTypeFilter("all");
                          setMarksSearchTerm("");
                        }}
                        className="text-amber-600 underline font-bold cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    examGroups.map((group: any) => {
                      return (
                        <div
                          key={group.type}
                          className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden transition-all hover:border-slate-300"
                        >
                          {/* Group Header */}
                          <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 via-amber-50/20 to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-zinc-900 text-amber-400 flex items-center justify-center font-black text-xs shadow-xs uppercase">
                                {group.type.slice(0, 4)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-sm font-black text-slate-900 tracking-tight">{group.type}</h3>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-zinc-100 text-zinc-900 border border-zinc-200">
                                    {group.evalCount} / {group.totalSubjects} Evaluated
                                  </span>
                                  {group.pct !== null && (
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                        parseFloat(group.pct) >= 75
                                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                          : parseFloat(group.pct) >= 40
                                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                                          : "bg-rose-50 text-rose-700 border border-rose-200"
                                      }`}
                                    >
                                      Avg {group.pct}%
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-medium mt-0.5 flex items-center gap-2 flex-wrap">
                                  {group.dateRangeStr && <span>📅 {group.dateRangeStr}</span>}
                                  {group.arrearCount > 0 && (
                                    <span className="text-rose-500 font-bold">• {group.arrearCount} Needs Attention</span>
                                  )}
                                  {group.arrearCount === 0 && group.evalCount > 0 && (
                                    <span className="text-emerald-600 font-bold">• All Cleared</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Group Score Metrics */}
                            {group.maxTotal > 0 && (
                              <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
                                <div className="text-right">
                                  <div className="text-[9px] font-black uppercase text-slate-400">Total Scored</div>
                                  <div className="font-mono font-black text-slate-900">
                                    {group.scoreTotal.toFixed(0)} / {group.maxTotal.toFixed(0)}
                                  </div>
                                </div>
                                <div className="h-6 w-px bg-slate-200" />
                                <div className="text-right">
                                  <div className="text-[9px] font-black uppercase text-slate-400">Pass Rate</div>
                                  <div
                                    className={`font-mono font-black ${
                                      group.arrearCount === 0 ? "text-emerald-600" : "text-amber-600"
                                    }`}
                                  >
                                    {group.evalCount > 0 ? `${group.passCount}/${group.evalCount}` : "—"}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Group Subject Scorecards Table */}
                          <div className="overflow-x-auto scroll-touch">
                            <Table className="w-full border-collapse text-left text-xs min-w-[700px]">
                              <TableHeader>
                                <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px] whitespace-nowrap">
                                  <TableHead className="p-3">Subject Details</TableHead>
                                  <TableHead className="p-3">Test Date</TableHead>
                                  <TableHead className="p-3 text-center">Marks Scored</TableHead>
                                  <TableHead className="p-3 text-center">Score %</TableHead>
                                  <TableHead className="p-3 text-center">Grade</TableHead>
                                  <TableHead className="p-3 text-center">Status</TableHead>
                                  <TableHead className="p-3">Evaluator & Remarks</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                                {/* 1. Evaluated Marks */}
                                {group.typeMarks.map((m: any, idx: number) => {
                                  const isAbs = Boolean(m.is_absent);
                                  const marksNum =
                                    m.marks_obtained !== null && m.marks_obtained !== undefined
                                      ? parseFloat(m.marks_obtained)
                                      : null;
                                  const maxM = parseFloat(m.max_marks || 50);
                                  const passM = parseFloat(m.passing_marks || (maxM * 0.4) || 20);
                                  const pct = marksNum !== null && maxM > 0 ? Math.round((marksNum / maxM) * 100) : 0;
                                  const isPass = marksNum !== null && marksNum >= passM;

                                  return (
                                    <tr key={m.id || `mark-${idx}`} className="hover:bg-slate-50/60 transition-colors">
                                      <td className="p-3">
                                        <div className="font-extrabold text-slate-900">{m.subject_name}</div>
                                        {m.subject_code && (
                                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{m.subject_code}</div>
                                        )}
                                      </td>
                                      <td className="p-3 text-slate-700 font-bold whitespace-nowrap">
                                        {m.exam_date}
                                      </td>
                                      <td className="p-3 text-center font-extrabold">
                                        {isAbs ? (
                                          <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-600 font-mono text-[11px] font-black">
                                            ABSENT
                                          </span>
                                        ) : marksNum !== null ? (
                                          <div className="inline-flex items-baseline gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                                            <span
                                              className={`font-mono text-sm font-black ${
                                                isPass ? "text-slate-900" : "text-rose-600"
                                              }`}
                                            >
                                              {marksNum}
                                            </span>
                                            <span className="text-slate-400 font-medium text-[10.5px]">/ {maxM}</span>
                                          </div>
                                        ) : (
                                          <span className="text-amber-600 italic text-[11px]">Pending evaluation</span>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        {isAbs || marksNum === null ? (
                                          <span className="text-slate-400">—</span>
                                        ) : (
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="font-black text-slate-800 text-[11px]">{pct}%</span>
                                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all ${
                                                  pct >= 75
                                                    ? "bg-emerald-500"
                                                    : pct >= passM
                                                    ? "bg-indigo-500"
                                                    : "bg-rose-500"
                                                }`}
                                                style={{ width: `${Math.min(pct, 100)}%` }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        <span
                                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                            isAbs
                                              ? "bg-slate-100 text-slate-600"
                                              : m.grade === "O" || m.grade === "A+" || m.grade === "A"
                                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                              : m.grade === "B+" || m.grade === "B"
                                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                                              : isPass
                                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                                              : "bg-rose-50 text-rose-700 border border-rose-200"
                                          }`}
                                        >
                                          {isAbs ? "AB" : m.grade || (isPass ? "PASS" : "RA")}
                                        </span>
                                      </td>
                                      <td className="p-3 text-center">
                                        <span
                                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[9.5px] font-black uppercase ${
                                            isAbs
                                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                                              : isPass
                                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                              : "bg-rose-50 text-rose-700 border border-rose-200"
                                          }`}
                                        >
                                          {isAbs ? "Absent" : isPass ? "Passed" : "Re-Appear"}
                                        </span>
                                      </td>
                                      <td className="p-3 text-[11px] text-slate-600 max-w-[200px]">
                                        <div className="font-bold text-slate-800">{m.evaluated_by || "Subject Mentor"}</div>
                                        {m.remarks ? (
                                          <div className="text-slate-500 text-[10px] italic mt-0.5 line-clamp-2">{m.remarks}</div>
                                        ) : (
                                          <div className="text-slate-400 text-[10px] italic">Verified</div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}

                                {/* 2. Scheduled Pending Exams */}
                                {group.pendingExams.map((ex: any, idx: number) => {
                                  return (
                                    <tr
                                      key={ex.id || `pending-${idx}`}
                                      className="hover:bg-amber-50/20 transition-colors bg-slate-50/40"
                                    >
                                      <td className="p-3">
                                        <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                          <span>{ex.subject_name}</span>
                                        </div>
                                        {ex.subject_code && (
                                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ex.subject_code}</div>
                                        )}
                                      </td>
                                      <td className="p-3 text-slate-600 font-medium whitespace-nowrap">
                                        {ex.exam_date}
                                        {ex.session_time && (
                                          <div className="text-[10px] text-slate-400 font-normal">{ex.session_time}</div>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        <span className="text-amber-600 italic text-[11px] font-medium">
                                          Pending evaluation
                                        </span>
                                      </td>
                                      <td className="p-3 text-center text-slate-400">—</td>
                                      <td className="p-3 text-center">
                                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[9.5px] font-bold uppercase">
                                          Scheduled
                                        </span>
                                      </td>
                                      <td className="p-3 text-center">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                          Pending
                                        </span>
                                      </td>
                                      <td className="p-3 text-[11px] text-slate-400 italic">
                                        Awaiting faculty evaluation
                                      </td>
                                    </tr>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* VIEW 2: UPCOMING TESTS SCHEDULE */}
              {examSubTab === "schedule" && (() => {
                const examTableRows = (exams: any[], isPast: boolean) =>
                  exams.map((ex: any, idx: number) => {
                    return (
                      <tr key={ex.id || idx} className={`hover:bg-slate-50/60 transition-colors ${isPast ? "opacity-60" : ""}`}>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-amber-700 text-[10.5px] font-extrabold w-max">
                              {ex.exam_type}
                            </span>
                            {isPast && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 text-[8.5px] font-black uppercase w-max">
                                Completed
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-extrabold text-slate-900 truncate max-w-[240px]">{ex.subject_name}</div>
                          {ex.subject_code && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{ex.subject_code}</div>
                          )}
                        </td>
                        <td className="p-3 text-slate-700 font-bold whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span>{ex.exam_date}</span>
                            </div>
                            {ex.day_order && ex.day_order !== "None" ? (
                              <span className="inline-flex items-center w-max px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-700 text-[9.5px] font-black uppercase">
                                {ex.day_order}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-slate-600">
                          <div className="flex items-center gap-1.5 text-[10.5px]">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">{ex.session_time || `${ex.start_time} - ${ex.end_time}`}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[10.5px] text-slate-700 font-bold">
                            Target: Out of {ex.max_marks || 50} Marks
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {isPast ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase">
                              <Check className="h-3 w-3" />
                              Concluded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase">
                              <Clock className="h-3 w-3" />
                              Scheduled
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  });

                return (
                  <div className="space-y-4">
                    {/* Upcoming exams */}
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
                      <div className="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Upcoming Scheduled Tests</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-amber-700 text-[9px] font-black">{upcomingExams.length}</span>
                        </div>
                        <span className="text-[11px] text-amber-600 font-bold">Prepare well for your assessments!</span>
                      </div>
                      <div className="overflow-x-auto scroll-touch">
                        <Table className="w-full border-collapse text-left text-xs min-w-[650px]">
                          <TableHeader>
                            <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px] whitespace-nowrap">
                              <TableHead className="p-3">Exam / Assessment</TableHead>
                              <TableHead className="p-3">Subject Details</TableHead>
                              <TableHead className="p-3">Exam Date & Day Order</TableHead>
                              <TableHead className="p-3">Session & Timings</TableHead>
                              <TableHead className="p-3">Total Marks</TableHead>
                              <TableHead className="p-3 text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                            {examsLoading ? (
                              <TableRow>
                                <TableCell colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                                  Loading your assessment schedule...
                                </TableCell>
                              </TableRow>
                            ) : upcomingExams.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="p-8 text-center text-slate-400 italic">
                                  No upcoming examination schedules published for your enrolled courses.
                                </TableCell>
                              </TableRow>
                            ) : examTableRows(upcomingExams, false)}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Past exams — only shown if any exist */}
                    {pastExams.length > 0 && (
                      <div className="bg-white border border-slate-100 rounded-2xl shadow-card overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Past Tests & Examinations</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[9px] font-black">{pastExams.length}</span>
                        </div>
                        <div className="overflow-x-auto scroll-touch">
                          <Table className="w-full border-collapse text-left text-xs min-w-[650px]">
                            <TableHeader>
                              <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-[9px] whitespace-nowrap">
                                <TableHead className="p-3">Exam / Assessment</TableHead>
                                <TableHead className="p-3">Subject Details</TableHead>
                                <TableHead className="p-3">Exam Date & Day Order</TableHead>
                                <TableHead className="p-3">Session & Timings</TableHead>
                                <TableHead className="p-3">Total Marks</TableHead>
                                <TableHead className="p-3 text-center">Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-slate-100 bg-white font-medium">
                              {examTableRows(pastExams, true)}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Tab 6: Subject Materials (Unit-wise Study Hub) */}
        {(activeTab === "materials" || activeTab === "library") && (
          <div className="space-y-6 animate-fadeIn">
            {/* Subject Selector & Header */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500 shrink-0">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <h2 className="text-base font-black text-slate-900 tracking-tight">
                      Subject Materials & Unit-wise Study Hub
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-[9px] font-black uppercase">
                      Curriculum Notes & PPTs
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-semibold mt-1">
                    Access verified unit-wise lecture notes, PPT presentations, question banks, and reference guides uploaded by course faculty.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => materialsQuery.refetch()}
                    className="p-2 rounded-xl bg-sunken hover:bg-white border border-slate-200 inset-shadow-well text-slate-600 cursor-pointer shadow-2xs transition-colors"
                    title="Refresh Materials"
                  >
                    <RefreshCw className={`h-4 w-4 ${materialsLoading ? "animate-spin text-amber-600" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Enrolled Subject Selector Pills */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-wider block">
                    Select Course Subject ({studentSubjects.length || 1})
                  </label>
                  <span className="text-[10px] text-slate-500 font-bold">
                    {studentClassDetails.sem} • {studentClassDetails.year}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {studentSubjects.map((subj) => {
                    const isSelected = selectedMaterialSubject.toLowerCase().trim() === subj.name.toLowerCase().trim();
                    return (
                      <button
                        key={subj.id || subj.name}
                        type="button"
                        onClick={() => setSelectedMaterialSubject(subj.name)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border shadow-xs ${isSelected
                            ? "bg-slate-900 border-slate-900 text-white ring-2 ring-amber-500/40 scale-105"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                          }`}
                      >
                        <GraduationCap className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-amber-400" : "text-slate-400"}`} />
                        <span>{subj.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Unit Tabs & Filters Bar */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Unit 1 to 5 Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setSelectedMaterialUnit("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${selectedMaterialUnit === "all"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-900"
                      }`}
                  >
                    All Units
                  </button>
                  {[1, 2, 3, 4, 5].map((unitNum) => (
                    <button
                      key={`unit_tab_${unitNum}`}
                      type="button"
                      onClick={() => setSelectedMaterialUnit(unitNum)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${selectedMaterialUnit === unitNum
                          ? "bg-zinc-900 text-white shadow-xs"
                          : "text-slate-500 hover:text-slate-900"
                        }`}
                    >
                      Unit {unitNum}
                    </button>
                  ))}
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search topics, unit notes..."
                    value={materialSearchQuery}
                    onChange={(e) => setMaterialSearchQuery(e.target.value)}
                    className="w-full pl-8.5 pr-4 py-2 border border-slate-200 inset-shadow-well rounded-xl bg-sunken focus:bg-white text-xs outline-none focus:ring-1 focus:ring-amber-500 font-bold placeholder-slate-400"
                  />
                </div>
              </div>

              {/* Material Type Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mr-1">Filter Type:</span>
                {[
                  { id: "all", label: "All Formats" },
                  { id: "notes", label: "PDF Notes" },
                  { id: "ppt", label: "Slides (PPT)" },
                  { id: "question_bank", label: "Question Banks" }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMaterialTypeFilter(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${materialTypeFilter === t.id
                        ? "bg-indigo-50 border-indigo-200 text-amber-700"
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Materials Grid List */}
            {(() => {
              const filteredList = (materialsList || []).filter((item) => {
                const matchesSubject = isSubjectNameMatch(item.subject, selectedMaterialSubject) || item.subject.toLowerCase().trim() === selectedMaterialSubject.toLowerCase().trim();
                const matchesUnit = selectedMaterialUnit === "all" || item.unit_number === selectedMaterialUnit;
                const matchesType = materialTypeFilter === "all" || item.material_type === materialTypeFilter;
                const matchesSearch =
                  !materialSearchQuery ||
                  item.title.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
                  (item.description && item.description.toLowerCase().includes(materialSearchQuery.toLowerCase())) ||
                  (item.uploaded_by && item.uploaded_by.toLowerCase().includes(materialSearchQuery.toLowerCase()));

                return matchesSubject && matchesUnit && matchesType && matchesSearch;
              });

              if (materialsLoading) {
                return (
                  <div className="py-20 text-center text-sm font-bold text-slate-400 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-7 w-7 text-amber-600 animate-spin" />
                    <span>Loading subject study materials...</span>
                  </div>
                );
              }

              if (filteredList.length === 0) {
                return (
                  <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-12 text-center space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-amber-600 flex items-center justify-center mx-auto">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-black text-slate-800">No Study Materials Found</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {selectedMaterialUnit !== "all"
                        ? `No uploads found for Unit ${selectedMaterialUnit} in ${selectedMaterialSubject}. Try switching to another unit or filter.`
                        : `Faculty has not yet published materials for ${selectedMaterialSubject}. Check back soon.`}
                    </p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredList.map((mat) => {
                    const isPPT = mat.material_type === "ppt";
                    const isQuestionBank = mat.material_type === "question_bank";
                    const formattedDate = mat.created_at ? parseDbDate(mat.created_at).toLocaleDateString() : "Active Semester";

                    return (
                      <div
                        key={mat.id}
                        className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card hover:shadow-card-lg hover:border-amber-400/40 transition-all flex flex-col justify-between space-y-4 group"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider shadow-2xs">
                                Unit {mat.unit_number}
                              </span>
                              <span className={`px-2.5 py-1 rounded-xl text-[9.5px] font-black uppercase tracking-wider border ${isPPT
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : isQuestionBank
                                    ? "bg-purple-50 text-purple-800 border-purple-200"
                                    : "bg-indigo-50 text-amber-800 border-indigo-200"
                                }`}>
                                {isPPT ? "Lecture PPT" : isQuestionBank ? "Question Bank" : "PDF Notes"}
                              </span>
                            </div>

                            <span className="text-[10px] font-bold text-slate-400">
                              {mat.file_size || "2.4 MB"}
                            </span>
                          </div>

                          <div>
                            <h3 className="text-sm font-black text-slate-900 group-hover:text-amber-500 transition-colors leading-snug">
                              {mat.title}
                            </h3>
                            {mat.description && (
                              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5 line-clamp-3">
                                {mat.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-[10px] text-slate-400 font-bold block truncate">
                              Faculty: <strong className="text-slate-700">{mat.uploaded_by || "Course Mentor"}</strong>
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium block">
                              Published: {formattedDate}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                if (mat.file_url || mat.external_url) {
                                  window.open(mat.file_url || mat.external_url, "_blank");
                                } else {
                                  toast(`Downloading "${mat.title}" (${mat.file_size || "PDF"})`, "success");
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-xs font-bold shadow-xs cursor-pointer transition-all hover:scale-105"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Download</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Tab 7: Fees & Dues (Real Data) */}
        {activeTab === "fees" && (() => {
          const fmtR = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

          if (feeLoading && !feeData) return <div className="py-16 text-center text-sm text-slate-400">Loading your fee details…</div>;

          if (!feeData) return (
            <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4 shadow-card font-sans">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fees & Online Payments</h2>
              <p className="text-[11px] text-slate-400 mt-1">Could not load fee data. Try refreshing.</p>
              <button onClick={() => feeQuery.refetch()} className="px-4 py-2 rounded-xl btn-gradient text-white text-xs font-bold cursor-pointer">Retry</button>
            </div>
          );

          const { fees, payments, stats } = feeData;

          return (
            <div className="space-y-5 font-sans">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Total Fees", value: fmtR(stats.totalFees), color: "text-slate-800", bg: "bg-slate-50" },
                  { label: "Paid", value: fmtR(stats.totalPaid), color: "text-[#4F46E5]", bg: "bg-slate-50" },
                  { label: "Due", value: fmtR(stats.totalOutstanding), color: "text-slate-500", bg: "bg-slate-50" },
                  { label: "Status", value: stats.unpaidCount > 0 ? `${stats.unpaidCount} Unpaid` : "All Clear", color: stats.unpaidCount > 0 ? "text-[#4F46E5]" : "text-[#7C3AED]", bg: "bg-slate-50" },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`rounded-xl p-3.5 border border-slate-100 ${bg}`}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className={`text-base font-extrabold mt-1 ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3 shadow-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fee Breakdown</h3>
                  <button onClick={() => feeQuery.refetch()} className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-[#4F46E5] cursor-pointer transition-colors"><RefreshCw className="h-3 w-3" /></button>
                </div>
                {fees.map((fee: any) => (
                  <div key={fee.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 gap-3">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-extrabold text-slate-800">{fee.term_name}</h4>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                        <span>Total: <span className="text-slate-700">{fmtR(fee.amount)}</span></span>
                        <span>•</span>
                        <span>Paid: <span className="text-slate-800">{fmtR(fee.paid_amount)}</span></span>
                        {fee.due_date && <><span>•</span><span>Due: <span className="font-mono text-slate-600">{fee.due_date}</span></span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                      {fee.status === "paid" ? (
                        <span className="px-3 py-1 rounded-xl bg-[#4F46E5]/10 text-[#4F46E5] text-[10px] font-extrabold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Paid</span>
                      ) : (
                        <>
                          {fee.status === "partial" && <span className="px-2 py-0.5 rounded-full bg-[#7C3AED]/10 text-[#7C3AED] text-[10px] font-bold">Partial</span>}
                          {fee.pay_link ? (
                            <a
                              href={fee.pay_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1.5 px-4 btn-gradient text-white rounded-xl text-[10px] font-extrabold shadow-sm transition-all cursor-pointer inline-block text-center"
                            >
                              Pay Now
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setFeePayModal(fee);
                                setFeePayAmount(String(fee.amount - fee.paid_amount));
                                setFeePaySuccess(null);
                              }}
                              className="py-1.5 px-4 btn-gradient text-white rounded-xl text-[10px] font-extrabold shadow-sm transition-all cursor-pointer inline-block text-center"
                            >
                              Pay Now
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {fees.length === 0 && <p className="text-xs text-slate-400 text-center py-6">No fee records found.</p>}
              </div>

              {payments.length > 0 && (
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
                  <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">Payment History</h3>
                  <div className="space-y-2">
                    {[...payments].sort((a: any, b: any) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()).map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <div>
                          <p className="font-bold text-slate-700">{p.receipt_no}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.reference_no}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] text-[9px] font-bold capitalize">{p.payment_method}</span>
                        <div className="text-right">
                          <p className="font-extrabold text-slate-800">{fmtR(p.amount)}</p>
                          <p className="text-[10px] text-slate-400">{new Date(p.payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {feePayModal && (
                <Dialog
                  open={true}
                  onOpenChange={(next) => { if (!next) setFeePayModal(null); }}
                  ariaLabel="Pay fee online"
                  overlayClassName="bg-slate-950/60 backdrop-blur-sm"
                  panelClassName="max-w-md max-h-[90vh] p-6 space-y-0"
                >
                    {feePaySuccess ? (
                      <div className="text-center space-y-4">
                        <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="h-8 w-8 text-[#4F46E5]" />
                        </div>
                        <h3 className="text-lg font-extrabold text-slate-800">Payment Successful!</h3>
                        <p className="text-sm text-slate-500">Receipt No: <span className="font-bold text-[#4F46E5]">{feePaySuccess}</span></p>
                        <button onClick={() => setFeePayModal(null)} className="w-full py-3 rounded-xl btn-gradient text-white font-bold cursor-pointer transition-colors">Close</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-5">
                          <div>
                            <h3 className="text-base font-extrabold text-slate-800">Pay Fee Online</h3>
                            <p className="text-xs text-slate-500 mt-0.5">{feePayModal.term_name}</p>
                          </div>
                          <button onClick={() => setFeePayModal(null)} aria-label="Close payment dialog" className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200"><X className="h-4 w-4 text-slate-500" /></button>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="font-semibold text-slate-600">Outstanding Balance</span>
                            <span className="font-extrabold text-[#4F46E5]">{"₹" + (feePayModal.amount - feePayModal.paid_amount).toLocaleString("en-IN")}</span>
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">Amount (₹)</label>
                            <input aria-label="Amount (₹)" type="number" value={feePayAmount} onChange={e => setFeePayAmount(e.target.value)} max={feePayModal.amount - feePayModal.paid_amount} placeholder="Enter amount" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-sunken dark:bg-[#181820] inset-shadow-well text-sm font-medium focus:outline-none focus:bg-white dark:focus:bg-[#131317] focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" />
                          </div>
                          <div>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">Payment Method</label>
                            <div className="grid grid-cols-2 gap-2">
                              {["online", "card"].map(m => (
                                <button key={m} type="button" onClick={() => setFeePayMethod(m)} className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border capitalize ${feePayMethod === m ? "btn-gradient text-white border-transparent" : "bg-sunken text-slate-600 border-slate-200 inset-shadow-well hover:bg-white dark:hover:bg-[#131317]"}`}>{m === "online" ? "UPI / Net Banking" : "Card Payment"}</button>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-3 pt-1">
                            <button onClick={() => setFeePayModal(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50">Cancel</button>
                            <button onClick={handleFeePayment} disabled={!feePayAmount || feePaySubmitting} className="flex-1 py-2.5 rounded-xl btn-gradient text-white text-sm font-bold cursor-pointer disabled:opacity-50">
                              {feePaySubmitting ? "Processing…" : "Confirm Payment"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                </Dialog>
              )}
            </div>
          );
        })()}

        {/* Student Tracker / Skill Development Tab */}
        {activeTab === "tracker" && (() => {
          // Helper to calculate task stats and new indicator for any subject
          const getSubjectTaskStats = (subjName: string) => {
            const matchingTasks = (weeklyTasks || []).filter(task =>
              (isCohortMatching(task.class_group, currentStudent?.classGroup, coursesList, subjectsList) ||
                (currentStudent?.department && task.class_group.toLowerCase().includes(currentStudent.department.toLowerCase().trim()))) &&
              task.subject.toLowerCase().trim() === subjName.toLowerCase().trim()
            );

            const entries = (studentTracker || []).filter(
              e => e.student_id === currentStudent?.id && e.subject.toLowerCase().trim() === subjName.toLowerCase().trim()
            );

            const submittedCount = matchingTasks.filter(t => entries.some(e => e.week_number === t.week_number && !!e.submission_url)).length;
            const gradedEntries = entries.filter(e => e.marks !== undefined && e.marks !== null);
            const pendingCount = Math.max(0, matchingTasks.length - submittedCount);

            const hasNew = matchingTasks.some(t => {
              const entry = entries.find(e => e.week_number === t.week_number);
              if (entry?.submission_url) return false;
              if (!t.created_at) return true;
              const tDate = parseDbDate(t.created_at);
              const diffDays = (new Date().getTime() - tDate.getTime()) / (1000 * 3600 * 24);
              return diffDays <= 7;
            });

            const totalMarks = gradedEntries.reduce((sum, e) => sum + (e.marks || 0), 0);
            const avgScore = gradedEntries.length > 0 ? (totalMarks / gradedEntries.length).toFixed(1) : null;

            return {
              totalAssigned: matchingTasks.length,
              submittedCount,
              gradedCount: gradedEntries.length,
              pendingCount,
              hasNew,
              avgScore
            };
          };

          const activeSubjectStats = getSubjectTaskStats(studentTrackerSubject);

          const isSubjMatch = (s1?: string, s2?: string) => {
            if (!s1 || !s2) return false;
            return isSubjectNameMatch(s1, s2) || s1.toLowerCase().trim() === s2.toLowerCase().trim();
          };

          const isCgMatch = (taskCg?: string, studentCg?: string, studentDept?: string) => {
            if (!taskCg) return true;
            if (!studentCg && !studentDept) return true;
            if (studentCg && (
              isCohortMatching(taskCg, studentCg, coursesList, subjectsList) ||
              isCohortMatch(taskCg, studentCg) ||
              taskCg.toLowerCase().trim() === studentCg.toLowerCase().trim()
            )) {
              return true;
            }
            if (studentDept) {
              const dNorm = studentDept.toLowerCase().trim();
              const cgNorm = taskCg.toLowerCase().trim();
              if (cgNorm.includes(dNorm) || dNorm.includes(cgNorm)) return true;
            }
            return false;
          };

          const allWeeks = Array.from({ length: 15 }, (_, i) => i + 1);
          const studentAcadSubjects = studentSubjects.filter(s => !isSkillSubject(s));
          const availableAcadSubjects = studentAcadSubjects;
          const activeAcadSubjName = studentAcadSubject || availableAcadSubjects[0]?.name || "";

          // Academic stats for student
          const getAcadSubjectStats = (subjName: string) => {
            const matchingTasks = (weeklyAcademicTasks || []).filter(task =>
              isCgMatch(task.class_group, currentStudent?.classGroup, currentStudent?.department) &&
              isSubjMatch(task.subject, subjName)
            );

            const studentEmail = (currentStudent?.email || "").toLowerCase().trim();
            const studentId = (currentStudent?.id || "").toLowerCase().trim();
            const entries = (studentAcademicTracker || []).filter(
              e => ((e.student_email && e.student_email.toLowerCase().trim() === studentEmail) ||
                (e.student_id && e.student_id.toLowerCase().trim() === studentId)) &&
                isSubjMatch(e.subject, subjName)
            );

            const evaluatedEntries = entries.filter(e => e.total_marks !== null || e.quiz_marks !== null || e.assessment_marks !== null || e.assignment_marks !== null);
            const totalScoreSum = evaluatedEntries.reduce((sum, e) => sum + (e.total_marks || 0), 0);
            const avgPct = evaluatedEntries.length > 0 ? Math.round((totalScoreSum / (evaluatedEntries.length * 30)) * 100) : null;

            return {
              totalAssigned: matchingTasks.length,
              evaluatedCount: evaluatedEntries.length,
              totalScoreSum,
              avgPct
            };
          };

          return (
            <div className="space-y-6 font-sans">
              {/* Category Switcher Banner: Academic vs Skill */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-100 rounded-2xl p-4 shadow-card">
                <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-fit">
                  <button
                    type="button"
                    onClick={() => setStudentTrackerCategory("academic")}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${studentTrackerCategory === "academic"
                        ? "bg-zinc-900 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                      }`}
                  >
                    <BookOpen className="h-4 w-4 text-amber-600" />
                    <span>Academic Subjects (Quiz, Assessment, Assignment)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStudentTrackerCategory("skill")}
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${studentTrackerCategory === "skill"
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-500 hover:text-slate-800"
                      }`}
                  >
                    <GraduationCap className="h-4 w-4 text-amber-600" />
                    <span>Skill Development Tasks</span>
                  </button>
                </div>

                <div className="text-[11px] font-bold text-slate-500 text-right">
                  {studentClassDetails.sem} • {studentClassDetails.year}
                </div>
              </div>

              {/* ────────────────────────────────────────────────────────────────────────── */}
              {/* SUB-VIEW 1: ACADEMIC WEEKLY TASKS & 3-COMPONENT EVALUATIONS                */}
              {/* ────────────────────────────────────────────────────────────────────────── */}
              {studentTrackerCategory === "academic" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Subject Selector Bar */}
                  <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">
                        Select Academic Course
                      </label>
                      <span className="text-[10px] text-slate-400 font-bold font-mono">
                        User: {currentStudent?.email}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {availableAcadSubjects.map(sub => {
                        const isSelected = activeAcadSubjName.toLowerCase().trim() === sub.name.toLowerCase().trim();
                        const stats = getAcadSubjectStats(sub.name);

                        return (
                          <button
                            key={sub.id || sub.name}
                            type="button"
                            onClick={() => setStudentAcadSubject(sub.name)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 border ${isSelected
                                ? "bg-zinc-900 border-zinc-900 text-white shadow-xs"
                                : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                              }`}
                          >
                            <BookOpen className={`h-3.5 w-3.5 ${isSelected ? "text-white" : "text-slate-400"}`} />
                            <span>{sub.name}</span>
                          </button>
                        );
                      })}
                      {availableAcadSubjects.length === 0 && (
                        <p className="text-xs text-slate-400 italic py-2">No academic courses enrolled in this semester.</p>
                      )}
                    </div>
                  </div>



                  {/* 15 Weeks Academic Tasks & Scoped Marks List */}
                  <div className="space-y-4">
                    {allWeeks.map(wk => {
                      const task = (weeklyAcademicTasks || []).find(
                        t => isCgMatch(t.class_group, currentStudent?.classGroup, currentStudent?.department) &&
                          isSubjMatch(t.subject, activeAcadSubjName) &&
                          t.week_number === wk
                      );

                      const studentEmail = (currentStudent?.email || "").toLowerCase().trim();
                      const studentId = (currentStudent?.id || "").toLowerCase().trim();
                      const entry = (studentAcademicTracker || []).find(
                        e => ((e.student_email && e.student_email.toLowerCase().trim() === studentEmail) ||
                          (e.student_id && e.student_id.toLowerCase().trim() === studentId)) &&
                          isSubjMatch(e.subject, activeAcadSubjName) &&
                          e.week_number === wk
                      );

                      const qMarks = entry?.quiz_marks;
                      const asMarks = entry?.assessment_marks;
                      const agMarks = entry?.assignment_marks;
                      const totalMarks = entry?.total_marks ?? (
                        (qMarks !== undefined && qMarks !== null) ||
                          (asMarks !== undefined && asMarks !== null) ||
                          (agMarks !== undefined && agMarks !== null)
                          ? ((Number(qMarks) || 0) + (Number(asMarks) || 0) + (Number(agMarks) || 0))
                          : null
                      );

                      const isEvaluated = totalMarks !== null;
                      const isSubmitted = !!entry?.submission_url;

                      return (
                        <div
                          key={`acad_wk_${wk}`}
                          id={`acad-task-week-${wk}`}
                          className={`bg-white border rounded-xl p-5 shadow-card space-y-4 hover:shadow-card transition-all duration-300 scroll-mt-24 ${highlightedWeek === wk
                              ? "border-amber-500 ring-4 ring-amber-500/20 shadow-md scale-[1.01]"
                              : "border-slate-200"
                            }`}
                        >
                          {/* Week Card Header */}
                          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-3">
                              <span className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-100 text-amber-700 font-black text-xs flex items-center justify-center shrink-0 font-mono">
                                W{wk}
                              </span>
                              <div>
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                  Week {wk} Academic Evaluation
                                  {(() => {
                                    if (!task) return null;
                                    const targetTaskDate = task.task_date || task.created_at?.slice(0, 10);
                                    const stAttLogs = (myAttendance || []).filter(a => {
                                      const slot = (slots || []).find(sl => sl.id === a.slotId);
                                      const subj = a.coveredSubject || slot?.course || "";
                                      return isSubjectNameMatch(subj, activeAcadSubjName);
                                    });
                                    const exactDateLog = targetTaskDate ? stAttLogs.find(a => a.dateStr === targetTaskDate) : null;
                                    const sortedLogs = [...stAttLogs].sort((a, b) => (b.dateStr || "").localeCompare(a.dateStr || ""));
                                    const effectiveLog = exactDateLog || sortedLogs[0];
                                    let liveAtt = "Present";
                                    if (effectiveLog) {
                                      const st = (effectiveLog.status || "").toLowerCase();
                                      liveAtt = st === "absent" ? "Absent" : st === "od" ? "OD" : "Present";
                                    } else if (entry?.attendance_status) {
                                      liveAtt = entry.attendance_status;
                                    }

                                    return (
                                      <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase border ${liveAtt === "Absent"
                                          ? "bg-rose-50 text-rose-700 border-rose-200"
                                          : liveAtt === "OD"
                                            ? "bg-blue-50 text-blue-700 border-blue-200"
                                            : liveAtt === "Present"
                                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                              : "bg-slate-100 text-slate-500 border-slate-200"
                                        }`}>
                                        {liveAtt}
                                      </span>
                                    );
                                  })()}
                                </h4>
                              </div>
                            </div>

                            {/* Overall Score Badge */}
                            <div>
                              {isEvaluated ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">Evaluated</span>
                                  <span className={`inline-flex items-center px-3 py-1 rounded-lg border text-xs font-black ${totalMarks! >= 24
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                      : totalMarks! >= 15
                                        ? "bg-amber-50 border-amber-200 text-amber-800"
                                        : "bg-rose-50 border-rose-200 text-rose-800"
                                    }`}>
                                    Total Score: {totalMarks} / 30
                                  </span>
                                </div>
                              ) : isSubmitted ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-amber-700 text-xs font-bold">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>Work Submitted (Awaiting Marks)</span>
                                </span>
                              ) : task ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>Task Assigned</span>
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 text-xs font-medium">
                                  No Task Guidelines
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Task Topics & Marks Grid */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* Left: Mentor Assigned Topics & Guidelines */}
                            <div className="space-y-3">
                              {task ? (
                                <>
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">
                                      Weekly Focus &amp; Overview
                                    </span>
                                    <p className="text-xs font-bold text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                      {task.task_name}
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                    {task.quiz_topic && (
                                      <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1.5 shadow-2xs">
                                        <span className="text-[9.5px] font-black text-amber-800 uppercase block">Quiz Component</span>
                                        {task.quiz_topic.startsWith("http") ? (
                                          <a
                                            href={task.quiz_topic}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-900 bg-indigo-100/90 px-2 py-0.5 rounded hover:bg-indigo-200 transition-colors"
                                          >
                                            <span>Open Quiz</span>
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        ) : (
                                          <span className="font-bold text-slate-800 text-[11px] block">{task.quiz_topic === "Enabled" ? "Active (0–10)" : task.quiz_topic}</span>
                                        )}
                                      </div>
                                    )}
                                    {task.assessment_topic && (
                                      <div className="p-2.5 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1.5 shadow-2xs">
                                        <span className="text-[9.5px] font-black text-purple-800 uppercase block">Assessment Component</span>
                                        {task.assessment_topic.startsWith("http") ? (
                                          <a
                                            href={task.assessment_topic}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-900 bg-purple-100/90 px-2 py-0.5 rounded hover:bg-purple-200 transition-colors"
                                          >
                                            <span>Open Test Link</span>
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        ) : (
                                          <span className="font-bold text-slate-800 text-[11px] block">{task.assessment_topic === "Enabled" ? "Active (0–10)" : task.assessment_topic}</span>
                                        )}
                                      </div>
                                    )}
                                    {task.assignment_topic && (
                                      <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5 shadow-2xs">
                                        <span className="text-[9.5px] font-black text-emerald-800 uppercase block">Assignment Component</span>
                                        {task.assignment_topic.startsWith("http") ? (
                                          <a
                                            href={task.assignment_topic}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-100/90 px-2 py-0.5 rounded hover:bg-emerald-200 transition-colors"
                                          >
                                            <span>Open Assignment</span>
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        ) : (
                                          <span className="font-bold text-slate-800 text-[11px] block">{task.assignment_topic === "Enabled" ? "Active (0–10)" : task.assignment_topic}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {task.task_pdf_url && (
                                    <a
                                      href={task.task_pdf_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                                    >
                                      <FileText className="h-3.5 w-3.5 text-amber-600" />
                                      <span>View Task Material / PDF</span>
                                    </a>
                                  )}
                                </>
                              ) : (
                                <div className="py-4 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                                  <p className="text-xs text-slate-400 font-medium">No guidelines assigned for Week {wk} yet.</p>
                                </div>
                              )}
                            </div>

                            {/* Right: Evaluated 3-Component Score Breakdown */}
                            <div className="space-y-3 lg:border-l lg:border-slate-100 lg:pl-5">
                              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">
                                Your Evaluated Component Marks (Scoped to {currentStudent?.email})
                              </span>

                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                                {/* Quiz Box */}
                                <div className="p-3 bg-amber-50/40 border border-amber-200 rounded-xl space-y-1">
                                  <span className="text-[9px] font-extrabold text-amber-800 uppercase block">Quiz</span>
                                  <div className="text-base font-black text-amber-950">
                                    {qMarks !== undefined && qMarks !== null ? `${qMarks} / 10` : "—"}
                                  </div>
                                </div>

                                {/* Assessment Box */}
                                <div className="p-3 bg-purple-50/40 border border-purple-200 rounded-xl space-y-1">
                                  <span className="text-[9px] font-extrabold text-purple-800 uppercase block">Assessment</span>
                                  <div className="text-base font-black text-purple-950">
                                    {asMarks !== undefined && asMarks !== null ? `${asMarks} / 10` : "—"}
                                  </div>
                                </div>

                                {/* Assignment Box */}
                                <div className="p-3 bg-emerald-50/40 border border-emerald-200 rounded-xl space-y-1">
                                  <span className="text-[9px] font-extrabold text-emerald-800 uppercase block">Assignment</span>
                                  <div className="text-base font-black text-emerald-950">
                                    {agMarks !== undefined && agMarks !== null ? `${agMarks} / 10` : "—"}
                                  </div>
                                </div>
                              </div>

                              {/* Faculty Feedback */}
                              {entry?.feedback && (
                                <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg space-y-1">
                                  <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block">
                                    Faculty Remarks &amp; Feedback
                                  </span>
                                  <p className="text-xs font-medium text-slate-700 italic leading-relaxed">
                                    &ldquo;{entry.feedback}&rdquo;
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ────────────────────────────────────────────────────────────────────────── */}
              {/* SUB-VIEW 2: SKILL DEVELOPMENT TASKS                                       */}
              {/* ────────────────────────────────────────────────────────────────────────── */}
              {studentTrackerCategory === "skill" && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Subject Selector / Header with Clean NEW Indicator */}
                  {assignedMentorSubjects.length === 1 ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-wrap gap-4 items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Skill Development Course</span>
                          {activeSubjectStats.hasNew && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
                              <span>New Tasks Active</span>
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-amber-500 shrink-0">
                            <GraduationCap className="h-4 w-4" />
                          </div>
                          <span>{assignedMentorSubjects[0]}</span>
                        </h3>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-right shrink-0">
                        <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wide">Academic Session</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">{studentClassDetails.sem} • {studentClassDetails.year}</div>
                      </div>
                    </div>
                  ) : assignedMentorSubjects.length > 1 ? (
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Assigned Skill Development Courses</label>
                        <span className="text-[10px] text-slate-500 font-bold">{studentClassDetails.sem} • {studentClassDetails.year}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {assignedMentorSubjects.map((subName) => {
                          const isSelected =
                            isSubjectNameMatch(studentTrackerSubject, subName) ||
                            studentTrackerSubject.toLowerCase().trim() === subName.toLowerCase().trim();
                          const subStats = getSubjectTaskStats(subName);
                          const cleanSubId = subName.toLowerCase().replace(/[^a-z0-9]/g, "-");

                          return (
                            <button
                              key={subName}
                              id={`skill-subject-btn-${cleanSubId}`}
                              data-subject={subName}
                              type="button"
                              onClick={() => {
                                setStudentTrackerSubject(subName);
                              }}
                              className={`relative px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border shadow-xs ${isSelected
                                  ? "bg-slate-900 border-slate-900 text-white ring-2 ring-amber-500/40 scale-105"
                                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                                }`}
                            >
                              <GraduationCap className={`h-4 w-4 shrink-0 ${isSelected ? "text-amber-400" : "text-slate-400"}`} />
                              <span>{subName}</span>

                              {subStats.hasNew && (
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${isSelected ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700"
                                  }`}>
                                  NEW
                                </span>
                              )}

                              {subStats.pendingCount > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${isSelected ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                                  }`}>
                                  {subStats.pendingCount} Pending
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-wrap gap-4 items-center justify-between">
                      <div className="space-y-1.5 flex-grow max-w-md">
                        <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Select Skill Subject</label>
                        <select
                          aria-label="Select Skill Subject"
                          value={studentTrackerSubject}
                          onChange={(e) => setStudentTrackerSubject(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500 bg-white text-slate-800"
                        >
                          {studentSubjects.filter(s => isSkillSubject(s)).map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                          {studentSubjects.filter(s => isSkillSubject(s)).length === 0 && <option value="">No Skill Development subjects in this semester</option>}
                        </select>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl max-w-sm text-right shrink-0">
                        <div className="text-[10px] text-slate-500 font-extrabold uppercase">Academic Session</div>
                        <div className="text-xs font-bold text-slate-800 mt-0.5">{studentClassDetails.sem} • {studentClassDetails.year}</div>
                      </div>
                    </div>
                  )}

                  {/* Weeks Task Cards List */}
                  <div className="space-y-4">
                    {allWeeks.map(wk => {
                      const task = weeklyTasks.find(
                        t => (isCohortMatching(t.class_group, currentStudent?.classGroup, coursesList, subjectsList) ||
                          (currentStudent?.department && t.class_group.toLowerCase().includes(currentStudent.department.toLowerCase().trim()))) &&
                          (isSubjectNameMatch(t.subject, studentTrackerSubject) || t.subject.toLowerCase().trim() === studentTrackerSubject.toLowerCase().trim()) &&
                          t.week_number === wk
                      );

                      const entry = studentTracker.find(
                        e => e.student_id === currentStudent?.id &&
                          (isSubjectNameMatch(e.subject, studentTrackerSubject) || e.subject.toLowerCase().trim() === studentTrackerSubject.toLowerCase().trim()) &&
                          e.week_number === wk
                      );

                      const currentUrl = entry?.submission_url || "";
                      const isSubmitting = submittingUrlMap[wk] || false;
                      const isGraded = entry?.marks !== undefined && entry?.marks !== null;
                      const isSubmitted = !!currentUrl;

                      const assignedDate = task ? parseDbDate(task.created_at || task.updated_at) : null;
                      const isNewTask = task && !isSubmitted && assignedDate && ((new Date().getTime() - assignedDate.getTime()) / (1000 * 3600 * 24) <= 7);

                      return (
                        <div
                          key={wk}
                          id={`skill-task-week-${wk}`}
                          className={`bg-white border rounded-xl p-5 shadow-card space-y-4 transition-all duration-300 scroll-mt-24 ${highlightedWeek === wk
                              ? "border-amber-500 ring-4 ring-amber-500/20 shadow-md scale-[1.01]"
                              : isNewTask
                                ? "border-rose-300 ring-1 ring-rose-100"
                                : "border-slate-200"
                            }`}
                        >
                          {/* Task Card Header */}
                          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-3">
                              <span className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-100 text-amber-700 font-bold text-xs flex items-center justify-center shrink-0">
                                W{wk}
                              </span>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Week {wk} Practical Task</h4>
                                  {isNewTask && (
                                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold uppercase tracking-wide">
                                      New Assignment
                                    </span>
                                  )}
                                  {wk % 2 === 0 && (
                                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[9px] font-bold tracking-wide border border-purple-200">
                                      Assessment / Viva Week
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status / Grade Badge */}
                            <div>
                              {isGraded ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Evaluated</span>
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg border text-xs font-bold uppercase tracking-wider ${entry.marks! >= 8
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                      : entry.marks! >= 5
                                        ? "bg-amber-50 border-amber-200 text-amber-700"
                                        : "bg-rose-50 border-rose-200 text-rose-700"
                                    }`}>
                                    Score: {entry.marks} / 10
                                  </span>
                                </div>
                              ) : isSubmitted ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold tracking-wide">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  <span>Submitted</span>
                                </span>
                              ) : task ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold tracking-wide">
                                  <Clock className="h-3.5 w-3.5" />
                                  <span>Pending Submission</span>
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 text-xs font-medium tracking-wide">
                                  No Task Assigned
                                </span>
                              )}
                            </div>
                          </div>

                          {task ? (
                            (() => {
                              const taskAssignedDate = parseDbDate(task.created_at || task.updated_at);
                              const deadlineDate = new Date(taskAssignedDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                              const isPastDeadline = new Date() > deadlineDate;

                              return (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                  {/* Left Column: Task Details */}
                                  <div className="space-y-3">
                                    <div className="space-y-1">
                                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Instructions</span>
                                      <p className="text-xs font-medium text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        {task.task_name}
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 text-xs">
                                      <div className="space-y-0.5">
                                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Assigned Date</span>
                                        <span className="font-semibold text-slate-700">{taskAssignedDate.toLocaleDateString()}</span>
                                      </div>
                                      <div className="space-y-0.5">
                                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Due Date</span>
                                        <span className={`font-semibold ${isPastDeadline ? "text-rose-600" : "text-amber-600"}`}>
                                          {deadlineDate.toLocaleDateString()}
                                        </span>
                                      </div>
                                    </div>

                                    {task.task_pdf_url && (
                                      <div className="pt-1">
                                        <a
                                          href={task.task_pdf_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-amber-700 border border-indigo-200 rounded-lg text-xs font-bold tracking-wider transition-all duration-200 cursor-pointer"
                                        >
                                          <FileText className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                          <span>Reference Document / PDF</span>
                                        </a>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right Column: Submission Area & Feedback */}
                                  <div className="space-y-3 lg:border-l lg:border-slate-100 lg:pl-5">
                                    <div className="space-y-2">
                                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Student Submission</span>

                                      {currentUrl && !editSubmissionMode[wk] ? (
                                        <div className="rounded-lg border border-slate-100 p-3.5 bg-slate-50 space-y-2.5">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1 min-w-0">
                                              <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Submitted Link / File</span>
                                              {currentUrl.startsWith("data:") ? (
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                                  <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                                  <a
                                                    href={currentUrl}
                                                    download={`Week_${wk}_Submission`}
                                                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline truncate"
                                                  >
                                                    <span>Download Attached Document</span>
                                                    <Download className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                                  </a>
                                                </div>
                                              ) : (
                                                <a
                                                  href={currentUrl}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:underline truncate max-w-full"
                                                >
                                                  <span className="truncate">{currentUrl}</span>
                                                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                                </a>
                                              )}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setEditSubmissionMode(prev => ({ ...prev, [wk]: true }))}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] transition-colors cursor-pointer shrink-0"
                                            >
                                              <Edit2 className="h-3 w-3 text-slate-500" />
                                              <span>Edit</span>
                                            </button>
                                          </div>

                                          {entry?.updated_at && (
                                            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-medium border-t border-slate-200 pt-2">
                                              <Clock className="h-3 w-3 text-slate-400" />
                                              <span>Submitted on: {parseDbDate(entry.updated_at).toLocaleString()}</span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="space-y-2.5">
                                          {/* Toggle URL / File */}
                                          <div className="flex gap-2">
                                            <button
                                              type="button"
                                              disabled={isSubmitting}
                                              onClick={() => setStudentUploadType(prev => ({ ...prev, [wk]: "url" }))}
                                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${(studentUploadType[wk] || "url") === "url"
                                                  ? "bg-indigo-50 border-indigo-300 text-amber-700"
                                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                                }`}
                                            >
                                              Web Link / URL
                                            </button>
                                            <button
                                              type="button"
                                              disabled={isSubmitting}
                                              onClick={() => setStudentUploadType(prev => ({ ...prev, [wk]: "file" }))}
                                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${studentUploadType[wk] === "file"
                                                  ? "bg-indigo-50 border-indigo-300 text-amber-700"
                                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                                }`}
                                            >
                                              Upload Document
                                            </button>
                                          </div>

                                          {(studentUploadType[wk] || "url") === "url" ? (
                                            <form
                                              onSubmit={async (e) => {
                                                e.preventDefault();
                                                const form = e.target as HTMLFormElement;
                                                const input = form.elements.namedItem("submissionUrl") as HTMLInputElement;
                                                const url = input.value.trim();
                                                if (!url) return;

                                                setSubmittingUrlMap(prev => ({ ...prev, [wk]: true }));
                                                const res = await gradeStudentTask({
                                                  studentId: currentStudent?.id || "",
                                                  classGroup: currentStudent?.classGroup || "",
                                                  subject: studentTrackerSubject,
                                                  weekNumber: wk,
                                                  submissionUrl: url
                                                });
                                                setSubmittingUrlMap(prev => ({ ...prev, [wk]: false }));
                                                if (!res.success) {
                                                  toast(res.message || "Failed to submit URL.", "error");
                                                } else {
                                                  toast("Work submitted successfully!", "success");
                                                  setEditSubmissionMode(prev => ({ ...prev, [wk]: false }));
                                                }
                                              }}
                                              className="flex gap-2"
                                            >
                                              <input
                                                type="url"
                                                name="submissionUrl"
                                                defaultValue={currentUrl.startsWith("http") ? currentUrl : ""}
                                                placeholder="https://github.com/..."
                                                required
                                                disabled={isSubmitting}
                                                className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
                                              />
                                              <button
                                                type="submit"
                                                disabled={isSubmitting}
                                                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                                              >
                                                {isSubmitting ? "Saving..." : "Submit"}
                                              </button>
                                            </form>
                                          ) : (
                                            <div className="space-y-2 mt-1.5">
                                              <label className="flex flex-col items-center justify-center w-full h-20 border border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all">
                                                <div className="flex flex-col items-center justify-center pt-2 pb-2">
                                                  <Upload className="w-4 h-4 mb-1 text-slate-400" />
                                                  <p className="text-xs text-slate-600 font-semibold">Click to select document</p>
                                                  <p className="text-[9px] text-slate-400">PDF, DOCX, ZIP (MAX. 10MB)</p>
                                                </div>
                                                <input
                                                  type="file"
                                                  className="hidden"
                                                  accept=".pdf,.docx,.doc,.zip,.rar"
                                                  disabled={isSubmitting}
                                                  onChange={async (e) => {
                                                    if (e.target.files && e.target.files[0]) {
                                                      const file = e.target.files[0];
                                                      setSubmittingUrlMap(prev => ({ ...prev, [wk]: true }));
                                                      const reader = new FileReader();
                                                      reader.onload = async () => {
                                                        const dataUrl = (reader.result as string) || "";
                                                        const res = await gradeStudentTask({
                                                          studentId: currentStudent?.id || "",
                                                          classGroup: currentStudent?.classGroup || "",
                                                          subject: studentTrackerSubject,
                                                          weekNumber: wk,
                                                          submissionUrl: dataUrl
                                                        });
                                                        setSubmittingUrlMap(prev => ({ ...prev, [wk]: false }));
                                                        if (!res.success) {
                                                          toast(res.message || "File upload failed.", "error");
                                                        } else {
                                                          toast(`Uploaded ${file.name} successfully.`, "success");
                                                          setEditSubmissionMode(prev => ({ ...prev, [wk]: false }));
                                                        }
                                                      };
                                                      reader.onerror = () => {
                                                        setSubmittingUrlMap(prev => ({ ...prev, [wk]: false }));
                                                        toast("Failed to read file.", "error");
                                                      };
                                                      reader.readAsDataURL(file);
                                                    }
                                                  }}
                                                />
                                              </label>

                                              {currentUrl && (
                                                <div className="flex justify-end pt-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditSubmissionMode(prev => ({ ...prev, [wk]: false }))}
                                                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold border border-slate-200 cursor-pointer"
                                                  >
                                                    Cancel Editing
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Mentor Viva Feedback & Remarks */}
                                    {entry?.viva_assessment && (
                                      <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg space-y-1">
                                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Faculty Feedback</span>
                                        <p className="text-xs font-medium text-slate-700 italic leading-relaxed">
                                          &ldquo;{entry.viva_assessment}&rdquo;
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="py-3 text-center bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                              <p className="text-xs text-slate-400 font-medium">No tasks assigned for Week {wk} yet.</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Tab 8: My Profile */}
        {activeTab === "profile" && currentStudent && (() => {
          const isProfileEditAllowed = allowedProfileEditClasses.includes(currentStudent.classGroup);
          return (
            <form onSubmit={handleSaveProfile} className="space-y-6 font-sans">
              {/* Access Controller Banner */}
              <div className="flex justify-between items-center bg-white p-4.5 rounded-xl border border-slate-100 shadow-card flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${isProfileEditAllowed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {isProfileEditAllowed ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-800">
                      {isProfileEditAllowed ? "Profile Editing Access Enabled" : "Profile Editing Access Locked"}
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-semibold">
                      {isProfileEditAllowed
                        ? "You are permitted to modify your academic and personal registration credentials."
                        : "Editing has been disabled by your Campus Manager (CM) for your class group."}
                    </p>
                  </div>
                </div>

                {isProfileEditAllowed && !isEditingProfile && (
                  <button
                    type="button"
                    onClick={startEditingProfile}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white border border-white/10 rounded-xl text-xs font-extrabold shadow-sm transition-all hover:scale-[1.01] cursor-pointer"
                  >
                    Edit Profile Data
                  </button>
                )}
              </div>

              {/* Editing Action Row */}
              {isEditingProfile && (
                <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 p-4.5 rounded-xl justify-end flex-wrap">
                  <span className="text-xs font-bold text-amber-800 mr-auto">
                    Editing mode active. Click Save to apply your changes.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-700 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md transition-all cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              )}

              {/* Main Profile Info Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Section 1: Personal & Primary Identity */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <User className="h-5 w-5 text-amber-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Personal & Identity Credentials</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Full Name</span>
                      {isEditingProfile ? (
                        <input aria-label="Full Name"
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                          required
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.name}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Register Number (Institutional)</span>
                      <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.register_number || <span className="text-slate-400 italic">Not Assigned</span>}</span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Roll Number</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editRollNumber}
                          onChange={e => setEditRollNumber(e.target.value)}
                          placeholder="e.g. 21CS01"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.roll_number || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Aadhar Card Number</span>
                      {/* ROLE_UI_AUDIT S1 (P0): Aadhaar is sensitive PII — students can no
                          longer edit it themselves; only CAM/Admin can change it. */}
                      <span className="text-xs font-extrabold text-slate-900 block font-mono">
                        {currentStudent.aadhar_number
                          ? `XXXX-XXXX-${currentStudent.aadhar_number.replace(/\D/g, "").slice(-4) || "XXXX"}`
                          : <span className="text-slate-400 italic font-sans">Not Added</span>}
                        <span className="ml-2 text-[9px] font-semibold text-slate-400 font-sans normal-case">(managed by campus office)</span>
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Date of Birth (DOB)</span>
                      {isEditingProfile ? (
                        <input aria-label="Date of Birth"
                          type="date"
                          value={editDob}
                          onChange={e => setEditDob(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-900 block">{currentStudent.dob || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Blood Group</span>
                      {isEditingProfile ? (
                        <select aria-label="Blood Group"
                          value={editBloodGroup}
                          onChange={e => setEditBloodGroup(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 cursor-pointer"
                        >
                          <option value="">Select Group</option>
                          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bg => (
                            <option key={bg} value={bg}>{bg}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs font-extrabold text-slate-900 block">{currentStudent.blood_group || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 2: Contact Details */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Clock className="h-5 w-5 text-amber-700" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Contact & Communications</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 sm:col-span-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Primary Email</span>
                      {isEditingProfile ? (
                        <input aria-label="Primary Email"
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                          required
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-amber-600 block break-all">{currentStudent.email}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Student Phone Number</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editPhone}
                          onChange={e => setEditPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-900 block">{currentStudent.phone || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Parent WhatsApp Number</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editParentPhone}
                          onChange={e => setEditParentPhone(e.target.value)}
                          placeholder="e.g. 8765432109"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-900 block">{currentStudent.parent_phone || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 3: Academic History & Medium */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5 lg:col-span-2">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <BookOpen className="h-5 w-5 text-amber-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Academic Background & Marks</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Course Department</span>
                      {isEditingProfile ? (
                        <input aria-label="Course Department"
                          type="text"
                          value={editDepartment}
                          onChange={e => setEditDepartment(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                          required
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.department}</span>
                          <CourseInfoButton course={currentStudent.department} collegeId={currentStudent.college_id} size="xs" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">10th Mark (%)</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editTenthMark}
                          onChange={e => setEditTenthMark(e.target.value)}
                          placeholder="e.g. 92.4"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.tenth_mark ? `${currentStudent.tenth_mark}%` : <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">11th Mark (%)</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editEleventhMark}
                          onChange={e => setEditEleventhMark(e.target.value)}
                          placeholder="e.g. 88.5"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.eleventh_mark ? `${currentStudent.eleventh_mark}%` : <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">12th Mark (%)</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editTwelfthMark}
                          onChange={e => setEditTwelfthMark(e.target.value)}
                          placeholder="e.g. 94.0"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-800 block">{currentStudent.twelfth_mark ? `${currentStudent.twelfth_mark}%` : <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">School Group</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editAcademicGroup}
                          onChange={e => setEditAcademicGroup(e.target.value)}
                          placeholder="e.g. Computer Science"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-extrabold text-slate-900 block">{currentStudent.academic_group || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Medium of Study</span>
                      {isEditingProfile ? (
                        <select aria-label="Medium of Study"
                          value={editMedium}
                          onChange={e => setEditMedium(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800 cursor-pointer"
                        >
                          <option value="">Select Medium</option>
                          <option value="English">English</option>
                          <option value="Tamil">Tamil</option>
                          <option value="Other">Other</option>
                        </select>
                      ) : (
                        <span className="text-xs font-extrabold text-slate-900 block">{currentStudent.medium || <span className="text-slate-400 italic">Not Added</span>}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 4: Professional Portfolios & Practice Hubs */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5 lg:col-span-2">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                    <Sparkles className="h-5 w-5 text-amber-600" />
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Professional Portfolios & Coding Profiles</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                    {/* LinkedIn */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">LinkedIn Profile</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editLinkedinLink}
                          onChange={e => setEditLinkedinLink(e.target.value)}
                          placeholder="linkedin.com/in/username"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        (() => {
                          const val = currentStudent.linkedin_link;
                          if (!val) return <span className="text-xs text-slate-400 italic">Not Added</span>;
                          const href = val.startsWith("http") ? val : `https://${val}`;
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-600 hover:underline break-all">{val}</a>;
                        })()
                      )}
                    </div>

                    {/* GitHub */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block flex items-center gap-1.5">
                        GitHub ID
                        {(currentStudent.department?.toLowerCase().includes("computer") || currentStudent.classGroup?.toLowerCase().includes("cs")) && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-50 border border-rose-100 text-rose-700 text-[8px] font-extrabold uppercase shrink-0">Mandatory for CS</span>
                        )}
                      </span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editGithubId}
                          onChange={e => setEditGithubId(e.target.value)}
                          placeholder="e.g. githubusername"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        (() => {
                          const val = currentStudent.github_id;
                          if (!val) return <span className="text-xs text-slate-400 italic">Not Added</span>;
                          const href = `https://github.com/${val.replace(/@/, "")}`;
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-600 hover:underline break-all">{val}</a>;
                        })()
                      )}
                    </div>

                    {/* Project Drive Link */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Project Drive Link</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editProjectDriveLink}
                          onChange={e => setEditProjectDriveLink(e.target.value)}
                          placeholder="drive.google.com/..."
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        (() => {
                          const val = currentStudent.project_drive_link;
                          if (!val) return <span className="text-xs text-slate-400 italic">Not Added</span>;
                          const href = val.startsWith("http") ? val : `https://${val}`;
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-600 hover:underline break-all">Google Drive Folder Link</a>;
                        })()
                      )}
                    </div>

                    {/* HackerRank Profile Link */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">HackerRank Profile</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editHackerrankLink}
                          onChange={e => setEditHackerrankLink(e.target.value)}
                          placeholder="hackerrank.com/username"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        (() => {
                          const val = currentStudent.hackerrank_link;
                          if (!val) return <span className="text-xs text-slate-400 italic">Not Added</span>;
                          const href = val.startsWith("http") ? val : `https://${val}`;
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-600 hover:underline break-all">{val}</a>;
                        })()
                      )}
                    </div>

                    {/* LeetCode Profile Link */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">LeetCode Profile</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editLeetcodeLink}
                          onChange={e => setEditLeetcodeLink(e.target.value)}
                          placeholder="leetcode.com/username"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        (() => {
                          const val = currentStudent.leetcode_link;
                          if (!val) return <span className="text-xs text-slate-400 italic">Not Added</span>;
                          const href = val.startsWith("http") ? val : `https://${val}`;
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-600 hover:underline break-all">{val}</a>;
                        })()
                      )}
                    </div>

                    {/* Figma Profile */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Figma Profile</span>
                      {isEditingProfile ? (
                        <input
                          type="text"
                          value={editFigmaLink}
                          onChange={e => setEditFigmaLink(e.target.value)}
                          placeholder="figma.com/@username"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-bold focus:ring-1 focus:ring-amber-500 outline-none text-slate-800"
                        />
                      ) : (
                        (() => {
                          const val = currentStudent.figma_link;
                          if (!val) return <span className="text-xs text-slate-400 italic">Not Added</span>;
                          const href = val.startsWith("http") ? val : `https://${val}`;
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-amber-600 hover:underline break-all">{val}</a>;
                        })()
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Coding & Competitive Programming Performance Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-xs">
                      &lt;/&gt;
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <span>💻 Live Coding &amp; Contest Performance</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Live DB Synchronized
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                        Real-time algorithmic problems solved, college contest rankings, and verified competitive programming standing.
                      </p>
                    </div>
                  </div>

                  {codingStatsData?.collegeMatched && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                      🏛️ {codingStatsData.collegeMatched}
                    </span>
                  )}
                </div>

                {loadingCodingStats ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400 animate-pulse flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                    <span>Syncing latest LeetCode &amp; HackerRank metrics...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* LeetCode Card */}
                    <div className="p-5 rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 shadow-xs space-y-4 relative overflow-hidden">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-xl bg-slate-900 border border-amber-500/30 flex items-center justify-center shadow-xs p-1.5">
                            <LeetCodeLogo className="h-6 w-6" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">LeetCode Progress</h4>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {codingStatsData?.leetcode?.username ? `@${codingStatsData.leetcode.username}` : (currentStudent.leetcode_link ? "Linked Profile" : "Campus Algorithm Lab")}
                            </p>
                          </div>
                        </div>

                        {codingStatsData?.leetcode?.ranking ? (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                            Rank #{codingStatsData.leetcode.ranking.toLocaleString()}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                            {codingStatsData?.leetcode?.found ? "Active Solver" : "Unranked"}
                          </span>
                        )}
                      </div>

                      {/* Total Solved Hero Number */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-900">
                          {codingStatsData?.leetcode?.solvedTotal || 0}
                        </span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Problems Solved
                        </span>
                      </div>

                      {/* Solved Difficulty Distribution Pills */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/70 text-center">
                          <span className="text-[9.5px] font-black uppercase text-emerald-700 tracking-wider block">Easy</span>
                          <span className="text-sm font-black text-emerald-900">{codingStatsData?.leetcode?.solvedEasy || 0}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/70 text-center">
                          <span className="text-[9.5px] font-black uppercase text-amber-700 tracking-wider block">Medium</span>
                          <span className="text-sm font-black text-amber-900">{codingStatsData?.leetcode?.solvedMedium || 0}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/70 text-center">
                          <span className="text-[9.5px] font-black uppercase text-rose-700 tracking-wider block">Hard</span>
                          <span className="text-sm font-black text-rose-900">{codingStatsData?.leetcode?.solvedHard || 0}</span>
                        </div>
                      </div>

                      {/* Profile Action Link */}
                      <div className="pt-2 border-t border-amber-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {codingStatsData?.leetcode?.lastSyncedAt
                            ? `Last Synced: ${new Date(codingStatsData.leetcode.lastSyncedAt).toLocaleDateString()}`
                            : "Auto-synced with college database"}
                        </span>
                        <a
                          href={codingStatsData?.leetcode?.profileUrl || contestData?.leetcode?.contestUrl || "https://leetcode.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-[#FFA116] hover:bg-amber-500 text-slate-950 text-xs font-black transition-all flex items-center gap-1 shadow-2xs"
                        >
                          <span>Open Profile</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    {/* HackerRank Card */}
                    <div className="p-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/30 shadow-xs space-y-4 relative overflow-hidden">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-xl bg-slate-900 border border-emerald-500/30 flex items-center justify-center shadow-xs p-1.5">
                            <HackerRankLogo className="h-6 w-6" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">HackerRank Contest Standing</h4>
                            <p className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                              {codingStatsData?.hackerrank?.contestName || "Campus Weekly Contest"}
                            </p>
                          </div>
                        </div>

                        {codingStatsData?.hackerrank?.rank ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs">
                            🏆 Rank #{codingStatsData.hackerrank.rank}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black bg-slate-100 text-slate-600 border border-slate-200">
                            {codingStatsData?.hackerrank?.found ? "Participant" : "Active"}
                          </span>
                        )}
                      </div>

                      {/* Contest Score / Solved Hero Numbers */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
                          <span className="text-[9.5px] font-black uppercase text-slate-400 tracking-wider block">Contest Score</span>
                          <span className="text-2xl font-black text-slate-900">
                            {codingStatsData?.hackerrank?.computedScore || 0}
                          </span>
                        </div>
                        <div className="bg-white/80 p-3 rounded-xl border border-emerald-100">
                          <span className="text-[9.5px] font-black uppercase text-slate-400 tracking-wider block">Questions Solved</span>
                          <span className="text-2xl font-black text-emerald-700">
                            {codingStatsData?.hackerrank?.solved || 0}
                            <span className="text-xs font-bold text-slate-400 ml-1">
                              / {codingStatsData?.hackerrank?.totalQuestions || "—"}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Additional Metrics Strip */}
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100">
                        <span>Attempted: <strong>{codingStatsData?.hackerrank?.attempted || 0} Tasks</strong></span>
                        <span>User: <strong>{codingStatsData?.hackerrank?.username || "Verified"}</strong></span>
                      </div>

                      {/* Contest Action Link */}
                      <div className="pt-2 border-t border-emerald-100 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-medium">
                          {codingStatsData?.hackerrank?.lastScrapedAt
                            ? `Scraped: ${new Date(codingStatsData.hackerrank.lastScrapedAt).toLocaleDateString()}`
                            : "College Leaderboard Sync"}
                        </span>
                        <a
                          href={codingStatsData?.hackerrank?.profileUrl || contestData?.hackerrank?.contestUrl || "https://www.hackerrank.com/contests"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg bg-[#00EA64] hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all flex items-center gap-1 shadow-2xs"
                        >
                          <span>Open Contest</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Honors & Student Achievements Section */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-card space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                      <Award className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <span>🏆 Honors, Accolades &amp; Achievements</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-pink-50 text-[#4F46E5] border border-pink-100">
                          {studentAchievements.length} Verified
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                        Hackathon wins, symposium recognitions, paper publications, and campus honors verified by Campus Management.
                      </p>
                    </div>
                  </div>
                </div>

                {loadingStudentAchievements ? (
                  <div className="p-8 text-center text-xs font-bold text-slate-400 animate-pulse">
                    Loading student accolades...
                  </div>
                ) : studentAchievements.length === 0 ? (
                  <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center space-y-2 bg-slate-50/50">
                    <Award className="h-8 w-8 text-slate-300 mx-auto" />
                    <h4 className="text-xs font-extrabold text-slate-700">No Verified Achievements Logged Yet</h4>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      Achievements recorded by the Campus Manager for hackathons, paper presentations, and sports meets will be highlighted here.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {studentAchievements.map((ach) => {
                      const isTopPrize = ["Winner", "1st Place", "Gold Medalist"].includes(ach.badge);
                      let achPhotosList: string[] = [];
                      if (ach.photos) {
                        try {
                          achPhotosList = typeof ach.photos === "string" ? JSON.parse(ach.photos) : (Array.isArray(ach.photos) ? ach.photos : []);
                        } catch (_) {
                          achPhotosList = [ach.photos];
                        }
                      }

                      return (
                        <div
                          key={ach.id}
                          className="p-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/50 shadow-card hover:shadow-card-lg transition-all flex flex-col justify-between space-y-3 relative overflow-hidden group"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wide border ${
                                  isTopPrize
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : ach.badge === "Runner-Up" || ach.badge === "2nd Place" || ach.badge === "Silver Medalist"
                                      ? "bg-slate-100 text-slate-800 border-slate-300"
                                      : ach.badge === "Paper Published" || ach.badge === "Certification"
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                        : "bg-indigo-100 text-amber-800 border-indigo-300"
                                }`}
                              >
                                {ach.badge || "Accolade"}
                              </span>

                              <span className="text-[10.5px] font-mono font-bold text-slate-400">
                                {ach.date_str || "Verified"}
                              </span>
                            </div>

                            <div>
                              <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-amber-600 block">
                                {ach.category || "Accolade"}
                              </span>
                              <h4 className="text-sm font-black text-slate-900 leading-snug mt-0.5">
                                {ach.title}
                              </h4>
                              {ach.topic && (
                                <p className="text-xs font-bold text-zinc-900 mt-1 flex items-center gap-1">
                                  <span className="text-[10px] uppercase font-black text-slate-400">Topic:</span>
                                  <span>{ach.topic}</span>
                                </p>
                              )}
                            </div>

                            {ach.event_name && (
                              <div className="p-2 rounded-xl bg-slate-100/70 border border-slate-200/60 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-[#4F46E5] shrink-0" />
                                <span className="truncate">Event: <strong className="text-slate-900">{ach.event_name}</strong></span>
                              </div>
                            )}

                            {ach.reward_prize && (
                              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-black text-emerald-900 flex items-center gap-1.5">
                                <Award className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <span>Prize: {ach.reward_prize}</span>
                              </div>
                            )}

                            {ach.description && (
                              <p className="text-xs text-slate-600 line-clamp-2 font-normal leading-relaxed">
                                {ach.description}
                              </p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-xs">
                            {ach.proof_link ? (
                              <a
                                href={ach.proof_link.startsWith("http") ? ach.proof_link : `https://${ach.proof_link}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-800 hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Certificate Proof</span>
                              </a>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">Campus Verified</span>
                            )}

                            {achPhotosList.length > 0 && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                📸 {achPhotosList.length} photo(s)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Attendance & Engagement Stats Card */}
              <div className="bg-pastel-blue p-6 rounded-2xl border-transparent shadow-sm space-y-6">
                <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest font-sans">Attendance Performance Stats</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
                  <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                    <span className="text-3xl font-extrabold text-slate-900">{overallPercentage.toFixed(1)}%</span>
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Average Attendance</span>
                  </div>
                  <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                    <span className="text-3xl font-extrabold text-slate-900">{(overallPercentage / 20).toFixed(2)}</span>
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Attendance GPA</span>
                  </div>
                  <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                    <span className="text-3xl font-extrabold text-slate-900">{totalClasses}</span>
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Total Slots Marked</span>
                  </div>
                  <div className="p-4 bg-white/80 rounded-xl border border-slate-100/40">
                    <span className="text-3xl font-extrabold text-slate-900">{presentClasses}</span>
                    <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider block mt-1">Present Intervals</span>
                  </div>
                </div>
              </div>
            </form>
          );
        })()}
        {/* Tab: 1-on-1 Structured Interviews, GMeet & Rubric Assessment Hub */}
        {activeTab === "interviews" && (() => {
          // Flatten student slots and evaluations across both context and dynamic fetch
          const allSlots: any[] = [];
          const allEvals: any[] = [];

          // 1. From dynamically fetched interviews
          studentInterviewsList.forEach(iv => {
            if (Array.isArray(iv.student_slots)) {
              iv.student_slots.forEach((s: any) => {
                const isStudentMatch = s.student_id === currentStudent?.id ||
                  (s.student_name && currentStudent?.name && s.student_name.toLowerCase().trim() === currentStudent.name.toLowerCase().trim());
                if (isStudentMatch) allSlots.push({ ...s, interviewType: iv.type, preferred_start_time: iv.preferred_start_time });
              });
            }
            if (Array.isArray(iv.evaluations)) {
              iv.evaluations.forEach((e: any) => {
                const isStudentMatch = e.student_id === currentStudent?.id ||
                  (e.student_name && currentStudent?.name && e.student_name.toLowerCase().trim() === currentStudent.name.toLowerCase().trim());
                if (isStudentMatch) allEvals.push({ ...e, subject: iv.subject, target_date: iv.target_date, interviewType: iv.type });
              });
            }
          });

          // 2. From global context (fallback if dynamic not populated)
          if (allEvals.length === 0 && Array.isArray(interviewEvaluations)) {
            interviewEvaluations.forEach((e: any) => {
              if (e.student_id === currentStudent?.id || (e.student_name && currentStudent?.name && e.student_name.toLowerCase().trim() === currentStudent.name.toLowerCase().trim())) {
                allEvals.push(e);
              }
            });
          }

          // Deduplicate
          const uniqueSlots = Array.from(new Map(allSlots.map(s => [s.id || `${s.interview_id}_${s.slot_start_time}`, s])).values());
          const uniqueEvals = Array.from(new Map(allEvals.map(e => [e.id || `${e.interview_id}_${e.student_id}`, e])).values());

          const upcomingSlots = uniqueSlots.filter(s => s.status !== "completed" && s.status !== "absent");
          const evaluatedCount = uniqueEvals.length;
          const clearedCount = uniqueEvals.filter(e => (e.status || "").toLowerCase().includes("clear")).length;
          const avgScore = evaluatedCount > 0
            ? (uniqueEvals.reduce((acc, e) => acc + (Number(e.total_score) || 0), 0) / evaluatedCount).toFixed(1)
            : "—";

          return (
            <div className="space-y-6 animate-fadeIn pb-12">
              {/* Header Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-[#4F46E5] text-white flex items-center justify-center shadow-sm shrink-0">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      1-on-1 Structured Technical Interviews
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200/80">
                        Live Portal
                      </span>
                    </h1>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      Individual 15-minute faculty assessments, real Google Meet video conferences, and multi-pillar rubric scorecards.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => studentInterviewsQuery.refetch()}
                    disabled={loadingStudentInterviews}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingStudentInterviews ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* KPI Analytics Summary Bar */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex items-center gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Upcoming Slots</span>
                    <span className="text-xl font-black text-slate-900">{upcomingSlots.length}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex items-center gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Cleared Sessions</span>
                    <span className="text-xl font-black text-emerald-600">{clearedCount}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex items-center gap-3.5">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Avg Rubric Score</span>
                    <span className="text-xl font-black text-amber-700">{avgScore} {avgScore !== "—" ? "/ 10" : ""}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-card flex items-center gap-3.5 bg-emerald-50/20">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider block">Period Attendance Sync</span>
                    <span className="text-xs font-black text-emerald-800 flex items-center gap-1 mt-0.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active & Synchronized
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1: Upcoming Scheduled Interview Slots */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Video className="h-4 w-4 text-amber-600" />
                      Scheduled 15-Minute Interview Sessions
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                      Join your Google Meet call at your exact allocated time window. Your timetable period attendance will update automatically.
                    </p>
                  </div>
                  <span className="text-xs font-extrabold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {upcomingSlots.length} Active
                  </span>
                </div>

                {upcomingSlots.length === 0 ? (
                  <div className="p-8 bg-white border border-dashed border-slate-200 rounded-2xl text-center space-y-3">
                    <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <Calendar className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-800">No Upcoming Interviews Scheduled</h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto font-medium">
                        When an internal or external faculty evaluation is scheduled for your cohort, your dedicated 15-minute slot, Google Meet link, and calendar invite will appear here.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingSlots.map((slot) => {
                      const isInternal = slot.interviewType === "internal" || slot.mode === "in_person";
                      const meetUrl = !isInternal ? slot.gmeet_link : null;
                      const calUrl = !isInternal ? slot.gcal_link : null;

                      return (
                        <div
                          key={slot.id || `${slot.interview_id}_${slot.slot_start_time}`}
                          className="bg-white rounded-2xl border border-slate-100 shadow-card hover:shadow-card-lg transition-all duration-200 p-5 space-y-4 flex flex-col justify-between relative overflow-hidden group"
                        >
                          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-[#4F46E5] to-teal-400" />

                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-1.5 border ${
                                  isInternal
                                    ? "bg-teal-50 text-teal-700 border-teal-200/80"
                                    : "bg-amber-50 text-amber-800 border-indigo-200/80"
                                }`}>
                                  {isInternal ? "Internal Campus Evaluation (In-Person)" : "External Zone Panel (Virtual)"}
                                </span>
                                <h3 className="text-sm font-black text-slate-900 line-clamp-1">{slot.subject || "Technical Interview"}</h3>
                              </div>
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                                {slot.status || "Scheduled"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                              <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                <Calendar className="h-4 w-4 text-amber-500 shrink-0" />
                                <div>
                                  <span className="text-[9px] font-extrabold text-slate-400 uppercase block">Date</span>
                                  <span className="font-bold text-slate-800">{slot.target_date || "Upcoming"}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                <Clock className="h-4 w-4 text-[#4F46E5] shrink-0" />
                                <div>
                                  <span className="text-[9px] font-extrabold text-slate-400 uppercase block">Allocated Slot</span>
                                  <span className="font-bold text-slate-800 truncate block">
                                    {slot.slot_start_time ? `${slot.slot_start_time} - ${slot.slot_end_time || ""}` : "Assigned Window"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs flex items-center justify-between">
                              <span className="text-slate-500 font-medium">Evaluator:</span>
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-slate-400" />
                                {slot.mentor_name || "Assigned Faculty Member"}
                              </span>
                            </div>

                            {isInternal && (
                              <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 text-[10.5px] text-teal-900 flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
                                <div>
                                  <strong className="block font-bold">Venue: In-Person Faculty Cabin / Lab</strong>
                                  <span>Report directly to the assigned faculty room for your 15-minute evaluation slot.</span>
                                </div>
                              </div>
                            )}

                            <div className="p-2 rounded-lg bg-emerald-50/60 border border-emerald-100 text-[10.5px] text-emerald-800 flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span>Period Attendance will automatically mark <strong>Present</strong> upon faculty evaluation.</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            {isInternal ? (
                              <div className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-2">
                                <User className="h-4 w-4 text-teal-600" />
                                <span>In-Person Campus Interview</span>
                              </div>
                            ) : (
                              <>
                                {calUrl && (
                                  <a
                                    href={calUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all"
                                    title="Add to Google Calendar"
                                  >
                                    <Calendar className="h-3.5 w-3.5 text-amber-600" />
                                    <span className="hidden sm:inline">Add to Cal</span>
                                  </a>
                                )}
                                {meetUrl ? (
                                  <a
                                    href={meetUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 btn-gradient py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-2 shadow-sm hover:opacity-95 transition-all cursor-pointer"
                                  >
                                    <Video className="h-4 w-4" />
                                    <span>Join Google Meet</span>
                                    <ExternalLink className="h-3 w-3 opacity-80" />
                                  </a>
                                ) : (
                                  <div className="flex-1 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-medium text-center">
                                    Virtual Room Link Pending
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section 2: Completed Evaluations & Multi-Criteria Rubric Breakdown */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#4F46E5]" />
                      Interview Performance & Rubric Evaluations
                    </h2>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                      Comprehensive scorecards, faculty remarks, and individual criteria breakdown.
                    </p>
                  </div>
                  <span className="text-xs font-extrabold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                    {uniqueEvals.length} Completed
                  </span>
                </div>

                {uniqueEvals.length === 0 ? (
                  <div className="p-8 bg-white border border-dashed border-slate-200 rounded-2xl text-center space-y-2">
                    <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                      <Award className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">No Evaluations Recorded Yet</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto font-medium">
                      Your completed interview marks, rubrics, and faculty feedback will appear here once submitted.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {uniqueEvals.map((ev) => {
                      const isAbsent = ev.attendance === "absent" || (ev.status || "").toLowerCase() === "absent";
                      const isCleared = !isAbsent && (Number(ev.total_score) >= 6 || (ev.status || "").toLowerCase().includes("clear"));

                      return (
                        <div
                          key={ev.id || `${ev.interview_id}_${ev.student_id}`}
                          className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 space-y-5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {ev.interviewType === "external" ? "External Evaluation" : "Internal Evaluation"}
                                </span>
                                <span className="text-xs text-slate-400 font-semibold">{ev.target_date || "Completed"}</span>
                              </div>
                              <h3 className="text-base font-extrabold text-slate-900 mt-1">{ev.subject || "Technical Interview"}</h3>
                              <p className="text-xs text-slate-500 font-medium">Evaluated by <strong className="text-slate-800">{ev.mentor_name || "Faculty Panel"}</strong></p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="text-[9px] text-slate-400 font-bold uppercase block">Overall Score</span>
                                <span className={`text-2xl font-black ${isAbsent ? "text-rose-600" : isCleared ? "text-emerald-600" : "text-amber-600"}`}>
                                  {isAbsent ? "0" : ev.total_score} <span className="text-xs text-slate-400 font-bold">/ 10</span>
                                </span>
                              </div>
                              <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${
                                isAbsent
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : isCleared
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {isAbsent ? "Absent" : isCleared ? "Cleared" : "Needs Work"}
                              </span>
                            </div>
                          </div>

                          {isAbsent ? (
                            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                              <span>Candidate was recorded absent for this interview session. The timetable period attendance reflects <strong>Absent</strong>.</span>
                            </div>
                          ) : (
                            <>
                              {/* 4-Criteria Rubric Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center space-y-1">
                                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Communication</span>
                                  <span className="text-lg font-black text-slate-800">{ev.communication_score ?? "—"} <span className="text-[10px] text-slate-400 font-bold">/ 10</span></span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center space-y-1">
                                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Content & Concept</span>
                                  <span className="text-lg font-black text-slate-800">{ev.content_score ?? "—"} <span className="text-[10px] text-slate-400 font-bold">/ 10</span></span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center space-y-1">
                                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Technical Skill</span>
                                  <span className="text-lg font-black text-slate-800">{ev.technical_score ?? "—"} <span className="text-[10px] text-slate-400 font-bold">/ 10</span></span>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center space-y-1">
                                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider block">Confidence</span>
                                  <span className="text-lg font-black text-slate-800">{ev.confidence_score ?? "—"} <span className="text-[10px] text-slate-400 font-bold">/ 10</span></span>
                                </div>
                              </div>

                              {/* Remarks */}
                              {ev.remarks && (
                                <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100 space-y-1">
                                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Evaluator Feedback</span>
                                  <p className="text-xs text-slate-700 font-medium italic">"{ev.remarks}"</p>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </main>
    </div>
  );
};