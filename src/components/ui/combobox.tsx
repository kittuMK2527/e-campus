"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback, useId } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search } from "lucide-react";

export interface ComboboxOption {
  value: string;
  label: string;
  subtext?: string;
  icon?: React.ReactNode;
}

export interface ComboboxProps {
  label?: string;
  /** Accessible name for the trigger when no visible label is rendered. */
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
}

export function Combobox({
  label,
  ariaLabel,
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  searchable = true,
  disabled = false,
  className
}: ComboboxProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const triggerId = `${uid}-trigger`;
  const listboxId = `${uid}-listbox`;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Only restore focus after a keyboard/pointer dismissal, never on outside clicks
  // where the browser has already moved focus elsewhere.
  const refocusOnClose = useRef(false);

  const accessibleName = ariaLabel || label;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (refocusOnClose.current) {
      refocusOnClose.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const filteredOptions = searchable && search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase().trim()) ||
        (o.subtext && o.subtext.toLowerCase().includes(search.toLowerCase().trim()))
      )
    : options;

  const selectOption = useCallback((option: ComboboxOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    refocusOnClose.current = true;
    setOpen(false);
  }, [onChange]);

  const moveActive = useCallback((next: number) => {
    if (filteredOptions.length === 0) return;
    const clamped = Math.max(0, Math.min(filteredOptions.length - 1, next));
    setActiveIndex(clamped);
    containerRef.current?.querySelector(`#${CSS.escape(optionId(clamped))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [filteredOptions.length, listboxId]);

  const openList = useCallback((index: number) => {
    setSearch("");
    setActiveIndex(index);
    setOpen(true);
  }, []);

  // Keep the highlighted option valid while the list is being searched.
  useEffect(() => {
    setActiveIndex((current) => {
      if (filteredOptions.length === 0) return 0;
      return Math.min(current, filteredOptions.length - 1);
    });
  }, [filteredOptions.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    const selectedIdx = filteredOptions.findIndex((o) => o.value === value);

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList(Math.max(0, selectedIdx));
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        refocusOnClose.current = true;
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveActive(activeIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(activeIndex - 1);
        break;
      case "Home":
        e.preventDefault();
        moveActive(0);
        break;
      case "End":
        e.preventDefault();
        moveActive(filteredOptions.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        selectOption(filteredOptions[activeIndex]);
        break;
      default:
        break;
    }
  }, [
    activeIndex,
    disabled,
    filteredOptions,
    moveActive,
    open,
    openList,
    selectOption,
    value
  ]);

  const selectedOption = options.find((o) => o.value === value);
  const hasSearchField = searchable && options.length > 5;
  const activeOptionId = open && filteredOptions.length > 0 ? optionId(activeIndex) : undefined;
  // aria-activedescendant belongs on the focused element: the search field when it exists, else the trigger.
  const onTriggerActiveDescendant = open && !hasSearchField ? activeOptionId : undefined;
  const onFieldActiveDescendant = open && hasSearchField ? activeOptionId : undefined;

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={cn("relative w-full flex flex-col space-y-1", className)}
    >
      {label && (
        <label
          id={labelId}
          htmlFor={triggerId}
          className="text-[10px] text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-wider block"
        >
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={onTriggerActiveDescendant}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : accessibleName}
        onClick={() => {
          if (disabled) return;
          if (open) {
            refocusOnClose.current = true;
            setOpen(false);
          } else {
            openList(Math.max(0, options.findIndex((o) => o.value === value)));
          }
        }}
        className={cn(
          "w-full flex items-center justify-between px-3.5 py-2 min-h-[36px] bg-white dark:bg-[#181820] shadow-2xs border border-slate-200/90 dark:border-slate-800 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer outline-none",
          "hover:border-slate-300 dark:hover:border-slate-700 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-500",
          open && "bg-white dark:bg-[#131317] border-amber-500 ring-2 ring-amber-500/20",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="truncate pr-2 flex items-center gap-2">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className={selectedOption ? "font-bold text-slate-800 dark:text-slate-100" : "text-slate-400 font-normal"}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          strokeWidth={2.4}
          className={cn(
            "w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-200",
            open && "rotate-180 text-amber-500"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : accessibleName}
          tabIndex={-1}
          className="absolute left-0 top-full mt-1.5 w-full min-w-[220px] bg-white dark:bg-[#181820] border border-slate-100 dark:border-slate-800 rounded-2xl shadow-xl z-[200] overflow-hidden p-1.5 animate-scaleUp"
        >
          {searchable && options.length > 5 && (
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-black/20">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  type="text"
                  aria-controls={listboxId}
                  aria-activedescendant={onFieldActiveDescendant}
                  aria-label={searchPlaceholder}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setActiveIndex(0);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-white dark:bg-[#131317] border border-slate-200 dark:border-slate-800 rounded-lg outline-none font-medium text-slate-800 dark:text-slate-100 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div role="status" className="p-3 text-center text-xs text-slate-400 font-medium">
                No matching options found
              </div>
            ) : (
              filteredOptions.map((opt, index) => {
                const isSelected = opt.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    key={opt.value}
                    id={optionId(index)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(opt)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer",
                      isSelected
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 font-black"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 font-semibold",
                      // Keyboard highlight is a ring, not the brand tint, so "current value" and
                      // "where Enter lands" stay visually distinct.
                      isActive && "bg-slate-100 dark:bg-slate-800 ring-1 ring-inset ring-amber-500/50"
                    )}
                  >
                    <div className="truncate pr-2 flex-1 min-w-0">
                      <div className="truncate flex items-center gap-1.5">
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <span>{opt.label}</span>
                      </div>
                      {opt.subtext && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal truncate mt-0.5">
                          {opt.subtext}
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 stroke-[3] shrink-0 ml-1.5" aria-hidden="true" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Combobox;
