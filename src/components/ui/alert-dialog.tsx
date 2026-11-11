"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

const AlertDialogContext = React.createContext<{ onOpenChange: (v: boolean) => void } | null>(null);

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AlertDialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
        {children}
      </div>
    </AlertDialogContext.Provider>,
    document.body
  );
}

export function AlertDialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className={cn(
        "relative z-10 w-full max-w-md bg-white dark:bg-[#131317] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card-lg p-6 space-y-4 animate-scaleUp",
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-sm font-black text-slate-900 dark:text-slate-100", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed", className)} {...props} />
  );
}

export function AlertDialogAction({
  className,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      variant="default"
      className={cn(className)}
      onClick={onClick}
      {...(props as any)}
    >
      {children}
    </Button>
  );
}

export function AlertDialogCancel({
  className,
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ctx = React.useContext(AlertDialogContext);
  return (
    <Button
      variant="outline"
      className={cn(className)}
      onClick={(e) => {
        onClick?.(e);
        ctx?.onOpenChange(false);
      }}
      {...(props as any)}
    >
      {children ?? "Cancel"}
    </Button>
  );
}
