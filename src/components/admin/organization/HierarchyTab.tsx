"use client";

import React, { useState, useMemo } from "react";
import { Network, ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { College, Mentor, useApp } from "@/context/AppContext";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { normalizeRoleValue } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

export interface HierarchyTabProps {
  currentAdmin?: { name?: string; email?: string } | null;
  kamList?: Array<{ id: string; name: string; title: string }>;
  camList?: Array<{ id: string; name: string; college_id: string }>;
  colleges?: College[];
  mentors?: Mentor[];
}

export const HierarchyTab: React.FC<HierarchyTabProps> = ({
  currentAdmin: propAdmin,
  kamList: propKamList,
  camList: propCamList,
  colleges: propColleges,
  mentors: propMentors
}) => {
  const app = useApp();
  const currentAdmin = propAdmin ?? app.currentAdmin;
  const colleges = propColleges ?? app.colleges ?? [];
  const mentors = propMentors ?? app.mentors ?? [];

  const kamQuery = useQuery({
    queryKey: qk.adminKams(),
    queryFn: async () => {
      const data = await apiFetch("/api/kam?all=1");
      return (data?.kamUsers || []) as Array<{ id: string; name: string; title: string }>;
    },
    enabled: !propKamList
  });
  const kamList = propKamList ?? kamQuery.data ?? [];

  const usersQuery = useQuery({
    queryKey: qk.adminUsers("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/users?limit=5000");
      return (data?.users || []) as any[];
    },
    enabled: !propCamList
  });
  const usersList = usersQuery.data || [];

  const derivedCamList = useMemo(() => {
    return usersList
      .filter((u: any) => normalizeRoleValue(u.role) === "cm")
      .map((u: any) => {
        // Match college via college_id stored on user or by manager name
        const colProfile = (colleges as any[]).find(
          (c: any) => c.id === u.college_id || c.manager === u.name
        );
        return {
          id: u.reference_id || u.id,
          name: u.name || (u.email && typeof u.email === "string" ? u.email.split("@")[0] : u.reference_id) || "—",
          college_id: u.college_id || colProfile?.id || ""
        };
      });
  }, [usersList, colleges]);

  const camList = propCamList ?? derivedCamList;
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    admin: true
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Network}
        title="Interactive Reporting Hierarchy"
      />

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-card space-y-4 text-xs select-none">
        {/* Level 0: Super Admin */}
        <div className="space-y-2">
          <div
            onClick={() => toggleNode("admin")}
            className="flex items-center gap-2.5 p-3.5 bg-white border border-indigo-100 rounded-2xl max-w-md shadow-card cursor-pointer hover:border-indigo-300 transition-all"
          >
            {expandedNodes["admin"] ? (
              <ChevronDown className="h-4 w-4 text-indigo-600" />
            ) : (
              <ChevronRight className="h-4 w-4 text-indigo-600" />
            )}
            <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
              SU
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">Super Admin</div>
              <div className="text-[11px] text-slate-500 font-medium">
                {currentAdmin?.name || "System Admin"} ({currentAdmin?.email || "admin@faceprep.in"})
              </div>
            </div>
          </div>

          {/* Level 1: KAMs */}
          {expandedNodes["admin"] && (
            <div className="pl-8 border-l border-dashed border-gray-300 ml-5 space-y-3 pt-2">
              {kamQuery.isLoading && kamList.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-white border border-slate-100 rounded-2xl max-w-sm animate-pulse shadow-card">
                  <div className="h-6 w-6 rounded-full bg-slate-200" />
                  <div className="space-y-1">
                    <div className="h-3 w-28 bg-slate-200 rounded" />
                    <div className="h-2.5 w-36 bg-slate-100 rounded" />
                  </div>
                </div>
              ) : (
                kamList.map((kam) => {
                const kamNodeId = `kam-${kam.id}`;
                const kamColleges = colleges.filter((c) => c.kam_id === kam.id);

                return (
                  <div key={kam.id} className="space-y-2">
                    <div
                      onClick={() => toggleNode(kamNodeId)}
                      className="flex items-center gap-2.5 p-3 bg-white border border-slate-100 rounded-2xl max-w-sm shadow-card cursor-pointer hover:border-indigo-300 transition-all"
                    >
                      {expandedNodes[kamNodeId] ? (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                      )}
                      <div className="h-6 w-6 rounded-full bg-amber-500 text-white flex items-center justify-center font-black">
                        KAM
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{kam.name}</div>
                        <div className="text-[9px] text-gray-400">
                          {kam.title} • {kamColleges.length} Campus(es)
                        </div>
                      </div>
                    </div>

                    {/* Level 2: Campuses & CAMs */}
                    {expandedNodes[kamNodeId] && (
                      <div className="pl-6 border-l border-dashed border-gray-300 ml-4 space-y-3 pt-1">
                        {kamColleges.map((col) => {
                          const colNodeId = `col-${col.id}`;
                          const cam = camList.find((cm: any) => cm.college_id === col.id);
                          const colMentors = mentors.filter((m) => m.college_id === col.id);

                          return (
                            <div key={col.id} className="space-y-2">
                              <div
                                onClick={() => toggleNode(colNodeId)}
                                className="flex items-center gap-2.5 p-3 bg-white border border-slate-100 rounded-2xl max-w-xs shadow-card cursor-pointer hover:border-indigo-300 transition-all"
                              >
                                {expandedNodes[colNodeId] ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                                )}
                                <div className="h-6 w-6 rounded-full bg-teal-500 text-white flex items-center justify-center font-black">
                                  CM
                                </div>
                                <div>
                                  <div className="font-extrabold text-gray-800 leading-tight">{col.name}</div>
                                  <div className="text-[9px] text-gray-400 font-medium">
                                    CM: {cam ? cam.name : "Unassigned"} ({colMentors.length} Faculty)
                                  </div>
                                </div>
                              </div>

                              {/* Level 3: Mentors */}
                              {expandedNodes[colNodeId] && (
                                <div className="pl-6 border-l border-dashed border-gray-300 ml-4 space-y-2 pt-1">
                                  {colMentors.map((mentor) => (
                                    <div
                                      key={mentor.id}
                                      className="flex items-center gap-2 p-2 bg-white border border-slate-100 rounded-xl max-w-[240px] shadow-card animate-fadeIn"
                                    >
                                      <div className="h-6 w-6 rounded-full btn-gradient text-white flex items-center justify-center font-extrabold text-[9px] shrink-0">
                                        {mentor.avatar}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="font-extrabold text-gray-800 truncate text-[10px] leading-tight">
                                          {mentor.name}
                                        </div>
                                        <div className="text-[8px] text-gray-500 font-bold uppercase tracking-wider mt-0.5 truncate">
                                          {mentor.department}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                  {colMentors.length === 0 && (
                                    <span className="text-[9px] text-gray-400 italic pl-1">
                                      No faculty mentors configured
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
