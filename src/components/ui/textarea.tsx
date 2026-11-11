import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-sunken dark:bg-[#181820]/80 inset-shadow-well px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:bg-white dark:focus:bg-[#131317] focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
