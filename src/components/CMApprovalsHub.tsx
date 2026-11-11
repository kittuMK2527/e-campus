import { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { Clock, CheckCircle2, XCircle, Search, CalendarRange, MapPin, Inbox, ShieldCheck, FileText, ChevronRight, Check, Loader2 } from "lucide-react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { isInCmQueue, cmRequestCategory } from "@/lib/requestStatus";

export function CMApprovalsHub() {
  const { requests, mentors, colleges, currentCAM, approvedHandovers, handleRequest } = useApp();
  const { toast } = useToast();
  
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

  // Active college
  const activeCollegeId = currentCAM?.college_id;
  const activeCollege = colleges.find(c => c.id === activeCollegeId);

  // Filter requests for this CM's campus
  const campusRequests = useMemo(() => {
    if (!activeCollegeId) return [];
    return (requests || []).filter((req: any) => {
      const requestor = mentors.find((m: any) => m.id === req.requestorId);
      return requestor?.college_id === activeCollegeId;
    });
  }, [requests, mentors, activeCollegeId]);

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
    if (!activeCollegeId) return [];
    return (approvedHandovers || []).filter((h: any) => {
      const originalMentor = mentors.find((m: any) => m.id === h.originalMentorId);
      return originalMentor?.college_id === activeCollegeId;
    }).sort((a: any, b: any) => new Date(b.approvedAt || 0).getTime() - new Date(a.approvedAt || 0).getTime()).reverse();
  }, [approvedHandovers, mentors, activeCollegeId]);

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
      case "Substitution": return "bg-indigo-50 text-indigo-700 border-indigo-200";
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
    return mentors.filter(m => m.college_id === activeCollegeId && m.id !== selectedRequest.requestorId)
      .map(m => {
        const isSameSubject = ((m.subjects || "") as string).toLowerCase().includes((selectedRequest.course || "").toLowerCase());
        return { ...m, sameSubject: isSameSubject };
      })
      .sort((a, b) => (b.sameSubject ? 1 : 0) - (a.sameSubject ? 1 : 0));
  }, [mentors, activeCollegeId, selectedRequest]);

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] overflow-hidden bg-slate-50">
      
      {/* Header & Tabs */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            Approvals & Leaves Hub
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {activeCollege?.name || "All Campuses"}
          </p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === "pending" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Pending Requests
            {pendingRequests.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center bg-rose-500 text-white text-[10px] w-4 h-4 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeTab === "history" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            Handover History
          </button>
        </div>
      </div>

      {activeTab === "history" ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
            <Table className="w-full border-collapse text-left text-sm">
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
                      <TableCell className="p-4 font-black text-indigo-700 border-r border-slate-100">{h.coverStaffName}</TableCell>
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
          <div className="w-1/3 min-w-[350px] max-w-[450px] bg-white border-r border-slate-200 flex flex-col z-0">
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {["all", "Late Attendance", "Late Punch", "Substitution", "Exam Mark Edit"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat as any)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${categoryFilter === cat 
                      ? "bg-indigo-600 text-white shadow-sm" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
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
                  className={`p-4 rounded-xl cursor-pointer border transition-all ${selectedRequestId === req.id 
                    ? "bg-indigo-50/50 border-indigo-300 shadow-sm ring-1 ring-indigo-500/20" 
                    : "bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm"}`}
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
          <div className="flex-1 bg-slate-50/50 overflow-y-auto relative">
            {selectedRequest ? (
              <div className="max-w-3xl mx-auto p-8 space-y-6">
                
                <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
                  <div className="border-b border-slate-100 bg-slate-50/50 p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-black uppercase border ${getStatusColor(selectedRequest.reasonCategory)}`}>
                        {getStatusIcon(selectedRequest.reasonCategory)}
                        {selectedRequest.reasonCategory} Request
                      </span>
                      <span className="text-sm font-bold text-slate-500">{new Date(selectedRequest.timestamp).toLocaleString()}</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mt-2">{selectedRequest.requestorName}</h2>
                    <p className="text-sm font-semibold text-slate-500 mt-1">Requested approval for {selectedRequest.dateStr}</p>
                  </div>

                  <div className="p-6 grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Schedule Details</h4>
                        <p className="font-bold text-slate-800">{selectedRequest.course}</p>
                        <p className="text-sm font-semibold text-slate-600">{selectedRequest.classGroup || "General Class"} • {selectedRequest.time}</p>
                      </div>
                      
                      {selectedRequest.reasonCategory === "Substitution" && selectedRequest.targetStaffName && (
                        <div>
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Requested Cover Staff</h4>
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-100 text-sm">
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
                <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-6 space-y-6">
                  <h3 className="text-lg font-black text-slate-900">Campus Manager Action</h3>
                  
                  {selectedRequest.reasonCategory === "Substitution" && (
                    <div className="space-y-6 p-5 rounded-xl border border-indigo-100 bg-indigo-50/30">
                      
                      <div>
                        <h4 className="text-sm font-black text-slate-800 mb-2">1. Assign Cover Faculty</h4>
                        <select 
                          value={selectedCoverMentorId || ""}
                          onChange={e => setSelectedCoverMentorId(e.target.value)}
                          className="w-full max-w-md bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
                        <div className="flex gap-2">
                          <button onClick={() => setHandoverSubject("original")} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${handoverSubject === "original" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                            Original ({selectedRequest.course})
                          </button>
                          <button onClick={() => setHandoverSubject("substitute_own")} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${handoverSubject === "substitute_own" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                            Cover Faculty's Own Subject
                          </button>
                          <button onClick={() => setHandoverSubject("custom")} className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${handoverSubject === "custom" ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                            Custom
                          </button>
                        </div>
                        
                        {handoverSubject === "substitute_own" && (
                           <input type="text" placeholder="Type the cover faculty's subject..." value={selectedSubjName} onChange={e => setSelectedSubjName(e.target.value)} className="mt-3 w-full max-w-md bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:border-indigo-500" />
                        )}
                        {handoverSubject === "custom" && (
                           <input type="text" placeholder="e.g. Test, Revision, Lab" value={customSubjName} onChange={e => setCustomSubjName(e.target.value)} className="mt-3 w-full max-w-md bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:border-indigo-500" />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-sm font-black text-slate-800 block">3. Add Internal Remarks (Optional)</label>
                    <textarea 
                      placeholder="Add a note about this decision..."
                      value={reviewReason}
                      onChange={e => setReviewReason(e.target.value)}
                      className="w-full bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[80px] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={actionLoading[selectedRequest.id]}
                      onClick={() => handleRequestAction(selectedRequest.id, "approved")}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading[selectedRequest.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>Approve Request</span>
                    </button>
                    
                    <button
                      type="button"
                      disabled={actionLoading[selectedRequest.id]}
                      onClick={() => handleRequestAction(selectedRequest.id, "rejected")}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-black shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {actionLoading[selectedRequest.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      <span>Decline Request</span>
                    </button>
                  </div>
                </div>

              </div>
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
