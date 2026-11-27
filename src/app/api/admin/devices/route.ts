import { NextResponse } from "next/server";
import { getDb, allCapped } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { resetUserAuthorizedDevices } from "@/lib/deviceSecurity";
import { dispatchSystemNotification } from "@/lib/notifications";

export async function GET(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse || !auth) return errorResponse!;
    const adminUser = auth.user;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const mode = searchParams.get("mode") || "summary"; // 'summary' | 'devices' | 'requests' | 'logs'
    const db = await getDb();

    if (userId) {
      const devices = await db.all(
        `SELECT * FROM user_authorized_devices 
         WHERE user_id = ? 
         ORDER BY is_active DESC, last_used_at DESC`,
        [userId]
      );
      const logs = await db.all(
        `SELECT * FROM device_security_logs 
         WHERE user_id = ? 
         ORDER BY timestamp DESC LIMIT 20`,
        [userId]
      );
      const requests = await db.all(
        `SELECT * FROM device_reset_requests 
         WHERE user_id = ? 
         ORDER BY created_at DESC LIMIT 10`,
        [userId]
      );
      return NextResponse.json({ success: true, devices, logs, requests });
    }

    if (mode === "requests") {
      const requests = await allCapped(
        db,
        `SELECT * FROM device_reset_requests ORDER BY created_at DESC LIMIT 100`
      );
      return NextResponse.json({ success: true, requests });
    }

    if (mode === "logs") {
      const logs = await allCapped(
        db,
        `SELECT l.*, u.email as user_email, u.role as user_role 
         FROM device_security_logs l 
         LEFT JOIN users u ON l.user_id = u.id 
         ORDER BY l.timestamp DESC LIMIT 100`
      );
      return NextResponse.json({ success: true, logs });
    }

    // Default summary: pending requests count & recent incidents
    const pendingCountRow = await db.get(
      "SELECT COUNT(*) as count FROM device_reset_requests WHERE status = 'pending'"
    );
    const recentIncidents = await allCapped(
      db,
      `SELECT l.*, u.email as user_email, u.role as user_role 
       FROM device_security_logs l 
       LEFT JOIN users u ON l.user_id = u.id 
       ORDER BY l.timestamp DESC LIMIT 10`
    );

    return NextResponse.json({
      success: true,
      pendingRequestsCount: Number(pendingCountRow?.count || 0),
      recentIncidents
    });
  } catch (error: any) {
    console.error("[admin-devices] GET error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Internal server error." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse || !auth) return errorResponse!;
    const adminUser = auth.user;

    const body = await request.json().catch(() => ({}));
    const { action, userId, deviceType = "all", requestId, reason } = body;
    const db = await getDb();
    const nowStr = new Date().toISOString();

    // 1. Direct device reset by Admin
    if (action === "reset") {
      if (!userId) {
        return NextResponse.json({ success: false, message: "Target userId is required." }, { status: 400 });
      }

      const res = await resetUserAuthorizedDevices(db, userId, deviceType, adminUser.id || "admin");

      // Notify the user their device was reset
      try {
        await dispatchSystemNotification(db, {
          userIds: [userId],
          title: "Device Authorization Reset",
          message: `An Administrator has reset your authorized ${deviceType === "all" ? "devices" : deviceType + " device"}. You can now log in from your new setup.`,
          type: "info",
          domain: "security"
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: `Successfully reset ${deviceType} authorization for user. Previous session(s) terminated.`
      });
    }

    // 2. Approve a user's reset request
    if (action === "approve_request") {
      if (!requestId) {
        return NextResponse.json({ success: false, message: "requestId is required." }, { status: 400 });
      }

      const reqRecord = await db.get("SELECT * FROM device_reset_requests WHERE id = ?", [requestId]);
      if (!reqRecord) {
        return NextResponse.json({ success: false, message: "Reset request not found." }, { status: 404 });
      }

      // Reset the authorized device
      await resetUserAuthorizedDevices(db, reqRecord.user_id, reqRecord.device_type, adminUser.id || "admin");

      // Mark request approved
      await db.run(
        "UPDATE device_reset_requests SET status = 'approved', resolved_at = ?, resolved_by = ? WHERE id = ?",
        [nowStr, adminUser.id || "admin", requestId]
      );

      // Notify user
      try {
        await dispatchSystemNotification(db, {
          userIds: [reqRecord.user_id],
          title: "Device Reset Request Approved",
          message: `Your request to reset your authorized ${reqRecord.device_type} has been approved by the Administrator. You can now log in from your new device.`,
          type: "success",
          domain: "security"
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: `Reset request approved. ${reqRecord.user_name}'s ${reqRecord.device_type} slot has been reset.`
      });
    }

    // 3. Reject a user's reset request
    if (action === "reject_request") {
      if (!requestId) {
        return NextResponse.json({ success: false, message: "requestId is required." }, { status: 400 });
      }

      const reqRecord = await db.get("SELECT * FROM device_reset_requests WHERE id = ?", [requestId]);
      if (!reqRecord) {
        return NextResponse.json({ success: false, message: "Reset request not found." }, { status: 404 });
      }

      await db.run(
        "UPDATE device_reset_requests SET status = 'rejected', resolved_at = ?, resolved_by = ? WHERE id = ?",
        [nowStr, adminUser.id || "admin", requestId]
      );

      // Notify user
      try {
        await dispatchSystemNotification(db, {
          userIds: [reqRecord.user_id],
          title: "Device Reset Request Declined",
          message: `Your device reset request was declined by the Administrator.${reason ? ` Reason: ${reason}` : ""}`,
          type: "warning",
          domain: "security"
        });
      } catch {}

      return NextResponse.json({
        success: true,
        message: "Device reset request declined."
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    console.error("[admin-devices] POST error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Internal server error." }, { status: 500 });
  }
}
