"use client";

import { useMemo, useState } from "react";
import { User, Users } from "lucide-react";
import { Panel } from "../Panel";
import { Combobox } from "../ui/combobox";
import { TableSurface } from "../dashboard/TableSurface";
import { Pagination } from "../ui/Pagination";
import { usePagination } from "../../hooks/usePagination";
import {
  buildGroupCounts,
  filterMentorsByCampus,
  filterMentorsByGroup,
  groupCountLabel,
  toGroupFilterOptions
} from "../../lib/lndFilterOptions";

interface LndRulesTabProps {
  mentors: any[];
  mentorGroups: string[];
  demoRules: any[];
  selectedCollegeId: string;
  currentCollege: any;
  rulesSelectedGroup: string;
  setRulesSelectedGroup: (group: string) => void;
  getMentorGroup: (mentor: any) => string;
  ruleTargetsBySubject: Map<string, number>;
  mentorTargets: Record<string, number>;
  collegesById: Map<string, any>;
  targetDemosCount: number;
  setTargetDemosCount: (count: number) => void;
  deptRuleInputs: Record<string, number>;
  setDeptRuleInputs: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  saveDepartmentRule: (subject: string, targetVal: number) => Promise<void>;
  handleSetMentorTarget: (mentorId: string, count: number) => void;
}

export default function LndRulesTab({
  mentors,
  mentorGroups,
  demoRules,
  selectedCollegeId,
  currentCollege,
  rulesSelectedGroup,
  setRulesSelectedGroup,
  getMentorGroup,
  ruleTargetsBySubject,
  mentorTargets,
  collegesById,
  targetDemosCount,
  setTargetDemosCount,
  deptRuleInputs,
  setDeptRuleInputs,
  saveDepartmentRule,
  handleSetMentorTarget
}: LndRulesTabProps) {
  const [savingRuleGroup, setSavingRuleGroup] = useState<string | null>(null);
  // Rules tab uses the same campus-scoped group model as the grid filter.
  const mentorGroupCounts = useMemo(
    () => buildGroupCounts(mentors, selectedCollegeId, getMentorGroup),
    [mentors, selectedCollegeId, getMentorGroup]
  );

  const mentorsInCampusScope = useMemo(
    () => filterMentorsByCampus(mentors, selectedCollegeId),
    [mentors, selectedCollegeId]
  );

  const rulesGroupOptions = useMemo(() => [
    {
      value: "All",
      label: "All Mentor Groups",
      subtext: groupCountLabel(mentorsInCampusScope.length),
      icon: <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
    },
    ...toGroupFilterOptions(mentorGroupCounts, {
      carriedValue: rulesSelectedGroup !== "All" ? rulesSelectedGroup : undefined,
      carriedSubtext: "no mentors on this campus"
    })
  ], [mentorGroupCounts, mentorsInCampusScope, rulesSelectedGroup]);

  const rulesScopedMentors = useMemo(
    () => filterMentorsByGroup(mentorsInCampusScope, rulesSelectedGroup, getMentorGroup),
    [mentorsInCampusScope, rulesSelectedGroup, getMentorGroup]
  );

  const rulesPagination = usePagination(rulesScopedMentors, {
    pageSize: 15,
    pageSizeOptions: [15, 30, 50, 100],
    resetKeys: [selectedCollegeId, rulesSelectedGroup]
  });

  return (
    <Panel
      title="Department Rules & Targets"
      subtitle="Configure target weekly L&D sessions per department and mentor."
    >
      <div className="space-y-6">
        {/* Target L&D Config Card */}
        <div className="bg-slate-50/80 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-black uppercase text-slate-800 dark:text-white">Default Weekly L&D Target per Mentor</span>
              <p className="text-[10.5px] text-slate-400 font-medium">Global target for mentors across active departments</p>
            </div>
            <div className="flex items-center gap-3">
              <input aria-label="Default weekly target per mentor"
                type="number"
                min={1}
                max={10}
                value={targetDemosCount}
                onChange={(e) => setTargetDemosCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
              />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">L&D session(s) / week</span>
            </div>
          </div>
        </div>

        {/* Department Rules Grid */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200 tracking-wider">Department Quotas</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mentorGroups.map((groupName) => {
              const existing = demoRules?.find(r => r.subject?.toLowerCase().trim() === groupName.toLowerCase().trim());
              const dbVal = existing ? existing.target : 1;
              const localVal = deptRuleInputs[groupName] !== undefined ? deptRuleInputs[groupName] : dbVal;
              const isDirty = localVal !== dbVal;

              return (
                <div key={groupName} className="flex items-center justify-between p-4 rounded-2xl bg-white/80 dark:bg-[#131317]/80 border border-slate-100 dark:border-slate-800 shadow-card">
                  <div>
                    <span className="text-xs font-black text-slate-800 dark:text-white block">{groupName}</span>
                    <span className="text-[10px] text-slate-400 font-semibold block">Target: {dbVal} L&D/week</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input aria-label="Weekly target"
                      type="number"
                      min={1}
                      max={14}
                      value={localVal}
                      onChange={(e) => setDeptRuleInputs(prev => ({ ...prev, [groupName]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-14 text-center p-1.5 text-xs font-bold border border-slate-200 inset-shadow-well focus:bg-white dark:focus:bg-[#131317] dark:border-slate-700 rounded-lg bg-sunken dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
                    />
                    <button
                      onClick={async () => {
                        if (savingRuleGroup) return;
                        setSavingRuleGroup(groupName);
                        try {
                          await saveDepartmentRule(groupName, localVal);
                          setDeptRuleInputs(prev => { const next = { ...prev }; delete next[groupName]; return next; });
                        } finally {
                          setSavingRuleGroup(null);
                        }
                      }}
                      disabled={!isDirty || savingRuleGroup === groupName}
                      className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${isDirty && savingRuleGroup !== groupName ? "bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-xs cursor-pointer" : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                        }`}
                    >
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* MENTOR GROUP-WISEINDIVIDUAL FACULTY L&D QUOTA CONFIGURATOR */}
        <div className="bg-white/80 dark:bg-[#131317]/80 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-card space-y-4 font-sans mt-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="h-4 w-4 text-[#4F46E5]" />
                Individual Mentor Targets
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                Custom weekly L&D targets per mentor.
              </p>
            </div>

            {/* Group Filter Selector — campus-scoped, counted, searchable */}
            <div className="min-w-[260px] sm:max-w-[300px]">
              <Combobox
                label="Filter Group"
                value={rulesSelectedGroup}
                onChange={(v) => setRulesSelectedGroup(v)}
                options={rulesGroupOptions}
                placeholder="All Mentor Groups"
                searchPlaceholder="Search mentor groups..."
              />
              <p role="status" className="text-[10px] text-slate-400 font-semibold mt-1">
                {rulesScopedMentors.length} mentor{rulesScopedMentors.length === 1 ? "" : "s"} on{" "}
                {selectedCollegeId === "all" ? "all campuses" : currentCollege?.name || "this campus"}
                {rulesSelectedGroup !== "All" ? ` · group: ${rulesSelectedGroup}` : ""}
              </p>
            </div>
          </div>

          {/* Mentors Table for Selected Group */}
          <TableSurface
            stickyHeader
            tableClassName="text-left text-xs"
            footer={
              <Pagination
                currentPage={rulesPagination.page}
                totalItems={rulesScopedMentors.length}
                pageSize={rulesPagination.pageSize}
                onPageChange={rulesPagination.setPage}
                onPageSizeChange={rulesPagination.setPageSize}
                pageSizeOptions={rulesPagination.pageSizeOptions}
                ariaLabel="Individual faculty quota configurator pagination"
              />
            }
          >
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-black uppercase text-[9.5px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="p-3">Faculty Name</th>
                <th className="p-3">Mentor Group</th>
                <th className="p-3">College &amp; Department</th>
                <th className="p-3 text-center">Weekly Quota Target</th>
                <th className="p-3 text-right">Set Target Stepper</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
              {rulesPagination.pageItems.length > 0 ? (
                rulesPagination.pageItems.map(m => {
                  const groupName = getMentorGroup(m);
                  const defaultTarget = ruleTargetsBySubject.get(groupName.toLowerCase().trim()) || 1;
                  const customTarget = mentorTargets[m.id] !== undefined ? mentorTargets[m.id] : defaultTarget;
                  const colName = collegesById.get(m.college_id)?.name || m.department || "Faculty";

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-[#4F46E5]" />
                        {m.name}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#4F46E5]/10 text-[#4F46E5] dark:text-[#818CF8] border border-[#4F46E5]/20">
                          {groupName}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px]">
                        {colName}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-[#4F46E5]/10 text-[#4F46E5] dark:text-[#818CF8] font-black text-xs">
                          {customTarget} L&D/Wk
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => handleSetMentorTarget(m.id, customTarget - 1)}
                            aria-label={`Decrease ${m.name} weekly L&D target`}
                            className="w-6 h-6 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-black flex items-center justify-center cursor-pointer shadow-xs transition-colors"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={10}
                            aria-label={`Custom weekly L&D target for ${m.name}`}
                            value={customTarget}
                            onChange={(e) => handleSetMentorTarget(m.id, parseInt(e.target.value) || 0)}
                            className="w-10 text-center text-xs font-black bg-transparent border-none focus:outline-none text-slate-800 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleSetMentorTarget(m.id, customTarget + 1)}
                            aria-label={`Increase ${m.name} weekly L&D target`}
                            className="w-6 h-6 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white font-black flex items-center justify-center cursor-pointer shadow-xs transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400 text-xs font-semibold">
                    {selectedCollegeId === "all"
                      ? "No mentors configured yet."
                      : `No mentors on ${currentCollege?.name || "this campus"} for this group.`}
                  </td>
                </tr>
              )}
            </tbody>
          </TableSurface>
        </div>
      </div>
    </Panel>
  );
}
