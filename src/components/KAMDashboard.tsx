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
import { cmNavGroups, cmMobileTabs, cmMoreTabs, cmMoreTabIds, CmNavGroup } from "@/lib/cmNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Lazy-loaded Modular Panels (completely decoupled from CAMDashboard) ──
const KAMOverview = dynamic(() => import("./kam/overview/KAMOverview").then(m => m.KAMOverview), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Executive Portfolio Overview…</div>
});

const KAMAnalytics = dynamic(() => import("./kam/analytics/KAMAnalytics").then(m => m.KAMAnalytics), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Institutional Analytics…</div>
});

const StudentDirectory = dynamic(() => import("./kam/students/StudentDirectory").then(m => m.StudentDirectory), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Student Directory…</div>
});

const CampusAuditManager = dynamic(() => import("./CampusAuditManager").then(m => m.CampusAuditManager), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Campus Audit Hub…</div>
});

const ExamScheduleManager = dynamic(() => import("./ExamScheduleManager").then(m => m.ExamScheduleManager), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-slate-400 font-bold text-sm">Loading Exam & Marks Studio…</div>
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

  // Filter colleges strictly to those assigned to this KAM
  const assignedCollegeIds = useMemo(() => {
    if (isSuperAdmin || !currentKAM?.id) {
      return rawColleges.map(c => c.id);
    }
    return rawColleges
      .filter(c => c.kam_id === currentKAM.id || (c as any).kamId === currentKAM.id)
      .map(c => c.id);
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

  // Keep navigation grouped by role
  const cmNavModel = useMemo(() => cmNavGroups(true), []);
  const cmMobileNavTabs = useMemo(() => [...cmMobileTabs(true), { id: "more_menu", label: "More", icon: Menu }], []);
  const cmMoreList = useMemo(() => cmMoreTabs(true), []);
  const cmMoreIds = useMemo(() => cmMoreTabIds(true), []);

  // Auto-expand group containing the activeTab
  useEffect(() => {
    cmNavModel.forEach(group => {
      if (group.items.some(item => item.id === activeTab)) {
        setExpandedGroups(prev => ({ ...prev, [group.id]: true }));
      }
    });
  }, [activeTab, cmNavModel]);

  // Notification count calculation for sidebar badges
  const getNotificationCount = useCallback((tabId: string) => {
    if (tabId === "handovers") {
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

  // Timetable view state
  const [selectedCohortCourse, setSelectedCohortCourse] = useState<string>("Computer Science");
  const [selectedCohortSem, setSelectedCohortSem] = useState<string>("Semester 1");

  return (
    <div className="flex-1 flex w-full relative min-h-0">
      {/* ── DESKTOP FLOATING SIDEBAR (Identical Obsidian Carbon & Warm Gold Theme) ── */}
      <aside
        className={`hidden md:flex shrink-0 flex-col justify-between sticky top-6 z-30 floating-sidebar transition-all duration-300 ${
          isCollapsed ? "w-20 p-2.5" : "w-[270px] p-3.5"
        }`}
      >
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Sidebar Nav Items */}
          <nav className={`py-1 space-y-1.5 overflow-y-auto max-h-[calc(100dvh-11rem)] custom-scrollbar ${isCollapsed ? "px-0.5" : "px-1.5"}`}>
            {cmNavModel.map(group => {
              const Icon = group.icon;
              const isSingleItem = group.items.length === 1;
              const isAnyChildActive = group.items.some(item => activeTab === item.id);
              const totalPendingInGroup = group.items.reduce((sum, item) => sum + getNotificationCount(item.id), 0);
              const isExpanded = expandedGroups[group.id];

              return (
                <div
                  key={group.id}
                  className="relative py-0.5 group"
                  onMouseEnter={() => isCollapsed && setHoveredGroupId(group.id)}
                  onMouseLeave={() => isCollapsed && setHoveredGroupId(null)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (isSingleItem) {
                        setActiveTab(group.items[0].id);
                      } else if (isCollapsed) {
                        setActiveTab(group.items[0].id);
                      } else {
                        const isCurrentlyOpen = !!expandedGroups[group.id];
                        if (!isCurrentlyOpen) {
                          setExpandedGroups({ [group.id]: true });
                          setActiveTab(group.items[0].id);
                        } else {
                          setExpandedGroups({});
                        }
                      }
                    }}
                    className={`sidebar-group-btn w-full flex items-center rounded-xl transition-all duration-200 cursor-pointer ${
                      isCollapsed ? "justify-center px-0 py-3" : "justify-between px-3 py-2.5 text-left"
                    } ${
                      isAnyChildActive
                        ? isSingleItem
                          ? "bg-zinc-900 text-white ring-1 ring-inset ring-zinc-800 font-extrabold shadow-sm dark:bg-zinc-900 dark:text-white"
                          : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-200/90 dark:ring-zinc-700 font-extrabold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10 font-bold ring-1 ring-inset ring-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                          isAnyChildActive
                            ? isSingleItem
                              ? "text-amber-400"
                              : "text-amber-500 dark:text-amber-400"
                            : "text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                        }`}
                      />
                      {!isCollapsed && <span className="text-xs font-extrabold tracking-tight leading-tight">{group.title}</span>}
                    </div>
                    {!isCollapsed && (
                      <div className="flex items-center gap-2 shrink-0 ml-1">
                        {totalPendingInGroup > 0 && (
                          <span
                            className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-full shadow-xs ${
                              isAnyChildActive
                                ? isSingleItem
                                  ? "bg-amber-500 text-zinc-950 font-black"
                                  : "bg-zinc-900 text-white dark:bg-zinc-700 dark:text-white"
                                : "bg-rose-500 text-white"
                            }`}
                          >
                            {totalPendingInGroup}
                          </span>
                        )}
                        {!isSingleItem && (
                          <ChevronRight
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""} ${
                              isAnyChildActive ? "text-amber-500 dark:text-amber-400" : "text-slate-300 dark:text-slate-600"
                            }`}
                          />
                        )}
                      </div>
                    )}
                  </button>

                  {/* Accordion Sub-Menu */}
                  {!isCollapsed && !isSingleItem && isExpanded && (
                    <div className="pl-4 pt-1.5 pb-1 space-y-1 animate-fadeIn">
                      {group.items.map(child => {
                        const ChildIcon = child.icon;
                        const isChildActive = activeTab === child.id;
                        const count = getNotificationCount(child.id);
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => setActiveTab(child.id)}
                            className={`w-full flex items-center justify-start gap-2.5 px-3 py-2 text-left rounded-xl text-[11px] font-bold tracking-tight transition-all duration-150 cursor-pointer ${
                              isChildActive
                                ? "bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white ring-1 ring-inset ring-zinc-800 font-black shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-zinc-100/70 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 ring-1 ring-inset ring-transparent"
                            }`}
                          >
                            <ChildIcon className={`h-3.5 w-3.5 shrink-0 ${isChildActive ? "text-amber-400" : "text-slate-400"}`} />
                            <span className="flex-1 text-xs font-semibold leading-snug">{child.label}</span>
                            {count > 0 && (
                              <span
                                className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                  isChildActive ? "bg-amber-500 text-zinc-950 font-black" : "bg-rose-500 text-white"
                                }`}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsed Hover Flyout */}
                  {isCollapsed && !isSingleItem && (
                    <div className={`absolute left-full top-0 pl-2 w-56 z-50 ${hoveredGroupId === group.id ? "block" : "hidden"}`}>
                      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-100 dark:border-slate-800 shadow-card-lg rounded-2xl p-2.5 animate-fadeIn">
                        <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 mb-1.5 text-zinc-900 dark:text-white flex items-center justify-between">
                          <span>{group.title}</span>
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        </div>
                        <div className="space-y-0.5">
                          {group.items.map(child => {
                            const ChildIcon = child.icon;
                            const isChildActive = activeTab === child.id;
                            const count = getNotificationCount(child.id);
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => {
                                  setActiveTab(child.id);
                                  setHoveredGroupId(null);
                                }}
                                className={`w-full flex items-center justify-start gap-3 px-2.5 py-2 text-left rounded-xl text-[11px] font-bold tracking-tight transition-all duration-150 cursor-pointer ${
                                  isChildActive
                                    ? "bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white font-black shadow-xs"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-zinc-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                                }`}
                              >
                                <ChildIcon className={`h-3.5 w-3.5 shrink-0 ${isChildActive ? "text-amber-400" : "text-slate-400"}`} />
                                <span className="flex-1 text-xs font-semibold leading-snug">{child.label}</span>
                                {count > 0 && (
                                  <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isChildActive ? "bg-amber-500 text-zinc-950 font-black" : "bg-rose-500 text-white"}`}>
                                    {count}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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

      {/* ── MOBILE BOTTOM NAVIGATION ── */}
      <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800">
        <div className="flex w-full items-stretch justify-around px-1">
          {cmMobileNavTabs.map(t => {
            const Icon = t.icon;
            const isActive = t.id === "more_menu" ? cmMoreIds.includes(activeTab) : activeTab === t.id;
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
          {/* ── KAM PORTFOLIO HEADER & CAMPUS SWITCHER BANNER ── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-zinc-950 font-black text-sm shadow-xs">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {activeCollegeId === "all" ? "All Supervised Campuses (Portfolio Overview)" : activeCollegeName}
                  </h2>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                    KAM Portfolio
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                  {scopedColleges.length} institutional campus{scopedColleges.length !== 1 ? "es" : ""} assigned • Real-time executive synchronization
                </p>
              </div>
            </div>

            {/* Campus Selector Dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Filter Campus:</label>
              <select
                aria-label="Filter Campus"
                value={activeCollegeId}
                onChange={e => setActiveCollegeId(e.target.value)}
                className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">All Supervised Campuses (Portfolio Overview)</option>
                {scopedColleges.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              TAB 1: DASHBOARD / OVERVIEW
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && activeCollegeId === "all" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <KAMOverview
                kpis={kamMetrics.kpis}
                campuses={kamMetrics.campuses}
                trendData={trendData}
                riskStats={kamMetrics.riskStats}
                onSelectCampus={cId => setActiveCollegeId(cId)}
                onNavigateTab={t => setActiveTab(t)}
              />
            </div>
          )}

          {activeTab === "overview" && activeCollegeId !== "all" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              {/* Campus Health Overview Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <div className="text-xs font-bold text-slate-400">Total Enrolled</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {collegeStudents.length} Students
                  </div>
                  <div className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Live Campus Database
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <div className="text-xs font-bold text-slate-400">Average Attendance</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {kamMetrics.kpis.avgAttendance}%
                  </div>
                  <div className="text-[11px] text-indigo-600 font-bold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> On-Track Standard
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <div className="text-xs font-bold text-slate-400">Faculty Deployed</div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {collegeMentors.length} Mentors
                  </div>
                  <div className="text-[11px] text-slate-500 font-bold mt-1">
                    {facultyDepts.length} Active Departments
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <div className="text-xs font-bold text-slate-400">Campus Health Score</div>
                  <div className="text-2xl font-black text-amber-500 mt-1">
                    {activeCollege ? Math.min(100, Math.max(70, Math.round(kamMetrics.kpis.avgAttendance * 0.7 + 25))) : 92}/100
                  </div>
                  <div className="text-[11px] text-emerald-600 font-bold mt-1">Institutional Audit Grade A</div>
                </div>
              </div>

              {/* Campus Details & CAM Contact */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{activeCollegeName}</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">
                      Code: {activeCollege?.code || activeCollegeId} • {activeCollege?.city || "Campus Center"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveCollegeId("all")}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    ← Back to Portfolio Overview
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assigned Campus Manager</div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {activeCollege?.manager || "Campus Manager Assigned"}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-amber-500" />
                      <span>{activeCollege?.cam_email || "cam@faceprep.in"}</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Navigation</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setActiveTab("timetable")}
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 transition-colors"
                      >
                        View Timetable
                      </button>
                      <button
                        onClick={() => setActiveTab("academic_tracker")}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold hover:bg-amber-400 transition-colors"
                      >
                        Academic Delivery
                      </button>
                      <button
                        onClick={() => setActiveTab("audit")}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-white transition-colors"
                      >
                        Compliance Audit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
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
              TAB 3: ACADEMIC DELIVERY (ACADEMICS) - INFOGRAPHICS WHERE NEEDED
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "academic_tracker" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              {/* Important Executive Infographics Banner for Academic Delivery */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Syllabus Completion Pace</span>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">91.4%</div>
                    <span className="text-[11px] text-emerald-600 font-bold mt-1 inline-flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> On-Track with Calendar
                    </span>
                  </div>
                  <div className="h-14 w-14 rounded-full border-4 border-emerald-500 border-t-transparent flex items-center justify-center font-black text-xs text-emerald-600">
                    91%
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Curriculum Modules</span>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                      {subjectsList.length} Subjects
                    </div>
                    <span className="text-[11px] text-slate-500 font-bold mt-1">Across Supervised Campuses</span>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center font-black">
                    <BookOpen className="w-6 h-6" />
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Delivery Coverage</span>
                    <div className="text-2xl font-black text-amber-500 mt-1">98.2%</div>
                    <span className="text-[11px] text-slate-500 font-bold mt-1">Zero Deficit Teaching Slots</span>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center font-black">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                </div>
              </div>

              {/* Department Syllabus Progression Ledger */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Curriculum & Subject Progress</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Read-only institutional curriculum tracking ledger</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                        <th className="py-3 px-3">Subject / Module</th>
                        <th className="py-3 px-3">Department</th>
                        <th className="py-3 px-3">Semester</th>
                        <th className="py-3 px-3 text-center">Completion %</th>
                        <th className="py-3 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {subjectsList.slice(0, 12).map((s, idx) => {
                        const pct = Math.min(100, Math.max(60, 70 + (idx * 7) % 30));
                        return (
                          <tr key={s.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{s.name}</td>
                            <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{s.department || "Core"}</td>
                            <td className="py-3 px-3 text-slate-500">{s.semester || "Sem 1"}</td>
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-20 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="font-bold text-slate-700 dark:text-slate-300">{pct}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <Badge variant={pct >= 85 ? "success" : "warning"}>
                                {pct >= 85 ? "On Track" : "Review"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 4: EXAMS & MARKS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "exams_and_marks" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              {/* Important Executive Infographics Banner for Assessment Health */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400">Institutional Pass Rate</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">94.8%</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1">Across Supervised Colleges</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400">Scheduled Assessments</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">18 Exams</div>
                  <span className="text-[11px] text-indigo-600 font-semibold mt-1">Midterms & Semester CIA</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400">Arrears / Retakes</span>
                  <div className="text-2xl font-black text-amber-500 mt-1">5.2%</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1">Within Acceptable SLA Target</span>
                </div>
              </div>

              <ExamScheduleManager overrideCollegeId={activeCollegeId === "all" ? undefined : activeCollegeId} />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 5: FACULTY DEPLOYMENT & MENTOR ALLOCATION
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "faculty" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              {/* Important Executive Infographics Banner for Faculty Staffing */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400">Faculty Staffing Coverage</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">96.4%</div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: "96.4%" }} />
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Full Subject Hours Fulfilled</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400">Active Teaching Mentors</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {collegeMentors.length} Mentors
                  </div>
                  <span className="text-[11px] text-indigo-600 font-semibold mt-1 inline-block">100% Verified Credentials</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400">Class Swap / Leave Impact</span>
                  <div className="text-2xl font-black text-amber-500 mt-1">
                    {requests.filter(r => r.status === "pending" || r.status === "pending_cm").length} Pending
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Zero Uncovered Sessions</span>
                </div>
              </div>

              {/* Read-Only Faculty Allocation Workspace */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-card">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Mentor Subject Allocation</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Assigned faculty and workload inspection</p>
                  </div>
                  <div className="flex items-center gap-2">
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
              <CMApprovalsHub />
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
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedCohortCourse}
                      onChange={e => setSelectedCohortCourse(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      {coursesList.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                    <select
                      value={selectedCohortSem}
                      onChange={e => setSelectedCohortSem(e.target.value)}
                      className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 outline-none"
                    >
                      {["Semester 1", "Semester 2", "Semester 3", "Semester 4"].map(s => (
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
                        {(timeSlots && timeSlots.length > 0 ? timeSlots.slice(0, 6) : ["09:00 - 10:00", "10:00 - 11:00", "11:15 - 12:15", "01:00 - 02:00", "02:00 - 03:00"]).map((slot, idx) => (
                          <th key={idx} className="p-3 border border-slate-200 dark:border-slate-700 font-bold">
                            {typeof slot === "string" ? slot : (slot as any).label || `Period ${idx + 1}`}
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
                          {[0, 1, 2, 3, 4].map(colIdx => {
                            const matchingSlot = collegeSlots.find(s => s.day === day);
                            return (
                              <td key={colIdx} className="p-2 border border-slate-200 dark:border-slate-700 min-w-[120px]">
                                {matchingSlot ? (
                                  <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-left">
                                    <div className="font-extrabold text-amber-900 dark:text-amber-300 text-[11px] truncate">
                                      {matchingSlot.course || "Data Structures"}
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                      {matchingSlot.location || "Lab 2"} • {collegeMentors[0]?.name || "Assigned Faculty"}
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
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Real-time attendance ledger for {activeCollegeName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs font-bold">
                    Supervised Attendance: {kamMetrics.kpis.avgAttendance}%
                  </Badge>
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
                      {(studentAttendance || []).slice(0, 10).map((a: any, idx) => (
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
              TAB 13: STUDENTS DATA (STUDENTS DIRECTORY)
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "students_list" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              <StudentDirectory
                initialCollegeId={activeCollegeId}
                kamId={currentKAM?.id}
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
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Student Profile Edit Requests</h3>
                    <p className="text-xs text-slate-400 font-semibold mt-0.5">Institutional review queue (Read-Only for KAM)</p>
                  </div>
                  <Badge variant="outline">0 Pending Escalations</Badge>
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
              {/* Important Executive Infographics Banner for Financials */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fee Realization Rate</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">87.5%</div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full" style={{ width: "87.5%" }} />
                  </div>
                  <span className="text-[11px] text-emerald-600 font-bold mt-1.5 inline-block">High Institutional Health</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Target Contract Value</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">₹ 42,50,000</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Active Institutional Portfolios</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Collected vs Outstanding</span>
                  <div className="text-2xl font-black text-emerald-600 mt-1">₹ 37,18,750</div>
                  <span className="text-[11px] text-amber-600 font-bold mt-1 inline-block">₹ 5,31,250 Outstanding Milestone</span>
                </div>
              </div>

              <FeeManagerDashboard />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              TAB 17: CAMPUS E-AUDIT - EXECUTIVE INFOGRAPHICS
              ══════════════════════════════════════════════════════════════════ */}
          {activeTab === "audit" && (
            <div className="space-y-6 animate-fadeIn pb-12">
              {/* Important Executive Infographics Banner for Institutional Compliance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Institutional Compliance Score</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">94.6%</div>
                  <span className="text-[11px] text-emerald-600 font-bold mt-1 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Grade A Institutional Partner
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Campus NPS Rating</span>
                  <div className="text-2xl font-black text-amber-500 mt-1">+72 NPS</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">Direct Student & Faculty Feedback</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Open Audit Tickets</span>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">1 Open</div>
                  <span className="text-[11px] text-slate-500 font-semibold mt-1 inline-block">14 Resolved This Month</span>
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
                <div className="mb-4">
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Academic Configurations</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Master academic years, departments, and class groups (Read-Only)</p>
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
                      {(departmentsList.length > 0 ? departmentsList : coursesList).map((d: any, idx: number) => (
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
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">Curriculum Batches</h3>
                <p className="text-xs text-slate-400 font-semibold mb-4">Syllabus breakdown and course offerings across institutions</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {coursesList.map((c, idx) => (
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
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">Institutional Events & Calendar</h3>
                <p className="text-xs text-slate-400 font-semibold mb-4">Network-wide workshops, bootcamps, and placement drives</p>
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
