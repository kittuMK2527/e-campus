import crypto from "crypto";
import { CSRF_COOKIE_NAME, generateCsrfToken } from "./csrf";

/**
 * Enterprise Opaque Hash-Based Session Management
 * 
 * Properties:
 * 1. High-entropy 32-byte opaque random token stored in HttpOnly cookie.
 * 2. Database stores only SHA-256(rawToken) — raw tokens cannot be recovered from DB leaks.
 * 3. 60-Minute Idle Inactivity Timeout based on last_activity_at.
 * 4. Strict 7-Day Hard Maximum Lifetime (expires_at is never extended past created_at + 7d).
 * 5. Per-session CSRF secret and multi-device tracking.
 * 6. Instant single-session or global revocation on logout/password change.
 */

export const SESSION_COOKIE_NAME = "ecampus_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days hard ceiling
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;    // 60 minutes idle limit

export interface UserSessionRecord {
  session_id_hash: string;
  user_id: string;
  created_at: string;
  last_activity_at: string;
  expires_at: string;
  is_revoked: number | boolean;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  csrf_secret: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface SessionPayload {
  userId: string;
  role: string;
  email?: string;
  collegeId?: string | null;
  name?: string | null;
  exp?: number;
}

export interface ClientRequestInfo {
  ip?: string | null;
  userAgent?: string | null;
}

/** Computes the SHA-256 hash of a raw session token */
export function hashSessionToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/** Generates a 32-byte cryptographic random opaque token */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Ensures the user_sessions table exists in the database (once per process). */
let sessionTableReady: Promise<void> | null = null;

export async function ensureSessionTable(db: any): Promise<void> {
  if (!sessionTableReady) {
    sessionTableReady = db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        session_id_hash VARCHAR(128) PRIMARY KEY,
        user_id VARCHAR(128) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        is_revoked BOOLEAN DEFAULT FALSE,
        revoked_at TIMESTAMPTZ,
        revoked_reason VARCHAR(255),
        csrf_secret VARCHAR(128) NOT NULL,
        ip_address VARCHAR(64) DEFAULT 'Unknown',
        user_agent TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_validity ON user_sessions(session_id_hash, is_revoked, expires_at);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked_active ON user_sessions(user_id, is_revoked);
      -- Session timestamps are always written as UTC ISO strings. Plain TIMESTAMP
      -- columns make the pg driver read that wall time in the host's timezone,
      -- which shifts last_activity_at by the local UTC offset (e.g. 5.5h in IST)
      -- and expires every session as idle. Convert any legacy table in place.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_sessions'
            AND column_name = 'last_activity_at'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE user_sessions
            ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
            ALTER COLUMN last_activity_at TYPE TIMESTAMPTZ USING last_activity_at AT TIME ZONE 'UTC',
            ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC',
            ALTER COLUMN revoked_at TYPE TIMESTAMPTZ USING revoked_at AT TIME ZONE 'UTC';
        END IF;
      END $$;
    `).catch((err: any) => {
      sessionTableReady = null;
      console.warn("Session table ensure notice:", err);
    });
  }
  await sessionTableReady;
}

/**
 * Creates a new persistent session record in the database
 */
export async function createUserSession(
  db: any,
  userId: string,
  reqInfo?: ClientRequestInfo
): Promise<{ rawToken: string; csrfSecret: string; csrfToken: string; expiresAt: string }> {
  await ensureSessionTable(db);

  const rawToken = generateSessionToken();
  const sessionIdHash = hashSessionToken(rawToken);
  const csrfSecret = crypto.randomBytes(32).toString("base64url");
  const csrfToken = generateCsrfToken(csrfSecret);

  const now = new Date();
  const nowStr = now.toISOString();
  const expiresAtDate = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  const expiresAtStr = expiresAtDate.toISOString();

  const ip = reqInfo?.ip || "Unknown";
  const ua = reqInfo?.userAgent || "Unknown";

  await db.run(
    `INSERT INTO user_sessions (
      session_id_hash, user_id, created_at, last_activity_at, expires_at,
      is_revoked, csrf_secret, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?)`,
    [sessionIdHash, userId, nowStr, nowStr, expiresAtStr, csrfSecret, ip, ua]
  );

  return {
    rawToken,
    csrfSecret,
    csrfToken,
    expiresAt: expiresAtStr
  };
}

/**
 * Validates a session token from request cookie against the database
 */
export async function validateSession(
  db: any,
  rawToken: string | null | undefined
): Promise<{
  isValid: boolean;
  session?: UserSessionRecord;
  userId?: string;
  csrfSecret?: string;
  reason?: "invalid" | "expired" | "idle_timeout" | "revoked";
}> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return { isValid: false, reason: "invalid" };
  }

  await ensureSessionTable(db);
  const hash = hashSessionToken(rawToken.trim());

  const session: UserSessionRecord | undefined = await db.get(
    "SELECT * FROM user_sessions WHERE session_id_hash = ?",
    [hash]
  );

  if (!session) {
    return { isValid: false, reason: "invalid" };
  }

  if (Boolean(session.is_revoked)) {
    return { isValid: false, reason: "revoked" };
  }

  const nowMs = Date.now();
  const expiresAtMs = new Date(session.expires_at).getTime();

  // 1. Check absolute 7-day hard ceiling
  if (expiresAtMs <= nowMs) {
    await db.run(
      "UPDATE user_sessions SET is_revoked = TRUE, revoked_at = ?, revoked_reason = 'expired' WHERE session_id_hash = ?",
      [new Date().toISOString(), hash]
    ).catch(() => {});
    return { isValid: false, reason: "expired" };
  }

  // 2. Check 60-minute idle inactivity timeout
  const lastActivityMs = new Date(session.last_activity_at).getTime();
  if (nowMs - lastActivityMs > SESSION_IDLE_TIMEOUT_MS) {
    await db.run(
      "UPDATE user_sessions SET is_revoked = TRUE, revoked_at = ?, revoked_reason = 'idle_timeout' WHERE session_id_hash = ?",
      [new Date().toISOString(), hash]
    ).catch(() => {});
    return { isValid: false, reason: "idle_timeout" };
  }

  // The activity stamp is NOT taken here. It used to be an awaited UPDATE on the
  // validation path, which put a database round trip in front of every single
  // authenticated request. Callers in request scope schedule it through after()
  // instead (see authGuard.loadSession), so the write still lands reliably without
  // the user waiting for it.
  return {
    isValid: true,
    session,
    userId: session.user_id,
    csrfSecret: session.csrf_secret
  };
}

/** Sessions are stamped at most once per this window, so an active click stream
 *  does not turn into one write per click. */
export const SESSION_TOUCH_THROTTLE_MS = 30 * 1000;

/**
 * True when `last_activity_at` is stale enough to deserve a fresh stamp. A value
 * the driver could not parse (undefined/NaN) returns false rather than stamping.
 */
export function shouldStampActivity(lastActivityAt: unknown, nowMs = Date.now()): boolean {
  const lastMs = new Date(lastActivityAt as any).getTime();
  if (!Number.isFinite(lastMs)) return false;
  return nowMs - lastMs > SESSION_TOUCH_THROTTLE_MS;
}

/** Writes the new activity time for an already-validated session. */
export async function stampSessionActivity(db: any, sessionIdHash: string): Promise<void> {
  await db.run(
    "UPDATE user_sessions SET last_activity_at = ? WHERE session_id_hash = ?",
    [new Date().toISOString(), sessionIdHash]
  );
}

/**
 * Revokes a single session (e.g., user logout)
 */
export async function revokeSession(
  db: any,
  rawToken: string | null | undefined,
  reason: string = "logout"
): Promise<void> {
  if (!rawToken) return;
  await ensureSessionTable(db);
  const hash = hashSessionToken(rawToken.trim());
  await db.run(
    "UPDATE user_sessions SET is_revoked = TRUE, revoked_at = ?, revoked_reason = ? WHERE session_id_hash = ?",
    [new Date().toISOString(), reason, hash]
  ).catch(() => {});
}

/**
 * Revokes all active sessions for a user (e.g. password changed or account suspended)
 */
export async function revokeAllUserSessions(
  db: any,
  userId: string,
  reason: string = "password_changed"
): Promise<void> {
  if (!userId) return;
  await ensureSessionTable(db);
  await db.run(
    "UPDATE user_sessions SET is_revoked = TRUE, revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND is_revoked = FALSE",
    [new Date().toISOString(), reason, userId]
  ).catch(() => {});
}

/** Serialize Set-Cookie header for the HttpOnly session cookie */
export function buildSessionCookie(rawToken: string, maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Serialize Set-Cookie header for the non-HttpOnly CSRF cookie readable by client */
export function buildCsrfCookie(csrfToken: string, maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** Clear session and CSRF cookies */
export function buildClearSessionCookies(): string[] {
  return [
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    `${CSRF_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`
  ];
}
