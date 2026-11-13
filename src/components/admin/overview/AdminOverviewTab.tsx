"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/context/AppContext";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatRoleLabel } from "@/lib/utils";
import type { Announcement } from "@/components/admin/operations/AnnouncementsTab";
import {
  LayoutDashboard,
  Building2,
  Users,
  Grid,
  Layers,
  Network,
  ChevronRight,
  ChevronDown,
  History,
  TrendingUp,
  UserCheck,
  CalendarDays,
  UserPlus,
  FileText,
  Megaphone,
  Sparkles,
  ArrowRight
} from "lucide-react";
import type { AdminTab } from "@/components/admin/types";

export interface AdminOverviewTabProps {
  onNavigateTab: (tab: AdminTab) => void;
  kamList?: any[];
  onDrillDownCampus?: (collegeId: string) => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  onNavigateTab,
  kamList = [],
  onDrillDownCampus
}) => {
  const {
    currentAdmin,
    colleges,
    mentors,
    slots,
    students = [],
    coursesList,
    auditLogs = []
  } = useApp();

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    admin: true
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Compute live day-by-day distribution of scheduled slots across weekdays
  const dayDistribution = useMemo(() => {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const counts = days.map(day => {
      const daySlots = slots.filter(s => (s.day || "").toLowerCase() === day.toLowerCase());
      return {
        day: day.slice(0, 3),
        fullDay: day,
        slots: daySlots.length
      };
    });

    const maxSlots = Math.max(...counts.map(c => c.slots), 1);
    const width = 600;
    const height = 150;
    const step = width / (days.length - 1);
    const points = counts.map((c, i) => {
      const x = Math.round(i * step);
      const y = Math.round(height - (c.slots / maxSlots) * (height - 35) - 15);
      return { x, y, count: c.slots, day: c.day };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const controlX = (current.x + next.x) / 2;
      pathD += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }

    const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

    const peak = [...counts].sort((a, b) => b.slots - a.slots)[0] || { day: "Wed", slots: 0 };

    return { counts, maxSlots, points, pathD, areaD, total: slots.length, peak };
  }, [slots]);

  const recentLogs = useMemo(() => {
    return (auditLogs || []).slice(0, 6);
  }, [auditLogs]);

  // Roll-ups behind the bento chips. The mockup shipped growth percentages
  // (↑5.2%, ↑99.8%) with no history behind them; each chip now states a figure
  // the loaded data actually proves.
  const overviewStats = useMemo(() => {
    const campusesWithTimetable = new Set(
      slots.map((s) => s.college_id).filter((id): id is string => Boolean(id))
    ).size;
    const scheduledIds = new Set(slots.map((s) => s.mentorId).filter(Boolean));
    return {
      avgStudentsPerCampus: colleges.length > 0 ? Math.round(students.length / colleges.length) : 0,
      campusesWithTimetable,
      scheduledMentors: mentors.filter((m) => scheduledIds.has(m.id)).length
    };
  }, [slots, mentors, colleges, students]);

  // Same query key as the Announcements tab, so this card reads the cached list.
  const announcementsQuery = useQuery({
    queryKey: qk.announcements("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/announcements");
      return (data?.announcements || []) as Announcement[];
    },
    // 5 minutes — announcements don't change by the second; prevent re-fetch on
    // every tab focus or re-mount of this component.
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });

  const latestAnnouncements = useMemo(
    () =>
      [...(announcementsQuery.data || [])]
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .slice(0, 2),
    [announcementsQuery.data]
  );

  // Pre-compute mentor and slot counts per campus once in O(n) — replaces the
  // per-college mentors.filter() + slots.filter(...some()) that was O(colleges × mentors + colleges × slots).
  const campusStats = useMemo(() => {
    const mentorCountByCollege = new Map<string, number>();
    const mentorCollegeMap = new Map<string, string>();
    for (const m of mentors) {
      if (m.college_id) {
        mentorCountByCollege.set(m.college_id, (mentorCountByCollege.get(m.college_id) || 0) + 1);
        mentorCollegeMap.set(m.id, m.college_id);
      }
    }
    const slotCountByCollege = new Map<string, number>();
    for (const s of slots) {
      const cid = s.college_id || mentorCollegeMap.get(s.mentorId);
      if (cid) slotCountByCollege.set(cid, (slotCountByCollege.get(cid) || 0) + 1);
    }
    return { mentorCountByCollege, slotCountByCollege };
  }, [mentors, slots]);

  return (
    <div className="space-y-6 animate-fadeIn font-sans text-xs">
      
      {/* ── 1. WELCOME HERO BANNER (With 3D Graduation Cap Graphic) ── */}
      <div className="rounded-3xl p-6 sm:p-9 brand-hero-banner shadow-card-lg border border-white/90 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Left Text Content */}
        <div className="space-y-2.5 max-w-lg z-10 text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-indigo-100 text-indigo-700 text-[11px] font-bold shadow-xs">
            <Sparkles className="h-3 w-3 text-indigo-600 animate-pulse" />
            <span>Welcome back,</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            eCampus Dashboard
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">
            Track attendance, manage faculty, monitor college timetables, and coordinate operations across all partner campuses.
          </p>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigateTab("report_insight")}
              className="brand-gradient text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-lg shadow-indigo-600/25 hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Go to Reports</span>
              <span>&rarr;</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab("schedules")}
              className="bg-white/90 hover:bg-white text-slate-700 font-bold text-xs px-4 py-2.5 rounded-lg border border-slate-200/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>View Timetables</span>
            </button>
          </div>
        </div>

        {/* Right 3D Illustration: Graduation Cap resting on stacked books */}
        <div className="relative w-64 h-44 sm:w-72 sm:h-48 shrink-0 z-10 flex items-center justify-center pointer-events-none select-none">
          <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 320 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="book1Cover" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3B82F6"/>
                <stop offset="100%" stopColor="#1D4ED8"/>
              </linearGradient>
              <linearGradient id="book2Cover" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4F46E5"/>
                <stop offset="100%" stopColor="#7C3AED"/>
              </linearGradient>
              <linearGradient id="capGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1E1B4B"/>
                <stop offset="100%" stopColor="#312E81"/>
              </linearGradient>
              <linearGradient id="tasselGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FBBF24"/>
                <stop offset="100%" stopColor="#D97706"/>
              </linearGradient>
            </defs>

            {/* Bottom Book (Blue) */}
            <g transform="translate(40, 110)">
              <path d="M 0 25 L 180 40 L 220 20 L 40 5 Z" fill="#1E3A8A" />
              <path d="M 0 25 L 0 45 L 180 60 L 180 40 Z" fill="url(#book1Cover)" rx="4" />
              <path d="M 180 42 L 216 23 L 216 38 L 180 57 Z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
              <path d="M 4 27 L 178 41 L 216 22 L 42 8 Z" fill="#2563EB" />
            </g>

            {/* Top Book (Brand Accent) */}
            <g transform="translate(60, 80)">
              <path d="M 0 20 L 160 32 L 195 16 L 35 4 Z" fill="#4338CA" />
              <path d="M 0 20 L 0 36 L 160 48 L 160 32 Z" fill="url(#book2Cover)" rx="4" />
              <path d="M 160 34 L 192 18 L 192 32 L 160 46 Z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
              <path d="M 3 22 L 158 33 L 192 18 L 37 7 Z" fill="#4F46E5" />
            </g>

            {/* Graduation Cap */}
            <g transform="translate(80, 20)">
              <ellipse cx="100" cy="72" rx="42" ry="18" fill="#1E1B4B" />
              <path d="M 58 72 C 58 88 142 88 142 72 L 142 80 C 142 96 58 96 58 80 Z" fill="#0F172A" />
              <polygon points="100,20 185,50 100,80 15,50" fill="url(#capGrad)" stroke="#4338CA" strokeWidth="1" />
              <circle cx="100" cy="50" r="5" fill="#FBBF24" />
              <path d="M 100 50 Q 140 60 148 95" fill="none" stroke="url(#tasselGrad)" strokeWidth="3" strokeLinecap="round" />
              <polygon points="144,95 152,95 150,118 146,118" fill="url(#tasselGrad)" rx="2" />
            </g>
          </svg>
        </div>

        {/* Ambient Curved Wave Backgrounds */}
        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-40 pointer-events-none">
          <svg viewBox="0 0 400 300" fill="none" className="w-full h-full">
            <circle cx="350" cy="150" r="180" stroke="#C7D2FE" strokeWidth="40" />
            <circle cx="350" cy="150" r="260" stroke="#DDD6FE" strokeWidth="30" />
          </svg>
        </div>
      </div>

      {/* ── 2. 4 BENTO STAT CARDS (With Soft Bottom Wave) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Students */}
        <div
          onClick={() => onNavigateTab("students")}
          className="relative bg-white rounded-2xl p-5 shadow-card border border-slate-100 overflow-hidden flex flex-col justify-between hover:border-indigo-200 hover:shadow-card-lg transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
              <Users className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center text-[11px] font-bold text-slate-500">
              {overviewStats.avgStudentsPerCampus.toLocaleString()} avg / campus
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {students.length.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Total Students</div>
          </div>

          {/* Bottom Soft Wave */}
          <svg className="absolute bottom-0 left-0 right-0 h-9 w-full pointer-events-none opacity-60" viewBox="0 0 200 40" fill="none" preserveAspectRatio="none">
            <path d="M0,20 C50,35 150,5 200,20 L200,40 L0,40 Z" fill="#EEF2FF" />
          </svg>
        </div>

        {/* Card 2: Total Campuses */}
        <div
          onClick={() => onNavigateTab("campuses")}
          className="relative bg-white rounded-2xl p-5 shadow-card border border-slate-100 overflow-hidden flex flex-col justify-between hover:border-sky-200 hover:shadow-card-lg transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center text-[11px] font-bold text-slate-500">
              {overviewStats.campusesWithTimetable} with timetable
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {colleges.length.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Total Campuses</div>
          </div>

          {/* Bottom Soft Wave */}
          <svg className="absolute bottom-0 left-0 right-0 h-9 w-full pointer-events-none opacity-60" viewBox="0 0 200 40" fill="none" preserveAspectRatio="none">
            <path d="M0,20 C50,35 150,5 200,20 L200,40 L0,40 Z" fill="#E0F2FE" />
          </svg>
        </div>

        {/* Card 3: Active Mentors */}
        <div
          onClick={() => onNavigateTab("mentors")}
          className="relative bg-white rounded-2xl p-5 shadow-card border border-slate-100 overflow-hidden flex flex-col justify-between hover:border-purple-200 hover:shadow-card-lg transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-xs">
              <UserCheck className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center text-[11px] font-bold text-slate-500">
              {overviewStats.scheduledMentors} scheduled
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {mentors.length.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Faculty Mentors</div>
          </div>

          {/* Bottom Soft Wave */}
          <svg className="absolute bottom-0 left-0 right-0 h-9 w-full pointer-events-none opacity-60" viewBox="0 0 200 40" fill="none" preserveAspectRatio="none">
            <path d="M0,20 C50,35 150,5 200,20 L200,40 L0,40 Z" fill="#F3E8FF" />
          </svg>
        </div>

        {/* Card 4: Scheduled Slots */}
        <div
          onClick={() => onNavigateTab("schedules")}
          className="relative bg-white rounded-2xl p-5 shadow-card border border-slate-100 overflow-hidden flex flex-col justify-between hover:border-emerald-200 hover:shadow-card-lg transition-all cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
              <Grid className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center text-[11px] font-bold text-slate-500">
              Peak {dayDistribution.peak.fullDay.slice(0, 3)}
            </span>
          </div>

          <div className="mt-3 relative z-10">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {slots.length.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">Scheduled Sessions</div>
          </div>

          {/* Bottom Soft Wave */}
          <svg className="absolute bottom-0 left-0 right-0 h-9 w-full pointer-events-none opacity-60" viewBox="0 0 200 40" fill="none" preserveAspectRatio="none">
            <path d="M0,20 C50,35 150,5 200,20 L200,40 L0,40 Z" fill="#DCFCE7" />
          </svg>
        </div>

      </div>

      {/* ── 3. LOWER SECTION: TRENDS CHART (7 Cols) + QUICK ACTIONS & ANNOUNCEMENTS (5 Cols) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* Left: Operational & Timetable Trends Curve */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 sm:p-6 shadow-card border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 leading-tight">Weekly Operational Trends</h2>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab("schedules")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span>Inspect Timetables</span>
              <ArrowRight className="h-3 w-3 text-slate-400" />
            </button>
          </div>

          {/* Spline Wave Chart Container with Y-Axis */}
          <div className="relative w-full h-52 pt-2">
            
            {/* Tooltip Badge on Peak Day */}
            <div className="absolute top-2 left-[50%] -translate-x-1/2 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-800 shadow-md flex items-center gap-1 z-10">
              <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
              <span>{dayDistribution.peak.slots} Slots ({dayDistribution.peak.fullDay})</span>
            </div>

            <svg className="w-full h-full overflow-visible" viewBox="0 0 600 150" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Dotted Horizontal Grid Lines */}
              <line x1="30" y1="20" x2="590" y2="20" stroke="#F1F5F9" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="30" y1="60" x2="590" y2="60" stroke="#F1F5F9" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="30" y1="100" x2="590" y2="100" stroke="#F1F5F9" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="30" y1="140" x2="590" y2="140" stroke="#F1F5F9" strokeWidth="1.5" />

              {/* Area Fill Under Curve */}
              <path d={dayDistribution.areaD} fill="url(#trendAreaGrad)" />

              {/* Smooth Spline Stroke Line */}
              <path d={dayDistribution.pathD} fill="none" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" />

              {/* Data Point Circles */}
              {dayDistribution.points.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="4.5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
              ))}
            </svg>

            {/* X-Axis Labels */}
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 pl-4 pr-4 pt-1">
              {dayDistribution.points.map((pt, i) => (
                <span key={i} className="text-center">
                  {pt.day}
                  <span className="block text-[9px] text-slate-700 font-extrabold">{pt.count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Quick Actions (2x2 Grid) + Announcements / Activity Feed */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Card 1: Quick Actions */}
          <div className="bg-white rounded-2xl p-5 shadow-card border border-slate-100 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Quick Actions</h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onNavigateTab("schedules")}
                className="p-3 rounded-xl bg-slate-50/80 hover:bg-indigo-50/60 border border-slate-100 flex items-center gap-2 text-left transition-all cursor-pointer group"
              >
                <CalendarDays className="h-4.5 w-4.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 truncate">Schedules</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab("students")}
                className="p-3 rounded-xl bg-slate-50/80 hover:bg-indigo-50/60 border border-slate-100 flex items-center gap-2 text-left transition-all cursor-pointer group"
              >
                <UserPlus className="h-4.5 w-4.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 truncate">Add Student</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab("report_insight")}
                className="p-3 rounded-xl bg-slate-50/80 hover:bg-indigo-50/60 border border-slate-100 flex items-center gap-2 text-left transition-all cursor-pointer group"
              >
                <FileText className="h-4.5 w-4.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 truncate">Reports Hub</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab("hierarchy")}
                className="p-3 rounded-xl bg-slate-50/80 hover:bg-indigo-50/60 border border-slate-100 flex items-center gap-2 text-left transition-all cursor-pointer group"
              >
                <Network className="h-4.5 w-4.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700 truncate">Hierarchy</span>
              </button>
            </div>
          </div>

          {/* Card 2: Announcements & System Activity */}
          <div className="bg-white rounded-2xl p-5 shadow-card border border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Megaphone className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Announcements</h3>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab("announcements")}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
              >
                <span>View All</span>
                <span>&rarr;</span>
              </button>
            </div>

            {/* Live Feed Items */}
            <div className="space-y-2.5 pt-1">
              {announcementsQuery.isLoading &&
                [0, 1].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/60"
                  >
                    <Skeleton className="h-2 w-2 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/5" />
                      <Skeleton className="h-2.5 w-4/5" />
                    </div>
                  </div>
                ))}

              {announcementsQuery.isError && (
                <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/60 text-[11px] font-medium text-slate-500">
                  Announcements could not be loaded.
                </div>
              )}

              {!announcementsQuery.isLoading && !announcementsQuery.isError && latestAnnouncements.length === 0 && (
                <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/60 text-[11px] font-medium text-slate-500">
                  No announcements yet.
                </div>
              )}

              {latestAnnouncements.map((announcement) => (
                <div
                  key={announcement.id}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/60"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-indigo-600 mt-1 shrink-0"></span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        {announcement.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-medium truncate">
                        {announcement.description}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                    {formatDate(announcement.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* ── 4. SPLIT SCREEN: CAMPUSES BREAKDOWN & HIERARCHY TREE ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        
        {/* Campuses Overview Card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              <h3 className="text-sm font-extrabold text-gray-900">Campus Breakdown</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateTab("campuses")}
              className="text-xs text-indigo-600 font-bold"
            >
              All Campuses &rarr;
            </Button>
          </div>
          
          <div className="space-y-3 flex-grow overflow-y-auto max-h-[300px] pr-1">
            {colleges.map(col => {
              const mentorCount = campusStats.mentorCountByCollege.get(col.id) || 0;
              const slotCount = campusStats.slotCountByCollege.get(col.id) || 0;
              return (
                <div
                  key={col.id}
                  onClick={() => onDrillDownCampus && onDrillDownCampus(col.id)}
                  className={`flex items-center justify-between p-3 bg-gray-50/50 hover:bg-indigo-50/30 transition-all rounded-xl border border-gray-200/60 ${
                    onDrillDownCampus ? "cursor-pointer hover:border-indigo-300" : ""
                  }`}
                  title={onDrillDownCampus ? "Click to open Campus Console" : undefined}
                >
                  <div>
                    <span className="font-extrabold text-gray-900 block">{col.name}</span>
                    <span className="text-[10px] text-gray-400 font-semibold">{col.address || "No address"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap">
                      {mentorCount} Mentors
                    </span>
                    <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap">
                      {slotCount} Slots
                    </span>
                  </div>
                </div>
              );
            })}
            {colleges.length === 0 && (
              <p className="text-gray-500 italic text-center py-8">No colleges registered yet.</p>
            )}
          </div>
        </div>

        {/* Hierarchy Quick Tree */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-indigo-600" />
              <h3 className="text-sm font-extrabold text-gray-900">System Hierarchy</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateTab("hierarchy")}
              className="text-xs text-indigo-600 font-bold"
            >
              Full Tree &rarr;
            </Button>
          </div>
          <p className="text-[10px] text-gray-500 font-semibold mb-3 leading-relaxed">
            Reporting Chain of Command (Super Admin &rarr; Key Account Managers &rarr; Campuses)
          </p>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 shadow-inner space-y-3 max-h-[300px] overflow-y-auto text-xs">
            {/* Super Admin Level */}
            <div className="space-y-2">
              <div
                onClick={() => toggleNode("admin")}
                className="flex items-center gap-2 p-2.5 bg-white border border-indigo-200 rounded-xl shadow-xs cursor-pointer hover:border-indigo-300 transition-all"
              >
                {expandedNodes["admin"] ? (
                  <ChevronDown className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                )}
                <div className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-[9px] shrink-0">
                  SU
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 text-xs truncate">Super Admin</div>
                  <div className="text-[9px] text-gray-500 truncate">{currentAdmin?.name || "System Admin"}</div>
                </div>
              </div>

              {expandedNodes["admin"] && (
                <div className="pl-6 border-l border-dashed border-gray-300 ml-4 space-y-2 pt-1">
                  {kamList.map((kam: any) => {
                    const kamNodeId = `kam-${kam.id}`;
                    const kamColleges = colleges.filter(c => c.kam_id === kam.id);
                    return (
                      <div key={kam.id} className="space-y-1">
                        <div
                          onClick={() => toggleNode(kamNodeId)}
                          className="flex items-center gap-2 p-2 bg-white border border-slate-100 rounded-2xl shadow-card cursor-pointer hover:border-indigo-200 transition-all"
                        >
                          {expandedNodes[kamNodeId] ? (
                            <ChevronDown className="h-3 w-3 text-gray-500 shrink-0" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-gray-500 shrink-0" />
                          )}
                          <div className="h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center font-black text-[8px] shrink-0">
                            KAM
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 text-[10.5px] truncate">{kam.name}</div>
                            <div className="text-[8.5px] text-gray-400 truncate">{kamColleges.length} Campus(es)</div>
                          </div>
                        </div>
                        {expandedNodes[kamNodeId] && (
                          <div className="pl-6 border-l border-dashed border-gray-300 ml-3 space-y-1 pt-1">
                            {kamColleges.map(col => (
                              <div
                                key={col.id}
                                className="flex items-center gap-1.5 p-1.5 bg-white border border-gray-200 rounded-lg text-[9.5px] text-gray-700"
                              >
                                <Building2 className="h-3 w-3 text-gray-500 shrink-0" />
                                <span className="font-extrabold truncate">{col.name}</span>
                              </div>
                            ))}
                            {kamColleges.length === 0 && (
                              <span className="text-[9px] text-gray-500 italic pl-2 block">No campuses assigned</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {kamList.length === 0 && (
                    <span className="text-[9.5px] text-gray-500 italic pl-2 block">
                      No Key Account Managers registered
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. RECENT AUDIT LOGS SUMMARY ── */}
      <Card className="shadow-sm rounded-2xl overflow-hidden border border-slate-100">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-indigo-600" />
              <CardTitle className="text-sm font-extrabold text-gray-900">Recent Audit Logs</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateTab("logs")}
              className="text-xs text-indigo-600 font-bold"
            >
              View All Logs &rarr;
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <History className="h-8 w-8" />
                        <p className="text-sm font-semibold">No logs recorded yet.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  recentLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-gray-500 whitespace-nowrap">{formatDate(log.timestamp)}</TableCell>
                      <TableCell className="font-bold text-gray-900">{log.actorName || log.actor_name || "System"}</TableCell>
                      <TableCell>
                        <Badge variant="default" className="text-[9px]">
                          {formatRoleLabel(log.actorRole || log.actor_role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-600">{log.description}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};
