import { NextResponse } from "next/server";
import { type SessionPayload } from "@/lib/session";
import { extractSessionToken, normalizeRole, loadSession, loadUser } from "@/lib/authGuard";
import { logger } from "@/lib/logger";

// Re-export normalizeRole for backward compatibility
export { normalizeRole };

/**
 * Session + role helpers for API routes.
 *
 * Derived securely from the HttpOnly session cookie and verified against the database.
 */

export class ApiAuthError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 401, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const token = extractSessionToken(request);
  if (!token) return null;

  // A pooler blip is not a logged-out user. Infrastructure failures must not
  // collapse into 401, because the client interceptor treats 401 as session
  // expiry and drops the user's session on a backend hiccup.
  let validated;
  try {
    validated = await loadSession(token);
  } catch (err: any) {
    logger.error("getSessionFromRequest: session lookup failed", { error: err?.message || String(err) });
    throw new ApiAuthError("Authentication is temporarily unavailable. Please retry.", 503);
  }

  if (!validated.isValid || !validated.userId) return null;

  let liveUser;
  try {
    liveUser = await loadUser(validated.userId);
  } catch (err: any) {
    logger.error("getSessionFromRequest: user lookup failed", { error: err?.message || String(err) });
    throw new ApiAuthError("Authentication is temporarily unavailable. Please retry.", 503);
  }

  if (!liveUser) return null;
  if (liveUser.mustChangePassword) {
    throw new ApiAuthError("You must change your password before continuing.", 403, "PASSWORD_CHANGE_REQUIRED");
  }

  return {
    userId: liveUser.reference_id || liveUser.id,
    role: liveUser.role,
    email: liveUser.email,
    collegeId: liveUser.college_id,
    name: liveUser.name
  };
}

/** Throws ApiAuthError(401) when there is no valid session cookie. */
export async function requireSession(request: Request): Promise<SessionPayload> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new ApiAuthError("Unauthorized: missing or invalid session.", 401);
  }
  return session;
}

/**
 * Verifies a valid session AND that the session's role is one of `allowed`.
 * Throws ApiAuthError with 401 (no session) or 403 (wrong role).
 */
export async function requireRole(request: Request, ...allowed: string[]): Promise<SessionPayload> {
  const session = await requireSession(request);
  const sessionRole = normalizeRole(session.role);
  const normalized = allowed.map(normalizeRole);
  if (!normalized.includes(sessionRole) && sessionRole !== "admin") {
    throw new ApiAuthError(`Forbidden: role '${sessionRole}' is not permitted for this action.`, 403);
  }
  return session;
}

/** Converts an ApiAuthError into a JSON 401/403 response. */
export function apiAuthErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof ApiAuthError) {
    return NextResponse.json({ success: false, message: err.message, code: err.code }, { status: err.status });
  }
  return null;
}
