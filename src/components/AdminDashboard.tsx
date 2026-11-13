"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { AdminSidebar, type AdminNavGroup } from "@/components/admin/AdminSidebar";
import { AdminTabSkeleton } from "@/components/admin/AdminTabSkeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";
import { useApp } from "@/context/AppContext";
import type { AdminTab, AdminDashboardProps } from "@/components/admin/types";
import {
  LayoutDashboard,
  Building2,
  UserCheck,
  CalendarDays,
  Menu,
  ChevronDown,
  Briefcase,
  Users,
  Grid,
  Network,
  GraduationCap,
  BookOpen,
  Calendar,
  Clock,
  ShieldCheck,
  Megaphone,
  History,
  MessageSquare,
  Eye,
  Sliders,
  Award,
  Receipt,
  BarChart3,
  FileSpreadsheet,
  ThumbsUp,
  Smile,
  Handshake,
  CalendarCheck,
  ClipboardList,
  Search,
  X
} from "lucide-react";

// Re-export utility functions and types for backward compatibility
export { generateCampusCode, generateCodeFromName, formatYearWiseRooms } from "@/lib/utils";
export type { AdminTab, AdminDashboardProps } from "@/components/admin/types";

// Dynamic imports with lazy loading and non-expanding inline skeleton fallbacks
const AdminOverviewTab = dynamic(
  () => import("@/components/admin/overview/AdminOverviewTab").then(m => m.AdminOverviewTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const CampusesTab = dynamic(
  () => import("@/components/admin/organization/CampusesTab").then(m => m.CampusesTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const CoursesTab = dynamic(
  () => import("@/components/admin/organization/CoursesTab").then(m => m.CoursesTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const SubjectsTab = dynamic(
  () => import("@/components/admin/organization/SubjectsTab").then(m => m.SubjectsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const HierarchyTab = dynamic(
  () => import("@/components/admin/organization/HierarchyTab").then(m => m.HierarchyTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const KamsTab = dynamic(
  () => import("@/components/admin/people/KamsTab").then(m => m.KamsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const CamsTab = dynamic(
  () => import("@/components/admin/people/CamsTab").then(m => m.CamsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const MentorsTab = dynamic(
  () => import("@/components/admin/people/MentorsTab").then(m => m.MentorsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const SmesTab = dynamic(
  () => import("@/components/admin/people/SmesTab").then(m => m.SmesTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const UsersTab = dynamic(
  () => import("@/components/admin/people/UsersTab").then(m => m.UsersTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const SchedulesTab = dynamic(
  () => import("@/components/admin/operations/SchedulesTab").then(m => m.SchedulesTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const OversightHub = dynamic(
  () => import("@/components/admin/OversightHub").then(m => m.OversightHub),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const MonitoringTab = dynamic(
  () => import("@/components/admin/operations/MonitoringTab").then(m => m.MonitoringTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const HolidaysTab = dynamic(
  () => import("@/components/admin/operations/HolidaysTab").then(m => m.HolidaysTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const AnnouncementsTab = dynamic(
  () => import("@/components/admin/operations/AnnouncementsTab").then(m => m.AnnouncementsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const SettingsTab = dynamic(
  () => import("@/components/admin/system/SettingsTab").then(m => m.SettingsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const SessionsTab = dynamic(
  () => import("@/components/admin/system/SessionsTab").then(m => m.SessionsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const FeedbackTab = dynamic(
  () => import("@/components/admin/system/FeedbackTab").then(m => m.FeedbackTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const LogsTab = dynamic(
  () => import("@/components/admin/system/LogsTab").then(m => m.LogsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const StudentsTab = dynamic(
  () => import("@/components/admin/people/StudentsTab").then(m => m.StudentsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const InterviewModule = dynamic(
  () => import("@/components/InterviewModule").then(m => m.InterviewModule),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const FeesOversightTab = dynamic(
  () => import("@/components/admin/operations/FeesOversightTab").then(m => m.FeesOversightTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const AdminInsightTab = dynamic(
  () => import("@/components/admin/reports/AdminInsightTab").then(m => m.AdminInsightTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const StudentNpsTab = dynamic(
  () => import("@/components/admin/reports/StudentNpsTab").then(m => m.StudentNpsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const ExaminationsTab = dynamic(
  () => import("@/components/admin/operations/ExaminationsTab").then(m => m.ExaminationsTab),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const MentorTaskAssignmentStudio = dynamic(
  () => import("@/components/MentorTaskAssignmentStudio").then(m => m.MentorTaskAssignmentStudio),
  { ssr: false, loading: () => <AdminTabSkeleton /> }
);
const CAMDashboard = dynamic(
  () => import("@/components/CAMDashboard").then(m => m.CAMDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center p-16 text-slate-400 font-bold text-sm">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-zinc-900 dark:border-amber-500 border-t-transparent animate-spin" />
          <span>Loading Campus Console…</span>
        </div>
      </div>
    )
  }
);

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard }
    ]
  },
  {
    title: "Organization",
    icon: Building2,
    items: [
      { id: "campuses", label: "Campuses", icon: Building2 },
      { id: "courses", label: "Courses", icon: Network },
      { id: "subjects", label: "Subjects", icon: GraduationCap },
      { id: "hierarchy", label: "Hierarchy", icon: Network }
    ]
  },
  {
    title: "People",
    icon: Users,
    items: [
      { id: "students", label: "Student Directory", icon: GraduationCap },
      { id: "kams", label: "Key Account Managers", icon: Briefcase },
      { id: "cams", label: "Campus Managers", icon: Users },
      { id: "mentors", label: "Faculty Mentors", icon: UserCheck },
      { id: "smes", label: "Subject Matter Experts", icon: BookOpen },
      { id: "users", label: "User Credentials", icon: ShieldCheck }
    ]
  },
  {
    title: "Operations",
    icon: Grid,
    items: [
      { id: "schedules", label: "Schedules", icon: Grid },
      { id: "oversight", label: "Oversight & Approvals", icon: Eye },
      { id: "monitoring", label: "Attendance Monitoring", icon: Clock },
      { id: "mentor_tasks", label: "Mentor Skill Tasks", icon: ClipboardList },
      { id: "examinations", label: "Examinations", icon: CalendarCheck },
      { id: "interviews", label: "Mock Interviews", icon: Award },
      { id: "fees", label: "Fee Collections", icon: Receipt },
      { id: "holidays", label: "Holidays", icon: Calendar },
      { id: "announcements", label: "Announcements", icon: Megaphone }
    ]
  },
  {
    title: "Reports & Insight",
    icon: BarChart3,
    items: [
      { id: "report_insight", label: "Campus Insight", icon: BarChart3 },
      { id: "report_skills", label: "Skill Development", icon: FileSpreadsheet },
      { id: "report_mentor_nps", label: "Mentor NPS", icon: ThumbsUp },
      { id: "report_student_nps", label: "Student NPS", icon: Smile },
      { id: "report_client_nps", label: "Client NPS", icon: Handshake }
    ]
  },
  {
    title: "System",
    icon: History,
    items: [
      { id: "settings", label: "Email Controls & Settings", icon: Sliders },
      { id: "sessions", label: "Login Sessions", icon: History },
      { id: "feedback", label: "User Feedback", icon: MessageSquare },
      { id: "logs", label: "Audit Logs", icon: History }
    ]
  }
];

const ADMIN_TAB_IDS: string[] = [...ADMIN_NAV_GROUPS.flatMap(g => g.items.map(i => i.id)), "more_menu"];
const MOBILE_PRIMARY_TAB_IDS = ["overview", "campuses", "mentors", "schedules"];
const MOBILE_MORE_TAB_IDS = ADMIN_TAB_IDS.filter(
  id => id !== "more_menu" && !MOBILE_PRIMARY_TAB_IDS.includes(id)
);

const adminTabAliases: Record<string, string> = {
  schedule: "schedules",
  attendance: "monitoring",
  audit: "logs",
  audit_logs: "logs",
  credentials: "users",
  settings: "settings",
  holidays: "holidays",
  announcements: "announcements",
  approvals: "oversight",
  fee: "fees",
  student_directory: "students",
  exams: "examinations",
  exam_schedules: "examinations",
  reports: "report_insight",
  insights: "report_insight"
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  activeTab: propActiveTab,
  onTabChange
}) => {
  const [localActiveTab, setLocalActiveTab] = useState<AdminTab>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fp_sidebar_collapsed") === "true";
      setIsCollapsed(stored);
    }
  }, []);

  const resolvedPropTab = (() => {
    if (!propActiveTab) return undefined;
    const mapped: string = adminTabAliases[propActiveTab] || propActiveTab;
    return ADMIN_TAB_IDS.includes(mapped) ? (mapped as AdminTab) : undefined;
  })();

  const activeTab = resolvedPropTab || localActiveTab;
  const setActiveTab = onTabChange || setLocalActiveTab;
  const { colleges, currentUser, currentAdmin } = useApp();
  const [drillDownCollegeId, setDrillDownCollegeId] = useState<string | null>(null);
  const [moreMenuCategory, setMoreMenuCategory] = useState<string>("all");
  const [moreMenuSearch, setMoreMenuSearch] = useState<string>("");

  const activeNavLabel =
    activeTab === "more_menu"
      ? "More Portals"
      : ADMIN_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label || "Admin Menu";

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0 w-full max-w-[1680px] mx-auto px-4 md:px-10 md:gap-6 bg-warm-canvas text-slate-800 font-sans overflow-hidden">
      {/* Desktop Collapsible Sidebar & Mobile Drawer */}
      <AdminSidebar
        groups={ADMIN_NAV_GROUPS}
        activeTab={activeTab}
        onNavigate={(tab) => {
          setActiveTab(tab as AdminTab);
          setMobileNavOpen(false);
        }}
        collapsed={isCollapsed}
        onToggleCollapsed={() =>
          setIsCollapsed((prev) => {
            const next = !prev;
            if (typeof window !== "undefined") {
              localStorage.setItem("fp_sidebar_collapsed", String(next));
            }
            return next;
          })
        }
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* Mobile drawer trigger — the rail is hidden below md, so this is the only nav entry point */}
      <div className="flex md:hidden items-center pt-3">
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open admin navigation"
          aria-haspopup="true"
          aria-expanded={mobileNavOpen}
          className="flex h-11 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 text-xs font-bold text-slate-700 shadow-xs transition-colors hover:bg-slate-50"
        >
          <Menu className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="truncate">{activeNavLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="flex md:hidden fixed bottom-0 inset-x-0 z-50 mobile-bottom-nav">
        <div className="flex w-full justify-around items-center py-2 px-0.5">
          {[
            { id: "overview", label: "Home", icon: LayoutDashboard },
            { id: "campuses", label: "Campuses", icon: Building2 },
            { id: "mentors", label: "Faculty", icon: UserCheck },
            { id: "schedules", label: "Schedules", icon: CalendarDays },
            { id: "more_menu", label: "More", icon: Menu }
          ].map((t) => {
            const Icon = t.icon;
            const isActive =
              activeTab === t.id ||
              (t.id === "more_menu" && MOBILE_MORE_TAB_IDS.includes(activeTab));

            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as AdminTab)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[3.5rem] flex-1 rounded-xl transition-all cursor-pointer ${
                  isActive ? "text-zinc-950 dark:text-white" : "text-slate-400"
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 transition-transform ${
                    isActive ? "scale-110 text-amber-500" : ""
                  }`}
                />
                <span
                  className={`text-[8px] font-semibold tracking-wide leading-none ${
                    isActive ? "text-zinc-950 dark:text-white font-bold" : "text-slate-400"
                  }`}
                >
                  {t.label}
                </span>
                {isActive && (
                  <span className="absolute top-0 inset-x-1 h-0.5 bg-amber-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Scrollable Content Area */}
      <section className="flex-1 min-w-0 min-h-0 overflow-x-hidden overflow-y-auto pt-3 md:pt-5 pb-24 md:pb-16 space-y-4 scroll-touch">
        {/* Mobile "More" Menu Hub with Categorized Filter Pills & Search */}
        {activeTab === "more_menu" && (() => {
          const ALL_PORTALS = [
            // Academics
            { id: "courses", label: "Academic Courses", subtitle: "Degree programs & batches", icon: Network, bg: "bg-indigo-50 text-indigo-600", category: "academics" },
            { id: "subjects", label: "Subject Catalog", subtitle: "Course subjects & hours", icon: GraduationCap, bg: "bg-teal-50 text-teal-600", category: "academics" },
            { id: "students", label: "Student Directory", subtitle: "Universal student roster & 360 profile", icon: GraduationCap, bg: "bg-emerald-50 text-emerald-600", category: "academics" },
            { id: "examinations", label: "Examinations", subtitle: "Exam timetable & marks registry", icon: CalendarCheck, bg: "bg-orange-50 text-orange-600", category: "academics" },
            { id: "holidays", label: "Campus Holidays", subtitle: "Academic calendar dates", icon: Calendar, bg: "bg-rose-50 text-rose-600", category: "academics" },

            // Reports & NPS
            { id: "report_insight", label: "Campus Insight", subtitle: "Attendance shortage & monthly report", icon: BarChart3, bg: "bg-indigo-50 text-indigo-600", category: "reports" },
            { id: "report_skills", label: "Skill Development", subtitle: "Monthly coding skill report", icon: FileSpreadsheet, bg: "bg-emerald-50 text-emerald-600", category: "reports" },
            { id: "report_mentor_nps", label: "Mentor NPS", subtitle: "Student feedback per mentor", icon: ThumbsUp, bg: "bg-amber-50 text-amber-600", category: "reports" },
            { id: "report_student_nps", label: "Student NPS", subtitle: "Monthly class feedback & coverage", icon: Smile, bg: "bg-violet-50 text-violet-600", category: "reports" },
            { id: "report_client_nps", label: "Client NPS", subtitle: "Campus manager satisfaction", icon: Handshake, bg: "bg-teal-50 text-teal-600", category: "reports" },

            // Staff & Roles
            { id: "kams", label: "Key Account Managers", subtitle: "KAM portfolio & metrics", icon: Briefcase, bg: "bg-amber-50 text-amber-600", category: "roles" },
            { id: "cams", label: "Campus Managers", subtitle: "Campus operations team", icon: Users, bg: "bg-emerald-50 text-emerald-600", category: "roles" },
            { id: "smes", label: "Subject Matter Experts", subtitle: "Curriculum review leads", icon: BookOpen, bg: "bg-sky-50 text-sky-600", category: "roles" },
            { id: "hierarchy", label: "Reporting Hierarchy", subtitle: "Organizational structure", icon: Network, bg: "bg-indigo-50 text-indigo-600", category: "roles" },

            // Ops & Finance
            { id: "interviews", label: "Mock Interviews", subtitle: "Interview drives & evaluation", icon: Award, bg: "bg-violet-50 text-violet-600", category: "ops" },
            { id: "fees", label: "Fee Collections", subtitle: "Student fees & transaction receipts", icon: Receipt, bg: "bg-cyan-50 text-cyan-600", category: "ops" },
            { id: "oversight", label: "Approvals & Oversight", subtitle: "Consolidated requests", icon: Eye, bg: "bg-purple-50 text-purple-600", category: "ops" },
            { id: "monitoring", label: "Student Attendance", subtitle: "Live attendance records", icon: Clock, bg: "bg-blue-50 text-blue-600", category: "ops" },

            // System & Admin
            { id: "users", label: "User Credentials", subtitle: "Passwords & role access", icon: ShieldCheck, bg: "bg-violet-50 text-violet-600", category: "system" },
            { id: "announcements", label: "Campus Broadcasts", subtitle: "Announcements & notifications", icon: Megaphone, bg: "bg-pink-50 text-pink-600", category: "system" },
            { id: "sessions", label: "Login Sessions", subtitle: "Active device logs", icon: History, bg: "bg-slate-100 text-slate-700", category: "system" },
            { id: "feedback", label: "User Feedback", subtitle: "Bug reports & support", icon: MessageSquare, bg: "bg-yellow-50 text-yellow-700", category: "system" },
            { id: "logs", label: "Audit Logs", subtitle: "Security events & history", icon: History, bg: "bg-slate-100 text-slate-700", category: "system" },
            { id: "settings", label: "Global Settings", subtitle: "System & mailing controls", icon: Sliders, bg: "bg-fuchsia-50 text-fuchsia-600", category: "system" }
          ];

          const CATEGORIES = [
            { id: "all", label: "All" },
            { id: "academics", label: "Academics" },
            { id: "reports", label: "Reports" },
            { id: "roles", label: "Staff" },
            { id: "ops", label: "Operations" },
            { id: "system", label: "System" }
          ];

          const filteredPortals = ALL_PORTALS.filter((item) => {
            const matchesCategory = moreMenuCategory === "all" || item.category === moreMenuCategory;
            const q = moreMenuSearch.trim().toLowerCase();
            const matchesSearch = !q || item.label.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q);
            return matchesCategory && matchesSearch;
          });

          return (
            <div className="space-y-4 animate-fadeIn font-sans text-xs">
              <PageHeader
                icon={Menu}
                title="More Admin Portals"
              />

              {/* Search Bar & Category Pills */}
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={moreMenuSearch}
                    onChange={(e) => setMoreMenuSearch(e.target.value)}
                    placeholder="Search portals (e.g. fees, attendance, mentors)..."
                    className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
                  />
                  {moreMenuSearch && (
                    <button
                      type="button"
                      onClick={() => setMoreMenuSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Categorized Pill Strip */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {CATEGORIES.map((cat) => {
                    const count = cat.id === "all" ? ALL_PORTALS.length : ALL_PORTALS.filter((p) => p.category === cat.id).length;
                    const isActive = moreMenuCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setMoreMenuCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                          isActive
                            ? "bg-slate-900 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{cat.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {filteredPortals.length === 0 ? (
                <div className="p-8 text-center bg-white border border-dashed border-slate-200 rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-500">No admin portals matched "{moreMenuSearch}".</p>
                  <button
                    type="button"
                    onClick={() => { setMoreMenuSearch(""); setMoreMenuCategory("all"); }}
                    className="px-3.5 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold cursor-pointer hover:bg-amber-100"
                  >
                    Clear Filter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPortals.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id as AdminTab)}
                        className="p-4 bg-white border border-slate-100 rounded-2xl text-left hover:border-amber-400 hover:ring-2 hover:ring-amber-500/20 transition-all flex items-center gap-3.5 shadow-card cursor-pointer group"
                      >
                        <div className={`h-10 w-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800 truncate">{item.label}</span>
                          <span className="text-[10px] text-slate-400 font-medium truncate block">{item.subtitle}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Tab Renderers */}
        {activeTab === "overview" && (
          <AdminOverviewTab onNavigateTab={setActiveTab} onDrillDownCampus={setDrillDownCollegeId} />
        )}

        {activeTab === "campuses" && <CampusesTab onDrillDownCampus={setDrillDownCollegeId} />}

        {activeTab === "courses" && <CoursesTab />}

        {activeTab === "subjects" && <SubjectsTab />}

        {activeTab === "hierarchy" && <HierarchyTab />}

        {activeTab === "students" && <StudentsTab />}

        {activeTab === "kams" && <KamsTab />}

        {activeTab === "cams" && <CamsTab onDrillDownCampus={setDrillDownCollegeId} />}

        {activeTab === "mentors" && <MentorsTab />}

        {activeTab === "smes" && <SmesTab />}

        {activeTab === "users" && <UsersTab />}

        {activeTab === "schedules" && <SchedulesTab onDrillDownCampus={setDrillDownCollegeId} />}

        {activeTab === "oversight" && <OversightHub />}

        {activeTab === "monitoring" && <MonitoringTab />}

        {activeTab === "mentor_tasks" && <MentorTaskAssignmentStudio role="admin" />}

        {activeTab === "examinations" && <ExaminationsTab />}

        {activeTab === "interviews" && (
          <InterviewModule
            currentUserRole="admin"
            currentUserName={currentAdmin?.name || currentUser?.name || "Admin"}
          />
        )}

        {activeTab === "fees" && <FeesOversightTab />}

        {activeTab === "report_insight" && (
          <AdminInsightTab
            subTab="attendance"
            title="Campus Insight"
            icon={BarChart3}
          />
        )}

        {activeTab === "report_skills" && (
          <AdminInsightTab
            subTab="skill_report"
            title="Skill Development"
            icon={FileSpreadsheet}
          />
        )}

        {activeTab === "report_mentor_nps" && (
          <AdminInsightTab
            subTab="mentor_nps"
            title="Mentor NPS"
            icon={ThumbsUp}
          />
        )}

        {activeTab === "report_student_nps" && <StudentNpsTab />}

        {activeTab === "report_client_nps" && (
          <AdminInsightTab
            subTab="client_nps"
            title="Client NPS"
            icon={Handshake}
          />
        )}

        {activeTab === "holidays" && <HolidaysTab />}

        {activeTab === "announcements" && <AnnouncementsTab />}

        {activeTab === "settings" && <SettingsTab />}

        {activeTab === "sessions" && <SessionsTab />}

        {activeTab === "feedback" && <FeedbackTab />}

        {activeTab === "logs" && <LogsTab />}
      </section>

      {/* Slide-over CAM Campus Console — central admin drill-down */}
      <Sheet open={!!drillDownCollegeId} onOpenChange={open => { if (!open) setDrillDownCollegeId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-6xl p-0 flex flex-col bg-slate-50 overflow-hidden">
          <SheetHeader className="p-4 bg-white border-b border-slate-200">
            <SheetTitle className="text-base font-bold text-slate-800">
              Campus Console — {colleges.find(c => c.id === drillDownCollegeId)?.name || drillDownCollegeId}
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-400">
              Viewing as Admin · Live read/write access to campus operations & timetables
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="flex-1 overflow-y-auto p-0">
            {drillDownCollegeId && <CAMDashboard overrideCollegeId={drillDownCollegeId} />}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminDashboard;
