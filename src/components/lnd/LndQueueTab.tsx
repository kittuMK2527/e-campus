"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import LndLiveDemoTable from "./LndLiveDemoTable";
import LndReallocateSmeModal from "./modals/LndReallocateSmeModal";
import { Dialog } from "../ui/dialog";
import {
  RefreshCw,
  ArrowLeftRight,
  User,
  UserCheck,
  Calendar,
  Clock,
  Check,
  X,
  AlertTriangle,
  History,
  CheckCircle2,
  XCircle,
  Building,
  Layers,
  Sparkles,
  Inbox,
  ListFilter
} from "lucide-react";

export interface LndQueueTabProps {
  demoSessions?: any[];
  demoSwapRequests?: any[];
  demoReallocations?: any[];
  fetchDemoReallocations?: () => void;
  loadingReallocations?: boolean;
  reallocNotesMap?: Record<string, string>;
  setReallocNotesMap?: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  decidingReallocId?: string | null;
  decideDemoReallocation?: (requestId: string, decision: "approved" | "rejected") => Promise<void>;
  swapRequestsTab?: "pending" | "resolved";
  setSwapRequestsTab?: (tab: "pending" | "resolved") => void;
  resolveDemoSwap?: (id: string, decision: "approved" | "rejected") => Promise<{ success: boolean; message?: string }>;
  toast?: (m: string, k?: any) => void;
  refreshSessions?: () => Promise<any>;
}

type QueueSubView = "queue" | "ledger" | "history";

export default function LndQueueTab({
  demoSessions: propDemoSessions,
  demoSwapRequests: propDemoSwapRequests,
  demoReallocations: propDemoReallocations,
  fetchDemoReallocations,
  loadingReallocations,
  reallocNotesMap = {},
  setReallocNotesMap,
  decidingReallocId,
  decideDemoReallocation,
  resolveDemoSwap,
  toast,
  refreshSessions
}: LndQueueTabProps) {
  const {
    demoSessions: contextDemoSessions,
    demoSwapRequests: contextDemoSwapRequests,
    demoReallocations: contextDemoReallocations,
    mentors,
    smes,
    colleges,
    subjectsList,
    deleteDemoSession,
    refreshData
  } = useApp();

  const sessions = propDemoSessions || contextDemoSessions || [];
  const swapRequests = propDemoSwapRequests || contextDemoSwapRequests || [];
  const reallocations = propDemoReallocations || contextDemoReallocations || [];

  // Active sub-view: "queue" (Action Required), "ledger" (All Demos), "history" (Audit Trail)
  const [subView, setSubView] = useState<QueueSubView>("queue");

  // Modal session for Allocate / Reallocate / Swap
  const [modalSession, setModalSession] = useState<any | null>(null);

  // Local state for resolving swap in progress
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);

  // Local state for Mentor Swap modal
  const [swapMentorReq, setSwapMentorReq] = useState<any | null>(null);
  const [mentorCandidates, setMentorCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedTargetMentorId, setSelectedTargetMentorId] = useState<string | null>(null);
  const [swappingMentor, setSwappingMentor] = useState(false);
  const [mentorSwapError, setMentorSwapError] = useState("");

  const handleOpenSwapMentor = async (req: any) => {
    setSwapMentorReq(req);
    setSelectedTargetMentorId(null);
    setMentorSwapError("");
    setLoadingCandidates(true);
    try {
      const demoId = req.demo_session_id || req.demoSessionId;
      const res = await fetch(`/api/demo-reallocations?candidateMentorsForDemoId=${encodeURIComponent(demoId)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setMentorCandidates(data.candidates || []);
      } else {
        setMentorSwapError(data?.message || "Could not load candidate mentors");
      }
    } catch (err: any) {
      setMentorSwapError(err?.message || "Failed to load candidate mentors");
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleConfirmSwapMentor = async () => {
    if (!swapMentorReq || !selectedTargetMentorId) return;
    setSwappingMentor(true);
    try {
      const res = await fetch("/api/demo-reallocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_mentor",
          demoSessionId: swapMentorReq.demo_session_id || swapMentorReq.demoSessionId,
          targetMentorId: selectedTargetMentorId,
          decidedBy: "L&D Team",
          notes: `Reassigned via L&D from ${swapMentorReq.mentor_name || swapMentorReq.mentorName}`
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (toast) toast(data.message || "Mentor successfully swapped!", "success");
        setSwapMentorReq(null);
        handleRefresh();
      } else {
        if (toast) toast(data?.message || "Failed to swap mentor", "error");
      }
    } catch (err: any) {
      if (toast) toast(err?.message || "Network error swapping mentor", "error");
    } finally {
      setSwappingMentor(false);
    }
  };

  // Lookup maps
  const mentorsById = useMemo(() => {
    const map = new Map<string, any>();
    for (const m of mentors) {
      if (m?.id) map.set(m.id, m);
    }
    return map;
  }, [mentors]);

  const collegesById = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of colleges) {
      if (c?.id) map.set(c.id, c);
    }
    return map;
  }, [colleges]);

  // 1. Sessions flagged for reallocation (status === 'reallocation_required')
  const flaggedSessions = useMemo(() => {
    return sessions.filter((s: any) => {
      const raw = (s?.status || "").toLowerCase().trim();
      return raw === "reallocation_required";
    });
  }, [sessions]);

  // 2. Pending Reallocation Requests
  const pendingReallocations = useMemo(() => {
    return reallocations.filter((r: any) => r.status === "pending");
  }, [reallocations]);

  // 3. Pending Swap Requests
  const pendingSwapRequests = useMemo(() => {
    return swapRequests.filter((r: any) => r.status === "pending" || r.status === "pending_sme");
  }, [swapRequests]);

  // Total items needing L&D action
  const totalPendingActionCount =
    flaggedSessions.length + pendingReallocations.length + pendingSwapRequests.length;

  // Resolved reallocations history
  const resolvedHistory = useMemo(() => {
    return reallocations.filter((r: any) => r.status !== "pending");
  }, [reallocations]);

  // Refresh handler
  const handleRefresh = async () => {
    if (refreshSessions) await refreshSessions();
    else await refreshData();
    if (fetchDemoReallocations) fetchDemoReallocations();
  };

  return (
    <div className="space-y-6">
      {/* ── TOP SECTION HEADER & SUB-VIEW TABS ── */}
      <div className="bg-white/80 dark:bg-[#131317]/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4.5 shadow-card backdrop-blur-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <RefreshCw className="h-4.5 w-4.5 text-amber-500" />
              L&amp;D Demos &amp; Reallocations Hub
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Review flagged demo sessions, reallocate SMEs with real-time availability checks, and audit swap history.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
              <span>Refresh Queue</span>
            </button>
          </div>
        </div>

        {/* Sub-view Nav Strip */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setSubView("queue")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subView === "queue"
                ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            <span>Reallocations &amp; Swaps Queue</span>
            {totalPendingActionCount > 0 && (
              <span
                className={`px-2 py-0.2 rounded-full text-[10px] font-black ${
                  subView === "queue"
                    ? "bg-rose-500 text-white"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                }`}
              >
                {totalPendingActionCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView("ledger")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subView === "ledger"
                ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>All Scheduled Demos ({sessions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView("history")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subView === "history"
                ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs font-black"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Resolution &amp; Audit Track ({resolvedHistory.length})</span>
          </button>
        </div>
      </div>

      {/* ── SUB-VIEW 1: REALLOCATIONS & SWAPS QUEUE (ACTION REQUIRED) ── */}
      {subView === "queue" && (
        <div className="space-y-6">
          {totalPendingActionCount === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-[#131317]/60 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                All Demo Schedules Confirmed
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                There are no demo sessions or swap proposals waiting for reallocation. Every upcoming demo session has an active, verified SME evaluator.
              </p>
              <button
                type="button"
                onClick={() => setSubView("ledger")}
                className="mt-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                View All Scheduled Sessions
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* SECTION A: SESSIONS FLAGGED FOR REALLOCATION */}
              {flaggedSessions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Sessions Flagged for Reallocation ({flaggedSessions.length})
                    </h3>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                      Requires SME Assignment
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {flaggedSessions.map((session: any) => {
                      const mentor = mentorsById.get(session.mentorId);
                      const college = mentor?.college_id ? collegesById.get(mentor.college_id) : null;

                      return (
                        <div
                          key={session.id}
                          className="p-4 rounded-2xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/20 space-y-3.5 shadow-card flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-extrabold text-sm text-slate-900 dark:text-white block">
                                  {session.mentorName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                                  {college?.name && (
                                    <>
                                      <Building className="h-3 w-3 inline text-slate-400" />
                                      <span>{college.name}</span>
                                      <span>·</span>
                                    </>
                                  )}
                                  <span>{mentor?.department || "Faculty"}</span>
                                </span>
                              </div>

                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                                Reallocation Needed
                              </span>
                            </div>

                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1 text-xs">
                              <p className="font-bold text-slate-800 dark:text-slate-200">
                                {session.subject} {session.week ? `· Week ${session.week}` : ""}
                              </p>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3 text-slate-400" />
                                  {session.dateStr}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-slate-400" />
                                  {session.timeSlot}
                                </span>
                              </div>
                              <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1">
                                Current SME: {session.smeName || "Unassigned"}
                              </p>
                            </div>

                            {session.comments && (
                              <p className="text-[10px] text-amber-800 dark:text-amber-300 italic">
                                &quot;{session.comments}&quot;
                              </p>
                            )}
                          </div>

                          <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/40 flex items-center justify-between gap-3">
                            <span className="text-[10px] text-slate-400 font-medium">
                              Select replacement SME or swap slot
                            </span>
                            <button
                              type="button"
                              onClick={() => setModalSession(session)}
                              className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex items-center gap-1.5 transition-all cursor-pointer border border-amber-600 active:scale-95"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Allocate SME / Swap</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION B: INBOUND REALLOCATION PROPOSALS */}
              {pendingReallocations.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <Clock className="h-4 w-4 text-violet-500" />
                      Inbound Reallocation Proposals ({pendingReallocations.length})
                    </h3>
                    <span className="text-[10px] text-violet-700 dark:text-violet-400 font-bold">
                      Awaiting L&amp;D Approval
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingReallocations.map((req: any) => {
                      const relatedSession = sessions.find((s: any) => s.id === req.demo_session_id || s.id === req.demoSessionId);

                      return (
                        <div
                          key={req.id}
                          className="p-4 rounded-2xl border border-violet-200 dark:border-violet-800/80 bg-violet-50/20 dark:bg-violet-950/20 space-y-3.5 shadow-card flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-extrabold text-sm text-slate-900 dark:text-white block">
                                  {req.mentor_name || req.mentorName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {req.subject} · Proposed by {req.proposed_by || req.proposedBy || "Faculty"}
                                </span>
                              </div>

                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${
                                req.request_kind === "escalated_to_lnd"
                                  ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700 animate-pulse"
                                  : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-violet-300 dark:border-violet-700"
                              }`}>
                                {req.request_kind === "escalated_to_lnd" ? "Needs L&D Intervention" : (req.request_kind || "Proposal")}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                              <div>
                                <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Original Slot</span>
                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">{req.original_date_str}</span>
                                <span className="text-[10px] text-slate-500">{req.original_time_slot}</span>
                              </div>
                              <div>
                                <span className="text-[9px] font-black uppercase text-violet-600 block mb-0.5">Proposed Slot &amp; SME</span>
                                <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300 block">{req.proposed_date_str}</span>
                                <span className="text-[10px] text-violet-600 font-semibold">{req.proposed_time_slot}</span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">SME: {req.sme_name || "Assigned SME"}</span>
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-500 italic">
                              <strong>Reason:</strong> &quot;{req.reason || "Formal Reallocation Request"}&quot;
                            </p>
                          </div>

                          <div className="pt-2 border-t border-violet-200/60 dark:border-violet-800/40 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  if (relatedSession) {
                                    setModalSession(relatedSession);
                                  } else {
                                    setModalSession({
                                      id: req.demo_session_id || req.demoSessionId,
                                      mentorName: req.mentor_name || req.mentorName,
                                      mentorId: req.mentor_id || req.mentorId,
                                      smeId: req.sme_id || req.smeId,
                                      smeName: req.sme_name || req.smeName,
                                      subject: req.subject,
                                      stream: req.stream,
                                      dateStr: req.original_date_str,
                                      timeSlot: req.original_time_slot,
                                      status: "reallocation_required"
                                    });
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                              >
                                Reallocate SME
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenSwapMentor(req)}
                                className="px-2.5 py-1.5 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 hover:bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer flex items-center gap-1"
                              >
                                <User className="h-3 w-3 text-indigo-600" />
                                Swap Mentor
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              {decideDemoReallocation && (
                                <>
                                  <button
                                    type="button"
                                    disabled={decidingReallocId === req.id}
                                    onClick={() => decideDemoReallocation(req.id, "rejected")}
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    type="button"
                                    disabled={decidingReallocId === req.id}
                                    onClick={() => decideDemoReallocation(req.id, "approved")}
                                    className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-violet-600 hover:bg-violet-700 text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                  >
                                    Approve Proposal
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION C: SME SWAP PROPOSALS */}
              {pendingSwapRequests.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                      <ArrowLeftRight className="h-4 w-4 text-indigo-500" />
                      Evaluator Swap Requests ({pendingSwapRequests.length})
                    </h3>
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-400 font-bold">
                      Requested by Evaluators
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingSwapRequests.map((req: any) => (
                      <div
                        key={req.id}
                        className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-3.5 shadow-card flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-extrabold text-sm text-slate-900 dark:text-white block">
                                {req.smeName} → {req.mentorName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                {req.subject} · {req.swapType === "mentor" ? "Change Mentor" : "Change Slot / Evaluator"}
                              </span>
                            </div>

                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 shrink-0">
                              Swap Request
                            </span>
                          </div>

                          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1 text-xs">
                            <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                              Current: {req.dateStr} • {req.timeSlot}
                            </p>
                            {req.proposedDateStr && (
                              <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                                Proposed: {req.proposedDateStr} • {req.proposedTimeSlot}
                              </p>
                            )}
                            <p className="text-[10px] text-slate-500 italic mt-1">
                              <strong>Reason:</strong> &quot;{req.reason}&quot;
                            </p>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-end gap-2">
                          {resolveDemoSwap && (
                            <>
                              <button
                                type="button"
                                disabled={resolvingSwapId === req.id}
                                onClick={async () => {
                                  setResolvingSwapId(req.id);
                                  try {
                                    const res = await resolveDemoSwap(req.id, "rejected");
                                    if (toast) toast(res.message || "Swap request rejected", res.success ? "success" : "error");
                                    await handleRefresh();
                                  } finally {
                                    setResolvingSwapId(null);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                disabled={resolvingSwapId === req.id}
                                onClick={async () => {
                                  setResolvingSwapId(req.id);
                                  try {
                                    const res = await resolveDemoSwap(req.id, "approved");
                                    if (toast) toast(res.message || "Swap request approved!", res.success ? "success" : "error");
                                    await handleRefresh();
                                  } finally {
                                    setResolvingSwapId(null);
                                  }
                                }}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer shadow-xs disabled:opacity-50"
                              >
                                Approve Swap
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── SUB-VIEW 2: ALL SCHEDULED DEMOS TABLE ── */}
      {subView === "ledger" && (
        <LndLiveDemoTable
          demoSessions={sessions}
          demoReallocations={reallocations}
          mentors={mentors}
          smes={smes}
          colleges={colleges}
          subjectsList={subjectsList}
          deleteDemoSession={deleteDemoSession}
          refreshData={handleRefresh}
        />
      )}

      {/* ── SUB-VIEW 3: RESOLUTION & AUDIT TRACK ── */}
      {subView === "history" && (
        <div className="bg-white/90 dark:bg-[#131317]/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <History className="h-4 w-4 text-amber-500" />
                L&amp;D Reallocation &amp; Swap Resolution Ledger
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Complete audit trail of all approved, resolved, and executed SME reallocations with recorded reasoning.
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-400">
              {resolvedHistory.length} record{resolvedHistory.length === 1 ? "" : "s"}
            </span>
          </div>

          {resolvedHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium italic">
              No previous reallocations or swaps recorded in the system.
            </div>
          ) : (
            <div className="space-y-3">
              {resolvedHistory.map((item: any) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-850 text-xs space-y-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {item.request_kind || "Reallocation"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          item.status === "approved"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {item.status}
                      </span>
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {item.mentor_name || item.mentorName} · {item.subject}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono text-slate-400">
                      {item.created_at || item.createdAt || "Recent"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px]">
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Original Slot</span>
                      <span className="font-semibold">{item.original_date_str} • {item.original_time_slot}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Evaluator Assigned</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{item.sme_name || item.smeName || "—"}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Authorized By</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.decided_by || item.decidedBy || "L&D"}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
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
      )}

      {/* ── MODAL TRIGGER FOR ALLOCATE / REALLOCATE / SWAP ── */}
      {modalSession && (
        <LndReallocateSmeModal
          isOpen={Boolean(modalSession)}
          onClose={() => setModalSession(null)}
          session={modalSession}
          onSuccess={handleRefresh}
          colleges={colleges}
        />
      )}

      {/* ── MODAL FOR L&D SWAP TO ANOTHER MENTOR ── */}
      {swapMentorReq && (
        <Dialog
          open={Boolean(swapMentorReq)}
          onOpenChange={(next) => { if (!next) setSwapMentorReq(null); }}
          ariaLabel="Swap demo session mentor"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
          panelClassName="max-w-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white tracking-wider flex items-center gap-2">
                <User className="h-4 w-4 text-indigo-600" />
                Swap Demo Session to Another Mentor
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Select an eligible peer mentor from the same college who has no timetable clash.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSwapMentorReq(null)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Current session info */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/80 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-slate-900 dark:text-white">{swapMentorReq.subject}</span>
              <span className="text-[10px] text-slate-500 font-bold">{swapMentorReq.original_date_str} • {swapMentorReq.original_time_slot}</span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              Current Mentor: <span className="font-bold text-slate-800 dark:text-white">{swapMentorReq.mentor_name || swapMentorReq.mentorName}</span>
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300">
              Assigned SME: <span className="font-bold text-slate-800 dark:text-white">{swapMentorReq.sme_name || swapMentorReq.smeName}</span>
            </div>
            {swapMentorReq.reason && (
              <p className="text-[10px] text-slate-400 italic mt-1">Reason: &quot;{swapMentorReq.reason}&quot;</p>
            )}
          </div>

          {/* Candidate mentors list */}
          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              Available Peer Mentors (College / Subject)
            </span>

            {loadingCandidates ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <Clock className="h-5 w-5 animate-spin mx-auto text-indigo-500" />
                <p>Checking live timetable and availability for candidate mentors…</p>
              </div>
            ) : mentorSwapError ? (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
                {mentorSwapError}
              </div>
            ) : mentorCandidates.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6">
                No other peer mentors found for this college.
              </p>
            ) : (
              <div className="space-y-2">
                {mentorCandidates.map((cand) => {
                  const isSelected = selectedTargetMentorId === cand.id;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      disabled={!cand.available}
                      onClick={() => setSelectedTargetMentorId(cand.id)}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-500 ring-2 ring-indigo-500 shadow-xs cursor-pointer"
                          : cand.available
                            ? "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer"
                            : "bg-slate-50/60 dark:bg-slate-800/20 border-slate-200/50 dark:border-slate-800 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900 dark:text-white">
                            {cand.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            {cand.department}
                          </span>
                        </div>
                        {cand.subjects && (
                          <span className="text-[10px] text-slate-500 block">
                            Subjects: {cand.subjects}
                          </span>
                        )}
                        <span className={`text-[9.5px] font-bold block ${cand.available ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {cand.available ? "✓ Free (No timetable conflict)" : `✕ Busy: ${cand.reason}`}
                        </span>
                      </div>

                      {isSelected && (
                        <Check className="h-4.5 w-4.5 text-indigo-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSwapMentorReq(null)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedTargetMentorId || swappingMentor}
              onClick={handleConfirmSwapMentor}
              className="px-4 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {swappingMentor ? (
                <>
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <span>Swapping Mentor…</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirm Mentor Swap</span>
                </>
              )}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
