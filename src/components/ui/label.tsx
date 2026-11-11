import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block",
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-rose-500" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
);
Label.displayName = "Label";

export { Label };
