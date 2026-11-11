"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface HoverCardContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const HoverCardContext = React.createContext<HoverCardContextValue | null>(null);

export function HoverCard({
  children,
  openDelay = 500,
  closeDelay = 200,
}: {
  children: React.ReactNode;
  openDelay?: number;
  closeDelay?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => setOpen(true), openDelay);
  };

  const handleClose = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), closeDelay);
  };

  return (
    <HoverCardContext.Provider value={{ open, setOpen, triggerRef }}>
      <div
        className="relative inline-block"
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        {children}
      </div>
    </HoverCardContext.Provider>
  );
}

export function HoverCardTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(HoverCardContext);
  if (!ctx) throw new Error("HoverCardTrigger must be inside HoverCard");

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref: ctx.triggerRef,
    });
  }
  return <span ref={ctx.triggerRef as React.RefObject<HTMLSpanElement>}>{children}</span>;
}

export function HoverCardContent({
  children,
  className,
  align = "center",
  sideOffset = 8,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  const ctx = React.useContext(HoverCardContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState({ top: 0, left: 0 });
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!ctx?.open || !ctx.triggerRef.current) return;
    const rect = ctx.triggerRef.current.getBoundingClientRect();
    const el = ref.current;
    const elW = el?.offsetWidth ?? 280;
    const elH = el?.offsetHeight ?? 120;

    let top = rect.bottom + sideOffset;
    let left = rect.left + rect.width / 2 - elW / 2;
    if (align === "start") left = rect.left;
    if (align === "end") left = rect.right - elW;

    if (rect.bottom + elH + sideOffset > window.innerHeight) {
      top = rect.top - elH - sideOffset;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - elW - 8));
    top = Math.max(8, top);
    setCoords({ top, left });
  }, [ctx?.open, align, sideOffset]);

  if (!mounted || !ctx?.open) return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 99998 }}
      className={cn(
        "min-w-[16rem] max-w-[22rem] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-card-lg animate-scaleUp",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
