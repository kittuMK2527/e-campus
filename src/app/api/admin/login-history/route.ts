export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/authGuard";

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Two parallel queries: page rows + total count (single round trip via multiQuery)
    const [rows, countRows] = await db.multiQuery([
      {
        sql: `SELECT lh.id, lh.user_id, lh.login_time, lh.logout_time, lh.ip, lh.device,
                     u.email as user_email, u.role as user_role
              FROM login_history lh
              LEFT JOIN users u ON lh.user_id = u.id
              ORDER BY lh.login_time DESC
              LIMIT ? OFFSET ?`,
        params: [limit, offset]
      },
      { sql: "SELECT COUNT(*) as total FROM login_history" }
    ]);

    return NextResponse.json(
      {
        success: true,
        loginHistory: rows || [],
        total: Number(countRows[0]?.total || 0),
        limit,
        offset
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("GET /api/admin/login-history error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch login history" },
      { status: 500 }
    );
  }
}
