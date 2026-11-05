"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { IndianRupee, CalendarCheck2, MessageSquare, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Clock, Building2, Download } from "lucide-react";

export const KAMFinanceAndWelfare: React.FC<{
  initialSubTab?: "fees" | "leaves" | "issues" | "events";
  selectedCollegeId?: string;
  kamId?: string;
}> = ({ initialSubTab = "fees", selectedCollegeId = "all", kamId }) => {
  const [subTab, setSubTab] = useState<"fees" | "leaves" | "issues" | "events">(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const params = new URLSearchParams();
  if (selectedCollegeId !== "all") params.set("collegeId", selectedCollegeId);
  if (kamId) params.set("kamId", kamId);
  const queryString = params.toString();

  const financeQuery = useQuery({
    queryKey: qk.kamPanel("finance-and-welfare", selectedCollegeId, queryString),
    queryFn: async () => {
      const json = await apiFetch<any>(`/api/kam/finance-and-welfare${queryString ? `?${queryString}` : ""}`);
      return json?.success ? json : null;
    },
  });
  const data = financeQuery.data ?? null;
  const loading = financeQuery.isPending;

  const fees = data?.fees || {
    totalFees: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    collectionRate: 0,
    agingOverdue30d: 0,
    campusFeeBreakdown: []
  };

  const welfare = data?.welfare || { totalStudentLeavesToday: 0, totalStudentOdToday: 0, pendingApprovals: 0, recentRequests: [] };
  const issues = data?.issues || { totalIssues: 0, resolvedIssues: 0, resolutionRate: 100, categories: [] };
  const events = data?.events || [];

  const fmtCurrency = (n: number) => {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString("en-IN")}`;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 flex-wrap">
        {[
          { key: "fees", label: "Portfolio Fee Collection & Aging", icon: IndianRupee },
          { key: "leaves", label: "Student Leave & OD Monitoring", icon: CalendarCheck2 },
          { key: "issues", label: "Feedback & Issue Resolution SLAs", icon: MessageSquare },
          { key: "events", label: "Regional Academic Events & Fests", icon: Sparkles }
        ].map(t => {
          const Icon = t.icon;
          const isActive = subTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSubTab(t.key as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 1. SUB-TAB: FEE COLLECTIONS & AGING ── */}
      {subTab === "fees" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Invoiced Fees</span>
              <p className="text-2xl font-black text-slate-900 mt-2">{fmtCurrency(fees.totalFees)}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Tuition, lab & training dues</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Collected (YTD)</span>
              <p className="text-2xl font-black text-emerald-700 mt-2">{fmtCurrency(fees.totalPaid)}</p>
              <p className="text-[10px] font-bold text-emerald-600 mt-1">{fees.collectionRate}% Portfolio Collection</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Outstanding Dues</span>
              <p className="text-2xl font-black text-amber-700 mt-2">{fmtCurrency(fees.totalOutstanding)}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Pending student balances</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Aging Dues (&gt;30 Days)</span>
              <p className="text-2xl font-black text-rose-700 mt-2">{fmtCurrency(fees.agingOverdue30d)}</p>
              <p className="text-[10px] font-bold text-rose-500 mt-1">High-priority recovery</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-900">Campus Fee Recovery & Collection Rate</h3>
                <p className="text-xs text-slate-400 font-medium">Financial recovery status across supervised institutions</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(fees.campusFeeBreakdown || []).map((c: any) => (
                <div key={c.collegeId} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800">{c.collegeName}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {c.collectionRate}% Paid
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c.collectionRate}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 pt-1">
                    <span>Collected: {fmtCurrency(c.totalPaid)}</span>
                    <span className="text-rose-600 font-black">Due: {fmtCurrency(c.totalOutstanding)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. SUB-TAB: STUDENT LEAVES & OD ── */}
      {subTab === "leaves" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Student Leaves Today</span>
              <p className="text-2xl font-black text-slate-900 mt-2">{welfare.totalStudentLeavesToday}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Medical & Casual student leaves</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Authorized On-Duty (OD)</span>
              <p className="text-2xl font-black text-indigo-700 mt-2">{welfare.totalStudentOdToday}</p>
              <p className="text-[10px] font-bold text-indigo-600 mt-1">Symposiums, Sports & Hackathons</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Pending CM/Advisor Review</span>
              <p className="text-2xl font-black text-amber-700 mt-2">{welfare.pendingApprovals}</p>
              <p className="text-[10px] font-bold text-amber-600 mt-1">Applications awaiting sign-off</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Recent Student Leave & OD Log Feed</h3>
              <p className="text-xs text-slate-400 font-medium">Monitoring attendance dispensation patterns across departments</p>
            </div>

            <div className="space-y-2.5">
              {(welfare.recentRequests || []).map((r: any) => (
                <div key={r.id} className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-black text-slate-900">{r.student_name || r.studentName}</span>
                    <span className="text-[10px] text-slate-400 ml-2">({r.department || "General"} • {r.college_name || "Campus"})</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">{r.reason} • {r.dateStr}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    r.status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 3. SUB-TAB: ISSUES & RESOLUTION SLAS ── */}
      {subTab === "issues" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Total Reported Issues</span>
              <p className="text-2xl font-black text-slate-900 mt-2">{issues.totalIssues}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1">Student & faculty tickets</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Resolved SLA</span>
              <p className="text-2xl font-black text-emerald-700 mt-2">{issues.resolutionRate}%</p>
              <p className="text-[10px] font-bold text-emerald-600 mt-1">{issues.resolvedIssues} / {issues.totalIssues} closed</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-card">
              <span className="text-[10px] font-black uppercase text-slate-400">Escalated to KAM</span>
              <p className="text-2xl font-black text-rose-700 mt-2">{issues.escalatedIssues}</p>
              <p className="text-[10px] font-bold text-rose-500 mt-1">High-priority operational blockers</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900">Category-wise Grievance & SLA Heatmap</h3>
              <p className="text-xs text-slate-400 font-medium">Average resolution speed and risk level by issue classification</p>
            </div>

            <div className="space-y-3">
              {(issues.categories || []).map((cat: any, idx: number) => (
                <div key={idx} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-black text-slate-900">{cat.category}</h4>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      Average Turnaround: {cat.avgResolutionDays != null ? `${cat.avgResolutionDays} Days` : "No resolved cases yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-800">{cat.count} Issues</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      cat.status === "High" ? "bg-rose-50 text-rose-700" : cat.status === "Medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                    }`}>
                      {cat.status} Risk
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. SUB-TAB: REGIONAL ACADEMIC EVENTS CALENDAR ── */}
      {subTab === "events" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-card p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black text-slate-900">Regional Academic Events, Hackathons & Tech Fests</h3>
            <p className="text-xs text-slate-400 font-medium">Coordinated multi-campus calendar for technical competitions, workshops, and guest lectures</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.map((e: any) => (
              <div key={e.id} className="bg-slate-50/80 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900">{e.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700">
                    {e.category}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-indigo-600">📅 {e.date}</p>
                <div className="pt-2 border-t border-slate-200/60 flex justify-between text-[10px] font-bold text-slate-400">
                  <span>Venue: {e.venue}</span>
                  <span>Coordinator: {e.coordinator}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
