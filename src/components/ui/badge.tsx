import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "brand" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-amber-50 text-amber-700 dark:bg-indigo-950/40 dark:text-amber-300 border-amber-200/60 shadow-xs",
    brand: "brand-gradient text-white border-transparent shadow-xs",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700",
    destructive: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200/60",
    outline: "text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 bg-white dark:bg-transparent",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60"
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-tight transition-colors",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
