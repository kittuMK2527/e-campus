"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSurface } from "@/components/dashboard/TableSurface";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/apiFetch";
import {
  DAY_ORDERS,
  bandOfPeriodRows,
  readCompiledShiftPeriods,
  resolveSundayState,
  sundayOverridePayload,
  sundaysInMonth,
  type DailyConfigRow
} from "@/lib/sundaySchedule";

interface SundayScheduleCardProps {
  collegeId: string;
  /** The Schedules tab shows the outcome; Operations → Holidays is where it is set. */
  readOnly?: boolean;
}

interface MonthCursor {
  year: number;
  month: number;
}

interface SundayDraft {
  working: boolean;
  dayOrder: string;
}

const monthKey = ({ year, month }: MonthCursor) => `${year}-${String(month).padStart(2, "0")}`;

const shiftMonth = (cursor: MonthCursor, delta: number): MonthCursor => {
  const index = cursor.year * 12 + (cursor.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

const monthLabel = (cursor: MonthCursor) =>
  new Date(cursor.year, cursor.month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const dayLabel = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });

export const SundayScheduleCard: React.FC<SundayScheduleCardProps> = ({ collegeId, readOnly = false }) => {
  const { colleges, holidays, notifyDataChanged } = useApp();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const [cursor, setCursor] = useState<MonthCursor>({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [drafts, setDrafts] = useState<Record<string, SundayDraft>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const month = monthKey(cursor);
  const dates = useMemo(() => sundaysInMonth(month), [month]);

  const configsQuery = useQuery({
    queryKey: ["daily-configs", "sundays", collegeId, month],
    queryFn: () =>
      apiFetch<{ success: boolean; configs: DailyConfigRow[] }>(
        `/api/daily-configs?college_id=${encodeURIComponent(collegeId)}&search=${month}&limit=40`
      ),
    enabled: !!collegeId
  });

  const college = colleges.find(c => c.id === collegeId);
  const periods = useMemo(() => readCompiledShiftPeriods(college?.shift_configs), [college]);
  const band = useMemo(() => bandOfPeriodRows(periods.general), [periods]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    (holidays || []).forEach((h: any) => {
      const date = String(h?.date || h?.dateStr || "").slice(0, 10);
      const scope = h?.college_id;
      if (!date || (scope && scope !== collegeId)) return;
      map.set(date, String(h?.title || h?.name || "College holiday"));
    });
    return map;
  }, [holidays, collegeId]);

  const rows = useMemo(() => {
    const byDate = new Map<string, DailyConfigRow>();
    (configsQuery.data?.configs || []).forEach(c => {
      if (c?.dateStr) byDate.set(String(c.dateStr).slice(0, 10), c);
    });
    return dates.map(dateStr => {
      const state = resolveSundayState(dateStr, byDate.get(dateStr), holidayByDate.get(dateStr));
      const draft = drafts[dateStr];
      return {
        ...state,
        working: draft ? draft.working : state.status === "working",
        dayOrder: draft ? draft.dayOrder : state.dayOrder || DAY_ORDERS[0],
        dirty: !!draft
      };
    });
  }, [dates, configsQuery.data, holidayByDate, drafts]);

  const saveRow = async (row: (typeof rows)[number]) => {
    setSavingDate(row.dateStr);
    try {
      await apiFetch("/api/daily-configs", {
        method: "POST",
        body: sundayOverridePayload(collegeId, {
          dateStr: row.dateStr,
          working: row.working,
          dayOrder: row.dayOrder
        })
      });
      toast(
        row.working
          ? `${dayLabel(row.dateStr)} now runs as a working ${row.dayOrder}.`
          : `${dayLabel(row.dateStr)} is closed again.`,
        "success"
      );
      setDrafts(prev => {
        const next = { ...prev };
        delete next[row.dateStr];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["daily-configs", "sundays", collegeId, month] });
      notifyDataChanged("daily-configs");
    } catch (err: any) {
      toast(err.message || "Could not save this Sunday.", "error");
    } finally {
      setSavingDate(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-100 bg-white shadow-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
            <CalendarX2 className="h-4 w-4 text-indigo-600" />
            Sunday working days
          </h3>
          <p className="mt-0.5 max-w-3xl text-[11px] font-semibold text-slate-500">
            Sundays stay closed until a date is marked working here with a day order. A working Sunday runs the
            campus&rsquo;s compiled shift timing shown below — Sundays never get separate hours, and a holiday entry on
            the same date still keeps the campus closed.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCursor(c => shiftMonth(c, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[132px] text-center text-xs font-extrabold text-slate-700">{monthLabel(cursor)}</span>
          <Button variant="ghost" size="icon" onClick={() => setCursor(c => shiftMonth(c, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] font-bold text-slate-600">
        {!collegeId ? (
          <span className="text-slate-400">Choose a campus to see its Sundays.</span>
        ) : configsQuery.isLoading ? (
          <span className="text-slate-400">Loading this campus&rsquo;s schedule…</span>
        ) : configsQuery.isError ? (
          <span className="flex items-center gap-1.5 text-rose-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            Could not read the schedule. {(configsQuery.error as Error)?.message || ""}
          </span>
        ) : (
          <>
            <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">
              {band ? `Timing ${band.start} – ${band.end} · ${band.periods} general periods` : "Timing: institution default (campus has no compiled shift config)"}
            </span>
            {periods.configured && (periods.shift_1.length > 0 || periods.shift_2.length > 0) && (
              <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">
                Shift 1: {periods.shift_1.length} · Shift 2: {periods.shift_2.length} periods
              </span>
            )}
            <span className="rounded-md bg-white px-2 py-1 ring-1 ring-slate-200">
              Working this month: {rows.filter(r => r.status === "working").length} of {rows.length}
            </span>
          </>
        )}
      </div>

      {!collegeId || rows.length === 0 ? null : (
      <TableSurface>
        <TableHeader>
          <TableRow>
            <TableHead>Sunday</TableHead>
            <TableHead>Open for classes</TableHead>
            <TableHead>Day order</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.dateStr}>
              <TableCell className="font-bold text-slate-900">{dayLabel(row.dateStr)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  {readOnly ? (
                    <Badge variant={row.status === "working" ? "success" : "secondary"}>
                      {row.status === "working" ? "Working" : "Closed"}
                    </Badge>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.working}
                        onChange={e =>
                          setDrafts(prev => ({
                            ...prev,
                            [row.dateStr]: { working: e.target.checked, dayOrder: row.dayOrder }
                          }))
                        }
                        aria-label={`Open ${dayLabel(row.dateStr)} for classes`}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-[#4F46E5]/40"
                      />
                      <Badge variant={row.working ? "success" : "secondary"}>
                        {row.working ? "Working" : "Closed"}
                      </Badge>
                    </label>
                  )}
                  {row.status === "blocked" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      {row.holidayTitle} keeps this date closed
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {readOnly || !row.working ? (
                  <span className="font-semibold text-slate-500">{row.dayOrder || "—"}</span>
                ) : (
                  <Select
                    aria-label={`Day order for ${dayLabel(row.dateStr)}`}
                    value={row.dayOrder}
                    onChange={e =>
                      setDrafts(prev => ({ ...prev, [row.dateStr]: { working: true, dayOrder: e.target.value } }))
                    }
                    className="w-auto min-w-[110px] cursor-pointer"
                  >
                    {DAY_ORDERS.map(order => (
                      <option key={order} value={order}>
                        {order}
                      </option>
                    ))}
                  </Select>
                )}
              </TableCell>
              <TableCell className="text-right">
                {readOnly ? (
                  <span className="text-[10px] font-semibold text-slate-400">Set in Operations → Holidays</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!row.dirty || savingDate === row.dateStr}
                    isLoading={savingDate === row.dateStr}
                    loadingText="Saving…"
                    onClick={() => saveRow(row)}
                    className="cursor-pointer"
                  >
                    Save
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableSurface>
      )}
    </section>
  );
};

export default SundayScheduleCard;
