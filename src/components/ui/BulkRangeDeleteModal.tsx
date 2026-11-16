"use client";

import React, { useState, useMemo } from "react";
import { Trash2, AlertTriangle, ShieldAlert, Check, Calendar, Hash, ArrowRight, Loader2, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";

export interface BulkRangeDeleteModalProps<T = any> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  entityName: string;
  items: T[];
  mode?: "date" | "index";
  getDate?: (item: T) => string | undefined;
  getItemId?: (item: T) => string;
  getItemLabel?: (item: T) => string;
  onDeleteRange: (matchingItems: T[]) => Promise<{ success: boolean; message?: string; count?: number } | void>;
  onSuccess?: () => void;
}

export function BulkRangeDeleteModal<T = any>({
  open,
  onOpenChange,
  title,
  entityName,
  items,
  mode = "date",
  getDate = (item: any) => item.date || item.created_at || item.start_date,
  getItemId = (item: any) => item.id || item._id,
  getItemLabel = (item: any) => item.title || item.name || item.code || String(getItemId(item)),
  onDeleteRange,
  onSuccess
}: BulkRangeDeleteModalProps<T>) {
  const { toast } = useToast();

  // Date range states
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Index / row range states (1-based for user readability)
  const [fromIndex, setFromIndex] = useState<number>(1);
  const [toIndex, setToIndex] = useState<number>(() => Math.min(items.length, 10));

  const [confirmStep, setConfirmStep] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  // Calculate matching items based on selected range
  const matchingItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    if (mode === "date") {
      if (!startDate && !endDate) return items;
      return items.filter(item => {
        const itemDate = getDate(item);
        if (!itemDate) return false;
        const dStr = itemDate.slice(0, 10);
        if (startDate && dStr < startDate) return false;
        if (endDate && dStr > endDate) return false;
        return true;
      });
    } else {
      // Row index range (1-indexed)
      const start = Math.max(0, fromIndex - 1);
      const end = Math.min(items.length, toIndex);
      if (start >= end) return [];
      return items.slice(start, end);
    }
  }, [items, mode, startDate, endDate, fromIndex, toIndex, getDate]);

  const handleExecuteDelete = async () => {
    if (matchingItems.length === 0) {
      toast("No records match the selected range to delete.", "info");
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Audit Logging First: record intended deletion in audit log
      try {
        await apiFetch("/api/audit-log", {
          method: "POST",
          body: JSON.stringify({
            action: "BULK_RANGE_DELETE",
            entity: entityName,
            range: mode === "date" ? { startDate, endDate } : { fromIndex, toIndex },
            deletedCount: matchingItems.length,
            items: matchingItems.map(m => getItemId(m)),
            reason: deleteReason.trim() || `Bulk range delete of ${entityName}`
          })
        });
      } catch (logErr) {
        console.warn("Audit logging warning:", logErr);
      }

      // 2. Execute deletion callback
      const res = await onDeleteRange(matchingItems);
      const isSuccess = res && typeof res === "object" ? res.success !== false : true;

      if (isSuccess) {
        toast(`Successfully deleted ${matchingItems.length} ${entityName} in range.`, "success");
        setConfirmStep(false);
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        toast((res as any)?.message || `Failed to delete ${entityName} in range.`, "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred during range deletion.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) return;
    setConfirmStep(false);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      ariaLabel={title}
      overlayClassName="bg-slate-950/70 backdrop-blur-sm p-4"
      panelClassName="max-w-lg bg-zinc-950 text-zinc-100 border border-amber-500/30 shadow-2xl rounded-2xl overflow-hidden p-0 animate-scaleIn"
    >
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800 bg-zinc-900/90">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Trash2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-zinc-100 tracking-tight">{title}</h3>
            <p className="text-[10px] text-zinc-400 font-semibold">
              Filter by range, preview matching records, and delete in bulk with audit logging.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-6 space-y-5 text-xs font-medium">
        {!confirmStep ? (
          <>
            {/* Range Controls */}
            {mode === "date" ? (
              <div className="space-y-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                  <Calendar className="h-3.5 w-3.5" /> Select Date Range
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">From Date</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-zinc-900 border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-xs font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">To Date</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-zinc-900 border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-xs font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                  <Hash className="h-3.5 w-3.5" /> Select Row / Index Range
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">From Row #</label>
                    <Input
                      type="number"
                      min={1}
                      max={items.length}
                      value={fromIndex}
                      onChange={e => setFromIndex(Number(e.target.value) || 1)}
                      className="w-full bg-zinc-900 border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-xs font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">To Row #</label>
                    <Input
                      type="number"
                      min={fromIndex}
                      max={items.length}
                      value={toIndex}
                      onChange={e => setToIndex(Number(e.target.value) || items.length)}
                      className="w-full bg-zinc-900 border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-xs font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 font-semibold">
                  Total records available in this view: {items.length}
                </div>
              </div>
            )}

            {/* Impact / Preview Counter */}
            <div className={`p-4 rounded-xl border transition-all ${
              matchingItems.length > 0 
                ? "bg-amber-500/10 border-amber-500/30 text-amber-300" 
                : "bg-zinc-900 border-zinc-800 text-zinc-400"
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-xs uppercase tracking-wider">Records Matching Range</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-zinc-950">
                  {matchingItems.length} {entityName}
                </span>
              </div>

              {matchingItems.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-1">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Preview of items to delete:</div>
                  <div className="max-h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[10.5px]">
                    {matchingItems.slice(0, 6).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-zinc-900/80 px-2 py-1 rounded text-zinc-300 border border-zinc-800">
                        <span className="truncate max-w-[260px]">{getItemLabel(item)}</span>
                        {mode === "date" && getDate(item) && (
                          <span className="text-[9px] text-amber-400 font-bold ml-2 shrink-0">{getDate(item)}</span>
                        )}
                      </div>
                    ))}
                    {matchingItems.length > 6 && (
                      <div className="text-[10px] text-zinc-400 italic text-center pt-1 font-sans">
                        + {matchingItems.length - 6} more records will be deleted
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-zinc-500 font-semibold mt-2">
                  No records match the specified range. Adjust the range to select records.
                </p>
              )}
            </div>

            {/* Reason input for audit trail */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">
                Reason / Note for Audit Log <span className="text-zinc-500 normal-case">(Optional)</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. End-of-term cleanup, duplicate removal..."
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                className="w-full bg-zinc-900 border-zinc-700 text-zinc-100 rounded-xl px-3 py-2 text-xs focus:border-amber-500"
              />
            </div>
          </>
        ) : (
          /* Confirmation Step */
          <div className="space-y-4 py-2 animate-fadeIn">
            <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-extrabold text-xs text-rose-300 uppercase tracking-wide">
                  Confirm Bulk Deletion
                </h4>
                <p className="text-xs text-rose-200/90 leading-relaxed font-semibold">
                  You are about to permanently delete <strong className="text-white underline">{matchingItems.length} {entityName}</strong> in the range{" "}
                  {mode === "date" ? `(${startDate} to ${endDate})` : `(rows ${fromIndex} to ${toIndex})`}.
                </p>
                <p className="text-[10.5px] text-zinc-400 pt-1">
                  This action cannot be undone. An audit log with your user identity and timestamp will be permanently registered.
                </p>
              </div>
            </div>
          </div>
        )}

        {isDeleting && (
          <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
            <p className="text-[11px] font-bold text-rose-200">
              Deleting and logging {matchingItems.length} {entityName} in one database transaction. This can take a moment.
            </p>
            <Progress indeterminate variant="danger" aria-label="Bulk deletion in progress" />
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800">
          <Button
            type="button"
            variant="ghost"
            onClick={confirmStep ? () => setConfirmStep(false) : handleClose}
            disabled={isDeleting}
            className="text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl px-4 py-2 text-xs font-bold cursor-pointer transition-colors"
          >
            {confirmStep ? "← Back to Range" : "Cancel"}
          </Button>

          {!confirmStep ? (
            <Button
              type="button"
              onClick={() => setConfirmStep(true)}
              disabled={matchingItems.length === 0}
              className={`rounded-xl px-4 py-2 text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                matchingItems.length > 0
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/30"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed"
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Review & Delete ({matchingItems.length})
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleExecuteDelete}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl px-5 py-2 text-xs font-black shadow-lg shadow-rose-900/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Deleting & Logging...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Yes, Delete {matchingItems.length} Records
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Clean Black & Gold button to trigger the range delete modal next to any delete action
 */
export interface BulkRangeDeleteButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export const BulkRangeDeleteButton: React.FC<BulkRangeDeleteButtonProps> = ({
  onClick,
  label = "Delete by Range",
  className = ""
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`h-auto text-[10.5px] font-extrabold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-amber-500/30 hover:border-amber-400 bg-zinc-900 hover:bg-zinc-800 text-amber-400 hover:text-amber-300 shadow-xs ${className}`}
    >
      <Trash2 className="h-3.5 w-3.5 text-amber-500" />
      <span>{label}</span>
    </button>
  );
};
