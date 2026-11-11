"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      className,
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      size = "md",
      ...props
    },
    ref
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] = React.useState(defaultChecked);
    const isChecked = controlledChecked !== undefined ? controlledChecked : uncontrolledChecked;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      props.onClick?.(e);
      const nextChecked = !isChecked;
      if (controlledChecked === undefined) {
        setUncontrolledChecked(nextChecked);
      }
      onCheckedChange?.(nextChecked);
    };

    const sizeClasses = {
      sm: {
        container: "h-5 w-9",
        thumb: "h-3.5 w-3.5",
        translateChecked: "translate-x-4",
        translateUnchecked: "translate-x-0.5"
      },
      md: {
        container: "h-6 w-11",
        thumb: "h-4.5 w-4.5",
        translateChecked: "translate-x-5.5",
        translateUnchecked: "translate-x-0.5"
      },
      lg: {
        container: "h-7 w-14",
        thumb: "h-5.5 w-5.5",
        translateChecked: "translate-x-7.5",
        translateUnchecked: "translate-x-0.5"
      }
    }[size];

    return (
      <button
        type="button"
        role="switch"
        aria-checked={isChecked}
        ref={ref}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          sizeClasses.container,
          isChecked ? "bg-zinc-900 dark:bg-zinc-800 ring-1 ring-amber-500/30" : "bg-slate-200 dark:bg-slate-700",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none inline-block rounded-full shadow-md transform ring-0 transition duration-200 ease-in-out my-auto",
            isChecked ? "bg-amber-400" : "bg-white",
            sizeClasses.thumb,
            isChecked ? sizeClasses.translateChecked : sizeClasses.translateUnchecked
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };

