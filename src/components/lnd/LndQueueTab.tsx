"use client";

import { useEffect, useState } from "react";
import { RefreshCw, UserCheck, Users, X, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Panel } from "../Panel";
import { Dialog } from "@/components/ui/dialog";
import { getInstitutionDateStr } from "@/lib/localDate";

interface LndQueueTabProps {
  demoSessions: any[];
  demoSwapRequests: any[];
  demoReallocations: any[];
  fetchDemoReallocations: () => void;
  loadingReallocations: boolean;
  reallocNotesMap: Record<string, string>;
  setReallocNotesMap: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  decidingReallocId: string | null;
  decideDemoReallocation: (requestId: string, decision: "approved" | "rejected") => Promise<void>;
  swapRequestsTab: "pending" | "resolved";
  setSwapRequestsTab: (tab: "pending" | "resolved") => void;
  resolveDemoSwap: (id: string, decision: "approved" | "rejected") => Promise<{ success: boolean; message?: string }>;
  toast: (m: string, k?: any) => void;
  refreshSessions: () => Promise<any>;
}

export default function LndQueueTab({
  demoSessions,
  demoSwapRequests,
  demoReallocations,
  fetchDemoReallocations,
  loadingReallocations,
  reallocNotesMap,
  setReallocNotesMap,
  decidingReallocId,
  decideDemoReallocation,
  swapRequestsTab,
  setSwapRequestsTab,
  resolveDemoSwap,
  toast,
  refreshSessions
}: LndQueueTabProps) {
  const [resolvingSwapId, setResolvingSwapId] = useState<string | null>(null);
  const [makeupSession, setMakeupSession] = useState<any | null>(null);
  const [makeupDate, setMakeupDate] = useState("");
  const [makeupPeriods, setMakeupPeriods] = useState<any[]>([]);
  const [makeupSlot, setMakeupSlot] = useState("");
  const [loadingMakeupAvailability, setLoadingMakeupAvailability] = useState(false);
  const [makeupAvailabilityError, setMakeupAvailabilityError] = useState("");
  const [makeupDateBlockedReason, setMakeupDateBlockedReason] = useState("");
  const [savingMakeup, setSavingMakeup] = useState(false);

  // L&D Swap to Another Mentor state
  const [swapMentorSession, setSwapMentorSession] = useState<any | null>(null);
  const [candidateMentors, setCandidateMentors] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [selectedTargetMentor, setSelectedTargetMentor] = useState<any | null>(null);
  const [swappingMentor, setSwappingMentor] = useState(false);

  useEffect(() => {
    if (!swapMentorSession) {
      setCandidateMentors([]);
      setSelectedTargetMentor(null);
      setCandidateError("");
      return;
    }
    let active = true;
    setLoadingCandidates(true);
    setCandidateError("");
    fetch(`/api/demo-reallocations?candidateMentorsForDemoId=${encodeURIComponent(swapMentorSession.id)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Could not fetch candidate mentors.");
        if (active) setCandidateMentors(data.candidates || []);
      })
      .catch(err => {
        if (active) setCandidateError(err.message || "Failed to load candidate mentors.");
      })
      .finally(() => {
        if (active) setLoadingCandidates(false);
      });
    return () => { active = false; };
  }, [swapMentorSession?.id]);

  const handleConfirmSwapMentor = async () => {
    if (!swapMentorSession || !selectedTargetMentor || swappingMentor) return;
    setSwappingMentor(true);
    try {
      const res = await fetch("/api/demo-reallocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "swap_mentor",
          demoSessionId: swapMentorSession.id,
          targetMentorId: selectedTargetMentor.id,
          decidedBy: "L&D Admin"
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to swap mentor.");
      toast(`Successfully swapped demo session to ${selectedTargetMentor.name}!`, "success");
      setSwapMentorSession(null);
      await refreshSessions();
      fetchDemoReallocations();
    } catch (err: any) {
      toast(err.message || "Failed to swap mentor", "error");
    } finally {
      setSwappingMentor(false);
    }
  };
  const missedSessions = demoSessions.filter((session: any) =>
    session.status === "not_conducted" &&
    !demoSessions.some((candidate: any) => candidate.makeup_of_session_id === session.id)
  );

  const formatDateInput = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  const getNextWeekRange = () => {
    const today = new Date(getInstitutionDateStr() + "T12:00:00");
    const daysUntilMonday = ((8 - today.getDay()) % 7) || 7;
    const start = new Date(today);
    start.setDate(start.getDate() + daysUntilMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  };

  const openMakeupScheduler = (session: any) => {
    const { start } = getNextWeekRange();
    setMakeupSession(session);
    setMakeupDate(formatDateInput(start));
    setMakeupSlot("");
    setMakeupPeriods([]);
    setMakeupAvailabilityError("");
    setMakeupDateBlockedReason("");
  };

  useEffect(() => {
    if (!makeupSession || !makeupDate) return;
    let active = true;
    setLoadingMakeupAvailability(true);
    setMakeupAvailabilityError("");
    setMakeupDateBlockedReason("");
    setMakeupPeriods([]);
    setMakeupSlot("");
    fetch("/api/demo-reallocations?demoSessionId=" + encodeURIComponent(makeupSession.id) + "&dateStr=" + encodeURIComponent(makeupDate))
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.message || "Could not check next-week availability.");
        if (active) {
          const dateAvailability = data.alternatives?.[0];
          const blockedReason = dateAvailability?.isSunday
            ? "Campus is closed on Sunday. Choose another date in the upcoming week."
            : dateAvailability?.isHoliday
              ? "This date is a campus holiday. Choose another date in the upcoming week."
              : "";
          setMakeupDateBlockedReason(blockedReason);
          setMakeupPeriods(blockedReason ? [] : dateAvailability?.periods || []);
        }
      })
      .catch(error => {
        if (active) setMakeupAvailabilityError(error?.message || "Could not check availability. Please retry.");
      })
      .finally(() => {
        if (active) setLoadingMakeupAvailability(false);
      });
    return () => { active = false; };
  }, [makeupSession?.id, makeupDate]);

  const scheduleMakeup = async () => {
    if (!makeupSession || !makeupDate || !makeupSlot || savingMakeup) return;
    setSavingMakeup(true);
    try {
      const response = await fetch("/api/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "makeup-book", originalSessionId: makeupSession.id, dateStr: makeupDate, timeSlot: makeupSlot }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.message || "Could not schedule the make-up session.");
      toast(data.message || "Make-up session scheduled for the following week.", "success");
      setMakeupSession(null);
      setMakeupSlot("");
      await refreshSessions();
    } catch (error: any) {
      toast(error?.message || "Could not schedule the make-up session.", "error");
    } finally {
      setSavingMakeup(false);
    }
  };
  return (
    <Panel
      title="Reallocation Queue & Diagnostics"
    >
      <div className="space-y-6">
        {/* ── Session outcomes that need a decision, kept next to the lists they point at ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-rose-200/70 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/20 p-3">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 block">
              Not Conducted Sessions
            </span>
            <span className="text-lg font-black leading-tight text-rose-900 dark:text-rose-200">
              {missedSessions.length}
            </span>
            <p className="text-[10px] font-semibold text-rose-700/80 dark:text-rose-300/80">
              Sessions requiring re-booking.
            </p>
          </div>
          <div className="rounded-xl border border-[#4F46E5]/25 bg-[#4F46E5]/5 dark:bg-[#4F46E5]/10 p-3">
            <span className="text-[9.5px] font-black uppercase tracking-wider text-[#4F46E5] dark:text-[#818CF8] block">
              Pending Head / SME Approval
            </span>
            <span className="text-lg font-black leading-tight text-slate-900 dark:text-white">
              {demoSwapRequests.filter((r: any) => r.status === "pending" || r.status === "pending_sme").length}
            </span>
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Swap proposals awaiting review.
            </p>
          </div>
        </div>

        <section className="space-y-3" aria-labelledby="missed-lnd-sessions-title">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <div>
              <h3 id="missed-lnd-sessions-title" className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Missed L&amp;D Sessions</h3>
              <p className="mt-1 text-[10px] font-medium text-slate-500">Keep the original mentor and schedule a linked make-up in the following week.</p>
            </div>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{missedSessions.length} need make-up</span>
          </div>

          {missedSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-5 text-center text-xs font-semibold text-slate-400 dark:border-slate-800">No missed L&amp;D sessions need a make-up right now.</div>
          ) : missedSessions.map((session: any) => (
            <article key={session.id} className="flex flex-col gap-3 rounded-xl border border-rose-100 bg-rose-50/40 p-3 dark:border-rose-900/40 dark:bg-rose-950/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-slate-900 dark:text-white">{session.subject || "L&D session"}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-rose-700 dark:bg-slate-900 dark:text-rose-300">NOT CONDUCTED</span>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{session.mentorName} · {session.smeName || "No SME"}{session.stream ? " · " + session.stream : ""}</p>
                <p className="text-[10px] text-slate-500">Original: {session.dateStr} · {session.timeSlot}</p>
              </div>
              <button type="button" onClick={() => openMakeupScheduler(session)} className="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-700 sm:w-auto">Schedule next week</button>
            </article>
          ))}

          {makeupSession && (() => {
            const { start: minDate, end: maxDate } = getNextWeekRange();
            return (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800/50 dark:bg-amber-950/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-black text-slate-900 dark:text-white">Make-up for {makeupSession.mentorName} · {makeupSession.subject}</p>
                    <p className="mt-1 text-[10px] font-medium text-slate-600 dark:text-slate-400">The original stays in history. The same mentor and SME are retained when both are free.</p>
                  </div>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">Date in the following week
                    <input type="date" value={makeupDate} min={formatDateInput(minDate)} max={formatDateInput(maxDate)} onChange={event => setMakeupDate(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900" />
                  </label>
                </div>
                {loadingMakeupAvailability && <p className="mt-3 text-xs font-semibold text-slate-500">Checking mentor and SME timetable availability…</p>}
                {makeupAvailabilityError && <p className="mt-3 text-xs font-bold text-rose-700" role="alert">{makeupAvailabilityError}</p>}
                {makeupDateBlockedReason && <p className="mt-3 text-xs font-bold text-rose-700" role="alert">{makeupDateBlockedReason}</p>}
                {!loadingMakeupAvailability && !makeupAvailabilityError && makeupPeriods.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {makeupPeriods.map((period: any) => {
                      const free = Boolean(period.mutuallyFree);
                      const selected = makeupSlot === period.period;
                      const classes = selected
                        ? "border-amber-500 bg-amber-100 ring-2 ring-amber-300 dark:bg-amber-950/40"
                        : free
                          ? "border-emerald-200 bg-white dark:bg-slate-900"
                          : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900/50";
                      return (
                        <button key={period.period} type="button" disabled={!free} onClick={() => setMakeupSlot(period.period)} className={"min-h-14 rounded-lg border p-3 text-left " + classes}>
                          <span className="block text-xs font-black">{period.period}</span>
                          <span className={"mt-1 block text-[10px] font-bold " + (free ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600")}>
                            {free ? "Mentor free · SME free" : !period.mentorFree ? "Mentor busy: " + (period.mentorReason || "not available") : "SME busy: " + (period.smeReason || "not available")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!loadingMakeupAvailability && !makeupAvailabilityError && !makeupDateBlockedReason && makeupPeriods.length === 0 && <p className="mt-3 text-xs font-semibold text-slate-500">No timetable periods were found for this date.</p>}
                <div className="mt-4 flex flex-col-reverse gap-2 border-t border-amber-200 pt-3 dark:border-amber-800/50 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setMakeupSession(null)} className="min-h-11 rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-white/70 dark:text-slate-300">Cancel</button>
                  <button type="button" disabled={!makeupSlot || savingMakeup || loadingMakeupAvailability || !!makeupDateBlockedReason} onClick={scheduleMakeup} className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{savingMakeup ? "Scheduling…" : "Confirm Make-up"}</button>
                </div>
              </div>
            );
          })()}
        </section>

        {/* ── Leave-Driven L&D Reallocation Requests (L & D Approval) ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Leave-driven L&D Reallocations</h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9.5px] font-black uppercase border border-amber-200 dark:border-amber-800">
                {demoReallocations.filter(r => r.status === "pending").length} Pending Approval
              </span>
            </div>
            <button
              onClick={fetchDemoReallocations}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-[#4F46E5] hover:border-[#4F46E5]/40 transition-all cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingReallocations ? "animate-spin" : ""}`} />
            </button>
          </div>

          {demoReallocations.filter(r => r.status === "pending").length === 0 ? (
            <div className="text-center py-6 text-slate-400 font-bold text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No pending L&D reallocation requests. All clear!
            </div>
          ) : (
            demoReallocations.filter(r => r.status === "pending").map(req => (
              <div key={req.id} className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-3 shadow-card">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-slate-900 dark:text-white">{req.subject}</span>
                      <span className="px-1.5 py-0.5 rounded bg-[#4F46E5]/10 border border-[#4F46E5]/20 text-[#4F46E5] dark:text-[#818CF8] text-[9px] font-black uppercase">
                        Week {req.week ?? "—"}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase ${
                        req.request_kind === "escalated_to_lnd"
                          ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-700 dark:text-rose-300 animate-pulse"
                          : req.request_kind === "reschedule"
                            ? "bg-amber-50 dark:bg-indigo-950/40 border-amber-200 text-amber-700 dark:text-amber-300"
                            : "bg-amber-100 dark:bg-amber-950/40 border border-amber-200 text-amber-800 dark:text-amber-300"
                        }`}>
                        {req.request_kind === "escalated_to_lnd"
                          ? "🆘 Escalated (Need Help from L&D)"
                          : req.request_kind === "reschedule"
                            ? "Mentor Reschedule Request"
                            : req.request_kind === "sme_swap"
                              ? "SME Reallocation"
                              : "Mentor Leave Reallocation"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      <div>Applying Mentor: <span className="font-bold text-slate-800 dark:text-white">{req.mentor_name}</span></div>
                      <div>SME Evaluator: <span className="font-bold text-slate-800 dark:text-white">{req.sme_name}</span></div>
                      <div className="text-rose-600 dark:text-rose-400">
                        Original slot: <span className="font-bold">{req.original_date_str} • {req.original_time_slot}</span>
                      </div>
                      <div className="text-emerald-600 dark:text-emerald-400">
                        Proposed slot: <span className="font-bold">{req.proposed_date_str} • {req.proposed_time_slot}</span>
                      </div>
                    </div>
                    {req.reason && (
                      <p className="text-[10.5px] text-slate-500 italic">Reason: {req.reason}</p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Proposed by {req.proposed_by || req.mentor_name} • Target period is reserved (blocked for other bookings) until you decide.
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col gap-2 w-full md:w-64">
                    <input
                      type="text"
                      placeholder="Decision notes (optional)"
                      value={reallocNotesMap[req.id] || ""}
                      onChange={e => setReallocNotesMap(prev => ({ ...prev, [req.id]: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-medium text-slate-800 dark:text-white focus:outline-none focus:border-[#4F46E5]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={decidingReallocId === req.id}
                        onClick={() => decideDemoReallocation(req.id, "rejected")}
                        className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={decidingReallocId === req.id}
                        onClick={() => decideDemoReallocation(req.id, "approved")}
                        className="btn-gradient flex-1 px-3.5 py-1.5 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {decidingReallocId === req.id ? "Working…" : "Approve Move"}
                      </button>
                    </div>

                    {/* L&D Option: Swap to Another Mentor at the College */}
                    <button
                      type="button"
                      onClick={() => {
                        const session = demoSessions.find((s: any) => s.id === req.demo_session_id) || {
                          id: req.demo_session_id,
                          subject: req.subject,
                          mentorName: req.mentor_name,
                          dateStr: req.original_date_str,
                          timeSlot: req.original_time_slot,
                          smeName: req.sme_name
                        };
                        setSwapMentorSession(session);
                      }}
                      className="w-full mt-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <UserCheck className="h-4 w-4" />
                      Swap to Another Mentor
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Resolved log */}
          {demoReallocations.filter(r => r.status !== "pending").length > 0 && (
            <details className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
              <summary className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 cursor-pointer">
                Resolution Log ({demoReallocations.filter(r => r.status !== "pending").length})
              </summary>
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {demoReallocations.filter(r => r.status !== "pending").slice(0, 20).map(req => (
                  <div key={req.id} className="py-2 flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-200">{req.subject} — {req.mentor_name}</span>
                    <span className="text-slate-500 dark:text-slate-400">{req.original_date_str} → {req.proposed_date_str} • {req.proposed_time_slot}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${req.status === "approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"}`}>
                      {req.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Swap Requests Table */}
        <div className="space-y-3">
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSwapRequestsTab("pending")}
              className={`pb-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${swapRequestsTab === "pending" ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-slate-400"
                }`}
            >
              Pending Review ({demoSwapRequests.filter((r: any) => r.status === "pending").length})
            </button>
            <button
              type="button"
              onClick={() => setSwapRequestsTab("resolved")}
              className={`pb-2 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${swapRequestsTab === "resolved" ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-slate-400"
                }`}
            >
              Resolution Logs ({demoSwapRequests.filter((r: any) => r.status !== "pending").length})
            </button>
          </div>

          <div className="space-y-3">
            {swapRequestsTab === "pending" ? (
              demoSwapRequests.filter((r: any) => r.status === "pending").length > 0 ? (
                demoSwapRequests.filter((r: any) => r.status === "pending").map((req: any) => (
                  <div key={req.id} className="p-4 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 dark:text-white">{req.smeName}</span>
                        <span className="px-2 py-0.5 bg-[#4F46E5]/10 text-[#4F46E5] rounded-md text-[9px] font-extrabold uppercase">
                          {(req.swapType === "mentor" || req.swapType === "internal") ? "Mentor Swap" : "Time Slot Swap"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-1">
                        Original: {req.mentorName} ({req.dateStr} • {req.timeSlot})
                      </p>
                      <p className="text-xs font-bold text-[#4F46E5] mt-0.5">
                        Proposed: {(req.swapType === "mentor" || req.swapType === "internal") ? (req.proposedMentorName || req.targetMentorName) : `${req.proposedDateStr} • ${req.proposedTimeSlot}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={resolvingSwapId === req.id}
                        onClick={async () => {
                          if (resolvingSwapId) return;
                          setResolvingSwapId(req.id);
                          try {
                            const res = await resolveDemoSwap(req.id, "rejected");
                            if (res.success) toast("Swap request rejected.", "info");
                            else toast(res.message || "Failed to reject the swap request.", "error");
                          } finally {
                            setResolvingSwapId(null);
                          }
                        }}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Reject
                      </button>
                      <button
                        disabled={resolvingSwapId === req.id}
                        onClick={async () => {
                          if (resolvingSwapId) return;
                          setResolvingSwapId(req.id);
                          try {
                            const res = await resolveDemoSwap(req.id, "approved");
                            if (res.success) toast("Swap approved and schedule updated!", "success");
                            else toast(res.message || "Failed to approve the swap request.", "error");
                          } finally {
                            setResolvingSwapId(null);
                          }
                        }}
                        className="btn-gradient px-4 py-1.5 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Approve Swap
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 font-bold text-xs">
                  No pending swap requests found. All requests are up to date!
                </div>
              )
            ) : (
              <div className="text-center py-10 text-slate-400 font-bold text-xs">
                {demoSwapRequests.filter((r: any) => r.status !== "pending").length} resolved swap log records.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── L&D Swap to Another Mentor Modal ─── */}
      {swapMentorSession && (
        <Dialog
          open={Boolean(swapMentorSession)}
          onOpenChange={(next) => { if (!next) setSwapMentorSession(null); }}
          ariaLabel="Swap to another mentor"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
          panelClassName="max-w-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4 flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#4F46E5] rounded-xl border border-indigo-200 dark:border-indigo-800">
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white tracking-wider">
                  Reassign Demo to Another Mentor
                </h3>
                <p className="text-[10.5px] text-slate-500 font-semibold mt-0.5">
                  Select an eligible peer mentor from the same college who is 100% free at this timeslot.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSwapMentorSession(null)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Current Session Summary Card */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/80 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-slate-800 dark:text-white">{swapMentorSession.subject}</span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-black text-[9px] uppercase border border-amber-200">
                Current: {swapMentorSession.mentorName}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium">
              Schedule: <strong className="text-slate-700 dark:text-slate-200">{swapMentorSession.dateStr} • {swapMentorSession.timeSlot}</strong>
            </p>
            <p className="text-[10px] text-slate-400">Assigned Evaluator: {swapMentorSession.smeName || "SME Evaluator"}</p>
          </div>

          {/* Candidate Mentors List */}
          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-500">
                Available College Faculty ({candidateMentors.length})
              </span>
              <span className="text-[9.5px] text-slate-400 font-semibold">Strict conflict check (Timetable & Demos)</span>
            </div>

            {loadingCandidates ? (
              <div className="p-6 text-center text-xs font-semibold text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#4F46E5]" />
                Checking faculty timetables for conflicts at {swapMentorSession.timeSlot}…
              </div>
            ) : candidateError ? (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-xs font-bold" role="alert">
                {candidateError}
              </div>
            ) : candidateMentors.length === 0 ? (
              <div className="p-6 text-center text-xs font-bold text-slate-400 italic">
                No peer mentors found in this college.
              </div>
            ) : (
              <div className="space-y-2">
                {candidateMentors.map((cand) => {
                  const isSelected = selectedTargetMentor?.id === cand.id;
                  const isAvailable = Boolean(cand.available);

                  return (
                    <div
                      key={cand.id}
                      onClick={() => { if (isAvailable) setSelectedTargetMentor(cand); }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-[#4F46E5] bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-[#4F46E5]"
                          : isAvailable
                            ? "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer bg-white dark:bg-slate-900"
                            : "border-slate-100 dark:border-slate-800/40 bg-slate-50/60 dark:bg-slate-800/20 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{cand.name}</span>
                          <span className="text-[9px] font-bold text-slate-400">{cand.department || "Faculty"}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          Subjects: {cand.subjects || "—"}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        {isAvailable ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[9.5px] font-extrabold inline-flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Free at Slot
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md text-[9px] font-bold inline-flex items-center gap-1 max-w-[160px] truncate" title={cand.reason}>
                            <AlertCircle className="h-3 w-3 shrink-0" /> {cand.reason || "Busy"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSwapMentorSession(null)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedTargetMentor || swappingMentor}
              onClick={handleConfirmSwapMentor}
              className="btn-gradient px-4 py-2 text-xs font-black text-white rounded-xl shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {swappingMentor ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Swapping Session…
                </>
              ) : (
                `Confirm Swap to ${selectedTargetMentor?.name || "Selected Mentor"}`
              )}
            </button>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}
