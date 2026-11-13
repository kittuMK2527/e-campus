export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin", "L and D"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const userId = searchParams.get("userId");
    const collegeId = searchParams.get("collegeId");
    const moduleType = searchParams.get("moduleType");
    const status = searchParams.get("status");

    let query = "SELECT * FROM approvals WHERE 1=1";
    const params: any[] = [];

    if (moduleType) {
      query += " AND module_type = ?";
      params.push(moduleType);
    }

    if (status) {
      query += " AND current_status = ?";
      params.push(status);
    }

    if (collegeId) {
      query += " AND (college_id = ? OR college_id IS NULL OR college_id = '')";
      params.push(collegeId);
    }

    if (role === "student" && userId) {
      query += " AND requester_id = ?";
      params.push(userId);
    } else if (role === "mentor" && userId) {
      query += " AND (requester_id = ? OR approver_id = ?)";
      params.push(userId, userId);
    }

    query += " ORDER BY created_at DESC";

    const approvals = await db.all(query, params);
    return NextResponse.json({ success: true, approvals });
  } catch (error: any) {
    console.error("GET /api/approvals error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const {
      module_type,
      request_id,
      requester_id,
      requester_name,
      college_id,
      remarks = ""
    } = body;

    if (!module_type || !request_id || !requester_id || !requester_name) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (module_type, request_id, requester_id, requester_name)" },
        { status: 400 }
      );
    }

    const id = generateId("appr");
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO approvals (
        id, module_type, request_id, requester_id, requester_name,
        current_status, remarks, college_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, module_type, request_id, requester_id, requester_name, "pending", remarks, college_id || "", now, now]
    );

    // Audit Log Entry
    await db.run(
      `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        generateId("audit"),
        "approval_request",
        `Created pending approval for request ${request_id} (${module_type})`,
        requester_name,
        "Requester",
        now
      ]
    );

    const createdRecord = await db.get("SELECT * FROM approvals WHERE id = ?", [id]);
    return NextResponse.json({ success: true, approval: createdRecord });
  } catch (error: any) {
    console.error("POST /api/approvals error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to create approval" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const {
      approval_id,
      status,
      rejection_reason = "",
      remarks = ""
    } = body;
    // The approver identity used to come from the request body, which let any
    // caller sign a decision under someone else's name.
    const actor = auth!.user;
    const approver_id = actor.reference_id || actor.id;
    const approver_name = actor.name || actor.email;

    if (!approval_id || !status) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (approval_id, status)" },
        { status: 400 }
      );
    }

    // MANDATORY REJECTION REMARKS RULE
    if (status === "rejected" && !rejection_reason.trim() && !remarks.trim()) {
      return NextResponse.json(
        { success: false, message: "Remarks/rejection reason is mandatory when rejecting a request." },
        { status: 400 }
      );
    }

    const approval = await db.get("SELECT * FROM approvals WHERE id = ?", [approval_id]);
    if (!approval) {
      return NextResponse.json({ success: false, message: "Approval entry not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const reasonText = rejection_reason || remarks;
    const { module_type, request_id } = approval;

    // The approval row, the module it drives, the excused attendance, the
    // notification and the audit entry are one decision. Split across six
    // autocommitted statements, a failure left an approval marked resolved with
    // the leave still Pending (or the reverse) — and the notification insert was
    // swallowed with .catch(console.warn), so the requester was simply never told.
    await db.transaction(async (tx) => {
      await tx.run(
        `UPDATE approvals SET
          current_status = ?,
          approver_id = ?,
          approver_name = ?,
          remarks = ?,
          rejection_reason = ?,
          approved_at = ?,
          updated_at = ?
        WHERE id = ?`,
        [status, approver_id, approver_name, remarks, reasonText, status === "approved" ? now : null, now, approval_id]
      );

      // Module Side Effects Trigger
      if (module_type === "student_leave") {
        await tx.run(
          "UPDATE leave_requests SET status = ?, approvedBy = ? WHERE id = ?",
          [status, approver_name, request_id]
        );

        const leaveReq = await tx.get("SELECT * FROM leave_requests WHERE id = ?", [request_id]);
        if (leaveReq && status === "approved") {
          const student = await tx.get("SELECT * FROM students WHERE id = ?", [leaveReq.studentId]);
          if (student) {
            const dayName = new Date(leaveReq.dateStr).toLocaleDateString("en-US", { weekday: "long" });
            const matchingSlots = await tx.all(
              "SELECT id FROM slots WHERE classGroup = ? AND day = ?",
              [student.classGroup, dayName]
            );

            // One statement instead of one per slot; same upsert semantics.
            if (matchingSlots.length > 0) {
              const params: any[] = [];
              const placeholders = matchingSlots.map((s: any) => {
                params.push(
                  `att_${s.id}_${leaveReq.studentId}_${leaveReq.dateStr}`,
                  leaveReq.studentId, s.id, leaveReq.dateStr, "present",
                  `CAM Approval (${approver_name})`, now
                );
                return "(?, ?, ?, ?, ?, ?, ?)";
              }).join(", ");
              await tx.run(
                `INSERT INTO student_attendance (id, studentId, slotId, dateStr, status, markedBy, timestamp)
                 VALUES ${placeholders}
                 ON CONFLICT(studentId, slotId, dateStr) DO UPDATE SET status = 'present', markedBy = 'CAM Approval'`,
                params
              );
            }
          }
        }
      } else if (module_type === "faculty_leave") {
        await tx.run(
          "UPDATE faculty_leave_requests SET status = ?, updated_at = ? WHERE id = ?",
          [status === "approved" ? "Approved" : "Rejected", now, request_id]
        );
      } else if (module_type === "interview") {
        await tx.run(
          "UPDATE student_interviews SET status = ?, updated_at = ? WHERE id = ?",
          [status === "approved" ? "completed" : "rejected", now, request_id]
        );
      }

      // Real-time zero-delay in-app notification dispatch
      await dispatchSystemNotification(tx, {
        userIds: [approval.requester_id],
        title: `Request ${status.toUpperCase()}: ${module_type.replace("_", " ").toUpperCase()}`,
        message: `Your request has been ${status} by ${approver_name}. ${reasonText ? `Remarks: ${reasonText}` : ""}`,
        type: status === "approved" ? "result" : "alert",
        link: module_type === "faculty_leave" ? "/mentor?tab=handovers" : "/mentor/schedule",
        domain: "approvals",
        action: "resolved",
      });

      // Audit Log Entry
      await tx.run(
        `INSERT INTO audit_logs (id, type, description, actorName, actorRole, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          generateId("audit"),
          "approval_resolution",
          `Resolved request ${request_id} for ${approval.requester_name}: ${status.toUpperCase()}. Remarks: ${reasonText || "None"}`,
          approver_name,
          "Approver",
          now
        ]
      );
    });

    const updatedApproval = await db.get("SELECT * FROM approvals WHERE id = ?", [approval_id]);
    return NextResponse.json({
      success: true,
      message: `Request successfully ${status}. Side-effects executed and the requester is being notified.`,
      approval: updatedApproval
    });
  } catch (error: any) {
    console.error("PUT /api/approvals error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update approval" }, { status: 500 });
  }
}
