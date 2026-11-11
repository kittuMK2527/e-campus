export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { notifyRealtimeEvent } from "@/lib/realtimeServer";
import { dispatchSystemNotification } from "@/lib/notifications";
import crypto from "crypto";

function genId(prefix = "notif") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
}

export async function POST(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, {
      allowedRoles: ["mentor", "cm", "kam", "admin"],
    });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const {
      user_id,
      title,
      message,
      link,
      type,
      college_id,
      remind_cm_for_date,
      remind_by_name,
      remind_by_email,
    } = body;

    if (college_id && remind_cm_for_date) {
      const cams = await db.all("SELECT * FROM campus_managers WHERE college_id = ?", [
        college_id,
      ]);

      if (!cams || cams.length === 0) {
        return NextResponse.json(
          { success: false, message: "No Campus Manager found for this college." },
          { status: 404 }
        );
      }

      const dateStr = remind_cm_for_date;
      const dateObj = new Date(dateStr + "T00:00:00");
      const dateFormatted = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      const notifTitle = title || `Day Order Not Configured — ${dateFormatted}`;
      const notifMessage =
        message ||
        `${remind_by_name || "A Mentor"} (${
          remind_by_email || ""
        }) is requesting you to configure the Day Order / Day Type for ${dateFormatted} so that attendance can be saved.`;
      const notifLink = link || `/cm/daily-configs?date=${dateStr}`;
      const notifType = type || "reminder";

      // Dispatch through the zero-delay transactional engine
      const dispatchResult = await dispatchSystemNotification(db, {
        userIds: cams.map((c: any) => c.id),
        roles: ["cm"],
        collegeId: college_id,
        title: notifTitle,
        message: notifMessage,
        link: notifLink,
        type: notifType,
        action: "cm_reminder_created",
      });

      return NextResponse.json({
        success: true,
        message: `Reminder saved for ${dispatchResult.count} CM(s).`,
        notifications_created: dispatchResult.count,
      });
    }

    if (!user_id || !title || !message) {
      return NextResponse.json(
        { success: false, message: "Missing user_id, title, or message" },
        { status: 400 }
      );
    }

    const notifType = type || "info";
    const dispatchResult = await dispatchSystemNotification(db, {
      userIds: [user_id],
      title,
      message,
      link: link || null,
      type: notifType,
      action: "notification_created",
    });

    return NextResponse.json({
      success: true,
      id: dispatchResult.notificationIds[0] || genId(),
    });
  } catch (error: any) {
    console.error("API POST notifications error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || searchParams.get("user_id");
    const actor = auth!.user;

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "userId or user_id is required" },
        { status: 400 }
      );
    }

    // Security check: regular users can only read their own notifications
    const ownerKeys = new Set(
      [actor.reference_id, actor.id, actor.email]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase().trim())
    );
    if (actor.role !== "admin" && !ownerKeys.has(userId.toLowerCase().trim())) {
      return NextResponse.json(
        { success: false, message: "Forbidden: you can only read your own notifications." },
        { status: 403 }
      );
    }

    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

    // Multi-identifier resolution for notification retrieval:
    // Ensures notifications created under user.id (UUID), reference_id, or email are all returned
    let searchKeys = Array.from(ownerKeys);
    if (actor.role === "admin" && !ownerKeys.has(userId.toLowerCase().trim())) {
      const targetUser = await db
        .get(
          `SELECT id, reference_id, email FROM users WHERE id = ? OR reference_id = ? OR LOWER(email) = LOWER(?)`,
          [userId, userId, userId]
        )
        .catch(() => null);
      if (targetUser) {
        searchKeys = [targetUser.id, targetUser.reference_id, targetUser.email, userId]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase().trim());
      } else {
        searchKeys = [userId.toLowerCase().trim()];
      }
    }

    const uniqueSearchKeys = Array.from(new Set(searchKeys));
    const placeholders = uniqueSearchKeys.map(() => "?").join(", ");

    const notifications = await db.all(
      `SELECT * FROM notifications 
       WHERE user_id IN (${placeholders}) OR LOWER(user_id) IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`,
      [...uniqueSearchKeys, ...uniqueSearchKeys, limit]
    );

    const unreadCount = notifications.filter((n: any) => n.is_read === 0).length;

    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const body = await request.json();
    const id = body.id || body.notification_id;
    const userId = body.userId || body.user_id;
    const markAllRead = body.markAllRead || body.action === "mark_all_read";
    const singleMark = !markAllRead && id && (body.action === "mark_read" || !body.action);
    const actor = auth!.user;
    const isAdmin = actor.role === "admin";
    const ownerKeys = new Set(
      [actor.reference_id, actor.id, actor.email]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase().trim())
    );

    if (markAllRead && userId) {
      if (!isAdmin && !ownerKeys.has(String(userId).toLowerCase().trim())) {
        return NextResponse.json(
          { success: false, message: "Forbidden: you can only update your own notifications." },
          { status: 403 }
        );
      }

      let targetKeys = Array.from(ownerKeys);
      if (isAdmin && !ownerKeys.has(String(userId).toLowerCase().trim())) {
        const targetUser = await db
          .get(
            `SELECT id, reference_id, email FROM users WHERE id = ? OR reference_id = ? OR LOWER(email) = LOWER(?)`,
            [userId, userId, userId]
          )
          .catch(() => null);
        if (targetUser) {
          targetKeys = [targetUser.id, targetUser.reference_id, targetUser.email, userId]
            .filter(Boolean)
            .map((v) => String(v).toLowerCase().trim());
        } else {
          targetKeys = [String(userId).toLowerCase().trim()];
        }
      }

      const uniqueTargetKeys = Array.from(new Set(targetKeys));
      const placeholders = uniqueTargetKeys.map(() => "?").join(", ");

      await db.run(
        `UPDATE notifications SET is_read = 1 
         WHERE user_id IN (${placeholders}) OR LOWER(user_id) IN (${placeholders})`,
        [...uniqueTargetKeys, ...uniqueTargetKeys]
      );

      // Realtime event broadcast: instant badge zero-out across all open tabs
      notifyRealtimeEvent({
        domain: "notifications",
        action: "all_marked_read",
        targetUserIds: uniqueTargetKeys,
        payload: { userId },
      });

      return NextResponse.json({ success: true, message: "All notifications marked as read" });
    }

    if (singleMark) {
      const row = await db.get("SELECT id, user_id FROM notifications WHERE id = ?", [id]);
      if (!row) {
        return NextResponse.json(
          { success: false, message: "Notification not found" },
          { status: 404 }
        );
      }
      if (!isAdmin && !ownerKeys.has(String(row.user_id || "").toLowerCase().trim())) {
        return NextResponse.json(
          {
            success: false,
            message: "Forbidden: this notification belongs to another user.",
          },
          { status: 403 }
        );
      }
      await db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);

      // Realtime event broadcast: instant read state update across tabs
      notifyRealtimeEvent({
        domain: "notifications",
        action: "marked_read",
        targetUserIds: [row.user_id],
        payload: { id },
      });

      return NextResponse.json({ success: true, message: "Notification marked as read" });
    }

    return NextResponse.json(
      { success: false, message: "Missing id or markAllRead+userId" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
