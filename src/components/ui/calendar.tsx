"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export interface CalendarProps {
  selected?: Date | Date[];
  onSelect?: (date: Date) => void;
  mode?: "single" | "multiple" | "range";
  disabled?: (date: Date) => boolean;
  className?: string;
  /** Highlight specific dates */
  modifiers?: Record<string, Date[]>;
  modifiersClassNames?: Record<string, string>;
}

export function Calendar({
  selected,
  onSelect,
  mode = "single",
  disabled,
  className,
  modifiers,
  modifiersClassNames,
}: CalendarProps) {
  const today = new Date();
  const selectedDate = Array.isArray(selected) ? selected[0] : selected;

  const [viewYear, setViewYear] = React.useState(
    selectedDate?.getFullYear() ?? today.getFullYear()
  );
  const [viewMonth, setViewMonth] = React.useState(
    selectedDate?.getMonth() ?? today.getMonth()
  );

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const isSelected = (date: Date) => {
    if (!selected) return false;
    if (Array.isArray(selected)) return selected.some((s) => isSameDay(s, date));
    return isSameDay(selected, date);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));

  return (
    <div className={cn("p-4 bg-white dark:bg-[#131317] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card w-[280px] font-sans select-none", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={prevMonth}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="h-7 flex items-center justify-center text-[10px] font-extrabold uppercase text-slate-400">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((date, idx) => {
          if (!date) return <div key={`empty-${idx}`} className="h-8" />;
          const isToday = isSameDay(date, today);
          const sel = isSelected(date);
          const dis = disabled?.(date);

          // Check modifier classes
          let modClass = "";
          if (modifiers && modifiersClassNames) {
            for (const [key, dates] of Object.entries(modifiers)) {
              if (dates.some((d) => isSameDay(d, date))) {
                modClass = modifiersClassNames[key] ?? "";
                break;
              }
            }
          }

          return (
            <button
              key={date.getDate()}
              type="button"
              disabled={dis}
              onClick={() => !dis && onSelect?.(date)}
              aria-label={date.toLocaleDateString()}
              aria-pressed={sel}
              className={cn(
                "h-8 w-full rounded-lg text-xs font-semibold transition-all",
                sel
                  ? "bg-zinc-900 text-white font-extrabold shadow-xs ring-1 ring-amber-500/50"
                  : isToday
                  ? "border border-amber-500/70 text-amber-700 dark:text-amber-400 font-extrabold bg-amber-50/50 dark:bg-amber-950/20"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                dis && "opacity-30 cursor-not-allowed",
                modClass
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
