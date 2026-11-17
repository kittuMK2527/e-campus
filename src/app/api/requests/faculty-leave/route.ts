export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { checkMentorAvailability, loadAvailabilityContext } from "@/lib/availability";

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
        return NextResponse.json({ success: true, mentors: [] });
      }

      const mentors = mentorRows || [];
      const availCtx = await loadAvailabilityContext(db, {
        mentorIds: mentors.map((m: any) => m.id),
        dateStrs: [availableForDate],
      });

      const availableMentors = mentors.filter((m: any) => {
        const status = checkMentorAvailability(availCtx, m.id, availableForDate, slot.time);
        return status.available;
      });

      return NextResponse.json({ success: true, mentors: availableMentors });
    }

    // All standard faculty leave requests return empty — leave system decommissioned
    return NextResponse.json({
      success: true,
      records: [],
      message: "Faculty leave system has been decommissioned."
    });
  } catch (error: any) {
    console.error("GET /api/requests/faculty-leave error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Leave application & leave approval decommissioned
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message: "Faculty leave system has been decommissioned."
    },
    { status: 410 }
  );
}
