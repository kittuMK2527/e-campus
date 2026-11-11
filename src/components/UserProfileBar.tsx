"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { ChevronDown, KeyRound, LogOut, ShieldCheck, User } from "lucide-react";
import { normalizeRoleValue, formatRoleLabel } from "@/lib/utils";

interface UserProfileBarProps {
  onOpenChangePassword: () => void;
}

interface UserDisplayInfo {
  name: string;
  email: string;
  roleLabel: string;
  shortRole: string;
  avatarUrl: string | null;
  initials: string;
}

export function UserProfileBar({ onOpenChangePassword }: UserProfileBarProps) {
  const router = useRouter();
  const {
    currentUser,
    currentRole,
    currentMentor,
    currentHR,
    currentCAM,
    currentKAM,
    currentAdmin,
    currentStudent,
    currentSME,
    logout
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard support: Escape closes and restores trigger focus; arrows move
  // through the menu items without tabbing out of the header.
  useEffect(() => {
    if (!isOpen) return;
    const menu = menuRef.current;
    if (!menu) return;

    const getItems = () =>
      Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'));

    const focusTimer = window.setTimeout(() => getItems()[0]?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

      const items = getItems();
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex = 0;

      if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      else if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
      else if (event.key === "End") nextIndex = items.length - 1;

      event.preventDefault();
      items[nextIndex].focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  // Compute unified user profile information cleanly from state
  const userInfo: UserDisplayInfo = useMemo(() => {
    let name = currentUser?.name || "";
    let email = currentUser?.email || "";
    let avatarUrl: string | null = null;
    let roleLabel = "User";
    let shortRole: string = String(currentRole || "user");

    const normalizedRole = normalizeRoleValue(currentRole);

    switch (normalizedRole) {
      case "mentor":
        name = currentMentor?.name || name || "Faculty Mentor";
        email = currentMentor?.email || email;
        avatarUrl = currentMentor?.avatar && currentMentor.avatar.startsWith("http") ? currentMentor.avatar : null;
        roleLabel = "Faculty Mentor";
        shortRole = "MENTOR";
        break;
      case "hr":
        name = currentHR?.name || name || "HR Manager";
        email = currentHR?.email || email;
        roleLabel = "HR Manager";
        shortRole = "HR";
        break;
      case "cm":
        name = currentCAM?.name || name || "Campus Manager";
        email = currentCAM?.email || email;
        roleLabel = "Campus Manager";
        shortRole = "CM";
        break;
      case "kam":
        name = currentKAM?.name || name || "Key Account Manager";
        email = currentKAM?.email || email;
        roleLabel = "Key Account Manager";
        shortRole = "KAM";
        break;
      case "admin":
        name = currentAdmin?.name || name || "System Administrator";
        email = currentAdmin?.email || email;
        roleLabel = "System Administrator";
        shortRole = "ADMIN";
        break;
      case "student":
        name = currentStudent?.name || name || "Student";
        email = currentStudent?.email || email;
        roleLabel = "Student";
        shortRole = "STUDENT";
        break;
      case "sme":
        name = currentSME?.name || name || "SME Evaluator";
        email = currentSME?.email || email;
        roleLabel = "SME Evaluator";
        shortRole = "SME";
        break;
      case "fee_manager":
        name = name || "Fee Operations Manager";
        roleLabel = "Fee Operations Manager";
        shortRole = "FM";
        break;
      case "L and D":
        name = name || "L&D Head";
        roleLabel = "Learning & Development (L&D)";
        shortRole = "L&D";
        break;
      default:
        name = name || "User";
        roleLabel = formatRoleLabel(currentRole) || "User";
        shortRole = formatRoleLabel(currentRole).toUpperCase();
        break;
    }

    const cleanName = (name || "User").replace(/^\[[^\]]*\]\s*/, "");
    const initials = cleanName
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

    return {
      name,
      email: email || "user@ecampus.edu",
      roleLabel,
      shortRole,
      avatarUrl,
      initials
    };
  }, [
    currentUser,
    currentRole,
    currentMentor,
    currentHR,
    currentCAM,
    currentKAM,
    currentAdmin,
    currentStudent,
    currentSME
  ]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleOpenPasswordModal = useCallback(() => {
    setIsOpen(false);
    onOpenChangePassword();
  }, [onOpenChangePassword]);

  const handleLogoutClick = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setIsOpen(false);
    try {
      await logout();
    } finally {
      router.replace("/");
    }
  }, [isLoggingOut, logout, router]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="flex h-9 items-center gap-2 px-2.5 sm:px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700/80 transition-all cursor-pointer shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="profile-menu"
      >
        {/* Avatar / Initials Pill */}
        <div className="h-7 w-7 rounded-lg bg-linear-to-tr from-indigo-600 to-indigo-700 flex items-center justify-center font-bold text-white text-[11px] shadow-2xs shrink-0 overflow-hidden tracking-tight">
          {userInfo.avatarUrl ? (
            <img src={userInfo.avatarUrl} alt={userInfo.name} className="h-full w-full object-cover" />
          ) : (
            <span>{userInfo.initials}</span>
          )}
        </div>

        {/* User Name & Role Pill */}
        <div className="text-left leading-none hidden sm:block">
          <span className="text-xs font-bold text-slate-900 dark:text-white block leading-tight max-w-[150px] truncate">
            {userInfo.name}
          </span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mt-0.5">
            {userInfo.shortRole}
          </span>
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Profile Dropdown Panel */}
      {isOpen && (
        <div
          ref={menuRef}
          id="profile-menu"
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 mt-2.5 w-64 bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 rounded-2xl shadow-card-lg z-50 overflow-hidden animate-scaleUp"
        >
          {/* User Info Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-white text-xs shadow-xs shrink-0 overflow-hidden">
                {userInfo.avatarUrl ? (
                  <img src={userInfo.avatarUrl} alt={userInfo.name} className="h-full w-full object-cover" />
                ) : (
                  <span>{userInfo.initials}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-gray-900 dark:text-white truncate">
                  {userInfo.name}
                </p>
                <p className="text-[10px] text-gray-400 font-mono truncate mt-0.5" title={userInfo.email}>
                  {userInfo.email}
                </p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                <ShieldCheck className="h-3 w-3 text-indigo-500" />
                {userInfo.roleLabel}
              </span>
            </div>
          </div>

          {/* Actions List */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenPasswordModal}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span>Change Password</span>
            </button>

            <button
              id="logout-btn"
              type="button"
              role="menuitem"
              onClick={handleLogoutClick}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {isLoggingOut ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-rose-500 border-t-transparent animate-spin shrink-0" />
              ) : (
                <LogOut className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{isLoggingOut ? "Logging out…" : "Log out"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
