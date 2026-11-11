"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { useApp } from "../context/AppContext";
import { useToast } from "@/context/ToastContext";
import {
  DollarSign, TrendingUp, TrendingDown, Users, Building2, Search, Filter,
  Download, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronRight,
  Receipt, CreditCard, Wallet, PieChart, BarChart2, ArrowUpRight,
  X, Check, RefreshCw, FileText, Printer, Eye, IndianRupee, BadgePercent,
  School, CircleDollarSign, Activity, Target, Layers, ListFilter, Upload,
  Sparkles, ArrowRight, Calendar, ShieldCheck, CheckCircle, ExternalLink, Plus, Trash2,
  ChevronsLeft, ChevronsRight
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/Pagination";

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
  pay_link?: string;
  payment_proof?: string;
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
  phone?: string;
  semester?: string;
  year?: string;
}

interface CollegeRecord {
  id: string;
  name: string;
}

interface CamRecord {
  id: string;
  name: string;
  email: string;
  college_id: string;
  college_name: string;
}

interface FeeStats {
  totalFees: number;
  totalPaid: number;
  totalOutstanding: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  totalStudents: number;
}

type TabType = "overview" | "colleges" | "students" | "transactions";

const fmt = (n: number) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/* Standardized Status Badges using shadcn Badge */
const StatusBadge = ({ status }: { status: string }) => {
  if (status === "paid")
    return (
      <Badge variant="default" className="shadow-2xs">
        <CheckCircle2 className="h-3 w-3" /> Paid
      </Badge>
    );
  if (status === "partial")
    return (
      <Badge variant="warning" className="shadow-2xs">
        <Clock className="h-3 w-3" /> Partial
      </Badge>
    );
  return (
    <Badge variant="secondary" className="shadow-2xs">
      <AlertCircle className="h-3 w-3" /> Unpaid
    </Badge>
  );
};

/* Standardized Payment Method Badges using shadcn Badge */
const MethodBadge = ({ method }: { method: string }) => {
  const m = (method || "").toLowerCase();
  if (m === "online") return <Badge variant="default">{method}</Badge>;
  if (m === "cash") return <Badge variant="success">{method}</Badge>;
  if (m === "cheque") return <Badge variant="warning">{method}</Badge>;
  return <Badge variant="outline">{method || "Direct"}</Badge>;
};

export interface FeeManagerDashboardProps {
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

export const FeeManagerDashboard: React.FC<FeeManagerDashboardProps> = ({
  activeTab: propActiveTab,
  onTabChange
}) => {
  const { colleges: ctxColleges, coursesList: ctxCourses, slots: ctxSlots, subjectsList: ctxSubjects } = useApp();
  const { toast: toastFe, confirm: showConfirm } = useToast();

  const [localActiveTab, setLocalActiveTab] = useState<TabType>("overview");
  const activeTab = propActiveTab || localActiveTab;
  const setActiveTab = onTabChange || setLocalActiveTab;
  const queryClient = useQueryClient();
  const feesQuery = useQuery<{
    colleges: CollegeRecord[];
    students: StudentRecord[];
    fees: StudentFee[];
    payments: FeePayment[];
    cams: CamRecord[];
    stats: FeeStats;
  } | null>({
    queryKey: qk.fees("dashboard", "all", "all", ""),
    queryFn: async () => {
      const json = await apiFetch<any>("/api/fees?role=fee_manager");
      return json?.success ? json : null;
    },
  });
  const data = feesQuery.data ?? null;
  const loading = feesQuery.isPending;

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCollege, setFilterCollege] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterFeeStatus, setFilterFeeStatus] = useState("all");
  const [filterFromDate, setFilterFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [filterToDate, setFilterToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [selectedReportYear, setSelectedReportYear] = useState("2025-2027");

  // Pagination States
  const [studentsPage, setStudentsPage] = useState(1);
  const [studentsPageSize, setStudentsPageSize] = useState(25);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(25);

  // Sidebar Collapse State
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("fp_sidebar_collapsed") === "true";
    setIsCollapsed(stored);
  }, []);

  // Individual Fee Editing States
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [editTermName, setEditTermName] = useState<string>("");
  const [editTotalAmount, setEditTotalAmount] = useState<string>("");
  const [editPaidAmount, setEditPaidAmount] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("unpaid");
  const [editProofLink, setEditProofLink] = useState<string>("");
  const [savingFeeId, setSavingFeeId] = useState<string | null>(null);
  const [deletingFeeId, setDeletingFeeId] = useState<string | null>(null);

  // Add New Semester Fee Form State
  const [addingStudentFeeId, setAddingStudentFeeId] = useState<string | null>(null);
  const [newTermName, setNewTermName] = useState<string>("");
  const [newAmount, setNewAmount] = useState<string>("");
  const [newPaidAmount, setNewPaidAmount] = useState<string>("0");
  const [newStatus, setNewStatus] = useState<string>("unpaid");
  const [newProofLink, setNewProofLink] = useState<string>("");

  // Excel Bulk Upload States
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStep, setUploadStep] = useState<1 | 2>(1);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState<any[][]>([]);
  const [colIndices, setColIndices] = useState<Record<string, number>>({});
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);

  // Template Generation States
  const [selectedTemplateCollege, setSelectedTemplateCollege] = useState("");
  const [selectedTemplateDept, setSelectedTemplateDept] = useState("");
  const [selectedTemplateSem, setSelectedTemplateSem] = useState("");
  const [selectedTemplateYear, setSelectedTemplateYear] = useState("");

  const fetchData = () =>
    queryClient.invalidateQueries({ queryKey: ["fees"] });

  useEffect(() => {
    if (data?.colleges?.length && !selectedTemplateCollege) {
      setSelectedTemplateCollege(data.colleges[0].name);
    }
  }, [data?.colleges, selectedTemplateCollege]);

  const selectedCollegeObj = useMemo(() => {
    if (!selectedTemplateCollege) return null;
    const cleanName = selectedTemplateCollege.trim().toLowerCase();
    const fromData = data?.colleges?.find(c => c.name.trim().toLowerCase() === cleanName);
    if (fromData) return fromData;
    const fromCtx = ctxColleges?.find(c => c.name.trim().toLowerCase() === cleanName);
    if (fromCtx) return fromCtx;
    return null;
  }, [selectedTemplateCollege, data?.colleges, ctxColleges]);

  const availableColleges = useMemo(() => {
    const list = new Map<string, string>();
    if (data?.colleges) {
      data.colleges.forEach(c => list.set(c.name.trim(), c.id));
    }
    if (ctxColleges) {
      ctxColleges.forEach(c => list.set(c.name.trim(), c.id));
    }
    return Array.from(list.keys()).sort();
  }, [data?.colleges, ctxColleges]);

  const availableDepartments = useMemo(() => {
    const list = new Set<string>();
    const targetCollegeId = selectedCollegeObj?.id;

    if (data?.students) {
      data.students.forEach(s => {
        if (targetCollegeId && s.college_id !== targetCollegeId) return;
        if (s.department) {
          const clean = s.department.trim();
          if (!clean.toLowerCase().includes("year") && !/^\d+$/.test(clean)) {
            list.add(clean);
          }
        }
      });
    }
    if (ctxCourses) {
      ctxCourses.forEach(c => {
        if ((c as any).college_id && targetCollegeId && (c as any).college_id !== targetCollegeId) return;
        if (c.name) list.add(c.name.trim());
      });
    }
    return Array.from(list).filter(Boolean).sort();
  }, [selectedCollegeObj, data?.students, ctxCourses]);

  const availableSemesters = useMemo(() => {
    const list = new Set<string>();
    const targetCollegeId = selectedCollegeObj?.id;
    const targetDeptLower = selectedTemplateDept?.trim().toLowerCase();

    if (data?.students) {
      data.students.forEach(s => {
        if (targetCollegeId && s.college_id !== targetCollegeId) return;
        if (targetDeptLower && s.department && s.department.trim().toLowerCase() !== targetDeptLower) return;
        const sem = s.semester;
        if (sem) list.add(sem.trim());
      });
    }
    return Array.from(list).filter(Boolean).sort();
  }, [selectedCollegeObj, selectedTemplateDept, data?.students]);

  const availableYears = useMemo(() => {
    const list = new Set<string>();
    const targetCollegeId = selectedCollegeObj?.id;
    const targetDeptLower = selectedTemplateDept?.trim().toLowerCase();

    if (data?.students) {
      data.students.forEach(s => {
        if (targetCollegeId && s.college_id !== targetCollegeId) return;
        if (targetDeptLower && s.department && s.department.trim().toLowerCase() !== targetDeptLower) return;
        if (s.year) list.add(s.year.trim());
      });
    }
    if (list.size === 0) {
      list.add("Year I");
      list.add("Year II");
      list.add("Year III");
    }
    return Array.from(list).filter(Boolean).sort();
  }, [selectedCollegeObj, selectedTemplateDept, data?.students]);

  useEffect(() => {
    if (availableDepartments.length > 0) {
      if (!selectedTemplateDept || !availableDepartments.includes(selectedTemplateDept)) {
        setSelectedTemplateDept(availableDepartments[0]);
      }
    }
  }, [availableDepartments, selectedTemplateDept]);

  useEffect(() => {
    if (availableSemesters.length > 0) {
      if (!selectedTemplateSem || !availableSemesters.includes(selectedTemplateSem)) {
        setSelectedTemplateSem(availableSemesters[0]);
      }
    }
  }, [availableSemesters, selectedTemplateSem]);

  useEffect(() => {
    if (availableYears.length > 0) {
      if (!selectedTemplateYear || !availableYears.includes(selectedTemplateYear)) {
        setSelectedTemplateYear(availableYears[0]);
      }
    }
  }, [availableYears, selectedTemplateYear]);

  const handleDownloadTemplate = async () => {
    try {
      const headers = [
        "Registration Number",
        "College Name",
        "Student Name",
        "Year",
        "Email",
        "Mobile Number",
        "Department",
        "Semester",
        "FPC FEES PAID",
        "FPC FEES PENDING",
        "Amount",
        "Payment Link"
      ];
      
      const targetCollege = data?.colleges.find(
        c => c.name.trim().toLowerCase() === selectedTemplateCollege.trim().toLowerCase()
      );

      const matchingStudents = (data?.students || []).filter(s => {
        if (targetCollege && s.college_id !== targetCollege.id) return false;
        if (s.department && selectedTemplateDept && s.department.trim().toLowerCase() !== selectedTemplateDept.trim().toLowerCase()) return false;
        return true;
      });

      const rows = matchingStudents.map(s => {
        let regNo = s.register_number || s.roll_number || "";
        const emailPrefix = (s.email || "").split("@")[0].toLowerCase();
        if (regNo.toLowerCase() === emailPrefix || regNo.startsWith("student_")) {
          regNo = "";
        }
        return {
          "Registration Number": regNo,
          "College Name": selectedTemplateCollege,
          "Student Name": s.name || "",
          "Year": s.year || selectedTemplateYear,
          "Email": s.email || "",
          "Mobile Number": s.phone || "",
          "Department": s.department || selectedTemplateDept,
          "Semester": s.semester || selectedTemplateSem,
          "FPC FEES PAID": "",
          "FPC FEES PENDING": "",
          "Amount": "",
          "Payment Link": ""
        };
      });

      if (rows.length === 0) {
        rows.push({
          "Registration Number": "",
          "College Name": selectedTemplateCollege,
          "Student Name": "",
          "Year": selectedTemplateYear,
          "Email": "",
          "Mobile Number": "",
          "Department": selectedTemplateDept,
          "Semester": selectedTemplateSem,
          "FPC FEES PAID": "",
          "FPC FEES PENDING": "",
          "Amount": "",
          "Payment Link": ""
        });
      }

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Template");
      
      const filename = `Fee_Template_${(selectedTemplateDept || "General").replace(/[^a-zA-Z0-9]/g, "_")}_${(selectedTemplateYear || "Year_I").replace(/\s+/g, "_")}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (e: any) {
      setUploadError("Failed to generate template: " + e.message);
    }
  };

  const handleDownloadFilteredReport = async () => {
    try {
      const reportData = filteredStudents.map(s => {
        const studentFees = getStudentFees(s.id);
        const totalFees = studentFees.reduce((sum, f) => sum + f.amount, 0);
        const totalPaid = studentFees.reduce((sum, f) => sum + f.paid_amount, 0);
        const remaining = Math.max(totalFees - totalPaid, 0);
        return {
          "Student ID": s.id,
          "Registration Number": s.register_number || s.roll_number || "",
          "Student Name": s.name,
          "College": getCollegeName(s.college_id),
          "Department": s.department || "General",
          "Academic Year": s.year || "Year I",
          "Semester": s.semester || "Semester 1",
          "Class/Batch": s.classGroup || "",
          "Email": s.email || "",
          "Phone": s.phone || "",
          "Total Target Fee (₹)": totalFees,
          "Paid Fee (₹)": totalPaid,
          "Remaining Dues (₹)": remaining,
          "Fee Status": totalPaid >= totalFees && totalFees > 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Unpaid"
        };
      });

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(reportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Directory Report");
      XLSX.writeFile(workbook, `Student_Fee_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e: any) {
      toastFe("Failed to export report: " + e.message);
    }
  };

  const parseRowsWithIndices = (rows: any[][], indices: Record<string, number>) => {
    const parsed: any[] = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const studentName = indices.student !== undefined && indices.student !== -1 ? String(row[indices.student] || "").trim() : "";
      const email = indices.email !== undefined && indices.email !== -1 ? String(row[indices.email] || "").trim() : "";
      const registerNumber = indices.register_number !== undefined && indices.register_number !== -1 ? String(row[indices.register_number] || "").trim() : "";
      
      if (!studentName && !email && !registerNumber) continue;

      const cleanNum = (val: any) => {
        if (val === undefined || val === null || String(val).trim() === "") return 0;
        return Number(String(val).replace(/[^\d.-]/g, "")) || 0;
      };

      const collegeName = indices.college !== undefined && indices.college !== -1 ? String(row[indices.college] || "").trim() : "";
      const phone = indices.phone !== undefined && indices.phone !== -1 ? String(row[indices.phone] || "").trim() : "";
      const amount = indices.amount !== undefined && indices.amount !== -1 ? cleanNum(row[indices.amount]) : 0;
      const paid = indices.paid !== undefined && indices.paid !== -1 ? cleanNum(row[indices.paid]) : 0;
      const pending = indices.pending !== undefined && indices.pending !== -1 ? cleanNum(row[indices.pending]) : amount - paid;
      const year = indices.year !== undefined && indices.year !== -1 ? String(row[indices.year] || "").trim() : "";
      const t = indices.t !== undefined && indices.t !== -1 ? String(row[indices.t] || "").trim() : "";
      const semester = indices.semester !== undefined && indices.semester !== -1 ? String(row[indices.semester] || "").trim() : "";
      const payLink = indices.pay_link !== undefined && indices.pay_link !== -1 ? String(row[indices.pay_link] || "").trim() : "";

      parsed.push({
        registerNumber,
        collegeName,
        studentName,
        year,
        email,
        phone,
        t,
        semester,
        paid,
        pending,
        amount,
        payLink
      });
    }
    return parsed;
  };

  const handleMappingChange = (fieldKey: string, headerIdx: number) => {
    const nextIndices = { ...colIndices, [fieldKey]: headerIdx };
    setColIndices(nextIndices);
    const parsed = parseRowsWithIndices(sheetRows, nextIndices);
    setParsedData(parsed);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rawJson.length < 2) {
          setUploadError("The uploaded sheet is empty or contains no headers.");
          return;
        }

        const headers: string[] = (rawJson[0] || []).map((h: any) => String(h || "").trim());
        const dataRows = rawJson.slice(1);

        setSheetHeaders(headers);
        setSheetRows(dataRows);

        const lowerHeaders = headers.map((h) => h.toLowerCase());
        const findHeader = (...tests: Array<(h: string) => boolean>) => {
          for (const test of tests) {
            const idx = lowerHeaders.findIndex(test);
            if (idx !== -1) return idx;
          }
          return -1;
        };
        const isSettledColumn = (h: string) => h.includes("paid") || h.includes("pending");

        const autoIndices: Record<string, number> = {
          register_number: findHeader((h) => h.includes("registration"), (h) => h.includes("reg")),
          college: findHeader((h) => h.includes("college")),
          student: findHeader((h) => h.includes("student"), (h) => h === "name"),
          year: findHeader((h) => h.includes("year"), (h) => h.includes("batch")),
          email: findHeader((h) => h.includes("email")),
          phone: findHeader((h) => h.includes("mobile"), (h) => h.includes("phone")),
          t: findHeader((h) => h.includes("department"), (h) => h.includes("dept")),
          semester: findHeader((h) => h.includes("semester"), (h) => h.includes("sem")),
          paid: findHeader((h) => h.includes("paid")),
          pending: findHeader((h) => h.includes("pending")),
          // Target fee must never auto-map onto a "paid"/"pending" column.
          amount: findHeader(
            (h) => h.includes("amount") && !isSettledColumn(h),
            (h) => (h.includes("fee") || h.includes("total") || h.includes("target")) && !isSettledColumn(h)
          ),
          pay_link: findHeader((h) => h.includes("link"))
        };

        setColIndices(autoIndices);
        const parsed = parseRowsWithIndices(dataRows, autoIndices);
        setParsedData(parsed);
        setUploadStep(2);
        setUploadError(null);
      } catch (err: any) {
        setUploadError("Failed to parse Excel file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkUpload = async () => {
    if (parsedData.length === 0) {
      setUploadError("No valid rows to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const res = await fetch("/api/fees/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedData })
      });

      const json = await res.json();
      if (json.success) {
        setUploadResult({
          message: json.message,
          processedCount: json.processedCount,
          skippedCount: json.skippedCount,
          skippedRows: json.skippedRows
        });
        setParsedData([]);
        fetchData();
      } else {
        setUploadError(json.message || "Failed to upload fee data.");
      }
    } catch (err: any) {
      setUploadError("Network error: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Update existing Fee Record (including Status & Proof Link)
  const handleUpdateFeeStatus = async (feeId: string, studentId: string) => {
    if (savingFeeId) return;
    setSavingFeeId(feeId);
    try {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeId,
          studentId,
          isDirectUpdate: true,
          termName: editTermName,
          amount: Number(editTotalAmount) || 0,
          paidAmount: Number(editPaidAmount) || 0,
          status: editStatus,
          paymentProof: editProofLink,
          payLink: editProofLink
        })
      });
      const json = await res.json();
      if (json.success) {
        setEditingFeeId(null);
        await fetchData();
      } else {
        toastFe(json.message || "Failed to update fee record.");
      }
    } catch (err: any) {
      toastFe("Error saving payment: " + err.message);
    } finally {
      setSavingFeeId(null);
    }
  };

  // Create new Semester Fee Record for student
  const handleCreateFee = async (studentId: string) => {
    if (savingFeeId) return;
    setSavingFeeId(studentId);
    try {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          isCreateFee: true,
          termName: newTermName,
          amount: Number(newAmount) || 0,
          paidAmount: Number(newPaidAmount) || 0,
          status: newStatus,
          paymentProof: newProofLink,
          payLink: newProofLink
        })
      });
      const json = await res.json();
      if (json.success) {
        setAddingStudentFeeId(null);
        setNewTermName("");
        setNewAmount("");
        setNewPaidAmount("0");
        setNewProofLink("");
        await fetchData();
      } else {
        toastFe(json.message || "Failed to create fee record.");
      }
    } catch (err: any) {
      toastFe("Error creating fee: " + err.message);
    } finally {
      setSavingFeeId(null);
    }
  };

  // Delete Fee Record
  const handleDeleteFee = async (feeId: string) => {
    const ok = await showConfirm({
      message: "Delete this semester fee record? Payments recorded against it cannot be recovered.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    if (deletingFeeId) return;
    setDeletingFeeId(feeId);
    try {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeId, isDeleteFee: true })
      });
      const json = await res.json();
      if (json.success) {
        await fetchData();
      } else {
        toastFe(json.message || "Failed to delete fee record.");
      }
    } catch (err: any) {
      toastFe("Error deleting fee: " + err.message);
    } finally {
      setDeletingFeeId(null);
    }
  };

  /* Fixed College Statistics Calculation */
  const collegeStats = useMemo(() => {
    if (!data) return [];
    return data.colleges.map((col) => {
      const colFees = data.fees.filter((f) => f.college_id === col.id);
      const colStudents = data.students.filter((s) => s.college_id === col.id);
      const colPayments = data.payments.filter((p) => p.college_id === col.id);

      let total = colFees.reduce((s, f) => s + Number(f.amount || 0), 0);
      let paid = colFees.reduce((s, f) => s + Number(f.paid_amount || 0), 0);

      if (paid === 0 && colPayments.length > 0) {
        paid = colPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
      }

      if (paid > total) {
        total = paid;
      }

      const outstanding = Math.max(total - paid, 0);
      const collectionRate = total > 0 ? Math.min(Math.round((paid / total) * 100), 100) : 0;

      return {
        ...col,
        totalStudents: colStudents.length,
        totalFees: total,
        totalPaid: paid,
        outstanding,
        collectionRate,
        paidCount: colFees.filter((f) => f.status === "paid").length,
        unpaidCount: colFees.filter((f) => f.status === "unpaid").length,
      };
    });
  }, [data]);

  const uniqueDepartments = useMemo(() => {
    if (!data?.students) return [];
    const depts = new Set<string>();
    data.students.forEach((s) => {
      if (filterCollege !== "all" && s.college_id !== filterCollege) return;
      if (s.department) depts.add(s.department.trim());
    });
    return Array.from(depts).sort();
  }, [data?.students, filterCollege]);

  /* Dynamically derive Unique Academic Years directly from Database */
  const uniqueYears = useMemo(() => {
    if (!data?.students) return [];
    const years = new Set<string>();
    data.students.forEach((s) => {
      if (filterCollege !== "all" && s.college_id !== filterCollege) return;
      if (s.year) {
        years.add(s.year.trim());
      } else if (s.classGroup) {
        const match = s.classGroup.match(/Year\s+(I|II|III|IV|1|2|3|4)/i);
        if (match) years.add(match[0].trim());
      }
    });
    return Array.from(years).sort();
  }, [data?.students, filterCollege]);

  const studentFeesMap = useMemo(() => {
    const map = new Map<string, any[]>();
    if (data?.fees) {
      for (const f of data.fees) {
        if (!map.has(f.student_id)) map.set(f.student_id, []);
        map.get(f.student_id)!.push(f);
      }
    }
    return map;
  }, [data?.fees]);

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    return data.students.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.register_number && s.register_number.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q));

      const matchCollege = filterCollege === "all" || s.college_id === filterCollege;
      const matchDept = filterDept === "all" || s.department === filterDept;

      let matchYear = true;
      if (filterYear !== "all") {
        const yrLower = filterYear.toLowerCase();
        const sYr = (s.year || "").toLowerCase();
        const sClass = (s.classGroup || "").toLowerCase();
        matchYear = sYr === yrLower || sClass.includes(yrLower);
      }

      let matchStatus = true;
      if (filterFeeStatus !== "all") {
        const studentFees = studentFeesMap.get(s.id) || [];
        const totalFees = studentFees.reduce((sum, f) => sum + f.amount, 0);
        const totalPaid = studentFees.reduce((sum, f) => sum + f.paid_amount, 0);
        const overallStatus =
          totalPaid >= totalFees && totalFees > 0 ? "paid"
          : totalPaid > 0 ? "partial"
          : "unpaid";
        matchStatus = overallStatus === filterFeeStatus;
      }

      return matchSearch && matchCollege && matchDept && matchYear && matchStatus;
    });
  }, [data, searchQuery, filterCollege, filterDept, filterYear, filterFeeStatus, studentFeesMap]);

  const filteredPayments = useMemo(() => {
    if (!data) return [];
    let pays = [...data.payments].sort(
      (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
    );
    if (filterCollege !== "all") {
      pays = pays.filter((p) => p.college_id === filterCollege);
    }
    if (filterFromDate) {
      pays = pays.filter((p) => p.payment_date && p.payment_date >= filterFromDate);
    }
    if (filterToDate) {
      const toStr = filterToDate.includes("T") ? filterToDate : `${filterToDate}T23:59:59.999Z`;
      pays = pays.filter((p) => p.payment_date && p.payment_date <= toStr);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      pays = pays.filter(
        (p) =>
          p.receipt_no.toLowerCase().includes(q) ||
          p.student_id.toLowerCase().includes(q) ||
          p.reference_no.toLowerCase().includes(q)
      );
    }
    return pays;
  }, [data, searchQuery, filterCollege, filterFromDate, filterToDate]);

  // Reset page when filters change
  useEffect(() => {
    setStudentsPage(1);
  }, [searchQuery, filterCollege, filterDept, filterYear, filterFeeStatus]);

  useEffect(() => {
    setPaymentsPage(1);
  }, [searchQuery, filterCollege, filterFromDate, filterToDate]);

  // Paginated Slices for optimal DOM rendering performance
  const paginatedStudents = useMemo(() => {
    const start = (studentsPage - 1) * studentsPageSize;
    return filteredStudents.slice(start, start + studentsPageSize);
  }, [filteredStudents, studentsPage, studentsPageSize]);

  const paginatedPayments = useMemo(() => {
    const start = (paymentsPage - 1) * paymentsPageSize;
    return filteredPayments.slice(start, start + paymentsPageSize);
  }, [filteredPayments, paymentsPage, paymentsPageSize]);

  const reportsData = useMemo(() => {
    if (!data) return null;

    const reportYearsList = ["2025-2027", "2024-2028", "2023-2027"];
    const todayStr = new Date().toISOString().split("T")[0];

    const todayRevenue = data.payments
      .filter(p => p.payment_date && p.payment_date.startsWith(todayStr))
      .reduce((sum, p) => sum + p.amount, 0);

    const totalPaidOverall = data.fees.reduce((sum, f) => sum + f.paid_amount, 0);
    const totalTargetOverall = Math.max(data.fees.reduce((sum, f) => sum + f.amount, 0), totalPaidOverall);
    const totalPendingOverall = Math.max(totalTargetOverall - totalPaidOverall, 0);
    const totalAchievedPercent = totalTargetOverall > 0 ? Math.min((totalPaidOverall / totalTargetOverall) * 100, 100) : 0;

    const collegesList = data.colleges.map(col => {
      const colFees = data.fees.filter(f => f.college_id === col.id);
      const colStudents = data.students.filter(s => s.college_id === col.id);
      const paidStus = colFees.filter(f => f.status === "paid").length;
      const pendingStus = colFees.filter(f => f.status !== "paid").length;

      let collegeFeesTarget = colFees.reduce((s, f) => s + f.amount, 0);
      const collegeFeesAchieved = colFees.reduce((s, f) => s + f.paid_amount, 0);
      if (collegeFeesAchieved > collegeFeesTarget) {
        collegeFeesTarget = collegeFeesAchieved;
      }

      const fpcFeesTarget = Math.round(collegeFeesTarget * 0.35);
      const fpcFeesAchieved = Math.round(collegeFeesAchieved * 0.35);

      return {
        id: col.id,
        name: col.name,
        totalStudents: colStudents.length,
        paidStudents: paidStus,
        pendingStudents: pendingStus,
        collegeFeesTarget,
        collegeFeesAchieved,
        fpcFeesTarget,
        fpcFeesAchieved,
      };
    });

    const maxStudentCount = Math.max(...collegesList.map(c => Math.max(c.paidStudents, c.pendingStudents, 10)), 50);
    const maxFeeAmount = Math.max(...collegesList.map(c => Math.max(c.collegeFeesTarget, c.fpcFeesTarget, 10000)), 100000);

    const paidPoints = collegesList.map((col, idx) => {
      const N = collegesList.length;
      const x = N > 1 ? 40 + idx * (420 / (N - 1)) : 250;
      const y = 170 - (col.paidStudents / maxStudentCount) * 140;
      return { x, y, val: col.paidStudents };
    });

    const pendingPoints = collegesList.map((col, idx) => {
      const N = collegesList.length;
      const x = N > 1 ? 40 + idx * (420 / (N - 1)) : 250;
      const y = 170 - (col.pendingStudents / maxStudentCount) * 140;
      return { x, y, val: col.pendingStudents };
    });

    const buildPath = (pts: { x: number; y: number }[]) => {
      if (pts.length === 0) return "";
      if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
      let path = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const curr = pts[i];
        const next = pts[i + 1];
        const mx = (curr.x + next.x) / 2;
        path += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
      }
      return path;
    };

    const totalCollegeFeesTarget = collegesList.reduce((s, c) => s + c.collegeFeesTarget, 0);
    const totalCollegeFeesAchieved = collegesList.reduce((s, c) => s + c.collegeFeesAchieved, 0);
    const totalFpcFeesTarget = collegesList.reduce((s, c) => s + c.fpcFeesTarget, 0);
    const totalFpcFeesAchieved = collegesList.reduce((s, c) => s + c.fpcFeesAchieved, 0);

    return {
      reportYearsList,
      todayRevenue,
      totalPaidOverall,
      totalPendingOverall,
      totalTargetOverall,
      totalAchievedPercent,
      collegesList,
      maxStudentCount,
      maxFeeAmount,
      paidPoints,
      pendingPoints,
      paidLinePath: buildPath(paidPoints),
      pendingLinePath: buildPath(pendingPoints),
      totalCollegeFeesTarget,
      totalCollegeFeesAchieved,
      totalFpcFeesTarget,
      totalFpcFeesAchieved
    };
  }, [data]);

  const getStudentFees = (studentId: string) =>
    data?.fees.filter((f) => f.student_id === studentId) || [];

  const getStudentName = (studentId: string) =>
    data?.students.find((s) => s.id === studentId)?.name || studentId;

  const getCollegeName = (collegeId: string) => {
    if (!collegeId) return "—";
    const col = data?.colleges.find((c) => c.id === collegeId);
    return col ? col.name : collegeId;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px] bg-warm-canvas">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-[#4F46E5]/20 border-t-[#4F46E5] animate-spin" />
          <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Loading Fee Workspace &amp; Analytics…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px] bg-warm-canvas">
        <Card className="max-w-md text-center p-8">
          <AlertCircle className="h-12 w-12 text-[#4F46E5] mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200">Unable to Load Fee Records</h3>
          <p className="text-xs text-slate-500 mt-1 mb-5">Database connection failed. Please retry.</p>
          <Button onClick={fetchData} variant="default">
            Retry Connection
          </Button>
        </Card>
      </div>
    );
  }

  const { stats } = data;

  /* Clean Sidebar Tabs without Number Badges */
  const tabs: { id: TabType; label: string; icon: React.FC<any> }[] = [
    { id: "overview", label: "Executive Overview", icon: Activity },
    { id: "colleges", label: "Colleges Breakdown", icon: School },
    { id: "students", label: "Student Directory", icon: Users },
    { id: "transactions", label: "Fee Transactions", icon: Receipt },
  ];

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-warm-canvas text-slate-800 dark:text-slate-200 font-sans">
      {/* Sleek Floating Sidebar */}
      <aside className={`hidden md:flex shrink-0 flex-col justify-between sticky top-6 z-30 floating-sidebar transition-all duration-300 ${isCollapsed ? "w-20 p-3" : "w-64 p-5"}`}>
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Nav items */}
          <nav className={`py-2 space-y-1 ${isCollapsed ? "px-1" : "px-4"}`}>
            {tabs.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center rounded-md text-xs font-bold tracking-tight transition-all duration-200 cursor-pointer ${
                    isCollapsed ? "justify-center px-0 py-3" : "justify-start gap-3 px-4 py-3 text-left"
                  } ${
                    isActive
                      ? "sidebar-active-item"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <div className="relative flex items-center justify-center">
                    <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-amber-400" : "text-slate-400 group-hover:text-slate-600"}`} />
                  </div>
                  {!isCollapsed && <span>{label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer — universal collapse toggle */}
        <div className="border-t border-slate-100/85 dark:border-slate-800 pt-3.5 space-y-3 shrink-0">
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setIsCollapsed(prev => {
                const next = !prev;
                localStorage.setItem("fp_sidebar_collapsed", String(next));
                return next;
              })}
              className="h-8.5 w-8.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 shadow-xs transition-all cursor-pointer"
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Nav Bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131317] p-2 gap-2 shrink-0">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 ${
              activeTab === id ? "btn-gradient text-white" : "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Main Content Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Floating Header */}
        <header className="mx-3 md:mx-8 mt-4 md:mt-6 mb-2 px-5 py-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#131317]/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
          <div>
            <h1 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
              <span>
                {activeTab === "overview" && `Fee Collection Reports for ${selectedReportYear}`}
                {activeTab === "colleges" && `College-wise Breakdown`}
                {activeTab === "students" && `Student Fee Directory`}
                {activeTab === "transactions" && `Payment Receipts & Audit Trail`}
              </span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">
              Target Revenue: {fmt(stats.totalFees)} · Collected: <span className="text-[#4F46E5] font-black">{fmt(stats.totalPaid)}</span> · Outstanding: <span className="text-rose-500 font-black">{fmt(stats.totalOutstanding)}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-2xl px-3 py-1.5 bg-white/60 dark:bg-black/20 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Calendar className="h-3.5 w-3.5 text-[#4F46E5] shrink-0" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">From:</span>
              <input
                type="date"
                aria-label="From Date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="bg-transparent outline-none cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200"
                title="From Date"
              />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">To:</span>
              <input
                type="date"
                aria-label="To Date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="bg-transparent outline-none cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200"
                title="To Date"
              />
            </div>

            {/* Quick Date Chips */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const to = now.toISOString().split("T")[0];
                  const d = new Date();
                  d.setDate(d.getDate() - 6);
                  setFilterFromDate(d.toISOString().split("T")[0]);
                  setFilterToDate(to);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#181820] hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const to = now.toISOString().split("T")[0];
                  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
                  setFilterFromDate(from);
                  setFilterToDate(to);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#181820] hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const to = now.toISOString().split("T")[0];
                  const d = new Date();
                  d.setDate(d.getDate() - 29);
                  setFilterFromDate(d.toISOString().split("T")[0]);
                  setFilterToDate(to);
                }}
                className="px-2.5 py-1 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#181820] hover:bg-slate-50 text-slate-700 dark:text-slate-300 shadow-2xs cursor-pointer transition-all active:scale-95"
              >
                Last 30 Days
              </button>
            </div>

            {/* Download Filtered Report */}
            {activeTab === "students" && (
              <Button
                onClick={handleDownloadFilteredReport}
                variant="outline"
                size="default"
                className="border-[#4F46E5]/20 text-[#4F46E5] hover:bg-[#4F46E5]/10 font-bold"
              >
                <Download className="h-4 w-4" />
                <span>Export Report</span>
              </Button>
            )}

            <Button
              onClick={() => {
                setShowUploadModal(true);
                setParsedData([]);
                setUploadError(null);
                setUploadResult(null);
              }}
              variant="default"
              size="default"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Excel</span>
            </Button>

            <Button
              onClick={fetchData}
              variant="outline"
              size="icon"
              title="Refresh Dashboard"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Scrollable Content Workspace */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">

          {/* ══════════════════ OVERVIEW TAB ══════════════════ */}
          {activeTab === "overview" && reportsData && (
            <div className="space-y-8 animate-fadeIn">
              
              {/* 4 Core KPI Cards ordered: 1. Total Paid Collections, 2. Total Pending Fees, 3. Target Revenue, 4. Today's Revenue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* 1. Total Paid Collections */}
                <Card className="flex items-center justify-between p-5 hover:shadow-card-lg transition-shadow">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Paid Collections</span>
                    <h3 className="text-xl font-black text-[#4F46E5] dark:text-[#818CF8] mt-1">
                      {fmt(reportsData.totalPaidOverall)}
                    </h3>
                    <div className="w-28 bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(reportsData.totalAchievedPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5] border border-[#4F46E5]/20 shadow-inner">
                    <Receipt className="h-5 w-5" />
                  </div>
                </Card>

                {/* 2. Total Pending Fees */}
                <Card className="flex items-center justify-between p-5 hover:shadow-card-lg transition-shadow">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Pending Fees</span>
                    <h3 className="text-xl font-black text-[#7C3AED] mt-1">
                      {fmt(reportsData.totalPendingOverall)}
                    </h3>
                    <p className="text-[10px] font-extrabold text-slate-400 mt-2">
                      Outstanding collections
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-[#7C3AED]/10 flex items-center justify-center text-[#7C3AED] border border-[#7C3AED]/20 shadow-inner">
                    <IndianRupee className="h-5 w-5" />
                  </div>
                </Card>

                {/* 3. Target Revenue */}
                <Card className="flex items-center justify-between p-5 hover:shadow-card-lg transition-shadow">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Target Revenue</span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                      {fmt(reportsData.totalTargetOverall)}
                    </h3>
                    <p className="text-[10px] font-extrabold text-purple-500 mt-2">
                      FPC + College tuition target
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 border border-purple-500/20 shadow-inner">
                    <Users className="h-5 w-5" />
                  </div>
                </Card>

                {/* 4. Today's Revenue */}
                <Card className="flex items-center justify-between p-5 hover:shadow-card-lg transition-shadow">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Today's Revenue</span>
                    <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                      {fmt(reportsData.todayRevenue)}
                    </h3>
                    <p className="text-[10px] font-extrabold text-[#22c55e] mt-2 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Live collection speed
                    </p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner">
                    <Activity className="h-5 w-5" />
                  </div>
                </Card>

              </div>

              {/* Graphical Performance Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
                
                {/* SVG Curve Line Chart */}
                <div className="xl:col-span-5 bg-slate-900 text-white rounded-xl p-6 shadow-card flex flex-col justify-between border border-slate-800 min-h-[380px]">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">Payment Status</h3>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Paid vs Pending counts by institution</p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
                      <span className="flex items-center gap-1.5 text-[#4F46E5]">
                        <span className="h-2 w-2 rounded-full bg-[#4F46E5]" /> Paid
                      </span>
                      <span className="flex items-center gap-1.5 text-[#7C3AED]">
                        <span className="h-2 w-2 rounded-full bg-[#7C3AED]" /> Pending
                      </span>
                    </div>
                  </div>

                  <div className="relative w-full my-6 overflow-visible">
                    <svg viewBox="0 0 500 220" className="w-full h-auto overflow-visible">
                      <line x1="40" y1="30" x2="480" y2="30" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <line x1="40" y1="90" x2="480" y2="90" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                      <line x1="40" y1="150" x2="480" y2="150" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

                      <text x="30" y="34" textAnchor="end" className="text-[9px] font-bold fill-slate-500">{reportsData.maxStudentCount}</text>
                      <text x="30" y="94" textAnchor="end" className="text-[9px] font-bold fill-slate-500">{Math.round(reportsData.maxStudentCount / 2)}</text>
                      <text x="30" y="154" textAnchor="end" className="text-[9px] font-bold fill-slate-500">0</text>

                      {reportsData.paidLinePath && (
                        <path d={reportsData.paidLinePath} fill="none" stroke="#4F46E5" strokeWidth="3.5" strokeLinecap="round" />
                      )}
                      {reportsData.pendingLinePath && (
                        <path d={reportsData.pendingLinePath} fill="none" stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round" />
                      )}

                      {reportsData.paidPoints.map((pt, idx) => (
                        <g key={idx}>
                          <polygon points={`${pt.x},${pt.y - 4} ${pt.x + 4},${pt.y} ${pt.x},${pt.y + 4} ${pt.x - 4},${pt.y}`} fill="#4F46E5" stroke="#0f172a" strokeWidth="1.5" />
                          <text x={pt.x} y={pt.y - 8} textAnchor="middle" className="text-[9px] font-black fill-white">{pt.val}</text>
                        </g>
                      ))}

                      {reportsData.pendingPoints.map((pt, idx) => (
                        <g key={idx}>
                          <circle cx={pt.x} cy={pt.y} r="4" fill="#7C3AED" stroke="#0f172a" strokeWidth="1.5" />
                          <text x={pt.x} y={pt.y - 8} textAnchor="middle" className="text-[9px] font-black fill-white">{pt.val}</text>
                        </g>
                      ))}

                      {reportsData.collegesList.map((col, idx) => {
                        const N = reportsData.collegesList.length;
                        const x = N > 1 ? 40 + idx * (420 / (N - 1)) : 250;
                        const y = 185;
                        return (
                          <text key={col.id} x={x} y={y} textAnchor="middle" className="text-[9px] font-bold fill-slate-400">
                            {col.name.slice(0, 10)}…
                          </text>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Target vs Achieved Cards */}
                <div className="xl:col-span-3 flex flex-col justify-between gap-6 min-h-[380px]">
                  <Card className="flex-1 p-5 flex flex-col justify-between">
                    <div className="border-t border-b border-slate-200 dark:border-slate-800 py-1.5 text-center">
                      <h4 className="text-xs font-black italic tracking-widest text-[#4F46E5] uppercase">TARGET</h4>
                    </div>
                    
                    <div className="text-center space-y-1">
                      <div className="inline-block bg-[#4F46E5] text-white text-[9px] font-black px-4 py-1 rounded-sm uppercase tracking-wider">
                        Total College Fees
                      </div>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {fmt(reportsData.totalCollegeFeesTarget)}
                      </p>
                    </div>

                    <div className="text-center space-y-1">
                      <div className="inline-block bg-[#7C3AED] text-white text-[9px] font-black px-4 py-1 rounded-sm uppercase tracking-wider">
                        Total FPC Fees
                      </div>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {fmt(reportsData.totalFpcFeesTarget)}
                      </p>
                    </div>
                  </Card>

                  <Card className="flex-1 p-5 flex flex-col justify-between">
                    <div className="border-t border-b border-slate-200 dark:border-slate-800 py-1.5 text-center">
                      <h4 className="text-xs font-black italic tracking-widest text-[#4F46E5] uppercase">ACHIEVED</h4>
                    </div>
                    
                    <div className="text-center space-y-1">
                      <div className="inline-block bg-[#4F46E5] text-white text-[9px] font-black px-4 py-1 rounded-sm uppercase tracking-wider">
                        Total College Fees
                      </div>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {fmt(reportsData.totalCollegeFeesAchieved)}
                      </p>
                    </div>

                    <div className="text-center space-y-1">
                      <div className="inline-block bg-[#7C3AED] text-white text-[9px] font-black px-4 py-1 rounded-sm uppercase tracking-wider">
                        Total FPC Fees
                      </div>
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                        {fmt(reportsData.totalFpcFeesAchieved)}
                      </p>
                    </div>
                  </Card>
                </div>

                {/* Total Fees Horizontal Bar Chart */}
                <Card className="xl:col-span-4 p-6 flex flex-col justify-between min-h-[380px]">
                  <div className="text-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">Total Fees Breakdown</h3>
                    <div className="flex items-center justify-center gap-4 mt-2 text-[10px] font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 bg-[#4F46E5]" />
                        <span className="text-slate-500">College fees</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 bg-[#7C3AED]" />
                        <span className="text-slate-500">Fpc Fees</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 flex-1 flex flex-col justify-center">
                    {reportsData.collegesList.map((col) => {
                      const collegeWidth = reportsData.maxFeeAmount > 0 
                        ? Math.max((col.collegeFeesTarget / reportsData.maxFeeAmount) * 100, 4) 
                        : 4;
                      const fpcWidth = reportsData.maxFeeAmount > 0 
                        ? Math.max((col.fpcFeesTarget / reportsData.maxFeeAmount) * 100, 4) 
                        : 4;

                      return (
                        <div key={col.id} className="space-y-1.5 border-b border-slate-100/60 dark:border-slate-800/60 pb-2.5 last:border-0 last:pb-0">
                          <div className="text-[10px] font-black text-slate-800 dark:text-slate-200 leading-tight uppercase truncate" title={col.name}>
                            {col.name}
                          </div>
                          <div className="space-y-1 pl-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-3.5 bg-gradient-to-r from-[#4F46E5] to-[#FF6B6B] rounded-sm transition-all duration-500 shadow-2xs" 
                                style={{ width: `${collegeWidth * 0.7}%` }} 
                              />
                              <span className="text-[9px] font-extrabold text-[#4F46E5]">
                                {fmt(col.collegeFeesTarget)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div 
                                className="h-3.5 bg-gradient-to-r from-[#7C3AED] to-[#FFD166] rounded-sm transition-all duration-500 shadow-2xs" 
                                style={{ width: `${fpcWidth * 0.7}%` }} 
                              />
                              <span className="text-[9px] font-extrabold text-[#7C3AED]">
                                {fmt(col.fpcFeesTarget)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

              </div>

            </div>
          )}

          {/* ══════════════════ COLLEGES TAB ══════════════════ */}
          {activeTab === "colleges" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {collegeStats.map((col) => (
                  <Card key={col.id} className="overflow-hidden flex flex-col justify-between border border-slate-100/80 dark:border-slate-800/80 bg-white dark:bg-[#131317] hover:shadow-card-lg transition-all duration-300">
                    <div>
                      {/* Modern Top Header Card */}
                      <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                        <div className="flex items-center gap-3.5">
                          <div className="h-11 w-11 rounded-xl btn-gradient flex items-center justify-center text-white shadow-md">
                            <School className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-white">{col.name}</h3>
                            <div className="text-[10px] font-extrabold text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <Users className="h-3 w-3 text-[#7C3AED]" /> {col.totalStudents} Enrolled Students
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] bg-clip-text text-transparent">
                            {col.collectionRate}%
                          </span>
                          <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider">Collected</span>
                        </div>
                      </div>

                      {/* Clean Modern 3-Column Metric Grid */}
                      <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181820] text-center border border-slate-100 dark:border-slate-800/80">
                          <span className="text-[9px] font-black text-slate-400 uppercase block mb-1 tracking-wider">Target Fees</span>
                          <span className="text-sm font-black text-slate-800 dark:text-slate-200">{fmt(col.totalFees)}</span>
                        </div>
                        <div className="p-4 rounded-xl bg-[#4F46E5]/10 text-center border border-[#4F46E5]/20">
                          <span className="text-[9px] font-black text-[#4F46E5] uppercase block mb-1 tracking-wider">Collected</span>
                          <span className="text-sm font-black text-[#4F46E5]">{fmt(col.totalPaid)}</span>
                        </div>
                        <div className="p-4 rounded-xl bg-[#7C3AED]/10 text-center border border-[#7C3AED]/20">
                          <span className="text-[9px] font-black text-[#7C3AED] uppercase block mb-1 tracking-wider">Outstanding</span>
                          <span className="text-sm font-black text-[#7C3AED]">{fmt(col.outstanding)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Glowing Accent Progress Bar */}
                    <div className="px-6 pb-6 pt-0">
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                        <div
                          className="bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] h-full rounded-full transition-all duration-500 shadow-sm"
                          style={{ width: `${Math.min(col.collectionRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════ STUDENTS TAB ══════════════════ */}
          {activeTab === "students" && (
            <div className="space-y-6 animate-fadeIn">
              
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <ListFilter className="h-4 w-4 text-[#4F46E5]" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      Student Search &amp; Filters
                    </h3>
                  </div>
                  <Button
                    onClick={() => {
                      setSearchQuery("");
                      setFilterCollege("all");
                      setFilterDept("all");
                      setFilterYear("all");
                      setFilterFeeStatus("all");
                    }}
                    variant="link"
                    size="sm"
                    className="p-0 text-[#4F46E5] uppercase tracking-wider h-auto font-black"
                  >
                    Reset Filters
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Search name, Reg No, email"
                      placeholder="Search name, Reg No, email..."
                      className="pl-9 pr-8"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    value={filterCollege}
                    onChange={(e) => setFilterCollege(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-800 bg-sunken dark:bg-[#181820] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#4F46E5]/50 cursor-pointer"
                  >
                    <option value="all">All Colleges</option>
                    {data.colleges.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>

                  <select
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-800 bg-sunken dark:bg-[#181820] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#4F46E5]/50 cursor-pointer"
                  >
                    <option value="all">All Departments</option>
                    {uniqueDepartments.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>

                  {/* Clean Year-Wise Dropdown fetched dynamically from DB */}
                  <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-800 bg-sunken dark:bg-[#181820] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#4F46E5]/50 cursor-pointer"
                  >
                    <option value="all">All Academic Years</option>
                    {uniqueYears.map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>

                  <select
                    value={filterFeeStatus}
                    onChange={(e) => setFilterFeeStatus(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-800 bg-sunken dark:bg-[#181820] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-[#4F46E5]/50 cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 font-extrabold uppercase tracking-wider pt-1">
                  <span>Showing {filteredStudents.length} of {data.students.length} students</span>
                </div>
              </Card>

              {/* Student Cards */}
              <div className="space-y-4">
                {filteredStudents.length === 0 ? (
                  <Card className="p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-wider space-y-3">
                    <p>No students match the selected filters.</p>
                    <Button
                      onClick={() => {
                        setSearchQuery("");
                        setFilterCollege("all");
                        setFilterDept("all");
                        setFilterYear("all");
                        setFilterFeeStatus("all");
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Clear All Filters
                    </Button>
                  </Card>
                ) : (
                  <>
                    {paginatedStudents.map((student) => {
                      const studentFees = getStudentFees(student.id);
                      const totalFees = studentFees.reduce((sum, f) => sum + f.amount, 0);
                      const totalPaid = studentFees.reduce((sum, f) => sum + f.paid_amount, 0);
                      const overallStatus =
                        totalPaid >= totalFees && totalFees > 0 ? "paid"
                        : totalPaid > 0 ? "partial"
                        : "unpaid";
                      const isExpanded = expandedStudentId === student.id;

                      return (
                        <Card key={student.id} className="overflow-hidden hover:border-[#4F46E5]/40">
                          <button
                            onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                            className="w-full p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <div className="flex items-center gap-4 min-w-[260px]">
                              <div className="h-11 w-11 rounded-xl btn-gradient flex items-center justify-center font-black text-white text-sm shadow-md shrink-0">
                                {student.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                  <span>{student.name}</span>
                                  {student.register_number && (
                                    <Badge variant="default" className="font-mono text-[10px]">
                                      {student.register_number}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                  {student.department || "General"} · {student.year || "Year I"} · {getCollegeName(student.college_id)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-6 justify-between md:justify-end">
                              <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Fees</span>
                                <span className="text-xs font-black text-slate-800 dark:text-slate-200">{fmt(totalFees)}</span>
                              </div>

                              <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Paid</span>
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{fmt(totalPaid)}</span>
                              </div>

                              <div className="text-right min-w-[80px]">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Balance</span>
                                <span className={`text-xs font-black ${totalFees - totalPaid > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>
                                  {fmt(Math.max(totalFees - totalPaid, 0))}
                                </span>
                              </div>

                              <div>
                                <StatusBadge status={overallStatus} />
                              </div>

                              <div className="text-slate-400">
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </div>
                            </div>
                          </button>

                          {/* Expanded Student Fee Ledger Details */}
                          {isExpanded && (
                            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#181820]/50 space-y-4 animate-fadeIn">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                  <Receipt className="h-3.5 w-3.5 text-[#4F46E5]" />
                                  Semester Fee Breakdown &amp; Payment Links
                                </h4>
                                <Button
                                  onClick={() => setAddingStudentFeeId(student.id)}
                                  size="sm"
                                  className="h-7 text-xs font-black bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Semester Fee
                                </Button>
                              </div>

                              {/* Create New Fee Form */}
                              {addingStudentFeeId === student.id && (
                                <Card className="p-4 border-[#4F46E5]/30 bg-white dark:bg-[#131317] space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                    <span className="text-xs font-black text-[#4F46E5]">Add New Semester Fee Record</span>
                                    <button onClick={() => setAddingStudentFeeId(null)} aria-label="Close add fee form" className="text-slate-400 hover:text-slate-600">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-semibold">
                                    <div>
                                      <label className="text-[9px] text-slate-400 font-bold block mb-1">Term / Description</label>
                                      <Input
                                        value={newTermName}
                                        onChange={(e) => setNewTermName(e.target.value)}
                                        aria-label="Term / Description"
                                        placeholder="e.g. Semester 2 Fee"
                                        className="h-8 text-xs font-bold"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-slate-400 font-bold block mb-1">Target Amount (₹)</label>
                                      <Input
                                        type="number"
                                        value={newAmount}
                                        onChange={(e) => setNewAmount(e.target.value)}
                                        aria-label="Target Amount (₹)"
                                        placeholder="e.g. 25000"
                                        className="h-8 text-xs font-bold"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-slate-400 font-bold block mb-1">Paid Amount (₹)</label>
                                      <Input
                                        type="number"
                                        value={newPaidAmount}
                                        onChange={(e) => setNewPaidAmount(e.target.value)}
                                        aria-label="Paid Amount (₹)"
                                        className="h-8 text-xs font-bold"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[9px] text-slate-400 font-bold block mb-1">Status</label>
                                      <select
                                        aria-label="Status"
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value)}
                                        className="w-full h-8 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131317] text-xs font-bold"
                                      >
                                        <option value="paid">Paid</option>
                                        <option value="partial">Partial</option>
                                        <option value="unpaid">Unpaid</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[9px] text-slate-400 font-bold block mb-1">Online Payment Link / Proof URL (Optional)</label>
                                    <Input
                                      value={newProofLink}
                                      onChange={(e) => setNewProofLink(e.target.value)}
                                      aria-label="Online Payment Link / Proof URL (Optional)"
                                      placeholder="https://rzp.io/l/sample or https://drive.google.com/..."
                                      className="h-8 text-xs font-mono"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2 pt-1">
                                    <Button onClick={() => setAddingStudentFeeId(null)} variant="outline" size="sm">Cancel</Button>
                                    <Button
                                      onClick={() => handleCreateFee(student.id)}
                                      disabled={savingFeeId === student.id}
                                      size="sm"
                                      className="bg-[#4F46E5] hover:bg-[#4F46E5]/90 text-white"
                                    >
                                      {savingFeeId === student.id ? "Creating…" : "Save Record"}
                                    </Button>
                                  </div>
                                </Card>
                              )}

                              {studentFees.length === 0 ? (
                                <p className="text-xs text-slate-400 font-bold italic py-2">No fee records found for this student.</p>
                              ) : (
                                <div className="space-y-3">
                                  {studentFees.map((fee) => {
                                    const isEditingThis = editingFeeId === fee.id;
                                    return (
                                      <div key={fee.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-[#131317] space-y-3 shadow-card">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                          <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5] font-black text-xs">
                                              ₹
                                            </div>
                                            <div>
                                              <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">{fee.term_name}</span>
                                              <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                <span>Target: <strong className="text-slate-600 dark:text-slate-300 font-bold">{fmt(fee.amount)}</strong></span>
                                                <span>·</span>
                                                <span>Paid: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{fmt(fee.paid_amount)}</strong></span>
                                                <span>·</span>
                                                <span>Balance: <strong className="text-rose-600 dark:text-rose-400 font-bold">{fmt(Math.max(fee.amount - fee.paid_amount, 0))}</strong></span>
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-3 justify-between sm:justify-end">
                                            <StatusBadge status={fee.status} />

                                            {fee.pay_link && (
                                              <a
                                                href={fee.pay_link}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#4F46E5]/10 text-[#4F46E5] hover:bg-[#4F46E5]/20 flex items-center gap-1 transition-all"
                                              >
                                                <ExternalLink className="h-3 w-3" /> Pay Link
                                              </a>
                                            )}

                                            {!isEditingThis && (
                                              <div className="flex items-center gap-2">
                                                <Button
                                                  onClick={() => {
                                                    setEditingFeeId(fee.id);
                                                    setEditTermName(fee.term_name);
                                                    setEditTotalAmount(String(fee.amount));
                                                    setEditPaidAmount(String(fee.paid_amount));
                                                    setEditStatus(fee.status);
                                                    setEditProofLink(fee.payment_proof || fee.pay_link || "");
                                                  }}
                                                  variant="outline"
                                                  size="sm"
                                                  className="border-[#4F46E5]/20 text-[#4F46E5] hover:bg-[#4F46E5]/10"
                                                >
                                                  Edit Record
                                                </Button>
                                                <button
                                                  onClick={() => handleDeleteFee(fee.id)}
                                                  disabled={deletingFeeId === fee.id}
                                                  className="text-slate-400 hover:text-rose-500 p-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                  title="Delete Fee Record"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* Inline Fee Edit Form */}
                                        {isEditingThis && (
                                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-fadeIn">
                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-semibold">
                                              <div>
                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Term Name</label>
                                                <Input
                                                  value={editTermName}
                                                  onChange={(e) => setEditTermName(e.target.value)}
                                                  aria-label="Term Name"
                                                  className="h-8 text-xs font-bold"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Target Amount (₹)</label>
                                                <Input
                                                  type="number"
                                                  value={editTotalAmount}
                                                  onChange={(e) => setEditTotalAmount(e.target.value)}
                                                  aria-label="Target Amount (₹)"
                                                  className="h-8 text-xs font-bold"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Paid Amount (₹)</label>
                                                <Input
                                                  type="number"
                                                  value={editPaidAmount}
                                                  onChange={(e) => setEditPaidAmount(e.target.value)}
                                                  aria-label="Paid Amount (₹)"
                                                  className="h-8 text-xs font-bold"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-[9px] text-slate-400 font-bold block mb-1">Status</label>
                                                <select
                                                  aria-label="Status"
                                                  value={editStatus}
                                                  onChange={(e) => setEditStatus(e.target.value)}
                                                  className="w-full h-8 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131317] text-xs font-bold"
                                                >
                                                  <option value="paid">Paid</option>
                                                  <option value="partial">Partial</option>
                                                  <option value="unpaid">Unpaid</option>
                                                </select>
                                              </div>
                                            </div>
                                            <div>
                                              <label className="text-[9px] text-slate-400 font-bold block mb-1">Proof of Payment Link URL</label>
                                              <Input
                                                value={editProofLink}
                                                onChange={(e) => setEditProofLink(e.target.value)}
                                                aria-label="Proof of Payment Link URL"
                                                placeholder="https://drive.google.com/proof-receipt.pdf"
                                                className="h-8 text-xs font-mono"
                                              />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                              <Button onClick={() => setEditingFeeId(null)} variant="outline" size="sm">Cancel</Button>
                                              <Button
                                                onClick={() => handleUpdateFeeStatus(fee.id, student.id)}
                                                disabled={savingFeeId === fee.id}
                                                size="sm"
                                              >
                                                {savingFeeId === fee.id ? "Saving…" : "Save Changes"}
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}

                    <Pagination
                      currentPage={studentsPage}
                      totalItems={filteredStudents.length}
                      pageSize={studentsPageSize}
                      onPageChange={setStudentsPage}
                      onPageSizeChange={setStudentsPageSize}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════ TRANSACTIONS TAB ══════════════════ */}
          {activeTab === "transactions" && (
            <div className="space-y-6 animate-fadeIn">
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Receipt No</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>College</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Reference No</TableHead>
                      <TableHead className="pr-6">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedPayments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="pl-6 font-mono text-[#4F46E5] font-extrabold">{p.receipt_no}</TableCell>
                        <TableCell>
                          <span className="font-extrabold text-slate-800 dark:text-slate-200 block">{getStudentName(p.student_id)}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.student_id}</span>
                        </TableCell>
                        <TableCell className="text-slate-500 font-medium text-[11px] max-w-[200px] truncate">
                          {getCollegeName(p.college_id)}
                        </TableCell>
                        <TableCell className="font-black text-slate-900 dark:text-slate-100">{fmt(p.amount)}</TableCell>
                        <TableCell><MethodBadge method={p.payment_method} /></TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-400">{p.reference_no}</TableCell>
                        <TableCell className="pr-6 text-slate-500">
                          {new Date(p.payment_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredPayments.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                    No payment transactions found.
                  </div>
                ) : (
                  <Pagination
                    currentPage={paymentsPage}
                    totalItems={filteredPayments.length}
                    pageSize={paymentsPageSize}
                    onPageChange={setPaymentsPage}
                    onPageSizeChange={setPaymentsPageSize}
                  />
                )}
              </Card>
            </div>
          )}

        </div>

        {/* Excel Upload Modal using shadcn Dialog */}
        <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
          <DialogHeader>
            <DialogTitle>
              <Upload className="h-4 w-4 text-[#4F46E5]" />
              <span>Bulk Upload Student Fee Excel Sheet</span>
            </DialogTitle>
            <DialogDescription>
              Upload fee structure file to match and update student ledgers automatically.
            </DialogDescription>
          </DialogHeader>

          {uploadError && (
            <div role="alert" className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl flex items-center gap-3 text-xs text-rose-600 dark:text-rose-400 font-semibold">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{uploadError}</p>
            </div>
          )}

          {uploadResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-center">
                <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">{uploadResult.message}</p>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="p-3 bg-white dark:bg-[#181820] rounded-xl border border-emerald-500/20">
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 block">{uploadResult.processedCount}</span>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Processed Records</span>
                  </div>
                  <div className="p-3 bg-white dark:bg-[#181820] rounded-xl border border-amber-500/20">
                    <span className="text-2xl font-black text-[#7C3AED] block">{uploadResult.skippedCount}</span>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Skipped Rows</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadResult(null);
                    setUploadStep(1);
                    setColIndices({});
                    setSheetHeaders([]);
                    setSheetRows([]);
                  }}
                  variant="default"
                >
                  Close &amp; Finish
                </Button>
              </div>
            </div>
          ) : uploadStep === 1 ? (
            <div className="space-y-5 text-xs font-semibold">
              <div className="p-4 rounded-xl bg-[#4F46E5]/5 border border-[#4F46E5]/20 space-y-3">
                <div className="flex justify-between items-center border-b border-[#4F46E5]/10 pb-2">
                  <span className="text-[10px] font-black text-[#4F46E5] uppercase tracking-wider">Download Pre-filled Excel Template</span>
                  <span className="text-[9px] text-slate-400 font-bold">Auto-fills student names &amp; registration numbers</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div>
                    <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">College</label>
                    <select
                      aria-label="College"
                      value={selectedTemplateCollege}
                      onChange={(e) => setSelectedTemplateCollege(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181820] font-bold outline-none focus:ring-1 focus:ring-[#4F46E5] cursor-pointer"
                    >
                      {availableColleges.map((colName) => (
                        <option key={colName} value={colName}>{colName}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Department</label>
                    <select
                      aria-label="Department"
                      value={selectedTemplateDept}
                      onChange={(e) => setSelectedTemplateDept(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#181820] font-bold outline-none focus:ring-1 focus:ring-[#4F46E5] cursor-pointer"
                    >
                      {availableDepartments.map((dept) => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    onClick={handleDownloadTemplate}
                    variant="outline"
                    size="sm"
                    className="border-[#4F46E5]/20 text-[#4F46E5] hover:bg-[#4F46E5]/10"
                  >
                    <Download className="h-3.5 w-3.5" /> Download (.xlsx)
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Excel File Upload</label>
                <div className="border-2 border-dashed border-slate-200 inset-shadow-well dark:border-slate-800 hover:border-[#4F46E5] rounded-xl p-8 text-center bg-sunken/50 dark:bg-[#181820]/50 relative cursor-pointer group transition-colors">
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    aria-label="Excel File Upload"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="h-8 w-8 mx-auto text-slate-400 group-hover:text-[#4F46E5] transition-colors mb-2" />
                  <p className="text-[#4F46E5] dark:text-[#818CF8] font-extrabold text-xs">Drag &amp; Drop Excel file here or click to browse</p>
                  <p className="text-slate-400 font-medium text-[9px] mt-1">Formats: .xlsx, .xls, .csv</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs font-semibold">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#181820] border border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-[#4F46E5] uppercase tracking-wider">Excel Field Mapping</span>
                  <span className="text-[9px] text-slate-400 font-bold">Auto-matched columns</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                  {[
                    { key: "register_number", label: "Registration Number" },
                    { key: "college", label: "College Name" },
                    { key: "student", label: "Student Name" },
                    { key: "year", label: "Year" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Mobile Number" },
                    { key: "t", label: "Department" },
                    { key: "semester", label: "Semester" },
                    { key: "paid", label: "FPC FEES PAID" },
                    { key: "pending", label: "FPC FEES PENDING" },
                    { key: "amount", label: "Amount" },
                  ].map(({ key, label }) => {
                    const selectedIdx = colIndices[key] !== undefined ? colIndices[key] : -1;
                    return (
                      <div key={key} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-500 font-bold">{label}</span>
                        <select
                          value={selectedIdx}
                          onChange={(e) => handleMappingChange(key, Number(e.target.value))}
                          className="px-2 py-0.5 rounded bg-white dark:bg-[#131317] border border-slate-200 dark:border-slate-800 text-[10px] outline-none font-bold max-w-[130px] truncate"
                        >
                          <option value={-1}>— Skip —</option>
                          {sheetHeaders.map((h, idx) => (
                            <option key={idx} value={idx}>{h}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase">
                <span>Parsed Records: {parsedData.length}</span>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => {
                    setUploadStep(1);
                    setParsedData([]);
                    setColIndices({});
                    setSheetHeaders([]);
                    setSheetRows([]);
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={uploading}
                  onClick={handleBulkUpload}
                  variant="default"
                  className="flex-1"
                >
                  {uploading ? "Uploading…" : `Upload ${parsedData.length} Records`}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </main>
    </div>
  );
};
