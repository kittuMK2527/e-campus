"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  CalendarCheck2,
  Clock,
  UserCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  ShieldCheck,
  Send,
  Lock,
  AlertCircle
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { Pagination } from "@/components/ui/Pagination";
import { Dialog } from "@/components/ui/dialog";
import { parseTimeToMinutes } from "@/lib/utils";

export interface CMPunchAndLeaveWidgetProps {
  currentCAM: any;
  collegeName?: string;
  collegeId?: string;
  onRefreshParent?: () => void;
}

export const CMPunchAndLeaveWidget: React.FC<CMPunchAndLeaveWidgetProps> = ({
  currentCAM,
  collegeName = "Assigned Campus",
  collegeId,
  onRefreshParent
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const effectiveCollegeId = collegeId || currentCAM?.college_id || currentCAM?.collegeId || "";
  const camId = currentCAM?.id || "";

  const [activeSubTab, setActiveSubTab] = useState<"leaves" | "punches">("leaves");

  const leaveQuery = useQuery({
    queryKey: qk.cmLeave(camId || "none"),
    enabled: !!camId,
    queryFn: async () => {
      const json = await apiFetch(`/api/cm-leave?camId=${encodeURIComponent(camId)}`);
      return json?.success && Array.isArray(json.records) ? (json.records as any[]) : [];
    },
  });
  const punchQuery = useQuery({
    queryKey: qk.cmPunch(camId || "none", effectiveCollegeId || "all"),
    enabled: !!camId,
    queryFn: async () => {
      const json = await apiFetch(`/api/cm-attendance?camId=${encodeURIComponent(camId)}`);
      return json?.success && Array.isArray(json.records) ? (json.records as any[]) : [];
    },
  });
  const leaveRequests = leaveQuery.data || [];
  const punchLogs = punchQuery.data || [];
  const loading = leaveQuery.isFetching || punchQuery.isFetching;

  // Modals
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showPunchModal, setShowPunchModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Leave Form State - strictly standardized 4 categories
  const [requestType, setRequestType] = useState<"Casual Leave" | "Emergency" | "On Duty" | "Permission">("Casual Leave");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [reason, setReason] = useState("");

  // Punch Form State
  const [punchStatus, setPunchStatus] = useState<"Present" | "On Duty" | "Half-Day" | "Leave" | "Absent">("Present");
  const [punchReason, setPunchReason] = useState("");

  // Pagination
  const [leavePage, setLeavePage] = useState(1);
  const [leavePageSize, setLeavePageSize] = useState(15);
  const [punchPage, setPunchPage] = useState(1);
  const [punchPageSize, setPunchPageSize] = useState(15);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const currentTimeDisplay = useMemo(() => {
    return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  }, []);

  // College Start Time & 30-minute Deadline Calculation (same as Mentor workflow)
  const collegeStartTimeStr = useMemo(() => {
    if (currentCAM?.shift_configs || currentCAM?.college?.shift_configs) {
      try {
        const sc = currentCAM?.shift_configs || currentCAM?.college?.shift_configs;
        const parsed = typeof sc === "string" ? JSON.parse(sc) : sc;
        const customStart = parsed?.custom_shift_params?.general?.startTime || parsed?.general?.[0]?.split("-")[0]?.trim();
        if (customStart) return customStart;
      } catch (_) {}
    }
    return "08:30 AM";
  }, [currentCAM]);

  const { isDeadlinePassed, collegeStartTimeFormatted, deadlineTimeFormatted } = useMemo(() => {
    const totalMinutes = parseTimeToMinutes(collegeStartTimeStr);
    const now = new Date();
    let hours = 8;
    let minutes = 30;
    if (totalMinutes > 0) {
      hours = Math.floor(totalMinutes / 60);
      minutes = totalMinutes % 60;
    }

    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    const deadline = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 mins after start time

    const cStartFormatted = startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const cDeadlineFormatted = deadline.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return {
      isDeadlinePassed: now > deadline,
      collegeStartTimeFormatted: cStartFormatted,
      deadlineTimeFormatted: cDeadlineFormatted
    };
  }, [collegeStartTimeStr]);

  const todayPunch = useMemo(() => {
    return punchLogs.find((p) => p.date_str === todayStr) || null;
  }, [punchLogs, todayStr]);

  const loadData = async () => {
    if (!currentCAM?.id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cm-leave"] }),
      queryClient.invalidateQueries({ queryKey: ["cm-attendance"] })
    ]);
  };

  // Handle Leave Submission (Always sent to KAM)
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast("Please provide a reason for the KAM.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        camId: currentCAM.id,
        collegeId: currentCAM.college_id || currentCAM.collegeId || effectiveCollegeId,
        kamId: currentCAM.kam_id || currentCAM.kamId,
        requestType,
        startDate,
        endDate: requestType === "Permission" ? startDate : (endDate || startDate),
        startTime: requestType === "Permission" ? startTime : null,
        endTime: requestType === "Permission" ? endTime : null,
        reason: reason.trim()
      };

      const res = await fetch("/api/cm-leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        toast(json.message || "Leave request submitted to KAM for approval!", "success");
        setShowLeaveModal(false);
        setReason("");
        loadData();
        if (onRefreshParent) onRefreshParent();
      } else {
        toast(json.message || "Failed to submit leave request.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An unexpected error occurred.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Punch Submission
  // When Present within deadline: only log exact check-in timestamp
  // When Present after deadline (Late): reason is mandatory for KAM
  // When Not Present (OD, Half-Day, Leave, Absent): reason is mandatory for KAM
  const handleSubmitPunch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const isLate = isDeadlinePassed && punchStatus === "Present";
    const isNonPresent = punchStatus !== "Present";

    if ((isLate || isNonPresent) && !punchReason.trim()) {
      toast(
        isLate
          ? "30-minute deadline has passed. Please provide a reason for the late punch to your KAM."
          : `Please provide a reason / justification for your Key Account Manager (KAM).`,
        "error"
      );
      return;
    }

    setSubmitting(true);
    try {
      const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const finalReason = isLate && !punchReason.startsWith("[Late CM Punch]")
        ? `[Late CM Punch] ${punchReason.trim()}`
        : punchReason.trim() || undefined;

      const payload = {
        camId: currentCAM.id,
        collegeId: currentCAM.college_id || currentCAM.collegeId || effectiveCollegeId,
        dateStr: todayStr,
        status: punchStatus,
        punchInTime: nowTime,
        reason: finalReason
      };

      const res = await fetch("/api/cm-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        toast(`Attendance marked as ${punchStatus} at ${nowTime}!`, "success");
        setShowPunchModal(false);
        setPunchReason("");
        loadData();
        if (onRefreshParent) onRefreshParent();
      } else {
        toast(json.message || "Failed to record attendance.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An unexpected error occurred.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Punch In Handler when clicking the main button
  const handlePunchButtonClick = () => {
    if (todayPunch) {
      toast(`Attendance is already marked as ${todayPunch.status} for today and cannot be changed.`, "warning");
      return;
    }

    if (isDeadlinePassed) {
      // Past 30m deadline -> Open modal to mandate late reason
      setPunchStatus("Present");
      setPunchReason("");
      setShowPunchModal(true);
    } else {
      // Within deadline -> 1-click instant log
      submitInstantPresent();
    }
  };

  const submitInstantPresent = async () => {
    setSubmitting(true);
    try {
      const nowTime = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const payload = {
        camId: currentCAM.id,
        collegeId: currentCAM.college_id || currentCAM.collegeId || effectiveCollegeId,
        dateStr: todayStr,
        status: "Present",
        punchInTime: nowTime
      };

      const res = await fetch("/api/cm-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (json.success) {
        toast(`Present check-in recorded at ${nowTime}!`, "success");
        loadData();
        if (onRefreshParent) onRefreshParent();
      } else {
        toast(json.message || "Failed to record attendance.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An unexpected error occurred.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const paginatedLeaves = useMemo(() => {
    const start = (leavePage - 1) * leavePageSize;
    return leaveRequests.slice(start, start + leavePageSize);
  }, [leaveRequests, leavePage, leavePageSize]);

  const paginatedPunches = useMemo(() => {
    const start = (punchPage - 1) * punchPageSize;
    return punchLogs.slice(start, start + punchPageSize);
  }, [punchLogs, punchPage, punchPageSize]);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner: Clean White Card matching dashboard style */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0 shadow-xs border border-teal-100">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                  Campus Manager Attendance &amp; Leaves
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                  {collegeName}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {!todayPunch ? (
                  isDeadlinePassed ? (
                    <span className="text-rose-600 font-bold flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      30m Deadline Passed (College Start: {collegeStartTimeFormatted}). Reason required for KAM.
                    </span>
                  ) : (
                    `Record presence or OD status within 30m of college start (${collegeStartTimeFormatted}).`
                  )
                ) : (
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <span>
                      Daily attendance recorded for <span className="font-mono font-bold text-slate-800">{todayStr}</span>
                    </span>
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Today's Status & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">Status:</span>
              {todayPunch ? (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      todayPunch.status === "Present"
                        ? "bg-emerald-500 animate-pulse"
                        : todayPunch.status === "On Duty"
                        ? "bg-teal-500"
                        : todayPunch.status === "Half-Day"
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                  />
                  <span className="text-xs font-black text-slate-800">{todayPunch.status}</span>
                  {todayPunch.punch_in_time && (
                    <span className="text-[10px] font-mono font-bold text-emerald-700">({todayPunch.punch_in_time})</span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 ml-1">
                    <Lock className="h-2.5 w-2.5" /> Status Locked
                  </span>
                </div>
              ) : (
                <span className="text-xs font-bold text-amber-600">Not Punched</span>
              )}
            </div>

            {/* Punch In Button (Hidden if already punched - No 'Update Punch' allowed) */}
            {!todayPunch && (
              <button
                type="button"
                onClick={handlePunchButtonClick}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="h-4 w-4" />
                <span>{isDeadlinePassed ? "Punch Attendance (Late)" : "Punch In (Present)"}</span>
              </button>
            )}

            {/* Apply Leave / OD Button */}
            <button
              type="button"
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold transition-all shadow-xs cursor-pointer"
            >
              <CalendarCheck2 className="h-4 w-4" />
              <span>Apply Leave / OD</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs & Records Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab("leaves")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeSubTab === "leaves"
                  ? "bg-slate-900 text-white shadow-sm border border-slate-800"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-teal-500" />
              <span>My Leave Applications ({leaveRequests.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab("punches")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeSubTab === "punches"
                  ? "bg-slate-900 text-white shadow-sm border border-slate-800"
                  : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-200"
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-emerald-500" />
              <span>Daily Attendance Logs ({punchLogs.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            title="Refresh logs"
            className="p-2 rounded-2xl border border-slate-100 bg-white text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition-all self-end sm:self-auto cursor-pointer shadow-card"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          </button>
        </div>

        {/* SUBTAB 1: LEAVE REQUESTS */}
        {activeSubTab === "leaves" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Leave Duration / Time</th>
                  <th className="p-3.5">Reason for KAM</th>
                  <th className="p-3.5">KAM Approval Status</th>
                  <th className="p-3.5 text-right">Applied Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                      Loading leave records…
                    </td>
                  </tr>
                ) : leaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-bold text-sm text-slate-600">No Leave Applications Found</p>
                      <p className="text-xs text-slate-400 mt-0.5">Click &apos;Apply Leave / OD&apos; above to submit an application to your KAM.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedLeaves.map((req) => (
                    <tr key={req.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="p-3.5 font-bold">
                        {req.request_type === "Casual Leave" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black uppercase">
                            Casual Leave
                          </span>
                        )}
                        {req.request_type === "Emergency" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-black uppercase">
                            Emergency
                          </span>
                        )}
                        {req.request_type === "On Duty" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-black uppercase">
                            On Duty (OD)
                          </span>
                        )}
                        {req.request_type === "Permission" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-black uppercase">
                            Permission
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-900 font-bold">
                        {req.start_date}
                        {req.end_date && req.end_date !== req.start_date && ` to ${req.end_date}`}
                        {req.start_time && req.end_time && (
                          <span className="block text-[10px] font-sans font-medium text-slate-500">
                            Time: {req.start_time} - {req.end_time}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-[11px] text-slate-700 max-w-xs truncate" title={req.reason}>
                        {req.reason}
                      </td>
                      <td className="p-3.5">
                        {req.status === "approved" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                              <CheckCircle2 className="h-3 w-3" /> Approved by KAM
                            </span>
                            {req.approved_by && <div className="text-[10px] text-slate-500 font-bold">By {req.approved_by}</div>}
                          </div>
                        ) : req.status === "rejected" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase">
                              <XCircle className="h-3 w-3" /> Rejected by KAM
                            </span>
                            {req.rejection_reason && (
                              <div className="text-[10px] text-rose-600 font-medium max-w-xs truncate" title={req.rejection_reason}>
                                {req.rejection_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                            <Clock className="h-3 w-3" /> Pending KAM Review
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[10px] text-slate-400">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={leavePage}
              totalItems={leaveRequests.length}
              pageSize={leavePageSize}
              onPageChange={setLeavePage}
              onPageSizeChange={setLeavePageSize}
            />
          </div>
        )}

        {/* SUBTAB 2: DAILY PUNCH LOGS */}
        {activeSubTab === "punches" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Presence Status</th>
                  <th className="p-3.5">Punch-In Time (Log)</th>
                  <th className="p-3.5">Reason / Justification (For KAM)</th>
                  <th className="p-3.5">KAM Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                      Loading punch logs…
                    </td>
                  </tr>
                ) : punchLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-bold text-sm text-slate-600">No Punch Logs Recorded</p>
                      <p className="text-xs text-slate-400 mt-0.5">Click &apos;Punch In (Present)&apos; above to record your attendance.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedPunches.map((log) => (
                    <tr key={log.id} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-slate-900">{log.date_str}</td>
                      <td className="p-3.5">
                        {log.status === "Present" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase">
                            Present
                          </span>
                        )}
                        {log.status === "On Duty" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-black uppercase">
                            On Duty (OD)
                          </span>
                        )}
                        {log.status === "Half-Day" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase">
                            Half-Day
                          </span>
                        )}
                        {log.status === "Leave" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black uppercase">
                            On Leave
                          </span>
                        )}
                        {log.status === "Absent" && (
                          <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black uppercase">
                            Absent
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-800 font-bold">
                        {log.punch_in_time || "—"}
                      </td>
                      <td className="p-3.5 text-[11px] text-slate-600 max-w-xs truncate" title={log.reason || ""}>
                        {log.reason || <span className="text-slate-400 italic">Regular Presence (Log Only)</span>}
                      </td>
                      <td className="p-3.5">
                        {log.approval_status === "approved" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                            <ShieldCheck className="h-3 w-3" /> Verified by KAM
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase">
                            Recorded
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={punchPage}
              totalItems={punchLogs.length}
              pageSize={punchPageSize}
              onPageChange={setPunchPage}
              onPageSizeChange={setPunchPageSize}
            />
          </div>
        )}
      </div>

      {/* MODAL: APPLY LEAVE / OD (Strictly 4 categories, reason for KAM) */}
      {showLeaveModal && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) setShowLeaveModal(false); }}
          ariaLabel="Apply leave, permission, or on-duty request"
          overlayClassName="bg-slate-950/60 backdrop-blur-xs"
          panelClassName="max-w-lg max-h-[90vh] rounded-2xl border-slate-200 animate-scaleUp p-0 space-y-0"
        >
          <form onSubmit={handleSubmitLeave}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0 border border-teal-200">
                  <CalendarCheck2 className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">Apply Leave / Permission / OD</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Forwarded to Key Account Manager (KAM) for review</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                aria-label="Close leave request dialog"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Category Dropdown: strictly 4 options */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Leave Category <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Leave Category"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as any)}
                  className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 transition-all cursor-pointer"
                >
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Emergency">Emergency</option>
                  <option value="On Duty">On Duty</option>
                  <option value="Permission">Permission</option>
                </select>
              </div>

              {/* Date Pickers */}
              {requestType === "Permission" ? (
                <div className="space-y-3 bg-teal-50/50 p-3.5 rounded-xl border border-teal-100">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Permission Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      aria-label="Permission Date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        From Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        required
                        aria-label="From Time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        To Time <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="time"
                        required
                        aria-label="To Time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      From Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      aria-label="From Date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                      }}
                      className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      To Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      min={startDate}
                      aria-label="To Date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs font-bold p-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600"
                    />
                  </div>
                </div>
              )}

              {/* Mandatory Reason for KAM */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Reason / Justification for Key Account Manager (KAM) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  aria-label="Reason / Justification for Key Account Manager (KAM)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Specify clear details and justification for your KAM..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-teal-600 font-medium"
                />
                <p className="text-[10px] text-slate-400 mt-1">This request will be verified and approved by your Key Account Manager (KAM).</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-teal-950/20 cursor-pointer disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{submitting ? "Submitting…" : "Submit to KAM"}</span>
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* MODAL: PUNCH IN TODAY'S STATUS */}
      {showPunchModal && (
        <Dialog
          open={true}
          onOpenChange={(next) => { if (!next) setShowPunchModal(false); }}
          ariaLabel="Mark attendance for today"
          overlayClassName="bg-slate-950/60 backdrop-blur-xs"
          panelClassName="max-w-md max-h-[90vh] rounded-2xl border-slate-200 animate-scaleUp p-0 space-y-0"
        >
          <form onSubmit={handleSubmitPunch}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700 shrink-0 border border-emerald-200">
                  <UserCheck className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">Mark Attendance for Today</h3>
                  <p className="text-[11px] text-slate-500 font-mono">Date: {todayStr}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPunchModal(false)}
                aria-label="Close attendance dialog"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {isDeadlinePassed && punchStatus === "Present" && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Late Punch (Past {deadlineTimeFormatted})</span>
                    <span className="text-[11px] text-rose-700 leading-relaxed">
                      The 30-minute punch deadline has passed. Please specify your reason for being late. This will be submitted to your Key Account Manager (KAM).
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Today&apos;s Presence Status <span className="text-rose-500">*</span>
                </label>
                <select
                  aria-label="Today's Presence Status"
                  value={punchStatus}
                  onChange={(e) => setPunchStatus(e.target.value as any)}
                  className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all cursor-pointer"
                >
                  <option value="Present">Present (On Campus)</option>
                  <option value="On Duty">On Duty (OD - Official Campus Duty)</option>
                  <option value="Half-Day">Half-Day</option>
                  <option value="Leave">On Leave</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>

              {punchStatus === "Present" && !isDeadlinePassed ? (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-800">Check-in Time to Log:</span>
                    <span className="font-mono font-black text-emerald-900">{currentTimeDisplay}</span>
                  </div>
                  <p className="text-[10px] text-emerald-700">Punching as Present automatically logs the exact timestamp.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    {isDeadlinePassed && punchStatus === "Present"
                      ? "Reason for Late Punch (Mandatory for KAM) *"
                      : "Reason / Justification for Key Account Manager (KAM) *"}
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={punchReason}
                    onChange={(e) => setPunchReason(e.target.value)}
                    placeholder={
                      isDeadlinePassed && punchStatus === "Present"
                        ? "State the reason for late arrival/punch (e.g. Field coordination, traffic delay)..."
                        : `Please explain why status is ${punchStatus} for your KAM...`
                    }
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-emerald-600 font-medium"
                  />
                  <p className="text-[10px] text-slate-500 font-medium">
                    This justification is submitted to your Key Account Manager (KAM) for review.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPunchModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-emerald-950/20 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{submitting ? "Saving…" : "Save Attendance"}</span>
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
};
