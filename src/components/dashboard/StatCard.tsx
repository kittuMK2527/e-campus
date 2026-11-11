"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export type StatCardColor = "brand" | "indigo" | "emerald" | "amber" | "rose" | "slate";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  color?: StatCardColor;
  className?: string;
  onClick?: () => void;
  isLoading?: boolean;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = "brand",
  className,
  onClick,
  isLoading = false
}: StatCardProps) {
  if (isLoading) {
    return (
      <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#131317] space-y-3 shadow-card">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-2.5 w-32" />
      </div>
    );
  }

  const iconTints: Record<StatCardColor, string> = {
    brand: "bg-[#4F46E5]/10 text-[#4F46E5] dark:text-[#818CF8] border-[#4F46E5]/20",
    indigo: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800",
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#131317]",
        "shadow-card hover:shadow-card-lg hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200",
        onClick && "cursor-pointer active:scale-[0.99]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block truncate">
            {title}
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {value !== undefined && value !== null ? value : "—"}
          </div>
        </div>

        {icon && (
          <div
            className={cn(
              "h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 shadow-xs",
              iconTints[color]
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[11px] gap-2">
          {subtitle && (
            <span className="text-slate-500 dark:text-slate-400 font-medium truncate">
              {subtitle}
            </span>
          )}

          {trend && (
            <div
              className={cn(
                "inline-flex items-center gap-1 font-bold text-[10px] ml-auto shrink-0",
                trend.isPositive !== false
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              )}
            >
              {trend.isPositive !== false ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>{trend.value}</span>
              {trend.label && (
                <span className="text-slate-400 font-normal">{trend.label}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StatCard;
