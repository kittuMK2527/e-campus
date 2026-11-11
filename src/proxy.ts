import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Enterprise Edge Proxy (Next.js 16 / BUG-11 Edge Route Protection)
 *
 * Fast edge verification:
 * 1. Allows public unauthenticated API routes and public pages.
 * 2. Protected dashboard routes (/admin, /cam, /cm, /mentor, /student, /kam, /sme, /fee-manager, /l-and-d, /hr)
 *    issue an HTTP 307 redirect to '/' if the session cookie is missing.
 * 3. Protected API routes (/api/*) return JSON 401 if the session cookie is missing.
 */

const SESSION_COOKIE_NAME = "ecampus_session";

const PROTECTED_PAGE_PREFIXES = [
  "/admin",
  "/cam",
  "/cm",
  "/mentor",
  "/student",
  "/kam",
  "/sme",
  "/fee-manager",
  "/l-and-d",
  "/hr",
];

/** Endpoints reachable without an active session cookie. */
const PUBLIC_API_PATHS = new Set<string>([
  "/api/login",
  "/api/signup",
  "/api/health",
  "/api/student-feedback",
  "/api/auth/me",
  "/api/data/reference",
  "/api/realtime"
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const sessionToken =
    request.cookies.get(SESSION_COOKIE_NAME)?.value ||
    request.cookies.get("fp_session")?.value;
  const hasValidToken = Boolean(sessionToken && sessionToken.trim().length > 0);

  // A. Protected UI Dashboard Routes -> 307 Redirect to / if no session
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isProtectedPage) {
    if (!hasValidToken) {
      const loginUrl = new URL("/", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl, 307);
    }
    return NextResponse.next();
  }

  // B. API Routes -> JSON 401 if no session (unless in public allowlist)
  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    if (!hasValidToken) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: missing session token.", code: "NO_SESSION" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/admin/:path*",
    "/cam/:path*",
    "/cm/:path*",
    "/mentor/:path*",
    "/student/:path*",
    "/kam/:path*",
    "/sme/:path*",
    "/fee-manager/:path*",
    "/l-and-d/:path*",
    "/hr/:path*"
  ]
};
