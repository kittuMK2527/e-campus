"use client";

import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface KAMKpiCardProps {
  label: string;
  value: string | number;
  badge?: {
    text: string;
    type?: "positive" | "negative" | "warning" | "neutral";
  };
  icon: React.ComponentType<{ className?: string }>;
  accentColor?: "emerald" | "amber" | "indigo" | "rose" | "zinc" | "cyan";
  onClick?: () => void;
}

const BADGE_STYLES = {
  positive: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40",
  negative: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40",
  neutral: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
};

const ACCENT_STYLES = {
  emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400",
  amber: "text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400",
  indigo: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-400",
  rose: "text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-400",
  cyan: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-400",
  zinc: "text-zinc-800 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200"
};

export const KAMKpiCard: React.FC<KAMKpiCardProps> = ({
  label,
  value,
  badge,
  icon: Icon,
  accentColor = "zinc",
  onClick
}) => {
  const badgeType = badge?.type || "neutral";

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-zinc-900/90 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-zinc-800 shadow-sm transition-all duration-200 ${
        onClick ? "cursor-pointer hover:border-amber-500/50 hover:shadow-md" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider truncate">
          {label}
        </span>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${ACCENT_STYLES[accentColor]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          {value}
        </span>
        {badge && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${
              BADGE_STYLES[badgeType]
            }`}
          >
            {badgeType === "positive" && <TrendingUp className="w-3 h-3" />}
            {badgeType === "negative" && <TrendingDown className="w-3 h-3" />}
            {badgeType === "neutral" && <Minus className="w-2.5 h-2.5" />}
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
};

