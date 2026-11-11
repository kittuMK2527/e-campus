"use client";

import React, { useDeferredValue, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Grid, Search, X } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/hooks/usePagination";
import { formatTimeLabel } from "@/lib/utils";
import {
  buildSlotLookups,
  collectSlotOptions,
  filterSlots,
  shiftLabel,
  slotCollegeId,
  slotCollegeName
} from "@/lib/slotFilters";
import { College, Mentor, Slot, useApp } from "@/context/AppContext";
import { SundayScheduleCard } from "@/components/admin/operations/SundayScheduleCard";

export interface SchedulesTabProps {
  slots?: Slot[];
  colleges?: College[];
  mentors?: Mentor[];
  onDrillDownCampus?: (collegeId: string) => void;
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({
  slots: propSlots,
  colleges: propColleges,
  mentors: propMentors,
  onDrillDownCampus: propOnDrillDown
}) => {
  const app = useApp();
  const slots = propSlots ?? app.slots ?? [];
  const colleges = propColleges ?? app.colleges ?? [];
  const mentors = propMentors ?? app.mentors ?? [];
  const onDrillDownCampus = propOnDrillDown ?? ((collegeId: string) => {
    if (typeof window !== "undefined") {
      window.location.hash = `#campus-${collegeId}`;
    }
  });
  const searchParams = useSearchParams();
  const campusParam = searchParams?.get("campus") || null;

  const [collegeFilter, setCollegeFilter] = useState(() => campusParam || "all");
  const [dayFilter, setDayFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (campusParam) {
      setCollegeFilter(campusParam);
    }
  }, [campusParam]);

  // /api/data can hand this tab tens of thousands of slots, so the filter pass runs
  // against the deferred query and only the current page reaches the DOM.
  const deferredSearch = useDeferredValue(searchQuery);
  const lookups = useMemo(() => buildSlotLookups(mentors, colleges), [mentors, colleges]);
  const { days: dayOptions, shifts: shiftOptions } = useMemo(() => collectSlotOptions(slots), [slots]);

  const filteredSlots = useMemo(
    () =>
      filterSlots(
        slots,
        { collegeId: collegeFilter, day: dayFilter, shift: shiftFilter, search: deferredSearch },
        lookups
      ),
    [slots, collegeFilter, dayFilter, shiftFilter, deferredSearch, lookups]
  );

  const pagination = usePagination(filteredSlots, {
    pageSize: 15,
    pageSizeOptions: [15, 30, 50, 100, 250],
    resetKeys: [collegeFilter, dayFilter, shiftFilter, deferredSearch]
  });

  const activeFilters = [
    collegeFilter !== "all" && `Campus: ${lookups.collegesById.get(collegeFilter)?.name || collegeFilter}`,
    dayFilter !== "all" && `Day: ${dayFilter}`,
    shiftFilter !== "all" && `Shift: ${shiftLabel(shiftFilter)}`,
    deferredSearch.trim() && `Search: "${deferredSearch.trim()}"`
  ].filter(Boolean) as string[];

  const clearFilters = () => {
    setCollegeFilter("all");
    setDayFilter("all");
    setShiftFilter("all");
    setSearchQuery("");
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-xs">
      <PageHeader
        icon={Grid}
        title="Global Scheduled Slots"
      />

      <FilterBar>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            aria-label="Search slots"
            placeholder="Search slot, mentor, room or course..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          aria-label="College filter"
          value={collegeFilter}
          onChange={(e) => setCollegeFilter(e.target.value)}
          className="w-auto min-w-[160px] cursor-pointer"
        >
          <option value="all">All Campuses</option>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Day filter"
          value={dayFilter}
          onChange={(e) => setDayFilter(e.target.value)}
          className="w-auto min-w-[125px] cursor-pointer"
        >
          <option value="all">All Days</option>
          {dayOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Shift filter"
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value)}
          className="w-auto min-w-[125px] cursor-pointer"
        >
          <option value="all">All Shifts</option>
          {shiftOptions.map((s) => (
            <option key={s} value={s}>
              {shiftLabel(s)}
            </option>
          ))}
        </Select>

        {activeFilters.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        )}
      </FilterBar>

      {collegeFilter !== "all" && <SundayScheduleCard collegeId={collegeFilter} readOnly />}

      {filteredSlots.length === 0 ? (
        <div className="text-center py-16 border border-slate-100 rounded-2xl bg-white shadow-card">
          <Grid className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">
            {slots.length === 0
              ? "No timetables have been generated yet."
              : "No slot schedules matched your filter query."}
          </p>
          {activeFilters.length > 0 && (
            <>
              <p className="mt-1 text-[11px] text-slate-400">Filtering by {activeFilters.join(" · ")}.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters and show all slots
              </Button>
            </>
          )}
        </div>
      ) : (
        <TableSurface
          stickyHeader
          footer={
            <Pagination
              currentPage={pagination.page}
              totalItems={filteredSlots.length}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
              pageSizeOptions={pagination.pageSizeOptions}
            />
          }
        >
          <TableHeader>
            <TableRow>
              <TableHead>Campus</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead>Day</TableHead>
              <TableHead>Time Slot</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Course / Class Group</TableHead>
              <TableHead>Room</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pageItems.map((slot) => {
              const mentorObj = lookups.mentorsById.get(slot.mentorId);
              const campusId: string = slotCollegeId(slot, lookups);
              const campusLabel = slotCollegeName(slot, lookups);

              return (
                <TableRow key={slot.id}>
                  <TableCell className="font-bold">
                    {campusLabel || (campusId ? "Campus Unknown" : "Unassigned")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full btn-gradient flex items-center justify-center font-extrabold text-white text-[9px]">
                        {mentorObj?.avatar || "M"}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900">{mentorObj?.name}</div>
                        <div className="text-[9.5px] text-gray-400">{mentorObj?.department}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{slot.day}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatTimeLabel(slot.time)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        slot.shift === "shift_1" ? "warning" : slot.shift === "shift_2" ? "success" : "secondary"
                      }
                    >
                      {shiftLabel(slot.shift)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-extrabold text-indigo-700">{slot.course}</div>
                    <div className="text-[9.5px] text-gray-400 font-semibold uppercase">
                      {slot.classGroup || "General Class"}
                    </div>
                  </TableCell>
                  <TableCell>{slot.location}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!campusId}
                      onClick={() => {
                        if (campusId) onDrillDownCampus(campusId);
                      }}
                    >
                      Manage Campus
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableSurface>
      )}
    </div>
  );
};
