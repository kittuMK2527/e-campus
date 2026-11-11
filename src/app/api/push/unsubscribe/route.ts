export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const body = await request.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ success: false, message: "Endpoint is required" }, { status: 400 });
    }

    await db.run("DELETE FROM push_subscriptions WHERE endpoint = ?", String(endpoint).trim());

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

