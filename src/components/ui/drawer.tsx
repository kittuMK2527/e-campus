"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerContextValue {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

interface DrawerProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Drawer({ open: controlled, defaultOpen = false, onOpenChange, children }: DrawerProps) {
  const [internal, setInternal] = React.useState(defaultOpen);
  const open = controlled !== undefined ? controlled : internal;

  const handleChange = (v: boolean) => {
    if (controlled === undefined) setInternal(v);
    onOpenChange?.(v);
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleChange(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <DrawerContext.Provider value={{ open, onOpenChange: handleChange }}>
      {children}
    </DrawerContext.Provider>
  );
}

export function DrawerTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactNode }) {
  const ctx = React.useContext(DrawerContext);
  if (!ctx) throw new Error("DrawerTrigger must be inside Drawer");

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        (children.props as any).onClick?.(e);
        ctx.onOpenChange(true);
      },
    });
  }
  return (
    <button type="button" onClick={() => ctx.onOpenChange(true)}>
      {children}
    </button>
  );
}

export function DrawerClose({ asChild, children, className }: { asChild?: boolean; children?: React.ReactNode; className?: string }) {
  const ctx = React.useContext(DrawerContext);
  if (!ctx) throw new Error("DrawerClose must be inside Drawer");

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: () => ctx.onOpenChange(false),
    });
  }
  return (
    <button type="button" onClick={() => ctx.onOpenChange(false)} className={className}>
      {children ?? <X className="h-4 w-4" />}
    </button>
  );
}

export function DrawerContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(DrawerContext);
  if (!ctx?.open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
        onClick={() => ctx.onOpenChange(false)}
      />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[61] flex flex-col max-h-[90vh] rounded-t-2xl border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131317] shadow-card-lg animate-slide-in-right",
          className
        )}
      >
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
        {children}
      </div>
    </>,
    document.body
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4 border-b border-slate-100 dark:border-slate-800", className)} {...props} />
  );
}

export function DrawerTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-black text-slate-900 dark:text-white", className)} {...props} />
  );
}

export function DrawerDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-slate-500 dark:text-slate-400 font-medium", className)} {...props} />
  );
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 justify-end", className)} {...props} />
  );
}
