export const maxDuration = 60;

import { NextResponse } from "next/server";
import { processMissedDemoSessions } from "@/lib/demoMissedCheck";
import { requireAuth } from "@/lib/authGuard";

async function verifyAuth(request: Request) {
  const adminKey = process.env.ADMIN_API_KEY || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const reqAdminKey = request.headers.get("x-admin-key") || "";
  const authHeader = request.headers.get("authorization") || "";

  if ((adminKey && reqAdminKey === adminKey) || (cronSecret && (authHeader === `Bearer ${cronSecret}` || reqAdminKey === cronSecret))) {
    return null;
  }

  const { errorResponse } = await requireAuth(request, {
    allowedRoles: ["admin", "L and D", "sme", "kam", "cm"]
  });
  return errorResponse || null;
}

export async function POST(request: Request) {
  try {
    const errorResponse = await verifyAuth(request);
    if (errorResponse) return errorResponse;

    const res = await processMissedDemoSessions();
    return NextResponse.json({ success: true, ...res });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const errorResponse = await verifyAuth(request);
    if (errorResponse) return errorResponse;

    const res = await processMissedDemoSessions();
    return NextResponse.json({ success: true, ...res });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err?.message }, { status: 500 });
  }
}
