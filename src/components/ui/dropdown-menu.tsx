"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement | null>(null);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  asChild,
  children,
  className
}: {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuTrigger must be inside DropdownMenu");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    context.setOpen(prev => !prev);
  };

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      ref: (node: HTMLElement | null) => {
        context.triggerRef.current = node;
        const childRef = (children as any).ref;
        if (typeof childRef === "function") childRef(node);
        else if (childRef && "current" in childRef) (childRef as any).current = node;
      },
      onClick: (e: React.MouseEvent) => {
        (children.props as any).onClick?.(e);
        handleClick(e);
      },
      "aria-haspopup": "menu",
      "aria-expanded": context.open
    });
  }

  return (
    <button
      ref={context.triggerRef as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={handleClick}
      aria-haspopup="menu"
      aria-expanded={context.open}
      className={className}
    >
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  children,
  align = "end",
  className
}: {
  children: React.ReactNode;
  align?: "start" | "end" | "center";
  className?: string;
}) {
  const context = React.useContext(DropdownMenuContext);
  const ref = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);
  const [coords, setCoords] = React.useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  }>({});

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    if (!context?.triggerRef.current) return;
    const triggerRect = context.triggerRef.current.getBoundingClientRect();
    const menuEl = ref.current;
    const menuHeight = menuEl ? menuEl.offsetHeight : 180;
    const menuWidth = menuEl ? menuEl.offsetWidth : 160;

    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const placeAbove = spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow;

    const newCoords: { top?: number; bottom?: number; left?: number; right?: number } = {};

    if (placeAbove) {
      newCoords.bottom = Math.max(8, window.innerHeight - triggerRect.top + 4);
    } else {
      newCoords.top = Math.max(8, triggerRect.bottom + 4);
    }

    if (align === "end") {
      newCoords.right = Math.max(8, window.innerWidth - triggerRect.right);
    } else if (align === "start") {
      newCoords.left = Math.max(8, triggerRect.left);
    } else {
      newCoords.left = Math.max(8, triggerRect.left + (triggerRect.width / 2) - (menuWidth / 2));
    }

    setCoords(newCoords);
  }, [align, context?.triggerRef]);

  React.useEffect(() => {
    if (!context?.open) return;

    updatePosition();
    const frameId = requestAnimationFrame(updatePosition);

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(target) &&
        context.triggerRef.current &&
        !context.triggerRef.current.contains(target)
      ) {
        context.setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        context.setOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [context?.open, updatePosition]);

  if (!mounted || !context?.open) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        top: coords.top !== undefined ? `${coords.top}px` : "auto",
        bottom: coords.bottom !== undefined ? `${coords.bottom}px` : "auto",
        left: coords.left !== undefined ? `${coords.left}px` : "auto",
        right: coords.right !== undefined ? `${coords.right}px` : "auto",
        zIndex: 99999
      }}
      className={cn(
        "min-w-[10rem] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-slate-800 shadow-card-lg dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export function DropdownMenuItem({
  children,
  onClick,
  destructive = false,
  disabled = false,
  className
}: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const context = React.useContext(DropdownMenuContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick?.(e);
    context?.setOpen(false);
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors outline-none",
        destructive
          ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-slate-100 dark:bg-slate-800", className)} />;
}

export function DropdownMenuLabel({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400", className)}>
      {children}
    </div>
  );
}

export interface ActionDropdownButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  size?: "default" | "sm";
}

export const ActionDropdownButton = React.forwardRef<
  HTMLButtonElement,
  ActionDropdownButtonProps
>(({
  label = "Actions",
  icon: Icon = SlidersHorizontal,
  size = "default",
  className,
  ...props
}, ref) => {
  const isSm = size === "sm";
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 text-slate-800 dark:text-slate-100 font-extrabold inline-flex items-center shadow-2xs cursor-pointer transition-all active:scale-[0.98] select-none whitespace-nowrap",
        isSm ? "h-8 px-3 text-[11px] gap-2" : "h-9 px-3.5 text-xs gap-2.5",
        className
      )}
      {...props}
    >
      <Icon
        strokeWidth={2.4}
        className={cn("text-amber-500 dark:text-amber-400 shrink-0", isSm ? "h-3.5 w-3.5" : "h-3.5 w-3.5")}
      />
      <span className="font-extrabold tracking-tight text-slate-800 dark:text-slate-100">{label}</span>
      <ChevronDown
        strokeWidth={2.4}
        className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0"
      />
    </button>
  );
});
ActionDropdownButton.displayName = "ActionDropdownButton";
