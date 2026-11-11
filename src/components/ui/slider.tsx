"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue"> {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ value, defaultValue = [0], min = 0, max = 100, step = 1, onValueChange, className, ...props }, ref) => {
    const [internal, setInternal] = React.useState(defaultValue[0]);
    const current = value !== undefined ? value[0] : internal;
    const pct = ((current - min) / (max - min)) * 100;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      if (value === undefined) setInternal(next);
      onValueChange?.([next]);
    };

    return (
      <div className={cn("relative flex w-full touch-none items-center", className)}>
        <div className="relative w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="absolute h-full rounded-full bg-zinc-900 dark:bg-amber-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={handleChange}
          className="absolute w-full cursor-pointer opacity-0 h-5"
          {...props}
        />
        <div
          className="absolute h-5 w-5 rounded-full border-2 border-zinc-900 bg-amber-400 dark:border-amber-400 dark:bg-zinc-900 shadow-md transition-all"
          style={{ left: `calc(${pct}% - 10px)` }}
        />
      </div>
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
