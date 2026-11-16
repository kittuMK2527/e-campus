"use client";

import React, { useState, useEffect, useMemo, useDeferredValue } from "react";
import {
  Calendar,
  CalendarCheck2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Search,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Info,
  CalendarRange
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useApp } from "@/context/AppContext";
import { getLocalDateStr, parseLocalDate, getInstitutionDateStr } from "@/lib/localDate";
import { getWeekBoundaries } from "@/lib/dailyConfigForm";

export interface AdminDayOrderOversightTabProps {
  onSelectCollege?: (collegeId: string) => void;
}

export const AdminDayOrderOversightTab: React.FC<AdminDayOrderOversightTabProps> = ({
  onSelectCollege
}) => {
  const { colleges = [] } = useApp();
  const todayStr = getLocalDateStr();

  const [configsList, setConfigsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCampus, setSelectedCampus] = useState<string>("all");
  const [selectedDayType, setSelectedDayType] = useState<string>("all");
  const [dateRangeMode, setDateRangeMode] = useState<"this_week" | "next_week" | "this_month" | "all">("this_week");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const deferredSearch = useDeferredValue(searchQuery);

  const fetchAllDailyConfigs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/daily-configs?college_id=all&limit=500");
      const data = await res.json();
      if (data.success) {
        setConfigsList(data.configs || []);
      }
    } catch (err) {
      console.error("Error fetching all daily configs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllDailyConfigs();
  }, []);

  // Compute boundaries for timeframes
  const thisWeekBounds = useMemo(() => getWeekBoundaries(todayStr), [todayStr]);
  const nextWeekBounds = useMemo(() => {
    const nextMon = new Date(thisWeekBounds.monday);
    nextMon.setDate(nextMon.getDate() + 7);
    return getWeekBoundaries(getInstitutionDateStr(nextMon));
  }, [thisWeekBounds]);

  const thisMonthBounds = useMemo(() => {
    const [y, m] = todayStr.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { startDate: start, endDate: end };
  }, [todayStr]);

  // Fast O(1) lookup map: `${college_id}_${dateStr}` -> config
  const configLookupMap = useMemo(() => {
    const map = new Map<string, any>();
    configsList.forEach(c => {
      if (c.college_id && c.dateStr) {
        map.set(`${c.college_id}_${c.dateStr}`, c);
      }
    });
    return map;
  }, [configsList]);

  // Campus Pulse: For every campus, determine today's status & upcoming 7-day health
  const campusPulseList = useMemo(() => {
    return colleges.map(col => {
      const isSixDay = Number(col.working_days) === 6;
      const todayCfg = configLookupMap.get(`${col.id}_${todayStr}`);

      // Inspect upcoming 7 business days for unconfigured gaps
      let unconfiguredCount = 0;
      const cur = parseLocalDate(todayStr);
      for (let i = 0; i < 7; i++) {
        const d = new Date(cur);
        d.setDate(cur.getDate() + i);
        const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat
        const dStr = getInstitutionDateStr(d);
        const isWeekend = dayOfWeek === 0 || (!isSixDay && dayOfWeek === 6);
        if (!isWeekend) {
          const cfg = configLookupMap.get(`${col.id}_${dStr}`);
          if (!cfg) unconfiguredCount++;
        }
      }

      return {
        id: col.id,
        name: col.name,
        code: col.code || col.id,
        workingDaysCount: isSixDay ? 6 : 5,
        todayConfig: todayCfg,
        unconfiguredUpcoming: unconfiguredCount
      };
    });
  }, [colleges, configLookupMap, todayStr]);

  // Overall missing schedule gap count across the institution
  const totalGapsCount = useMemo(() => {
    return campusPulseList.reduce((acc, c) => acc + c.unconfiguredUpcoming, 0);
  }, [campusPulseList]);

  // Filtered rows for the matrix table
  const filteredRows = useMemo(() => {
    return configsList.filter(row => {
      if (selectedCampus !== "all" && row.college_id !== selectedCampus) return false;
      if (selectedDayType !== "all" && row.day_type !== selectedDayType) return false;

      // Date range filtering
      if (dateRangeMode === "this_week") {
        if (row.dateStr < thisWeekBounds.startDate || row.dateStr > thisWeekBounds.endDate) return false;
      } else if (dateRangeMode === "next_week") {
        if (row.dateStr < nextWeekBounds.startDate || row.dateStr > nextWeekBounds.endDate) return false;
      } else if (dateRangeMode === "this_month") {
        if (row.dateStr < thisMonthBounds.startDate || row.dateStr > thisMonthBounds.endDate) return false;
      }

      // Search query filtering
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        const collegeName = (row.college_name || "").toLowerCase();
        const dateStr = (row.dateStr || "").toLowerCase();
        const dayOrder = (row.day_order || "").toLowerCase();
        const dayType = (row.day_type || "").toLowerCase();
        const notes = (row.notes || "").toLowerCase();
        const mode = (row.session_mode || "").toLowerCase();
        if (!collegeName.includes(q) && !dateStr.includes(q) && !dayOrder.includes(q) && !dayType.includes(q) && !notes.includes(q) && !mode.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [configsList, selectedCampus, selectedDayType, dateRangeMode, deferredSearch, thisWeekBounds, nextWeekBounds, thisMonthBounds]);

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Top Header & Alert Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-amber-500" />
            Campus Day Orders &amp; Operations Oversight
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Monitor institutional day order cycles, 5-day vs 6-day academic calendars, session modes, and attendance readiness across campuses.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAllDailyConfigs}
            disabled={isLoading}
            className="flex items-center gap-1.5 font-bold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Matrix
          </Button>
        </div>
      </div>

      {/* Schedule Gap Warning Banner */}
      {totalGapsCount > 0 && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-start gap-3 shadow-xs animate-fadeIn">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
              {totalGapsCount} Upcoming Working Day{totalGapsCount === 1 ? "" : "s"} Unconfigured Across Campuses
            </h4>
            <p className="text-[11px] text-amber-700 font-medium mt-0.5">
              Mentors are blocked from marking attendance on unconfigured dates. Campuses highlighted in amber require CM Day Order configuration.
            </p>
          </div>
        </div>
      )}

      {/* Campus Pulse Cards (Today's Active Day Order) */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Campus Pulse (Today: {todayStr})
          </span>
          {selectedCampus !== "all" && (
            <button
              type="button"
              onClick={() => setSelectedCampus("all")}
              className="text-[11px] font-bold text-amber-500 hover:text-amber-800 transition-colors cursor-pointer"
            >
              Show All Campuses
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {campusPulseList.map(cp => {
            const isSelected = selectedCampus === cp.id;
            const hasGap = cp.unconfiguredUpcoming > 0;
            const todayCfg = cp.todayConfig;

            return (
              <div
                key={cp.id}
                onClick={() => setSelectedCampus(isSelected ? "all" : cp.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                  isSelected
                    ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-500/20 shadow-md"
                    : "bg-white hover:bg-slate-50/80 border-slate-200/80 shadow-xs"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">
                      {cp.code}
                    </span>
                    <h3 className="text-xs font-black text-slate-900 truncate mt-0.5" title={cp.name}>
                      {cp.name}
                    </h3>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase shrink-0 ${
                    cp.workingDaysCount === 6
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}>
                    {cp.workingDaysCount}-Day Week
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Today&apos;s Order</span>
                    <span className="text-xs font-black text-slate-800">
                      {todayCfg ? (
                        todayCfg.day_order && todayCfg.day_order !== "None" ? (
                          todayCfg.day_order
                        ) : (
                          todayCfg.day_type ? todayCfg.day_type.replace("_", " ") : "Holiday"
                        )
                      ) : (
                        <span className="text-amber-600 font-bold">Unconfigured</span>
                      )}
                    </span>
                  </div>

                  {hasGap ? (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1" title={`${cp.unconfiguredUpcoming} upcoming dates missing`}>
                      <AlertTriangle className="h-3 w-3" /> {cp.unconfiguredUpcoming} Gap{cp.unconfiguredUpcoming === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[260px]">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search campus, date, day order, notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs py-1.5 h-8.5"
            />
          </div>

          {/* Campus Selector */}
          <Select
            aria-label="Campus Selector"
            value={selectedCampus}
            onChange={(e) => setSelectedCampus(e.target.value)}
            className="w-auto min-w-[150px] text-xs h-8.5 cursor-pointer"
          >
            <option value="all">All Campuses ({colleges.length})</option>
            {colleges.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </Select>

          {/* Day Type Selector */}
          <Select
            aria-label="Day Type Filter"
            value={selectedDayType}
            onChange={(e) => setSelectedDayType(e.target.value)}
            className="w-auto min-w-[130px] text-xs h-8.5 cursor-pointer"
          >
            <option value="all">All Day Types</option>
            <option value="working">Working Day</option>
            <option value="holiday">Holiday</option>
            <option value="event">Campus Event</option>
            <option value="exam_day">Exam Day</option>
          </Select>
        </div>

        {/* Date Range Mode Buttons */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setDateRangeMode("this_week")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              dateRangeMode === "this_week" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode("next_week")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              dateRangeMode === "next_week" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Next Week
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode("this_month")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              dateRangeMode === "this_month" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode("all")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              dateRangeMode === "all" ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All History
          </button>
        </div>
      </div>

      {/* Master Matrix Table */}
      <div className="border border-slate-200/80 rounded-2xl bg-white shadow-card overflow-hidden">
        <div className="p-3.5 bg-slate-50/80 border-b border-slate-200/80 flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Configured Operational Day Orders ({filteredRows.length} Records)
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              • Timeframe: {dateRangeMode === "this_week" ? `${thisWeekBounds.startDate} to ${thisWeekBounds.endDate}` : dateRangeMode === "next_week" ? `${nextWeekBounds.startDate} to ${nextWeekBounds.endDate}` : dateRangeMode === "this_month" ? `${thisMonthBounds.startDate} to ${thisMonthBounds.endDate}` : "All History"}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <Table containerClassName="overflow-visible" className="w-full text-left text-xs border-collapse">
            <TableHeader className="sticky top-0 bg-slate-100 z-10">
              <TableRow className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <TableHead className="p-3">Campus</TableHead>
                <TableHead className="p-3">Date &amp; Weekday</TableHead>
                <TableHead className="p-3">Day Type</TableHead>
                <TableHead className="p-3">Day Order</TableHead>
                <TableHead className="p-3">System</TableHead>
                <TableHead className="p-3">Session Mode</TableHead>
                <TableHead className="p-3">Operational Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="p-12 text-center text-slate-400 italic text-xs">
                    {configsList.length === 0
                      ? "No campus daily schedule records found. Campus Managers configure day orders via their CM Portal."
                      : "No records found matching the active filters or date range."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r) => {
                  const dateObj = new Date(r.dateStr + "T00:00:00");
                  const weekday = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                  const isToday = r.dateStr === todayStr;

                  return (
                    <TableRow
                      key={r.id || `${r.college_id}_${r.dateStr}`}
                      className={`transition-colors ${isToday ? "bg-amber-50/40" : "hover:bg-slate-50/60"}`}
                    >
                      <TableCell className="p-3 font-extrabold text-slate-800">
                        <span>{r.college_name || r.college_id}</span>
                      </TableCell>
                      <TableCell className="p-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{r.dateStr}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">({weekday})</span>
                          {isToday && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-zinc-900 text-white">
                              Today
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="p-3">
                        <Badge
                          variant={
                            r.day_type === "holiday"
                              ? "destructive"
                              : r.day_type === "event"
                              ? "warning"
                              : r.day_type === "exam_day"
                              ? "default"
                              : "success"
                          }
                          className="text-[9.5px] uppercase font-extrabold"
                        >
                          {r.day_type ? r.day_type.replace("_", " ") : "Working"}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-3 font-black text-slate-900">
                        {r.day_order || "None"}
                      </TableCell>
                      <TableCell className="p-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {Number(r.college_working_days) === 6 ? "6-Day" : "5-Day"}
                        </span>
                      </TableCell>
                      <TableCell className="p-3 font-semibold text-slate-700">
                        {r.session_mode || "Offline"}
                      </TableCell>
                      <TableCell className="p-3 text-slate-500 max-w-[240px] truncate" title={r.notes}>
                        {r.notes || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
