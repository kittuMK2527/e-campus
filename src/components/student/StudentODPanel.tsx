"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Loader2, ShieldCheck, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { getLocalDateStr } from "@/lib/localDate";
import { subscribeToRealtimeSync } from "@/lib/dataSync";

type OdRequest = {
  id: string;
  studentId: string;
  studentName: string;
  classGroup: string;
  start_date?: string;
  end_date?: string;
  dateStr?: string;
  reason: string;
  status: string;
  rejection_reason?: string;
  timestamp: string;
};

const statusLabel: Record<string, string> = {
  pending_mentor: "Waiting for mentor",
  pending_cm: "Waiting for campus manager",
  approved: "Approved",
  rejected: "Rejected",
};

function displayDate(value?: string) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function StudentODPanel({ role }: { role: "student" | "mentor" | "cm" }) {
  const { currentStudent, currentMentor, currentCAM, refreshData } = useApp();
  const { toast } = useToast();
  const [rows, setRows] = useState<OdRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ success: boolean; requests?: OdRequest[]; message?: string }>("/api/requests/leave");
      if (!data.success) throw new Error(data.message || "OD requests could not be loaded.");
      setRows(data.requests || []);
    } catch (error: any) {
      toast(error?.message || "OD requests could not be loaded.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeToRealtimeSync((event) => {
    if (event.domain === "student_od") void load();
  }, {
    userId: role === "student" ? currentStudent?.id : role === "mentor" ? currentMentor?.id : currentCAM?.id,
    role,
    collegeId: currentStudent?.college_id || currentMentor?.college_id || currentCAM?.college_id,
  }), [load, role, currentStudent?.id, currentStudent?.college_id, currentMentor?.id, currentMentor?.college_id, currentCAM?.id, currentCAM?.college_id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving("new");
    try {
      const data = await apiFetch<{ success: boolean; request?: OdRequest; message?: string }>("/api/requests/leave", {
        method: "POST", body: { startDate, endDate: endDate || startDate, reason },
      });
      if (!data.success) throw new Error(data.message || "OD request could not be submitted.");
      setRows((current) => [data.request!, ...current]);
      setStartDate(""); setEndDate(""); setReason("");
      toast("OD request sent to your class mentor.", "success");
    } catch (error: any) {
      toast(error?.message || "OD request could not be submitted.", "error");
    } finally { setSaving(null); }
  };

  const review = async (row: OdRequest, action: "mentor_approve" | "cm_approve" | "reject") => {
    setSaving(row.id);
    try {
      const data = await apiFetch<{ success: boolean; status?: string; message?: string }>("/api/requests/leave", {
        method: "PATCH", body: { requestId: row.id, action, reason: reviewNotes[row.id] || "" },
      });
      if (!data.success) throw new Error(data.message || "OD request could not be updated.");
      await load();
      await refreshData?.();
      toast(action === "mentor_approve" ? "Approved and sent to the campus manager." : action === "cm_approve" ? "OD approved and applied to attendance." : "OD request rejected.", "success");
    } catch (error: any) {
      toast(error?.message || "OD request could not be updated.", "error");
    } finally { setSaving(null); }
  };

  const visibleRows = role === "student" ? rows : rows.filter((row) => row.status === (role === "mentor" ? "pending_mentor" : "pending_cm"));
  const heading = role === "student" ? "On Duty requests" : role === "mentor" ? "OD requests for my classes" : "OD requests for campus approval";

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><CalendarDays className="h-5 w-5" /></div>
          <div><h2 className="text-lg font-black text-slate-900">{heading}</h2><p className="mt-1 text-sm text-slate-500">{role === "student" ? "Submit an OD request and track both approval steps." : "Review the request details and take the next approval action."}</p></div>
        </div>
      </header>

      {role === "student" && (
        <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Start date<input required type="date" min={getLocalDateStr()} value={startDate} onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); }} className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label>
          <label className="text-xs font-bold text-slate-600">End date<input required type="date" min={startDate || getLocalDateStr()} value={endDate || startDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label>
          <label className="text-xs font-bold text-slate-600 md:col-span-2">Reason<textarea required minLength={8} maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly explain the event or activity" className="mt-1.5 block w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900" /></label>
          <div className="flex items-center justify-between gap-3 md:col-span-2"><span className="text-xs text-slate-500">Your request goes to the class mentor first, then the campus manager.</span><button disabled={saving === "new" || !currentStudent} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">{saving === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit request</button></div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? <div className="flex items-center justify-center gap-2 rounded-xl bg-white p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading OD requests…</div> : visibleRows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{role === "student" ? "No OD requests yet." : "No OD requests need your review."}</div> : visibleRows.map((row) => {
          const start = row.start_date || row.dateStr;
          const end = row.end_date || row.dateStr;
          const canReview = (role === "mentor" && row.status === "pending_mentor") || (role === "cm" && row.status === "pending_cm");
          return <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-slate-900">{role === "student" ? "On Duty" : row.studentName}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.status === "approved" ? "bg-emerald-50 text-emerald-700" : row.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{statusLabel[row.status] || row.status}</span></div><p className="mt-1 text-sm text-slate-600">{displayDate(start)}{end && end !== start ? ` – ${displayDate(end)}` : ""}{row.classGroup ? ` · ${row.classGroup}` : ""}</p></div>
              <span className="text-xs text-slate-400">{row.timestamp ? new Date(row.timestamp).toLocaleDateString() : ""}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.reason}</p>
            {row.rejection_reason && <p className="mt-2 text-xs text-rose-700">Review note: {row.rejection_reason}</p>}
            {canReview && <div className="mt-4 border-t border-slate-100 pt-3"><label className="block text-xs font-semibold text-slate-500">Optional note<textarea rows={2} maxLength={500} value={reviewNotes[row.id] || ""} onChange={(e) => setReviewNotes((prev) => ({ ...prev, [row.id]: e.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Add a note if you reject this request" /></label><div className="mt-3 flex justify-end gap-2"><button disabled={saving === row.id} onClick={() => void review(row, "reject")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 disabled:opacity-50"><X className="h-4 w-4" />Reject</button><button disabled={saving === row.id} onClick={() => void review(row, role === "mentor" ? "mentor_approve" : "cm_approve")} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">{saving === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : role === "mentor" ? <Clock3 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}{role === "mentor" ? "Approve for CM" : "Approve and apply OD"}</button></div></div>}
            {role === "student" && row.status === "approved" && <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-emerald-700"><Check className="h-4 w-4" />Approved OD will appear automatically on attendance periods within these dates.</p>}
          </article>;
        })}
      </div>
    </section>
  );
}
