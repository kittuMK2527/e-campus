export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { getInstitutionDateStr, parseLocalDate } from "@/lib/localDate";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";
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
  const { college_id, reference_date, skip_sundays = false } = body;
  
  if (!college_id) {
    return NextResponse.json({ success: false, message: "college_id is required" }, { status: 400, headers: noCacheHeaders });
  }

  // Determine reference week (default: current week)
  const refDate = reference_date ? new Date(reference_date) : new Date();
  const refDayOfWeek = refDate.getDay(); // 0=Sun, 1=Mon, ...
  const refMonday = new Date(refDate);
  refMonday.setDate(refDate.getDate() - (refDayOfWeek === 0 ? 6 : refDayOfWeek - 1));
  
  // Next week starts 7 days after reference Monday
  const nextMonday = new Date(refMonday);
  nextMonday.setDate(refMonday.getDate() + 7);

  // Fetch reference week configs
  const refDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(refMonday);
    d.setDate(refMonday.getDate() + i);
    refDates.push(getInstitutionDateStr(d));
  }

  const refConfigs = await db.all(
    "SELECT * FROM campus_daily_configs WHERE college_id = ? AND dateStr IN (?, ?, ?, ?, ?, ?, ?)",
    [college_id, ...refDates]
  );

  if (refConfigs.length === 0) {
    return NextResponse.json({ 
      success: false, 
      message: "No configuration found for reference week. Please configure the current week first." 
    }, { status: 400, headers: noCacheHeaders });
  }

  // Map reference configs by date
  const refConfigMap = new Map<string, any>();
  refConfigs.forEach((c: any) => refConfigMap.set(c.dateStr, c));

  // Find the last day order of reference week to continue the sequence
  const dayOrders = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"];
  let lastDayOrderIndex = -1;
  for (let i = 6; i >= 0; i--) {
    const refConfig = refConfigMap.get(refDates[i]);
    if (refConfig && refConfig.day_order && refConfig.day_order !== "None") {
      const match = refConfig.day_order.match(/^Day (\d+)$/);
      if (match) {
        lastDayOrderIndex = parseInt(match[1], 10) - 1;
        break;
      }
    }
  }

  // Generate next week configs
  const nextDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nextMonday);
    d.setDate(nextMonday.getDate() + i);
    nextDates.push(getInstitutionDateStr(d));
  }

  let dayOrderCounter = lastDayOrderIndex + 1;
  const insertedConfigs: any[] = [];
  const configRows: any[][] = [];

  for (let i = 0; i < nextDates.length; i++) {
    const nextDateStr = nextDates[i];
    const refDateStr = refDates[i];
    const refConfig = refConfigMap.get(refDateStr);
    const dateObj = new Date(nextDateStr + "T00:00:00");
    const isSunday = dateObj.getDay() === 0;
    const id = `${college_id}_${nextDateStr}`;

    let dayType = refConfig?.day_type || "working";
    let dayOrder = refConfig?.day_order || "None";
    const sessionMode = refConfig?.session_mode || "Offline";
    const notesVal = refConfig?.notes || "";

    // Handle Sunday skipping
    if (skip_sundays && isSunday) {
      dayType = "holiday";
      dayOrder = "None";
    } else if (dayType === "working" && dayOrder !== "None") {
      // Continue day order sequence
      dayOrder = dayOrders[dayOrderCounter % 6];
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

    if (!requestedCollegeId) {
      return NextResponse.json({ success: false, message: "college_id is required" }, { status: 400, headers: noCacheHeaders });
    }

    // Role-based campus isolation: A CM may only view their assigned college
    const isSuper = auth.user.isSuperAdmin || auth.user.role === "admin";
    let collegeId = requestedCollegeId;
    if (!isSuper && auth.user.role === "cm" && auth.user.college_id) {
      collegeId = auth.user.college_id;
    }

    let query = "SELECT * FROM campus_daily_configs WHERE college_id = ?";

    let params: any[] = [collegeId];

    if (search) {
      query += " AND (dateStr LIKE ? OR day_type LIKE ? OR day_order LIKE ? OR notes LIKE ?)";
      const pattern = `%${search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    query += " ORDER BY dateStr DESC LIMIT ?";
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

    // Day order sequence cycle: Day 1 -> Day 2 -> Day 3 -> Day 4 -> Day 5 -> Day 6
    const dayOrders = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"];
    let initialIndex = dayOrders.indexOf(effectiveDayOrder);

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

      let currentDayType = day_type;
      let currentDayOrder = effectiveDayOrder;

      if (effectiveDayOrder === "None" || effectiveDayOrder === "none") {
        // If explicitly set to None, force None for all dates in range without cycling
        currentDayOrder = "None";
      } else if (day_type === "holiday" || day_type === "event" || (body.skip_sundays === true && isSunday)) {
        // Holidays, events, or auto-skipped Sundays get None and DO NOT advance the working day order counter!
        if (isSunday && day_type === "working") {
          currentDayType = "holiday";
        }
        currentDayOrder = "None";
      } else if (auto_advance !== false && initialIndex !== -1) {
        // Continuous next day sequence starting from chosen Day Order (e.g. Day 3 -> Day 4 -> Day 5 -> Day 6 -> Day 1 -> Day 2)
        currentDayOrder = dayOrders[dayOrderCounter % 6];
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
