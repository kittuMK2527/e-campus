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
  const { auth, errorResponse } = await requireAuth(request, {
    allowedRoles: ANNOUNCE_READ_ROLES,
    checkCsrf: false
  });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const user = auth!.user;
    const role = String(user.role || "").toLowerCase().replace(/[_-]+/g, " ").trim();

    let query = "SELECT * FROM announcements WHERE 1=1";
    const params: any[] = [];

    if (role === "kam") {
      const kam = await db.get(
        "SELECT id FROM kam_users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1",
        [user.reference_id, String(user.email || "")]
      );
      if (!kam) return NextResponse.json({ success: true, announcements: [] });
      query += " AND (college_id IS NULL OR college_id IN (SELECT id FROM colleges WHERE kam_id = ?))";
      params.push(kam.id);
    } else if (role !== "admin") {
      if (user.college_id) {
        query += " AND (college_id = ? OR college_id IS NULL)";
        params.push(user.college_id);
      } else {
        query += " AND college_id IS NULL";
      }
    }

    const normalizedRole = ["cam", "campus manager"].includes(role)
      ? "cm"
      : ["fee manager", "fee_manager"].includes(role)
        ? "fee_manager"
        : ["l&d", "lnd", "ld"].includes(role)
          ? "l and d"
          : role;
    query += " AND (LOWER(TRIM(target_role)) = ? OR LOWER(TRIM(target_role)) = 'all' OR target_role IS NULL)";
    params.push(normalizedRole);

    const announcementId = new URL(request.url).searchParams.get("id");
    if (announcementId) {
      query += " AND id = ?";
      params.push(announcementId);
    }

    query += " ORDER BY created_at DESC";

    const announcements = await db.all(query, params);
    return NextResponse.json({ success: true, announcements });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
  if (errorResponse) return errorResponse;

  try {
    const db = await getDb();
    const body = await request.json();
    const { title, description, target_role, college_id } = body;

    if (!title) {
      return NextResponse.json({ success: false, message: "Title is required" }, { status: 400 });
    }

    const newId = generateId("ann");
    const nowStr = new Date().toISOString();

    await db.run(
      `INSERT INTO announcements (id, title, description, created_by, target_role, college_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId, title, description || null, auth?.user?.name || "Admin", target_role || "All", college_id || null, nowStr]
    );

    // Instant multi-recipient dispatch: notify all users or target audience
    const normalizedTarget = (target_role || "All").toLowerCase();
    const targetRoles = normalizedTarget === "all"
      ? ["student", "mentor", "cm", "kam", "admin", "sme", "hr", "fee_manager", "L and D"]
      : [normalizedTarget];

    try {
      await dispatchSystemNotification(db, {
        roles: targetRoles,
        collegeId: college_id || undefined,
        title: `Announcement: ${title}`,
        message: description ? (description.length > 120 ? description.slice(0, 117) + "..." : description) : "A new campus announcement was posted.",
        link: `/announcements?id=${encodeURIComponent(newId)}`,
        type: "info",
        domain: "notifications",
        action: "created",
        payload: {
          announcementId: newId,
          title,
          description,
          collegeId: college_id || null,
          targetRole: target_role || "All"
        },
        dedupeKey: `announcement:${newId}`
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
