import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  containerClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => {
    // If className specifies custom width or auto width, don't force w-full on container
    const isAutoOrCustomWidth = Boolean(
      className && /(^|\s)(w-auto|w-fit|w-\[\d|min-w-|flex-1|flex-auto|inline-)(\s|$)/.test(className)
    );

    return (
      <div
        className={cn(
          "relative",
          isAutoOrCustomWidth ? "w-auto inline-flex items-center" : "w-full",
          containerClassName
        )}
      >
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
    );
  }
);
Select.displayName = "Select";

export { Select };
