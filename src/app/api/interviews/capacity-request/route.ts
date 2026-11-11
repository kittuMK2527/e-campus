export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { getDb, type QueryFailure } from "@/lib/db";
import { notifyExternalInterviewsAfterResponse } from "@/lib/interview-notifications";
import { generateId } from "@/lib/id";

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin", "mentor", "sme", "L and D"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();

    const { interview_id, cm_id, cm_name } = body;

    if (!interview_id) {
      return NextResponse.json({ success: false, message: "Missing interview_id" }, { status: 400 });
    }

    const interview = await db.get("SELECT * FROM student_interviews WHERE id = ?", [interview_id]);
    if (!interview) {
      return NextResponse.json({ success: false, message: "Interview request not found" }, { status: 404 });
    }

    // Broadcast is a one-time transition out of the origin-CM stage; re-running it later
    // would drag an assigned or completed interview back to pending_cm_acceptance.
    if (interview.status !== "pending_origin_cm" && interview.status !== "pending_external_cm" && interview.status !== "draft") {
      return NextResponse.json(
        { success: false, message: `Capacity has already been requested for this interview (status: ${String(interview.status || "unknown").replace(/_/g, " ")}).` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    // Find origin college & KAM
    const originCollege = await db.get(
      "SELECT * FROM colleges WHERE id = ?",
      [interview.origin_college_id || interview.college_id]
    );
    const originId = originCollege?.id || interview.origin_college_id || interview.college_id;
    const kamId = originCollege?.kam_id;

    // 1. Fetch partner colleges under the same KAM (excluding origin college)
    let regionalColleges = kamId
      ? await db.all("SELECT * FROM colleges WHERE kam_id = ? AND id != ?", [kamId, originId])
      : [];

    // 2. Fallback: If no other colleges share this specific KAM zone, broadcast to all other partner colleges in network
    if (!regionalColleges || regionalColleges.length === 0) {
      regionalColleges = await db.all("SELECT * FROM colleges WHERE id != ?", [originId]);
    }

    if (!regionalColleges || regionalColleges.length === 0) {
      return NextResponse.json(
        { success: false, message: "No other partner colleges found in the network to broadcast capacity requests to." },
        { status: 400 }
      );
    }

    // Insert pending CM capacity request rows for each regional college.
    // Batched: single IN(...) query for CMs + single query for existing
    // responses, then multi-row INSERT (was 2 queries per college in a loop).
    const responseRows: any[][] = [];
    if (regionalColleges.length > 0) {
      const collegeIds = regionalColleges.map(c => c.id);
      const placeholders = collegeIds.map(() => "?").join(",");

      const cmRowsFailures: QueryFailure[] = [];
      const [cmRows, existingRows] = await db.multiQuery(
        [
          {
            sql: `SELECT college_id, id, name FROM campus_managers WHERE college_id IN (${placeholders}) ORDER BY id ASC`,
            params: collegeIds,
          },
          {
            sql: `SELECT college_id FROM cam_capacity_responses WHERE interview_id = ? AND college_id IN (${placeholders})`,
            params: [interview_id, ...collegeIds],
          },
        ],
        cmRowsFailures
      );
      if (cmRowsFailures.length > 0) {
        // A missed existing-response slice would re-send a request the CM already
        // answered; a missed CM slice falls back to a synthetic cam_id nobody can act on.
        return NextResponse.json(
          { success: false, message: "Could not build the regional capacity request. Please try again." },
          { status: 500 }
        );
      }
      const camByCollege = new Map<string, any>();
      for (const cam of cmRows) {
        if (!camByCollege.has(cam.college_id)) camByCollege.set(cam.college_id, cam);
      }

      const existingSet = new Set(existingRows.map((r: any) => r.college_id));

      const toInsert = regionalColleges.filter(col => !existingSet.has(col.id));
      for (const col of toInsert) {
        const primaryCam = camByCollege.get(col.id) || { id: `cam_${col.id}`, name: `${col.name} CM` };
        responseRows.push([
          generateId("cap"), interview_id, col.id, col.name, primaryCam.id, primaryCam.name,
          0, 0, 0, "pending", now, now
        ]);
      }
    }

    // The broadcast status and the request rows reach the database together: a failure
    // between them used to leave CMs with nowhere to respond.
    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE student_interviews 
         SET status = 'pending_cm_acceptance', updated_at = ?
         WHERE id = ?`,
        [now, interview_id]
      );
      for (let i = 0; i < responseRows.length; i += 200) {
        const part = responseRows.slice(i, i + 200);
        await tx.run(
          `INSERT INTO cam_capacity_responses (
            id, interview_id, college_id, college_name, cam_id, cam_name,
            accepted_student_capacity, actual_available_capacity, unfulfilled_capacity, status, created_at, updated_at
          ) VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
          part.flat()
        );
      }
    });

    // Dispatch notifications to regional CMs
    try {
      notifyExternalInterviewsAfterResponse({
        interviewId: interview.id,
        subject: interview.subject,
        classGroup: interview.class_group,
        targetDate: interview.target_date,
        type: "external",
        topics: interview.topics,
        studentCount: interview.student_count,
        mentorName: interview.mentor_name,
        originCollegeId: interview.origin_college_id || interview.college_id,
        actionType: "created"
      });
    } catch (notifErr) {
      console.warn("Capacity request notification dispatch warning:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message: `Capacity request dispatched to ${regionalColleges.length} regional college CMs. Status set to pending_cm_acceptance.`
    });
  } catch (error: any) {
    console.error("POST /api/interviews/capacity-request error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to send capacity request" }, { status: 500 });
  }
}
