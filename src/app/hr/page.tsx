"use client";

import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { CampusAuditManager } from "@/components/CampusAuditManager";
import { useApp } from "@/context/AppContext";
import { Building2, ShieldCheck } from "lucide-react";

export default function HRPortalPage() {
  const { colleges, currentHR } = useApp();
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>("");

  const activeCollege = useMemo(() => {
    if (!colleges.length) return null;
    return colleges.find((c) => c.id === selectedCollegeId) || colleges[0];
  }, [colleges, selectedCollegeId]);

  return (
    <DashboardLayout requiredRole="hr">
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-100 rounded-2xl px-5 py-4 shadow-card">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-black text-slate-900">HR Audit Portal</h1>
                <p className="text-xs text-slate-500 font-medium">
                  Signed in as {currentHR?.name || "HR Manager"} · Review and record campus audits
                </p>
              </div>
            </div>

            {colleges.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Building2 className="h-4 w-4 text-slate-400" />
                <span>Campus</span>
                <select
                  value={activeCollege?.id || ""}
                  onChange={(e) => setSelectedCollegeId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500/80 focus:border-amber-500"
                >
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {activeCollege ? (
            <CampusAuditManager
              collegeId={activeCollege.id}
              collegeName={activeCollege.name}
              role="hr"
              userName={currentHR?.name || "HR Manager"}
            />
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center text-sm text-slate-500">
              No campuses are configured yet. Ask an administrator to add a campus.
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
