export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { canActOnCollege, StaleStateError } from "@/lib/requestScope";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["cm", "kam", "admin", "L and D", "mentor", "student", "sme", "hr", "fee_manager", "program_ops"] });
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
      query += " AND status = ?";
      params.push(status);
    }
    if (collegeId) {
      query += " AND college_id = ?";
      params.push(collegeId);
    }
    if (userId) {
      query += " AND (requested_by = ? OR target_user_id = ?)";
      params.push(userId, userId);
    }

    query += " ORDER BY created_at DESC LIMIT 200";

    const rows = await db.all(query, ...params);
    return NextResponse.json({ success: true, approvals: rows });
  } catch (error: any) {
    console.error("GET /api/approvals error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch approvals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse || !auth) return errorResponse!;
    const user = auth.user;
    const db = await getDb();
    const body = await request.json();
    const { module_type, action_type, title, description, details, target_user_id, target_user_name, college_id } = body;

    if (!module_type || !action_type || !title) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    if (college_id) {
      const allowed = await canActOnCollege(db, user, college_id);
      if (!allowed) {
        return NextResponse.json({ success: false, error: "Unauthorized college scope" }, { status: 403 });
      }
    }

    const id = generateId("appr");
    const detailsJson = details ? (typeof details === "string" ? details : JSON.stringify(details)) : null;

    await db.run(
      `INSERT INTO approvals (id, module_type, action_type, title, description, details, requested_by, requested_by_name, target_user_id, target_user_name, college_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        id,
        module_type,
        action_type,
        title,
        description || null,
        detailsJson,
        user.id,
        user.name,
        target_user_id || null,
        target_user_name || null,
        college_id || null
      ]
    );

    await dispatchSystemNotification(db, {
      title: `New Approval Request: ${title}`,
      message: `${user.name} submitted an approval request for ${module_type} (${action_type}).`,
      link: "/admin/approvals",
      type: "info",
      domain: "approvals",
      action: "submitted"
    }).catch(() => {});

    return NextResponse.json({ success: true, id, message: "Approval request submitted successfully" });
  } catch (error: any) {
    if (error instanceof StaleStateError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("POST /api/approvals error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to submit approval" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin", "cm", "kam"] });
    if (errorResponse || !auth) return errorResponse!;
    const user = auth.user;
    const db = await getDb();
    const body = await request.json();
    const { id, status, decision_notes } = body;

    if (!id || !status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ success: false, error: "Valid id and status ('approved' | 'rejected') are required" }, { status: 400 });
    }

    const existing = await db.get("SELECT * FROM approvals WHERE id = ?", [id]);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Approval request not found" }, { status: 404 });
    }

    if (existing.college_id) {
      const allowed = await canActOnCollege(db, user, existing.college_id);
      if (!allowed) {
        return NextResponse.json({ success: false, error: "Unauthorized college scope" }, { status: 403 });
      }
    }

    await db.run(
      `UPDATE approvals
       SET status = ?, decision_notes = ?, approved_by = ?, approved_by_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, decision_notes || null, user.id, user.name, id]
    );

    await dispatchSystemNotification(db, {
      title: `Approval Request ${status === "approved" ? "Approved" : "Rejected"}`,
      message: `Your approval request "${existing.title}" was ${status} by ${user.name}.`,
      link: "/admin/approvals",
      type: status === "approved" ? "success" : "warning",
      domain: "approvals",
      action: status
    }).catch(() => {});

    return NextResponse.json({ success: true, message: `Approval ${status} successfully` });
  } catch (error: any) {
    console.error("PATCH /api/approvals error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to update approval" }, { status: 500 });
  }
}
