"use client";

import React, { useState, useMemo } from "react";
import {
  MessageSquare,
  RefreshCw,
  Filter,
  Search,
  X,
  Loader2,
  Tag,
  Clock,
  CheckCircle2,
  Building2,
  GraduationCap,
  Mail,
  Phone,
  CheckCircle
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { formatRoleLabel, normalizeRoleValue } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/context/ToastContext";
import { qk } from "@/lib/queryKeys";

export interface FeedbackReport {
  id: string;
  user_id: string;
  user_name?: string;
  user_role?: string;
  register_number?: string;
  college_name?: string;
  department?: string;
  contact_info?: string;
  title: string;
  description: string;
  type: "bug" | "feature" | "suggestion" | "other" | string;
  status: "pending" | "resolved" | "closed" | string;
  created_at?: string;
  admin_notes?: string;
  resolved_by?: string;
  resolved_at?: string;
}

export interface FeedbackTabProps {
  reports?: FeedbackReport[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onStatusChange?: (id: string, status: "pending" | "resolved" | "closed", notes?: string) => Promise<void | boolean>;
  statusUpdatingId?: string | null;
}

export const FeedbackTab: React.FC<FeedbackTabProps> = ({
  reports: propReports,
  isLoading: propIsLoading,
  onRefresh: propOnRefresh,
  onStatusChange: propOnStatusChange,
  statusUpdatingId: propStatusUpdatingId
}) => {
  const { toast } = useToast();
  const feedbackQuery = useQuery({
    queryKey: qk.adminFeedback("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/feedback");
      return (data?.reports || []) as FeedbackReport[];
    },
    enabled: !propReports
  });

  const reports = propReports ?? feedbackQuery.data ?? [];
  const isLoading = propIsLoading ?? feedbackQuery.isLoading;
  const onRefresh = propOnRefresh ?? (() => feedbackQuery.refetch());

  const [internalUpdatingId, setInternalUpdatingId] = useState<string | null>(null);
  const statusUpdatingId = propStatusUpdatingId ?? internalUpdatingId;

  const onStatusChange = async (id: string, status: "pending" | "resolved" | "closed", notes?: string): Promise<boolean> => {
    if (propOnStatusChange) return (await propOnStatusChange(id, status, notes)) !== false;
    setInternalUpdatingId(id);
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, adminNotes: notes })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        toast(data?.message || "Failed to update the report.", "error");
        return false;
      }
      feedbackQuery.refetch();
      return true;
    } catch (err: any) {
      toast(err.message || "Failed to update the report.", "error");
      return false;
    } finally {
      setInternalUpdatingId(null);
    }
  };

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved" | "closed">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [resolvingReport, setResolvingReport] = useState<FeedbackReport | null>(null);
  const [resolutionNote, setResolutionNote] = useState<string>("");

  const counts = useMemo(() => {
    return {
      all: reports.length,
      pending: reports.filter((r) => (r.status || "pending") === "pending").length,
      resolved: reports.filter((r) => r.status === "resolved").length,
      closed: reports.filter((r) => r.status === "closed").length,
      bug: reports.filter((r) => r.type === "bug").length,
      feature: reports.filter((r) => r.type === "feature").length,
      suggestion: reports.filter((r) => r.type === "suggestion").length,
      other: reports.filter((r) => !["bug", "feature", "suggestion"].includes(r.type)).length
    };
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchStatus = statusFilter === "all" || (r.status || "pending") === statusFilter;
      const matchType =
        typeFilter === "all" ||
        (typeFilter === "other"
          ? !["bug", "feature", "suggestion"].includes(r.type)
          : r.type === typeFilter);

      if (!matchStatus || !matchType) return false;
      if (!search.trim()) return true;

      const q = search.toLowerCase();
      return (
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.user_name?.toLowerCase().includes(q) ||
        r.user_id?.toLowerCase().includes(q) ||
        r.register_number?.toLowerCase().includes(q) ||
        r.college_name?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q)
      );
    });
  }, [reports, search, statusFilter, typeFilter]);

  const pagination = usePagination(filteredReports, {
    pageSize: 10,
    pageSizeOptions: [10, 20, 50]
  });

  const handleConfirmResolve = async () => {
    if (!resolvingReport) return;
    const ok = await onStatusChange(resolvingReport.id, "resolved", resolutionNote.trim());
    if (!ok) return;
    setResolvingReport(null);
    setResolutionNote("");
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={MessageSquare}
        title="User Feedback & Issue Reports"
        meta={
          counts.pending > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black border border-amber-200">
              {counts.pending} Pending
            </span>
          )
        }
        actions={
          <Button
            variant="ghost"
            onClick={onRefresh}
            className="h-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-indigo-600" : ""}`} />
            Refresh Feed
          </Button>
        }
      />

      {/* Status Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {(
          [
            ["all", "All Submissions", counts.all, "border-indigo-300 bg-indigo-50/50 text-indigo-700", "Total tickets"],
            ["pending", "Pending Review", counts.pending, "border-amber-300 bg-amber-50/50 text-amber-700", "Needs admin action"],
            ["resolved", "Resolved", counts.resolved, "border-emerald-300 bg-emerald-50/50 text-emerald-700", "Action completed"],
            ["closed", "Closed", counts.closed, "border-slate-300 bg-slate-50 text-slate-700", "Dismissed / Inactive"]
          ] as const
        ).map(([key, label, count, activeCls, sub]) => {
          const isSelected = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key as any)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? `${activeCls} ring-2 ring-indigo-400/40 shadow-2xs`
                  : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl font-extrabold text-gray-900">{count}</span>
                {key === "pending" && count > 0 && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                )}
              </div>
              <p className="text-xs font-bold text-gray-800 mt-0.5">{label}</p>
              <p className="text-[10px] text-gray-400 font-medium">{sub}</p>
            </button>
          );
        })}
      </div>

      {/* Filters Bar: Category Pills + Search */}
      <FilterBar>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Category:
          </span>
          {[
            { id: "all", label: "All Types", count: counts.all },
            { id: "bug", label: "Bugs", count: counts.bug },
            { id: "feature", label: "Features", count: counts.feature },
            { id: "suggestion", label: "Suggestions", count: counts.suggestion },
            { id: "other", label: "Other", count: counts.other }
          ].map((cat) => {
            const isSelected = typeFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setTypeFilter(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            type="text"
            aria-label="Search feedback"
            placeholder="Search student, roll, college, dept..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-8"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </FilterBar>

      {/* Feed List */}
      {isLoading && filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-card">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mb-2" />
          <p className="text-xs font-bold text-slate-500">Loading user feedback reports...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center px-4 py-12 bg-white rounded-2xl border border-slate-100 shadow-card">
          <div className="h-10 w-10 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-2.5">
            <MessageSquare className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold text-slate-800">No Feedback Reports Found</p>
          <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
            {search || statusFilter !== "all" || typeFilter !== "all"
              ? "No records match your active search or filters. Try clearing the filter."
              : 'User submissions from the floating "Report Issue / Feedback" modal will appear here.'}
          </p>
          {(search || statusFilter !== "all" || typeFilter !== "all") && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setTypeFilter("all");
              }}
              className="h-auto mt-2.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-bold transition-all"
            >
              Reset All Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {pagination.pageItems.map((r) => {
            const isPending = (r.status || "pending") === "pending";
            const isResolved = r.status === "resolved";
            const isClosed = r.status === "closed";

            return (
              <div
                key={r.id}
                className="bg-white border border-slate-100 hover:border-indigo-200 rounded-2xl p-4 shadow-card hover:shadow-card-lg transition-all space-y-3"
              >
                {/* Top Row: Meta Badges + Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                        r.type === "bug"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : r.type === "feature"
                          ? "bg-purple-50 text-purple-700 border-purple-200"
                          : r.type === "suggestion"
                          ? "bg-sky-50 text-sky-700 border-sky-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {r.type || "other"}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                        isPending
                          ? "bg-amber-50 text-amber-700 border-amber-300"
                          : isResolved
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-slate-100 text-slate-600 border-slate-300"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isPending ? "bg-amber-500 animate-pulse" : isResolved ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {r.status || "pending"}
                    </span>

                    <span className="flex items-center gap-1 text-[10px] text-gray-400 font-medium ml-1">
                      <Clock className="h-3 w-3" />
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                          })
                        : ""}
                    </span>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1.5">
                    {isPending && (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setResolvingReport(r);
                            setResolutionNote("");
                          }}
                          className="h-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                        >
                          <MessageSquare className="h-3 w-3" />
                          Resolve with Note
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={statusUpdatingId === r.id}
                          onClick={() => onStatusChange(r.id, "resolved")}
                          className="h-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-bold shadow-2xs transition-all cursor-pointer"
                          title="Mark as resolved without custom remarks"
                        >
                          {statusUpdatingId === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Quick Resolve
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={statusUpdatingId === r.id}
                          onClick={() => onStatusChange(r.id, "closed")}
                          className="h-auto px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 border border-slate-200 text-[11px] font-bold transition-all cursor-pointer"
                        >
                          Close
                        </Button>
                      </>
                    )}
                    {(isResolved || isClosed) && (
                      <Button
                        variant="ghost"
                        disabled={statusUpdatingId === r.id}
                        onClick={() => onStatusChange(r.id, "pending")}
                        className="h-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 border border-gray-300 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Reopen Ticket
                      </Button>
                    )}
                  </div>
                </div>

                {/* Reporter Identity Banner */}
                <div className="rounded-lg bg-slate-50/90 border border-slate-200/80 px-2.5 py-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-[9px] shadow-2xs shrink-0">
                        {(() => {
                          const dName =
                            r.user_name ||
                            (r.user_id && typeof r.user_id === "string" && r.user_id.includes("@")
                              ? r.user_id.split("@")[0]
                              : "User");
                          return dName && typeof dName === "string" ? dName.slice(0, 2).toUpperCase() : "U";
                        })()}
                      </div>
                      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-gray-900 truncate">
                          {r.user_name ||
                            (r.user_id && typeof r.user_id === "string" && r.user_id.includes("@")
                              ? r.user_id
                                  .split("@")[0]
                                  .replace(/[._0-9-]/g, " ")
                                  .trim()
                                  .split(/\s+/)
                                  .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                                  .join(" ")
                              : r.user_id || "Anonymous User")}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider border ${
                            (r.user_role || "").toLowerCase() === "student"
                              ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                              : (r.user_role || "").toLowerCase() === "mentor"
                              ? "bg-teal-100 text-teal-800 border-teal-200"
                              : normalizeRoleValue(r.user_role || "") === "cm"
                              ? "bg-violet-100 text-violet-800 border-violet-200"
                              : normalizeRoleValue(r.user_role || "") === "L and D"
                              ? "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }`}
                        >
                          {formatRoleLabel(r.user_role) || "User"}
                        </span>
                        {r.register_number && r.register_number !== "—" && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-white border border-gray-200 text-[9px] font-mono font-bold text-gray-600">
                            <Tag className="h-2 w-2 text-gray-400" />
                            {r.register_number}
                          </span>
                        )}
                        {(r.college_name || r.department) && (
                          <span className="text-[11px] text-gray-500 font-medium inline-flex items-center gap-1 ml-0.5">
                            <span className="text-gray-300">•</span>
                            {r.college_name && (
                              <span className="inline-flex items-center gap-0.5 text-gray-700 font-semibold">
                                <Building2 className="h-3 w-3 text-indigo-500 shrink-0" />
                                {r.college_name}
                              </span>
                            )}
                            {r.department && (
                              <span className="inline-flex items-center gap-0.5 text-gray-600">
                                <GraduationCap className="h-3 w-3 text-indigo-400 shrink-0" />
                                {r.department}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      {r.user_id && (
                        <a
                          href={`mailto:${r.user_id}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-gray-200 hover:border-indigo-300 text-gray-700 hover:text-indigo-600 transition-colors font-medium text-[10px]"
                          title="Send Email"
                        >
                          <Mail className="h-3 w-3 text-indigo-500" />
                          <span>{r.user_id}</span>
                        </a>
                      )}
                      {r.contact_info && (
                        <a
                          href={`tel:${r.contact_info}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-gray-200 hover:border-emerald-300 text-gray-700 hover:text-emerald-600 transition-colors font-medium text-[10px]"
                          title="Call reporter"
                        >
                          <Phone className="h-3 w-3 text-emerald-500" />
                          <span>{r.contact_info}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Issue Title & Description */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-gray-900 leading-snug">{r.title}</h3>
                  <div className="p-2.5 rounded-lg bg-slate-50/70 border-l-2 border-indigo-400 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-normal">
                    {r.description}
                  </div>
                </div>

                {/* Admin Resolution Callout */}
                {(r.admin_notes || r.resolved_by) && (
                  <div className="rounded-lg bg-emerald-50/80 border border-emerald-200/90 p-2 space-y-0.5">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        Admin Resolution Remarks
                      </span>
                      {r.resolved_at && (
                        <span className="text-[9px] font-mono text-emerald-600 font-semibold">
                          {new Date(r.resolved_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-emerald-950 font-medium pl-4.5 whitespace-pre-wrap">
                      {r.admin_notes || "Ticket has been reviewed and resolved."}
                    </p>
                    {r.resolved_by && (
                      <p className="text-[10px] text-emerald-700 font-bold pl-4.5 pt-0.5">
                        Handled by: <span className="underline">{r.resolved_by}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <Pagination
            currentPage={pagination.page}
            totalItems={filteredReports.length}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
            className="rounded-xl border border-gray-200"
            ariaLabel="Feedback reports pagination"
          />
        </div>
      )}

      {/* Resolve Ticket with Note Modal */}
      {resolvingReport && (
        <Dialog
          open={true}
          onOpenChange={(next) => {
            if (!next) {
              setResolvingReport(null);
              setResolutionNote("");
            }
          }}
          ariaLabel="Resolve Ticket"
          overlayClassName="p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          panelClassName="max-w-lg bg-white rounded-2xl p-6 overflow-hidden space-y-4 max-h-[90vh]"
        >
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Resolve Ticket &amp; Respond</h3>
                <p className="text-[11px] text-gray-400">Reporter will receive your note and in-app notification</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close resolve ticket dialog"
              onClick={() => {
                setResolvingReport(null);
                setResolutionNote("");
              }}
              className="h-auto w-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
            <p className="font-bold text-gray-800 line-clamp-1">{resolvingReport.title}</p>
            <p className="text-gray-500 text-[11px]">
              Raised by <span className="font-semibold text-gray-700">{resolvingReport.user_name || resolvingReport.user_id}</span> (
              {formatRoleLabel(resolvingReport.user_role) || "User"})
              {resolvingReport.college_name ? ` • ${resolvingReport.college_name}` : ""}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
              Resolution Remarks (Sent to user)
            </label>
            <Textarea
              rows={4}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="e.g. Issue investigated. Fixed attendance log discrepancy and refreshed batch sync."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="ghost"
              onClick={() => {
                setResolvingReport(null);
                setResolutionNote("");
              }}
              className="h-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              disabled={statusUpdatingId === resolvingReport.id}
              onClick={handleConfirmResolve}
              className="h-auto px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {statusUpdatingId === resolvingReport.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Confirm &amp; Resolve
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
};
