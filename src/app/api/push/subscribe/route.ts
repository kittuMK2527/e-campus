export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/api-auth";
import { generateId } from "@/lib/id";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    let session = null;
    try {
      session = await getSessionFromRequest(request);
    } catch (_) {}

    const body = await request.json().catch(() => ({}));
    const { subscription, userId: bodyUserId, role: bodyRole, collegeId: bodyCollegeId, userAgent } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { success: false, message: "Invalid push subscription object" },
        { status: 400 }
      );
    }

    const effectiveUserId = session?.userId || bodyUserId;
    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, message: "User identification required to bind push subscription" },
        { status: 400 }
      );
    }

    const effectiveRole = session?.role || bodyRole || null;
    const effectiveCollegeId = session?.collegeId || bodyCollegeId || null;
    const subId = generateId("psub");

    await db.run(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, college_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         college_id = EXCLUDED.college_id,
         role = EXCLUDED.role,
         updated_at = NOW()`,
      [
        subId,
        String(effectiveUserId).trim(),
        String(subscription.endpoint).trim(),
        String(subscription.keys.p256dh).trim(),
        String(subscription.keys.auth).trim(),
        userAgent || request.headers.get("user-agent") || null,
        effectiveCollegeId,
        effectiveRole,
      ]
    );

    return NextResponse.json({
      success: true,
      message: "Device push subscription registered successfully.",
    });
  } catch (error: any) {
    console.error("POST /api/push/subscribe error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to register push subscription" },
      { status: 500 }
    );
  }
}

