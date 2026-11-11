"use client";

import React from "react";
import { History, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { formatDate, formatRoleLabel } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";
import { useApp } from "@/context/AppContext";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";

export interface LoginHistoryItem {
  id: string;
  user_id: string;
  login_time: string;
  ip?: string;
  device?: string;
}

export interface SessionsTabProps {
  loginHistory?: LoginHistoryItem[];
  usersList?: Array<{ id: string; email: string; role: string }>;
  isLoading?: boolean;
}

export const SessionsTab: React.FC<SessionsTabProps> = ({
  loginHistory: propLoginHistory,
  usersList: propUsersList,
  isLoading: propIsLoading
}) => {
  const usersQuery = useQuery({
    queryKey: qk.adminUsers("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/users?limit=5000");
      return (data?.users || []) as Array<{ id: string; email: string; role: string }>;
    },
    enabled: !propUsersList
  });
  const usersList = propUsersList ?? usersQuery.data ?? [];

  const sessionsQuery = useQuery({
    queryKey: qk.loginHistory("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/admin/login-history");
      return (data?.loginHistory || []) as LoginHistoryItem[];
    },
    enabled: !propLoginHistory
  });

  const loginHistory = propLoginHistory ?? sessionsQuery.data ?? [];
  const isLoading = propIsLoading ?? sessionsQuery.isLoading;
  const pagination = usePagination(loginHistory, {
    pageSize: 15,
    pageSizeOptions: [15, 30, 50, 100]
  });

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={History}
        title="User Login Sessions"
      />

      {isLoading && loginHistory.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          <p className="text-sm font-semibold">Loading login sessions…</p>
        </div>
      ) : loginHistory.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
          <History className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">No login sessions recorded.</p>
        </div>
      ) : (
        <TableSurface
          footer={
            <Pagination
              currentPage={pagination.page}
              totalItems={loginHistory.length}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={pagination.pageSizeOptions}
              ariaLabel="Login sessions pagination"
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>User ID / Email</TableHead>
              <TableHead>Login Time</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Device / Client</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((hist) => {
              const matchedUser = usersList.find((u: any) => u.id === hist.user_id);
              return (
                <TableRow key={hist.id}>
                  <TableCell>
                    <div className="font-bold text-gray-900 font-mono">
                      {matchedUser ? matchedUser.email : hist.user_id}
                    </div>
                    {matchedUser && (
                      <Badge variant="secondary" className="mt-0.5">
                        {formatRoleLabel(matchedUser.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-indigo-600">{formatDate(hist.login_time)}</TableCell>
                  <TableCell className="font-mono text-gray-500">{hist.ip || "127.0.0.1"}</TableCell>
                  <TableCell className="text-gray-500">{hist.device || "Browser"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableSurface>
      )}
    </div>
  );
};
