"use client";

/**
 * Route-level skeleton shown by Next.js loading.tsx while a role dashboard
 * segment's JS chunk + data arrive. Mirrors the dashboard frame (header pill
 * + sidebar + content cards) so the layout doesn't jump.
 */
export function RouteSkeleton() {
  return (
    <div className="h-dvh flex flex-col bg-warm-canvas animate-pulse" aria-busy="true" aria-label="Loading workspace">
      {/* Header pill */}
      <div className="w-[92%] sm:w-[82%] md:w-[74%] lg:w-[66%] max-w-[1040px] mx-auto mt-2.5 md:mt-4 shrink-0">
        <div className="h-14 rounded-xl border border-slate-200/80 bg-white/70 shadow-sm" />
      </div>
      <div className="flex-1 flex gap-4 px-4 md:px-8 pt-4 min-h-0">
        {/* Sidebar */}
        <div className="hidden md:flex w-[230px] shrink-0 flex-col gap-2 p-3 rounded-2xl bg-white/60 border border-slate-100">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-8 rounded-xl bg-slate-200/70" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        {/* Content cards */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="h-20 rounded-2xl bg-white/70 border border-slate-200/60" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/70 border border-slate-200/60" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-white/70 border border-slate-200/60" />
        </div>
      </div>
    </div>
  );
}
