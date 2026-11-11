"use client";

import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ArrowUpDown, Inbox } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  pageSize?: number;
  emptyMessage?: string;
  className?: string;
  isLoading?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data = [],
  searchKeys,
  searchPlaceholder = "Search records...",
  pageSize: initialPageSize = 15,
  emptyMessage = "No records found",
  className,
  isLoading = false
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Filtering
  const filteredData = useMemo(() => {
    if (!search.trim() || !searchKeys || searchKeys.length === 0) return data;
    const q = search.toLowerCase().trim();
    return data.filter((row) =>
      searchKeys.some((k) => {
        const val = row[k];
        return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, searchKeys]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDirection === "asc" ? valA - valB : valB - valA;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredData, sortKey, sortDirection]);

  // Pagination
  const totalItems = sortedData.length;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  return (
    <div className={cn("w-full space-y-3", className)}>
      {/* Search Header */}
      {searchKeys && searchKeys.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-[#131317] border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-[#4F46E5] transition-colors shadow-xs"
            />
          </div>
          <span className="text-[11px] font-bold text-slate-400 shrink-0">
            {totalItems} record{totalItems === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Table Surface */}
      <div className="rounded-2xl border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#131317] shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 py-3",
                    col.sortable && "cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300",
                    col.className
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 hover:text-slate-500" />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={idx}>
                  {columns.map((col, cIdx) => (
                    <TableCell key={cIdx} className="py-3">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Inbox className="w-8 h-8 stroke-[1.5]" />
                    <span className="text-xs font-bold">{emptyMessage}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, rIdx) => (
                <TableRow key={row.id || rIdx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  {columns.map((col) => (
                    <TableCell key={col.key} className={cn("py-2.5 text-xs font-medium", col.className)}>
                      {col.render ? col.render(row) : (row[col.key] !== undefined ? String(row[col.key]) : "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {totalItems > pageSize && (
        <div className="pt-2">
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}

export default DataTable;
