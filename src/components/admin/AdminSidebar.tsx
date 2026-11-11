"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchRoleTab } from "@/lib/prefetch";

export interface AdminNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  title: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

interface AdminSidebarProps {
  groups: AdminNavGroup[];
  activeTab: string;
  onNavigate: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function AdminSidebar({
  groups,
  activeTab,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  mobileOpen = false,
  onMobileClose = () => {},
}: AdminSidebarProps) {
  const queryClient = useQueryClient();
  const activeGroupTitle = groups.find(g => g.items.some(i => i.id === activeTab))?.title;
  // One group at a time; the group holding the current tab starts open.
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupTitle ?? null);
  const [railGroup, setRailGroup] = useState<string | null>(null);
  const [railPinned, setRailPinned] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  const closeRail = () => {
    setRailGroup(null);
    setRailPinned(false);
  };

  // Navigating opens the destination's group and collapses every other one —
  // including a sibling tab inside a group the user had closed.
  useEffect(() => {
    if (!activeGroupTitle) return;
    setOpenGroup(prev => (prev === activeGroupTitle ? prev : activeGroupTitle));
  }, [activeTab, activeGroupTitle]);

  useEffect(() => {
    if (!collapsed) closeRail();
  }, [collapsed]);

  // The drawer owns the screen while open: lock the page behind it, move focus
  // into it, and return focus to the trigger when it closes.
  useEffect(() => {
    if (!mobileOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [mobileOpen]);

  // Growing past the md breakpoint retires the drawer instead of leaving the
  // page scroll-locked behind an overlay that is now hidden.
  useEffect(() => {
    if (!mobileOpen) return;
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (query.matches) onMobileClose();
    };
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mobileOpen, onMobileClose]);

  // Escape closes the drawer first, then a pinned rail tray; Tab stays inside
  // the drawer while it is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mobileOpen) {
          onMobileClose();
          return;
        }
        if (railGroup) closeRail();
        return;
      }
      if (event.key !== "Tab" || !mobileOpen) return;
      const aside = drawerRef.current;
      if (!aside) return;
      const focusable = Array.from(
        aside.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(element => !element.hasAttribute("disabled") && !element.closest("[inert]"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, railGroup, onMobileClose]);

  // A pinned tray has to survive the pointer leaving the rail, so it closes on
  // an outside press rather than on blur.
  useEffect(() => {
    if (!railPinned) return;
    const onPointerDown = (event: PointerEvent) => {
      if (asideRef.current && !asideRef.current.contains(event.target as Node)) closeRail();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [railPinned]);

  // Keep the active row on screen without yanking the list to the top.
  useEffect(() => {
    if (activeGroupTitle && openGroup !== activeGroupTitle) return;
    const root = mobileOpen ? drawerRef.current : asideRef.current;
    root?.querySelector<HTMLElement>('[data-nav-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeTab, openGroup, mobileOpen, collapsed, activeGroupTitle]);

  const handleNavigate = (tab: string) => {
    onNavigate(tab);
    if (mobileOpen) onMobileClose();
    if (collapsed) closeRail();
  };

  const renderItem = (item: AdminNavItem, primary = false) => {
    const Icon = item.icon;
    const isActive = item.id === activeTab;
    return (
      <button
        key={item.id}
        type="button"
        aria-current={isActive ? "page" : undefined}
        data-nav-active={isActive ? "true" : undefined}
        onClick={() => handleNavigate(item.id)}
        onMouseEnter={() => prefetchRoleTab(queryClient, "admin", item.id, {})}
        onFocus={() => prefetchRoleTab(queryClient, "admin", item.id, {})}
        className={`relative w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
          isActive
            ? "bg-zinc-900 font-extrabold text-white shadow-xs"
            : `hover:bg-slate-100/70 hover:text-slate-900 ${
                primary ? "font-semibold text-slate-700" : "font-medium text-slate-600"
              }`
        }`}
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${
            isActive ? "text-amber-400" : primary ? "text-slate-500" : "text-slate-400"
          }`}
        />
        <span className="truncate text-[13px] leading-5">{item.label}</span>
        {isActive && (
          <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-amber-500" />
        )}
      </button>
    );
  };

  const expandedNav = (
    <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1 space-y-3">
      {groups.map(group => {
        const GroupIcon = group.icon;

        // A one-destination group is a section-level link, so it sits at header
        // level rather than under a header of its own.
        if (group.items.length === 1) {
          return <div key={group.title}>{renderItem(group.items[0], true)}</div>;
        }

        const isOpen = openGroup === group.title;
        return (
          <div key={group.title}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenGroup(prev => (prev === group.title ? null : group.title))}
              className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="text-[10.5px] font-black uppercase tracking-wider truncate">
                  {group.title}
                </span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`}
              />
            </button>
            <div
              aria-hidden={!isOpen}
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden" inert={!isOpen}>
                <div className="relative mt-1 mb-1 ml-[18px] pl-3 space-y-0.5 border-l border-slate-200/80">
                  {group.items.map(item => renderItem(item))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );

  const railNav = (
    <nav className="flex-1 min-h-0 overflow-visible space-y-1.5 py-1">
      {groups.map(group => {
        const GroupIcon = group.icon;
        const hasActiveItem = group.items.some(item => item.id === activeTab);
        const isOpen = railGroup === group.title;
        return (
          <div
            key={group.title}
            className="relative"
            onMouseEnter={() => {
              if (!railPinned) setRailGroup(group.title);
            }}
            onMouseLeave={() => {
              if (!railPinned) setRailGroup(current => (current === group.title ? null : current));
            }}
            onFocus={() => {
              if (!railPinned) setRailGroup(group.title);
            }}
            onBlur={event => {
              if (railPinned) return;
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setRailGroup(current => (current === group.title ? null : current));
              }
            }}
          >
            <button
              type="button"
              title={group.title}
              aria-label={group.title}
              aria-expanded={isOpen}
              onClick={() => {
                if (isOpen && railPinned) {
                  closeRail();
                  return;
                }
                // Clicking an open hover preview pins it instead of toggling it
                // shut while the pointer is still on the button.
                setRailGroup(group.title);
                setRailPinned(true);
              }}
              className={`w-full flex items-center justify-center rounded-lg py-2.5 transition-colors cursor-pointer ${
                hasActiveItem
                  ? "bg-zinc-900 text-amber-400"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <GroupIcon className="h-5 w-5" />
            </button>
            {isOpen && (
              <div className="absolute left-full top-0 pl-2 w-60 z-50">
                <div
                  aria-label={group.title}
                  className="rounded-xl border border-slate-200 bg-white shadow-card-lg p-2 space-y-0.5"
                >
                  <div className="px-2 py-1.5 text-[10.5px] font-black uppercase tracking-wider text-zinc-900 border-b border-slate-100 mb-1">
                    {group.title}
                  </div>
                  {group.items.map(item => renderItem(item))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        ref={asideRef}
        className={`hidden md:flex shrink-0 flex-col self-stretch min-h-0 my-5 z-30 rounded-2xl border border-slate-100 bg-white/95 backdrop-blur-md shadow-card ${
          collapsed ? "w-20 p-2" : "w-64 p-3.5"
        }`}
        aria-label="Admin workspace navigation"
      >
        {collapsed ? railNav : expandedNav}

        {!collapsed && (
          <div
            onClick={() => typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("open-feedback-modal"))}
            className="relative overflow-hidden rounded-xl bg-zinc-50 p-3 border border-zinc-200/80 my-2 shrink-0 cursor-pointer hover:bg-zinc-100/90 transition-colors group"
          >
            <div className="text-[11px] font-bold text-zinc-900">Need Help?</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("open-feedback-modal"));
              }}
              className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 mt-0.5 transition-colors cursor-pointer"
            >
              <span>Contact Support</span>
              <span>&rarr;</span>
            </button>
          </div>
        )}

        <div className="shrink-0 border-t border-slate-100 pt-2 flex justify-center">
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="h-9 w-9 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-xs inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fadeIn"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            aria-label="Admin workspace navigation"
            className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-white shadow-card-lg p-3 animate-slide-in-left"
          >
            <div className="shrink-0 flex items-center justify-between px-1 pb-1.5">
              <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">
                Admin Menu
              </span>
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close navigation"
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {expandedNav}
          </aside>
        </div>
      )}
    </>
  );
}
