import React, { useId } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { DEFAULT_PAGE_SIZE_OPTIONS, getPageNumbers, getPaginationRange, withActivePageSize } from "@/lib/pagination";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  ariaLabel?: string;
}

const navButtonClass =
  "inline-flex h-9 w-9 sm:h-8 sm:w-8 min-h-[36px] min-w-[36px] sm:min-h-[32px] sm:min-w-[32px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:pointer-events-none disabled:opacity-35 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer shadow-2xs";

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className = "",
  ariaLabel = "Pagination",
}) => {
  const pageSizeId = useId();
  const { safePage, totalPages, startItem, endItem } = getPaginationRange(totalItems, currentPage, pageSize);
  const sizes = withActivePageSize(pageSizeOptions, pageSize);

  if (totalItems === 0) return null;

  const goTo = (page: number) => {
    const next = Math.min(Math.max(1, page), totalPages);
    if (next !== safePage) onPageChange(next);
  };

  const rangeLabel = (
    <>
      <span className="hidden sm:inline">
        Showing <strong className="font-extrabold text-slate-800 dark:text-white">{startItem}</strong> to{" "}
        <strong className="font-extrabold text-slate-800 dark:text-white">{endItem}</strong> of{" "}
        <strong className="font-extrabold text-slate-800 dark:text-white">{totalItems.toLocaleString()}</strong> entries
      </span>
      <span className="sm:hidden">
        <strong className="font-extrabold text-slate-800 dark:text-white">{startItem}–{endItem}</strong> of{" "}
        <strong className="font-extrabold text-slate-800 dark:text-white">{totalItems.toLocaleString()}</strong>
      </span>
    </>
  );

  const pageSizeControl = onPageSizeChange ? (
    <div className="flex items-center gap-1.5 border-slate-200 pl-2 sm:border-l dark:border-slate-800">
      <label htmlFor={pageSizeId} className="text-[11px] text-slate-400">
        Rows:
      </label>
      <select
        id={pageSizeId}
        value={pageSize}
        onChange={(e) => {
          onPageSizeChange(Number(e.target.value));
          onPageChange(1);
        }}
        className="cursor-pointer rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] bg-sunken px-2.5 py-1.5 h-9 sm:h-8 text-xs font-bold text-slate-700 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        {sizes.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  ) : null;

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 select-none sm:flex-row dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-500 sm:w-auto sm:justify-start dark:text-slate-400">
        {rangeLabel}
        {pageSizeControl}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goTo(1)}
            disabled={safePage <= 1}
            className={navButtonClass}
            aria-label="First page"
            title="First page"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(safePage - 1)}
            disabled={safePage <= 1}
            className={navButtonClass}
            aria-label="Previous page"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <span className="px-2 text-xs font-bold text-slate-500 sm:hidden dark:text-slate-400">
            Page {safePage} of {totalPages}
          </span>

          <div className="hidden items-center gap-1 px-1 sm:flex">
            {getPageNumbers(safePage, totalPages).map((p, idx) =>
              p === "..." ? (
                <span
                  key={`ell-${idx}`}
                  aria-hidden="true"
                  className="px-2 text-xs font-bold text-slate-400"
                >
                  …
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => goTo(p)}
                  aria-label={`Page ${p}`}
                  aria-current={safePage === p ? "page" : undefined}
                  className={`h-9 min-w-[36px] sm:h-8 sm:min-w-[32px] rounded-xl px-2 text-xs font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 cursor-pointer ${
                    safePage === p
                      ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs border border-slate-900 dark:border-amber-500"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>

          <button
            type="button"
            onClick={() => goTo(safePage + 1)}
            disabled={safePage >= totalPages}
            className={navButtonClass}
            aria-label="Next page"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => goTo(totalPages)}
            disabled={safePage >= totalPages}
            className={navButtonClass}
            aria-label="Last page"
            title="Last page"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        Page {safePage} of {totalPages}
      </span>
    </nav>
  );
};
