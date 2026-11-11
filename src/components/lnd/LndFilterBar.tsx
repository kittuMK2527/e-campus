"use client";

import { useMemo } from "react";
import {
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Table,
  User,
  Users,
  X
} from "lucide-react";
import { Button } from "../ui/button";
import { Combobox } from "../ui/combobox";
import LndEvaluatorPills from "./LndEvaluatorPills";
import { buildGroupCounts, toGroupFilterOptions } from "../../lib/lndFilterOptions";

interface LndFilterBarProps {
  colleges: any[];
  mentors: any[];
  smes: any[];
  selectedCollegeId: string;
  selectedGroupId: string;
  selectedSmeId: string;
  onSelectCollege: (collegeId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onSelectSme: (smeId: string) => void;
  selectedWeek: number;
  weekRangeLabel: string;
  onWeekOffset: (delta: number) => void;
  isCurrentWeek: boolean;
  onThisWeek: () => void;
  lndActiveFilters: string[];
  onClearFilters: () => void;
  gridScopeSmes: any[];
  gridDisplayMode: "master" | "periods";
  onGridDisplayMode: (mode: "master" | "periods") => void;
  getMentorGroup: (mentor: any) => string;
}

export default function LndFilterBar({
  colleges,
  mentors,
  smes,
  selectedCollegeId,
  selectedGroupId,
  selectedSmeId,
  onSelectCollege,
  onSelectGroup,
  onSelectSme,
  selectedWeek,
  weekRangeLabel,
  onWeekOffset,
  isCurrentWeek,
  onThisWeek,
  lndActiveFilters,
  onClearFilters,
  gridScopeSmes,
  gridDisplayMode,
  onGridDisplayMode,
  getMentorGroup
}: LndFilterBarProps) {
  // ── Matrix filter model: campus-scoped, count-labelled, keyboard-operable ──
  const mentorGroupCounts = useMemo(
    () => buildGroupCounts(mentors, selectedCollegeId, getMentorGroup),
    [mentors, selectedCollegeId, getMentorGroup]
  );

  const campusFilterOptions = useMemo(() => [
    {
      value: "all",
      label: "All Colleges",
      subtext: `${colleges.length} campuses`,
      icon: <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
    },
    ...colleges.map(c => ({ value: c.id, label: c.name }))
  ], [colleges]);

  const departmentFilterOptions = useMemo(() => [
    {
      value: "All",
      label: "All Departments",
      subtext: `${mentorGroupCounts.size} departments`,
      icon: <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
    },
    // Keeps the current value representable even when this campus has none of its mentors.
    ...toGroupFilterOptions(mentorGroupCounts, {
      carriedValue: selectedGroupId !== "All" ? selectedGroupId : undefined,
      carriedSubtext: "none on this campus"
    })
  ], [mentorGroupCounts, selectedGroupId]);

  const evaluatorFilterOptions = useMemo(() => [
    {
      value: "all",
      label: "All Evaluators",
      subtext: `${smes.length} SMEs`,
      icon: <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
    },
    ...smes.map(s => ({
      value: s.id,
      label: s.name || "Unnamed evaluator",
      subtext: s.subject || "General",
      icon: <User className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
    }))
  ], [smes]);

  return (
    <div className="relative z-30 bg-white/90 dark:bg-[#131317]/90 border border-slate-100 dark:border-slate-800/80 p-4 rounded-2xl shadow-card backdrop-blur-md flex flex-col gap-3.5 w-full">
      {/* Row 1 — filters: labelled, searchable, keyboard-operable comboboxes */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex flex-1 flex-col sm:flex-row flex-wrap gap-3">
          <div className="min-w-[220px] flex-1 sm:max-w-xs">
            <Combobox
              label="Evaluator"
              value={selectedSmeId}
              onChange={onSelectSme}
              options={evaluatorFilterOptions}
              placeholder="All Evaluators"
              searchPlaceholder="Search evaluators..."
            />
          </div>
          <div className="min-w-[220px] flex-1 sm:max-w-xs">
            <Combobox
              label="Campus"
              value={selectedCollegeId}
              onChange={onSelectCollege}
              options={campusFilterOptions}
              placeholder="All Colleges"
              searchPlaceholder="Search campuses..."
            />
          </div>
          <div className="min-w-[220px] flex-1 sm:max-w-xs">
            <Combobox
              label="Department"
              value={selectedGroupId}
              onChange={onSelectGroup}
              options={departmentFilterOptions}
              placeholder="All Departments"
              searchPlaceholder="Search departments..."
            />
          </div>

          <div className="min-w-[220px] flex-1 sm:max-w-[240px]">
            <span
              id="lnd-week-control-label"
              className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block"
            >
              Visible Week
            </span>
            <div
              role="group"
              aria-labelledby="lnd-week-control-label"
              className="mt-1 flex items-center gap-1 p-1 bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-slate-800 rounded-2xl"
            >
              <Button
                variant="outline"
                size="sm"
                aria-label="Previous week"
                className="h-7 w-7 p-0"
                icon={<ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => onWeekOffset(-1)}
              />
              <div className="flex-1 min-w-0 text-center px-1">
                <div className="text-[11px] font-black text-slate-800 dark:text-slate-100 leading-tight">
                  Week {selectedWeek}
                </div>
                <div className="text-[9px] font-bold text-slate-400 truncate leading-tight">{weekRangeLabel}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label="Next week"
                className="h-7 w-7 p-0"
                icon={<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                onClick={() => onWeekOffset(1)}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 lg:mb-1.5 shrink-0 self-start lg:self-auto">
          {!isCurrentWeek && (
            <Button
              variant="outline"
              size="sm"
              icon={<Calendar className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={onThisWeek}
            >
              This week
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={lndActiveFilters.length === 0}
            onClick={onClearFilters}
            icon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <p role="status" className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
        {lndActiveFilters.length === 0
          ? `Showing all ${smes.length} evaluators · ${colleges.length} campuses · ${mentors.length} mentors.`
          : `Filtered by ${lndActiveFilters.join(" → ")} · ${
              selectedSmeId === "all"
                ? `${gridScopeSmes.length} evaluator${gridScopeSmes.length === 1 ? "" : "s"} in the unified matrix`
                : `1 evaluator card`
            }.`}
      </p>

      {/* Evaluator switch: All → unified matrix, one evaluator → that week card */}
      <LndEvaluatorPills
        smes={gridScopeSmes}
        selectedId={selectedSmeId}
        onSelect={onSelectSme}
      />

      {/* Status indicators (Lite Pastel Legend matching Excel) & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[10px] font-black uppercase text-slate-400 mr-1">Legend:</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-mint-50 text-mint-800 dark:bg-mint-950/40 dark:text-mint-300 border border-mint-200/70 dark:border-mint-800/50">
            <span className="h-2 w-2 rounded-full bg-mint-500 shrink-0" />
            Free Slot
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300 border border-pink-200/70 dark:border-pink-800/50">
            <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
            Confirmed Booked
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/50">
            <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
            Training Window
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/50">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            SME on Leave
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/70 dark:border-slate-700">
            <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
            Off-Duty
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800">
            <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
            Holiday
          </span>
        </div>

        {/* View Mode Toggle */}
        <div
          role="group"
          aria-label="Grid view mode"
          className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700"
        >
          <button
            type="button"
            aria-pressed={gridDisplayMode === "master"}
            onClick={() => onGridDisplayMode("master")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
              gridDisplayMode === "master"
                ? "bg-white dark:bg-[#131317] text-zinc-900 dark:text-zinc-100 shadow-2xs ring-1 ring-inset ring-amber-500/40"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {gridDisplayMode === "master" ? <Check className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />}
            <span>Master Grid (SME Settings)</span>
          </button>
          <button
            type="button"
            aria-pressed={gridDisplayMode === "periods"}
            onClick={() => onGridDisplayMode("periods")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
              gridDisplayMode === "periods"
                ? "bg-white dark:bg-[#131317] text-zinc-900 dark:text-zinc-100 shadow-2xs ring-1 ring-inset ring-amber-500/40"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {gridDisplayMode === "periods" ? <Check className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /> : <Table className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>Campus Period View</span>
          </button>
        </div>
      </div>

    </div>
  );
}
