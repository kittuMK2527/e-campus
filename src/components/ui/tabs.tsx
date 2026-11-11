"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const value = controlledValue !== undefined ? controlledValue : internalValue;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (controlledValue === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [controlledValue, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={cn("w-full flex flex-col", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-start rounded-xl bg-slate-100/80 dark:bg-slate-800/80 p-1 text-slate-500 dark:text-slate-400 gap-1 overflow-x-auto custom-scrollbar",
      className
    )}
    role="tablist"
    {...props}
  />
));
TabsList.displayName = "TabsList";

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  icon?: React.ReactNode;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value: triggerValue, icon, children, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsTrigger must be used within Tabs");

    const isSelected = context.value === triggerValue;

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isSelected}
        onClick={() => context.onValueChange(triggerValue)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-all outline-none cursor-pointer select-none",
          isSelected
            ? "bg-white dark:bg-[#131317] text-slate-900 dark:text-white shadow-xs font-black border border-slate-200/60 dark:border-slate-700/60"
            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/40",
          className
        )}
        {...props}
      >
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </button>
    );
  }
);
TabsTrigger.displayName = "TabsTrigger";

export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value: contentValue, children, ...props }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsContent must be used within Tabs");

    if (context.value !== contentValue) return null;

    return (
      <div
        ref={ref}
        role="tabpanel"
        tabIndex={0}
        className={cn("mt-3 outline-none animate-fadeIn", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";
