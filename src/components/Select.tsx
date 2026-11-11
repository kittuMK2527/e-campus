import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: (SelectOption | string)[];
  error?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options = [],
  error,
  className = "",
  id,
  ...rest
}) => {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  const normalizedOptions: SelectOption[] = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider block"
        >
          {label}
        </label>
      )}
      <div className="relative w-full">
        <select
          id={selectId}
          {...rest}
          className={cn(
            "w-full appearance-none bg-white dark:bg-[#181820] border border-slate-200/90 dark:border-slate-800 rounded-2xl pl-3.5 pr-9 py-2 h-9 text-xs",
            "font-bold text-slate-800 dark:text-slate-100 cursor-pointer shadow-2xs",
            "hover:border-slate-300 dark:hover:border-slate-700",
            "focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500",
            "transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
            error && "border-rose-400 focus:ring-rose-200",
            className
          )}
        >
          {normalizedOptions.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-white dark:bg-[#181820] text-slate-800 dark:text-slate-100 font-semibold"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
          strokeWidth={2.4}
        />
      </div>
      {error && (
        <p className="text-[11px] text-rose-500 font-semibold mt-0.5">{error}</p>
      )}
    </div>
  );
};

export default Select;
