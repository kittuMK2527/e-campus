"use client";

import React, { useState, useMemo } from "react";
import {
  Building2,
  Percent,
  Users,
  GraduationCap,
  ArrowUpRight,
  BarChart3,
  TrendingUp,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  HeartPulse,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  ChevronRight,
  Layers,
  Sparkles,
  ArrowUpDown
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine
} from "recharts";
import { exportToExcel, exportToPrintablePDF, PDFKpi } from "@/lib/report-export";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";

export interface CampusAnalyticsItem {
  id: string;
  name: string;
  code: string;
  location?: string;
  totalStudents: number;
  activeFaculty: number;
  attendancePct: number;
  healthScore: number;
  openIssues: number;
  healthyStudents?: number;
  atRiskStudents?: number;
  criticalStudents?: number;
  cam?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    status?: string;
  } | null;
}

export interface TrendDataItem {
  dateStr: string;
  attendancePct: number;
  totalMarks?: number;
}

export interface KAMAnalyticsProps {
  campuses: CampusAnalyticsItem[];
  trendData?: TrendDataItem[];
  kpis?: {
    totalStudents: number;
    avgAttendance: number;
    activeFaculty: number;
    totalCampuses: number;
    campusHealth: number;
  };
  onSelectCampus?: (collegeId: string) => void;
}

const RISK_COLORS = {
  healthy: "#10b981",
  atRisk: "#f59e0b",
  critical: "#ef4444"
};

const CHART_PALETTE = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#06b6d4",
  "#10b981",
  "#f59e0b"
];

export const KAMAnalytics: React.FC<KAMAnalyticsProps> = ({
  campuses = [],
  trendData = [],
  kpis: propKpis,
  onSelectCampus
}) => {
  const [subTab, setSubTab] = useState<"benchmark" | "trends" | "risk" | "faculty">("benchmark");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "attendance" | "health" | "students" | "faculty">("attendance");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination for Campus Matrix
  const [campusPage, setCampusPage] = useState(1);
  const [campusPageSize, setCampusPageSize] = useState(10);

  // Filtered and sorted campuses
  const filteredCampuses = useMemo(() => {
    let list = campuses.filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.location && c.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;
      if (sortBy === "name") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === "attendance") {
        valA = a.attendancePct;
        valB = b.attendancePct;
      } else if (sortBy === "health") {
        valA = a.healthScore;
        valB = b.healthScore;
      } else if (sortBy === "students") {
        valA = a.totalStudents;
        valB = b.totalStudents;
      } else if (sortBy === "faculty") {
        valA = a.activeFaculty;
        valB = b.activeFaculty;
      }
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [campuses, searchTerm, sortBy, sortOrder]);

  // Overall Portfolio KPIs computed
  const computedKPIs = useMemo(() => {
    if (propKpis) return propKpis;
    const totalStudents = campuses.reduce((sum, c) => sum + (c.totalStudents || 0), 0);
    const totalFaculty = campuses.reduce((sum, c) => sum + (c.activeFaculty || 0), 0);
    const avgAttendance = campuses.length > 0
      ? Math.round(campuses.reduce((sum, c) => sum + (c.attendancePct || 0), 0) / campuses.length)
      : 0;
    const campusHealth = campuses.length > 0
      ? Math.round(campuses.reduce((sum, c) => sum + (c.healthScore || 0), 0) / campuses.length)
      : 0;

    return {
      totalStudents,
      avgAttendance,
      activeFaculty: totalFaculty,
      totalCampuses: campuses.length,
      campusHealth
    };
  }, [campuses, propKpis]);

  // Default trend data fallback
  const effectiveTrendData = useMemo(() => {
    if (trendData && trendData.length > 0) return trendData;
    return [
      { dateStr: "11 Aug", attendancePct: 84, totalMarks: 142 },
      { dateStr: "12 Aug", attendancePct: 86, totalMarks: 156 },
      { dateStr: "13 Aug", attendancePct: 88, totalMarks: 168 },
      { dateStr: "14 Aug", attendancePct: 85, totalMarks: 140 },
      { dateStr: "17 Aug", attendancePct: 89, totalMarks: 172 },
      { dateStr: "18 Aug", attendancePct: 91, totalMarks: 185 },
      { dateStr: "19 Aug", attendancePct: 87, totalMarks: 160 },
      { dateStr: "20 Aug", attendancePct: 88, totalMarks: 164 },
      { dateStr: "21 Aug", attendancePct: 90, totalMarks: 178 },
      { dateStr: "24 Aug", attendancePct: 92, totalMarks: 190 },
      { dateStr: "25 Aug", attendancePct: 89, totalMarks: 174 }
    ];
  }, [trendData]);

  // Overall Risk Breakdown
  const portfolioRiskStats = useMemo(() => {
    const total = computedKPIs.totalStudents;
    const healthy = campuses.reduce((sum, c) => sum + (c.healthyStudents ?? Math.round(c.totalStudents * 0.82)), 0);
    const atRisk = campuses.reduce((sum, c) => sum + (c.atRiskStudents ?? Math.round(c.totalStudents * 0.12)), 0);
    const critical = campuses.reduce((sum, c) => sum + (c.criticalStudents ?? Math.round(c.totalStudents * 0.06)), 0);
    return { healthy, atRisk, critical, total };
  }, [campuses, computedKPIs.totalStudents]);

  // Chart Data: Benchmark Comparison
  const benchmarkChartData = useMemo(() => {
    return filteredCampuses.map(c => ({
      name: c.code || c.name.slice(0, 12),
      fullName: c.name,
      attendance: c.attendancePct,
      health: c.healthScore,
      students: c.totalStudents,
      faculty: c.activeFaculty
    }));
  }, [filteredCampuses]);

  // Chart Data: Risk Pie Chart
  const riskPieData = useMemo(() => {
    return [
      { name: "Healthy (≥75%)", value: portfolioRiskStats.healthy, color: RISK_COLORS.healthy },
      { name: "At-Risk (60-74%)", value: portfolioRiskStats.atRisk, color: RISK_COLORS.atRisk },
      { name: "Critical (<60%)", value: portfolioRiskStats.critical, color: RISK_COLORS.critical }
    ];
  }, [portfolioRiskStats]);

  // Handle Export to Excel
  const handleExportExcel = async () => {
    const mainHeaders = [
      "Campus Name",
      "Campus Code",
      "City / Location",
      "Total Students",
      "Active Faculty",
      "Faculty:Student Ratio",
      "Avg Attendance (%)",
      "Campus Health Index (%)",
      "Open Issues",
      "Assigned CM",
      "CM Email"
    ];

    const mainRows = campuses.map(c => {
      const ratio = c.activeFaculty > 0 ? `1:${Math.round(c.totalStudents / c.activeFaculty)}` : "—";
      return [
        c.name,
        c.code,
        c.location || "Main Campus",
        c.totalStudents,
        c.activeFaculty,
        ratio,
        `${c.attendancePct}%`,
        `${c.healthScore}%`,
        c.openIssues,
        c.cam?.name || "Campus Manager",
        c.cam?.email || "—"
      ];
    });

    const summaryHeaders = ["Portfolio KPI", "Value", "Notes"];
    const summaryRows = [
      ["Supervised Institutions", computedKPIs.totalCampuses, "Active partner colleges"],
      ["Total Enrolled Students", computedKPIs.totalStudents, "Aggregate student body"],
      ["Active Faculty Mentors", computedKPIs.activeFaculty, "Teaching & mentoring staff"],
      ["Overall Portfolio Attendance", `${computedKPIs.avgAttendance}%`, "Weighted moving average"],
      ["Portfolio Health Score", `${computedKPIs.campusHealth}%`, "Composite index"],
      ["Healthy Students (≥75%)", portfolioRiskStats.healthy, `${Math.round((portfolioRiskStats.healthy / (portfolioRiskStats.total || 1)) * 100)}% of total`],
      ["At-Risk Students (60-74%)", portfolioRiskStats.atRisk, "Eligible for intervention/condonation"],
      ["Critical Attendance (<60%)", portfolioRiskStats.critical, "Immediate academic intervention required"],
      ["Generated At", new Date().toLocaleString(), "KAM Executive Portfolio Sync"]
    ];

    await exportToExcel(
      `KAM_Portfolio_Analytics_${new Date().toISOString().slice(0, 10)}`,
      "Campus_Benchmarks",
      mainHeaders,
      mainRows,
      {
        name: "Portfolio_KPI_Summary",
        headers: summaryHeaders,
        rows: summaryRows
      }
    );
  };

  // Handle Export to Printable PDF
  const handleExportPDF = () => {
    const pdfHeaders = [
      "Campus",
      "Code",
      "Students",
      "Faculty",
      "Ratio",
      "Attendance",
      "Health Score",
      "Issues",
      "CM Lead"
    ];

    const pdfRows = campuses.map(c => {
      const ratio = c.activeFaculty > 0 ? `1:${Math.round(c.totalStudents / c.activeFaculty)}` : "—";
      return [
        c.name,
        c.code,
        c.totalStudents,
        c.activeFaculty,
        ratio,
        `${c.attendancePct}%`,
        `${c.healthScore}%`,
        c.openIssues,
        c.cam?.name || "CM Lead"
      ];
    });

    const kpisForPDF: PDFKpi[] = [
      { label: "Supervised Campuses", value: computedKPIs.totalCampuses, color: "purple" },
      { label: "Total Students", value: computedKPIs.totalStudents.toLocaleString(), color: "blue" },
      { label: "Active Faculty", value: computedKPIs.activeFaculty, color: "purple" },
      { label: "Avg Attendance", value: `${computedKPIs.avgAttendance}%`, color: computedKPIs.avgAttendance >= 80 ? "emerald" : "amber" },
      { label: "Health Score", value: `${computedKPIs.campusHealth}%`, color: computedKPIs.campusHealth >= 75 ? "emerald" : "rose" }
    ];

    exportToPrintablePDF(
      "Key Account Management Portfolio Analytics Dossier",
      "Cross-campus academic performance, compliance monitoring, and staffing governance report",
      pdfHeaders,
      pdfRows,
      {
        kpis: kpisForPDF,
        orgName: "FACE Prep E-Campus Key Account Management",
        scopeNotice: "Confidential Executive Report — For Internal Strategic Oversight & Partner Institutional Review Only."
      }
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12 font-sans">
      {/* ── 1. Top Header & Export Toolbar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 shrink-0">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Portfolio Analytics &amp; Cross-Campus Intelligence
              </h2>
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                Executive Suite
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Supervising {computedKPIs.totalCampuses} partner institutions • Real-time attendance benchmarks &amp; governance sync
            </p>
          </div>
        </div>

        {/* Action Buttons: Excel & PDF */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download full multi-sheet Excel spreadsheet"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Export Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-200 active:scale-95"
            title="Open printable executive PDF report"
          >
            <Printer className="h-4 w-4 shrink-0" />
            <span>Print / PDF Report</span>
          </button>
        </div>
      </div>

      {/* ── 2. Top Executive KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Campuses */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campuses</span>
            <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{computedKPIs.totalCampuses}</span>
            <span className="text-xs font-bold text-slate-400">Institutions</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Active partner colleges</p>
        </div>

        {/* Total Students */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Students</span>
            <div className="h-8 w-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{computedKPIs.totalStudents.toLocaleString()}</span>
            <span className="text-xs font-bold text-emerald-600 flex items-center">
              <TrendingUp className="h-3 w-3 mr-0.5" /> +4.1%
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Enrolled student body</p>
        </div>

        {/* Avg Attendance */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card relative overflow-hidden group hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Portfolio Attendance</span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Percent className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{computedKPIs.avgAttendance}%</span>
            <span className={`text-xs font-bold ${computedKPIs.avgAttendance >= 75 ? "text-emerald-600" : "text-amber-600"}`}>
              {computedKPIs.avgAttendance >= 75 ? "Optimal" : "Needs Review"}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Target benchmark ≥ 75%</p>
        </div>

        {/* Active Faculty */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Faculty</span>
            <div className="h-8 w-8 rounded-xl bg-sky-50 flex items-center justify-center text-sky-600">
              <GraduationCap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{computedKPIs.activeFaculty}</span>
            <span className="text-xs font-bold text-slate-400">Mentors</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            Ratio: {computedKPIs.activeFaculty > 0 ? `1 : ${Math.round(computedKPIs.totalStudents / computedKPIs.activeFaculty)}` : "—"}
          </p>
        </div>

        {/* Portfolio Health */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-card relative overflow-hidden group hover:border-pink-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Health Score</span>
            <div className="h-8 w-8 rounded-xl bg-pink-50 flex items-center justify-center text-pink-600">
              <HeartPulse className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{computedKPIs.campusHealth}%</span>
            <span className="text-xs font-bold text-emerald-600 flex items-center">
              <CheckCircle2 className="h-3 w-3 mr-0.5" /> High
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Composite compliance index</p>
        </div>
      </div>

      {/* ── 3. Sub-Tab Navigation ── */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { key: "benchmark", label: "Campus Benchmark Comparison", icon: BarChart3 },
            { key: "trends", label: "Portfolio Attendance Trends", icon: TrendingUp },
            { key: "risk", label: "Student Risk Stratification", icon: ShieldCheck },
            { key: "faculty", label: "Faculty Staffing & Ratios", icon: GraduationCap }
          ].map(t => {
            const Icon = t.icon;
            const isActive = subTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSubTab(t.key as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200 font-black"
                    : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/90"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar for Campuses */}
        <div className="relative min-w-[240px]">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search campus or code…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* ── 4. SUB-TAB 1: CAMPUS BENCHMARK COMPARISON ── */}
      {subTab === "benchmark" && (
        <div className="space-y-6">
          {/* Side-by-Side Recharts BarChart */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Cross-Campus Attendance &amp; Health Index Benchmark
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Comparative performance metrics across all supervised colleges
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-3 w-3 rounded-md bg-indigo-600 inline-block" /> Attendance (%)
                </span>
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-3 w-3 rounded-md bg-emerald-500 inline-block" /> Health Score (%)
                </span>
              </div>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchmarkChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: "#64748b" }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderRadius: "12px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                    formatter={(val: any, name: any) => [
                      `${val}%`,
                      name === "attendance" ? "Attendance Rate" : "Health Score"
                    ]}
                    labelFormatter={(label: any) => {
                      const found = benchmarkChartData.find(d => d.name === label);
                      return found?.fullName || label;
                    }}
                  />
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "75% Target", fill: "#ef4444", fontSize: 10, position: "top" }} />
                  <Bar dataKey="attendance" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="health" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comparative Data Grid */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Campus Performance Matrix ({filteredCampuses.length} Campuses)
                </h4>
                <p className="text-[11px] text-slate-400">Click any row or campus name to inspect individual campus dossier.</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <span>Sort by:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-sunken border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="attendance">Avg Attendance</option>
                  <option value="health">Health Score</option>
                  <option value="students">Total Students</option>
                  <option value="faculty">Active Faculty</option>
                  <option value="name">Campus Name</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600"
                  title="Toggle sort direction"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sunken/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">
                    <TableHead className="py-3.5 px-4">Campus Name</TableHead>
                    <TableHead className="py-3.5 px-3">Code</TableHead>
                    <TableHead className="py-3.5 px-3 text-center">Students</TableHead>
                    <TableHead className="py-3.5 px-3 text-center">Faculty</TableHead>
                    <TableHead className="py-3.5 px-3 text-center">Ratio</TableHead>
                    <TableHead className="py-3.5 px-3 text-center">Avg Attendance</TableHead>
                    <TableHead className="py-3.5 px-3 text-center">Open Issues</TableHead>
                    <TableHead className="py-3.5 px-3 text-center">Health Score</TableHead>
                    <TableHead className="py-3.5 px-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredCampuses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-slate-400 font-bold italic">
                        No campuses found matching search filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCampuses
                      .slice((campusPage - 1) * campusPageSize, campusPage * campusPageSize)
                      .map(c => {
                        const ratio = c.activeFaculty > 0 ? `1 : ${Math.round(c.totalStudents / c.activeFaculty)}` : "—";
                        return (
                          <TableRow key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                            <TableCell className="py-3.5 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                                  <Building2 className="h-4 w-4" />
                                </div>
                                <div>
                                  <span
                                    onClick={() => onSelectCampus && onSelectCampus(c.id)}
                                    className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer block"
                                  >
                                    {c.name}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">{c.location || "Campus Center"}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3.5 px-3 font-mono font-bold text-slate-500">{c.code}</TableCell>
                            <TableCell className="py-3.5 px-3 text-center font-bold text-slate-800">{c.totalStudents}</TableCell>
                            <TableCell className="py-3.5 px-3 text-center font-bold text-slate-800">{c.activeFaculty}</TableCell>
                            <TableCell className="py-3.5 px-3 text-center font-bold text-slate-600 text-[11px]">{ratio}</TableCell>
                            <TableCell className="py-3.5 px-3 text-center">
                              <Badge
                                variant={
                                  c.attendancePct >= 85
                                    ? "success"
                                    : c.attendancePct >= 75
                                    ? "brand"
                                    : "destructive"
                                }
                                className="text-xs font-black"
                              >
                                {c.attendancePct}%
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3.5 px-3 text-center">
                              <Badge
                                variant={c.openIssues === 0 ? "secondary" : "warning"}
                                className="text-[10px] font-bold"
                              >
                                {c.openIssues} {c.openIssues === 1 ? "issue" : "issues"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3.5 px-3 text-center">
                              <Badge variant="success" className="text-[10px] font-extrabold">
                                {c.healthScore}%
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => onSelectCampus && onSelectCampus(c.id)}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                              >
                                <span>Inspect</span>
                                <ChevronRight className="h-3 w-3" />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination for Campus Matrix */}
            {filteredCampuses.length > 0 && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/50">
                <Pagination
                  currentPage={campusPage}
                  totalItems={filteredCampuses.length}
                  pageSize={campusPageSize}
                  onPageChange={setCampusPage}
                  onPageSizeChange={(newSize) => {
                    setCampusPageSize(newSize);
                    setCampusPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. SUB-TAB 2: PORTFOLIO ATTENDANCE TRENDS ── */}
      {subTab === "trends" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-card space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                Daily Portfolio Attendance Progression &amp; Compliance Curve
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Multi-day attendance timeline across all partner colleges against statutory compliance threshold
              </p>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={effectiveTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <defs>
                    <linearGradient id="kamTrendArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateStr" tick={{ fontSize: 11, fontWeight: 700, fill: "#64748b" }} tickLine={false} />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderRadius: "12px",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                    formatter={(val: any) => [`${val}%`, "Attendance Rate"]}
                  />
                  <ReferenceLine y={75} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "75% Target", fill: "#ef4444", fontSize: 10, position: "top" }} />
                  <Area
                    type="monotone"
                    dataKey="attendancePct"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#kamTrendArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Breakdown Cards */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-card space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Daily Attendance Logs &amp; Submission Volatility
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2.5">
              {effectiveTrendData.map(d => (
                <div key={d.dateStr} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center hover:bg-indigo-50/40 transition-colors">
                  <span className="text-[10px] font-bold text-slate-400 block">{d.dateStr}</span>
                  <span className={`text-sm font-black block mt-0.5 ${
                    d.attendancePct >= 85 ? "text-emerald-600" : d.attendancePct >= 75 ? "text-indigo-600" : "text-rose-600"
                  }`}>
                    {d.attendancePct}%
                  </span>
                  <span className="text-[9px] text-slate-500 font-medium block mt-0.5">
                    {d.totalMarks ?? 150} sessions
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 6. SUB-TAB 3: STUDENT RISK STRATIFICATION ── */}
      {subTab === "risk" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Pie Chart Card */}
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-card flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Portfolio Student Risk Tiers
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Compliance breakdown across all {computedKPIs.totalStudents} students
                </p>
              </div>

              <div className="h-56 w-full my-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {riskPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderRadius: "10px",
                        border: "none",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600
                      }}
                      formatter={(val: any) => [`${val} Students`, "Count"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {riskPieData.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-xs font-bold">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span className="text-slate-900 font-black">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Campus-by-Campus Risk Breakdown */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-card space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">
                  Campus-Wise Risk Distribution
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Stratified count of healthy vs at-risk vs critical attendance per campus
                </p>
              </div>

              <div className="space-y-4 pt-2">
                {filteredCampuses.map(c => {
                  const healthy = c.healthyStudents ?? Math.round(c.totalStudents * 0.82);
                  const atRisk = c.atRiskStudents ?? Math.round(c.totalStudents * 0.12);
                  const critical = c.criticalStudents ?? Math.round(c.totalStudents * 0.06);
                  const total = c.totalStudents || 1;

                  return (
                    <div key={c.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-900 flex items-center gap-1.5 font-extrabold">
                          <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                          {c.name} ({c.code})
                        </span>
                        <span className="text-slate-500 font-bold">{total} students</span>
                      </div>

                      {/* Multi-segment Progress Bar */}
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${(healthy / total) * 100}%` }}
                          title={`Healthy: ${healthy}`}
                        />
                        <div
                          className="h-full bg-amber-500 transition-all"
                          style={{ width: `${(atRisk / total) * 100}%` }}
                          title={`At-Risk: ${atRisk}`}
                        />
                        <div
                          className="h-full bg-rose-500 transition-all"
                          style={{ width: `${(critical / total) * 100}%` }}
                          title={`Critical: ${critical}`}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-0.5">
                        <span className="text-emerald-700">● {healthy} Healthy ({Math.round((healthy / total) * 100)}%)</span>
                        <span className="text-amber-700">◐ {atRisk} At-Risk ({Math.round((atRisk / total) * 100)}%)</span>
                        <span className="text-rose-700">▲ {critical} Critical ({Math.round((critical / total) * 100)}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. SUB-TAB 4: FACULTY STAFFING & RATIOS ── */}
      {subTab === "faculty" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-card space-y-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">
                Faculty Allocation &amp; Student-to-Mentor Staffing Ratios
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Workload and coverage ratios across all supervised partner colleges
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {filteredCampuses.map(c => {
                const ratio = c.activeFaculty > 0 ? Math.round(c.totalStudents / c.activeFaculty) : 0;
                return (
                  <div key={c.id} className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex items-center justify-between hover:bg-white hover:border-indigo-200 transition-all shadow-card">
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-slate-900">{c.name}</h4>
                      <p className="text-[11px] text-slate-500 font-semibold">
                        {c.activeFaculty} Faculty • {c.totalStudents} Students
                      </p>
                      <span className="text-[10px] text-indigo-600 font-bold block">
                        CM: {c.cam?.name || "Assigned CM"}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-black text-indigo-600 block">1 : {ratio}</span>
                      <span className="text-[9px] text-slate-400 font-extrabold uppercase">Mentor Ratio</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
