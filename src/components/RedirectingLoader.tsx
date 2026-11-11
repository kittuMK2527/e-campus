"use client";

import { Loader2 } from "lucide-react";

/**
 * Branded redirect loader — shown on role index pages (/admin, /cm, /mentor,
 * /student, /fee-manager) for the brief moment before router.replace() fires.
 * Replaces the old `return null` which caused a blank white flash.
 */
export function RedirectingLoader({ label = "Loading workspace…" }: { label?: string }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-warm-canvas">
      <div className="flex flex-col items-center gap-3">
        <img src="/E-Campus.png" alt="FACE Prep E-Campus" className="h-9 w-auto object-contain" />
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-indigo-600 animate-spin shrink-0" />
          <span className="text-xs font-bold text-slate-500">{label}</span>
        </div>
      </div>
    </div>
  );
}
