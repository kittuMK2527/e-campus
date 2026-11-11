export const maxDuration = 60;

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getDb, PostgresDbAdapter, type QueryFailure } from "@/lib/db";
import { verifyPassword, verifyPasswordAsync, hashPassword, hashPasswordAsync, needsRehash, looksLikeStoredCredential } from "@/lib/auth";
import { SUPER_ADMIN_ROLE, roleGrantsSuperAdmin } from "@/lib/superadmin";
import { createUserSession, revokeSession, validateSession, buildSessionCookie, buildCsrfCookie, buildClearSessionCookies } from "@/lib/session";
import { extractSessionToken, normalizeRole, isAccountDisabled } from "@/lib/authGuard";
import { after } from "next/server";
import { ensureMigration } from "@/lib/migrations";
import { generateId } from "@/lib/id";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";

/** Profile tables that hold a display name for each role (whitelisted — never user input). */
const ROLE_PROFILE_TABLES: Record<string, string> = {
  admin: "admin_users",
  cm: "campus_managers",
  cam: "campus_managers",  // legacy token (pre-rename DB rows)
  mentor: "mentors",
  student: "students",
  kam: "kam_users",
  sme: "sme_users",
};

/** Constant-time string comparison that never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** Escapes LIKE metacharacters so identifier input matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** One copy for every rejected credential so responses cannot reveal which emails exist. */
const INVALID_CREDENTIALS_MESSAGE = "Incorrect email or password.";

/**
 * Opt-in break-glass owner account.
 * Active strictly when SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are set in the environment.
 * Hardcoded password fallbacks have been removed to prevent unauthorized takeover (BUG-01).
 */
function matchesConfiguredSuperAdmin(email: string, password: string): boolean {
  const configuredEmail = (process.env.SUPER_ADMIN_EMAIL || "").toLowerCase().trim();
  const configuredPassword = process.env.SUPER_ADMIN_PASSWORD || "";
  if (!configuredEmail || !configuredPassword) return false;

  const isSuperEmail = safeEqual(email, configuredEmail) || email === "admin" || email === "admin@faceprep.in";
  if (!isSuperEmail) return false;

  return safeEqual(password, configuredPassword);
}

/** Creates (or repairs) the super-admin account plus its admin_users profile row. */
async function provisionSuperAdmin(db: PostgresDbAdapter, email: string, password: string) {
  const now = new Date().toISOString();
  const hashed = hashPassword(password);
  const name = (process.env.SUPER_ADMIN_NAME || "Super Admin").trim();

  // Both probes key off the email, so they leave as one round trip. This only runs
  // on the cold super-admin provisioning path, but a failed read here decides
  // whether an existing account gets overwritten, so it must refuse.
  const provisionFailures: QueryFailure[] = [];
  const [profileRows, userRows] = await db.multiQuery([
    { sql: "SELECT id, name FROM admin_users WHERE LOWER(email) = ?", params: [email] },
    { sql: "SELECT id FROM users WHERE LOWER(email) = ?", params: [email] },
  ], provisionFailures);
  if (provisionFailures.length > 0) {
    throw new Error(`super admin provisioning inputs unreadable: ${provisionFailures[0].error}`);
  }
  const existingProfile = profileRows[0];
  const profileId = existingProfile?.id || `admin_${crypto.randomUUID().slice(0, 8)}`;

  if (!existingProfile) {
    await db.run("INSERT INTO admin_users (id, name, email) VALUES (?, ?, ?)", [profileId, name, email]);
  }

  const existingUser = userRows[0];
  if (existingUser) {
    await db.run(
      "UPDATE users SET password_hash = ?, role = ?, reference_id = ?, updated_at = ? WHERE id = ?",
      [hashed, SUPER_ADMIN_ROLE, profileId, now, existingUser.id]
    );
    return { id: existingUser.id, email, password_hash: hashed, role: SUPER_ADMIN_ROLE, reference_id: profileId };
  }

  const userId = `user_admin_${crypto.randomUUID().slice(0, 8)}`;
  await db.run(
    "INSERT INTO users (id, email, password_hash, role, reference_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [userId, email, hashed, SUPER_ADMIN_ROLE, profileId, now, now]
  );
  return { id: userId, email, password_hash: hashed, role: SUPER_ADMIN_ROLE, reference_id: profileId };
}

/** The columns of a `users` row the profile lookup below needs. */
interface LoginUser {
  id?: string;
  role?: string | null;
  reference_id?: string | null;
  email?: string | null;
}

/** Roles whose dashboards are scoped by a college stored on their profile row. */
const COLLEGE_SCOPED_ROLES = new Set(["cm", "cam", "student", "mentor"]);

/**
 * Best-effort profile row for the signed-in user: the header display name and, for the
 * roles that carry one, the college scope. Both used to be their own round trip on the
 * sign-in path, right after the password was verified.
 */
async function resolveProfile(db: PostgresDbAdapter, user: LoginUser): Promise<{ name: string | null; collegeId: string | null }> {
  const roleKey = String(user.role || "").toLowerCase();
  const table = ROLE_PROFILE_TABLES[roleKey];
  if (!table) return { name: null, collegeId: null };
  const columns = COLLEGE_SCOPED_ROLES.has(roleKey) ? "name, college_id" : "name";
  try {
    const row = await db.get(
      `SELECT ${columns} FROM ${table} WHERE id = ? OR LOWER(email) = ?`,
      [user.reference_id || user.id, String(user.email || "").toLowerCase()]
    );
    return { name: row?.name || null, collegeId: row?.college_id ?? null };
  } catch {
    return { name: null, collegeId: null };
  }
}

/** Records one sign-in outcome. Awaited on purpose: a fire-and-forget row would be
 *  frozen with the response and the counter would never fill up. */
async function noteLoginAttempt(db: PostgresDbAdapter, emailKey: string, ip: string, success: boolean) {
  try {
    await ensureMigration("login_attempts");
    await db.run(
      "INSERT INTO login_attempts (id, email_key, ip, success, attempted_at) VALUES (?, ?, ?, ?, ?)",
      [generateId("lattempt"), emailKey, ip, success ? 1 : 0, new Date().toISOString()]
    );
  } catch (err) {
    console.warn("[login] could not record sign-in attempt:", err);
  }
}

export async function POST(request: Request) {
  try {
    // Legacy role-token cleanup moved into the post-auth after() block below. It used to
    // be awaited here, which cost two cold-start round trips before the credentials were
    // even looked at, and normalizeRole() already maps the old tokens in JS.
    const db = await getDb();
    const body = await request.json();

    if (body.action === "logout") {
      const rawToken = extractSessionToken(request);
      if (rawToken) {
        // Resolve the owner from the session token — never from the request body,
        // otherwise anyone could forge logout entries in login_history.
        const sessionRes = await validateSession(db, rawToken).catch(() => null);
        await revokeSession(db, rawToken, "logout").catch(() => { });
        const sessionUserId = sessionRes?.isValid ? sessionRes.userId : null;
        if (sessionUserId) {
          const lastSession = await db.get(
            "SELECT id FROM login_history WHERE user_id = ? AND logout_time IS NULL ORDER BY login_time DESC LIMIT 1",
            [sessionUserId]
          );
          if (lastSession) {
            await db.run("UPDATE login_history SET logout_time = ? WHERE id = ?", [new Date().toISOString(), lastSession.id]);
          }
        }
      }
      const res = NextResponse.json({ success: true, message: "Logged out successfully." });
      const clearCookies = buildClearSessionCookies();
      clearCookies.forEach(c => res.headers.append("Set-Cookie", c));
      return res;
    }

    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ success: false, message: "Missing email or password" }, { status: 400 });
    }

    const lowerEmail = email.toLowerCase().trim();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Web Browser";

    const likeEmailPrefix = `${escapeLike(lowerEmail)}@%`;
    const likeNameContains = `%${escapeLike(lowerEmail)}%`;

    // Query centralized users table by email, reference_id, id, or username prefix
    let user = await db.get(
      "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(reference_id) = ? OR LOWER(id) = ? OR LOWER(email) LIKE ?",
      [lowerEmail, lowerEmail, lowerEmail, likeEmailPrefix]
    );

    // Opt-in break-glass path — repairs or provisions the owner account when admin credentials match
    const configuredAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "thanush@faceprep.in").toLowerCase().trim();
    if (matchesConfiguredSuperAdmin(lowerEmail, password)) {
      const targetEmail = (lowerEmail === "admin" || lowerEmail === "admin@faceprep.in") ? configuredAdminEmail : lowerEmail;
      if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
        user = await provisionSuperAdmin(db, targetEmail, password);
      }
    }

    // Auto-provision user record if present in role tables but missing from centralized users table
    if (!user) {
      let resolvedEmail = lowerEmail;

      // ── Parallel role lookup — all 5 tables queried in one round-trip ──
      // mentors/students carry a password_hash; sme_users still has a plaintext
      // `password`; campus_managers/kam_users keep their credential only in `users`.
      const [cm, mentor, student, kam, sme] = await Promise.all([
        db.get(
          "SELECT id, email FROM campus_managers WHERE LOWER(email) = ? OR LOWER(id) = ? OR LOWER(name) = ? OR LOWER(email) LIKE ? OR LOWER(name) LIKE ?",
          [lowerEmail, lowerEmail, lowerEmail, likeEmailPrefix, likeNameContains]
        ),
        db.get(
          "SELECT id, email, password_hash FROM mentors WHERE LOWER(email) = ? OR LOWER(id) = ? OR LOWER(name) = ? OR LOWER(email) LIKE ? OR LOWER(name) LIKE ?",
          [lowerEmail, lowerEmail, lowerEmail, likeEmailPrefix, likeNameContains]
        ),
        db.get(
          "SELECT id, email, password_hash FROM students WHERE LOWER(email) = ? OR LOWER(id) = ? OR LOWER(roll_number) = ? OR LOWER(register_number) = ?",
          [lowerEmail, lowerEmail, lowerEmail, lowerEmail]
        ),
        db.get(
          "SELECT id, email FROM kam_users WHERE LOWER(email) = ? OR LOWER(id) = ? OR LOWER(name) = ? OR LOWER(email) LIKE ? OR LOWER(name) LIKE ?",
          [lowerEmail, lowerEmail, lowerEmail, likeEmailPrefix, likeNameContains]
        ),
        db.get(
          "SELECT id, email, password FROM sme_users WHERE LOWER(email) = ? OR LOWER(id) = ? OR LOWER(name) = ? OR LOWER(email) LIKE ? OR LOWER(name) LIKE ?",
          [lowerEmail, lowerEmail, lowerEmail, likeEmailPrefix, likeNameContains]
        )
      ]);

      // Priority: CM > Mentor > Student > KAM > SME
      const resolved = cm ? { role: "cm", record: cm }
        : mentor ? { role: "mentor", record: mentor }
          : student ? { role: "student", record: student }
            : kam ? { role: "kam", record: kam }
              : sme ? { role: "sme", record: sme }
                : null;

      let foundRole: string | null = null;
      let refId: string | null = null;
      let storedCredential: string | null = null;
      if (resolved) {
        foundRole = resolved.role;
        refId = resolved.record.id;
        if (resolved.record.email) resolvedEmail = resolved.record.email.toLowerCase();
        storedCredential = resolved.record.password_hash || resolved.record.password || null;
      }

      if (foundRole && refId) {
        // If an account already exists in users (e.g. user logged in via roll number or register number
        // while the users row is keyed by email/id), reuse the existing account instead of causing a unique constraint violation.
        const existingUser = await db.get(
          "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(reference_id) = ? OR LOWER(id) = ?",
          [resolvedEmail, refId.toLowerCase(), refId.toLowerCase()]
        );

        if (existingUser) {
          if (!existingUser.password_hash && storedCredential && looksLikeStoredCredential(String(storedCredential))) {
            existingUser.password_hash = storedCredential;
            await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [storedCredential, existingUser.id]);
          }
          user = existingUser;
        } else {
          // WF-P20: If a stored hash exists on the role table (mentors, students), verify against it.
          // For institutional staff/managers (KAM, CM, SME) provisioned in their profile table without
          // an initial password_hash, allow initial login via DEFAULT_PASSWORD or their stored password.
          const stored = String(storedCredential || "");
          const looksHashed = looksLikeStoredCredential(stored);
          let isValid = false;

          if (looksHashed) {
            isValid = await verifyPasswordAsync(password, stored);
          } else if (stored && (stored === password || safeEqual(stored, password))) {
            isValid = true;
          } else if ((foundRole === "kam" || foundRole === "cm" || foundRole === "sme" || foundRole === "admin") &&
                     (password === DEFAULT_PASSWORD || safeEqual(password, DEFAULT_PASSWORD))) {
            isValid = true;
          }

          if (!isValid) {
            await noteLoginAttempt(db, lowerEmail, ip, false);
            return NextResponse.json(
              { success: false, message: INVALID_CREDENTIALS_MESSAGE },
              { status: 401 }
            );
          }

          const newHashed = (looksHashed && !needsRehash(stored)) ? stored : await hashPasswordAsync(password);
          const newId = generateId("user");
          await db.run(
            `INSERT INTO users (id, email, password_hash, role, reference_id, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
               email = EXCLUDED.email,
               password_hash = EXCLUDED.password_hash,
               role = EXCLUDED.role,
               reference_id = EXCLUDED.reference_id,
               updated_at = EXCLUDED.updated_at`,
            [newId, resolvedEmail, newHashed, foundRole, refId, new Date().toISOString(), new Date().toISOString()]
          );
          user = { id: newId, email: resolvedEmail, password_hash: newHashed, role: foundRole, reference_id: refId };
        }
      }
    }

    if (!user) {
      await noteLoginAttempt(db, lowerEmail, ip, false);
      return NextResponse.json(
        { success: false, message: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 }
      );
    }

    // Every account — including the owner account — verifies its stored hash. No bypass.
    if (!user.password_hash) {
      await noteLoginAttempt(db, lowerEmail, ip, false);
      return NextResponse.json(
        { success: false, message: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 }
      );
    }

    if (!(await verifyPasswordAsync(password, user.password_hash))) {
      await noteLoginAttempt(db, lowerEmail, ip, false);
      return NextResponse.json(
        { success: false, message: INVALID_CREDENTIALS_MESSAGE },
        { status: 401 }
      );
    }

    if (isAccountDisabled(user.status)) {
      return NextResponse.json(
        { success: false, message: "This account is inactive. Please contact your administrator." },
        { status: 403 }
      );
    }

    // Rehash-on-login: transparently upgrade legacy 1,000-iteration hashes to
    // the current 210,000-iteration format (API_OPTIMIZATION_PLAN item 10).
    // Deferred with the other post-auth writes below so the ~100ms of PBKDF2 and
    // the UPDATE never sit on the response path.
    const needsPwdRehash = needsRehash(String(user.password_hash));

    // Super admin is derived purely from the stored role — never from the email address
    const isSuperAdmin = roleGrantsSuperAdmin(user.role);

    // College scope and the header display name live on the role's profile row, and the
    // session row is keyed only by user.id - so the profile read and the session insert
    // go out together instead of one waiting on the other.
    const [profile, session] = await Promise.all([
      resolveProfile(db, user),
      createUserSession(db, user.id, { ip, userAgent })
    ]);
    const collegeId = profile.collegeId;
    const userName = profile.name;
    const { rawToken, csrfToken, expiresAt } = session;

    // Check if password change is explicitly enforced
    const mustChangePassword = Boolean(user.must_change_password);

    // Client metadata for multi-device auditing (without brittle IP termination)
    // (ip / userAgent already resolved above, before the throttle check)

    // Login history, last_login and the rehash used to be a bare Promise.all with no
    // await. Vercel freezes the function the moment the response is returned, so those
    // writes routinely never ran (and .catch(() => {}) hid it) — the admin's
    // login-history screen simply lost rows. after() keeps the invocation alive.
    const nowStr = new Date().toISOString();
    const logId = generateId("log");
    const loginWrites: { sql: string; params: any[] }[] = [
      {
        sql: "INSERT INTO login_history (id, user_id, login_time, ip, device) VALUES (?, ?, ?, ?, ?)",
        params: [logId, user.id, nowStr, ip, userAgent],
      },
      { sql: "UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?", params: [nowStr, nowStr, user.id] },
      { sql: "DELETE FROM login_attempts WHERE attempted_at < ?", params: [new Date(Date.now() - 24 * 60 * 60_000).toISOString()] },
    ];
    if (needsPwdRehash) {
      loginWrites.push({ sql: "UPDATE users SET password_hash = ? WHERE id = ?", params: [await hashPasswordAsync(password), user.id] });
    }
    if (user.role === "student" && user.reference_id) {
      loginWrites.push({ sql: "UPDATE students SET last_login = ?, updated_at = ? WHERE id = ?", params: [nowStr, nowStr, user.reference_id] });
    }
    if (user.role === "mentor" && user.reference_id) {
      loginWrites.push({ sql: "UPDATE mentors SET last_login = ?, updated_at = ? WHERE id = ?", params: [nowStr, nowStr, user.reference_id] });
    }

    const runPostLoginWrites = async () => {
      await ensureMigration("cm_role_rename_tokens").catch(() => { });
      await ensureMigration("lnd_role_rename_tokens").catch(() => { });
      const failures: any[] = [];
      await db.multiQuery(loginWrites, failures).catch((err: any) => failures.push({ error: err?.message || String(err) }));
      if (failures.length > 0) {
        console.warn("[login] post-login writes failed:", failures.map((f: any) => f.error || f.sql).join(" | "));
      }
    };

    try {
      after(runPostLoginWrites);
    } catch {
      runPostLoginWrites().catch(() => { });
    }

    const response = NextResponse.json({
      success: true,
      role: normalizeRole(user.role),
      userId: user.reference_id || user.id,
      collegeId: collegeId,
      userEmail: user.email || lowerEmail,
      userName: userName,
      isSuperAdmin: isSuperAdmin,
      mustChangePassword: !!mustChangePassword,
      csrfToken: csrfToken,
      expiresAt: expiresAt
    });
    response.headers.append("Set-Cookie", buildSessionCookie(rawToken));
    response.headers.append("Set-Cookie", buildCsrfCookie(csrfToken));
    return response;
  } catch (error: any) {
    const isClientAbort =
      error?.code === "ECONNRESET" ||
      error?.name === "AbortError" ||
      error?.message?.toLowerCase().includes("aborted") ||
      error?.message?.toLowerCase().includes("premature close");

    if (isClientAbort) {
      // Client closed or aborted connection before response finished (e.g. redirect, reload)
      return new Response(null, { status: 499 });
    }

    console.error("API POST Login error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
