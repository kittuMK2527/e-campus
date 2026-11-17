export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr, parseLocalDate, shiftDateStr } from "@/lib/localDate";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";
import { getWeekBoundaries } from "@/lib/dailyConfigForm";
import crypto from "crypto";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

/** Widest date range one request may configure; keeps the fan-out bounded. */
const MAX_CONFIG_DATES = 92;
const NOTIFY_CHUNK = 200;
const CONFIG_CHUNK = 100;

function chunkBy<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * One statement per chunk instead of one per row. A campus of 1,500 students and
 * mentors over a 7-day range used to be 10,500 sequential INSERT round trips.
 */
async function bulkUpsertDailyConfigs(db: any, rows: any[][]) {
  for (const chunk of chunkBy(rows, CONFIG_CHUNK)) {
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)").join(", ");
    const params = chunk.flat();
    await db.run(
      `INSERT INTO campus_daily_configs (id, college_id, dateStr, day_type, day_order, session_mode, notes, updated_at)
       VALUES ${values}
       ON CONFLICT (id) DO UPDATE SET
         college_id = EXCLUDED.college_id,
         dateStr = EXCLUDED.dateStr,
         day_type = EXCLUDED.day_type,
         day_order = EXCLUDED.day_order,
         session_mode = EXCLUDED.session_mode,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP`,
      params
    );
  }
}

async function handleAutoAdaptNextWeek(db: any, body: any) {
  const { college_id, reference_date } = body;
  const skip_sundays = body.skip_sundays === true || body.skip_sundays === "true" || body.skip_sundays === undefined;

  if (!college_id) {
    return NextResponse.json({ success: false, message: "college_id is required" }, { status: 400, headers: noCacheHeaders });
  }

  // Look up campus working days (5-day vs 6-day campus)
  const collegeRow = await db.get("SELECT working_days FROM colleges WHERE id = ?", [college_id]);
  const workingDaysCount = (collegeRow && Number(collegeRow.working_days) === 6) ? 6 : 5;
  const dayOrders = Array.from({ length: workingDaysCount }, (_, idx) => `Day ${idx + 1}`);

  // Reference week boundaries in institution timezone
  const refDateStr = reference_date || getInstitutionDateStr();
  const refWeek = getWeekBoundaries(refDateStr);
  const refDates = refWeek.weekDates;

  // Next week starts exactly 7 days after reference Monday
  const nextMondayStr = shiftDateStr(refWeek.startDate, 7);
  const nextWeek = getWeekBoundaries(nextMondayStr);
  const nextDates = nextWeek.weekDates;

  // Fetch reference week configs
  const refConfigs = await db.all(
    "SELECT * FROM campus_daily_configs WHERE college_id = ? AND dateStr IN (?, ?, ?, ?, ?, ?, ?)",
    [college_id, ...refDates]
  );

  // Map reference configs by date
  const refConfigMap = new Map<string, any>();
  refConfigs.forEach((c: any) => refConfigMap.set(c.dateStr, c));

  // Find the last working day order of reference week to continue the sequence
  let lastDayOrderIndex = -1;
  for (let i = 6; i >= 0; i--) {
    const refConfig = refConfigMap.get(refDates[i]);
    if (refConfig && refConfig.day_order && refConfig.day_order !== "None" && refConfig.day_type !== "holiday") {
      const match = refConfig.day_order.match(/^Day (\d+)$/i);
      if (match) {
        lastDayOrderIndex = (parseInt(match[1], 10) - 1) % workingDaysCount;
        break;
      }
    }
  }

  // If reference week has no configured day orders, check the latest configured working day order before next week
  if (lastDayOrderIndex === -1) {
    const latestConfig = await db.get(
      "SELECT day_order FROM campus_daily_configs WHERE college_id = ? AND day_order != 'None' AND day_order LIKE 'Day %' AND dateStr < ? ORDER BY dateStr DESC LIMIT 1",
      [college_id, nextDates[0]]
    );
    if (latestConfig?.day_order) {
      const match = latestConfig.day_order.match(/^Day (\d+)$/i);
      if (match) {
        lastDayOrderIndex = (parseInt(match[1], 10) - 1) % workingDaysCount;
      }
    }
  }

  let dayOrderCounter = lastDayOrderIndex !== -1 ? lastDayOrderIndex + 1 : 0;
  const insertedConfigs: any[] = [];
  const configRows: any[][] = [];

  for (let i = 0; i < nextDates.length; i++) {
    const nextDateStr = nextDates[i];
    const dateObj = parseLocalDate(nextDateStr);
    const isSunday = dateObj.getDay() === 0;
    const isSaturday = dateObj.getDay() === 6;
    const id = `${college_id}_${nextDateStr}`;

    let dayType = "working";
    let dayOrder = "None";
    const sessionMode = "Offline";
    let notesVal = "";

    // Weekend rules: Sunday is always holiday; Saturday is holiday on 5-day campus or if skip_sundays is set
    const isWeekendToSkip = isSunday || (workingDaysCount === 5 && isSaturday) || (skip_sundays && isSaturday);

    if (isWeekendToSkip) {
      dayType = "holiday";
      dayOrder = "None";
      notesVal = isSunday ? "Sunday Weekend" : "Saturday Weekend";
    } else {
      dayType = "working";
      dayOrder = dayOrders[dayOrderCounter % workingDaysCount];
      dayOrderCounter++;
    }

    configRows.push([id, college_id, nextDateStr, dayType, dayOrder, sessionMode, notesVal]);
    insertedConfigs.push({ dateStr: nextDateStr, dayType, dayOrder });
  }

  await bulkUpsertDailyConfigs(db, configRows);

  // Dispatch campus-wide notifications and background mobile Web Push
  try {
    const title = "Next Week Schedule Auto-Configured";
    const message = `The campus schedule for next week (${nextDates[0]} to ${nextDates[6]}) has been automatically configured (${insertedConfigs.length} days). Please review your timetable.`;

    await dispatchSystemNotification(db, {
      userIds: [body.user_id, body.userId].filter(Boolean),
      roles: ["cm", "mentor", "student", "admin", "kam"],
      collegeId: college_id,
      title,
      message,
      link: `/schedule?week=${nextDates[0]}`,
      type: "info",
      action: "daily_config_auto_adapted"
    });

    notifyRealtimeEvent({
      domain: "daily_configs",
      action: "updated",
      collegeId: college_id || undefined,
      payload: { title, message }
    });
  } catch (errNotif) {
    console.error("Failed to write auto-adapt notifications:", errNotif);
  }

  return NextResponse.json({
    success: true,
    message: `Next week schedule auto-configured successfully (${insertedConfigs.length} days)`,
    configs: insertedConfigs,
    week_start: nextDates[0],
    week_end: nextDates[6]
  }, { headers: noCacheHeaders });
}

export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse || !auth) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const requestedCollegeId = searchParams.get("college_id");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 200;
    const search = searchParams.get("search");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Role-based campus isolation: A CM may only view their assigned college
    const isSuper = auth.user.isSuperAdmin || auth.user.role === "admin";
    let collegeId = requestedCollegeId;
    if (!isSuper && auth.user.role === "cm" && auth.user.college_id) {
      collegeId = auth.user.college_id;
    }

    if (!collegeId && !isSuper) {
      return NextResponse.json({ success: false, message: "college_id is required" }, { status: 400, headers: noCacheHeaders });
    }

    let query = "SELECT c.*, col.name as college_name, col.working_days as college_working_days FROM campus_daily_configs c LEFT JOIN colleges col ON c.college_id = col.id WHERE 1=1";
    let params: any[] = [];

    if (collegeId && collegeId !== "all") {
      query += " AND c.college_id = ?";
      params.push(collegeId);
    }

    if (startDate) {
      query += " AND c.dateStr >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND c.dateStr <= ?";
      params.push(endDate);
    }

    if (search) {
      query += " AND (c.dateStr LIKE ? OR c.day_type LIKE ? OR c.day_order LIKE ? OR c.notes LIKE ?)";
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    query += " ORDER BY c.dateStr DESC LIMIT ?";
    params.push(limit);

    const configs = await db.all(query, ...params);

    return NextResponse.json({ success: true, configs }, { headers: noCacheHeaders });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: noCacheHeaders });
  }
}

export async function POST(request: Request) {
  // MAIL-H02 Fix: Add authentication check
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ["admin", "cm", "kam"],
    checkCsrf: true
  });
  if (errorResponse || !auth) return errorResponse;

  try {
    const db = await getDb();
    const body = await request.json();
    const { college_id, dateStr, startDate, endDate, day_type, day_order, notes, session_mode, auto_advance, action } = body;

    // Handle auto-adapt next week action
    if (action === "auto_adapt_next_week") {
      return await handleAutoAdaptNextWeek(db, body);
    }

    const effectiveDayOrder = day_type === "holiday" ? "None" : (day_order || "None");

    if (!college_id || (!dateStr && (!startDate || !endDate)) || !day_type) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    // Look up campus working days (5-day vs 6-day campus)
    const collegeRow = await db.get("SELECT working_days FROM colleges WHERE id = ?", [college_id]);
    const workingDaysCount = (collegeRow && Number(collegeRow.working_days) === 6) ? 6 : 5;
    const dayOrders = Array.from({ length: workingDaysCount }, (_, idx) => `Day ${idx + 1}`);

    // Build array of dates to process
    const datesToProcess: string[] = [];
    if (startDate && endDate) {
      let cur = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      while (cur <= end && datesToProcess.length <= MAX_CONFIG_DATES) {
        datesToProcess.push(getInstitutionDateStr(cur));
        cur.setDate(cur.getDate() + 1);
      }
      if (cur <= end) {
        return NextResponse.json({
          success: false,
          message: `Date range too large: configure at most ${MAX_CONFIG_DATES} days in one request.`
        }, { status: 400 });
      }
    } else if (dateStr) {
      datesToProcess.push(dateStr);
    }

    // Determine initial Day Order index within this campus's working day count
    let initialIndex = dayOrders.indexOf(effectiveDayOrder);
    if (initialIndex === -1 && effectiveDayOrder.startsWith("Day")) {
      const match = effectiveDayOrder.match(/^Day (\d+)$/i);
      if (match) {
        initialIndex = (parseInt(match[1], 10) - 1) % workingDaysCount;
      }
    }

    let dayOrderCounter = initialIndex !== -1 ? initialIndex : 0;

    const sessionModeVal = session_mode || "Offline";
    const notesVal = notes || "";
    const configRows: any[][] = [];
    const dayPlans: { dStr: string; dayType: string; dayOrder: string }[] = [];

    for (let i = 0; i < datesToProcess.length; i++) {
      const dStr = datesToProcess[i];
      const id = `${college_id}_${dStr}`;
      const dateObj = new Date(dStr + "T00:00:00");
      const isSunday = dateObj.getDay() === 0;
      const isSaturday = dateObj.getDay() === 6;

      let currentDayType = day_type;
      let currentDayOrder = effectiveDayOrder;

      // Handle weekend skipping (Sunday always; Saturday if 5-day campus and skipping weekends)
      const shouldSkipSundays = body.skip_sundays === true || body.skip_sundays === "true" || body.skip_sundays === undefined;
      const shouldAutoAdvance = auto_advance !== false && auto_advance !== "false" && auto_advance !== 0;

      const isWeekendToSkip = (shouldSkipSundays && isSunday) ||
        (workingDaysCount === 5 && shouldSkipSundays && isSaturday);

      if (effectiveDayOrder === "None" || effectiveDayOrder === "none") {
        // If explicitly set to None, force None for all dates in range without cycling
        currentDayOrder = "None";
      } else if (day_type === "holiday" || day_type === "event" || isWeekendToSkip) {
        // Holidays, events, or auto-skipped weekends get None and DO NOT advance the working day order counter!
        if (isWeekendToSkip && day_type === "working") {
          currentDayType = "holiday";
        }
        currentDayOrder = "None";
      } else if (shouldAutoAdvance && initialIndex !== -1) {
        // Continuous next day sequence modulo campus working day count (e.g. Day 1 -> Day 5 on 5-day campus)
        currentDayOrder = dayOrders[dayOrderCounter % workingDaysCount];
        dayOrderCounter++;
      }

      configRows.push([id, college_id, dStr, currentDayType, currentDayOrder, sessionModeVal, notesVal]);
      dayPlans.push({ dStr, dayType: currentDayType, dayOrder: currentDayOrder });
    }

    await bulkUpsertDailyConfigs(db, configRows);

    // Dispatch campus-wide notifications and background mobile Web Push for every configured day
    try {
      if (dayPlans.length === 1) {
        const plan = dayPlans[0];
        const displayType = plan.dayType === "holiday" ? "Holiday" : plan.dayType === "event" ? "Event" : plan.dayType === "exam_day" ? "Exam Day" : "Working Day";
        const orderLabel = plan.dayOrder === "None" ? "No Day Order" : plan.dayOrder;
        const title = `Day Order Update: ${plan.dStr} (${orderLabel})`;
        const message = `Day Order for ${plan.dStr} is set as ${orderLabel} (${displayType}) in ${sessionModeVal} mode.${notesVal ? ` Notes: ${notesVal}` : ""}`;
        const notifType = plan.dayType === "holiday" ? "warning" : "info";

        await dispatchSystemNotification(db, {
          userIds: [auth.user.id, auth.user.reference_id].filter(Boolean) as string[],
          roles: ["cm", "mentor", "student", "admin", "kam"],
          collegeId: college_id,
          title,
          message,
          link: `/schedule?date=${plan.dStr}`,
          type: notifType,
          action: "daily_config_updated"
        });
      } else if (dayPlans.length > 1) {
        const first = dayPlans[0];
        const last = dayPlans[dayPlans.length - 1];
        const title = `Campus Schedule Updated (${dayPlans.length} days)`;
        const message = `Campus Day Order schedule from ${first.dStr} to ${last.dStr} has been configured in ${sessionModeVal} mode.${notesVal ? ` Notes: ${notesVal}` : ""}`;

        await dispatchSystemNotification(db, {
          userIds: [auth.user.id, auth.user.reference_id].filter(Boolean) as string[],
          roles: ["cm", "mentor", "student", "admin", "kam"],
          collegeId: college_id,
          title,
          message,
          link: `/schedule?date=${first.dStr}`,
          type: "info",
          action: "daily_config_updated"
        });
      }

      notifyRealtimeEvent({
        domain: "daily_configs",
        action: "updated",
        collegeId: college_id || undefined,
        payload: { count: dayPlans.length }
      });
    } catch (errNotif) {
      console.error("Failed to write daily-config notifications:", errNotif);
    }

    return NextResponse.json({ success: true, message: "Daily configuration saved successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm", "kam"] });
    if (errorResponse || !auth) return errorResponse;

    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const requestedCollegeId = searchParams.get("college_id") || searchParams.get("collegeId");
    const isSuper = auth.user.isSuperAdmin || auth.user.role === "admin";
    const collegeId = (!isSuper && auth.user.role === "cm" && auth.user.college_id)
      ? auth.user.college_id
      : requestedCollegeId;

    const dateStr = searchParams.get("dateStr");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (id) {
      await db.run("DELETE FROM campus_daily_configs WHERE id = ?", id);
      if (collegeId && dateStr) {
        await db.run("DELETE FROM campus_daily_configs WHERE college_id = ? AND dateStr = ?", collegeId, dateStr);
      }
    } else if (collegeId && startDate && endDate) {
      await db.run(
        "DELETE FROM campus_daily_configs WHERE college_id = ? AND dateStr >= ? AND dateStr <= ?",
        collegeId, startDate, endDate
      );
    } else if (collegeId && dateStr) {
      await db.run("DELETE FROM campus_daily_configs WHERE college_id = ? AND dateStr = ?", collegeId, dateStr);
    } else {
      return NextResponse.json({ success: false, message: "Missing id, dateStr, or (startDate and endDate)" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Daily configuration deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
