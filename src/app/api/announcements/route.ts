export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth, Role } from "@/lib/authGuard";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";

const ANNOUNCE_READ_ROLES: Role[] = [
  "admin", "cm", "kam", "sme", "mentor", "student", "fee_manager", "L and D", "hr"
];

export async function GET(request: Request) {
  const { errorResponse } = await requireAuth(request, {
    allowedRoles: ANNOUNCE_READ_ROLES,
    checkCsrf: false
  });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const collegeId = searchParams.get("college_id");
    const targetRole = searchParams.get("target_role");

    let query = "SELECT * FROM announcements WHERE 1=1";
    const params: any[] = [];

    if (collegeId) {
      query += " AND (college_id = ? OR college_id IS NULL)";
      params.push(collegeId);
    }

    if (targetRole) {
      query += " AND (target_role = ? OR target_role = 'All' OR target_role IS NULL)";
      params.push(targetRole);
    }

    query += " ORDER BY created_at DESC";

    const announcements = await db.all(query, params);
    return NextResponse.json({ success: true, announcements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const body = await request.json();
    const { title, description, created_by, target_role, college_id } = body;

    if (!title) {
      return NextResponse.json({ success: false, message: "Title is required" }, { status: 400 });
    }

    const newId = generateId("ann");
    const nowStr = new Date().toISOString();

    await db.run(
      `INSERT INTO announcements (id, title, description, created_by, target_role, college_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, title, description || null, created_by || "Admin", target_role || "All", college_id || null, nowStr]
    );

    // Instant multi-recipient dispatch: notify all users or target audience
    const normalizedTarget = (target_role || "All").toLowerCase();
    const targetRoles = normalizedTarget === "all"
      ? ["student", "mentor", "cm", "kam", "admin"]
      : [normalizedTarget];

    try {
      await dispatchSystemNotification(db, {
        roles: targetRoles,
        collegeId: college_id || undefined,
        title: `Announcement: ${title}`,
        message: description ? (description.length > 120 ? description.slice(0, 117) + "..." : description) : "A new campus announcement was posted.",
        link: "/announcements",
        type: "info",
        domain: "notifications",
        action: "created",
        payload: {
          announcementId: newId,
          title,
          description,
          collegeId: college_id || null,
          targetRole: target_role || "All"
        }
      });
    } catch (notifErr: any) {
      console.warn("Announcements: notification dispatch error", notifErr?.message);
    }

    return NextResponse.json({ success: true, message: "Announcement created successfully." });
  } catch (error: any) {
    console.error("API POST Announcements error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "ID is required" }, { status: 400 });
    }

    await db.run("DELETE FROM announcements WHERE id = ?", [id]);

    return NextResponse.json({ success: true, message: "Announcement deleted successfully." });
  } catch (error: any) {
    console.error("API DELETE Announcements error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
