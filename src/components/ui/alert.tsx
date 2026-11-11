import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "default" | "info" | "success" | "warning" | "destructive";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  icon?: React.ReactNode;
}

const variantStyles: Record<AlertVariant, { container: string; icon: React.ReactNode }> = {
  default: {
    container: "bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-200",
    icon: <Info className="h-4 w-4 text-slate-500" />,
  },
  info: {
    container: "bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200",
    icon: <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
  },
  success: {
    container: "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  },
  warning: {
    container: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  },
  destructive: {
    container: "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200",
    icon: <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
  },
};

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", icon, children, ...props }, ref) => {
    const styles = variantStyles[variant];
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          "flex gap-3 rounded-xl border p-4 text-xs font-medium",
          styles.container,
          className
        )}
        {...props}
      >
        <span className="shrink-0 mt-0.5">{icon ?? styles.icon}</span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  }
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("font-extrabold text-xs leading-tight mb-1", className)}
      {...props}
    />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-[11px] leading-relaxed font-medium", className)} {...props} />
  )
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
