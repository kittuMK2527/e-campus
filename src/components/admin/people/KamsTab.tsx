"use client";

import React, { useState } from "react";
import {
  Briefcase,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  Loader2,
  Grid,
  History,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  X
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { College, Mentor, Slot, AuditLog, useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { KAMUserFromDB } from "@/components/admin/types";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { apiFetch } from "@/lib/apiFetch";

export interface KamsTabProps {
  kamList?: KAMUserFromDB[];
  colleges?: College[];
  mentors?: Mentor[];
  slots?: Slot[];
  auditLogs?: AuditLog[];
  isLoading?: boolean;
  isError?: boolean;
  onRefetch?: () => void;
  onCreateKam?: (id: string, name: string, email: string, title?: string) => Promise<any>;
  onUpdateKam?: (id: string, name: string, email: string, title?: string) => Promise<any>;
  onDeleteKam?: (id: string) => Promise<void>;
  loadingActions?: Record<string, boolean>;
}

export const KamsTab: React.FC<KamsTabProps> = ({
  kamList: propKamList,
  colleges: propColleges,
  mentors: propMentors,
  slots: propSlots,
  auditLogs: propAuditLogs,
  isLoading: propIsLoading,
  isError: propIsError,
  onRefetch: propOnRefetch,
  onCreateKam: propOnCreateKam,
  onUpdateKam: propOnUpdateKam,
  onDeleteKam: propOnDeleteKam,
  loadingActions: propLoadingActions
}) => {
  const app = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const colleges = propColleges ?? app.colleges ?? [];
  const mentors = propMentors ?? app.mentors ?? [];
  const slots = propSlots ?? app.slots ?? [];
  const auditLogs = propAuditLogs ?? app.auditLogs ?? [];

  const kamQuery = useQuery({
    queryKey: qk.adminKams(),
    queryFn: async () => {
      const data = await apiFetch("/api/kam?all=1");
      return (data?.kamUsers || []) as KAMUserFromDB[];
    },
    enabled: !propKamList
  });

  const kamList = propKamList ?? kamQuery.data ?? [];
  const isLoading = propIsLoading ?? kamQuery.isLoading;
  const isError = propIsError ?? kamQuery.isError;
  const onRefetch = propOnRefetch ?? (() => kamQuery.refetch());

  const [localLoading, setLocalLoading] = useState<Record<string, boolean>>({});
  const loadingActions = propLoadingActions ?? localLoading;

  const handleDeleteKam = async (id: string) => {
    if (propOnDeleteKam) return propOnDeleteKam(id);
    const ok = await showConfirm({
      message: "Delete this Key Account Manager? Their login and college assignments are removed.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`kam_${id}`]: true }));
    try {
      const result = await app.deleteKAM(id);
      if (!result.success) {
        toast(result.message || "Failed to delete Key Account Manager.", "error");
        return;
      }
      toast("Key Account Manager deleted.", "success");
      kamQuery.refetch();
    } finally {
      setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`kam_${id}`]: false }));
    }
  };
  const [showModal, setShowModal] = useState(false);
  const [editingKam, setEditingKam] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    id: "",
    name: "",
    email: "",
    title: ""
  });

  const pagination = usePagination(kamList, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50]
  });

  const handleOpenAdd = () => {
    setEditingKam(false);
    setModalError(null);
    const maxNum = (kamList || []).reduce((acc, curr) => {
      const num = parseInt(curr.id.replace("kam_", ""), 10);
      return isNaN(num) ? acc : Math.max(acc, num);
    }, 0);
    setForm({
      id: `kam_${maxNum + 1}`,
      name: "",
      email: "",
      title: "Key Account Manager"
    });
    setShowModal(true);
  };

  const handleOpenEdit = (kam: KAMUserFromDB) => {
    setEditingKam(true);
    setModalError(null);
    setForm({
      id: kam.id,
      name: kam.name,
      email: kam.email,
      title: kam.title || "Key Account Manager"
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id || !form.name || !form.email) {
      setModalError("Please fill in all required fields.");
      return;
    }
    setIsSaving(true);
    setModalError(null);
    try {
      if (editingKam) {
        if (propOnUpdateKam) {
          await propOnUpdateKam(form.id, form.name, form.email, form.title);
        } else {
          const result = await app.updateKAM({ id: form.id, name: form.name, email: form.email, title: form.title || "Key Account Manager" });
          if (!result.success) {
            setModalError(result.message || "Failed to save Key Account Manager.");
            return;
          }
          kamQuery.refetch();
        }
      } else {
        if (propOnCreateKam) {
          await propOnCreateKam(form.id, form.name, form.email, form.title);
        } else {
          const result = await app.createKAM({ id: form.id, name: form.name, email: form.email, title: form.title || "Key Account Manager" });
          if (!result.success) {
            setModalError(result.message || "Failed to save Key Account Manager.");
            return;
          }
          kamQuery.refetch();
        }
      }
      setShowModal(false);
    } catch (err: any) {
      setModalError(err.message || "Failed to save Key Account Manager.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Briefcase}
        title="Key Account Managers"
        actions={
          <Button
            variant="ghost"
            onClick={handleOpenAdd}
            className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add KAM
          </Button>
        }
      />

      <TableSurface
        footer={
          <Pagination
            currentPage={pagination.page}
            totalItems={kamList.length}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
          />
        }
      >
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead className="hidden lg:table-cell">Role Title</TableHead>
            <TableHead className="hidden sm:table-cell">Assigned Campuses</TableHead>
            <TableHead className="hidden lg:table-cell text-center">Managed Mentors</TableHead>
            <TableHead className="hidden xl:table-cell text-center">Total Scheduled Hours</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isError ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center">
                <div className="flex flex-col items-center gap-3 text-rose-500">
                  <AlertTriangle className="h-8 w-8" />
                  <p className="text-sm font-semibold">
                    Could not load Key Account Managers. The KAM directory may be temporarily unavailable.
                  </p>
                  <Button variant="outline" size="sm" onClick={onRefetch} isLoading={isLoading}>
                    Retry
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : isLoading && kamList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
                  <p className="text-sm font-semibold">Loading Key Account Managers…</p>
                </div>
              </TableCell>
            </TableRow>
          ) : kamList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Briefcase className="h-8 w-8" />
                  <p className="text-sm font-semibold">No Key Account Managers found. Click "Add KAM" to create one.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            pagination.pageItems.map((kam) => {
              const kamColleges = colleges.filter((c) => c.kam_id === kam.id);
              const kamMentors = mentors.filter((m) => kamColleges.some((c) => c.id === m.college_id));
              const kamSlots = slots.filter((s) => kamMentors.some((m) => m.id === s.mentorId));
              return (
                <TableRow key={kam.id}>
                  <TableCell className="font-bold text-gray-950">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-extrabold text-[10px]">
                        {(kam.name || "")
                          .split(" ")
                          .filter(Boolean)
                          .map((w: string) => w[0])
                          .join("") || "?"}
                      </div>
                      {kam.name || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-gray-500">{kam.email}</TableCell>
                  <TableCell className="hidden lg:table-cell text-gray-800">{kam.title}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {kamColleges.map((c) => (
                        <Badge key={c.id} variant="secondary" className="font-semibold text-[10px]">
                          {c.name}
                        </Badge>
                      ))}
                      {kamColleges.length === 0 && (
                        <span className="text-[10px] text-gray-400 italic">None assigned</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center font-bold text-gray-800">
                    {kamMentors.length}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-center font-extrabold text-indigo-600">
                    {kamSlots.length} slot{kamSlots.length !== 1 ? "s" : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ActionDropdownButton size="sm" title="KAM Actions" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>KAM Options</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => handleOpenEdit(kam)}>
                          <Edit className="h-3.5 w-3.5 mr-2 text-slate-500" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                          onClick={() => handleDeleteKam(kam.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete KAM
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </TableSurface>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Donut: Mentors Overview */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Mentors Overview</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
              This Month
            </span>
          </div>
          <div className="flex items-center gap-5">
            {(() => {
              const activeCount = mentors.filter((m) => !m || (m as any).status === "Active" || !(m as any).status).length;
              const inactiveCount = mentors.filter((m) => m && (m as any).status === "Inactive").length;
              const onLeaveCount = mentors.length - activeCount - inactiveCount;
              const total = mentors.length || 1;
              const activePct = activeCount / total;
              const leavePct = Math.max(0, onLeaveCount) / total;
              const inactivePct = inactiveCount / total;
              const C = 2 * Math.PI * 34;
              return (
                <>
                  <div className="relative flex-shrink-0">
                    <svg width="90" height="90" viewBox="0 0 90 90">
                      <circle cx="45" cy="45" r="34" fill="none" stroke="#e5e7eb" strokeWidth="12" />
                      <circle
                        cx="45"
                        cy="45"
                        r="34"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="12"
                        strokeDasharray={`${Math.round(C * activePct)} ${Math.round(C)}`}
                        strokeDashoffset={Math.round(C * 0.25)}
                        strokeLinecap="round"
                      />
                      <circle
                        cx="45"
                        cy="45"
                        r="34"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="12"
                        strokeDasharray={`${Math.round(C * leavePct)} ${Math.round(C)}`}
                        strokeDashoffset={Math.round(-(C * activePct - C * 0.25))}
                        strokeLinecap="round"
                      />
                      <circle
                        cx="45"
                        cy="45"
                        r="34"
                        fill="none"
                        stroke="#f43f5e"
                        strokeWidth="12"
                        strokeDasharray={`${Math.round(C * inactivePct)} ${Math.round(C)}`}
                        strokeDashoffset={Math.round(-(C * (activePct + leavePct) - C * 0.25))}
                        strokeLinecap="round"
                      />
                      <text x="45" y="49" textAnchor="middle" fontSize="14" fontWeight="800" fill="currentColor">
                        {mentors.length}
                      </text>
                      <text x="45" y="60" textAnchor="middle" fontSize="8" fill="#9ca3af">
                        Total
                      </text>
                    </svg>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                      <span className="text-gray-600">Active</span>
                      <span className="ml-auto font-bold text-gray-900">
                        {activeCount} ({total > 0 ? (activePct * 100).toFixed(1) : "0.0"}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-gray-600">On Leave</span>
                      <span className="ml-auto font-bold text-gray-900">
                        {Math.max(0, onLeaveCount)} ({total > 0 ? (leavePct * 100).toFixed(1) : "0.0"}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shrink-0" />
                      <span className="text-gray-600">Inactive</span>
                      <span className="ml-auto font-bold text-gray-900">
                        {inactiveCount} ({total > 0 ? (inactivePct * 100).toFixed(1) : "0.0"}%)
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Scheduled Slots by Day */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Scheduled Slots by Day</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
              {slots.length} Total Slots
            </span>
          </div>
          {(() => {
            const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const dayFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const counts = dayFull.map((d) => slots.filter((s) => s.day === d).length);
            const maxCount = Math.max(1, ...counts);
            return (
              <div className="h-[90px] flex items-end justify-between gap-2 pt-2">
                {days.map((day, idx) => {
                  const count = counts[idx];
                  const heightPct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="text-[9px] font-bold text-gray-600">{count}</span>
                      <div className="w-full bg-gray-100 rounded-t h-[55px] flex items-end overflow-hidden">
                        <div
                          className="w-full bg-indigo-500 rounded-t transition-all duration-300"
                          style={{ height: `${Math.max(4, heightPct)}%` }}
                          title={`${dayFull[idx]}: ${count} slots`}
                        />
                      </div>
                      <span className="text-[9px] text-gray-400 font-medium">{day}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* System Activity feed */}
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-card space-y-3">
          <h3 className="text-sm font-bold text-gray-900">System Activity</h3>
          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic">No recent activity.</p>
            ) : (
              auditLogs.slice(0, 4).map((log, i) => {
                const isBooking = log.type === "booking";
                const isHandover = log.type?.includes("handover");
                const isAssignment = log.type === "assignment";
                const IconComp = isBooking ? Grid : isHandover ? History : isAssignment ? UserCheck : ShieldCheck;
                const colorClass = isBooking
                  ? "bg-amber-50 text-amber-600"
                  : isHandover
                  ? "bg-indigo-50 text-indigo-600"
                  : isAssignment
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-600";
                const timeAgo = (() => {
                  try {
                    const diff = Date.now() - new Date(log.timestamp).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    return `${Math.floor(hrs / 24)}d ago`;
                  } catch {
                    return "";
                  }
                })();
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`h-7 w-7 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                      <IconComp className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-gray-900 leading-tight capitalize">
                        {(log.type || "activity").replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{log.description?.slice(0, 80) || "—"}</p>
                    </div>
                    <span className="text-[9px] text-gray-400 whitespace-nowrap shrink-0">{timeAgo}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* KAM Modal */}
      {showModal && (
        <Dialog
          open={showModal}
          onOpenChange={(next) => {
            if (!next) setShowModal(false);
          }}
          ariaLabel="Key Account Manager"
          overlayClassName="bg-slate-950/60 backdrop-blur-sm p-4"
          panelClassName="max-w-md overflow-hidden animate-slideUp p-0 space-y-0 max-h-[90vh]"
        >
          <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50">
            <h3 className="font-extrabold text-gray-900 text-sm flex items-center gap-1.5">
              <Briefcase className="h-5 w-5 text-indigo-600" />
              {editingKam ? "Edit Key Account Manager" : "Add Key Account Manager"}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close KAM dialog"
              onClick={() => setShowModal(false)}
              className="h-auto w-auto p-1 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer text-gray-500 hover:text-gray-800"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs font-semibold">
            {modalError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold flex items-center gap-1.5"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {modalError}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">KAM ID</label>
              <Input
                aria-label="KAM ID"
                type="text"
                required
                placeholder="e.g. kam_3"
                disabled={editingKam}
                value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Full Name</label>
              <Input
                aria-label="Full Name"
                type="text"
                required
                placeholder="e.g. Ramesh Dev"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Email Address</label>
              <Input
                aria-label="Email Address"
                type="email"
                required
                placeholder="e.g. ramesh.kam@faceprep.in"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">Title / Position</label>
              <Input
                aria-label="Title / Position"
                type="text"
                placeholder="e.g. Key Account Manager"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 font-bold focus:outline-none focus:ring-1 focus:ring-indigo-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowModal(false)}
                className="h-auto px-4 py-2 hover:bg-gray-100 text-gray-500 rounded-xl transition-all font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                isLoading={isSaving}
                loadingText="Saving..."
                variant="gradient"
                className="px-5 py-2 text-white rounded-xl shadow-sm transition-all font-bold cursor-pointer"
              >
                {editingKam ? "Update KAM" : "Create KAM"}
              </LoadingButton>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
};
