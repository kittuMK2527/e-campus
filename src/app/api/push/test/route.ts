export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/api-auth";
import { sendWebPushNotification } from "@/lib/webPush";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    let session = null;
    try {
      session = await getSessionFromRequest(request);
    } catch (_) {}

    const body = await request.json().catch(() => ({}));
    const userId = session?.userId || body.userId;
    const role = session?.role || body.role;
    const delaySeconds = Math.min(Math.max(Number(body.delaySeconds) || 5, 1), 30);

    if (!userId) {
      return NextResponse.json({ success: false, message: "User ID required" }, { status: 400 });
    }

    // Schedule background Web Push dispatch through Google FCM / Apple APNs / Windows WNS
    setTimeout(async () => {
      try {
        await sendWebPushNotification(db, {
          userIds: [userId],
          roles: role ? [role] : undefined,
          title: "🚀 Closed Tab Background Push Test",
          message: `This alert was delivered through Google FCM / Apple APNs while your tab was closed at ${new Date().toLocaleTimeString()}!`,
          link: "/schedule",
          tag: `test_closed_push_${Date.now()}`
        });
      } catch (err) {
        console.error("Background push test error:", err);
      }
    }, delaySeconds * 1000);

    return NextResponse.json({
      success: true,
      message: `Background Web Push scheduled! Lock your screen or close this tab now. The alert will arrive in ${delaySeconds} seconds.`,
      delaySeconds
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

