"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface RadioGroupContextValue {
  value: string;
  onValueChange: (v: string) => void;
  name: string;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ value: controlled, defaultValue = "", onValueChange, name, className, children, ...props }, ref) => {
    const uid = React.useId();
    const [internal, setInternal] = React.useState(defaultValue);
    const value = controlled !== undefined ? controlled : internal;

    const handleChange = (v: string) => {
      if (controlled === undefined) setInternal(v);
      onValueChange?.(v);
    };

    return (
      <RadioGroupContext.Provider value={{ value, onValueChange: handleChange, name: name ?? uid }}>
        <div ref={ref} role="radiogroup" className={cn("flex flex-col gap-2", className)} {...props}>
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  }
);
RadioGroup.displayName = "RadioGroup";

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string;
  label?: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ value, label, className, id, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext);
    if (!ctx) throw new Error("RadioGroupItem must be inside RadioGroup");
    const uid = React.useId();
    const itemId = id ?? uid;
    const isChecked = ctx.value === value;

    return (
      <div className="inline-flex items-center gap-2">
        <div className="relative flex items-center justify-center">
          <input
            ref={ref}
            id={itemId}
            type="radio"
            name={ctx.name}
            value={value}
            checked={isChecked}
            onChange={() => ctx.onValueChange(value)}
            className="sr-only peer"
            {...props}
          />
          <label
            htmlFor={itemId}
            className={cn(
              "flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-2 transition-all",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500/40 peer-focus-visible:ring-offset-2",
              isChecked
                ? "border-zinc-900 dark:border-amber-400 bg-zinc-900 dark:bg-zinc-900"
                : "border-slate-300 dark:border-slate-600 hover:border-amber-400",
              className
            )}
          >
            {isChecked && (
              <span className="h-2 w-2 rounded-full bg-amber-400" />
            )}
          </label>
        </div>
        {label && (
          <label
            htmlFor={itemId}
            className="text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
