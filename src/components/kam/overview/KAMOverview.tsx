"use client";

import React from "react";
import {
  Users,
  GraduationCap,
  Percent,
  AlertTriangle,
  HeartPulse,
  Building2,
  ChevronRight,
  TrendingUp,
  Mail,
  Phone,
  ArrowUpRight
} from "lucide-react";
import { KAMKpiCard } from "../shared/KAMKpiCard";

interface CampusCard {
  id: string;
  name: string;
  code: string;
  location: string;
  totalStudents: number;
  activeFaculty: number;
  attendancePct: number;
  openIssues: number;
  healthScore: number;
  cam: {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
  } | null;
}

interface KAMOverviewProps {
  kpis: {
    totalStudents: number;
    avgAttendance: number | null | string;
    activeFaculty: number;
    totalCampuses: number;
    campusHealth: number;
  };
  campuses: CampusCard[];
  trendData: Array<{ dateStr: string; attendancePct: number }>;
  riskStats: { healthy: number; atRisk: number; critical: number; total: number };
  onSelectCampus: (collegeId: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const KAMOverview: React.FC<KAMOverviewProps> = ({
  kpis,
  campuses,
  trendData,
  riskStats,
  onSelectCampus,
  onNavigateTab
}) => {
  // Compute SVG Area Path for Trend Line
  const renderTrendSVG = () => {
    if (!trendData || trendData.length === 0) return null;
    const width = 600;
    const height = 160;
    const padding = 20;

    const minVal = 50;
    const maxVal = 100;

    const points = trendData.map((d, i) => {
      const x = padding + (i / (trendData.length - 1 || 1)) * (width - 2 * padding);
      const y = height - padding - ((Math.min(100, Math.max(minVal, d.attendancePct)) - minVal) / (maxVal - minVal)) * (height - 2 * padding);
      return { x, y, ...d };
    });

    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");
    const areaD = `${pathD} L ${points[points.length - 1]?.x || width} ${height} L ${points[0]?.x || 0} ${height} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 overflow-visible">
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F172A" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#0F172A" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* Horizontal Grid lines */}
        {[60, 75, 90, 100].map(val => {
          const y = height - padding - ((val - minVal) / (maxVal - minVal)) * (height - 2 * padding);
          return (
            <g key={val}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={padding - 5} y={y + 3} textAnchor="end" className="text-[9px] fill-slate-400 font-bold">
                {val}%
              </text>
            </g>
          );
        })}
        {/* Area fill & line */}
        <path d={areaD} fill="url(#trendGrad)" />
        <path d={pathD} fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            className="fill-slate-900 hover:r-4 transition-all cursor-pointer"
          >
            <title>{`${p.dateStr}: ${p.attendancePct}% Attendance`}</title>
          </circle>
        ))}
      </svg>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Top Clean Executive KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KAMKpiCard
          label="Total Students"
          value={kpis.totalStudents.toLocaleString()}
          badge={{ text: "+3.2%", type: "positive" }}
          icon={Users}
          accentColor="indigo"
        />
        <KAMKpiCard
          label="Avg Attendance"
          value={kpis.avgAttendance !== null && kpis.avgAttendance !== undefined ? `${kpis.avgAttendance}%` : "—"}
          badge={{ text: "Optimal", type: "positive" }}
          icon={Percent}
          accentColor="emerald"
        />
        <KAMKpiCard
          label="Faculty Deployed"
          value={kpis.activeFaculty}
          badge={{ text: "100%", type: "positive" }}
          icon={GraduationCap}
          accentColor="zinc"
        />
        <KAMKpiCard
          label="At Risk Students"
          value={riskStats.atRisk + riskStats.critical}
          badge={{ text: `${riskStats.critical} Critical`, type: riskStats.critical > 0 ? "negative" : "warning" }}
          icon={AlertTriangle}
          accentColor="rose"
        />
        <KAMKpiCard
          label="Portfolio Health"
          value={`${kpis.campusHealth}%`}
          badge={{ text: "Grade A", type: "positive" }}
          icon={HeartPulse}
          accentColor="amber"
        />
      </div>

      {/* ── 2. Middle Row: Attendance Trend + Risk Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-100 shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight">Portfolio Attendance Trend (30-Day Moving Average)</h3>
              <p className="text-xs font-medium text-slate-400">Daily student presence rate across all active campuses</p>
            </div>
            <button
              onClick={() => onNavigateTab("attendance")}
              className="text-xs font-bold text-slate-800 hover:text-slate-950 flex items-center gap-1"
            >
              Deep View <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="pt-2">
            {renderTrendSVG() || (
              <div className="h-40 flex items-center justify-center text-xs text-slate-400 font-bold">
                Loading attendance trend graph…
              </div>
            )}
          </div>
        </div>

        {/* Student Risk Stratification Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Student Risk Stratification</h3>
                <p className="text-xs font-medium text-slate-400">Compliance tiers based on attendance</p>
              </div>
              <button
                onClick={() => onNavigateTab("students")}
                className="text-xs font-bold text-slate-800 hover:text-slate-950 hover:underline"
              >
                View All
              </button>
            </div>

            {/* Risk Bars */}
            <div className="space-y-3.5">
              {/* Healthy */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                    Healthy (≥ 75%)
                  </span>
                  <span className="text-slate-900">{riskStats.healthy} Students</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${riskStats.total > 0 ? (riskStats.healthy / riskStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* At Risk */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-amber-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                    At Risk (60% – 74%)
                  </span>
                  <span className="text-slate-900">{riskStats.atRisk} Students</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${riskStats.total > 0 ? (riskStats.atRisk / riskStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Critical */}
              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-rose-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500 inline-block" />
                    Critical (&lt; 60%)
                  </span>
                  <span className="text-slate-900">{riskStats.critical} Students</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all"
                    style={{ width: `${riskStats.total > 0 ? (riskStats.critical / riskStats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Total Evaluated:</span>
            <span className="text-slate-900 font-extrabold">{riskStats.total} Students</span>
          </div>
        </div>
      </div>

      {/* ── 3. Campus Health Cards & CAM Direct Reporting Roster ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">Campus Health & CM Direct Reports</h3>
            <p className="text-xs font-medium text-slate-400">Real-time status of each supervised college and assigned Campus Manager</p>
          </div>
          <button
            onClick={() => onNavigateTab("reports")}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            Portfolio Analytics <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campuses.map(c => (
            <div
              key={c.id}
              onClick={() => onSelectCampus(c.id)}
              className="bg-white rounded-2xl p-5 border border-slate-100 shadow-card shadow-xs hover:border-slate-400 transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900 group-hover:text-slate-950 transition-colors line-clamp-1">
                        {c.name}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400">{c.location} • {c.code}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                    {c.healthScore}% Health
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 py-3 border-y border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Students</span>
                    <p className="text-xs font-black text-slate-800">{c.totalStudents}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Faculty</span>
                    <p className="text-xs font-black text-slate-800">{c.activeFaculty}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Avg Att.</span>
                    <p className="text-xs font-bold text-slate-900">{c.attendancePct}%</p>
                  </div>
                </div>

                {/* Reporting CAM Info */}
                {c.cam ? (
                  <div className="mt-3 bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-extrabold uppercase text-slate-400 block">Reporting CM:</span>
                      <span className="text-xs font-bold text-slate-800">{c.cam.name}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-400">
                      {c.cam.email && <Mail className="h-3.5 w-3.5 hover:text-indigo-600" />}
                      {c.cam.phone && <Phone className="h-3.5 w-3.5 hover:text-indigo-600" />}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 bg-amber-50 rounded-xl p-2 text-center text-[10px] font-bold text-amber-700">
                    No CM Assigned
                  </div>
                )}
              </div>

              {/* Action Footer */}
              <div className="mt-4 pt-2 flex items-center justify-between text-xs font-bold text-slate-800 group-hover:translate-x-0.5 transition-transform">
                <span>Enter Campus Dashboard</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
