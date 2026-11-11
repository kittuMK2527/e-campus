"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { useApp } from "@/context/AppContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Clock,
  Search,
  Building2,
  FileSpreadsheet,
  Receipt,
  RotateCw,
  Wallet,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";

interface StudentFee {
  id: string;
  student_id: string;
  college_id: string;
  term_name: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: "paid" | "partial" | "unpaid";
  created_at: string;
}

interface FeePayment {
  id: string;
  fee_id: string;
  student_id: string;
  college_id: string;
  amount: number;
  payment_method: string;
  reference_no: string;
  receipt_no: string;
  payment_date: string;
}

interface StudentRecord {
  id: string;
  name: string;
  email: string;
  classGroup: string;
  department: string;
  college_id: string;
  register_number?: string;
  roll_number?: string;
}

const fmt = (n: number) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export const FeesOversightTab: React.FC = () => {
  const { colleges } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<"ledger" | "transactions">("ledger");
  const [campusFilter, setCampusFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const feesQuery = useQuery({
    queryKey: qk.fees("admin", campusFilter, statusFilter, searchQuery),
    queryFn: async () => {
      const res = await apiFetch<any>("/api/fees");
      if (!res?.success) throw new Error(res?.message || "Failed to load fee records");
      return res;
    },
    staleTime: 60_000
  });

  const students: StudentRecord[] = feesQuery.data?.students || [];
  const fees: StudentFee[] = feesQuery.data?.fees || [];
  const payments: FeePayment[] = feesQuery.data?.payments || [];
  const stats = feesQuery.data?.stats || {
    totalFees: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    paidCount: 0,
    partialCount: 0,
    unpaidCount: 0,
    totalStudents: 0
  };

  const collegeMap = useMemo(() => {
    const map = new Map<string, string>();
    colleges.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [colleges]);

  const studentMap = useMemo(() => {
    const map = new Map<string, StudentRecord>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  // Filtered Student Fees
  const filteredFees = useMemo(() => {
    return fees.filter((fee) => {
      if (campusFilter !== "all" && fee.college_id !== campusFilter) return false;
      if (statusFilter !== "all" && fee.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const student = studentMap.get(fee.student_id);
        const name = (student?.name || "").toLowerCase();
        const roll = (student?.register_number || student?.roll_number || "").toLowerCase();
        const term = (fee.term_name || "").toLowerCase();
        if (!name.includes(q) && !roll.includes(q) && !term.includes(q)) return false;
      }

      return true;
    });
  }, [fees, campusFilter, statusFilter, searchQuery, studentMap]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((pmt) => {
      if (campusFilter !== "all" && pmt.college_id !== campusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const student = studentMap.get(pmt.student_id);
        const name = (student?.name || "").toLowerCase();
        const rcp = (pmt.receipt_no || "").toLowerCase();
        const ref = (pmt.reference_no || "").toLowerCase();
        if (!name.includes(q) && !rcp.includes(q) && !ref.includes(q)) return false;
      }

      return true;
    });
  }, [payments, campusFilter, searchQuery, studentMap]);

  const feePagination = usePagination(filteredFees, {
    pageSize: 15,
    resetKeys: [campusFilter, statusFilter, searchQuery]
  });

  const paymentPagination = usePagination(filteredPayments, {
    pageSize: 15,
    resetKeys: [campusFilter, searchQuery]
  });

  const collectionRate = stats.totalFees > 0
    ? Math.round((stats.totalPaid / stats.totalFees) * 100)
    : 0;

  const handleExport = async () => {
    try {
      const XLSX = await import("xlsx");
      if (activeSubTab === "ledger") {
        const rows = filteredFees.map((f, i) => {
          const s = studentMap.get(f.student_id);
          return {
            "Sl. No": i + 1,
            "Student Name": s?.name || "Unknown",
            "Roll Number": s?.register_number || s?.roll_number || "—",
            "Campus": collegeMap.get(f.college_id) || f.college_id,
            "Term / Component": f.term_name,
            "Amount": f.amount,
            "Paid Amount": f.paid_amount,
            "Outstanding": Math.max(0, f.amount - f.paid_amount),
            "Status": f.status.toUpperCase(),
            "Due Date": f.due_date || "—"
          };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Fee Ledger");
        XLSX.writeFile(wb, `Fee_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
      } else {
        const rows = filteredPayments.map((p, i) => {
          const s = studentMap.get(p.student_id);
          return {
            "Sl. No": i + 1,
            "Receipt No": p.receipt_no,
            "Student Name": s?.name || "Unknown",
            "Campus": collegeMap.get(p.college_id) || p.college_id,
            "Amount Paid": p.amount,
            "Method": p.payment_method,
            "Reference No": p.reference_no,
            "Date": p.payment_date
          };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, `Fee_Transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
      }
    } catch (e) {
      console.error("Export failed:", e);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={DollarSign}
        title="Fee Collections Oversight"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => feesQuery.refetch()}
              disabled={feesQuery.isFetching}
              className="text-xs font-bold"
            >
              <RotateCw className={`h-3.5 w-3.5 mr-1 ${feesQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 font-extrabold"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 mr-1" />
              Export
            </Button>
          </div>
        }
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-card">
          <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="text-xs">Total Invoiced</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">{fmt(stats.totalFees)}</div>
          <div className="text-xs text-slate-400 mt-1 font-medium">{fees.length} student fee records</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-card">
          <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
            <span className="text-xs">Total Collected</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2">{fmt(stats.totalPaid)}</div>
          <div className="text-xs text-emerald-600/80 font-bold mt-1">
            {collectionRate}% collection rate
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-card">
          <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <span className="text-xs">Outstanding Balance</span>
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2">{fmt(stats.totalOutstanding)}</div>
          <div className="text-xs text-rose-500 font-bold mt-1">
            {stats.unpaidCount + stats.partialCount} pending settlements
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-card">
          <div className="flex items-center gap-2 text-slate-500 font-semibold mb-1">
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Receipt className="h-4 w-4" />
            </div>
            <span className="text-xs">Payment Receipts</span>
          </div>
          <div className="text-2xl font-black text-purple-600 mt-2">{payments.length}</div>
          <div className="text-xs text-slate-400 mt-1 font-medium">Processed transactions</div>
        </div>
      </div>

      {/* Filter and Tab Switching Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeSubTab === "ledger" ? "default" : "secondary"}
            size="sm"
            onClick={() => setActiveSubTab("ledger")}
            className="text-xs font-bold"
          >
            Student Ledger ({fees.length})
          </Button>
          <Button
            type="button"
            variant={activeSubTab === "transactions" ? "default" : "secondary"}
            size="sm"
            onClick={() => setActiveSubTab("transactions")}
            className="text-xs font-bold"
          >
            Receipts & Transactions ({payments.length})
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search student or receipt…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs font-semibold"
            />
          </div>

          <Select
            aria-label="Campus filter"
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value)}
            className="w-auto h-8 text-xs font-semibold"
          >
            <option value="all">🏢 All Campuses</option>
            {colleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          {activeSubTab === "ledger" && (
            <Select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto h-8 text-xs font-semibold"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </Select>
          )}
        </div>
      </div>

      {/* Main Content Surfaces */}
      {activeSubTab === "ledger" ? (
        feesQuery.isPending ? (
          <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-100 shadow-card">
            <RotateCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
            Loading student fee ledger…
          </div>
        ) : filteredFees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-100 shadow-card">
            <DollarSign className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No fee records found</p>
            <p className="text-xs text-slate-400">Try selecting a different campus or clearing search filters.</p>
          </div>
        ) : (
          <TableSurface
            footer={
              <div className="p-3 border-t border-slate-100 flex items-center justify-between">
                <Pagination
                  currentPage={feePagination.page}
                  totalItems={filteredFees.length}
                  pageSize={feePagination.pageSize}
                  onPageChange={feePagination.setPage}
                  onPageSizeChange={feePagination.setPageSize}
                />
              </div>
            }
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Component / Term</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-10 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feePagination.pageItems.map((fee, idx) => {
                  const s = studentMap.get(fee.student_id);
                  const campusName = collegeMap.get(fee.college_id) || fee.college_id;
                  const outstanding = Math.max(0, fee.amount - fee.paid_amount);

                  return (
                    <TableRow key={fee.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-center font-bold text-slate-400">
                        {feePagination.startIndex + idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-800">{s?.name || "Student"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {s?.register_number || s?.roll_number || fee.student_id}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-700">{campusName}</TableCell>
                      <TableCell className="font-semibold text-slate-800">{fee.term_name}</TableCell>
                      <TableCell className="text-right font-bold text-slate-800">{fmt(fee.amount)}</TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">{fmt(fee.paid_amount)}</TableCell>
                      <TableCell className="text-right font-bold text-rose-600">{fmt(outstanding)}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            fee.status === "paid"
                              ? "default"
                              : fee.status === "partial"
                              ? "outline"
                              : "destructive"
                          }
                          className={
                            fee.status === "paid"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : fee.status === "partial"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }
                        >
                          {fee.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                        {fee.due_date ? new Date(fee.due_date).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <ActionDropdownButton size="sm" title="Fee Options" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuLabel>Fee Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => handleCopy(`fee_id_${fee.id}`, fee.id)}
                            >
                              {copiedKey === `fee_id_${fee.id}` ? (
                                <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              )}
                              Copy Fee ID
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleCopy(`std_id_${fee.student_id}`, fee.student_id)}
                            >
                              {copiedKey === `std_id_${fee.student_id}` ? (
                                <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              )}
                              Copy Student ID
                            </DropdownMenuItem>
                            {(s?.register_number || s?.roll_number) && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleCopy(
                                    `roll_${fee.id}`,
                                    (s.register_number || s.roll_number)!
                                  )
                                }
                              >
                                {copiedKey === `roll_${fee.id}` ? (
                                  <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                                )}
                                Copy Roll No
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setCampusFilter(fee.college_id)}
                            >
                              <Building2 className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                              Filter this Campus
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableSurface>
        )
      ) : payments.length === 0 && !feesQuery.isPending ? (
        <div className="p-12 text-center text-slate-400 font-semibold bg-white rounded-2xl border border-slate-100 shadow-card">
          <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-bold text-slate-700">No payment transactions found</p>
          <p className="text-xs text-slate-400">No recorded payments match the filter criteria.</p>
        </div>
      ) : (
        <TableSurface
          footer={
            <div className="p-3 border-t border-slate-100 flex items-center justify-between">
              <Pagination
                currentPage={paymentPagination.page}
                totalItems={filteredPayments.length}
                pageSize={paymentPagination.pageSize}
                onPageChange={paymentPagination.setPage}
                onPageSizeChange={paymentPagination.setPageSize}
              />
            </div>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Receipt No</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead className="text-right">Amount Paid</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Reference No</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead className="w-10 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentPagination.pageItems.map((pmt, idx) => {
                const s = studentMap.get(pmt.student_id);
                const campusName = collegeMap.get(pmt.college_id) || pmt.college_id;

                return (
                  <TableRow key={pmt.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="text-center font-bold text-slate-400">
                      {paymentPagination.startIndex + idx + 1}
                    </TableCell>
                    <TableCell className="font-mono font-bold text-indigo-600">
                      {pmt.receipt_no}
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800">{s?.name || "Student"}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {s?.register_number || s?.roll_number || pmt.student_id}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-slate-700">{campusName}</TableCell>
                    <TableCell className="text-right font-black text-emerald-600">
                      {fmt(pmt.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50">
                        {pmt.payment_method || "UPI/NetBanking"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-slate-500 text-[11px]">
                      {pmt.reference_no || "—"}
                    </TableCell>
                    <TableCell className="text-slate-500 text-[11px] whitespace-nowrap">
                      {pmt.payment_date ? new Date(pmt.payment_date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <ActionDropdownButton size="sm" title="Receipt Options" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 text-xs">
                          <DropdownMenuLabel>Receipt Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => handleCopy(`rcp_${pmt.id}`, pmt.receipt_no)}
                          >
                            {copiedKey === `rcp_${pmt.id}` ? (
                              <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                            )}
                            Copy Receipt No
                          </DropdownMenuItem>
                          {pmt.reference_no && (
                            <DropdownMenuItem
                              onClick={() => handleCopy(`ref_${pmt.id}`, pmt.reference_no)}
                            >
                              {copiedKey === `ref_${pmt.id}` ? (
                                <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                              )}
                              Copy Ref No
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => handleCopy(`amt_${pmt.id}`, String(pmt.amount))}
                          >
                            {copiedKey === `amt_${pmt.id}` ? (
                              <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 mr-2 text-slate-500" />
                            )}
                            Copy Amount
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setCampusFilter(pmt.college_id)}
                          >
                            <Building2 className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                            Filter this Campus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableSurface>
      )}
    </div>
  );
};
