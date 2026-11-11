"use client";

/**
 * chart.tsx — Re-exports Recharts primitives with our design token overrides.
 * Usage is identical to shadcn/ui's chart component.
 */
export {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  RadialBarChart,
  RadialBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
} from "recharts";

import type { CSSProperties } from "react";
import React from "react";
import { cn } from "@/lib/utils";

/** A chart container with consistent aspect ratio and font. */
export function ChartContainer({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("w-full font-sans text-[11px]", className)}
      style={style}
    >
      {children}
    </div>
  );
}

/** Tooltip content matching our design system. */
export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: any, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card-lg text-xs dark:border-slate-700 dark:bg-slate-900">
      {label && (
        <p className="mb-1.5 font-extrabold text-slate-700 dark:text-slate-200">
          {label}
        </p>
      )}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: entry.color }}
          />
          <span className="text-slate-500 dark:text-slate-400">
            {entry.name}:
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
