"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { ShieldCheck, Building2, Users, BookOpen, Clock, Database, KeyRound, Sparkles, Server } from "lucide-react";

interface AdminProfileTabProps {
  onOpenChangePassword?: () => void;
  onNavigateTab?: (tab: any) => void;
}

export const AdminProfileTab: React.FC<AdminProfileTabProps> = ({
  onOpenChangePassword,
  onNavigateTab
}) => {
  const { currentAdmin, currentUser, colleges, mentors, students, coursesList, slots } = useApp();

  const adminName = currentAdmin?.name || currentUser?.name || "System Administrator";
  const adminEmail = currentAdmin?.email || currentUser?.email || "admin@faceprep.in";
  const adminId = currentAdmin?.id || currentUser?.id || "admin_root";

  return (
    <div className="space-y-6 font-sans pb-12 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Super Administrator Profile</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                Root Authority
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              System architecture, enterprise multi-campus governance, and security controls.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Identity Card */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card flex flex-col items-center justify-between text-center min-h-[320px]">
          <div className="flex flex-col items-center space-y-4 w-full">
            <div className="h-20 w-20 rounded-2xl bg-zinc-900 dark:bg-zinc-800 border-4 border-amber-500 text-amber-400 flex items-center justify-center text-2xl font-black shadow-md uppercase">
              {adminName.substring(0, 2)}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                {adminName}
              </h2>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider mt-1">
                Super Administrator &amp; System Owner
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[9.5px] font-black text-amber-800 dark:text-amber-300 uppercase">
                Full Root Privileges
              </span>
            </div>
          </div>

          <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 text-left space-y-2.5">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-400">Account ID</span>
              <span className="text-slate-800 dark:text-slate-200 font-mono text-[11px]">{adminId}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-400">Primary Email</span>
              <span className="text-slate-800 dark:text-slate-200 truncate max-w-[170px]" title={adminEmail}>
                {adminEmail}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-400">Role Authority</span>
              <span className="text-amber-600 dark:text-amber-400 font-bold text-[11px]">Level 0 (Super Admin)</span>
            </div>
          </div>
        </div>

        {/* System Scope & Jurisdiction Card */}
        <div className="md:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
              System Administration Scope &amp; Governance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Enterprise Authority</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block">
                  Universal Global Scope
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">All connected institutional databases &amp; campuses</span>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Database &amp; Engine</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  <span>PostgreSQL Cloud Engine</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">High-availability pooler active</span>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Security &amp; Permissions</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100 block">
                  Role-Based Access Control (RBAC)
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">Full write &amp; override capabilities</span>
              </div>

              <div className="space-y-1 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Infrastructure Status</span>
                <span className="text-sm font-extrabold text-emerald-600 block flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  <span>Online &amp; Operational</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block">Realtime poller &amp; audit logging active</span>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-xl flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="text-xs text-amber-900 dark:text-amber-200 font-medium">
              You are signed in with the highest administrative tier. All global master records, users, campus databases, and audit logs are accessible and editable under this profile.
            </div>
          </div>
        </div>
      </div>

      {/* Global Enterprise Portfolio Metrics */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-card space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Global Multi-Campus Infrastructure Metrics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-2xl font-black text-slate-900 dark:text-white block">
              {colleges.length}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">
              Campuses Managed
            </span>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-2xl font-black text-slate-900 dark:text-white block">
              {mentors.length}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">
              Total Mentors
            </span>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-2xl font-black text-slate-900 dark:text-white block">
              {students.length}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">
              Active Students
            </span>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-2xl font-black text-slate-900 dark:text-white block">
              {coursesList.length}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">
              Courses / Depts
            </span>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-2xl font-black text-slate-900 dark:text-white block">
              {slots.length}
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mt-1">
              Timetable Slots
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
