"use client";

import React from "react";

export interface LndStatsHeaderProps {
  /** Faculty hours booked this week across the current scope. */
  scheduledHours: number;
  /** Sum of every scoped faculty member's weekly quota target. */
  targetHours: number;
  /** Evaluators (SMEs) the filters leave in scope. */
  evaluatorCount: number;
  /** Demo windows an evaluator is sitting in with nothing booked. */
  openWindows: number;
  /** Every evaluator × day × window cell in the grid. */
  totalWindows: number;
  /** Confirmed sessions knocked loose by faculty leave. */
  leaveAffected: number;
  /** Reallocation proposals waiting on a decision. */
  pendingReallocations: number;
  /** Faculty whose weekly quota is already met. */
  quotaSatisfied: number;
  quotaTotal: number;
  /** Callback when user clicks the Action Required card to review pending reallocations. */
  onActionRequiredClick?: () => void;
}

const pctOf = (value: number, of: number) => (of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0);

/**
 * The single dashboard header. Replaces the two KPI strips that used to sit above the tabs and
 * inside the quota monitor; everything here is read off data the dashboard already derives,
 * so no extra queries or scans are introduced.
 */
export default function LndStatsHeader({
  scheduledHours,
  targetHours,
  evaluatorCount,
  openWindows,
  totalWindows,
  leaveAffected,
  pendingReallocations,
  quotaSatisfied,
  quotaTotal,
  onActionRequiredClick
}: LndStatsHeaderProps) {
  const progressPct = pctOf(scheduledHours, targetHours);
  const actionRequired = leaveAffected + pendingReallocations;
  const quotaPct = pctOf(quotaSatisfied, quotaTotal);

  return (
    <section
      aria-label="L&D allocation summary"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white/80 dark:bg-[#131317]/80 p-4 flex flex-col gap-2 shadow-card">
        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">
          Demo Allocation Progress
        </span>
        <span className="text-xl font-black leading-none text-slate-900 dark:text-white">
          {scheduledHours}
          <span className="text-sm font-bold text-slate-400"> / {targetHours}h</span>
        </span>
        <div
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Scheduled faculty hours against the weekly quota target"
          className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        >
          <div
            className="h-full rounded-full btn-gradient transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
          {progressPct}% of this week&apos;s quota
        </span>
      </div>

      <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white/80 dark:bg-[#131317]/80 p-4 flex flex-col gap-2 shadow-card">
        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">
          Evaluator Capacity
        </span>
        <span className="text-xl font-black leading-none text-slate-900 dark:text-white">
          {evaluatorCount}
          <span className="text-sm font-bold text-slate-400"> evaluator{evaluatorCount === 1 ? "" : "s"}</span>
        </span>
        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
          {openWindows} open demo window{openWindows === 1 ? "" : "s"}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          of {totalWindows} evaluator slots this week
        </span>
      </div>

      <div
        onClick={onActionRequiredClick}
        role={onActionRequiredClick ? "button" : undefined}
        tabIndex={onActionRequiredClick ? 0 : undefined}
        onKeyDown={(e) => {
          if (onActionRequiredClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onActionRequiredClick();
          }
        }}
        className={`rounded-xl border p-4 flex flex-col gap-2 shadow-xs transition-all ${
          onActionRequiredClick ? "cursor-pointer hover:scale-[1.02] active:scale-[0.98]" : ""
        } ${
          actionRequired > 0
            ? "border-amber-200/80 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20"
            : "border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#131317]/80"
        }`}
        title={onActionRequiredClick ? "Click to view Reallocation Queue in Demos tab" : undefined}
      >
        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">
          Action Required
        </span>
        <span
          className={`text-xl font-black leading-none ${
            actionRequired > 0 ? "text-amber-800 dark:text-amber-300" : "text-slate-900 dark:text-white"
          }`}
        >
          {actionRequired}
        </span>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
          {leaveAffected} leave-affected session{leaveAffected === 1 ? "" : "s"}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          {pendingReallocations} reallocation{pendingReallocations === 1 ? "" : "s"} awaiting approval
        </span>
      </div>

      <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white/80 dark:bg-[#131317]/80 p-4 flex flex-col gap-2 shadow-card">
        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">
          Faculty Quota Status
        </span>
        <span className="text-xl font-black leading-none text-slate-900 dark:text-white">
          {quotaSatisfied}
          <span className="text-sm font-bold text-slate-400"> / {quotaTotal} met</span>
        </span>
        <div
          role="progressbar"
          aria-valuenow={quotaPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of faculty who have met their weekly L&D quota"
          className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${quotaPct}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
          {quotaTotal - quotaSatisfied} faculty still short of their hours
        </span>
      </div>
    </section>
  );
}
