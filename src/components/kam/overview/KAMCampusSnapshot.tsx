"use client";

import React from "react";
import { Users, Percent, GraduationCap, HeartPulse, Mail, Phone, ArrowLeft, ArrowUpRight } from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

export interface CampusSnapshotProps {
  college: {
    id: string;
    name: string;
    code?: string;
    city?: string;
    manager?: string;
    cam_email?: string;
    cam_phone?: string;
  } | null;
  totalStudents: number;
  avgAttendance: number | string;
  activeFaculty: number;
  healthScore?: number;
  onBackToPortfolio: () => void;
  onNavigateTab: (tab: string) => void;
}

export const KAMCampusSnapshot: React.FC<CampusSnapshotProps> = ({
  college,
  totalStudents,
  avgAttendance,
  activeFaculty,
  healthScore = 92,
  onBackToPortfolio,
  onNavigateTab
}) => {
  return (
    <div className="space-y-6">
      {/* Top clean executive KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KAMKpiCard
          label="Total Enrolled"
          value={totalStudents.toLocaleString()}
          badge={{ text: "Active", type: "neutral" }}
          icon={Users}
          accentColor="indigo"
        />
        <KAMKpiCard
          label="Average Attendance"
          value={typeof avgAttendance === "number" ? `${avgAttendance}%` : String(avgAttendance)}
          badge={{ text: "Standard", type: "positive" }}
          icon={Percent}
          accentColor="emerald"
        />
        <KAMKpiCard
          label="Faculty Deployed"
          value={activeFaculty}
          badge={{ text: "Covered", type: "positive" }}
          icon={GraduationCap}
          accentColor="zinc"
        />
        <KAMKpiCard
          label="Campus Health"
          value={`${healthScore}/100`}
          badge={{ text: "Grade A", type: "positive" }}
          icon={HeartPulse}
          accentColor="amber"
        />
      </div>

      {/* Campus Manager Contact & Jump Navigation */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-slate-200/80 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              {college?.name || "Selected Campus"}
            </h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Code: {college?.code || college?.id} • {college?.city || "Campus Center"}
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToPortfolio}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Portfolio Overview
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="bg-slate-50 dark:bg-zinc-800/50 p-4 rounded-xl space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Assigned Campus Manager</span>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">
              {college?.manager || "Campus Manager Assigned"}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-zinc-300 pt-1">
              {college?.cam_email && (
                <a href={`mailto:${college.cam_email}`} className="inline-flex items-center gap-1.5 hover:text-amber-500">
                  <Mail className="w-3.5 h-3.5 text-amber-500" />
                  {college.cam_email}
                </a>
              )}
              {college?.cam_phone && (
                <a href={`tel:${college.cam_phone}`} className="inline-flex items-center gap-1.5 hover:text-amber-500">
                  <Phone className="w-3.5 h-3.5 text-amber-500" />
                  {college.cam_phone}
                </a>
              )}
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-zinc-800/50 p-4 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Direct Module Inspection</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab("timetable")}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-bold hover:bg-zinc-800 dark:hover:bg-white transition-colors"
              >
                Timetable
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("academic_tracker")}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold hover:bg-amber-400 transition-colors"
              >
                Academic Delivery
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("audit")}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 text-xs font-bold hover:bg-white dark:hover:bg-zinc-800 transition-colors"
              >
                Compliance Audit
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

