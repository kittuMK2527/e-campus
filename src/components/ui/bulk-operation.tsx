"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { Dialog, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Progress } from "./progress";

interface Operation {
  title: string;
  campus: string;
  detail: string;
  danger?: boolean;
  total?: number;
  processed?: number;
  phase: "working" | "complete" | "warning";
}

export function useBulkOperation() {
  const locked = useRef(false);
  const [state, setState] = useState<Operation | null>(null);
  return {
    state,
    begin(input: Omit<Operation, "phase">) {
      if (locked.current) return false;
      locked.current = true;
      setState({ ...input, phase: "working" });
      return true;
    },
    update(change: Partial<Pick<Operation, "detail" | "processed" | "total">>) {
      setState(prev => prev && ({ ...prev, ...change }));
    },
    finish(detail: string, warning = false) {
      setState(prev => prev && ({ ...prev, detail, phase: warning ? "warning" : "complete" }));
    },
    close() {
      if (state && state.phase !== "working") {
        locked.current = false;
        setState(null);
      }
    },
  };
}

export function BulkOperationDialog({ operation }: { operation: ReturnType<typeof useBulkOperation> }) {
  const s = operation.state;
  if (!s) return null;
  const busy = s.phase === "working";
  const Icon = s.phase === "warning" ? TriangleAlert : !busy ? CheckCircle2 : s.danger ? Trash2 : FileSpreadsheet;
  const tone = s.phase === "warning" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
    !busy ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" :
    s.danger ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" :
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300";
  return (
    <Dialog open onOpenChange={open => { if (!open) operation.close(); }} ariaLabel={s.title} panelClassName="max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${tone}`}><Icon className="size-5" aria-hidden /></div>
          <div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{s.campus}</p><DialogTitle>{s.title}</DialogTitle></div>
        </div>
      </DialogHeader>
      <div role="status" aria-live="polite" aria-atomic="true" className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-bold">
          {busy && <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />}
          {busy ? "In progress" : s.phase === "warning" ? "Needs attention" : "Complete"}
        </p>
        <p className="break-words text-sm text-slate-600 dark:text-slate-300">{s.detail}</p>
      </div>
      {s.total !== undefined && s.total > 0 && s.processed !== undefined && (
        <Progress value={s.processed} max={s.total} showLabel variant={s.phase === "warning" ? "warning" : busy ? "default" : "success"} />
      )}
      {!busy && <div className="flex justify-end"><Button size="sm" onClick={operation.close}>Done</Button></div>}
    </Dialog>
  );
}
