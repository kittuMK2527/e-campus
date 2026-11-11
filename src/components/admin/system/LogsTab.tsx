"use client";

import React, { useState, useMemo } from "react";
import { History, Search, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/input";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { formatDate, formatRoleLabel } from "@/lib/utils";
import { AuditLog, useApp } from "@/context/AppContext";

export interface LogsTabProps {
  auditLogs?: AuditLog[];
}

export const LogsTab: React.FC<LogsTabProps> = ({ auditLogs: propLogs }) => {
  const app = useApp();
  const auditLogs = propLogs ?? app.auditLogs ?? [];
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return auditLogs;
    const q = searchQuery.toLowerCase();
    return auditLogs.filter(
      (log) =>
        log.actorName?.toLowerCase().includes(q) ||
        log.actorRole?.toLowerCase().includes(q) ||
        log.description?.toLowerCase().includes(q) ||
        log.type?.toLowerCase().includes(q)
    );
  }, [auditLogs, searchQuery]);

  const pagination = usePagination(filteredLogs, {
    pageSize: 15,
    pageSizeOptions: [15, 30, 50, 100]
  });

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={History}
        title="Global System Audit Logs"
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              aria-label="Filter audit logs"
              placeholder="Filter logs by actor, action, role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
        }
      />

      {filteredLogs.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
          <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">No audit logs found matching your query.</p>
        </div>
      ) : (
        <TableSurface
          footer={
            <Pagination
              currentPage={pagination.page}
              totalItems={filteredLogs.length}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={pagination.pageSizeOptions}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4">Actor</TableHead>
              <TableHead className="w-7/12">Action Detail</TableHead>
              <TableHead className="w-1/6 text-right">Timestamp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((log) => {
              const isHandover = log.type.includes("handover");
              const isCsv = log.type.includes("csv");
              return (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="font-bold text-gray-900">{log.actorName}</div>
                    <Badge variant="secondary" className="mt-0.5">
                      {formatRoleLabel(log.actorRole)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-gray-700 leading-snug">{log.description}</div>
                    <div className="mt-1">
                      <Badge variant={isHandover ? "warning" : isCsv ? "success" : "secondary"} className="text-[7.5px]">
                        {log.type.replace("_", " ")}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-gray-400 whitespace-nowrap">
                    {formatDate(log.timestamp)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableSurface>
      )}
    </div>
  );
};
