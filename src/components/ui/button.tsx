import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "default"
  | "brand"
  | "primary"
  | "gradient"
  | "secondary"
  | "destructive"
  | "danger"
  | "success"
  | "warning"
  | "outline"
  | "ghost"
  | "link";

export type ButtonSize = "default" | "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      icon,
      isLoading = false,
      loadingText,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const variants: Record<ButtonVariant, string> = {
      default:
        "btn-gradient text-white shadow-xs hover:opacity-95 focus-visible:ring-2 focus-visible:ring-amber-500/50",
      brand:
        "bg-zinc-900 text-white hover:bg-zinc-800 shadow-xs border border-white/10 focus-visible:ring-2 focus-visible:ring-amber-500/50",
      primary:
        "bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 shadow-xs focus-visible:ring-2 focus-visible:ring-amber-500/50 border border-white/10",
      gradient:
        "btn-gradient text-white shadow-xs hover:opacity-95 focus-visible:ring-2 focus-visible:ring-amber-500/50",
      secondary:
        "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400 border-transparent",
      destructive:
        "bg-rose-500 text-white hover:bg-rose-600 shadow-xs hover:shadow-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-500/50 border-none",
      danger:
        "bg-rose-500 text-white hover:bg-rose-600 shadow-xs hover:shadow-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-500/50 border-none",
      success:
        "bg-emerald-500 text-white hover:bg-emerald-600 shadow-xs hover:shadow-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-500/50 border-none",
      warning:
        "bg-amber-400 text-slate-900 hover:bg-amber-500 shadow-xs hover:shadow-amber-400/20 focus-visible:ring-2 focus-visible:ring-amber-400/50 border-none",
      outline:
        "border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131317] text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 focus-visible:ring-2 focus-visible:ring-amber-500/30",
      ghost:
        "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-amber-500/30 border-transparent",
      link:
        "text-amber-600 hover:text-amber-700 underline-offset-4 hover:underline border-none"
    };

    const sizes: Record<ButtonSize, string> = {
      default: "h-9 px-4 py-2 text-xs",
      md: "h-9 px-4 py-2 text-xs",
      xs: "h-6 px-2 text-[10px]",
      sm: "h-7 px-3 text-[10px]",
      lg: "h-11 px-6 text-sm",
      icon: "h-9 w-9 p-0 flex items-center justify-center shrink-0"
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl font-extrabold transition-all outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-current" />
            {loadingText ? <span>{loadingText}</span> : children}
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
