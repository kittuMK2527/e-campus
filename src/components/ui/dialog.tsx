"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  ariaLabel?: string;
  overlayClassName?: string;
  panelClassName?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const dialogStack: number[] = [];
let nextDialogId = 1;

const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  children,
  ariaLabel = "Dialog",
  overlayClassName,
  panelClassName,
}) => {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);
  const onOpenChangeRef = React.useRef(onOpenChange);
  const idRef = React.useRef(0);
  if (idRef.current === 0) idRef.current = nextDialogId++;

  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;

    const dialogId = idRef.current;
    dialogStack.push(dialogId);
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const node = panelRef.current;
      if (!node) return;
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node).focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== dialogId) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChangeRef.current(false);
        return;
      }
      if (event.key !== "Tab") return;

      const node = panelRef.current;
      if (!node) return;
      const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );

      if (focusable.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      const stackIndex = dialogStack.lastIndexOf(dialogId);
      if (stackIndex !== -1) dialogStack.splice(stackIndex, 1);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm font-sans animate-fadeIn",
        overlayClassName
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain bg-white dark:bg-[#131317] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card-lg p-4 sm:p-6 space-y-4 sm:space-y-5 text-slate-800 dark:text-slate-200 focus:outline-none animate-scaleUp",
          panelClassName
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 border-b border-slate-100 dark:border-slate-800 pb-3", className)} {...props} />
);

const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-sm font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center justify-between", className)} {...props} />
);

const DialogDescription = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("text-[10px] text-slate-400 font-semibold mt-0.5", className)} {...props} />
);

export { Dialog, DialogHeader, DialogTitle, DialogDescription };
