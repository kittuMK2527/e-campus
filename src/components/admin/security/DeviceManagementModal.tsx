"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  Laptop,
  Smartphone,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  AlertTriangle,
  X,
  RefreshCw
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";

export interface DeviceManagementModalProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  onSuccess?: () => void;
}

export function DeviceManagementModal({
  open,
  onClose,
  userId,
  userName = "User",
  userEmail = "",
  userRole = "Student",
  onSuccess
}: DeviceManagementModalProps) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const fetchDeviceData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/devices?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (data.success) {
        setDevices(data.devices || []);
        setLogs(data.logs || []);
        setRequests(data.requests || []);
      }
    } catch {
      setFeedback({ message: "Could not load device details.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) {
      fetchDeviceData();
    }
  }, [open, userId, fetchDeviceData]);

  const handleResetDevice = async (deviceType: "desktop" | "mobile" | "all") => {
    if (!userId) return;
    setActionLoading(`reset-${deviceType}`);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", userId, deviceType })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ message: data.message, type: "success" });
        await fetchDeviceData();
        if (onSuccess) onSuccess();
      } else {
        setFeedback({ message: data.message || "Failed to reset device.", type: "error" });
      }
    } catch {
      setFeedback({ message: "Network error resetting device.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setActionLoading(`approve-${requestId}`);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_request", requestId })
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ message: data.message, type: "success" });
        await fetchDeviceData();
        if (onSuccess) onSuccess();
      } else {
        setFeedback({ message: data.message || "Failed to approve request.", type: "error" });
      }
    } catch {
      setFeedback({ message: "Network error approving request.", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  if (!open) return null;

  const desktopDevice = devices.find((d) => d.device_type === "desktop" && d.is_active);
  const mobileDevice = devices.find((d) => d.device_type === "mobile" && d.is_active);
  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      ariaLabel="Manage Authorized Devices"
      overlayClassName="bg-slate-950/70 backdrop-blur-sm p-4"
      panelClassName="max-w-xl overflow-hidden animate-slideUp p-0 space-y-0 max-h-[92vh] rounded-3xl"
    >
      {/* Header */}
      <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-wider">
              Manage Authorized Devices
            </h3>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
              {userName} ({userRole}) · <span className="font-mono">{userEmail}</span>
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Close dialog"
          onClick={onClose}
          className="h-8 w-8 text-slate-400 hover:text-slate-700 rounded-xl cursor-pointer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
        {feedback && (
          <div
            role="alert"
            className={`p-3 rounded-xl font-bold flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Pending Reset Requests Banner */}
        {pendingRequests.length > 0 && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 dark:border-amber-800/60 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-extrabold text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>Pending Device Reset Request ({pendingRequests.length})</span>
            </div>
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/40 flex items-center justify-between gap-3 flex-wrap"
              >
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-100 block">
                    Requested reset for: <span className="uppercase text-amber-700 dark:text-amber-400 font-black">{req.device_type}</span>
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Reason: "{req.reason || "Not specified"}" · {new Date(req.created_at).toLocaleString()}
                  </span>
                </div>
                <LoadingButton
                  onClick={() => handleApproveRequest(req.id)}
                  isLoading={actionLoading === `approve-${req.id}`}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Approve Reset
                </LoadingButton>
              </div>
            ))}
          </div>
        )}

        {/* Active Authorized Slots (1 Desktop + 1 Mobile) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500">
              Active Authorized Slots (Policy: 1 Desktop + 1 Mobile)
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResetDevice("all")}
              disabled={loading || !!actionLoading || (!desktopDevice && !mobileDevice)}
              className="text-[10px] font-black uppercase tracking-wider text-rose-600 hover:bg-rose-50 border-rose-200 dark:border-rose-900/60 h-7 rounded-lg cursor-pointer"
            >
              Reset All Slots
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Desktop Slot */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                      <Laptop className="h-4 w-4" />
                    </div>
                    <span className="font-black text-xs text-slate-900 dark:text-white">Desktop Slot</span>
                  </div>
                  {desktopDevice ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Empty
                    </span>
                  )}
                </div>

                {desktopDevice ? (
                  <div className="space-y-1 text-[11px]">
                    <div className="font-extrabold text-slate-800 dark:text-slate-100">{desktopDevice.device_name}</div>
                    <div className="text-slate-400 text-[10px] flex items-center gap-1">
                      <Globe className="h-3 w-3" /> IP: {desktopDevice.ip_address || "Unknown"}
                    </div>
                    <div className="text-slate-400 text-[10px] flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Last Active: {new Date(desktopDevice.last_used_at).toLocaleDateString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-[11px] italic">No desktop authorized yet. Available for next login.</p>
                )}
              </div>

              {desktopDevice && (
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() => handleResetDevice("desktop")}
                  isLoading={actionLoading === "reset-desktop"}
                  className="w-full text-xs font-bold text-rose-600 hover:bg-rose-50 border-rose-200 dark:border-rose-900/60 rounded-xl mt-2 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset Desktop
                </LoadingButton>
              )}
            </div>

            {/* Mobile Slot */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <span className="font-black text-xs text-slate-900 dark:text-white">Mobile Slot</span>
                  </div>
                  {mobileDevice ? (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Empty
                    </span>
                  )}
                </div>

                {mobileDevice ? (
                  <div className="space-y-1 text-[11px]">
                    <div className="font-extrabold text-slate-800 dark:text-slate-100">{mobileDevice.device_name}</div>
                    <div className="text-slate-400 text-[10px] flex items-center gap-1">
                      <Globe className="h-3 w-3" /> IP: {mobileDevice.ip_address || "Unknown"}
                    </div>
                    <div className="text-slate-400 text-[10px] flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Last Active: {new Date(mobileDevice.last_used_at).toLocaleDateString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-[11px] italic">No mobile authorized yet. Available for next login.</p>
                )}
              </div>

              {mobileDevice && (
                <LoadingButton
                  variant="outline"
                  size="sm"
                  onClick={() => handleResetDevice("mobile")}
                  isLoading={actionLoading === "reset-mobile"}
                  className="w-full text-xs font-bold text-rose-600 hover:bg-rose-50 border-rose-200 dark:border-rose-900/60 rounded-xl mt-2 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset Mobile
                </LoadingButton>
              )}
            </div>
          </div>
        </div>

        {/* Recent Security Incidents / Blocked Attempts */}
        {logs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
              <span>Blocked Login Incidents ({logs.length})</span>
            </h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]"
                >
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Blocked: {log.device_name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      IP: {log.ip_address || "—"} · Conflict with: {log.active_conflict_device || "Active Device"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
