"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface PopoverContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

export function Popover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(PopoverContext);
  if (!ctx) throw new Error("PopoverTrigger must be inside Popover");

  const toggle = () => ctx.setOpen((p) => !p);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref: (node: HTMLElement | null) => {
        ctx.triggerRef.current = node;
        const childRef = (children as any).ref;
        if (typeof childRef === "function") childRef(node);
        else if (childRef && "current" in childRef) (childRef as any).current = node;
      },
      onClick: (e: React.MouseEvent) => {
        (children.props as any).onClick?.(e);
        toggle();
      },
    });
  }

  return (
    <button
      ref={ctx.triggerRef as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={toggle}
    >
      {children}
    </button>
  );
}

export function PopoverContent({
  children,
  className,
  align = "start",
  sideOffset = 6,
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
  sideOffset?: number;
}) {
  const ctx = React.useContext(PopoverContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{
    top?: number; bottom?: number; left?: number; right?: number;
  }>({});
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const position = React.useCallback(() => {
    if (!ctx?.triggerRef.current) return;
    const rect = ctx.triggerRef.current.getBoundingClientRect();
    const el = ref.current;
    const elH = el?.offsetHeight ?? 200;
    const elW = el?.offsetWidth ?? 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < elH + 8 && rect.top > spaceBelow;

    const next: typeof coords = {};
    if (placeAbove) {
      next.bottom = Math.max(8, window.innerHeight - rect.top + sideOffset);
    } else {
      next.top = Math.max(8, rect.bottom + sideOffset);
    }

    if (align === "end") {
      next.right = Math.max(8, window.innerWidth - rect.right);
    } else if (align === "center") {
      next.left = Math.max(8, rect.left + rect.width / 2 - elW / 2);
    } else {
      next.left = Math.max(8, rect.left);
    }
    setCoords(next);
  }, [align, sideOffset, ctx?.triggerRef]);

  React.useEffect(() => {
    if (!ctx?.open) return;
    position();
    const id = requestAnimationFrame(position);
    const onClose = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        ctx.triggerRef.current && !ctx.triggerRef.current.contains(e.target as Node)
      ) ctx.setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") ctx.setOpen(false); };
    document.addEventListener("mousedown", onClose);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("mousedown", onClose);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [ctx?.open, position]);

  if (!mounted || !ctx?.open) return null;

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: coords.top !== undefined ? `${coords.top}px` : "auto",
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : "auto",
        left: coords.left !== undefined ? `${coords.left}px` : "auto",
        right: coords.right !== undefined ? `${coords.right}px` : "auto",
        zIndex: 99998,
      }}
      className={cn(
        "min-w-[14rem] overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-card-lg animate-scaleUp",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}
