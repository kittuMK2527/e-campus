"use client";

import React, { useState } from "react";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  ActionDropdownButton
} from "@/components/ui/dropdown-menu";
import { College, useApp } from "@/context/AppContext";
import { HolidayDialog } from "@/components/admin/dialogs/HolidayDialog";
import { HolidayFormState } from "@/components/admin/types";
import { useToast } from "@/context/ToastContext";
import { useAdminCampusScope } from "@/components/admin/useAdminCampusScope";
import { SundayScheduleCard } from "@/components/admin/operations/SundayScheduleCard";

export interface Holiday {
  id: string;
  title: string;
  date: string;
  type: string;
  college_id?: string;
}

export interface HolidaysTabProps {
  holidays?: Holiday[];
  colleges?: College[];
  onOpenSchedule?: () => void;
  onDeleteHoliday?: (id: string) => Promise<void>;
  loadingActions?: Record<string, boolean>;
}

export const HolidaysTab: React.FC<HolidaysTabProps> = ({
  holidays: propHolidays,
  colleges: propColleges,
  onOpenSchedule: propOnOpenSchedule,
  onDeleteHoliday: propOnDeleteHoliday,
  loadingActions: propLoadingActions
}) => {
  const app = useApp();
  const { toast, confirm: showConfirm } = useToast();
  const holidays = propHolidays ?? app.holidays ?? [];
  const colleges = propColleges ?? app.colleges ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localLoading, setLocalLoading] = useState<Record<string, boolean>>({});
  const loadingActions = propLoadingActions ?? localLoading;
  const { collegeId: scopeCollegeId, selectCollege } = useAdminCampusScope();

  const [form, setForm] = useState<HolidayFormState>({
    title: "",
    date: new Date().toISOString().split("T")[0],
    type: "National Holiday",
    college_id: ""
  });

  const handleOpenSchedule = () => {
    if (propOnOpenSchedule) {
      propOnOpenSchedule();
    } else {
      setForm({
        title: "",
        date: new Date().toISOString().split("T")[0],
        type: "National Holiday",
        college_id: ""
      });
      setDialogOpen(true);
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.date) {
      toast("Please fill in title and date.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        toast("Holiday added successfully.", "success");
        setDialogOpen(false);
        app.refreshData();
        app.notifyDataChanged("holidays");
      } else {
        toast(data.message || "Failed to add holiday.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error adding holiday.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (propOnDeleteHoliday) return propOnDeleteHoliday(id);
    const ok = await showConfirm({
      message: "Delete this holiday? Schedules and attendance for that date may need to be corrected.",
      danger: true,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`holiday_${id}`]: true }));
    try {
      const res = await fetch(`/api/holidays?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast("Holiday deleted successfully.", "success");
        app.refreshData();
        app.notifyDataChanged("holidays");
      } else {
        toast(data.message || "Failed to delete holiday.", "error");
      }
    } catch (err: any) {
      toast(err.message || "Error deleting holiday.", "error");
    } finally {
      setLocalLoading((prev: Record<string, boolean>) => ({ ...prev, [`holiday_${id}`]: false }));
    }
  };
  const pagination = usePagination(holidays, {
    pageSize: 10,
    pageSizeOptions: [10, 25, 50]
  });

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Calendar}
        title="Campus Holidays"
        actions={
          <Button
            variant="ghost"
            onClick={handleOpenSchedule}
            className="h-auto btn-gradient shadow-sm text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 composition-btn cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Schedule Holiday
          </Button>
        }
      />

      <FilterBar
        aside={
          <span className="text-[11px] font-semibold text-slate-500">
            Applies to Sunday working days only
          </span>
        }
      >
        <label htmlFor="holiday-scope-campus" className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Campus
        </label>
        <Select
          id="holiday-scope-campus"
          aria-label="Campus for Sunday working days"
          value={scopeCollegeId}
          onChange={(e) => selectCollege(e.target.value)}
          className="w-full min-w-[200px] cursor-pointer sm:w-72"
        >
          {colleges.length === 0 ? <option value="">No campuses configured</option> : null}
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FilterBar>

      <SundayScheduleCard collegeId={scopeCollegeId} />

      {holidays.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">No holidays scheduled.</p>
        </div>
      ) : (
        <TableSurface
          footer={
            <Pagination
              currentPage={pagination.page}
              totalItems={holidays.length}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={pagination.pageSizeOptions}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Holiday Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Applicable Campus</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((hol) => {
              const targetCampus = colleges.find(c => c.id === hol.college_id)?.name || "All Campuses";
              return (
                <TableRow key={hol.id}>
                  <TableCell className="font-bold text-gray-900">{hol.title}</TableCell>
                  <TableCell className="font-semibold text-indigo-600">{hol.date}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{hol.type}</Badge>
                  </TableCell>
                  <TableCell className="font-bold">{targetCampus}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <ActionDropdownButton size="sm" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Holiday Options</DropdownMenuLabel>
                        <DropdownMenuItem
                          className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                          onClick={() => handleDeleteHoliday(hol.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete Holiday
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableSurface>
      )}

      {dialogOpen && (
        <HolidayDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          onFormChange={setForm}
          onSubmit={handleCreateHoliday}
          colleges={colleges}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
};
