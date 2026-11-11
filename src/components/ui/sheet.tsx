"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

interface SheetContentProps {
  children: React.ReactNode;
  side?: "left" | "right";
  className?: string;
  /** Width class — defaults to "w-[92vw] max-w-5xl" */
  width?: string;
}

interface SheetHeaderProps {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

interface SheetTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface SheetDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

/* ─── Root ─── */
const Sheet: React.FC<SheetProps> = ({ open, onOpenChange, children }) => {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (typeof window === "undefined") return null;
  return createPortal(
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>,
    document.body
  );
};

const SheetContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({ open: false, onOpenChange: () => {} });

/* ─── Content (the panel itself) ─── */
const SheetContent: React.FC<SheetContentProps> = ({
  children,
  side = "right",
  className,
  width = "w-[92vw] max-w-5xl",
}) => {
  const { open, onOpenChange } = React.useContext(SheetContext);
  const panelRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const slideFrom = side === "right"
    ? "translate-x-full data-[open=true]:translate-x-0"
    : "-translate-x-full data-[open=true]:-translate-x-0";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        data-open={open}
        className={cn(
          "fixed top-0 bottom-0 z-[61] flex flex-col bg-white border-l border-slate-200 shadow-card-lg",
          "transition-transform duration-300 ease-out",
          "animate-slide-in-right",
          side === "right" ? "right-0" : "left-0",
          width,
          className
        )}
      >
        {children}
      </div>
    </>
  );
};

/* ─── Header ─── */
const SheetHeader: React.FC<SheetHeaderProps> = ({ children, className, onClose }) => {
  const { onOpenChange } = React.useContext(SheetContext);
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 shrink-0 bg-white",
      className
    )}>
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={() => (onClose ? onClose() : onOpenChange(false))}
        className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer shrink-0"
        aria-label="Close panel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

/* ─── Title ─── */
const SheetTitle: React.FC<SheetTitleProps> = ({ children, className }) => (
  <h2 className={cn("text-sm font-black text-slate-900 leading-tight truncate", className)}>
    {children}
  </h2>
);

/* ─── Description ─── */
const SheetDescription: React.FC<SheetDescriptionProps> = ({ children, className }) => (
  <p className={cn("text-[10px] font-semibold text-slate-400 mt-0.5 truncate", className)}>
    {children}
  </p>
);

/* ─── Body (scrollable area) ─── */
const SheetBody: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("flex-1 overflow-y-auto overflow-x-hidden", className)}>
    {children}
  </div>
);

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody };
