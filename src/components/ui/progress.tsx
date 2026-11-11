import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  variant?: "default" | "success" | "warning" | "danger" | "brand";
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
}

const variantMap: Record<NonNullable<ProgressProps["variant"]>, string> = {
  default: "bg-indigo-500",
  brand: "bg-gradient-to-r from-indigo-500 to-purple-600",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
};

const sizeMap: Record<NonNullable<ProgressProps["size"]>, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
  lg: "h-3",
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      className,
      value = 0,
      max = 100,
      variant = "default",
      size = "sm",
      showLabel = false,
      ...props
    },
    ref
  ) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        <div
          className={cn(
            "w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800",
            sizeMap[size]
          )}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={`${Math.round(pct)}%`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              variantMap[variant]
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {showLabel && (
          <span className="mt-1 block text-right text-[10px] font-bold text-slate-500">
            {Math.round(pct)}%
          </span>
        )}
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
