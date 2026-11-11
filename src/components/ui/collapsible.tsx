"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

interface CollapsibleProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  className,
}: CollapsibleProps) {
  const [internal, setInternal] = React.useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internal;

  const handleChange = React.useCallback(
    (v: boolean) => {
      if (controlledOpen === undefined) setInternal(v);
      onOpenChange?.(v);
    },
    [controlledOpen, onOpenChange]
  );

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

export function CollapsibleTrigger({
  asChild,
  children,
  className,
}: {
  asChild?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) throw new Error("CollapsibleTrigger must be inside Collapsible");

  const toggle = () => ctx.onOpenChange(!ctx.open);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        (children.props as any).onClick?.(e);
        toggle();
      },
      "aria-expanded": ctx.open,
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={ctx.open}
      className={cn("w-full text-left", className)}
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) throw new Error("CollapsibleContent must be inside Collapsible");
  if (!ctx.open) return null;

  return (
    <div className={cn("animate-fadeIn", className)}>
      {children}
    </div>
  );
}
