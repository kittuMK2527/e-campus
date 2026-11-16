import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/authGuard";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { auth, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const user = auth?.user;

    const body = await request.json();
    const { action, entity, range, deletedCount, items, reason } = body;

    logger.warn(`AUDIT LOG [${action || "BULK_DELETE"}]: ${deletedCount || 0} ${entity || "records"} deleted in range`, {
      action: action || "BULK_RANGE_DELETE",
      entity: entity || "records",
      range: range || null,
      deletedCount: deletedCount ?? 0,
      itemIds: Array.isArray(items) ? items.slice(0, 50) : undefined,
      reason: reason || "User triggered bulk range deletion",
      performedBy: {
        id: user?.id,
        role: user?.role,
        email: user?.email
      },
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      logged: true,
      message: "Audit record registered successfully"
    });
  } catch (error: any) {
    logger.error("Audit log registration failed", { error: error.message });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
