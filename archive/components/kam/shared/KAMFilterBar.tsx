"use client";

import React from "react";
import { Building2, Layers, Users, Clock, Calendar, Filter, RotateCcw } from "lucide-react";
import { getLocalDateStr, shiftDateStr } from "@/lib/localDate";

export interface GlobalFilterState {
  collegeId: string;
  department: string;
  classGroup: string;
  shift: string;
  preset: string;
  startDate: string;
  endDate: string;
  searchQuery: string;
}

interface KAMFilterBarProps {
  filters: GlobalFilterState;
  onChange: (filters: Partial<GlobalFilterState>) => void;
  onReset: () => void;
  colleges: Array<{ id: string; name: string; code?: string }>;
  departments: string[];
  batches: string[];
}

export const KAMFilterBar: React.FC<KAMFilterBarProps> = ({
  filters,
  onChange,
  onReset,
  colleges,
  departments,
  batches
}) => {
  const PRESETS = [
    { key: "all", label: "All" },
    { key: "today", label: "Today" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "this_month", label: "This Month" },
    { key: "jun", label: "Jun '26" },
    { key: "jul", label: "Jul '26" },
    { key: "aug", label: "Aug '26" }
  ];

  const handlePresetClick = (presetKey: string) => {
    const todayStr = getLocalDateStr();
    let start = "2026-06-01";
    let end = todayStr;

    if (presetKey === "today") {
      start = todayStr;
      end = todayStr;
    } else if (presetKey === "7d") {
      start = shiftDateStr(todayStr, -7);
    } else if (presetKey === "30d") {
      start = shiftDateStr(todayStr, -30);
    } else if (presetKey === "this_month") {
      start = `${todayStr.slice(0, 7)}-01`;
    } else if (presetKey === "jun") {
      start = "2026-06-01";
      end = "2026-06-30";
    } else if (presetKey === "jul") {
      start = "2026-07-01";
      end = "2026-07-31";
    } else if (presetKey === "aug") {
      start = "2026-08-01";
      end = "2026-08-31";
    }

    onChange({ preset: presetKey, startDate: start, endDate: end });
  };

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-100 rounded-2xl p-4 shadow-card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-900">
          <Filter className="h-4 w-4 text-indigo-600" />
          <span>Global Portfolio Controls</span>
        </div>

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/60 rounded-lg transition-all"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Filters</span>
        </button>
      </div>

      {/* Dropdown Selectors Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
        {/* 1. Campus */}
        <div className="flex items-center gap-2 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <select
            value={filters.collegeId}
            onChange={e => onChange({ collegeId: e.target.value, department: "all", classGroup: "all" })}
            className="w-full text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
          >
            <option value="all">🏢 All Campuses</option>
            {colleges.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Department */}
        <div className="flex items-center gap-2 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
          <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <select
            value={filters.department}
            onChange={e => onChange({ department: e.target.value })}
            className="w-full text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
          >
            <option value="all">📚 All Departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* 3. Batch / Class */}
        <div className="flex items-center gap-2 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
          <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <select
            value={filters.classGroup}
            onChange={e => onChange({ classGroup: e.target.value })}
            className="w-full text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
          >
            <option value="all">👥 All Batches / Cohorts</option>
            {batches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* 4. Shift */}
        <div className="flex items-center gap-2 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <select
            value={filters.shift}
            onChange={e => onChange({ shift: e.target.value })}
            className="w-full text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
          >
            <option value="all">🕒 All Shifts</option>
            <option value="general">General Shift</option>
            <option value="shift_1">Shift 1 (Morning)</option>
            <option value="shift_2">Shift 2 (Afternoon)</option>
          </select>
        </div>

        {/* 5. Date From */}
        <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-[10px] font-black text-slate-400 uppercase">From</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={e => onChange({ startDate: e.target.value, preset: "custom" })}
            className="w-full text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
          />
        </div>

        {/* 6. Date To */}
        <div className="flex items-center gap-1.5 bg-slate-50/80 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-[10px] font-black text-slate-400 uppercase">To</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={e => onChange({ endDate: e.target.value, preset: "custom" })}
            className="w-full text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* Date Presets Row */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <span className="text-[11px] font-extrabold text-slate-400 mr-1">Presets:</span>
        {PRESETS.map(p => {
          const isActive = filters.preset === p.key;
          return (
            <button
              key={p.key}
              onClick={() => handlePresetClick(p.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
