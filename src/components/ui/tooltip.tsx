"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
}

interface TooltipContextValue {
  delayDuration: number;
}

const TooltipContext = React.createContext<TooltipContextValue>({ delayDuration: 400 });

export function TooltipProvider({ children, delayDuration = 400 }: TooltipProviderProps) {
  return (
    <TooltipContext.Provider value={{ delayDuration }}>
      {children}
    </TooltipContext.Provider>
  );
}

interface TooltipState {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const TooltipStateContext = React.createContext<TooltipState | null>(null);

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  return (
    <TooltipStateContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-flex">{children}</div>
    </TooltipStateContext.Provider>
  );
}

export function TooltipTrigger({
  asChild,
  children,
  className,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(TooltipStateContext);
  const { delayDuration } = React.useContext(TooltipContext);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!ctx) throw new Error("TooltipTrigger must be inside Tooltip");

  const handlers = {
    onMouseEnter: () => {
      timerRef.current = setTimeout(() => ctx.setOpen(true), delayDuration);
    },
    onMouseLeave: () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ctx.setOpen(false);
    },
    onFocus: () => ctx.setOpen(true),
    onBlur: () => ctx.setOpen(false),
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref: (node: HTMLElement | null) => {
        ctx.triggerRef.current = node;
        const childRef = (children as any).ref;
        if (typeof childRef === "function") childRef(node);
        else if (childRef && "current" in childRef) (childRef as any).current = node;
      },
      ...handlers,
    });
  }

  return (
    <span
      ref={ctx.triggerRef as React.RefObject<HTMLSpanElement>}
      className={cn("inline-flex", className)}
      {...handlers}
    >
      {children}
    </span>
  );
}

export function TooltipContent({
  children,
  side = "top",
  className,
  sideOffset = 6,
}: {
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  sideOffset?: number;
}) {
  const ctx = React.useContext(TooltipStateContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!ctx?.open || !ctx.triggerRef.current) return;
    const rect = ctx.triggerRef.current.getBoundingClientRect();
    const tip = ref.current;
    const tipW = tip?.offsetWidth ?? 120;
    const tipH = tip?.offsetHeight ?? 32;

    let top = 0;
    let left = 0;

    if (side === "top") {
      top = rect.top - tipH - sideOffset;
      left = rect.left + rect.width / 2 - tipW / 2;
    } else if (side === "bottom") {
      top = rect.bottom + sideOffset;
      left = rect.left + rect.width / 2 - tipW / 2;
    } else if (side === "left") {
      top = rect.top + rect.height / 2 - tipH / 2;
      left = rect.left - tipW - sideOffset;
    } else {
      top = rect.top + rect.height / 2 - tipH / 2;
      left = rect.right + sideOffset;
    }

    // Clamp to viewport
    top = Math.max(8, Math.min(top, window.innerHeight - tipH - 8));
    left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
    setCoords({ top, left });
  }, [ctx?.open, side, sideOffset, ctx?.triggerRef]);

  if (!mounted || !ctx?.open) return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 99999 }}
      className={cn(
        "px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-[11px] font-semibold shadow-card-lg pointer-events-none animate-fadeIn max-w-[220px] text-center",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
