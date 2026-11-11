import { NextResponse, after } from "next/server";
import { getDb, PostgresDbAdapter } from "@/lib/db";
import { validateSession, shouldStampActivity, stampSessionActivity, SESSION_COOKIE_NAME, UserSessionRecord } from "@/lib/session";
import { verifyCsrfToken, CSRF_HEADER_NAME, generateCsrfToken } from "@/lib/csrf";
import { roleGrantsSuperAdmin } from "@/lib/superadmin";
import { logger } from "@/lib/logger";

export type Role = "admin" | "cm" | "mentor" | "student" | "kam" | "sme" | "fee_manager" | "L and D" | "hr";

/** Legacy role spellings that map onto the current machine tokens. */
const LEGACY_ROLE_MAP: Record<string, string> = {
  cam: "cm",           // pre-rename Campus Manager token
  campus_manager: "cm",
  "l and d": "L and D", // lowercase DB storage → canonical mixed-case token
  "learning and development": "L and D",
  "learning & development": "L and D",
  lnd: "L and D",
  "l&d": "L and D",
  ld: "L and D",
  "l-d": "L and D",
  allocator: "L and D",
  "demo allocator": "L and D"
};

/** Normalizes a raw DB role string (including legacy tokens) to the current Role. */
export function normalizeRole(role: string): Role {
  const raw = (role || "student").toLowerCase().trim();
  return ((LEGACY_ROLE_MAP as Record<string, string>)[raw] || raw) as Role;
}

export interface AuthenticatedUser {
  id: string;              // users.id
  reference_id: string;    // profile ID (e.g. mentor_1, cam_1, student_1)
  role: Role;
  email: string;
  name: string;
  college_id?: string | null;
  isSuperAdmin: boolean;
  mustChangePassword?: boolean;
}

export interface AuthGuardResult {
  user: AuthenticatedUser;
  session: UserSessionRecord;
  csrfToken: string;
}

export interface RequireAuthOptions {
  allowedRoles?: Role[];
  checkCsrf?: boolean;
  allowPasswordChangeRequired?: boolean;
}

/** Profile tables that hold display names and metadata for each role */
const ROLE_PROFILE_TABLES: Record<string, string> = {
  admin: "admin_users",
  cm: "campus_managers",
  mentor: "mentors",
  student: "students",
  kam: "kam_users",
  sme: "sme_users",
};

/**
 * Extracts session token from incoming request cookies
 */
export function extractSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") || "";
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map(c => c.trim());
  const prefix = `${SESSION_COOKIE_NAME}=`;
  const sessionCookie = cookies.find(c => c.startsWith(prefix));
  if (!sessionCookie) return null;

  return decodeURIComponent(sessionCookie.substring(prefix.length).trim());
}

/**
 * A dashboard fan-out fires several API calls per interaction, each of which
 * otherwise repeats the same session and user lookups. Sharing the in-flight
 * promise collapses concurrent identical reads into one round trip and keeps
 * nothing past the request, so revocation and role changes stay immediate.
 * Each waiter gets its own copy (the `.then` runs per caller, not per lookup)
 * so a route mutating its user or session cannot leak into another request
 * that was coalesced with it.
 */
const identityInFlight = new Map<string, Promise<any>>();

function coalesce<T>(key: string, make: () => Promise<T>): Promise<T> {
  const existing = identityInFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = make().finally(() => {
    if (identityInFlight.get(key) === pending) identityInFlight.delete(key);
  });
  identityInFlight.set(key, pending);
  return pending;
}

/**
 * Accounts an administrator has turned off. `users.status` is free text written by
 * several routes ('Inactive', 'Blocked', ...), so the test is case-insensitive and
 * covers the synonyms rather than one exact string.
 */
const DISABLED_STATUSES = new Set(["inactive", "blocked", "suspended", "disabled", "deactivated"]);

export function isAccountDisabled(status: unknown): boolean {
  return DISABLED_STATUSES.has(String(status ?? "").toLowerCase().trim());
}

export function loadSession(rawToken: string) {
  return coalesce(`session:${rawToken}`, async () => {
    const db = await getDb();
    return validateSession(db, rawToken);
  }).then((res) => {
    if (res.isValid && res.session && shouldStampActivity(res.session.last_activity_at)) {
      scheduleActivityStamp(res.session.session_id_hash);
    }
    return {
      ...res,
      session: res.session ? { ...res.session } : res.session
    };
  });
}

/**
 * Sessions stamped in the current instance and still waiting for their write.
 * A dashboard burst coalesces onto one session read but every caller reaches the
 * scheduling hook, so this keeps a burst to a single UPDATE. Entries are released
 * when the write settles, which also means a failed stamp is retried by the next
 * request instead of being remembered as done.
 */
const scheduledStamps = new Set<string>();

function scheduleActivityStamp(sessionIdHash: string): void {
  if (!sessionIdHash || scheduledStamps.has(sessionIdHash)) return;
  scheduledStamps.add(sessionIdHash);

  // after() owns when the write starts: a promise created here would run in
  // parallel with the request and be frozen with the response on Vercel, which
  // silently stops sessions ageing.
  after(async () => {
    try {
      const db = await getDb();
      await stampSessionActivity(db, sessionIdHash);
    } catch (err: any) {
      logger.warn("session activity stamp failed", { error: err?.message || String(err) });
    } finally {
      scheduledStamps.delete(sessionIdHash);
    }
  });
}

export function loadUser(userId: string) {
  return coalesce(`user:${userId}`, async () => {
    const db = await getDb();
    return resolveLiveUser(db, userId);
  }).then((user) => (user ? { ...user } : null));
}

/** Profile tables that also carry a college scope (mirrors postgres_schema.sql). */
const PROFILE_COLLEGE_COLUMN: Record<string, string> = {
  campus_managers: "college_id",
  mentors: "college_id",
  students: "college_id"
};

/** Every role profile table, deduped from the role map so the two cannot drift. */
const PROFILE_TABLES: string[] = Array.from(new Set(Object.values(ROLE_PROFILE_TABLES)));

/** One UNION branch: profile rows for this table that could belong to the user. */
function profileLookupBranch(table: string): string {
  const collegeColumn = PROFILE_COLLEGE_COLUMN[table] || "NULL::text";
  return `SELECT id, '${table}' AS table_key, name AS profile_name, ${collegeColumn} AS profile_college_id FROM ${table} WHERE id = COALESCE(u.reference_id, u.id) OR LOWER(email) = LOWER(u.email)`;
}

/**
 * The users row plus every candidate profile row in a single statement. Identity
 * used to cost two sequential round trips (users, then the role's profile table),
 * and this is the read every authenticated API request pays. Table names come from
 * the whitelisted map above, never from input.
 */
export const IDENTITY_SQL = `WITH u AS (SELECT id, email, role, reference_id, status, must_change_password FROM users WHERE id = ?) SELECT u.id, u.email, u.role, u.reference_id, u.status, u.must_change_password, p.id AS profile_id, p.table_key, p.profile_name, p.profile_college_id FROM u LEFT JOIN LATERAL (${PROFILE_TABLES.map(profileLookupBranch).join(" UNION ALL ")}) p ON TRUE`;

/** Shapes the users columns into the authenticated user both identity reads return. */
function shapeAuthenticatedUser(user: any, profile: { profile_name?: string | null; profile_college_id?: string | null } | null): AuthenticatedUser {
  const role = normalizeRole(user.role);
  return {
    id: user.id,
    reference_id: user.reference_id || user.id,
    role,
    email: user.email || "",
    name: profile?.profile_name || user.name || user.email || "User",
    college_id: profile?.profile_college_id ?? null,
    isSuperAdmin: roleGrantsSuperAdmin(role),
    mustChangePassword: Boolean(user.must_change_password)
  };
}

/**
 * Picks the profile row belonging to the role's own table, preferring the row whose
 * id matched over one found through the email fallback - the same precedence the
 * two-step lookup had.
 */
export function pickProfileRow(rows: any[], profileTable: string | undefined, userId: string, referenceId: string | null): any | null {
  if (!profileTable) return null;
  const matches = rows.filter((row: any) => row && row.table_key === profileTable);
  return matches.find(row => String(row.profile_id) === String(referenceId || userId)) || matches[0] || null;
}

/**
 * Identity in one round trip: users row plus its candidate profile rows. Returns
 * null only when the statement could not run (schema drift, pooler failure), which
 * is when the caller drops to the per-table lookups. An empty array means the
 * users row is genuinely not there - an answer, not a failure.
 */
async function readIdentityRows(db: PostgresDbAdapter, userId: string): Promise<any[] | null> {
  try {
    return await db.all(IDENTITY_SQL, [userId]);
  } catch (err: any) {
    logger.warn("combined identity read failed, falling back to per-table lookups", { error: err?.message || String(err) });
    return null;
  }
}

/**
 * Resolves current live user record and role details from the database
 */
export async function resolveLiveUser(
  db: PostgresDbAdapter,
  userId: string
): Promise<AuthenticatedUser | null> {
  const rows = await readIdentityRows(db, userId);
  if (rows && rows.length > 0) {
    const user = rows[0];
    if (isAccountDisabled(user.status)) return null;
    const profile = pickProfileRow(rows, ROLE_PROFILE_TABLES[normalizeRole(user.role)], user.id, user.reference_id);
    return shapeAuthenticatedUser(user, profile);
  }

  // Session rows store users.id, so the primary-key lookup covers the hot path.
  let user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) {
    user = await db.get(
      "SELECT * FROM users WHERE reference_id = ? OR LOWER(email) = ? LIMIT 1",
      [userId, userId.toLowerCase()]
    );
  }

  if (!user) return null;

  // A revoked status must end the session, not just the next login: until this check,
  // an account switched to Inactive kept working for the remaining 30 days of its
  // cookie, and /api/me kept handing back a full dashboard.
  if (isAccountDisabled(user.status)) return null;

  const role = normalizeRole(user.role);
  let name = user.name || "";
  let collegeId: string | null = null;

  // Query role table for authoritative name and campus assignment
  try {
    const table = ROLE_PROFILE_TABLES[role];
    if (table) {
      const profileId = user.reference_id || user.id;
      let profile = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [profileId]);
      if (!profile) {
        profile = await db.get(
          `SELECT * FROM ${table} WHERE LOWER(email) = ? LIMIT 1`,
          [String(user.email || "").toLowerCase()]
        );
      }
      if (profile) {
        if (profile.name) name = profile.name;
        if (profile.college_id) collegeId = profile.college_id;
      }
    }
  } catch (err: any) {
    // A missing/renamed profile table must not fail the request, but it silently
    // degraded every role's display name and campus scope when it happened.
    logger.warn("resolveLiveUser profile lookup failed", { role, error: err?.message || String(err) });
  }

  return {
    id: user.id,
    reference_id: user.reference_id || user.id,
    role,
    email: user.email || "",
    name: name || user.email || "User",
    college_id: collegeId,
    isSuperAdmin: roleGrantsSuperAdmin(role),
    mustChangePassword: Boolean(user.must_change_password)
  };
}

/**
 * Server-Side In-Route Guard
 * 
 * Verifies:
 * 1. Valid non-revoked session exists in DB for cookie token.
 * 2. Inactivity does not exceed 60 minutes.
 * 3. 7-day hard maximum ceiling is not exceeded.
 * 4. CSRF token validity on mutating HTTP methods (POST, PUT, DELETE, PATCH).
 * 5. Mandatory password rotation, unless explicitly allowed for identity/rotation.
 * 6. Live role permissions on the server.
 */
export async function requireAuth(
  request: Request,
  options: RequireAuthOptions = {}
): Promise<{ auth?: AuthGuardResult; errorResponse?: NextResponse }> {
  try {
    const rawToken = extractSessionToken(request);
    if (!rawToken) {
      return {
        errorResponse: NextResponse.json(
          { success: false, message: "Unauthorized: No session token provided.", code: "NO_SESSION" },
          { status: 401 }
        )
      };
    }

    const sessionRes = await loadSession(rawToken);

    if (!sessionRes.isValid || !sessionRes.session || !sessionRes.userId) {
      const code = sessionRes.reason === "idle_timeout" ? "SESSION_IDLE" : "SESSION_EXPIRED";
      const msg = sessionRes.reason === "idle_timeout"
        ? "Session expired due to 60 minutes of inactivity. Please log in again."
        : "Unauthorized: Invalid or expired session.";

      return {
        errorResponse: NextResponse.json(
          { success: false, message: msg, code },
          { status: 401 }
        )
      };
    }

    // CSRF Check for state-mutating requests
    const method = request.method.toUpperCase();
    const isMutation = method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
    const checkCsrf = options.checkCsrf ?? isMutation;

    if (checkCsrf) {
      const submittedCsrf = request.headers.get(CSRF_HEADER_NAME);
      const isCsrfValid = verifyCsrfToken(submittedCsrf, sessionRes.csrfSecret);

      if (!isCsrfValid) {
        return {
          errorResponse: NextResponse.json(
            { success: false, message: "Forbidden: Invalid or missing CSRF token.", code: "INVALID_CSRF" },
            { status: 403 }
          )
        };
      }
    }

    // Authoritative Live User Resolution
    const user = await loadUser(sessionRes.userId!);
    if (!user) {
      return {
        errorResponse: NextResponse.json(
          { success: false, message: "Unauthorized: User account not found or deactivated.", code: "USER_NOT_FOUND" },
          { status: 401 }
        )
      };
    }

    // Password rotation is mandatory for every role, including super admins.
    if (user.mustChangePassword && !options.allowPasswordChangeRequired) {
      return {
        errorResponse: NextResponse.json(
          { success: false, message: "You must change your password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" },
          { status: 403 }
        )
      };
    }

    // Role Permission Check
    if (options.allowedRoles && options.allowedRoles.length > 0) {
      const isAllowed = user.isSuperAdmin || options.allowedRoles.includes(user.role);
      if (!isAllowed) {
        return {
          errorResponse: NextResponse.json(
            { success: false, message: `Forbidden: Role '${user.role}' is not authorized to perform this action.`, code: "FORBIDDEN_ROLE" },
            { status: 403 }
          )
        };
      }
    }

    const csrfToken = generateCsrfToken(sessionRes.csrfSecret!);

    return {
      auth: {
        user,
        session: sessionRes.session,
        csrfToken
      }
    };
  } catch (err: any) {
    console.error("requireAuth internal error:", err);
    return {
      errorResponse: NextResponse.json(
        { success: false, message: "Internal server error during authentication verification.", error: err.message },
        { status: 500 }
      )
    };
  }
}
