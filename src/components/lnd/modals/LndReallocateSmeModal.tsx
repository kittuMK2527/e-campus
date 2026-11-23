"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import {
  RefreshCw,
  ArrowLeftRight,
  User,
  Calendar,
  Clock,
  Check,
  AlertTriangle,
  Search,
  History,
  FileText,
  Building,
  X,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Layers
} from "lucide-react";

export interface LndReallocateSmeModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: any | null;
  onSuccess?: () => void;
  colleges?: any[];
}

type ReallocationMode = "reassign" | "swap" | "reschedule";

const REALLOCATION_REASONS = [
  "SME Unavailable / Medical Leave",
  "Faculty Leave / Reschedule",
  "Timetable / Class Duty Conflict",
  "Domain / Subject Expertise Re-alignment",
  "Emergency Schedule Adjustment",
  "Workload Balancing Across SMEs",
  "Direct Reallocation by L&D",
  "Other / Custom Reason"
];

const PERIOD_SLOTS = [
  "Period 1 (08:30 - 09:25)",
  "Period 2 (09:25 - 10:20)",
  "Period 3 (10:40 - 11:35)",
  "Period 4 (11:35 - 12:30)",
  "Period 5 (01:25 - 02:20)",
  "Period 6 (02:20 - 03:15)"
];

export default function LndReallocateSmeModal({
  isOpen,
  onClose,
  session,
  onSuccess,
  colleges = []
}: LndReallocateSmeModalProps) {
  const { toast } = useToast();

  // Mode Selection
  const [mode, setMode] = useState<ReallocationMode>("reassign");

  // Reallocation Reason State
  const [selectedReason, setSelectedReason] = useState<string>(REALLOCATION_REASONS[0]);
  const [customNotes, setCustomNotes] = useState<string>("");
  const [decidedBy, setDecidedBy] = useState<string>("L&D Manager");

  // Mode 1: Candidate SMEs State
  const [candidateSmes, setCandidateSmes] = useState<any[]>([]);
  const [selectedSmeId, setSelectedSmeId] = useState<string | null>(null);
  const [smeSearchQuery, setSmeSearchQuery] = useState<string>("");
  const [onlyFreeSmes, setOnlyFreeSmes] = useState<boolean>(false);
  const [loadingCandidates, setLoadingCandidates] = useState<boolean>(false);

  // Mode 2: Candidate Swap Sessions State
  const [swapCandidates, setSwapCandidates] = useState<any[]>([]);
  const [selectedSwapSessionId, setSelectedSwapSessionId] = useState<string | null>(null);
  const [loadingSwapCandidates, setLoadingSwapCandidates] = useState<boolean>(false);

  // Mode 3: Reschedule State
  const [targetDateStr, setTargetDateStr] = useState<string>("");
  const [targetTimeSlot, setTargetTimeSlot] = useState<string>("");

  // Tracking / History State
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [allowOverride, setAllowOverride] = useState<boolean>(false);

  // Resolve session attributes
  const sessionId = session?.id;
  const sessionMentorName = session?.mentorName || session?.mentor_name || "Faculty Mentor";
  const sessionSmeName = session?.smeName || session?.sme_name || "Assigned SME";
  const sessionSmeId = session?.smeId || session?.sme_id;
  const sessionSubject = session?.subject || "Demo Evaluation";
  const sessionStream = session?.stream || "";
  const sessionDate = session?.dateStr || session?.date_str || "";
  const sessionTime = session?.timeSlot || session?.time_slot || "";
  const rawStatus = (session?.status || "").toLowerCase().trim();
  const isReallocationRequired = rawStatus === "reallocation_required";

  // Pre-populate defaults when session opens
  useEffect(() => {
    if (session) {
      setSelectedReason(
        isReallocationRequired ? "Faculty Leave / Reschedule" : "SME Unavailable / Medical Leave"
      );
      setCustomNotes("");
      setSelectedSmeId(null);
      setSelectedSwapSessionId(null);
      setErrorMessage("");
      setAllowOverride(false);
      setTargetDateStr(sessionDate || "");
      setTargetTimeSlot(sessionTime || PERIOD_SLOTS[0]);
      setMode("reassign");
    }
  }, [session, isReallocationRequired, sessionDate, sessionTime]);

  // Fetch candidate SMEs for Mode 1 or Mode 3
  const fetchCandidateSmes = useCallback(async (date?: string, time?: string) => {
    if (!sessionId) return;
    setLoadingCandidates(true);
    setErrorMessage("");
    try {
      const effDate = date || sessionDate;
      const effTime = time || sessionTime;
      const query = `/api/demo-reallocations?candidateSmesForDemoId=${encodeURIComponent(
        sessionId
      )}&targetDate=${encodeURIComponent(effDate)}&targetTime=${encodeURIComponent(effTime)}`;
      const res = await apiFetch<any>(query);
      if (res?.success && Array.isArray(res.candidates)) {
        setCandidateSmes(res.candidates);
      } else {
        setCandidateSmes([]);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load candidate SMEs");
    } finally {
      setLoadingCandidates(false);
    }
  }, [sessionId, sessionDate, sessionTime]);

  // Fetch candidate swap sessions for Mode 2
  const fetchSwapCandidates = useCallback(async () => {
    if (!sessionId) return;
    setLoadingSwapCandidates(true);
    setErrorMessage("");
    try {
      const res = await apiFetch<any>(
        `/api/demo-reallocations?candidateSwapSessionsForDemoId=${encodeURIComponent(sessionId)}`
      );
      if (res?.success && Array.isArray(res.swapCandidates)) {
        setSwapCandidates(res.swapCandidates);
      } else {
        setSwapCandidates([]);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to load sessions for swap");
    } finally {
      setLoadingSwapCandidates(false);
    }
  }, [sessionId]);

  // Fetch reallocation history
  const fetchHistory = useCallback(async () => {
    if (!sessionId) return;
    setLoadingHistory(true);
    try {
      const res = await apiFetch<any>(`/api/demo-reallocations?status=all`);
      if (res?.success && Array.isArray(res.requests)) {
        // Filter requests related to this session
        const related = res.requests.filter(
          (r: any) => r.demo_session_id === sessionId || r.demoSessionId === sessionId
        );
        setSessionHistory(related);
      }
    } catch (err) {
      console.warn("Could not fetch reallocation history", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [sessionId]);

  // Trigger data fetches on modal open and mode switch
  useEffect(() => {
    if (!isOpen || !sessionId) return;
    if (mode === "reassign") {
      fetchCandidateSmes();
    } else if (mode === "swap") {
      fetchSwapCandidates();
    } else if (mode === "reschedule") {
      fetchCandidateSmes(targetDateStr, targetTimeSlot);
    }
  }, [isOpen, sessionId, mode, fetchCandidateSmes, fetchSwapCandidates, targetDateStr, targetTimeSlot]);

  // When opening history tab
  useEffect(() => {
    if (showHistory && sessionId) {
      fetchHistory();
    }
  }, [showHistory, sessionId, fetchHistory]);

  // Filtered candidate SMEs
  const filteredSmes = useMemo(() => {
    return candidateSmes.filter((sme) => {
      if (onlyFreeSmes && !sme.available) return false;
      if (!smeSearchQuery.trim()) return true;
      const q = smeSearchQuery.toLowerCase().trim();
      const name = (sme.name || "").toLowerCase();
      const email = (sme.email || "").toLowerCase();
      const subject = (sme.subject || "").toLowerCase();
      return name.includes(q) || email.includes(q) || subject.includes(q);
    });
  }, [candidateSmes, onlyFreeSmes, smeSearchQuery]);

  // Selected candidate details
  const selectedSme = useMemo(() => {
    return candidateSmes.find((s) => s.id === selectedSmeId);
  }, [candidateSmes, selectedSmeId]);

  // Selected swap session details
  const selectedSwapSession = useMemo(() => {
    return swapCandidates.find((s) => s.id === selectedSwapSessionId);
  }, [swapCandidates, selectedSwapSessionId]);

  // Submission handler
  const handleExecuteReallocation = async () => {
    if (!sessionId) return;
    setErrorMessage("");

    // Validate reason
    const finalReason = selectedReason || "Direct SME Reallocation by L&D";
    const finalNotes = customNotes.trim();

    if (mode === "reassign" || mode === "reschedule") {
      if (!selectedSmeId) {
        setErrorMessage("Please select a candidate SME to allocate.");
        return;
      }

      const effDate = mode === "reschedule" ? targetDateStr : sessionDate;
      const effSlot = mode === "reschedule" ? targetTimeSlot : sessionTime;

      if (!effDate || !effSlot) {
        setErrorMessage("Please specify a valid date and time slot.");
        return;
      }

      setIsSubmitting(true);
      try {
        const payload = {
          action: "reallocate_sme",
          demoSessionId: sessionId,
          targetSmeId: selectedSmeId,
          targetSmeName: selectedSme?.name,
          reason: finalReason,
          notes: finalNotes,
          targetDateStr: effDate,
          targetTimeSlot: effSlot,
          decidedBy: decidedBy.trim() || "L&D Manager",
          overrideClash: allowOverride
        };

        const res = await fetch("/api/demo-reallocations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (json.success) {
          toast(json.message || `SME successfully allocated to session!`, "success");
          if (onSuccess) onSuccess();
          onClose();
        } else {
          setErrorMessage(json.message || "Failed to reallocate SME");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "An unexpected error occurred");
      } finally {
        setIsSubmitting(false);
      }
    } else if (mode === "swap") {
      if (!selectedSwapSessionId) {
        setErrorMessage("Please select an upcoming demo session to swap evaluators with.");
        return;
      }

      setIsSubmitting(true);
      try {
        const payload = {
          action: "swap_sme_sessions",
          sessionAId: sessionId,
          sessionBId: selectedSwapSessionId,
          reason: finalReason,
          notes: finalNotes,
          decidedBy: decidedBy.trim() || "L&D Manager",
          overrideClash: allowOverride
        };

        const res = await fetch("/api/demo-reallocations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (json.success) {
          toast(json.message || `SMEs successfully swapped between sessions!`, "success");
          if (onSuccess) onSuccess();
          onClose();
        } else {
          setErrorMessage(json.message || "Failed to execute SME swap");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "An unexpected error occurred");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!isOpen || !session) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Reallocate SME Evaluator"
      overlayClassName="bg-slate-950/60 backdrop-blur-xs"
      panelClassName="max-w-3xl rounded-2xl p-0 overflow-hidden flex flex-col max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl"
    >
      {/* ── HEADER ── */}
      <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Allocate &amp; Reallocate SME</span>
              {isReallocationRequired && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  Reallocation Needed
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Live SME availability checker, evaluator swaps, and audit-compliant reason tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              showHistory
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            title="View Reallocation Audit Trail"
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Track History</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── SESSION CONTEXT CARD ── */}
      <div className="px-6 py-3.5 bg-amber-50/40 dark:bg-amber-950/15 border-b border-amber-100/60 dark:border-amber-900/30 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Faculty / Mentor
            </span>
            <span className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1 truncate">
              <User className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              {sessionMentorName}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Subject &amp; Stream
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-200 block truncate" title={sessionSubject}>
              {sessionSubject} {session.week ? `· Wk ${session.week}` : ""}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Scheduled Date &amp; Slot
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {sessionDate} · {sessionTime?.split("(")[0]?.trim() || sessionTime}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">
              Current Evaluator (SME)
            </span>
            <span className="font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 truncate">
              <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
              {sessionSmeName}
            </span>
          </div>
        </div>

        {isReallocationRequired && (
          <div className="mt-2.5 pt-2 border-t border-amber-200/50 dark:border-amber-900/40 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span>
              This session was flagged for reallocation due to faculty leave or SME conflict. Choose an available evaluator or swap below.
            </span>
          </div>
        )}
      </div>

      {/* ── HISTORY DRAWER / TAB ── */}
      {showHistory ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <History className="h-4 w-4 text-amber-600" />
              Reallocation &amp; Audit Trail for this Session
            </h4>
            <span className="text-[10px] font-bold text-slate-400">
              {sessionHistory.length} event{sessionHistory.length === 1 ? "" : "s"} logged
            </span>
          </div>

          {loadingHistory ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
              Loading audit logs...
            </div>
          ) : sessionHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium italic">
              No previous reallocations recorded for this demo session.
            </div>
          ) : (
            <div className="space-y-3">
              {sessionHistory.map((item: any) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {item.request_kind || item.requestKind || "Reallocation"}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {item.created_at || item.createdAt || "Recent"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-slate-700 dark:text-slate-300">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase block">Evaluator</span>
                      <span className="font-bold text-slate-900 dark:text-white">{item.sme_name || item.smeName || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase block">Authorized By</span>
                      <span className="font-bold">{item.decided_by || item.decidedBy || "L&D"}</span>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                    <p><strong>Reason:</strong> {item.reason || "Not specified"}</p>
                    {item.decision_notes && (
                      <p className="mt-0.5 italic text-slate-500"><strong>Notes:</strong> {item.decision_notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── WORKFLOW TABS & CONTENT ── */
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Mode Selector Tabs */}
          <div className="px-6 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 flex gap-2 shrink-0 bg-slate-50/40 dark:bg-slate-900/40">
            <button
              type="button"
              onClick={() => setMode("reassign")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mode === "reassign"
                  ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>1. Reallocate / Assign SME</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("swap")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mode === "swap"
                  ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>2. Swap with Another Session</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("reschedule")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mode === "reschedule"
                  ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>3. Reschedule Slot &amp; Allocate</span>
            </button>
          </div>

          <div className="p-6 space-y-5 flex-1">
            {/* ── MODE 1: REALLOCATE SME ── */}
            {mode === "reassign" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Available Evaluators for {sessionDate} ({sessionTime})
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Evaluators with green badges are confirmed free in real time for this period.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyFreeSmes}
                        onChange={(e) => setOnlyFreeSmes(e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>Only Free SMEs</span>
                    </label>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search candidate SME by name, email, or domain expertise..."
                    value={smeSearchQuery}
                    onChange={(e) => setSmeSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                  />
                </div>

                {/* Candidate SME Cards List */}
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {loadingCandidates ? (
                    <div className="py-12 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                      Checking real-time SME availability...
                    </div>
                  ) : filteredSmes.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs font-medium italic border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      No candidate SMEs found matching your search.
                    </div>
                  ) : (
                    filteredSmes.map((sme) => {
                      const isSelected = selectedSmeId === sme.id;
                      const isCurrent = sme.isCurrentSme;

                      return (
                        <div
                          key={sme.id}
                          onClick={() => setSelectedSmeId(sme.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? "border-amber-500 bg-amber-50/30 dark:bg-amber-950/20 ring-1 ring-amber-500"
                              : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                isSelected
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {sme.name?.charAt(0) || "S"}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                                  {sme.name}
                                </span>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    Current
                                  </span>
                                )}
                                {sme.subjectMatch && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-0.5">
                                    <Sparkles className="h-2.5 w-2.5" /> Domain Match
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>{sme.email}</span>
                                <span>·</span>
                                <span className="truncate">{sme.subject}</span>
                                <span>·</span>
                                <span className="font-semibold text-slate-500 dark:text-slate-300">
                                  {sme.demoCount || 0} active demo{sme.demoCount === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-2">
                            {sme.available ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Free
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 max-w-[170px] truncate"
                                title={sme.reason || "Busy"}
                              >
                                <XCircle className="h-3 w-3 shrink-0" />
                                <span className="truncate">{sme.reason || "Busy"}</span>
                              </span>
                            )}

                            <div
                              className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "border-amber-600 bg-amber-600 text-white"
                                  : "border-slate-300 dark:border-slate-600"
                              }`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── MODE 2: SWAP WITH ANOTHER SESSION ── */}
            {mode === "swap" && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Select Upcoming Demo Session to Swap Evaluator With
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Live compatibility checks confirm both evaluators are free for each other&apos;s scheduled timeslot.
                  </p>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {loadingSwapCandidates ? (
                    <div className="py-12 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                      Evaluating swap matrix &amp; timetables...
                    </div>
                  ) : swapCandidates.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-xs font-medium italic border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      No other upcoming demo sessions available for swapping.
                    </div>
                  ) : (
                    swapCandidates.map((other) => {
                      const isSelected = selectedSwapSessionId === other.id;

                      return (
                        <div
                          key={other.id}
                          onClick={() => setSelectedSwapSessionId(other.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isSelected
                              ? "border-amber-500 bg-amber-50/30 dark:bg-amber-950/20 ring-1 ring-amber-500"
                              : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                                {other.mentorName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                · {other.subject}
                              </span>
                            </div>

                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                {other.dateStr}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {other.timeSlot}
                              </span>
                              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                SME: {other.smeName}
                              </span>
                            </div>

                            {other.clashNote && (
                              <p className="text-[9.5px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">
                                {other.clashNote}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-3 self-end sm:self-center">
                            {other.compatible ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Compatible Swap
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                Clash Detected
                              </span>
                            )}

                            <div
                              className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "border-amber-600 bg-amber-600 text-white"
                                  : "border-slate-300 dark:border-slate-600"
                              }`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── MODE 3: RESCHEDULE SLOT & ALLOCATE ── */}
            {mode === "reschedule" && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Pick New Date &amp; Period Slot
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    SME availability will be checked dynamically for the chosen target timeslot.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      New Proposed Date
                    </label>
                    <input
                      type="date"
                      value={targetDateStr}
                      onChange={(e) => {
                        setTargetDateStr(e.target.value);
                        fetchCandidateSmes(e.target.value, targetTimeSlot);
                      }}
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      New Period Slot
                    </label>
                    <select
                      value={targetTimeSlot}
                      onChange={(e) => {
                        setTargetTimeSlot(e.target.value);
                        fetchCandidateSmes(targetDateStr, e.target.value);
                      }}
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      {PERIOD_SLOTS.map((slot) => (
                        <option key={slot} value={slot}>
                          {slot}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Candidate SMEs for the new slot */}
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    SME Availability on {targetDateStr || "Selected Date"}
                  </span>

                  {loadingCandidates ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-bold flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                      Checking real-time slot availability...
                    </div>
                  ) : filteredSmes.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs font-medium italic">
                      No candidate SMEs found for this slot.
                    </div>
                  ) : (
                    filteredSmes.map((sme) => {
                      const isSelected = selectedSmeId === sme.id;
                      return (
                        <div
                          key={sme.id}
                          onClick={() => setSelectedSmeId(sme.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? "border-amber-500 bg-amber-50/30 dark:bg-amber-950/20 ring-1 ring-amber-500"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40"
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                                {sme.name}
                              </span>
                              {sme.subjectMatch && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                  Match
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">{sme.email}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {sme.available ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                Free
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 max-w-[130px] truncate">
                                {sme.reason || "Busy"}
                              </span>
                            )}

                            <div
                              className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "border-amber-600 bg-amber-600 text-white"
                                  : "border-slate-300 dark:border-slate-600"
                              }`}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── REALLOCATION REASON & AUDIT TRACKING SECTION ── */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/60 dark:bg-slate-850 p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-amber-600" />
                  Mandatory Reallocation Reason &amp; Audit Log
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">
                  Saved to Reallocation History
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Primary Reason
                  </label>
                  <select
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs focus:ring-2 focus:ring-amber-500 cursor-pointer"
                  >
                    {REALLOCATION_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                    Authorized / Decided By
                  </label>
                  <input
                    type="text"
                    value={decidedBy}
                    onChange={(e) => setDecidedBy(e.target.value)}
                    placeholder="e.g. L&D Manager, Coordinator"
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Reallocation Context / Detailed Notes
                </label>
                <textarea
                  rows={2}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Record specific rationale for future audit and review (e.g. faculty requested due to lab exam duty, SME swapped to balance stream specialty)..."
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs focus:ring-2 focus:ring-amber-500 placeholder-slate-400 resize-none"
                />
              </div>

              {/* Clash Override Toggle if error occurs */}
              {errorMessage && errorMessage.includes("Cannot") && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>L&D Manager Override: Proceed despite timetable warning?</span>
                  </div>
                  <label className="flex items-center gap-1.5 font-bold cursor-pointer text-amber-900 dark:text-amber-200">
                    <input
                      type="checkbox"
                      checked={allowOverride}
                      onChange={(e) => setAllowOverride(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                    />
                    <span>Force Override</span>
                  </label>
                </div>
              )}
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FOOTER ACTIONS ── */}
      <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl text-xs font-extrabold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
        >
          Cancel
        </button>

        {!showHistory && (
          <button
            type="button"
            disabled={
              isSubmitting ||
              (mode === "reassign" && !selectedSmeId) ||
              (mode === "swap" && !selectedSwapSessionId) ||
              (mode === "reschedule" && !selectedSmeId)
            }
            onClick={handleExecuteReallocation}
            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-zinc-900 dark:bg-amber-500 hover:bg-zinc-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 transition-all cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Saving Allocation...</span>
              </>
            ) : mode === "swap" ? (
              <>
                <ArrowLeftRight className="h-3.5 w-3.5" />
                <span>Execute SME Swap</span>
              </>
            ) : mode === "reschedule" ? (
              <>
                <Clock className="h-3.5 w-3.5" />
                <span>Reschedule &amp; Allocate</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Confirm SME Reallocation</span>
              </>
            )}
          </button>
        )}
      </div>
    </Dialog>
  );
}
