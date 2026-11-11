export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authGuard";
import { buildCsrfCookie } from "@/lib/session";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  const { auth, errorResponse } = await requireAuth(request, { allowPasswordChangeRequired: true });
  if (errorResponse || !auth) {
    return errorResponse || NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
  }

  const response = NextResponse.json({
    success: true,
    user: auth.user,
    csrfToken: auth.csrfToken,
    session: {
      expiresAt: auth.session.expires_at,
      lastActivityAt: auth.session.last_activity_at
    }
  }, { headers: noCacheHeaders });

  // Refresh CSRF cookie for client-side API requests
  response.headers.append("Set-Cookie", buildCsrfCookie(auth.csrfToken));

  return response;
}
