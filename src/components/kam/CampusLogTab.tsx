"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Building2,
  ShieldAlert,
  AlertTriangle,
  GraduationCap,
  Users,
  IndianRupee,
  Clock,
  ChevronRight,
  Filter,
  CheckCircle2,
  Download
} from "lucide-react";
import { FacultyConcernsTab } from "../cam/FacultyConcernsTab";
import { apiFetch } from "@/lib/apiFetch";

interface CollegeOption {
  id: string;
  name: string;
}

interface CampusLogTabProps {
  kamId?: string;
  kamName?: string;
  scopedColleges: CollegeOption[];
}

export const CampusLogTab: React.FC<CampusLogTabProps> = ({
  kamId = "",
  kamName = "Key Account Manager",
  scopedColleges = []
}) => {
  const [selectedCampusId, setSelectedCampusId] = useState<string>(
    scopedColleges.length > 0 ? scopedColleges[0].id : ""
  );
  const [clusterRollup, setClusterRollup] = useState<any>({
    totalCampuses: scopedColleges.length,
    totalStudents: 0,
    totalMentors: 0,
    openComplaintsCount: 0,
    lowAttendanceStudentsCount: 0,
    feeDefaultersCount: 0,
    lowAuditMentorsCount: 0
  });
  const [isLoadingRollup, setIsLoadingRollup] = useState(false);

  // Fetch Cluster Summary
  useEffect(() => {
    async function loadClusterData() {
      setIsLoadingRollup(true);
      try {
        const res = await apiFetch<any>(`/api/campus/concerns?kamId=${encodeURIComponent(kamId)}`);
        if (res?.success && res.data?.clusterRollup) {
          setClusterRollup(res.data.clusterRollup);
        }
      } catch (err: any) {
        console.warn("Failed to load cluster rollup:", err.message);
      } finally {
        setIsLoadingRollup(false);
      }
    }
    loadClusterData();
  }, [kamId]);

  const selectedCollege = useMemo(() => {
    return scopedColleges.find((c) => c.id === selectedCampusId) || scopedColleges[0] || null;
  }, [scopedColleges, selectedCampusId]);

  return (
    <div className="space-y-6">
      {/* Top Executive Header */}
      <div className="bg-gradient-to-r from-slate-950 via-zinc-900 to-indigo-950 text-white p-6 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4 border border-indigo-500/20">
        <div>
          <div className="flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-indigo-400" />
            <h2 className="text-xl font-black tracking-tight">Campus Log & Concerns Command Center</h2>
          </div>
          <p className="text-xs text-slate-300 font-medium mt-1">
            Regional operational intelligence across sister campuses under {kamName}. Monitor student logs, fees, low attendance, and mentor audit scores.
          </p>
        </div>

        {/* Campus Selector Dropdown */}
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
          <span className="text-xs font-bold text-slate-300 pl-2">Active Campus:</span>
          <select
            value={selectedCampusId}
            onChange={(e) => setSelectedCampusId(e.target.value)}
            className="h-9 px-3 bg-zinc-900 text-white border border-white/20 rounded-xl text-xs font-black outline-none cursor-pointer focus:ring-2 focus:ring-indigo-400"
          >
            {scopedColleges.map((c) => (
              <option key={c.id} value={c.id} className="bg-zinc-900 text-white">
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cluster Executive Roll-Up Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Open Student Complaints
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-700 mt-1">
            {clusterRollup.openComplaintsCount || 0}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Logged by course mentors</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Low Attendance (&lt;75%)
            </span>
            <GraduationCap className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-800 mt-1">
            {clusterRollup.lowAttendanceStudentsCount || 0}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Students at academic risk</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Fee Arrears Defaulters
            </span>
            <IndianRupee className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {clusterRollup.feeDefaultersCount || 0}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">Pending balance dues</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Mentors Under Review
            </span>
            <Users className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-900 mt-1">
            {clusterRollup.lowAuditMentorsCount || 0}
          </p>
          <span className="text-[10px] text-slate-400 font-medium">E-Audit score &lt; 70%</span>
        </div>
      </div>

      {/* Mirrored Campus Concerns Studio */}
      {selectedCollege ? (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
          <FacultyConcernsTab
            collegeId={selectedCollege.id}
            collegeName={selectedCollege.name}
            isKAMView={true}
          />
        </div>
      ) : (
        <div className="p-12 text-center text-xs text-slate-400">
          No campus selected. Please select a partner campus from your assigned portfolio.
        </div>
      )}
    </div>
  );
};
