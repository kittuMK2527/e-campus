import * as React from "react";
import { cn } from "@/lib/utils";

interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * InputGroup — wraps an Input with prefix/suffix icons or text.
 * Usage:
 *   <InputGroup>
 *     <InputGroupPrefix><Search className="h-3.5 w-3.5" /></InputGroupPrefix>
 *     <Input ... />
 *   </InputGroup>
 */
const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex items-center w-full", className)} {...props} />
  )
);
InputGroup.displayName = "InputGroup";

const InputGroupPrefix = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-slate-400 pointer-events-none z-10",
        className
      )}
      {...props}
    />
  )
);
InputGroupPrefix.displayName = "InputGroupPrefix";

const InputGroupSuffix = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-slate-400 z-10",
        className
      )}
      {...props}
    />
  )
);
InputGroupSuffix.displayName = "InputGroupSuffix";

export { InputGroup, InputGroupPrefix, InputGroupSuffix };
