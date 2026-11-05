"use client";

/**
 * Shimmer skeleton for heavy dashboard tabs (monitoring, schedules, students).
 * Shown on first mount while the tab's memos/data settle, replacing the
 * momentary freeze with an obvious loading state.
 */
export function TabSkeleton({ rows = 8, cards = 4 }: { rows?: number; cards?: number }) {
  return (
    <div className="space-y-4 animate-fadeIn" aria-busy="true" aria-label="Loading tab content">
      {/* Header line */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-gray-200 animate-pulse" />
          <div>
            <div className="h-4 w-52 rounded bg-gray-200 animate-pulse" />
            <div className="h-2.5 w-72 rounded bg-gray-100 animate-pulse mt-1.5" />
          </div>
        </div>
        <div className="h-8 w-28 rounded-xl bg-gray-200 animate-pulse" />
      </div>

      {/* Stat cards */}
      {cards > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(cards)].map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <div className="h-6 w-14 rounded bg-gray-200 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              <div className="h-2.5 w-20 rounded bg-gray-100 animate-pulse mt-2" />
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card flex flex-wrap items-center gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 rounded-xl bg-gray-100 animate-pulse" style={{ width: `${90 + i * 30}px`, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>

      {/* Table rows */}
      <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-card">
        <div className="h-10 bg-gray-50 border-b border-gray-200" />
        {[...Array(rows)].map((_, i) => (
          <div key={i} className="h-11 border-b border-gray-100 flex items-center gap-6 px-4">
            <div className="h-3.5 w-8 rounded bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
            <div className="h-3.5 w-24 rounded bg-gray-200/80 animate-pulse" style={{ animationDelay: `${i * 50 + 20}ms` }} />
            <div className="h-3.5 w-40 rounded bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 50 + 40}ms` }} />
            <div className="ml-auto h-3.5 w-12 rounded bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 50 + 60}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
