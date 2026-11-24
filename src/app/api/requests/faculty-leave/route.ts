export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb, readInChunks } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { checkMentorAvailability, loadAvailabilityContext, type AvailabilityContext } from "@/lib/availability";

// GET /api/requests/faculty-leave
// Faculty leave system has been decommissioned.
// This endpoint only retains the slot availability resolver for class substitution / handover reassignment.
export async function GET(request: Request) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    // Availability resolver for class substitution / handover reassignment
    const availableForSlotId = searchParams.get("availableForSlotId");
    const availableForDate = searchParams.get("availableForDate");
    const availableForCollegeId = searchParams.get("availableForCollegeId");
    const excludeMentorId = searchParams.get("excludeMentorId");

    if (availableForSlotId && availableForDate && availableForCollegeId) {
      const [slotRows, mentorRows] = await db.multiQuery([
        { sql: "SELECT * FROM slots WHERE id = ?", params: [availableForSlotId] },
        {
          sql: `SELECT id, name, department, email FROM mentors WHERE college_id = ? AND id != ? ORDER BY name`,
          params: [availableForCollegeId, excludeMentorId || ""]
        }
      ]);

      const slot = slotRows?.[0];
      if (!slot) {
        return NextResponse.json({ success: false, message: "Slot not found" }, { status: 404 });
      }

      const allMentors: any[] = mentorRows || [];
      const mentorIds = allMentors.map((m: any) => m.id);

      const sameSubjectRead = readInChunks(
        db,
        mentorIds,
        (chunk, ph) => ({
          sql: `SELECT DISTINCT mentorId FROM slots WHERE mentorId IN (${ph}) AND LOWER(course) = LOWER(?)`,
          params: [...chunk, slot.course]
        })
      ).catch(() => [] as any[]);

      const [sameSubjectRows, ctxResult] = await Promise.all([
        sameSubjectRead,
        loadAvailabilityContext(db, { mentorIds, dates: [availableForDate] })
          .then(c => ({ ctx: c as AvailabilityContext | null, error: null as any }))
          .catch(error => ({ ctx: null as AvailabilityContext | null, error }))
      ]);

      const availCtx = ctxResult.ctx;
      const sameSubjectIds = new Set<string>(sameSubjectRows.map((r: any) => String(r.mentorId ?? r.mentorid ?? "")));

      const available: any[] = [];
      for (const m of allMentors) {
        const result = await checkMentorAvailability(db, {
          mentorId: m.id,
          dateStr: availableForDate,
          timeSlot: slot.time,
          shift: slot.shift,
          ctx: availCtx ?? undefined
        });
        if (result.available) {
          available.push({ ...m, sameSubject: sameSubjectIds.has(String(m.id)) });
        }
      }
      available.sort((a, b) => (b.sameSubject ? 1 : 0) - (a.sameSubject ? 1 : 0));
      return NextResponse.json({ success: true, mentors: available });
    }

    // All standard faculty leave requests return empty — leave system decommissioned
    const records: any[] = [];
    const coversByLeave = new Map();
    records.forEach((rec: any) => {
      const covers = coversByLeave.get(rec.id) || [];
      rec.covers = covers;
    });

    return NextResponse.json({
      success: true,
      records,
      message: "Faculty leave system has been decommissioned."
    });
  } catch (error: any) {
    console.error("GET /api/requests/faculty-leave error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Leave application & leave approval decommissioned
export async function POST(request: Request) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    {
      success: false,
      message: "Faculty leave system has been decommissioned."
    },
    { status: 410 }
  );
}
