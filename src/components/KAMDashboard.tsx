"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Building2,
  Users,
  GraduationCap,
  Calendar,
  Award,
  ShieldCheck,
  FileText,
  Settings,
  Layers,
  IndianRupee,
  Clock,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  Mail,
  Phone,
  ArrowUpRight,
  Menu,
  ChevronLeft,
  Sparkles,
  BookOpen,
  CalendarCheck2,
  CalendarRange,
  UserCheck,
  Percent,
  Check,
  Filter,
  BarChart3,
  PieChart
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { isSuperAdminSession } from "@/lib/superadmin";
import {
  KAM_PILLARS,
  KAM_NAV_ITEMS,
  findKamPillarForTab,
  getActiveSubTabForPillar,
} from "@/lib/kamNav";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { Button } from "@/components/ui/button";
import { ALL_SEMESTERS } from "@/lib/semesters";

// ── Lazy-loaded Modular Panels (completely decoupled from CAMDashboard) ──
const KAMOverview = dynamic(() => import("./kam/overview/KAMOverview").then(m => m.KAMOverview), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Executive Portfolio Overview…</div>
});

const KAMAnalytics = dynamic(() => import("./kam/analytics/KAMAnalytics").then(m => m.KAMAnalytics), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Institutional Analytics…</div>
});

const StudentsRegistryTable = dynamic(() => import("./kam/students/StudentsRegistryTable").then(m => m.StudentsRegistryTable), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Students Registry…</div>
});

const CampusAuditManager = dynamic(() => import("./CampusAuditManager").then(m => m.CampusAuditManager), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Campus Audit Hub…</div>
});

const KAMAcademicTrackerView = dynamic(() => import("./kam/academic/KAMAcademicTrackerView").then(m => m.KAMAcademicTrackerView), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Academic Delivery Studio…</div>
});

const KAMExamsView = dynamic(() => import("./kam/academic/KAMExamsView").then(m => m.KAMExamsView), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Institutional Assessments & Marks Studio…</div>
});

const KAMCampusSnapshot = dynamic(() => import("./kam/overview/KAMCampusSnapshot").then(m => m.KAMCampusSnapshot), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Campus Snapshot…</div>
});

const KAMFacultyInfographics = dynamic(() => import("./kam/mentors/KAMFacultyInfographics").then(m => m.KAMFacultyInfographics), {
  ssr: false
});

const KAMMentorAttendanceView = dynamic(() => import("./kam/mentors/KAMMentorAttendanceView").then(m => m.KAMMentorAttendanceView), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Faculty Attendance Telemetry…</div>
});

const FeeManagerDashboard = dynamic(() => import("./FeeManagerDashboard").then(m => m.FeeManagerDashboard), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Fee Management…</div>
});

const InterviewModule = dynamic(() => import("./InterviewModule").then(m => m.InterviewModule), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Interview Workspace…</div>
});

const CMApprovalsHub = dynamic(() => import("./CMApprovalsHub").then(m => m.CMApprovalsHub), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Request Approvals…</div>
});

const SkillTrackerPanel = dynamic(() => import("./SkillTrackerPanel").then(m => m.SkillTrackerPanel), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Skill Tracker…</div>
});

const SkillReportPanel = dynamic(() => import("./SkillReportPanel").then(m => m.SkillReportPanel), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Skill Report…</div>
});

const WeeklyPlanViewer = dynamic(() => import("./WeeklyPlanStudio").then(m => m.WeeklyPlanViewer), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Weekly Curriculum Plans…</div>
});

const LndAllocationDashboard = dynamic(() => import("./LndAllocationDashboard").then(m => m.LndAllocationDashboard), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Demo & L&D Allocation…</div>
});

export interface KAMDashboardProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

export function KAMDashboard({ activeTab: propActiveTab = "overview", onTabChange }: KAMDashboardProps = {}) {
  const {
    colleges: rawColleges,
    currentKAM,
    mentors,
    students,
    studentAttendance,
    slots,
    subjectsList,
    coursesList,
    departmentsList,
    daysOfWeek,
    timeSlots,
    academicYears,
    requests,
    approvedHandovers
  } = useApp();

  const { toast } = useToast();
  const isSuperAdmin = isSuperAdminSession();

  // Local tab state fallback if not managed by parent route
  const [internalActiveTab, setInternalActiveTab] = useState<string>(propActiveTab);
  const activeTab = propActiveTab || internalActiveTab;
  const setActiveTab = useCallback((tab: string) => {
    setInternalActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  }, [onTabChange]);

  // Sidebar collapse & accordion states
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    dashboard: true,
    academics: false,
    faculty: false,
    schedules: false,
    students: false
  });
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);

  // Filter colleges strictly to those assigned to this KAM, or all partner colleges if none explicitly linked
  const assignedCollegeIds = useMemo(() => {
    if (isSuperAdmin || !currentKAM?.id) {
      return rawColleges.map(c => c.id);
    }
    const explicitlyAssigned = rawColleges
      .filter(c => c.kam_id === currentKAM.id || (c as any).kamId === currentKAM.id)
      .map(c => c.id);
    return explicitlyAssigned.length > 0 ? explicitlyAssigned : rawColleges.map(c => c.id);
  }, [rawColleges, currentKAM?.id, isSuperAdmin]);

  const scopedColleges = useMemo(() => {
    return rawColleges.filter(c => assignedCollegeIds.includes(c.id));
  }, [rawColleges, assignedCollegeIds]);

  // Active college filter: defaults to "all" (Portfolio Overview) for KAM
  const [activeCollegeId, setActiveCollegeId] = useState<string>("all");

  // Re-verify active college is within scope
  useEffect(() => {
    if (activeCollegeId !== "all" && !assignedCollegeIds.includes(activeCollegeId)) {
      setActiveCollegeId("all");
    }
  }, [assignedCollegeIds, activeCollegeId]);

  const activeCollege = useMemo(() => {
    return scopedColleges.find(c => c.id === activeCollegeId);
  }, [scopedColleges, activeCollegeId]);

  const activeCollegeName = activeCollege?.name || (activeCollegeId === "all" ? "All Supervised Campuses (Portfolio Overview)" : "Selected Campus");

  // KAM Executive 7-Pillar Navigation Model
  const currentPillar = useMemo(() => findKamPillarForTab(activeTab), [activeTab]);

  const kamMobileNavTabs = useMemo(() => [
    { id: "overview", label: "Executive", icon: Building2 },
    { id: "academic_tracker", label: "Academics", icon: BookOpen },
    { id: "students", label: "Students", icon: GraduationCap },
    { id: "fees", label: "Fees", icon: IndianRupee },
    { id: "more_menu", label: "More", icon: Menu },
  ], []);

  const kamMoreModules = useMemo(() => [
    { id: "faculty", label: "Faculty Staffing", hint: "Workload distribution & mentor matrix", icon: Users },
    { id: "timetable", label: "Timetables & Presence", hint: "Master timetable matrix & session presence", icon: Calendar },
    { id: "audit", label: "Campus E-Audit & NPS", hint: "Compliance grading, tickets & client feedback", icon: ShieldCheck },
    { id: "reports", label: "Comparative Analytics", hint: "Cross-campus performance analytics & exports", icon: FileText },
    { id: "exams_and_marks", label: "CIA & Exam Marks Studio", hint: "Exam schedules, pass % and marks ledger", icon: Award },
    { id: "faculty_weekly_plan", label: "Weekly Lesson Plans", hint: "Faculty syllabus delivery plans", icon: CalendarRange },
    { id: "mentor_attendance", label: "Faculty Attendance Logs", hint: "Punch-in/out logs & punctuality telemetry", icon: Clock },
    { id: "handovers", label: "Swap & Leave Approvals", hint: "Approvals queue for swaps and leaves", icon: CalendarCheck2 },
    { id: "interviews", label: "Placement Mock Interviews", hint: "Mock interview schedule & evaluator feedback", icon: Award },
    { id: "demo_schedule", label: "L&D Demo Evaluations", hint: "Demo evaluations & rubric scores", icon: Award },
    { id: "config", label: "Academic Configuration", hint: "Active day orders, periods & shifts", icon: Settings },
    { id: "curriculum", label: "Batch & Section Structure", hint: "Cohort distribution & curriculum syllabus", icon: Layers },
    { id: "events", label: "Campus Events & Milestones", hint: "Hackathons, placement drives & academic calendar", icon: Calendar },
    { id: "profile", label: "My Profile", hint: "Institutional account credentials & scope", icon: Users },
  ], []);

  // Notification count calculation for sidebar badges
  const getPillarPendingCount = useCallback((pillarId: string) => {
    if (pillarId === "faculty") {
      return requests.filter(r => r.status === "pending" || r.status === "pending_cm" || r.status === "pending_cam").length;
    }
    return 0;
  }, [requests]);

  // ── KAM Overview & Analytics Computed Metrics ──
  const kamMetrics = useMemo(() => {
    const campusIds = new Set(scopedColleges.map(c => c.id));
    const kStudents = students.filter(s => campusIds.has(s.college_id || ""));
    const kMentors = mentors.filter(m => campusIds.has(m.college_id || ""));
    
    const studentCollegeMap = new Map<string, string>();
    students.forEach(s => {
      if (s.id && s.college_id) studentCollegeMap.set(s.id, s.college_id);
    });

    const kAtt = studentAttendance.filter(a => {
      const cId = studentCollegeMap.get(a.studentId);
      return cId && campusIds.has(cId);
    });

    const totalPresent = kAtt.filter(a => {
      const st = (a.status || "").toLowerCase();
      return st === "present" || st === "od";
    }).length;

    const avgAttendance = kAtt.length > 0 ? Math.round((totalPresent / kAtt.length) * 100) : 88;

    const studentsByCollege = new Map<string, number>();
    students.forEach(s => {
      if (s.college_id) studentsByCollege.set(s.college_id, (studentsByCollege.get(s.college_id) || 0) + 1);
    });

    const mentorsByCollege = new Map<string, number>();
    mentors.forEach(m => {
      if (m.college_id) mentorsByCollege.set(m.college_id, (mentorsByCollege.get(m.college_id) || 0) + 1);
    });

    const campusesList = scopedColleges.map(c => {
      const totalStudents = studentsByCollege.get(c.id) || 0;
      const activeFaculty = mentorsByCollege.get(c.id) || 0;
      const attPct = avgAttendance;
      const openIssues = requests.filter(r => r.status === "pending" || r.status === "pending_cm" || r.status === "pending_cam").length;

      return {
        id: c.id,
        name: c.name,
        code: c.code || c.id,
        location: c.city || c.location || "Main Campus",
        totalStudents,
        activeFaculty,
        attendancePct: attPct,
        openIssues,
        healthScore: Math.min(100, Math.max(65, Math.round(attPct * 0.7 + (openIssues === 0 ? 30 : 15)))),
        cam: c.manager ? {
          id: c.id,
          name: c.manager || "Campus Manager",
          email: c.cam_email || "cam@faceprep.in",
          phone: "+91 98765 43210",
          status: "Active"
        } : null
      };
    });

    const kpis = {
      totalStudents: kStudents.length,
      avgAttendance,
      activeFaculty: kMentors.length,
      totalCampuses: scopedColleges.length,
      campusHealth: Math.round(campusesList.reduce((acc, c) => acc + c.healthScore, 0) / (campusesList.length || 1))
    };

    const riskStats = {
      healthy: Math.round(kStudents.length * 0.82),
      atRisk: Math.round(kStudents.length * 0.12),
      critical: Math.round(kStudents.length * 0.06),
      total: kStudents.length
    };

    return { kpis, campuses: campusesList, riskStats };
  }, [scopedColleges, students, mentors, studentAttendance, requests]);

  // Static 14-day trend for performance curves
  const trendData = useMemo(() => [
    { dateStr: "11 Aug", attendancePct: 84 },
    { dateStr: "12 Aug", attendancePct: 86 },
    { dateStr: "13 Aug", attendancePct: 88 },
    { dateStr: "14 Aug", attendancePct: 85 },
    { dateStr: "17 Aug", attendancePct: 89 },
    { dateStr: "18 Aug", attendancePct: 91 },
    { dateStr: "19 Aug", attendancePct: 87 },
    { dateStr: "20 Aug", attendancePct: 88 },
    { dateStr: "21 Aug", attendancePct: 90 },
    { dateStr: "24 Aug", attendancePct: 92 },
    { dateStr: "25 Aug", attendancePct: 89 }
  ], []);

  // Filtered operational datasets for single campus inspection
  const collegeMentors = useMemo(() => {
    return mentors.filter(m => activeCollegeId === "all" || m.college_id === activeCollegeId);
  }, [mentors, activeCollegeId]);

  const collegeSlots = useMemo(() => {
    return slots.filter(s => activeCollegeId === "all" || s.college_id === activeCollegeId || (s as any).collegeId === activeCollegeId);
  }, [slots, activeCollegeId]);

  const collegeStudents = useMemo(() => {
    return students.filter(s => activeCollegeId === "all" || s.college_id === activeCollegeId);
  }, [students, activeCollegeId]);

  const collegeAttendance = useMemo(() => {
    if (activeCollegeId === "all") return studentAttendance;
    const campusStudentIds = new Set(collegeStudents.map(s => s.id));
    return studentAttendance.filter((a: any) => campusStudentIds.has(a.studentId) || a.collegeId === activeCollegeId);
  }, [studentAttendance, collegeStudents, activeCollegeId]);

  const filteredCourses = useMemo(() => {
    if (activeCollegeId === "all") return coursesList;
    return coursesList.filter((c: any) => !c.college_id || c.college_id === activeCollegeId || c.collegeId === activeCollegeId);
  }, [coursesList, activeCollegeId]);

  const filteredDepartments = useMemo(() => {
    if (activeCollegeId === "all") return departmentsList.length > 0 ? departmentsList : coursesList;
    const depts = departmentsList.filter((d: any) => !d.college_id || d.college_id === activeCollegeId || d.collegeId === activeCollegeId);
    return depts.length > 0 ? depts : filteredCourses;
  }, [departmentsList, coursesList, filteredCourses, activeCollegeId]);

  // Academic Tracker & Faculty allocations local filters
  const [facultySearch, setFacultySearch] = useState("");
  const [facultyDeptFilter, setFacultyDeptFilter] = useState("all");
  const facultyDepts = useMemo(() => {
    return Array.from(new Set(collegeMentors.map(m => m.department).filter(Boolean))) as string[];
  }, [collegeMentors]);

  const filteredFaculty = useMemo(() => {
    return collegeMentors.filter(m => {
      const matchesSearch = !facultySearch || m.name.toLowerCase().includes(facultySearch.toLowerCase()) || (m.email && m.email.toLowerCase().includes(facultySearch.toLowerCase()));
      const matchesDept = facultyDeptFilter === "all" || m.department === facultyDeptFilter;
      return matchesSearch && matchesDept;
    });
  }, [collegeMentors, facultySearch, facultyDeptFilter]);

  // Live Dynamic Fees & Collections Query for KAM
  const { data: feesData } = useQuery({
    queryKey: ["kam_fees_stats", activeCollegeId],
    queryFn: async () => {
      const json = await apiFetch<any>("/api/fees?role=fee_manager");
      return json?.success ? json : null;
    },
    staleTime: 60 * 1000,
  });

  const feeMetrics = useMemo(() => {
    if (!feesData?.fees || !Array.isArray(feesData.fees)) {
      return { realizationRate: 85, totalValue: 4500000, collected: 3825000, pending: 675000 };
    }
    const filtered = activeCollegeId === "all"
      ? feesData.fees
      : feesData.fees.filter((f: any) => f.college_id === activeCollegeId);
    const total = filtered.reduce((acc: number, f: any) => acc + (Number(f.amount) || 0), 0);
    const collected = filtered.reduce((acc: number, f: any) => acc + (Number(f.paid_amount) || 0), 0);
    const pending = Math.max(0, total - collected);
    const rate = total > 0 ? Math.round((collected / total) * 100) : 0;
    return { realizationRate: rate, totalValue: total, collected, pending };
  }, [feesData, activeCollegeId]);

  // Live Dynamic Campus Quality & Audits Query for KAM
  const { data: auditData } = useQuery({
    queryKey: ["kam_audit_stats", activeCollegeId],
    queryFn: async () => {
      const json = await apiFetch<any>("/api/audit/campus-audits");
      return json?.success && Array.isArray(json.audits) ? json.audits : [];
    },
    staleTime: 60 * 1000,
  });

  const auditMetrics = useMemo(() => {
    if (!auditData || auditData.length === 0) {
      return { complianceScore: 94.6, openTickets: 1, npsRating: 72 };
    }
    const filtered = activeCollegeId === "all"
      ? auditData
      : auditData.filter((a: any) => a.college_id === activeCollegeId);
    if (filtered.length === 0) {
      return { complianceScore: 95.0, openTickets: 0, npsRating: 75 };
    }
    const avgScore = Math.round(filtered.reduce((acc: number, a: any) => {
      const scores = [a.skill_score, a.coursework_score, a.attendance_score].filter((s: any) => typeof s === "number");
      const itemAvg = scores.length > 0 ? scores.reduce((s: number, v: number) => s + v, 0) / scores.length : 90;
      return acc + itemAvg;
    }, 0) / filtered.length);
    const openCount = filtered.filter((a: any) => a.overall_status !== "Completed" || a.peer_status === "Pending").length;
    return { complianceScore: avgScore, openTickets: openCount, npsRating: 70 + (avgScore > 90 ? 4 : 0) };
  }, [auditData, activeCollegeId]);

  // Timetable view state
  const [selectedCohortCourse, setSelectedCohortCourse] = useState<string>("Bsc CS");
  const [selectedCohortSem, setSelectedCohortSem] = useState<string>("Semester 5");

  useEffect(() => {
    if (filteredCourses.length > 0 && !filteredCourses.some(c => c.name === selectedCohortCourse)) {
      setSelectedCohortCourse(filteredCourses[0].name);
    }
  }, [filteredCourses, selectedCohortCourse]);

  const timetablePeriods = useMemo(() => {
    const distinctTimes = Array.from(new Set(collegeSlots.map(s => s.time).filter(Boolean)));
    if (distinctTimes.length > 0) return distinctTimes;
    if (timeSlots && timeSlots.length > 0) return timeSlots.map(t => typeof t === "string" ? t : (t as any).label || (t as any).time);
    return ["9.00 AM - 9.50 AM", "9.50 AM - 10.40 AM", "10.55 AM - 11.45 AM", "12.20 PM - 1.10 PM", "1.10 PM - 2.00 PM", "2.00 PM - 2.50 PM"];
  }, [collegeSlots, timeSlots]);

  return (
    <div className="flex-1 flex w-full relative min-h-0">
      {/* ── DESKTOP FLOATING SIDEBAR (Minimal 7-Pillar Executive Navigation) ── */}
      <aside
        className={`hidden md:flex shrink-0 flex-col justify-between sticky top-6 z-30 floating-sidebar transition-all duration-300 ${
          isCollapsed ? "w-20 p-2.5" : "w-[270px] p-3.5"
        }`}
      >
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Sidebar Nav Items */}
          <nav className={`py-1 space-y-1.5 overflow-y-auto max-h-[calc(100dvh-11rem)] custom-scrollbar ${isCollapsed ? "px-0.5" : "px-1.5"}`}>
            {KAM_PILLARS.map(pillar => {
              const Icon = pillar.icon;
              const isPillarActive = currentPillar.id === pillar.id;
              const pendingCount = getPillarPendingCount(pillar.id);

              return (
                <button
                  key={pillar.id}
                  type="button"
                  onClick={() => {
                    const targetTab = pillar.subTabs?.some(s => s.id === activeTab)
                      ? activeTab
                      : pillar.defaultTab;
                    setActiveTab(targetTab);
                  }}
                  className={`sidebar-group-btn w-full flex items-center rounded-xl transition-all duration-200 cursor-pointer ${
                    isCollapsed ? "justify-center px-0 py-3" : "justify-between px-3 py-2.5 text-left"
                  } ${
                    isPillarActive
                      ? "bg-zinc-900 text-white ring-1 ring-inset ring-zinc-800 font-extrabold shadow-sm dark:bg-zinc-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 font-bold ring-1 ring-inset ring-transparent"
                  }`}
                  title={isCollapsed ? pillar.label : undefined}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                        isPillarActive
                          ? "text-amber-400"
                          : "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                      }`}
                    />
                    {!isCollapsed && (
                      <div className="min-w-0">
                        <span className="block text-xs font-extrabold tracking-tight leading-tight truncate">
                          {pillar.label}
                        </span>
                      </div>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {pendingCount > 0 && (
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shadow-xs ${
                            isPillarActive ? "bg-amber-500 text-zinc-950 font-black" : "bg-rose-500 text-white"
                          }`}
                        >
                          {pendingCount}
                        </span>
                      )}
                      {pillar.subTabs && pillar.subTabs.length > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                          {pillar.subTabs.length}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Card: Need Help? Contact Support -> (Opens Report Issue / Feedback popup) */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-2 shrink-0 flex flex-col items-center">
          {!isCollapsed && (
            <div
              onClick={() => typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("open-feedback-modal"))}
              className="w-full relative overflow-hidden rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 p-3.5 border border-zinc-200/80 dark:border-zinc-800 mb-2 shrink-0 text-left cursor-pointer hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80 transition-colors group"
            >
              <div className="text-[11px] font-bold text-zinc-900 dark:text-white">Need Help?</div>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("open-feedback-modal"));
                  }
                }}
                className="mt-1 text-xs font-extrabold text-amber-600 dark:text-amber-400 group-hover:underline flex items-center gap-1 cursor-pointer transition-colors"
              >
                Contact Support <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            </div>
          )}

          {/* Toggle Sidebar Collapse */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer text-xs font-bold gap-2"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`} />
            {!isCollapsed && <span>Collapse Sidebar</span>}
          </button>
        </div>
      </aside>

      {/* ── MOBILE BOTTOM NAVIGATION (Minimal 5 Destinations) ── */}
      <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800">
        <div className="flex w-full items-stretch justify-around px-1">
          {kamMobileNavTabs.map(t => {
            const Icon = t.icon;
            const isActive = t.id === "more_menu"
              ? !kamMobileNavTabs.some(k => k.id !== "more_menu" && k.id === activeTab)
              : activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-colors cursor-pointer ${
                  isActive ? "text-zinc-950 dark:text-white" : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <Icon className={`h-5 w-5 transition-transform ${isActive ? "scale-110 text-amber-500 dark:text-amber-400" : ""}`} />
                <span className={`text-[10px] font-bold leading-none tracking-tight ${isActive ? "text-zinc-950 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                  {t.label}
                </span>
                {isActive && <span className="absolute top-1 inset-x-3 h-1 rounded-full bg-amber-500" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── MAIN WORKSPACE CONTENT ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden overflow-y-auto h-full pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-12 scroll-touch">
        <div className="p-6 space-y-6 flex-1 min-w-0 max-w-full">
          {/* ── MOBILE SUB-PAGE BREADCRUMB HEADER ── */}
          {activeTab !== "overview" && activeTab !== "more_menu" && (
            <div className="md:hidden flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab("more_menu")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>All Tools</span>
              </button>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                {currentPillar.label}
              </span>
            </div>
          )}

          {/* ── IN-PAGE HORIZONTAL SUB-TAB BAR (Inside Multi-Facet Pillars) ── */}
          {activeTab !== "more_menu" && currentPillar.subTabs && currentPillar.subTabs.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar border-b border-slate-200/80 dark:border-slate-800">
              {currentPillar.subTabs.map(subTab => {
                const SubIcon = subTab.icon;
                const isSubActive =
                  activeTab === subTab.id ||
                  (subTab.id === "students" && activeTab === "students_list");
                return (
                  <button
                    key={subTab.id}
                    type="button"
                    onClick={() => setActiveTab(subTab.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      isSubActive
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm font-extrabold ring-1 ring-zinc-800 dark:ring-zinc-200"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {SubIcon && (
                      <SubIcon
                        className={`h-3.5 w-3.5 ${
                          isSubActive
                            ? "text-amber-400 dark:text-amber-500"
                            : "text-slate-400"
                        }`}
                      />
                    )}
                    <span>{subTab.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── MOBILE TAB: MORE MENU (Full Mobile Portal & Tools Grid) ── */}
          {activeTab === "more_menu" && (
            <div className="space-y-4 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-card">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 border border-amber-200/60 dark:border-amber-800/60">
                    <Menu className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      All Tools & Portals
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Select any academic, faculty, timetable or audit module
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {kamMoreModules.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveTab(t.id)}
                      className="min-h-[5.5rem] p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-left hover:border-amber-500 hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-900 active:scale-[0.98] transition-all flex flex-col justify-between shadow-card cursor-pointer group"
                    >
                      <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 border border-amber-200/60 dark:border-amber-800/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 mt-3">
                        <span className="block text-xs font-bold text-slate-900 dark:text-white leading-tight">
                          {t.label}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-medium leading-snug mt-1 line-clamp-2">
                          {t.hint}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: DASHBOARD / OVERVIEW
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-zinc-950 font-black text-sm shadow-xs">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      Executive Portfolio Dashboard
                    </h2>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Multi-campus health metrics, attendance SLA & live performance curves
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Campus:</label>
                  <select
                    aria-label="Filter Campus Scope"
                    value={activeCollegeId}
                    onChange={e => setActiveCollegeId(e.target.value)}
                    className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                    {scopedColleges.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {activeCollegeId === "all" ? (
                <KAMOverview
                  kpis={kamMetrics.kpis}
                  campuses={kamMetrics.campuses}
                  trendData={trendData}
                  riskStats={kamMetrics.riskStats}
                  onSelectCampus={cId => setActiveCollegeId(cId)}
                  onNavigateTab={t => setActiveTab(t)}
                />
              ) : (
                <KAMCampusSnapshot
                  college={activeCollege || null}
                  totalStudents={collegeStudents.length}
                  avgAttendance={kamMetrics.kpis.avgAttendance}
                  activeFaculty={collegeMentors.length}
                  healthScore={activeCollege ? Math.min(100, Math.max(70, Math.round(kamMetrics.kpis.avgAttendance * 0.7 + 25))) : 92}
                  onBackToPortfolio={() => setActiveCollegeId("all")}
                  onNavigateTab={t => setActiveTab(t)}
                />
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 2: CAMPUS INSIGHTS (REPORTS) - EXECUTIVE INFOGRAPHICS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "reports" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <KAMAnalytics
                campuses={kamMetrics.campuses}
                trendData={trendData}
                kpis={kamMetrics.kpis}
                onSelectCampus={cId => setActiveCollegeId(cId)}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 3: ACADEMIC DELIVERY (ACADEMICS) - FULL TRANSPARENCY
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "academic_tracker" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <KAMAcademicTrackerView
                collegeId={activeCollegeId}
                allowedColleges={scopedColleges.map(c => ({ id: c.id, name: c.name }))}
                onCollegeChange={setActiveCollegeId}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: EXAMS & MARKS (READ-ONLY AUDIT STUDIO)
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "exams_and_marks" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <KAMExamsView
                scopedColleges={scopedColleges}
                collegeId={activeCollegeId}
                onCollegeChange={setActiveCollegeId}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: FACULTY DEPLOYMENT & MENTOR ALLOCATION
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "faculty" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <KAMFacultyInfographics
                activeFacultyCount={collegeMentors.length}
                openSwapsCount={requests.filter(r => r.status === "pending" || r.status === "pending_cm").length}
                weeklyPlanSubmissionRate={96.4}
                deployedDepartmentsCount={facultyDepts.length || 8}
              />

              {/* Read-Only Faculty Allocation Workspace */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Mentor Subject Allocation</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search mentor..."
                        value={facultySearch}
                        onChange={e => setFacultySearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none w-44"
                      />
                    </div>
                    <select
                      value={facultyDeptFilter}
                      onChange={e => setFacultyDeptFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Departments</option>
                      {facultyDepts.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                        <th className="py-3 px-3">Mentor Name</th>
                        <th className="py-3 px-3">Department</th>
                        <th className="py-3 px-3">Contact</th>
                        <th className="py-3 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredFaculty.slice(0, 15).map(m => (
                        <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-zinc-900 text-white text-[10px] font-bold flex items-center justify-center">
                              {m.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span>{m.name}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{m.department || "General"}</td>
                          <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{m.email || "mentor@faceprep.in"}</td>
                          <td className="py-3 px-3 text-right">
                            <Badge variant="success">Active</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 6: CLASS SWAPS & HANDOVERS (Clean Operational)
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "handovers" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <CMApprovalsHub
                collegeId={activeCollegeId}
                onCollegeChange={setActiveCollegeId}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 6B: FACULTY BIOMETRIC ATTENDANCE & PUNCH LOGS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "mentor_attendance" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <KAMMentorAttendanceView
                collegeId={activeCollegeId}
                scopedColleges={scopedColleges}
                onCollegeChange={setActiveCollegeId}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 7: WEEKLY PLAN
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "faculty_weekly_plan" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <WeeklyPlanViewer
                collegeId={activeCollegeId}
                collegeName={activeCollegeName}
                role="kam"
                reviewerName={currentKAM?.name || "Key Account Manager"}
                allowedCollegeIds={assignedCollegeIds}
                allColleges={scopedColleges.map(c => ({ id: c.id, name: c.name }))}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 8: MENTOR SKILL DEV TRACKER
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "mentor_skill_tracker" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <SkillReportPanel collegeId={activeCollegeId} collegeName={activeCollegeName} />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 9: DEMO SCHEDULE
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "demo_schedule" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <LndAllocationDashboard />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 10: TIMETABLE & ROOMS (Clean Full-Width Matrix)
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "timetable" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Institutional Timetable Matrix</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Live schedule inspection for {activeCollegeName} (Read-Only)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={selectedCohortCourse}
                      onChange={e => setSelectedCohortCourse(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      {filteredCourses.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={selectedCohortSem}
                      onChange={e => setSelectedCohortSem(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      {ALL_SEMESTERS.slice(0, 4).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Timetable Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[10px]">
                        <th className="p-3 border border-slate-200 dark:border-slate-700">Day / Order</th>
                        {timetablePeriods.map((periodStr, idx) => (
                          <th key={idx} className="p-3 border border-slate-200 dark:border-slate-700 font-bold whitespace-nowrap">
                            {periodStr}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(daysOfWeek && daysOfWeek.length > 0 ? daysOfWeek : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]).map((day: string) => (
                        <tr key={day} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
                            {day}
                          </td>
                          {timetablePeriods.map((periodStr, colIdx) => {
                            const matchingSlot = collegeSlots.find(s => s.day === day && s.time === periodStr);
                            const slotMentorId = matchingSlot ? (matchingSlot.mentorId || (matchingSlot as any).mentorid) : null;
                            const slotMentor = slotMentorId ? mentors.find(m => m.id === slotMentorId) : null;
                            return (
                              <td key={colIdx} className="p-2 border border-slate-200 dark:border-slate-700 min-w-[140px]">
                                {matchingSlot ? (
                                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-left">
                                    <div className="font-extrabold text-amber-900 dark:text-amber-300 text-[11px] truncate">
                                      {(matchingSlot as any).subject || matchingSlot.course || "Subject"}
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                      {matchingSlot.location || "Room"} • {slotMentor?.name || "Assigned Faculty"}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-300 dark:text-slate-600 font-semibold">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 11: ATTENDANCE MONITORING
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "monitoring" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Attendance Logs & Session Monitoring</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Real-time attendance ledger for {activeCollegeName} (Read-Only)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <Badge variant="outline" className="text-xs font-bold">
                      Supervised Attendance: {kamMetrics.kpis.avgAttendance}%
                    </Badge>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Class Group</th>
                        <th className="py-3 px-3">Subject</th>
                        <th className="py-3 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {(collegeAttendance || []).slice(0, 15).map((a: any, idx) => (
                        <tr key={a.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{a.date || "Today"}</td>
                          <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{a.classGroup || "CS-Batch A"}</td>
                          <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{a.subject || "Full Stack Development"}</td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant={a.status === "present" || a.status === "Present" ? "success" : "destructive"}>
                              {a.status || "Present"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 12: INTERVIEWS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "interviews" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <InterviewModule
                defaultCollegeId={activeCollegeId === "all" ? undefined : activeCollegeId}
                currentUserRole="kam"
                currentUserName={currentKAM?.name || "Key Account Manager"}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 13: STUDENTS DATA / REGISTRY (NO MODAL, PURE TABLE ALONE)
              ══════════════════════════════════════════════════════════════════ */}
          {(activeTab === "students_list" || activeTab === "students") && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <StudentsRegistryTable
                initialCollegeId={activeCollegeId}
                kamId={currentKAM?.id}
                onCollegeChange={setActiveCollegeId}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 14: SKILL DEVELOPMENT TRACKER
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "tracker" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <SkillTrackerPanel
                role="kam"
                collegeId={activeCollegeId}
                collegeName={activeCollegeName}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 15: STUDENT PROFILE EDIT REQUESTS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "profile_edits" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Student Profile Edit Requests</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Institutional review queue for {activeCollegeName} (Read-Only for KAM)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <Badge variant="outline">0 Pending Escalations</Badge>
                  </div>
                </div>
                <div className="p-8 text-center text-slate-400 text-xs font-semibold">
                  All student profile edit requests are actively resolved by assigned Campus Managers.
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 16: FEE COLLECTION - EXECUTIVE INFOGRAPHICS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "fees" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Fee Realization & Institutional Standing</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Contract milestone tracking & collections for {activeCollegeName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Campus:</label>
                  <select
                    aria-label="Filter Campus Scope"
                    value={activeCollegeId}
                    onChange={e => setActiveCollegeId(e.target.value)}
                    className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                    {scopedColleges.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Important Executive Infographics Banner for Financials */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fee Realization Rate</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{feeMetrics.realizationRate}%</div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, feeMetrics.realizationRate))}%` }} />
                  </div>
                  <span className="text-[11px] text-emerald-600 font-bold mt-1.5 inline-block">High Institutional Health</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Contract Value</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">₹ {feeMetrics.totalValue.toLocaleString("en-IN")}</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Active Institutional Portfolios</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collected vs Outstanding</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">₹ {feeMetrics.collected.toLocaleString("en-IN")}</div>
                  <span className="text-[11px] text-amber-600 font-bold mt-1 inline-block">₹ {feeMetrics.pending.toLocaleString("en-IN")} Outstanding Milestone</span>
                </div>
              </div>

              <FeeManagerDashboard readOnly={true} collegeId={activeCollegeId} />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 17: CAMPUS E-AUDIT - EXECUTIVE INFOGRAPHICS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "audit" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Institutional Quality & Compliance Audit</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Campus audit scores, tickets & NPS tracking for {activeCollegeName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Campus:</label>
                  <select
                    aria-label="Filter Campus Scope"
                    value={activeCollegeId}
                    onChange={e => setActiveCollegeId(e.target.value)}
                    className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                    {scopedColleges.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Important Executive Infographics Banner for Institutional Compliance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Institutional Compliance Score</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{auditMetrics.complianceScore}%</div>
                  <span className="text-[11px] text-emerald-600 font-bold mt-1 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Grade A Institutional Partner
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Campus NPS Rating</span>
                  <div className="text-2xl font-black text-amber-500 mt-1">+{auditMetrics.npsRating} NPS</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Direct Student & Faculty Feedback</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Open Audit Tickets</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{auditMetrics.openTickets} Open</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Institutional Quality Actions</span>
                </div>
              </div>

              <CampusAuditManager
                collegeId={activeCollegeId === "all" ? undefined : activeCollegeId}
                collegeName={activeCollegeName}
                role="kam"
                userName={currentKAM?.name || "Key Account Manager"}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 18: ACADEMIC CONFIGURATION (Clean Form Inspection)
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "config" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Academic Configurations & Shifts</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Active day orders, periods, and departments for {activeCollegeName} (Read-Only)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Campus:</label>
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Academic Years</span>
                    <div className="space-y-1.5">
                      {(academicYears || ["2026-2027", "2027-2028"]).map((y: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700">
                          {typeof y === "string" ? y : y.year || y.name || "Academic Year"}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Configured Departments</span>
                    <div className="space-y-1.5">
                      {filteredDepartments.map((d: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700">
                          {d.name || d.department || "Core Department"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 19: CURRICULUM / BATCHES
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "curriculum" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Curriculum Batches & Section Structure</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Program cohorts, degrees and section breakdown for {activeCollegeName} (Read-Only)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Campus:</label>
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {filteredCourses.map((c, idx) => (
                    <div key={c.id || idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 space-y-2">
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.years || 4} Years Curriculum • {c.code || "Core"}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 20: EVENTS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "events" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Institutional Events & Calendar</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Network-wide workshops, bootcamps, and placement drives for {activeCollegeName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Campus:</label>
                    <select
                      aria-label="Filter Campus"
                      value={activeCollegeId}
                      onChange={e => setActiveCollegeId(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      <option value="all">All Supervised Campuses ({scopedColleges.length})</option>
                      {scopedColleges.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-extrabold text-amber-900 dark:text-amber-300">Annual Campus Placement Drive 2026</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Multi-campus placement interview series for Final Year students</div>
                    </div>
                    <Badge variant="warning">Upcoming</Badge>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">Faculty Orientation & Pedagogy Workshop</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">L&D mentor alignment session</div>
                    </div>
                    <Badge variant="outline">Scheduled</Badge>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 21: MY PROFILE
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "profile" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                  <div className="w-16 h-16 rounded-2xl bg-zinc-900 text-amber-400 font-black text-xl flex items-center justify-center shadow-md">
                    {(currentKAM?.name || "KAM").substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      {currentKAM?.name || "Key Account Manager"}
                    </h3>
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      Key Account Manager (KAM) • Institutional Portfolio
                    </p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {currentKAM?.email || "kam@faceprep.in"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Supervised Institutions</span>
                    <div className="text-xl font-black text-slate-900 dark:text-white">
                      {scopedColleges.length} Campuses
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Enrolled Students</span>
                    <div className="text-xl font-black text-slate-900 dark:text-white">
                      {kamMetrics.kpis.totalStudents} Students
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Security Access Level</span>
                    <div className="text-xl font-black text-amber-500">
                      Portfolio Read-Only
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
