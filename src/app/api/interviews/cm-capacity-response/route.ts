export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { getDb, type QueryFailure } from "@/lib/db";
import { generateId } from "@/lib/id";

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();

    const {
      interview_id,
      college_id,
      cam_id = "cam_user",
      cam_name = "Campus Manager",
      action = "accept_capacity",
      accepted_student_capacity = 0
    } = body;

    if (!interview_id || !college_id) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (interview_id, college_id)" },
        { status: 400 }
      );
    }

    // Interview, college and the existing response are three independent reads of body
    // keys, and the third decides between UPDATE and INSERT — so they share one round
    // trip, and a failed slice refuses the write instead of duplicating the response row.
    const responseFailures: QueryFailure[] = [];
    const [interviewRows, collegeRows, existingRows] = await db.multiQuery(
      [
        { sql: "SELECT * FROM student_interviews WHERE id = ?", params: [interview_id] },
        { sql: "SELECT * FROM colleges WHERE id = ?", params: [college_id] },
        { sql: "SELECT * FROM cam_capacity_responses WHERE interview_id = ? AND college_id = ?", params: [interview_id, college_id] },
      ],
      responseFailures
    );
    if (responseFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not verify this capacity response. Please try again." }, { status: 500 });
    }

    const interview = interviewRows[0];
    if (!interview) {
      return NextResponse.json({ success: false, message: "Interview request not found" }, { status: 404 });
    }

    // Once the origin CM sends the split for final confirmation, campus capacities are
    // frozen — a late response would recalculate and reopen a finalised allocation.
    const FINALISED_STATUSES = new Set(["pending_final_confirmation", "assigned", "pending_verification", "completed", "declined"]);
    if (FINALISED_STATUSES.has(String(interview.status || ""))) {
      return NextResponse.json(
        { success: false, message: `This interview is already ${String(interview.status).replace(/_/g, " ")}. Capacity can no longer be changed.` },
        { status: 409 }
      );
    }

    const college = collegeRows[0];
    const collegeName = college?.name || "Campus";

    // Verify that the responding partner college belongs to the same KAM zone as the origin campus
    if (interview.type === "external") {
      const originCollege = await db.get(
        "SELECT kam_id FROM colleges WHERE id = ?",
        [interview.origin_college_id || interview.college_id]
      );
      const originKamId = originCollege?.kam_id;
      const respondingKamId = college?.kam_id;

      if (!originKamId || !respondingKamId || originKamId !== respondingKamId) {
        return NextResponse.json(
          { success: false, message: "External interviews are restricted to partner campuses within the same KAM zone." },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();
    const acceptedCount = action === "decline" ? 0 : Math.max(0, Number(accepted_student_capacity) || 0);

    // Save or update CAM capacity response
    const existing = existingRows[0];

    if (existing) {
      await db.run(
        `UPDATE cam_capacity_responses 
         SET accepted_student_capacity = ?, actual_available_capacity = ?, status = ?, updated_at = ?
         WHERE interview_id = ? AND college_id = ?`,
        [
          acceptedCount,
          acceptedCount,
          action === "decline" ? "declined" : "accepted",
          now,
          interview_id,
          college_id
        ]
      );
    } else {
      const respId = generateId("cap");
      await db.run(
        `INSERT INTO cam_capacity_responses (
          id, interview_id, college_id, college_name, cam_id, cam_name,
          accepted_student_capacity, actual_available_capacity, unfulfilled_capacity, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          respId,
          interview_id,
          college_id,
          collegeName,
          cam_id,
          cam_name,
          acceptedCount,
          acceptedCount,
          0,
          action === "decline" ? "declined" : "accepted",
          now,
          now
        ]
      );
    }

    // Recalculate total accepted capacity across all CAM responses
    const allResponses = await db.all(
      "SELECT * FROM cam_capacity_responses WHERE interview_id = ?",
      [interview_id]
    );

    let totalAcceptedCapacity = 0;
    let acceptedCamCount = 0;
    let declinedCamCount = 0;

    allResponses.forEach((r: any) => {
      if (r.status === "accepted") {
        totalAcceptedCapacity += Number(r.accepted_student_capacity) || 0;
        acceptedCamCount++;
      } else if (r.status === "declined") {
        declinedCamCount++;
      }
    });

    const requestedStudents = Number(interview.student_count) || Number(interview.requested_students) || 10;
    const remainingStudents = Math.max(0, requestedStudents - totalAcceptedCapacity);
    const unallocatedStudents = remainingStudents;

    // Determine state machine status
    let newStatus = interview.status;
    if (declinedCamCount === allResponses.length && allResponses.length > 0) {
      newStatus = "no_capacity";
    } else if (remainingStudents <= 0) {
      newStatus = "priority_allocation";
    } else if (totalAcceptedCapacity > 0) {
      newStatus = "capacity_partially_accepted";
    }

    await db.run(
      `UPDATE student_interviews 
       SET accepted_capacity = ?, remaining_students = ?, unallocated_students = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [totalAcceptedCapacity, remainingStudents, unallocatedStudents, newStatus, now, interview_id]
    );

    return NextResponse.json({
      success: true,
      message: action === "decline"
        ? `Capacity request declined for ${collegeName}.`
        : `Capacity of ${acceptedCount} students accepted for ${collegeName}! Total accepted capacity: ${totalAcceptedCapacity}/${requestedStudents}.`,
      total_requested: requestedStudents,
      accepted_capacity: totalAcceptedCapacity,
      remaining_students: remainingStudents,
      status: newStatus
    });
  } catch (error: any) {
    console.error("POST /api/interviews/cm-capacity-response error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to process CM capacity response" },
      { status: 500 }
    );
  }
}
