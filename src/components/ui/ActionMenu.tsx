"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { MoreVertical, MoreHorizontal, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./dropdown-menu";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  id?: string;
  label: string;
  icon?: LucideIcon | React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
  isSeparatorBefore?: boolean;
  badge?: string | number;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  trigger?: React.ReactNode;
  triggerLabel?: string;
  triggerVariant?: "icon" | "button" | "ghost";
  triggerClassName?: string;
  icon?: LucideIcon;
  align?: "start" | "end" | "center";
  className?: string;
  menuClassName?: string;
  ariaLabel?: string;
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
  items,
  trigger,
  triggerLabel = "Actions",
  triggerVariant = "icon",
  triggerClassName,
  icon: CustomIcon,
  align = "end",
  className,
  menuClassName,
  ariaLabel = "Action Menu",
}) => {
  const IconComponent = CustomIcon || (triggerVariant === "button" ? ChevronDown : MoreVertical);
  const resolvedTriggerClassName = triggerClassName || className;

  const defaultTrigger = triggerVariant === "button" ? (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141419] text-slate-700 dark:text-slate-200 text-xs font-bold shadow-2xs hover:bg-slate-50 dark:hover:bg-white/5 transition-all cursor-pointer min-h-[36px]",
        resolvedTriggerClassName
      )}
    >
      <span>{triggerLabel}</span>
      <IconComponent className="h-3.5 w-3.5 text-slate-400 shrink-0" />
    </button>
  ) : (
    <button
      type="button"
      aria-label={ariaLabel}
      title={triggerLabel}
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 min-h-[36px] min-w-[36px] rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#141419] text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer shadow-2xs",
        resolvedTriggerClassName
      )}
    >
      <IconComponent className="h-4 w-4 shrink-0" />
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn("min-w-[180px] p-1.5 z-50", menuClassName)}>
        {items.map((item, idx) => {
          const renderIcon = () => {
            if (!item.icon) return null;
            if (React.isValidElement(item.icon)) {
              return <span className="h-4 w-4 shrink-0 flex items-center justify-center">{item.icon}</span>;
            }
            const IconCmp = item.icon as LucideIcon;
            return <IconCmp className="h-3.5 w-3.5 shrink-0 opacity-70" />;
          };

          return (
            <React.Fragment key={item.id || `${item.label}_${idx}`}>
              {item.isSeparatorBefore && <DropdownMenuSeparator />}
              <DropdownMenuItem
                disabled={item.disabled}
                onClick={item.onClick}
                className={cn(
                  "flex items-center justify-between gap-2.5 px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors",
                  item.variant === "destructive"
                    ? "text-rose-600 focus:bg-rose-50 focus:text-rose-700 dark:focus:bg-rose-950/30"
                    : "text-slate-700 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-white/5"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {renderIcon()}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {item.badge}
                  </span>
                )}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
