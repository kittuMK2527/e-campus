"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Search, Building2, Calendar, Filter, X } from "lucide-react";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";

export interface FilterBarProps {
  // Campus Scope
  campusScope?: string;
  onCampusChange?: (campusId: string) => void;
  campusOptions?: ComboboxOption[];
  showCampusFilter?: boolean;

  // Search
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;

  // Date
  dateValue?: string;
  onDateChange?: (date: string) => void;
  fromDate?: string;
  toDate?: string;
  onFromDateChange?: (date: string) => void;
  onToDateChange?: (date: string) => void;
  showDateFilter?: boolean;

  // Right-aligned Actions Slot
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  campusScope,
  onCampusChange,
  campusOptions = [],
  showCampusFilter = false,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  dateValue,
  onDateChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  showDateFilter = false,
  actions,
  className
}: FilterBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onSearchChange) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        if (tag !== "input" && tag !== "textarea" && tag !== "select") {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      } else if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        onSearchChange("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearchChange]);

  return (
    <div
      className={cn(
        "p-3 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#131317] shadow-card flex flex-wrap items-center justify-between gap-3",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
        {/* Search */}
        {onSearchChange && (
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-sunken dark:bg-[#181820] border border-slate-200 inset-shadow-well dark:border-slate-800 rounded-2xl font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:bg-white dark:focus:bg-[#131317] focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-colors"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer transition-colors"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Campus Scope Selector */}
        {showCampusFilter && onCampusChange && campusOptions.length > 0 && (
          <div className="min-w-[180px] max-w-xs">
            <Combobox
              ariaLabel="Filter by campus"
              value={campusScope || "all"}
              onChange={onCampusChange}
              options={campusOptions}
              placeholder="Select Campus..."
              searchable
            />
          </div>
        )}

        {/* Date Filter */}
        {showDateFilter && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-1.5 bg-slate-50 dark:bg-[#181820] text-xs font-bold text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">From:</span>
              <input
                type="date"
                aria-label="From Date"
                value={fromDate || dateValue || ""}
                onChange={(e) => {
                  if (onFromDateChange) onFromDateChange(e.target.value);
                  else if (onDateChange) onDateChange(e.target.value);
                }}
                className="bg-transparent outline-none cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200"
              />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">To:</span>
              <input
                type="date"
                aria-label="To Date"
                value={toDate || dateValue || ""}
                onChange={(e) => {
                  if (onToDateChange) onToDateChange(e.target.value);
                  else if (onDateChange) onDateChange(e.target.value);
                }}
                className="bg-transparent outline-none cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const to = now.toISOString().split("T")[0];
                  const d = new Date();
                  d.setDate(d.getDate() - 6);
                  const from = d.toISOString().split("T")[0];
                  if (onFromDateChange) onFromDateChange(from);
                  if (onToDateChange) onToDateChange(to);
                  else if (onDateChange) onDateChange(from);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181820] hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const to = now.toISOString().split("T")[0];
                  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
                  if (onFromDateChange) onFromDateChange(from);
                  if (onToDateChange) onToDateChange(to);
                  else if (onDateChange) onDateChange(from);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181820] hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const to = now.toISOString().split("T")[0];
                  const d = new Date();
                  d.setDate(d.getDate() - 29);
                  const from = d.toISOString().split("T")[0];
                  if (onFromDateChange) onFromDateChange(from);
                  if (onToDateChange) onToDateChange(to);
                  else if (onDateChange) onDateChange(from);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181820] hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                Last 30 Days
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons Slot */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

export default FilterBar;
