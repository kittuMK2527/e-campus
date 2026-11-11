import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-xl border border-slate-200/90 dark:border-slate-800 bg-sunken dark:bg-[#181820] inset-shadow-well px-3.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-[#131317] focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
