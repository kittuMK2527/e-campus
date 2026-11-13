"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  Sliders,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Loader2,
  Power
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ClearAttendanceSection } from "@/components/admin/operations/ClearAttendanceSection";

export const SettingsTab: React.FC = () => {
  const { currentAdmin, colleges, students, refreshAttendance } = useApp();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const settingsQuery = useQuery({
    queryKey: qk.systemSettings(),
    queryFn: async () => {
      const data = await apiFetch("/api/settings");
      return data?.settings || { mailing_enabled: true, attendance_lock_enabled: true };
    }
  });

  const systemSettings = settingsQuery.data || { mailing_enabled: true, attendance_lock_enabled: true };

  const handleToggleMailing = async (newValue: boolean) => {
    setIsUpdatingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "mailing_enabled",
          value: newValue,
          updatedBy: currentAdmin?.name || "Admin"
        })
      });
      const data = await res.json();
      if (data.success) {
        queryClient.setQueryData(qk.systemSettings(), (prev: any) => ({ ...(prev || {}), mailing_enabled: newValue }));
        toast(
          newValue
            ? "Global Email Delivery ENABLED (Active). Outbound transactional emails active."
            : "Global Email Delivery DISABLED (OFF). Outbound emails are paused.",
          newValue ? "success" : "warning"
        );
      } else {
        toast(data.message || "Failed to update setting.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error updating setting.", "error");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleToggleAttendanceLock = async (newValue: boolean) => {
    setIsUpdatingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "attendance_lock_enabled",
          value: newValue,
          updatedBy: currentAdmin?.name || "Admin"
        })
      });
      const data = await res.json();
      if (data.success) {
        queryClient.setQueryData(qk.systemSettings(), (prev: any) => ({ ...(prev || {}), attendance_lock_enabled: newValue }));
        toast(
          newValue
            ? "Attendance Marking Lock ENABLED (Strict Mode). Past/ended periods are locked."
            : "Attendance Marking Lock DISABLED (Flexible Mode). Mentors can freely mark and update past attendance.",
          newValue ? "success" : "warning"
        );
      } else {
        toast(data.message || "Failed to update setting.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error updating setting.", "error");
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Sliders}
        title="System Settings & Global Switches"
      />

      {/* Grid Layout for Settings Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Master Email Control Card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    systemSettings.mailing_enabled
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : "bg-rose-50 text-rose-600 border border-rose-200"
                  }`}
                >
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900">Global Email & Mailing System</h3>
                  <span className="text-[10px] text-gray-400 font-medium block">
                    Controls email delivery services, SMTP relay & notification webhooks
                  </span>
                </div>
              </div>

              {/* Live Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
                  systemSettings.mailing_enabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    systemSettings.mailing_enabled ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  }`}
                />
                {systemSettings.mailing_enabled ? "MAILING ACTIVE" : "MAILING OFF"}
              </span>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed mt-2 bg-gray-50/80 p-3.5 rounded-xl border border-gray-200">
              When turned <strong className="text-gray-900 font-bold">OFF</strong>, all outgoing transactional emails
              (leave alerts, handover requests, demo swap proposals, interview notifications) are gracefully bypassed.{" "}
              <span className="text-indigo-600 font-semibold">
                Web application workflows will continue functioning normally without errors.
              </span>
            </p>
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={systemSettings.mailing_enabled}
                disabled={isUpdatingSettings}
                onCheckedChange={checked => handleToggleMailing(checked)}
                size="md"
                aria-label="Toggle Global Mailing System"
              />
              <span className="text-xs font-bold text-slate-800">
                {isUpdatingSettings ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                  </span>
                ) : systemSettings.mailing_enabled ? (
                  "Global Mailing Enabled"
                ) : (
                  "Global Mailing Paused"
                )}
              </span>
            </div>

            <span className="text-[10px] text-gray-400 font-semibold">
              Status: {systemSettings.mailing_enabled ? "Active" : "Paused"}
            </span>
          </div>
        </div>

        {/* Email Service Diagnostic Card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-gray-900">Email Infrastructure Status</h3>
                <span className="text-[10px] text-gray-400 font-medium block">
                  Configured Relay & Webhook Providers
                </span>
              </div>
            </div>

            <div className="space-y-2.5 mt-4">
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-gray-800">Primary Provider</span>
                </div>
                <span className="text-[11px] font-mono font-extrabold text-indigo-600">Brevo REST API v3</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-gray-800">Secondary Relay</span>
                </div>
                <span className="text-[11px] font-mono font-extrabold text-indigo-600">Brevo SMTP (Port 587)</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-bold text-gray-800">Webhook Fallback</span>
                </div>
                <span className="text-[11px] font-mono font-extrabold text-slate-600">Google Apps Script</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center gap-2 text-amber-800 text-[10px] font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Audit logs automatically record whenever mailing preferences are toggled by an administrator.</span>
          </div>
        </div>

        {/* Attendance Marking Lock Policy Card */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card flex flex-col justify-between space-y-4 md:col-span-2">
          <div>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    systemSettings.attendance_lock_enabled !== false
                      ? "bg-amber-50 text-amber-600 border border-amber-200"
                      : "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  }`}
                >
                  {systemSettings.attendance_lock_enabled !== false ? (
                    <Lock className="h-6 w-6" />
                  ) : (
                    <Unlock className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-gray-900">Attendance Marking Lock Policy</h3>
                  <span className="text-[10px] text-gray-400 font-medium block">
                    Controls strict period expiration & retroactive marking lockout
                  </span>
                </div>
              </div>

              {/* Live Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
                  systemSettings.attendance_lock_enabled !== false
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    systemSettings.attendance_lock_enabled !== false ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                  }`}
                />
                {systemSettings.attendance_lock_enabled !== false ? "LOCK ACTIVE (STRICT)" : "LOCK DISABLED (FLEXIBLE)"}
              </span>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed mt-2 bg-gray-50/80 p-3.5 rounded-xl border border-gray-200">
              {systemSettings.attendance_lock_enabled !== false ? (
                <>
                  When <strong className="text-amber-700 font-bold">ENABLED (Strict Mode)</strong>, direct attendance
                  marking is locked as soon as a period&apos;s scheduled end time passes or for prior calendar dates.
                  Faculty must request{" "}
                  <span className="text-indigo-600 font-semibold">Campus Manager (CM) approval</span> with a reason to
                  unlock the session.
                </>
              ) : (
                <>
                  When <strong className="text-emerald-700 font-bold">DISABLED (Flexible Mode)</strong>, the period time
                  window and past-date lockouts are completely bypassed.{" "}
                  <span className="text-emerald-700 font-semibold">
                    Faculty / Mentors can directly mark, edit, and record attendance for past periods and dates without CM
                    approval.
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Action Row */}
          <div className="pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={systemSettings.attendance_lock_enabled !== false}
                disabled={isUpdatingSettings}
                onCheckedChange={checked => handleToggleAttendanceLock(checked)}
                size="md"
                aria-label="Toggle Attendance Lock Policy"
              />
              <span className="text-xs font-bold text-slate-800">
                {isUpdatingSettings ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                  </span>
                ) : systemSettings.attendance_lock_enabled !== false ? (
                  "Strict Lockout Active (Period Expiration Enforced)"
                ) : (
                  "Flexible Mode (Retroactive Marking Allowed)"
                )}
              </span>
            </div>

            <span className="text-[10px] text-gray-400 font-semibold">
              Enforcement: {systemSettings.attendance_lock_enabled !== false ? "Strict Window Lock" : "Flexible / Unlocked"}
            </span>
          </div>
        </div>
      </div>

      {/* Clear Attendance Section */}
      <ClearAttendanceSection
        colleges={colleges}
        students={students}
        onAttendanceCleared={async (colId) => {
          await refreshAttendance(colId);
        }}
      />
    </div>
  );
};
