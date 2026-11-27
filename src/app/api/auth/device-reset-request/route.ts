import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateId } from "@/lib/id";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, email, deviceType = "desktop", reason = "New device setup" } = body;

    if (!userId && !email) {
      return NextResponse.json(
        { success: false, message: "User identification (ID or Email) is required." },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Verify user exists
    const user = await db.get(
      "SELECT id, email, role, reference_id FROM users WHERE id = ? OR email = ?",
      [userId || "", email || ""]
    );

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User account not found." },
        { status: 404 }
      );
    }

    // Resolve user's display name
    let userName = user.email;
    let collegeId = null;

    if (user.role === "student" && user.reference_id) {
      const student = await db.get("SELECT name, college_id FROM students WHERE id = ?", [user.reference_id]);
      if (student) {
        userName = student.name || userName;
        collegeId = student.college_id;
      }
    } else if (user.role === "mentor" && user.reference_id) {
      const mentor = await db.get("SELECT name, college_id FROM mentors WHERE id = ?", [user.reference_id]);
      if (mentor) {
        userName = mentor.name || userName;
        collegeId = mentor.college_id;
      }
    } else if (user.role === "cm" && user.reference_id) {
      const cm = await db.get("SELECT name, college_id FROM campus_managers WHERE id = ?", [user.reference_id]);
      if (cm) {
        userName = cm.name || userName;
        collegeId = cm.college_id;
      }
    } else if (user.role === "sme" && user.reference_id) {
      const sme = await db.get("SELECT name FROM sme_users WHERE id = ?", [user.reference_id]);
      if (sme) userName = sme.name || userName;
    }

    // Check if there's already a pending request to prevent spamming
    const existing = await db.get(
      "SELECT id FROM device_reset_requests WHERE user_id = ? AND device_type = ? AND status = 'pending'",
      [user.id, deviceType]
    );

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "A device reset request is already pending review with the Administrator.",
        requestId: existing.id
      });
    }

    const requestId = generateId("drr");
    const nowStr = new Date().toISOString();

    await db.run(
      `INSERT INTO device_reset_requests (
        id, user_id, user_name, user_email, user_role, college_id, device_type, reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [requestId, user.id, userName, user.email, user.role, collegeId, deviceType, reason, nowStr]
    );

    // Notify all Admins
    try {
      await dispatchSystemNotification(db, {
        roles: ["admin"],
        title: `Device Reset Request: ${userName}`,
        message: `${userName} (${user.role}) has requested a reset for their authorized ${deviceType} device. Reason: "${reason}".`,
        link: `/admin/users?deviceUserId=${user.id}`,
        type: "warning",
        domain: "security",
        payload: {
          requestId,
          userId: user.id,
          userName,
          userEmail: user.email,
          userRole: user.role,
          deviceType,
          reason
        }
      });
    } catch (errNotif) {
      console.warn("[device-reset-request] dispatch admin notification error:", errNotif);
    }

    return NextResponse.json({
      success: true,
      message: "Your device reset request has been submitted to the Administrator. You will be able to log in once approved.",
      requestId
    });
  } catch (error: any) {
    console.error("[device-reset-request] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
