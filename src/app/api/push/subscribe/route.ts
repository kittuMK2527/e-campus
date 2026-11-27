export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";
import { generateId } from "@/lib/id";

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const body = await request.json().catch(() => ({}));
    const { subscription, userAgent } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { success: false, message: "Invalid push subscription object" },
        { status: 400 }
      );
    }

    const effectiveUserId = auth.user.reference_id || auth.user.id;
    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, message: "User identification required to bind push subscription" },
        { status: 400 }
      );
    }

    const effectiveRole = auth.user.role || null;
    const effectiveCollegeId = auth.user.college_id || null;
    const subId = generateId("psub");

    await db.run(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, college_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         college_id = excluded.college_id,
         role = excluded.role,
         updated_at = NOW()`,
      subId,
      effectiveUserId,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      userAgent || null,
      effectiveCollegeId,
      effectiveRole
    );

    return NextResponse.json({
      success: true,
      message: "Push subscription registered successfully",
      subscriptionId: subId
    });
  } catch (error: any) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save push subscription" },
      { status: 500 }
    );
  }
}
