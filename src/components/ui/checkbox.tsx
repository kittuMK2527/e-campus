"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { box: "h-3.5 w-3.5", icon: "h-2.5 w-2.5" },
  md: { box: "h-4 w-4", icon: "h-3 w-3" },
  lg: { box: "h-5 w-5", icon: "h-3.5 w-3.5" },
};

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      className,
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      label,
      size = "md",
      id,
      ...props
    },
    ref
  ) => {
    const [uncontrolled, setUncontrolled] = React.useState(defaultChecked);
    const isChecked = controlledChecked !== undefined ? controlledChecked : uncontrolled;
    const isIndeterminate = isChecked === "indeterminate";
    const isOn = isChecked === true;
    const uid = React.useId();
    const checkId = id ?? uid;
    const sz = sizeMap[size];

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      props.onClick?.(e);
      const next = isChecked === "indeterminate" ? true : !isChecked;
      if (controlledChecked === undefined) setUncontrolled(next as boolean);
      onCheckedChange?.(next as boolean);
    };

    return (
      <div className="inline-flex items-center gap-2">
        <button
          ref={ref}
          id={checkId}
          type="button"
          role="checkbox"
          aria-checked={isIndeterminate ? "mixed" : isOn}
          disabled={disabled}
          onClick={handleClick}
          className={cn(
            "shrink-0 rounded-md border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center",
            sz.box,
            isOn || isIndeterminate
              ? "bg-zinc-900 border-zinc-900 dark:bg-zinc-100 dark:border-zinc-100"
              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-[#131317] hover:border-amber-400",
            className
          )}
          {...props}
        >
          {isIndeterminate ? (
            <Minus className={cn(sz.icon, "text-amber-400 dark:text-zinc-900 stroke-[3]")} />
          ) : isOn ? (
            <Check className={cn(sz.icon, "text-amber-400 dark:text-zinc-900 stroke-[3]")} />
          ) : null}
        </button>
        {label && (
          <label
            htmlFor={checkId}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
