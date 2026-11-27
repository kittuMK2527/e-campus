export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Debug migration endpoint (API_OPTIMIZATION_PLAN item 9).
 *
 * Gated behind the ADMIN_API_KEY header in EVERY environment — never reachable
 * by an unauthenticated caller. Prefer the deploy-time migration runner
 * (lib/migrations.ts) over this route.
 */
export async function GET(request: Request) {
  const adminKey = process.env.ADMIN_API_KEY || "";
  const provided = request.headers.get("x-admin-key") || "";
  if (!adminKey || provided !== adminKey) {
    return NextResponse.json(
      { success: false, message: "Forbidden: valid x-admin-key header required." },
      { status: 403 }
    );
  }

  try {
    const db = await getDb();

    // Additive column migration (idempotent)
    try { await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;"); } catch (_) {}
    try { await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TEXT DEFAULT NULL;"); } catch (_) {}

    return NextResponse.json({
      success: true,
      message: "Migration completed",
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
}
