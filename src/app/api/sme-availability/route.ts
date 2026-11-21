export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { mapDayOrderToDayName } from "@/lib/utils";

async function ensureTable(db: any) {
  // Schema + seed handled by the centralized migration runner (once per process)
  await ensureMigration("sme_availability_table");
  await ensureMigration("sme_availability_seed");
}

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureTable(db);
    const { searchParams } = new URL(req.url);
    const smeId = searchParams.get("smeId");
    const day = searchParams.get("day");
    const slotType = searchParams.get("slotType");

    let sql = "SELECT * FROM sme_availability WHERE 1=1";
    const params: any[] = [];

    if (smeId) {
      sql += " AND sme_id = ?";
      params.push(smeId);
    }
    if (day) {
      const mapped = mapDayOrderToDayName(day, "");
      const weekdayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(day.toLowerCase().trim()) + 1;
      const dayOrderStr = weekdayOrder > 0 ? `Day ${weekdayOrder}` : day;
      sql += " AND (LOWER(TRIM(day_of_week)) = LOWER(TRIM(?)) OR LOWER(TRIM(day_of_week)) = LOWER(TRIM(?)) OR UPPER(TRIM(day_of_week)) = UPPER(TRIM(?)))";
      params.push(day, mapped || day, dayOrderStr);
    }
    if (slotType) {
      sql += " AND (slot_type = ? OR slot_type = 'both')";
      params.push(slotType);
    }

    sql += " ORDER BY day_of_week, start_time";
    const availability = await db.all(sql, ...params);

    return NextResponse.json({ success: true, availability });
  } catch (error: any) {
    console.error("Error fetching SME availability:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, { allowedRoles: ["sme", "cm", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    await ensureTable(db);
    const body = await req.json();
    const { smeId, windows, day } = body;

    if (!smeId) {
      return NextResponse.json({ success: false, error: "Missing smeId" }, { status: 400 });
    }

    // If a specific day is passed, clear that day's windows (handling both Day Order & Weekday Name) and re-insert
    if (day) {
      const mapped = mapDayOrderToDayName(day, "");
      const weekdayOrder = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(day.toLowerCase().trim()) + 1;
      const dayOrderStr = weekdayOrder > 0 ? `Day ${weekdayOrder}` : day;
      await db.run(
        "DELETE FROM sme_availability WHERE sme_id = ? AND (LOWER(TRIM(day_of_week)) = LOWER(TRIM(?)) OR LOWER(TRIM(day_of_week)) = LOWER(TRIM(?)) OR UPPER(TRIM(day_of_week)) = UPPER(TRIM(?)))",
        [smeId, day, mapped || day, dayOrderStr]
      );
      if (Array.isArray(windows)) {
        for (const w of windows) {
          if (w.startTime && w.endTime) {
            const id = w.id || generateId(`sme_avail_${smeId}_${day.toLowerCase()}`);
            const sType = w.slotType || w.slot_type || "demo";
            const notes = w.notes || w.customLabel || null;
            await db.run(
              "INSERT INTO sme_availability (id, sme_id, day_of_week, start_time, end_time, slot_type, notes, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
              [id, smeId, day, w.startTime, w.endTime, sType, notes, w.isActive !== undefined ? (w.isActive ? 1 : 0) : 1]
            );
          }
        }
      }
    } else if (Array.isArray(windows)) {
      // Bulk update: Clear all for this SME and re-insert
      await db.run("DELETE FROM sme_availability WHERE sme_id = ?", smeId);
      for (const w of windows) {
        if (w.day && w.startTime && w.endTime) {
          const id = w.id || generateId(`sme_avail_${smeId}_${w.day.toLowerCase()}`);
          const sType = w.slotType || w.slot_type || "demo";
          const notes = w.notes || w.customLabel || null;
          await db.run(
            "INSERT INTO sme_availability (id, sme_id, day_of_week, start_time, end_time, slot_type, notes, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [id, smeId, w.day, w.startTime, w.endTime, sType, notes, w.isActive !== undefined ? (w.isActive ? 1 : 0) : 1]
          );
        }
      }
    }

    const updated = await db.all("SELECT * FROM sme_availability WHERE sme_id = ? ORDER BY day_of_week, start_time", smeId);
    return NextResponse.json({ success: true, availability: updated });
  } catch (error: any) {
    console.error("Error saving SME availability:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, { allowedRoles: ["sme", "cm", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const smeId = searchParams.get("smeId");
    const day = searchParams.get("day");

    if (id) {
      await db.run("DELETE FROM sme_availability WHERE id = ?", id);
    } else if (smeId && day) {
      await db.run("DELETE FROM sme_availability WHERE sme_id = ? AND LOWER(day_of_week) = LOWER(?)", smeId, day);
    } else {
      return NextResponse.json({ success: false, error: "Missing id or smeId + day" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting SME availability window:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
