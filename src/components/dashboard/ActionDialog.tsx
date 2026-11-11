"use client";

import React, { useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button, ButtonVariant } from "@/components/ui/button";

export interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  isLoading?: boolean;
  confirmVariant?: ButtonVariant;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  isLoading = false,
  confirmVariant = "gradient",
  maxWidth = "lg",
  className
}: ActionDialogProps) {
  // Escape key dismiss
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, isLoading, onOpenChange]);

  if (!open) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl"
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn font-sans"
    >
      {/* Backdrop click to dismiss */}
      <div
        className="fixed inset-0 cursor-pointer"
        onClick={() => {
          if (!isLoading) onOpenChange(false);
        }}
      />

      <div
        className={cn(
          "relative z-10 w-full bg-white dark:bg-[#131317] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card-lg p-6 space-y-5 animate-scaleUp max-h-[90vh] flex flex-col",
          maxWidthClasses[maxWidth],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center shrink-0 shadow-xs">
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                {title}
              </h3>
              {description && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
          {children}
        </div>

        {/* Footer (if confirm or cancel exists) */}
        {(confirmLabel || onConfirm) && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>

            <Button
              type="button"
              variant={confirmVariant}
              isLoading={isLoading}
              onClick={onConfirm}
            >
              {confirmLabel || "Confirm"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActionDialog;
