import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          "appearance-none flex h-9 w-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#181820] pl-3.5 pr-9 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs transition-all hover:border-slate-300 dark:hover:border-slate-700 focus:outline-none focus:bg-white dark:focus:bg-[#131317] focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        strokeWidth={2.4}
      />
    </div>
  )
);
Select.displayName = "Select";

export { Select };
