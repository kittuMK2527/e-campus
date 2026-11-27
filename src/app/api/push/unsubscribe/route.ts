export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse || !auth) return errorResponse || NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    const db = await getDb();
    const body = await request.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ success: false, message: "Endpoint is required" }, { status: 400 });
    }

    const isAdmin = auth.user.role === "admin" || auth.user.isSuperAdmin;
    if (isAdmin) {
      await db.run("DELETE FROM push_subscriptions WHERE endpoint = ?", String(endpoint).trim());
    } else {
      await db.run(
        "DELETE FROM push_subscriptions WHERE endpoint = ? AND (user_id = ? OR user_id = ?)",
        String(endpoint).trim(),
        auth.user.id,
        auth.user.reference_id
      );
    }

    return NextResponse.json({
      success: true,
      message: "Device push subscription removed successfully.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to remove subscription" },
      { status: 500 }
    );
  }
}
