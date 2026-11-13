"use client";

import React, { useState, type ReactNode } from "react";
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterBarProps {
  children?: ReactNode;
  /** Secondary cluster (bulk actions, exports) pinned to the end of the row. */
  aside?: ReactNode;
  className?: string;
  /** Optional integrated search query value */
  searchValue?: string;
  /** Optional search change callback */
  onSearchChange?: (value: string) => void;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Count of active non-default filters */
  activeCount?: number;
  /** Callback to reset all filters */
  onReset?: () => void;
  /** Enable collapsible drawer/accordion on screens < 768px */
  collapsibleMobile?: boolean;
}

/**
 * Standardized Unified FilterBar Primitive
 * Provides debounced/controlled search, active filter indicators, reset action,
 * and responsive mobile collapsing while maintaining exact alignment with table grids.
 */
export function FilterBar({
  children,
  aside,
  className,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search records...",
  activeCount = 0,
  onReset,
  collapsibleMobile = false,
}: FilterBarProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const hasSearch = onSearchChange !== undefined;

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-100 dark:border-white/5 bg-white dark:bg-[#101015] shadow-card p-3 sm:p-3.5 space-y-2.5",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left Side: Search + Primary Controls */}
        <div className="flex flex-1 flex-wrap items-center gap-2.5 min-w-0">
          {hasSearch && (
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchValue || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full pl-8.5 pr-8 py-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-[#141419] text-xs font-bold text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-md cursor-pointer transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Desktop inline children */}
          <div className={cn("hidden md:flex flex-wrap items-center gap-2", !collapsibleMobile && "flex")}>
            {children}
          </div>

          {/* Mobile toggle button if collapsibleMobile is active */}
          {collapsibleMobile && children && (
            <button
              type="button"
              onClick={() => setMobileExpanded((prev) => !prev)}
              className={cn(
                "md:hidden min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer",
                mobileExpanded || activeCount > 0
                  ? "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
                  : "bg-slate-50 border-slate-200 text-slate-700 dark:bg-[#141419] dark:border-white/10 dark:text-slate-300"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeCount > 0 && (
                <span className="h-5 w-5 rounded-full bg-amber-600 text-white font-extrabold text-[10px] flex items-center justify-center">
                  {activeCount}
                </span>
              )}
              {mobileExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}

          {/* Active indicator & Reset button */}
          {activeCount > 0 && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="min-h-[36px] px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset ({activeCount})</span>
            </button>
          )}
        </div>

        {/* Right Side: Aside Action Cluster (Export, Add, etc.) */}
        {aside && <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">{aside}</div>}
      </div>

      {/* Mobile Collapsible Body */}
      {collapsibleMobile && mobileExpanded && children && (
        <div className="md:hidden pt-3 border-t border-slate-100 dark:border-white/5 flex flex-col gap-2.5 animate-fadeIn">
          {children}
        </div>
      )}
    </div>
  );
}
