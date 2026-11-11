"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useApp, College } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/apiFetch";
import { qk } from "@/lib/queryKeys";
import { normalizeRoleValue } from "@/lib/utils";
import {
  Building2,
  Plus,
  MapPin,
  Edit,
  Trash2,
  Sparkles,
  Sliders,
  Search,
  X
} from "lucide-react";
import { FilterBar } from "@/components/ui/FilterBar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { CampusWizardDialog } from "@/components/admin/dialogs/CampusWizardDialog";
import { AdminTabSkeleton } from "@/components/admin/AdminTabSkeleton";

const CAMDashboard = dynamic(() => import("@/components/CAMDashboard").then(m => m.CAMDashboard), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center p-16 text-slate-400 font-bold text-sm">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        <span>Loading Campus Console…</span>
      </div>
    </div>
  )
});

export interface CampusesTabProps {
  onDrillDownCampus?: (collegeId: string) => void;
}

export const CampusesTab: React.FC<CampusesTabProps> = ({ onDrillDownCampus }) => {
  const {
    colleges,
    mentors,
    slots,
    deleteCollege,
    refreshData,
    currentAdmin,
    currentUser,
    currentRole,
    isDataLoading
  } = useApp();
  const { toast, confirm: showConfirm } = useToast();

  const [localDrillDownCollegeId, setLocalDrillDownCollegeId] = useState<string | null>(null);
  const activeDrillDownId = localDrillDownCollegeId;

  const handleOpenConsole = (id: string) => {
    if (onDrillDownCampus) {
      onDrillDownCampus(id);
    } else {
      setLocalDrillDownCollegeId(id);
    }
  };

  const [showCampusModal, setShowCampusModal] = useState(false);
  const [editingCampus, setEditingCampus] = useState<College | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const setAction = (key: string, val: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: val }));
  };

  // Draft persistence query
  const userRole = currentRole || "admin";
  const userId = currentUser?.id || currentAdmin?.id || "default";

  const draftQuery = useQuery({
    queryKey: ["campus-draft", userRole, userId],
    queryFn: async () => {
      const res = await apiFetch(`/api/campus-draft?role=${encodeURIComponent(userRole)}&userId=${encodeURIComponent(userId)}`);
      return res || null;
    }
  });

  const draftData = draftQuery.data?.draft;
  const draftSavedAt = draftQuery.data?.savedAt;

  const handleDiscardDraft = async () => {
    if (
      !(await showConfirm({
        title: "Discard Campus Draft",
        message: "Are you sure you want to discard this unfinished campus draft? All unsaved inputs will be lost.",
        danger: true,
        confirmLabel: "Discard Draft"
      }))
    ) {
      return;
    }
    try {
      await apiFetch(`/api/campus-draft?role=${encodeURIComponent(userRole)}&userId=${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
      toast("Campus draft discarded.", "info");
      draftQuery.refetch();
    } catch (err: any) {
      toast(err.message || "Failed to discard draft.", "error");
    }
  };

  const handleResumeDraft = () => {
    setEditingCampus(null);
    setShowCampusModal(true);
  };

  // Fetch users & KAMs for ownership mapping
  const usersQuery = useQuery({
    queryKey: qk.adminUsers("all"),
    queryFn: async () => {
      const data = await apiFetch("/api/users?limit=5000");
      return (data?.users || []) as any[];
    }
  });
  const usersList = usersQuery.data || [];

  const kamQuery = useQuery({
    queryKey: qk.adminKams(),
    queryFn: async () => {
      const data = await apiFetch("/api/kam?all=1");
      return (data?.kamUsers || []) as any[];
    }
  });
  const kamList = kamQuery.data || [];

  const camList = useMemo(() => {
    return usersList
      .filter((u: any) => normalizeRoleValue(u.role) === "cm")
      .map((u: any) => {
        const colProfile = (colleges as any[]).find(
          (c: any) => c.id === u.college_id || c.manager === u.name
        );
        return {
          ...u,
          name: u.name || (u.email && typeof u.email === "string" ? u.email.split("@")[0] : u.reference_id) || "—",
          college_id: u.college_id || colProfile?.id || "",
          college_name: colProfile?.name || "",
          kam_id: colProfile?.kam_id || ""
        };
      });
  }, [usersList, colleges]);

  const handleOpenCampusModal = (col?: College) => {
    setEditingCampus(col || null);
    setShowCampusModal(true);
  };

  const handleDeleteCampus = async (id: string, name: string) => {
    if (
      !(await showConfirm({
        title: "Delete Campus",
        message: `Are you sure you want to permanently delete "${name}"? This will delete all courses, slots, and mentors assigned to this campus.`,
        danger: true,
        confirmLabel: "Delete Campus"
      }))
    ) {
      return;
    }
    setAction(`campus_${id}`, true);
    try {
      const res = await deleteCollege(id);
      if (res.success) {
        toast(`Campus "${name}" deleted successfully.`, "success");
        await refreshData(true);
      } else {
        toast(res.message || "Failed to delete campus.", "error");
      }
    } catch (err: any) {
      toast(err.message || "An error occurred while deleting.", "error");
    } finally {
      setAction(`campus_${id}`, false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [kamFilter, setKamFilter] = useState("all");

  const filteredColleges = useMemo(() => {
    return (colleges || []).filter(col => {
      if (!col) return false;
      const hasShiftsNum = Number(col.has_shifts ?? 1);
      if (shiftFilter === "general" && hasShiftsNum !== 0) return false;
      if (shiftFilter === "multi" && hasShiftsNum === 0) return false;
      if (kamFilter !== "all" && col.kam_id !== kamFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (col.name || "").toLowerCase().includes(q);
        const matchesAddress = (col.address || "").toLowerCase().includes(q);
        const matchesId = (col.id || "").toLowerCase().includes(q);
        if (!matchesName && !matchesAddress && !matchesId) return false;
      }
      return true;
    });
  }, [colleges, shiftFilter, kamFilter, searchQuery]);

  const activeFilters = [
    shiftFilter !== "all" && (shiftFilter === "multi" ? "Multi-Shift" : "General Shift"),
    kamFilter !== "all" && `KAM: ${kamList.find(k => k.id === kamFilter)?.name || kamFilter}`,
    searchQuery.trim() && `"${searchQuery.trim()}"`
  ].filter(Boolean) as string[];

  const clearFilters = () => {
    setSearchQuery("");
    setShiftFilter("all");
    setKamFilter("all");
  };

  const renderCampusName = (name: string) => {
    if (name.includes(" of ")) {
      const parts = name.split(" of ");
      return (
        <>
          <div className="text-[20px] font-semibold text-gray-900 leading-snug">{parts[0]}</div>
          <div className="text-[13px] font-medium text-gray-400 mt-0.5">of {parts[1]}</div>
        </>
      );
    }
    return <div className="text-[20px] font-semibold text-gray-900 leading-snug">{name}</div>;
  };

  if (isDataLoading && (!colleges || colleges.length === 0)) {
    return <AdminTabSkeleton message="Loading university campuses…" />;
  }

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Building2}
        title="Campuses"
        actions={
          <Button
            variant="ghost"
            onClick={() => handleOpenCampusModal()}
            className="h-auto btn-gradient px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm text-white"
          >
            <Plus className="h-4 w-4" />
            Add Campus
          </Button>
        }
      />

      {/* ── UNFINISHED DRAFT CARD ── */}
      {draftData && !editingCampus && (
        <div className="bg-white p-5 rounded-xl border-2 border-amber-200/90 shadow-card space-y-3 relative overflow-hidden animate-fadeIn">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Sparkles className="h-5 w-5 text-amber-600 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="font-extrabold text-base text-gray-900 tracking-tight">
                    Unfinished Campus Setup: <span className="text-indigo-600">{draftData.campusForm?.name || "Untitled Campus"}</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 shadow-2xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Draft Auto-Saved ({draftSavedAt || "Recently"})
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-semibold mt-1 flex items-center gap-2 flex-wrap">
                  <span>Step {draftData.campusWizardStep || 1} of 4</span>
                  <span>•</span>
                  <span>{(draftData.wizardCourses || []).length} Course(s) Added</span>
                  {draftData.campusForm?.address && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-gray-600">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {draftData.campusForm.address}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                type="button"
                onClick={handleDiscardDraft}
                className="h-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:text-rose-600 bg-gray-100 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 transition-all cursor-pointer"
              >
                Discard Draft
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={handleResumeDraft}
                className="h-auto px-5 py-2 rounded-xl text-xs font-extrabold btn-gradient shadow-sm flex items-center gap-1.5 cursor-pointer text-white"
              >
                Resume Setup →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <FilterBar>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            aria-label="Search campuses"
            placeholder="Search campuses by name, address, code..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 rounded-2xl"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 cursor-pointer"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select
          aria-label="Shift filter"
          value={shiftFilter}
          onChange={e => setShiftFilter(e.target.value)}
          className="w-auto min-w-[140px] cursor-pointer"
        >
          <option value="all">All Shift Types</option>
          <option value="multi">Multi-Shift</option>
          <option value="general">General Shift Only</option>
        </Select>

        <Select
          aria-label="KAM owner filter"
          value={kamFilter}
          onChange={e => setKamFilter(e.target.value)}
          className="w-auto min-w-[160px] cursor-pointer"
        >
          <option value="all">All KAM Owners</option>
          {kamList.map(k => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>

        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            Clear filters
          </Button>
        )}
      </FilterBar>

      {filteredColleges.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">
            {colleges.length === 0
              ? "No campuses configured yet. Click 'Add Campus' to begin."
              : "No campuses matched your search query."}
          </p>
          {activeFilters.length > 0 && (
            <>
              <p className="mt-1 text-[11px] text-slate-400">Filtering by {activeFilters.join(" · ")}.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters and show all campuses
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredColleges.map(col => {
            const colMentors = mentors.filter(m => m.college_id === col.id);
            const colSlots = slots.filter(s => colMentors.some(m => m.id === s.mentorId));
            const colDeptsCount = Array.from(new Set(colMentors.map(m => m.mentor_group).filter(Boolean))).length;
            const cam = camList.find(cm => cm.college_id === col.id);
            const kamOwner = kamList.find(k => k.id === col.kam_id);

            return (
              <div
                key={col.id}
                className="p-5 rounded-2xl border border-slate-100 bg-white shadow-card hover:shadow-card-lg hover:border-indigo-100 transition-all flex flex-col justify-between min-h-[320px] relative overflow-hidden group"
              >
                {/* Shift badge in top-right corner */}
                <div className="absolute top-4 right-4">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-tight ${col.has_shifts === 0
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-teal-50 text-teal-700 border border-teal-200"
                      }`}
                  >
                    {col.has_shifts === 0 ? "General Shift Only" : "Multi-Shift"}
                  </span>
                </div>

                <div className="space-y-4">
                  <div>
                    {renderCampusName(col.name)}
                    <p className="text-[13px] text-slate-400 mt-1 flex items-center gap-1 font-medium">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {col.address || "No Address Added"}
                    </p>
                  </div>

                  {/* KAM and Campus Manager details */}
                  <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 text-[13px] space-y-1.5">
                    <div className="flex text-slate-500">
                      <span className="w-[120px] shrink-0 font-medium">KAM Owner</span>
                      <span className="font-bold text-slate-900">
                        : {kamQuery.isLoading ? (
                          <span className="inline-block h-3 w-20 rounded bg-slate-200 animate-pulse align-middle ml-1" />
                        ) : (
                          kamOwner ? kamOwner.name : "Unassigned"
                        )}
                      </span>
                    </div>
                    <div className="flex text-slate-500">
                      <span className="w-[120px] shrink-0 font-medium">Campus Manager</span>
                      <span className="font-bold text-slate-900">
                        : {usersQuery.isLoading ? (
                          <span className="inline-block h-3 w-24 rounded bg-slate-200 animate-pulse align-middle ml-1" />
                        ) : (
                          cam ? cam.name : "Unassigned"
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Statistics Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-center">
                    <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                      <div className="font-bold text-slate-900 text-lg leading-none">{colMentors.length}</div>
                      <div className="text-[10px] text-slate-400 font-semibold mt-1">Faculty</div>
                    </div>
                    <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                      <div className="font-bold text-slate-900 text-lg leading-none">{colSlots.length}</div>
                      <div className="text-[10px] text-slate-400 font-semibold mt-1">Slots</div>
                    </div>
                    <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                      <div className="font-bold text-slate-900 text-lg leading-none">{colDeptsCount}</div>
                      <div className="text-[10px] text-slate-400 font-semibold mt-1">Depts</div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-gray-100">
                  <Button
                    variant="ghost"
                    onClick={() => handleOpenConsole(col.id)}
                    className="h-9 flex-1 btn-gradient font-bold py-2 rounded-xl text-xs text-white transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Manage Console
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ActionDropdownButton />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => handleOpenCampusModal(col)}>
                        <Edit className="h-3.5 w-3.5 mr-2 text-indigo-600" />
                        Edit Campus
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenConsole(col.id)}>
                        <Sliders className="h-3.5 w-3.5 mr-2 text-slate-600" />
                        Open Console
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDeleteCampus(col.id, col.name)}
                        disabled={actionLoading[`campus_${col.id}`]}
                        className="text-rose-600 focus:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2 text-rose-600" />
                        Delete Campus
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Campus Setup / Edit Wizard Dialog */}
      <CampusWizardDialog
        open={showCampusModal}
        onOpenChange={setShowCampusModal}
        collegeToEdit={editingCampus}
        kamList={kamList}
        camList={camList}
        onSaved={async () => {
          await refreshData(true);
          draftQuery.refetch();
        }}
        onOpenCampusConsole={colId => handleOpenConsole(colId)}
      />

      {/* Fallback Slide-over CAM Campus Console if not hosted by parent */}
      {!onDrillDownCampus && (
        <Sheet open={!!activeDrillDownId} onOpenChange={open => { if (!open) setLocalDrillDownCollegeId(null); }}>
          <SheetContent side="right" className="w-full sm:max-w-6xl p-0 flex flex-col bg-slate-50 overflow-hidden">
            <SheetHeader className="p-4 bg-white border-b border-slate-200">
              <SheetTitle className="text-base font-bold text-slate-800">
                Campus Console — {colleges.find(c => c.id === activeDrillDownId)?.name || activeDrillDownId}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-400">
                Admin drill-down into Campus Manager view.
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="flex-1 overflow-y-auto p-0">
              {activeDrillDownId && <CAMDashboard overrideCollegeId={activeDrillDownId} />}
            </SheetBody>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};
