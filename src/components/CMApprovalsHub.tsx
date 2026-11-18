import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { Clock, CheckCircle2, XCircle, Search, CalendarRange, MapPin, Inbox, ShieldCheck, FileText, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { isInCmQueue, cmRequestCategory } from "@/lib/requestStatus";
import { cn } from "@/lib/utils";

interface CMApprovalsHubProps {
  collegeId?: string;
  onCollegeChange?: (collegeId: string) => void;
}

export function CMApprovalsHub({ collegeId, onCollegeChange }: CMApprovalsHubProps = {}) {
  const { requests, mentors, colleges, currentCAM, approvedHandovers, handleRequest, currentRole, currentUser } = useApp();
  const { toast } = useToast();
  
  const isCmUser = 
    currentRole === "cm" || 
    (currentUser?.role as string) === "cm" || 
    (currentUser?.role as string) === "campus_manager" ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/cm"));

  // Internal campus selection: For CM, lock strictly to their assigned college
  const [selectedCampus, setSelectedCampus] = useState<string>(() => collegeId || (isCmUser ? (currentCAM?.college_id || "") : "all"));

  useEffect(() => {
    if (collegeId !== undefined) {
      setSelectedCampus(collegeId);
    } else if (isCmUser && currentCAM?.college_id) {
      setSelectedCampus(currentCAM.college_id);
    }
  }, [collegeId, isCmUser, currentCAM?.college_id]);

  // Active college
  const activeCollegeId = isCmUser 
    ? (currentCAM?.college_id || collegeId || (selectedCampus !== "all" ? selectedCampus : undefined))
    : (collegeId || (selectedCampus === "all" ? undefined : selectedCampus));

  const validCollegeIds = useMemo(() => {
    if (!activeCollegeId || activeCollegeId === "all") return new Set<string>();
    const target = activeCollegeId.toLowerCase();
    const matched = colleges.find(c => c.id?.toLowerCase() === target || c.name?.toLowerCase() === target);
    const ids = new Set<string>([target]);
    if (matched) {
      if (matched.id) ids.add(matched.id.toLowerCase());
      if (matched.name) ids.add(matched.name.toLowerCase());
    }
    return ids;
  }, [activeCollegeId, colleges]);

  const activeCollege = useMemo(() => {
    if (!activeCollegeId || activeCollegeId === "all") return undefined;
    const target = activeCollegeId.toLowerCase();
    return colleges.find(c => c.id?.toLowerCase() === target || c.name?.toLowerCase() === target);
  }, [activeCollegeId, colleges]);

  // Filter state
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "Late Attendance" | "Late Punch" | "Substitution" | "Exam Mark Edit">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Split pane state
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Approval flow state
  const [reviewReason, setReviewReason] = useState("");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  
  // Substitution specific state
  const [handoverSubject, setHandoverSubject] = useState<"original" | "substitute_own" | "custom">("original");
  const [selectedSubjName, setSelectedSubjName] = useState("");
  const [customSubjName, setCustomSubjName] = useState("");
  const [selectedCoverMentorId, setSelectedCoverMentorId] = useState<string | null>(null);

  // Filter requests for this CM's campus
  const campusRequests = useMemo(() => {
    if (!activeCollegeId || activeCollegeId === "all") {
      if (isCmUser) return []; // Never leak all requests if CM college is still loading
      return requests || [];
    }
    return (requests || []).filter((req: any) => {
      // 1. Direct college field on request
      const reqCollege = (req.college_id || req.collegeId || "").toLowerCase();
      if (reqCollege && validCollegeIds.has(reqCollege)) return true;

      // 2. Requestor mentor's college_id
      const requestor = mentors.find((m: any) => m.id === req.requestorId);
      const reqMentorCollege = (requestor?.college_id || "").toLowerCase();
      if (reqMentorCollege && validCollegeIds.has(reqMentorCollege)) return true;

      // 3. Target staff's college_id
      const targetStaff = mentors.find((m: any) => m.id === req.targetStaffId);
      const targetStaffCollege = (targetStaff?.college_id || "").toLowerCase();
      if (targetStaffCollege && validCollegeIds.has(targetStaffCollege)) return true;

      return false;
    });
  }, [requests, mentors, validCollegeIds, activeCollegeId, isCmUser]);

  const pendingRequests = useMemo(() => {
    return campusRequests.filter((r: any) => isInCmQueue(r.status))
      // reasonCategory exists only on CAMDashboard's derivation, so chips filter to nothing without it.
      .map((r: any) => ({ ...r, reasonCategory: r.reasonCategory || cmRequestCategory(r) }))
      .filter((r: any) => categoryFilter === "all" || r.reasonCategory === categoryFilter)
      .filter((r: any) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (r.requestorName?.toLowerCase().includes(q) || r.course?.toLowerCase().includes(q) || r.reason?.toLowerCase().includes(q));
      })
      .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [campusRequests, categoryFilter, searchQuery]);

  const campusApproved = useMemo(() => {
    if (!activeCollegeId || activeCollegeId === "all") {
      if (isCmUser) return [];
      return (approvedHandovers || []).slice().sort((a: any, b: any) => new Date(b.approvedAt || 0).getTime() - new Date(a.approvedAt || 0).getTime()).reverse();
    }
    return (approvedHandovers || []).filter((h: any) => {
      const hCollege = (h.college_id || h.collegeId || "").toLowerCase();
      if (hCollege && validCollegeIds.has(hCollege)) return true;

      const originalMentor = mentors.find((m: any) => m.id === h.originalMentorId);
      const origCollege = (originalMentor?.college_id || "").toLowerCase();
      if (origCollege && validCollegeIds.has(origCollege)) return true;

      const coverStaff = mentors.find((m: any) => m.id === h.coverStaffId);
      const coverCollege = (coverStaff?.college_id || "").toLowerCase();
      if (coverCollege && validCollegeIds.has(coverCollege)) return true;

      return false;
    }).sort((a: any, b: any) => new Date(b.approvedAt || 0).getTime() - new Date(a.approvedAt || 0).getTime()).reverse();
  }, [approvedHandovers, mentors, validCollegeIds, activeCollegeId, isCmUser]);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(15);

  const paginatedApproved = useMemo(() => {
    const start = (historyPage - 1) * historyPageSize;
    return campusApproved.slice(start, start + historyPageSize);
  }, [campusApproved, historyPage, historyPageSize]);

  const selectedRequest = pendingRequests.find((r: any) => r.id === selectedRequestId);

  const getStatusIcon = (category?: string) => {
    switch (category) {
      case "Substitution": return <ShieldCheck className="w-4 h-4" />;
      case "Late Attendance": return <Clock className="w-4 h-4" />;
      case "Exam Mark Edit": return <FileText className="w-4 h-4" />;
      default: return <Inbox className="w-4 h-4" />;
    }
  };

  const getStatusColor = (category?: string) => {
    switch (category) {
      case "Substitution": return "bg-amber-50 text-amber-700 border-amber-200";
      case "Late Attendance": return "bg-amber-50 text-amber-700 border-amber-200";
      case "Late Punch": return "bg-rose-50 text-rose-700 border-rose-200";
      case "Exam Mark Edit": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      default: return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const handleRequestAction = async (id: string, status: "approved" | "rejected") => {
    if (!selectedRequest) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      let finalCourseName = selectedRequest.course;
      let finalTargetStaffId = selectedRequest.targetStaffId;

      if (status === "approved" && selectedRequest.reasonCategory === "Substitution") {
        if (selectedCoverMentorId) {
          const m = mentors.find(m => m.id === selectedCoverMentorId);
          if (m) {
            finalTargetStaffId = m.id;
          }
        }
        
        if (handoverSubject === "substitute_own") {
          if (!selectedSubjName) { toast("Please select one of the subjects.", "warning"); return; }
          finalCourseName = selectedSubjName;
        } else if (handoverSubject === "custom") {
          if (!customSubjName.trim()) { toast("Please enter a custom subject name.", "warning"); return; }
          finalCourseName = customSubjName.trim();
        }
      }

      const shouldReassign =
        status === "approved" &&
        selectedRequest.reasonCategory === "Substitution" &&
        !!selectedCoverMentorId &&
        !!finalTargetStaffId;

      await handleRequest(id, status, reviewReason, "Campus Manager", finalCourseName, {
        action: shouldReassign ? "cm_reassign" : undefined,
        targetStaffId: shouldReassign ? finalTargetStaffId : undefined
      });

      toast(`Request ${status} successfully.`, "success");
      setSelectedRequestId(null);
      setReviewReason("");
    } catch (err: any) {
      toast(err.message || "Error processing request", "error");
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  // Available free mentors for substitution logic
  const availableMentors = useMemo(() => {
    if (!selectedRequest || selectedRequest.reasonCategory !== "Substitution") return [];
    return mentors.filter(m => {
      const col = (m.college_id || "").toLowerCase();
      return (validCollegeIds.size === 0 || validCollegeIds.has(col)) && m.id !== selectedRequest.requestorId;
    })
      .map(m => {
        const isSameSubject = ((m.subjects || "") as string).toLowerCase().includes((selectedRequest.course || "").toLowerCase());
        return { ...m, sameSubject: isSameSubject };
      })
      .sort((a, b) => (b.sameSubject ? 1 : 0) - (a.sameSubject ? 1 : 0));
  }, [mentors, validCollegeIds, selectedRequest]);

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] overflow-hidden bg-slate-50">
      
      {/* Header & Tabs */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              Approvals & Leaves Hub
            </h1>
            {(!colleges || colleges.length === 0 || isCmUser) && (
              <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-500" />
                {activeCollege?.name || currentCAM?.college_name || (isCmUser ? (currentCAM?.college_id || "My Campus") : "All Supervised Campuses")}
              </p>
            )}
          </div>
          {!isCmUser && colleges && colleges.length > 0 && (
            <div className="flex items-center gap-1.5 ml-0 sm:ml-4">
              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <select
                aria-label="Filter Campus"
                value={selectedCampus}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedCampus(val);
                  onCollegeChange?.(val);
                }}
                className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 outline-none"
              >
                <option value="all">All Supervised Campuses ({colleges.length})</option>
                {colleges.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        
        <div className="flex bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto gap-1">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer",
              activeTab === "pending"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <span>Pending Requests</span>
            {pendingRequests.length > 0 && (
              <span className="inline-flex items-center justify-center bg-rose-500 text-white text-[10px] font-black h-4 min-w-[16px] px-1 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
              activeTab === "history"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            Handover History
          </button>
        </div>
      </div>

      {activeTab === "history" ? (
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
          <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
            <Table className="w-full border-collapse text-left text-xs sm:text-sm">
              <TableHeader>
                <TableRow className="bg-sunken border-b border-slate-200 text-slate-500 font-bold uppercase text-xs tracking-wider">
                  <TableHead className="p-4 border-r border-slate-100">Date</TableHead>
                  <TableHead className="p-4 border-r border-slate-100">Class & Time</TableHead>
                  <TableHead className="p-4 border-r border-slate-100">Original Mentor</TableHead>
                  <TableHead className="p-4 border-r border-slate-100">Covering Mentor</TableHead>
                  <TableHead className="p-4">Subject Taught</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {paginatedApproved.map((h: any) => {
                  const req = campusRequests.find((r: any) => r.id === h.requestId);
                  const originalMentor = mentors.find(m => m.id === h.originalMentorId);
                  return (
                    <TableRow key={h.requestId} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="p-4 font-bold text-slate-800 border-r border-slate-100">{h.dateStr}</TableCell>
                      <TableCell className="p-4 border-r border-slate-100">
                        <div className="font-bold text-slate-800">{req?.classGroup || "-"}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{req?.time || "-"}</div>
                      </TableCell>
                      <TableCell className="p-4 text-slate-600 font-bold border-r border-slate-100">{originalMentor?.name || "Unknown"}</TableCell>
                      <TableCell className="p-4 font-black text-amber-700 border-r border-slate-100">{h.coverStaffName}</TableCell>
                      <TableCell className="p-4 font-bold text-slate-800">
                        {h.course}
                        {req && req.course !== h.course && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                            Custom Subject
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {campusApproved.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-12 text-center text-slate-400 font-semibold italic">
                      No approved handovers logged for this campus.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {campusApproved.length > 0 && (
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-card">
              <Pagination
                currentPage={historyPage}
                totalItems={campusApproved.length}
                pageSize={historyPageSize}
                onPageChange={setHistoryPage}
                onPageSizeChange={(newSize) => {
                  setHistoryPageSize(newSize);
                  setHistoryPage(1);
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Pane: Master List */}
          <div className={cn(
            "w-full lg:w-80 xl:w-96 lg:shrink-0 bg-white border-r border-slate-200 flex-col z-0",
            selectedRequestId ? "hidden lg:flex" : "flex"
          )}>
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500 transition-all placeholder:text-slate-400"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {["all", "Late Attendance", "Late Punch", "Substitution", "Exam Mark Edit"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat as any)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap border cursor-pointer min-h-[32px] flex items-center justify-center",
                      categoryFilter === cat 
                        ? "bg-slate-900 text-white border-slate-900 shadow-xs" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {cat === "all" ? "All Requests" : cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {pendingRequests.map((req: any) => (
                <div 
                  key={req.id}
                  onClick={() => setSelectedRequestId(req.id)}
                  className={cn(
                    "p-3.5 sm:p-4 rounded-xl cursor-pointer border transition-all text-left",
                    selectedRequestId === req.id 
                      ? "bg-amber-50/70 border-amber-300 shadow-xs ring-1 ring-amber-400/30" 
                      : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-2xs"
                  )}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase border ${getStatusColor(req.reasonCategory)}`}>
                      {getStatusIcon(req.reasonCategory)}
                      {req.reasonCategory}
                    </span>
                    <span className="text-xs font-bold text-slate-400">{req.dateFormatted}</span>
                  </div>
                  <h3 className="font-black text-slate-800 text-sm">{req.requestorName}</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-1 truncate">{req.course} • {req.classGroup || "General"}</p>
                </div>
              ))}
              {pendingRequests.length === 0 && (
                <div className="text-center p-8 text-slate-400">
                  <Inbox className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-semibold text-sm">No pending requests found.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Detail View */}
          <div className={cn(
            "flex-1 bg-slate-50/50 overflow-y-auto relative",
            selectedRequestId ? "flex flex-col" : "hidden lg:flex flex-col"
          )}>
            {selectedRequest ? (
              <>
                {/* Mobile / Tablet Back Button Bar */}
                <div className="lg:hidden flex items-center gap-2 p-3 bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setSelectedRequestId(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Requests</span>
                  </button>
                </div>

                <div className="max-w-3xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
                  
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/50 p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase border ${getStatusColor(selectedRequest.reasonCategory)}`}>
                          {getStatusIcon(selectedRequest.reasonCategory)}
                          {selectedRequest.reasonCategory} Request
                        </span>
                        <span className="text-xs sm:text-sm font-bold text-slate-500">{new Date(selectedRequest.timestamp).toLocaleString()}</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-2">{selectedRequest.requestorName}</h2>
                      <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-1">Requested approval for {selectedRequest.dateStr}</p>
                    </div>

                    <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Schedule Details</h4>
                          <p className="font-bold text-slate-800">{selectedRequest.course}</p>
                          <p className="text-sm font-semibold text-slate-600">{selectedRequest.classGroup || "General Class"} • {selectedRequest.time}</p>
                        </div>
                      
                      {selectedRequest.reasonCategory === "Substitution" && selectedRequest.targetStaffName && (
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Requested Cover Staff</h4>
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg font-bold border border-amber-200 text-sm">
                            {selectedRequest.targetStaffName}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Reason & Remarks</h4>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm font-semibold text-slate-700 whitespace-pre-wrap min-h-[100px]">
                        {selectedRequest.reason}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CM Action Panel */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-4 sm:p-6 space-y-4 sm:space-y-6">
                  <h3 className="text-lg font-black text-slate-900">Campus Manager Action</h3>
                  
                  {selectedRequest.reasonCategory === "Substitution" && (
                    <div className="space-y-6 p-5 rounded-xl border border-amber-200 bg-amber-50/30">
                      
                      <div>
                        <h4 className="text-sm font-black text-slate-800 mb-2">1. Assign Cover Faculty</h4>
                        <select 
                          aria-label="Assign Cover Faculty"
                          value={selectedCoverMentorId || ""}
                          onChange={e => setSelectedCoverMentorId(e.target.value)}
                          className="w-full max-w-md bg-white dark:bg-[#181820] border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500"
                        >
                          <option value="">-- Keep originally requested cover staff --</option>
                          {availableMentors.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.sameSubject ? "(Teaches same subject)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <h4 className="text-sm font-black text-slate-800 mb-2">2. Confirm Subject to be Taught</h4>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setHandoverSubject("original")}
                            className={cn(
                              "px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer min-h-[32px]",
                              handoverSubject === "original"
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            Original ({selectedRequest.course})
                          </button>
                          <button
                            type="button"
                            onClick={() => setHandoverSubject("substitute_own")}
                            className={cn(
                              "px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer min-h-[32px]",
                              handoverSubject === "substitute_own"
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            Cover Faculty&apos;s Own Subject
                          </button>
                          <button
                            type="button"
                            onClick={() => setHandoverSubject("custom")}
                            className={cn(
                              "px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer min-h-[32px]",
                              handoverSubject === "custom"
                                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            Custom
                          </button>
                        </div>
                        
                        {handoverSubject === "substitute_own" && (
                           <input type="text" placeholder="Type the cover faculty's subject..." value={selectedSubjName} onChange={e => setSelectedSubjName(e.target.value)} className="mt-3 w-full max-w-md bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:border-amber-500" />
                        )}
                        {handoverSubject === "custom" && (
                           <input type="text" placeholder="e.g. Test, Revision, Lab" value={customSubjName} onChange={e => setCustomSubjName(e.target.value)} className="mt-3 w-full max-w-md bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:border-amber-500" />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-800 block">
                      {selectedRequest.reasonCategory === "Substitution" ? "3. Add Internal Remarks (Optional)" : "Decision Remarks (Optional)"}
                    </label>
                    <textarea 
                      placeholder="Add a note about this decision..."
                      value={reviewReason}
                      onChange={e => setReviewReason(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500 min-h-[80px] resize-none placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={actionLoading[selectedRequest.id]}
                      onClick={() => handleRequestAction(selectedRequest.id, "approved")}
                      className="flex-1 h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading[selectedRequest.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Approve Request</span>
                    </button>
                    
                    <button
                      type="button"
                      disabled={actionLoading[selectedRequest.id]}
                      onClick={() => handleRequestAction(selectedRequest.id, "rejected")}
                      className="flex-1 h-11 px-5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-xs active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading[selectedRequest.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      <span>Decline Request</span>
                    </button>
                  </div>
                </div>

              </div>
            </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-card flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 opacity-40" />
                </div>
                <h3 className="text-lg font-black text-slate-600">Select a request</h3>
                <p className="text-sm font-semibold mt-1">Choose an item from the list to view details and take action.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
