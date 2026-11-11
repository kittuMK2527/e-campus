"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from "recharts";
import {
  Clock, Ticket, Award, Users, BookOpen, GraduationCap, Building2, AlertTriangle,
  Search, ShieldCheck, RotateCw, Check, X, Trash2, ArrowUpRight, LifeBuoy
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import {
  labelForModuleType,
  matchesModuleFilter,
  moduleTypeOptions,
  resolveModuleFilter
} from "@/lib/approvalModules";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { isAnyPendingCmRequest } from "@/lib/requestStatus";

const PIE_COLORS = ["#f59e0b", "#10b981", "#6366f1", "#f43f5e", "#8b5cf6", "#14b8a6"];

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
  accent = "bg-indigo-50 text-indigo-600"
}: {
  title: string;
  subtitle: string;
  icon: any;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-black text-gray-900 leading-tight">{title}</h3>
          <p className="text-[10px] text-gray-400 font-semibold">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function OversightHub() {
  const {
    colleges,
    mentors,
    slots,
    requests,
    approvedHandovers,
    campusIssues,
    interviews,
    subjectsList,
    academicTracker,
    studentTracker,
    resolveApproval,
    updateCampusIssueStatus,
    deleteCampusIssue
  } = useApp();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"approvals" | "tickets" | "analytics">("approvals");
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Tickets Filter State
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [ticketSearchQuery, setTicketSearchQuery] = useState("");

  // Rejection Dialog State
  const [rejectingApprovalId, setRejectingApprovalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Live Approvals Query
  const approvalsQuery = useQuery({
    queryKey: qk.approvals(),
    queryFn: async () => {
      const res = await apiFetch<any>("/api/approvals?role=admin");
      if (!res?.success) throw new Error(res?.message || "Failed to load approvals");
      return res.approvals || [];
    },
    staleTime: 30_000
  });

  const rawApprovals: any[] = approvalsQuery.data || [];

  const collegeName = (id?: string | null) => colleges.find((c) => c.id === id)?.name || "Unassigned";

  const scoped = <T extends { college_id?: string | null }>(
    list: T[],
    campusOf?: (item: T) => string | null | undefined
  ) =>
    campusFilter === "all"
      ? list
      : list.filter((item) => (campusOf ? campusOf(item) === campusFilter : item.college_id === campusFilter));

  // Count pending approvals
  const pendingApprovalsCount = useMemo(() => {
    return rawApprovals.filter((a) => a.current_status === "pending").length;
  }, [rawApprovals]);

  // Filtered approvals list
  // The queue filters on a free-text column, so the picker offers the module
  // types that actually have rows. The previous hardcoded list named types no
  // approval ever carries, and each of those entries resolved to the empty
  // state — a dead control that read as "nothing pending".
  const moduleOptions = useMemo(() => moduleTypeOptions(rawApprovals), [rawApprovals]);
  const activeModuleFilter = resolveModuleFilter(moduleFilter, moduleOptions);

  const filteredApprovals = useMemo(() => {
    return rawApprovals.filter((a) => {
      if (campusFilter !== "all" && a.college_id && a.college_id !== campusFilter) return false;
      if (statusFilter !== "all" && a.current_status !== statusFilter) return false;
      if (!matchesModuleFilter(a, activeModuleFilter)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const reqName = (a.requester_name || "").toLowerCase();
        const remarks = (a.remarks || "").toLowerCase();
        const mod = `${(a.module_type || "").toLowerCase()} ${labelForModuleType(a.module_type).toLowerCase()}`;
        if (!reqName.includes(q) && !remarks.includes(q) && !mod.includes(q)) return false;
      }

      return true;
    });
  }, [rawApprovals, campusFilter, statusFilter, activeModuleFilter, searchQuery]);

  const handleApprove = async (approvalId: string) => {
    setIsProcessing(true);
    try {
      const res = await resolveApproval(approvalId, "approved");
      if (res.success) {
        toast("Request approved successfully", "success");
        approvalsQuery.refetch();
      } else {
        toast(res.message || "Failed to approve request", "error");
      }
    } catch (e: any) {
      toast(e.message || "An error occurred", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingApprovalId) return;
    if (!rejectionReason.trim()) {
      toast("Rejection reason is mandatory", "error");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await resolveApproval(rejectingApprovalId, "rejected", rejectionReason.trim());
      if (res.success) {
        toast("Request rejected successfully", "success");
        setRejectingApprovalId(null);
        setRejectionReason("");
        approvalsQuery.refetch();
      } else {
        toast(res.message || "Failed to reject request", "error");
      }
    } catch (e: any) {
      toast(e.message || "An error occurred", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Campus Help Desk Tickets Calculations & Handlers ───────────────────────────
  const scopedIssues = useMemo(() => {
    return scoped(campusIssues as any[], (i) => i.collegeId || i.college_id);
  }, [campusIssues, campusFilter]);

  const escalatedTicketsCount = useMemo(() => {
    return (scopedIssues || []).filter((t: any) => t.escalated === 1 || t.escalated === true || (t.status || "").toLowerCase() === "escalated").length;
  }, [scopedIssues]);

  const ticketStats = useMemo(() => {
    const total = scopedIssues.length;
    const escalated = (scopedIssues || []).filter((t: any) => t.escalated === 1 || t.escalated === true || (t.status || "").toLowerCase() === "escalated").length;
    const resolved = (scopedIssues || []).filter((t: any) => (t.status || "").toLowerCase().includes("resolved") || (t.status || "").toLowerCase().includes("closed")).length;
    const open = total - resolved;
    return { total, escalated, resolved, open };
  }, [scopedIssues]);

  const filteredTickets = useMemo(() => {
    return (scopedIssues || []).filter((t: any) => {
      const s = (t.status || "open").toLowerCase();
      const isEsc = t.escalated === 1 || t.escalated === true || s === "escalated";

      if (ticketStatusFilter === "escalated" && !isEsc) return false;
      if (ticketStatusFilter === "open" && (s.includes("resolved") || s.includes("closed"))) return false;
      if (ticketStatusFilter === "resolved" && !s.includes("resolved") && !s.includes("closed")) return false;
      if (ticketStatusFilter === "progress" && !s.includes("progress")) return false;

      if (ticketSearchQuery.trim()) {
        const q = ticketSearchQuery.toLowerCase();
        const title = (t.title || "").toLowerCase();
        const desc = (t.desc_text || t.desc || "").toLowerCase();
        const college = (t.collegeName || "").toLowerCase();
        const type = (t.type || "").toLowerCase();
        if (!title.includes(q) && !desc.includes(q) && !college.includes(q) && !type.includes(q)) return false;
      }
      return true;
    });
  }, [scopedIssues, ticketStatusFilter, ticketSearchQuery]);

  const handleResolveTicket = async (id: string) => {
    try {
      const res = await updateCampusIssueStatus(id, "resolved", new Date().toISOString());
      if (res.success) {
        toast("Issue marked as resolved.", "success");
      } else {
        toast(res.message || "Failed to update issue status.", "error");
      }
    } catch (e: any) {
      toast(e.message || "An error occurred.", "error");
    }
  };

  const handleToggleEscalateTicket = async (id: string, currentEscalated: boolean | number) => {
    try {
      const next = !currentEscalated;
      const res = await updateCampusIssueStatus(id, undefined, undefined, next, next ? new Date().toISOString() : undefined);
      if (res.success) {
        toast(next ? "Issue escalated to high priority." : "Issue escalation cleared.", "info");
      } else {
        toast(res.message || "Failed to update escalation.", "error");
      }
    } catch (e: any) {
      toast(e.message || "An error occurred.", "error");
    }
  };

  const handleDeleteTicket = async (id: string) => {
    try {
      const res = await deleteCampusIssue(id);
      if (res.success) {
        toast("Issue deleted.", "success");
      } else {
        toast(res.message || "Failed to delete issue.", "error");
      }
    } catch (e: any) {
      toast(e.message || "An error occurred.", "error");
    }
  };

  // ── Infographics Data ────────────────────────────────────────────────────────────
  const handoverData = useMemo(() => {
    const scopedRequests = scoped(
      requests as any[],
      (r) => r.mentorObj?.college_id || mentors.find((m) => m.id === r.requestorId)?.college_id
    );
    const pending = scopedRequests.filter((r) => isAnyPendingCmRequest(r.status)).length;
    const approved = approvedHandovers.filter(
      (h) => campusFilter === "all" || colleges.some((c) => c.id === campusFilter && (h as any).college_id === c.id)
    ).length;
    const byCampus = colleges
      .map((c) => ({
        name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
        Pending: (requests as any[]).filter(
          (r) =>
            (isAnyPendingCmRequest(r.status)) &&
            mentors.find((m) => m.id === r.requestorId)?.college_id === c.id
        ).length,
        Approved: (approvedHandovers as any[]).filter((h) => (h as any).college_id === c.id).length
      }))
      .filter((d) => d.Pending > 0 || d.Approved > 0);
    return { pending, approved, byCampus };
  }, [requests, approvedHandovers, mentors, colleges, campusFilter]);

  const ticketData = useMemo(() => {
    const scopedIssues = scoped(campusIssues as any[]);
    const statuses = ["open", "progress", "resolved"];
    const byStatus = statuses.map((s) => ({
      name: s === "progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1),
      value: scopedIssues.filter(
        (t) => (t.status || "").toLowerCase().includes(s) || (s === "open" && !t.status)
      ).length
    }));
    const escalated = scopedIssues.filter((t) => t.escalated).length;
    const byCampus = colleges
      .map((c) => ({
        name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
        Tickets: (campusIssues as any[]).filter((t) => t.collegeId === c.id).length
      }))
      .filter((d) => d.Tickets > 0);
    return { byStatus, escalated, byCampus, total: scopedIssues.length };
  }, [campusIssues, colleges, campusFilter]);

  const interviewData = useMemo(() => {
    const scopedInts = scoped(interviews as any[]);
    const statusMap: Record<string, number> = {};
    scopedInts.forEach((i) => {
      const s = (i.status || "Unknown").toString();
      statusMap[s] = (statusMap[s] || 0) + 1;
    });
    const byStatus = Object.entries(statusMap).map(([name, value]) => ({ name, value }));
    const byCampus = colleges
      .map((c) => ({
        name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
        Interviews: (interviews as any[]).filter(
          (i) => i.college_id === c.id || i.origin_college_id === c.id || i.target_college_id === c.id
        ).length
      }))
      .filter((d) => d.Interviews > 0);
    return { byStatus, byCampus, total: scopedInts.length };
  }, [interviews, colleges, campusFilter]);

  const workloadData = useMemo(() => {
    const scopedMentors = scoped(mentors as any[]);
    return scopedMentors
      .map((m) => {
        const hours = slots.filter((s) => s.mentorId === m.id).length;
        return {
          name: m.name.length > 12 ? m.name.slice(0, 12) + "…" : m.name,
          hours,
          campus: collegeName(m.college_id),
          overloaded: hours > 20,
          underloaded: hours < 5
        };
      })
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 15);
  }, [mentors, slots, campusFilter, colleges]);

  const syllabusData = useMemo(() => {
    const scopedSubjects = scoped(subjectsList as any[]);
    const conductedMap: Record<string, number> = {};
    (academicTracker as any[]).forEach((t) => {
      const key = (t.subject || "").trim().toLowerCase();
      if (key) conductedMap[key] = (conductedMap[key] || 0) + 1;
    });
    return scopedSubjects
      .slice(0, 12)
      .map((sub) => {
        const weeklyHrs = Number(sub.weekly_hours) || 4;
        const target = weeklyHrs * 15;
        const conducted = conductedMap[(sub.name || "").trim().toLowerCase()] || 0;
        return {
          name: sub.name.length > 14 ? sub.name.slice(0, 14) + "…" : sub.name,
          pct: target > 0 ? Math.min(100, Math.round((conducted / target) * 100)) : 0
        };
      })
      .sort((a, b) => a.pct - b.pct);
  }, [subjectsList, academicTracker, campusFilter]);

  const skillData = useMemo(() => {
    const byCohort: Record<string, { total: number; sum: number }> = {};
    (studentTracker as any[]).forEach((t) => {
      const cg = t.classGroup || t.cohort || "General";
      if (!byCohort[cg]) byCohort[cg] = { total: 0, sum: 0 };
      byCohort[cg].total += 1;
      const score = Number(t.score ?? t.rating ?? t.progress ?? 0);
      if (!isNaN(score) && score > 0) byCohort[cg].sum += score;
    });
    return Object.entries(byCohort)
      .map(([name, v]) => ({
        name: name.length > 14 ? name.slice(0, 14) + "…" : name,
        avg: v.total > 0 ? Math.round(v.sum / v.total) : 0,
        entries: v.total
      }))
      .sort((a, b) => b.entries - a.entries)
      .slice(0, 10);
  }, [studentTracker]);

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Building2}
        title="Oversight & Approvals Hub"
        actions={
          <div className="flex items-center gap-2">
            <Select
              aria-label="Campus filter"
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="w-auto min-w-[170px] cursor-pointer"
            >
              <option value="all">🏢 All Campuses</option>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {/* Sub-Tab Navigation */}
      <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-100 shadow-card">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("approvals")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "approvals"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Actionable Approvals</span>
            {pendingApprovalsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-400 text-slate-950 font-black text-[10px] rounded-full">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tickets")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "tickets"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Ticket className="h-4 w-4" />
            <span>Campus Help Desk</span>
            {escalatedTicketsCount > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white font-black text-[10px] rounded-full">
                {escalatedTicketsCount} Escalated
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Analytics & Infographics</span>
          </button>
        </div>

        {activeTab === "approvals" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => approvalsQuery.refetch()}
            disabled={approvalsQuery.isFetching}
            className="text-xs font-bold"
          >
            <RotateCw className={`h-3.5 w-3.5 mr-1 ${approvalsQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh Queue
          </Button>
        )}
      </div>

      {/* Tab 1: Actionable Approvals */}
      {activeTab === "approvals" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-card">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase text-slate-400">Status:</span>
              {[
                { key: "all", label: "All" },
                { key: "pending", label: "Pending", count: pendingApprovalsCount },
                { key: "approved", label: "Approved" },
                { key: "rejected", label: "Rejected" }
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatusFilter(s.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === s.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.label} {s.count !== undefined ? `(${s.count})` : ""}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Select
                aria-label="Module filter"
                value={activeModuleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-auto h-8 text-xs font-semibold"
              >
                <option value="all">All Modules</option>
                {moduleOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} ({m.count})
                  </option>
                ))}
              </Select>

              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search requester or remarks…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Approvals Table */}
          {approvalsQuery.isPending ? (
            <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-100 shadow-card">
              <RotateCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
              Loading approvals queue…
            </div>
          ) : filteredApprovals.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-100 shadow-card">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No approvals in this view</p>
              <p className="text-xs text-slate-400">All operational requests for this filter have been processed.</p>
            </div>
          ) : (
            <TableSurface>
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Details & Remarks</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApprovals.map((appr, idx) => {
                  const campus = collegeName(appr.college_id);
                  const isPending = appr.current_status === "pending";

                  return (
                    <TableRow key={appr.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-center font-bold text-slate-400">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="font-bold text-[10px] uppercase tracking-wider bg-slate-50"
                        >
                          {labelForModuleType(appr.module_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-800">{appr.requester_name || "Unknown"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {appr.requester_id || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-700">{campus}</TableCell>
                      <TableCell className="max-w-xs">
                        <div className="font-medium text-slate-800 truncate">
                          {appr.remarks || "No additional remarks"}
                        </div>
                        {appr.rejection_reason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            Reason: {appr.rejection_reason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                        {appr.created_at ? new Date(appr.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            appr.current_status === "approved"
                              ? "default"
                              : appr.current_status === "rejected"
                              ? "destructive"
                              : "outline"
                          }
                          className={
                            appr.current_status === "approved"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : appr.current_status === "rejected"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }
                        >
                          {appr.current_status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="default"
                              disabled={isProcessing}
                              onClick={() => handleApprove(appr.id)}
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isProcessing}
                              onClick={() => {
                                setRejectingApprovalId(appr.id);
                                setRejectionReason("");
                              }}
                              className="h-7 px-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">
                            Resolved by {appr.approver_name || "Admin"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableSurface>
          )}
        </div>
      )}

      {/* Tab 2: Campus Help Desk & Issues */}
      {activeTab === "tickets" && (
        <div className="space-y-4">
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
                <Ticket className="h-4 w-4 text-indigo-500" />
                <span>Total Issues</span>
              </div>
              <div className="text-xl font-black text-slate-900">{ticketStats.total}</div>
              <div className="text-[10px] text-slate-400 mt-1">Campus tickets logged</div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <span>Escalated</span>
              </div>
              <div className="text-xl font-black text-rose-600">{ticketStats.escalated}</div>
              <div className="text-[10px] text-rose-500 font-bold mt-1">Requiring immediate action</div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
                <Clock className="h-4 w-4 text-amber-500" />
                <span>Pending / Open</span>
              </div>
              <div className="text-xl font-black text-amber-600">{ticketStats.open}</div>
              <div className="text-[10px] text-slate-400 mt-1">Awaiting resolution</div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-card">
              <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Resolved</span>
              </div>
              <div className="text-xl font-black text-emerald-600">{ticketStats.resolved}</div>
              <div className="text-[10px] text-emerald-600/80 font-bold mt-1">Completed tickets</div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-100 shadow-card">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase text-slate-400">Filter:</span>
              {[
                { key: "all", label: "All Tickets", count: ticketStats.total },
                { key: "escalated", label: "Escalated", count: ticketStats.escalated },
                { key: "open", label: "Open", count: ticketStats.open },
                { key: "resolved", label: "Resolved", count: ticketStats.resolved }
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setTicketStatusFilter(s.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    ticketStatusFilter === s.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.label} ({s.count})
                </button>
              ))}
            </div>

            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search issues, notes..."
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs font-semibold"
              />
            </div>
          </div>

          {/* Tickets Table */}
          {filteredTickets.length === 0 ? (
            <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-100 shadow-card">
              <Ticket className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No issues found</p>
              <p className="text-xs text-slate-400">All campus tickets in this view are resolved or empty.</p>
            </div>
          ) : (
            <TableSurface>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Issue Title & Notes</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((t: any, idx: number) => {
                    const isEsc = t.escalated === 1 || t.escalated === true || (t.status || "").toLowerCase() === "escalated";
                    const isResolved = (t.status || "").toLowerCase().includes("resolved") || (t.status || "").toLowerCase().includes("closed");

                    return (
                      <TableRow key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <TableCell className="text-center font-bold text-slate-400">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[9.5px] font-bold uppercase ${
                                (t.priority || "").toLowerCase() === "high" || (t.priority || "").toLowerCase() === "urgent"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-slate-50 text-slate-600 border-slate-200"
                              }`}
                            >
                              {t.priority || "Medium"}
                            </Badge>
                            {isEsc && (
                              <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider bg-rose-600 text-white animate-pulse">
                                ESCALATED
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-slate-800">
                          {t.collegeName || collegeName(t.collegeId || t.college_id)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">
                            {t.type || "General"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="font-bold text-slate-800 truncate">{t.title}</div>
                          {(t.desc_text || t.desc) && (
                            <div className="text-[10.5px] text-slate-500 font-medium line-clamp-2 mt-0.5">
                              {t.desc_text || t.desc}
                            </div>
                          )}
                          {t.notes && (
                            <div className="text-[9.5px] text-indigo-600 font-semibold mt-0.5">
                              Note: {t.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                          {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={isResolved ? "default" : isEsc ? "destructive" : "outline"}
                            className={
                              isResolved
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : isEsc
                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }
                          >
                            {isResolved ? "RESOLVED" : isEsc ? "ESCALATED" : (t.status || "OPEN").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isResolved && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleResolveTicket(t.id)}
                                className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggleEscalateTicket(t.id, isEsc)}
                              className={`h-7 px-2 text-[11px] font-bold cursor-pointer ${
                                isEsc ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-rose-200 text-rose-600 hover:bg-rose-50"
                              }`}
                              title={isEsc ? "De-escalate issue" : "Escalate to high priority"}
                            >
                              <AlertTriangle className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteTicket(t.id)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Delete issue"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableSurface>
          )}
        </div>
      )}

      {/* Tab 3: Analytics & Infographics */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          {/* Row 1: Handovers + Tickets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Class Handovers"
              subtitle={`${handoverData.pending} pending · ${handoverData.approved} approved`}
              icon={Clock}
              accent="bg-amber-50 text-amber-600"
            >
              {handoverData.byCampus.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold text-center py-8">No handover activity.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={handoverData.byCampus} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Approved" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Campus Help Desk Tickets"
              subtitle={`${ticketData.total} total · ${ticketData.escalated} escalated`}
              icon={Ticket}
              accent="bg-rose-50 text-rose-600"
            >
              {ticketData.total === 0 ? (
                <p className="text-xs text-gray-400 font-semibold text-center py-8">No tickets raised.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={200}>
                    <PieChart>
                      <Pie data={ticketData.byStatus} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3}>
                        {ticketData.byStatus.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="45%" height={200}>
                    <BarChart data={ticketData.byCampus} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <XAxis type="number" allowDecimals={false} hide />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} width={80} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Bar dataKey="Tickets" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          {/* Row 2: Interviews + Workload */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Interview Pipeline"
              subtitle={`${interviewData.total} interviews`}
              icon={Award}
              accent="bg-violet-50 text-violet-600"
            >
              {interviewData.byStatus.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold text-center py-8">No interviews in the pipeline.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={interviewData.byStatus} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={0} angle={-15} textAnchor="end" height={45} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" name="Interviews" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Faculty Workload Distribution"
              subtitle="Weekly slot-hours per mentor (top 15)"
              icon={Users}
              accent="bg-teal-50 text-teal-600"
            >
              {workloadData.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold text-center py-8">No mentors with assigned slots.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={workloadData} layout="vertical" margin={{ top: 0, right: 12, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} width={90} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="hours" name="Slot-hours" radius={[0, 4, 4, 0]} barSize={12}>
                      {workloadData.map((d, i) => (
                        <Cell key={i} fill={d.overloaded ? "#f43f5e" : d.underloaded ? "#f59e0b" : "#14b8a6"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p className="text-[9px] text-gray-400 font-bold mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-rose-400" /> Red &gt; 20 hrs/wk · Amber &lt; 5 hrs/wk
              </p>
            </ChartCard>
          </div>

          {/* Row 3: Syllabus + Skills */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Syllabus Completion Pace"
              subtitle="% of 15-week semester target conducted (lowest first)"
              icon={BookOpen}
              accent="bg-indigo-50 text-indigo-600"
            >
              {syllabusData.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold text-center py-8">No academic tracker entries yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={syllabusData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} width={110} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="pct" name="Completed" radius={[0, 4, 4, 0]} barSize={12}>
                      {syllabusData.map((d, i) => (
                        <Cell key={i} fill={d.pct >= 60 ? "#10b981" : d.pct >= 30 ? "#f59e0b" : "#f43f5e"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard
              title="Skill Development Progress"
              subtitle="Average score & entry volume per cohort"
              icon={GraduationCap}
              accent="bg-emerald-50 text-emerald-600"
            >
              {skillData.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold text-center py-8">No skill tracker entries yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={skillData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="avg" name="Avg Score" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="entries" name="Entries" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </div>
      )}

      {/* Mandatory Rejection Reason Dialog */}
      <Dialog open={!!rejectingApprovalId} onOpenChange={(open) => { if (!open) setRejectingApprovalId(null); }}>
        <DialogHeader>
          <DialogTitle>Reject Approval Request</DialogTitle>
          <DialogDescription>
            A clear rejection reason is mandatory to notify the requester.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="text-xs font-bold text-slate-700 block">
            Reason for Rejection *
          </label>
          <textarea
            rows={4}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Explain why this request is being rejected (e.g. Schedule conflict, insufficient notice, policy violation)..."
            className="w-full text-xs p-3 border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium bg-sunken"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRejectingApprovalId(null)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!rejectionReason.trim() || isProcessing}
            onClick={handleConfirmReject}
            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
          >
            {isProcessing ? "Rejecting..." : "Confirm Rejection"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
