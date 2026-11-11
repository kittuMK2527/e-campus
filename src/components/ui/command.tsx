"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandContextValue {
  value: string;
  onValueChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

const CommandContext = React.createContext<CommandContextValue>({
  value: "",
  onValueChange: () => {},
  search: "",
  onSearchChange: () => {},
});

interface CommandProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  onValueChange?: (value: string) => void;
}

export const Command = React.forwardRef<HTMLDivElement, CommandProps>(
  ({ className, value = "", onValueChange = () => {}, children, ...props }, ref) => {
    const [search, setSearch] = React.useState("");
    return (
      <CommandContext.Provider value={{ value, onValueChange, search, onSearchChange: setSearch }}>
        <div
          ref={ref}
          className={cn(
            "flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white dark:bg-[#131317] border border-slate-200 dark:border-slate-800 shadow-card text-slate-800 dark:text-slate-200",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </CommandContext.Provider>
    );
  }
);
Command.displayName = "Command";

export const CommandInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    const { search, onSearchChange } = React.useContext(CommandContext);
    return (
      <div className="flex items-center border-b border-slate-100 dark:border-slate-800 px-3">
        <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={ref}
          value={props.value !== undefined ? props.value : search}
          onChange={(e) => {
            props.onChange?.(e);
            onSearchChange(e.target.value);
          }}
          className={cn(
            "flex h-10 w-full bg-transparent py-3 text-xs outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
CommandInput.displayName = "CommandInput";

export function CommandList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("max-h-64 overflow-y-auto overflow-x-hidden custom-scrollbar", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CommandEmpty({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("py-6 text-center text-xs font-medium text-slate-400", className)} {...props}>
      {children ?? "No results found."}
    </div>
  );
}

export function CommandGroup({ heading, className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { heading?: string }) {
  return (
    <div className={cn("overflow-hidden p-1", className)} {...props}>
      {heading && (
        <div className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
          {heading}
        </div>
      )}
      {children}
    </div>
  );
}

export function CommandSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("-mx-1 h-px bg-slate-100 dark:bg-slate-800", className)} {...props} />;
}

interface CommandItemProps extends Omit<React.HTMLAttributes<HTMLButtonElement>, "onSelect"> {
  value?: string;
  onSelect?: (value: string) => void;
  disabled?: boolean;
}

export function CommandItem({ value = "", onSelect, className, children, disabled, ...props }: CommandItemProps) {
  const { value: selected, onValueChange } = React.useContext(CommandContext);
  const isSelected = selected === value;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onValueChange(value);
          onSelect?.(value);
        }
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none transition-colors",
        isSelected ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold" : "hover:bg-slate-100 dark:hover:bg-slate-800",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...(props as any)}
    >
      {children}
    </button>
  );
}
