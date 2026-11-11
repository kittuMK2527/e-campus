import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  meta,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col gap-3 pb-4 mb-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-amber-500 shadow-card">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-extrabold leading-snug tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] md:text-[13px] leading-tight text-slate-500 font-medium mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {(meta || actions) && (
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0 sm:justify-end">
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}
