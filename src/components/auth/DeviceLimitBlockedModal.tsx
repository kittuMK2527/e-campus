"use client";

import React, { useState } from "react";
import { ShieldAlert, Laptop, Smartphone, CheckCircle2, ArrowRight, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Button } from "@/components/ui/button";

export interface DeviceBlockedData {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  deviceType: "desktop" | "mobile";
  conflictDevice: string;
  attemptedDevice: string;
  firstSeenAt?: string;
  lastUsedAt?: string;
}

export interface DeviceLimitBlockedModalProps {
  open: boolean;
  onClose: () => void;
  data: DeviceBlockedData | null;
}

export function DeviceLimitBlockedModal({
  open,
  onClose,
  data
}: DeviceLimitBlockedModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open || !data) return null;

  const isDesktop = data.deviceType === "desktop";

  const handleSendResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/device-reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.userId,
          email: data.userEmail,
          deviceType: data.deviceType,
          reason: reason.trim() || `Switched to new ${isDesktop ? "desktop/laptop" : "mobile device"}`
        })
      });

      const json = await res.json();
      if (json.success) {
        setSubmitted(true);
      } else {
        setErrorMessage(json.message || "Failed to submit reset request.");
      }
    } catch {
      setErrorMessage("Network error. Please try again or contact your administrator.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      ariaLabel="Device Limit Reached"
      overlayClassName="bg-slate-950/70 backdrop-blur-sm p-4"
      panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[92vh] rounded-3xl"
    >
      {/* Header */}
      <div className="flex justify-between items-center p-5 border-b border-rose-100 dark:border-rose-950/50 bg-rose-50/80 dark:bg-rose-950/30">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-rose-950 dark:text-rose-100 text-sm uppercase tracking-wider">
              Device Limit Exceeded
            </h3>
            <p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold mt-0.5">
              1 Desktop + 1 Mobile Device Policy
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Close dialog"
          onClick={onClose}
          className="h-8 w-8 text-rose-500 hover:text-rose-800 hover:bg-rose-100/50 rounded-xl cursor-pointer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-6 space-y-4 text-xs">
        {/* Device Comparison Card */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>Registered Account:</span>
            <span className="text-slate-900 dark:text-white font-mono">{data.userEmail}</span>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200">
              {isDesktop ? <Laptop className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" /> : <Smartphone className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />}
              <div>
                <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300 block">
                  Active Authorized Device
                </span>
                <span className="font-extrabold text-xs block">{data.conflictDevice}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-900 dark:text-rose-200">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
              <div>
                <span className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 block">
                  Blocked Login Attempt (New Device)
                </span>
                <span className="font-extrabold text-xs block">{data.attemptedDevice}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
          To protect academic integrity and institutional security, user accounts are limited to{" "}
          <strong>one desktop/laptop</strong> and <strong>one mobile device</strong>. An administrator has been notified of this attempt.
        </p>

        {submitted ? (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-2 text-center">
            <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <h4 className="font-extrabold text-xs text-emerald-900 dark:text-emerald-200">
              Reset Request Submitted
            </h4>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
              Your request has been dispatched to the Administrator. Once approved, your previous {isDesktop ? "desktop" : "mobile"} slot will be cleared, and you will be able to log in from this device.
            </p>
            <Button
              type="button"
              onClick={onClose}
              className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer"
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSendResetRequest} className="space-y-3 pt-1">
            {errorMessage && (
              <div role="alert" className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 font-bold text-xs">
                {errorMessage}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                Reason for switching device (Optional)
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Upgraded to a new personal laptop, changed mobile phone..."
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl px-4 py-2 cursor-pointer"
              >
                Cancel
              </Button>

              <LoadingButton
                type="submit"
                isLoading={submitting}
                className="btn-gradient text-white text-xs font-extrabold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>Request Admin Reset</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </LoadingButton>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
