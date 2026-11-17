"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import {
  CalendarCheck2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Building2,
  Filter,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  User,
  Users,
  AlertCircle,
  FileText
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/context/ToastContext";

interface KAMHandoversLedgerViewProps {
  collegeId?: string;
  scopedColleges?: Array<{ id: string; name: string }>;
  onCollegeChange?: (collegeId: string) => void;
}

export const KAMHandoversLedgerView: React.FC<KAMHandoversLedgerViewProps> = ({
  collegeId = "all",
  scopedColleges = [],
  onCollegeChange
}) => {
  const { requests, mentors, colleges: rawColleges } = useApp();
  const { toast } = useToast();

  const effectiveColleges = useMemo(() => {
    if (scopedColleges.length > 0) return scopedColleges;
    return rawColleges;
  }, [scopedColleges, rawColleges]);

  const [selectedCollegeId, setSelectedCollegeId] = useState<string>(collegeId);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  React.useEffect(() => {
    setSelectedCollegeId(collegeId);
  }, [collegeId]);

  // Enrich requests with faculty and campus mappings
  const enrichedRequests = useMemo(() => {
    const collegeMap = new Map(rawColleges.map(c => [c.id, c.name]));
    const mentorMap = new Map(mentors.map(m => [m.id, m]));

    return (requests || []).map((r: any) => {
      const requestor = mentorMap.get(r.requestorId || r.requestor_id);
      const targetStaff = mentorMap.get(r.targetStaffId || r.target_staff_id);
      const reqCollegeId = r.college_id || r.collegeId || requestor?.college_id || targetStaff?.college_id || "";
      const collegeName = collegeMap.get(reqCollegeId) || "Supervised Campus";
      const requestorName = r.requestorName || requestor?.name || "Faculty Member";
      const targetStaffName = r.targetStaffName || targetStaff?.name || "Substitute Assigned";
      const statusRaw = (r.status || "pending").toLowerCase();
      
      let normalizedStatus: "approved" | "pending" | "rejected" = "pending";
      if (statusRaw.includes("approv") || statusRaw === "accepted") {
        normalizedStatus = "approved";
      } else if (statusRaw.includes("reject") || statusRaw.includes("declin")) {
        normalizedStatus = "rejected";
      } else {
        normalizedStatus = "pending";
      }

      return {
        id: r.id || `${r.date}_${r.course}_${r.classGroup}`,
        date: r.date || "Scheduled Date",
        collegeId: reqCollegeId,
        collegeName,
        requestorName,
        requestorDept: requestor?.department || "Faculty",
        targetStaffName,
        subject: r.course || r.subject || "Academic Subject",
        classGroup: r.classGroup || r.class_group || "Cohort",
        period: r.period || r.timeSlot || "Period Slot",
        reason: r.reason || "Operational classroom adjustment",
        category: r.reasonCategory || (r.reason?.toLowerCase().includes("leave") ? "Emergency Leave" : "Class Substitution"),
        status: normalizedStatus,
        rawStatus: r.status,
        remarks: r.notes || r.decisionNotes || r.remarks || null,
        createdDate: r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "Recent"
      };
    });
  }, [requests, mentors, rawColleges]);

  // Filter to KAM Supervised Colleges
  const scopedRequests = useMemo(() => {
    const allowedIds = new Set(effectiveColleges.map(c => c.id));
    return enrichedRequests.filter(r => !r.collegeId || allowedIds.has(r.collegeId));
  }, [enrichedRequests, effectiveColleges]);

  // Filter by Campus, Status, Category, and Search
  const filteredRequests = useMemo(() => {
    return scopedRequests.filter(r => {
      if (selectedCollegeId !== "all" && r.collegeId !== selectedCollegeId) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          r.requestorName.toLowerCase().includes(q) ||
          r.targetStaffName.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q) ||
          r.collegeName.toLowerCase().includes(q) ||
          r.classGroup.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [scopedRequests, selectedCollegeId, statusFilter, categoryFilter, search]);

  // Executive KPI summary metrics
  const kpis = useMemo(() => {
    const total = scopedRequests.length;
    const approved = scopedRequests.filter(r => r.status === "approved").length;
    const pending = scopedRequests.filter(r => r.status === "pending").length;
    const rejected = scopedRequests.filter(r => r.status === "rejected").length;
    const resolvedCount = approved + rejected;
    const resolutionRate = resolvedCount > 0 ? Math.round((approved / resolvedCount) * 100) : 100;

    return {
      total,
      approved,
      pending,
      rejected,
      resolutionRate
    };
  }, [scopedRequests]);

  // Paginated records
  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, currentPage, pageSize]);

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = filteredRequests.map(r => ({
        "Target Date": r.date,
        "Period Slot": r.period,
        "Campus Name": r.collegeName,
        "Requesting Faculty": r.requestorName,
        "Assigned Substitute": r.targetStaffName,
        "Subject": r.subject,
        "Class Group": r.classGroup,
        "Category": r.category,
        "Resolution Status": r.status.toUpperCase(),
        "Reason": r.reason,
        "Decision Remarks": r.remarks || "No remarks logged"
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "KAM_Handovers_Audit");
      XLSX.writeFile(wb, `KAM_Faculty_Handovers_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast("Faculty handovers audit ledger exported successfully.", "success");
    } catch {
      toast("Failed to export ledger. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-6 font-sans animate-fadeIn">
      {/* ── INTERNAL HEADER & EXECUTIVE FILTER BAR ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-zinc-950 flex items-center justify-center font-black shadow-xs">
              <CalendarCheck2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-zinc-900 dark:text-white">
                  Faculty Substitution &amp; Handover Audit Ledger
                </h2>
                <Badge variant="outline" className="text-[10px] uppercase font-bold text-amber-500 border-amber-500/40">
                  Data-Alone Audit
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold mt-0.5">
                Executive review of classroom substitutions, emergency coverage, and Campus Manager approval logs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="h-9 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-xs font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
              <span>Export Ledger (Excel)</span>
            </button>
          </div>
        </div>

        {/* ── 4 KPI SUMMARY CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Total Handovers</span>
            <div className="text-lg font-black text-zinc-900 dark:text-white">
              {kpis.total} Requests
            </div>
            <span className="text-[10px] text-zinc-500 font-semibold">Supervised Portfolios</span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Approval Rate</span>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {kpis.resolutionRate}%
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> {kpis.approved} Approved Substitutions
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">CM Queue (Pending)</span>
            <div className="text-lg font-black text-amber-500">
              {kpis.pending} In-Review
            </div>
            <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Awaiting CM Action
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 space-y-0.5">
            <span className="text-[10px] font-black uppercase text-zinc-400">Declined / Closed</span>
            <div className="text-lg font-black text-rose-500">
              {kpis.rejected} Requests
            </div>
            <span className="text-[10px] text-rose-500 font-semibold flex items-center gap-1">
              <XCircle className="h-2.5 w-2.5" /> Unfulfilled or Cancelled
            </span>
          </div>
        </div>

        {/* ── FILTER CONTROLS BAR ── */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Campus / Institution</label>
            <select
              value={selectedCollegeId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCollegeId(val);
                onCollegeChange?.(val);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Supervised Campuses ({effectiveColleges.length})</option>
              {effectiveColleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Resolution Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending CM</option>
              <option value="rejected">Declined</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Categories</option>
              <option value="Substitution">Substitution</option>
              <option value="Late Attendance">Late Attendance</option>
              <option value="Late Punch">Late Punch</option>
              <option value="Exam Mark Edit">Exam Mark Edit</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Search Faculty or Class</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Faculty, substitute, cohort..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-3 py-2 text-xs font-bold border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── HIGH-DENSITY AUDIT DATA TABLE ALONE ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800">
              <TableRow>
                <TableHead className="w-10 p-3 text-center text-[10px] font-black uppercase text-zinc-400">
                  Notes
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Scheduled Date &amp; Slot
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Campus / Institution
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Requesting Faculty
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Assigned Substitute
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Subject &amp; Cohort
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Category
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider text-zinc-500 text-right pr-6">
                  Resolution Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
              {paginatedRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-zinc-400">
                    <CalendarCheck2 className="h-8 w-8 mx-auto mb-2 opacity-40 text-amber-500" />
                    <p className="font-bold text-sm">No handover records matching filter criteria.</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Faculty substitution requests appear here once submitted.</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRequests.map((r) => {
                  const isExpanded = expandedRequestId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <TableRow
                        onClick={() => setExpandedRequestId(isExpanded ? null : r.id)}
                        className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 cursor-pointer transition-colors"
                      >
                        <TableCell className="p-3 text-center">
                          <button
                            type="button"
                            className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-amber-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </TableCell>

                        {/* Date & Slot */}
                        <TableCell className="p-3 font-semibold text-zinc-800 dark:text-zinc-200">
                          <div>{r.date}</div>
                          <div className="text-[10px] font-mono text-zinc-400 mt-0.5">{r.period}</div>
                        </TableCell>

                        {/* Campus */}
                        <TableCell className="p-3 font-semibold text-zinc-700 dark:text-zinc-300">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                            <span className="line-clamp-1">{r.collegeName}</span>
                          </div>
                        </TableCell>

                        {/* Requestor */}
                        <TableCell className="p-3">
                          <div className="font-extrabold text-zinc-900 dark:text-white">{r.requestorName}</div>
                          <div className="text-[10px] text-zinc-400">{r.requestorDept}</div>
                        </TableCell>

                        {/* Substitute */}
                        <TableCell className="p-3">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{r.targetStaffName}</span>
                          </div>
                        </TableCell>

                        {/* Subject */}
                        <TableCell className="p-3">
                          <div className="font-bold text-zinc-900 dark:text-white line-clamp-1">{r.subject}</div>
                          <div className="text-[10px] text-zinc-400">{r.classGroup}</div>
                        </TableCell>

                        {/* Category */}
                        <TableCell className="p-3">
                          <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                            {r.category}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="p-3 text-right pr-6">
                          <Badge
                            variant={
                              r.status === "approved"
                                ? "success"
                                : r.status === "pending"
                                ? "warning"
                                : "destructive"
                            }
                            className="text-[10px] uppercase font-bold"
                          >
                            {r.status === "pending" ? "Pending CM" : r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>

                      {/* Inline Expansion Drawer */}
                      {isExpanded && (
                        <TableRow className="bg-zinc-50/60 dark:bg-zinc-800/30 border-y border-zinc-100 dark:border-zinc-800">
                          <TableCell colSpan={8} className="p-4.5 pl-12">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                                  Faculty Stated Reason
                                </span>
                                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                                  {r.reason}
                                </p>
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">
                                  Campus Manager Decision &amp; Audit Trail
                                </span>
                                <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
                                  {r.remarks || "No specific CM decision remarks were recorded."}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filteredRequests.length > pageSize && (
          <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center flex-wrap gap-3">
            <span className="text-xs text-zinc-500 font-semibold">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRequests.length)} of {filteredRequests.length} requests
            </span>
            <Pagination
              currentPage={currentPage}
              totalItems={filteredRequests.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>
    </div>
  );
};
