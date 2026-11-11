"use client";

import React, { useEffect } from "react";

/**
 * Route-level error boundary (ROLE_UI_AUDIT C2) — a render exception in any
 * dashboard no longer white-screens the app; the user gets a recovery UI.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this feeds the server logs via the Next.js console capture.
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white border border-slate-100 rounded-2xl shadow-card p-8 text-center">
        <div className="h-12 w-12 mx-auto rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-lg font-extrabold text-slate-900 mb-1">Something went wrong</h1>
        <p className="text-xs text-slate-500 font-medium mb-1">
          The page hit an unexpected error while rendering.
        </p>
        {error?.digest && (
          <p className="text-[10px] font-mono text-slate-400 mb-4">Ref: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Try again
          </button>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
