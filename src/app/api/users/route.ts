export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getDb, type QueryFailure } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_PASSWORD } from "@/lib/authConfig";
import { requireRole, apiAuthErrorResponse } from "@/lib/api-auth";
import { requireAuth, normalizeRole } from "@/lib/authGuard";
import { ensureMigration } from "@/lib/migrations";
import { revokeAllUserSessions } from "@/lib/session";
import { generateId } from "@/lib/id";

const PROFILE_SOURCES: Record<string, { table: string; columns: string }> = {
  kam: { table: "kam_users", columns: "name, title" },
  cm: { table: "campus_managers", columns: "name, college_id, kam_id" },
  mentor: { table: "mentors", columns: "name" },
};

// One lookup per role table, keyed by both reference_id and email so a credential
// whose reference_id drifted still resolves the way the per-row OR query did.
async function enrichWithProfileNames(db: any, users: any[]): Promise<any[]> {
  const groups = new Map<string, { ids: string[]; emails: string[] }>();
  for (const u of users) {
    const role = normalizeRole(u.role).toLowerCase();
    if (!PROFILE_SOURCES[role] || !u.reference_id) continue;
    const g = groups.get(role) || { ids: [], emails: [] };
    g.ids.push(String(u.reference_id));
    if (u.email) g.emails.push(String(u.email).toLowerCase());
    groups.set(role, g);
  }
  if (groups.size === 0) return users;

  const byRole = new Map<string, Map<string, any>>();
  try {
    await Promise.all(Array.from(groups.entries()).map(async ([role, g]) => {
      const src = PROFILE_SOURCES[role];
      const idPlaceholders = g.ids.map(() => "?").join(",");
      const hasEmails = g.emails.length > 0;
      const emailPlaceholders = hasEmails ? g.emails.map(() => "?").join(",") : "";
      const rows = await db.all(
        `SELECT id, email, ${src.columns} FROM ${src.table}
         WHERE id IN (${idPlaceholders})${hasEmails ? ` OR LOWER(email) IN (${emailPlaceholders})` : ""}`,
        hasEmails ? [...g.ids, ...g.emails] : [...g.ids]
      );
      const map = new Map<string, any>();
      for (const r of rows) {
        if (r.id) map.set(String(r.id), r);
        if (r.email) map.set(String(r.email).toLowerCase(), r);
      }
      byRole.set(role, map);
    }));
  } catch (err) {
    // Display names are decoration; initials fall back to the email local part.
    console.warn("[/api/users] profile enrichment failed, returning credentials only:", err);
    return users;
  }

  return users.map(u => {
    const map = byRole.get(normalizeRole(u.role).toLowerCase());
    const row = map?.get(String(u.reference_id)) || map?.get(String(u.email || "").toLowerCase());
    if (!row) return u;
    return {
      ...u,
      name: row.name || u.name || null,
      title: row.title ?? u.title ?? null,
      college_id: row.college_id ?? u.college_id ?? null,
      kam_id: row.kam_id ?? u.kam_id ?? null,
    };
  });
}

export async function GET(request: Request) {
  try {
    const { errorResponse } = await requireAuth(request, { allowedRoles: ["admin"] });
    if (errorResponse) return errorResponse;
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const search = (searchParams.get("search") || "").toLowerCase().trim();
    const rawRole = (searchParams.get("role") || "").trim();
    const role = rawRole && rawRole.toLowerCase() !== "all" ? normalizeRole(rawRole) : "";

    const offset = (page - 1) * limit;
    let query = "SELECT id, email, role, reference_id, status, must_change_password, plain_password, last_login, created_at, updated_at FROM users WHERE 1=1";
    let countQuery = "SELECT COUNT(*) as count FROM users WHERE 1=1";
    const params: any[] = [];
    const countParams: any[] = [];

    if (role) {
      query += " AND LOWER(role) = ?";
      countQuery += " AND LOWER(role) = ?";
      params.push(role.toLowerCase());
      countParams.push(role.toLowerCase());
    }

    if (search) {
      query += " AND (LOWER(email) LIKE ? OR LOWER(reference_id) LIKE ? OR LOWER(id) LIKE ?)";
      countQuery += " AND (LOWER(email) LIKE ? OR LOWER(reference_id) LIKE ? OR LOWER(id) LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
      countParams.push(term, term, term);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    // The page rows and the total are independent, so the count rides the same round
    // trip as the rows instead of landing after the enrichment lookups. A failed
    // slice would read as "0 users" or an empty page, so the read is refused instead.
    const listFailures: QueryFailure[] = [];
    const [userRows, countRows] = await db.multiQuery(
      [
        { sql: query, params },
        { sql: countQuery, params: countParams },
      ],
      listFailures
    );
    if (listFailures.length > 0) {
      return NextResponse.json({ success: false, error: "Could not load the user list. Please try again." }, { status: 500 });
    }

    const users = userRows.map((u: any) => ({
      ...u,
      role: normalizeRole(u.role),
      plain_password: u.plain_password || (u.must_change_password ? DEFAULT_PASSWORD : (!u.last_login ? DEFAULT_PASSWORD : DEFAULT_PASSWORD))
    }));
    const total = Number(countRows[0]?.count) || 0;

    // Enrich with display names from profile tables so the admin dashboard
    // avatar initials don't crash on undefined. Three bulk lookups instead of one
    // query per row: 50 users used to mean 50 sequential round trips on this GET.
    const enriched = await enrichWithProfileNames(db, users);

    return NextResponse.json({
      success: true,
      users: enriched,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(request, "admin");
    const db = await getDb();
    await ensureMigration("schema_alignment_2026_10");
    const body = await request.json();
    const { userId, action, email, role, password, reference_id, status } = body;

    // 1. Create New User Credential
    if (action === "create") {
      if (!email || !email.trim()) {
        return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 });
      }
      const cleanEmail = email.toLowerCase().trim();
      const normalizedRole = normalizeRole(role || "mentor");
      const userRole = normalizedRole.toLowerCase().trim();

      // The email clash and both foreign-key probes key off the body, not off each
      // other, and the "not found" fallbacks are read in the same trip so a miss costs
      // no extra round trip. All of them gate the insert below, so a slice that fails
      // refuses the write instead of creating a duplicate email or an orphan profile.
      const createFailures: QueryFailure[] = [];
      const [clashRows, validColRows, anyColRows, validKamRows, anyKamRows] = await db.multiQuery(
        [
          { sql: "SELECT id FROM users WHERE LOWER(email) = ?", params: [cleanEmail] },
          { sql: "SELECT id FROM colleges WHERE id = ?", params: [body.college_id] },
          { sql: "SELECT id FROM colleges ORDER BY id ASC LIMIT 1" },
          { sql: "SELECT id FROM kam_users WHERE id = ?", params: [body.kam_id] },
          { sql: "SELECT id FROM kam_users ORDER BY id ASC LIMIT 1" },
        ],
        createFailures
      );
      if (createFailures.length > 0) {
        return NextResponse.json({ success: false, message: "Could not verify this account against the directory. Please try again." }, { status: 500 });
      }
      if (clashRows.length > 0) {
        return NextResponse.json({ success: false, message: "A user credential with this email already exists." }, { status: 400 });
      }

      const refId = (reference_id || "").trim() || generateId(userRole);
      const newId = generateId("user");
      const rawPassword = password ? password.trim() : DEFAULT_PASSWORD;
      const passHash = hashPassword(rawPassword);
      const userStatus = status || "Active";
      const nowStr = new Date().toISOString();

      // plain_password column is deprecated — new users get hash-only rows
      // (security audit item 5). Set must_change_password so default
      // credentials are rotated on first login.

      // Auto-sync into role-specific tables so new KAMs, CAMs, Mentors appear in dropdowns instantly
      const rawName = body.name || body.userName || cleanEmail.split("@")[0];
      const displayName = rawName.replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      // Safely resolve valid foreign keys for college_id and kam_id
      const safeColId = (body.college_id && validColRows[0]) ? body.college_id : (anyColRows[0]?.id || null);
      const safeKamId = (body.kam_id && validKamRows[0]) ? body.kam_id : (anyKamRows[0]?.id || null);

      // Credential and profile row commit together. Split, a failed profile insert left
      // a login that worked but whose reference_id pointed at nothing — an account
      // invisible to every dropdown and dashboards that key off the profile table.
      await db.transaction(async (tx) => {
        await tx.run(
          `INSERT INTO users (id, email, password_hash, plain_password, role, reference_id, status, must_change_password, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [newId, cleanEmail, passHash, rawPassword, normalizedRole, refId, userStatus, nowStr, nowStr]
        );

        if (userRole === "kam") {
          await tx.run(
            `INSERT INTO kam_users (id, name, email, title) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
            [refId, displayName, cleanEmail, body.title || "Key Account Manager"]
          );
        } else if (userRole === "cm" || userRole === "cam") {
          await tx.run(
            `INSERT INTO campus_managers (id, name, email, college_id, kam_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
            [refId, displayName, cleanEmail, safeColId, safeKamId]
          );
        } else if (userRole === "mentor") {
          await tx.run(
            `INSERT INTO mentors (id, name, email, college_id, department, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Active', ?, ?) ON CONFLICT (id) DO NOTHING`,
            [refId, displayName, cleanEmail, safeColId, body.department || "Engineering", nowStr, nowStr]
          );
        } else if (userRole === "sme") {
          await tx.run(
            `INSERT INTO sme_users (id, name, email, department) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
            [refId, displayName, cleanEmail, body.department || "Subject Matter Expert"]
          );
        } else if (userRole === "student") {
          await tx.run(
            `INSERT INTO students (id, name, email, college_id, department, classGroup, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?) ON CONFLICT (id) DO NOTHING`,
            [refId, displayName, cleanEmail, safeColId, body.department || "Engineering", body.classGroup || "General", nowStr, nowStr]
          );
        }
      });

      return NextResponse.json({
        success: true,
        message: "User credential created successfully.",
        user: { id: newId, email: cleanEmail, role: normalizedRole, reference_id: refId, status: userStatus }
      });
    }

    // Actions targeting an existing user by userId / reference_id
    if (!userId) {
      return NextResponse.json({ success: false, message: "Missing userId" }, { status: 400 });
    }

    const user = await db.get("SELECT * FROM users WHERE id = ?", userId);
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    if (action === "toggle_status") {
      const newStatus = user.status === "Active" ? "Inactive" : "Active";
      const nowStr = new Date().toISOString();

      // Status lives on both rows, so a failure on the sync left a user logged in as
      // Active in one table and Inactive in the other.
      await db.transaction(async (tx) => {
        await tx.run("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", [newStatus, nowStr, user.id]);

        if (user.role === "student" && user.reference_id) {
          await tx.run("UPDATE students SET status = ?, updated_at = ? WHERE id = ?", [newStatus, nowStr, user.reference_id]);
        } else if (user.role === "mentor" && user.reference_id) {
          await tx.run("UPDATE mentors SET status = ?, updated_at = ? WHERE id = ?", [newStatus, nowStr, user.reference_id]);
        }
      });

      // Suspending an account has to end its live sessions too — an existing cookie
      // kept working for the whole 30-day session window after deactivation.
      if (newStatus !== "Active") {
        await revokeAllUserSessions(db, user.id, "account_deactivated");
      }

      return NextResponse.json({ success: true, message: `User status changed to ${newStatus}` });
    }

    if (action === "reset_password") {
      const defaultPassword = DEFAULT_PASSWORD;
      const defaultPasswordHash = hashPassword(defaultPassword);
      const nowStr = new Date().toISOString();

      await db.transaction(async (tx) => {
        await tx.run(
          "UPDATE users SET password_hash = ?, plain_password = ?, must_change_password = 1, updated_at = ? WHERE id = ?",
          [defaultPasswordHash, defaultPassword, nowStr, user.id]
        );

        // Sync password to role specific tables
        if (user.role === "student" && user.reference_id) {
          await tx.run("UPDATE students SET password_hash = ?, updated_at = ? WHERE id = ?", [defaultPasswordHash, nowStr, user.reference_id]);
        } else if (user.role === "mentor" && user.reference_id) {
          await tx.run("UPDATE mentors SET password_hash = ?, updated_at = ? WHERE id = ?", [defaultPasswordHash, nowStr, user.reference_id]);
        }
      });

      await revokeAllUserSessions(db, user.id, "password_reset");

      return NextResponse.json({ success: true, message: "User password reset successfully to default credentials." });
    }

    return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    console.error("API POST Users error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole(request, "admin");
    const db = await getDb();
    const body = await request.json();
    const { id, email, role, reference_id, status, newPassword } = body;

    if (!id || !email) {
      return NextResponse.json({ success: false, message: "User ID and Email are required." }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    // Existence and the email clash both probe the users table off the body, so one
    // round trip answers both. Both gate the UPDATE below — a failed slice would let
    // two credentials share an email, which makes login a coin flip on the account.
    const putFailures: QueryFailure[] = [];
    const [userRows, clashRows] = await db.multiQuery(
      [
        { sql: "SELECT * FROM users WHERE id = ?", params: [id] },
        { sql: "SELECT id FROM users WHERE LOWER(email) = ? AND id <> ?", params: [cleanEmail, id] },
      ],
      putFailures
    );
    if (putFailures.length > 0) {
      return NextResponse.json({ success: false, message: "Could not verify this credential. Please try again." }, { status: 500 });
    }

    const existingUser = userRows[0];
    if (!existingUser) {
      return NextResponse.json({ success: false, message: "User credential not found." }, { status: 404 });
    }

    if (clashRows.length > 0) {
      return NextResponse.json({ success: false, message: "Another user credential already uses this email." }, { status: 400 });
    }

    const userRole = normalizeRole(role || existingUser.role);
    const refId = reference_id !== undefined ? reference_id.trim() : existingUser.reference_id;
    const userStatus = status || existingUser.status || "Active";
    const nowStr = new Date().toISOString();

    let passHash = existingUser.password_hash;
    let plainPass = existingUser.plain_password || DEFAULT_PASSWORD;
    let mustChange = existingUser.must_change_password || 0;
    if (newPassword && newPassword.trim()) {
      passHash = hashPassword(newPassword.trim());
      plainPass = newPassword.trim();
      mustChange = 0;
    }

    await db.run(
      `UPDATE users
       SET email = ?, role = ?, reference_id = ?, status = ?, password_hash = ?, plain_password = ?, must_change_password = ?, updated_at = ?
       WHERE id = ?`,
      [cleanEmail, userRole, refId, userStatus, passHash, plainPass, mustChange, nowStr, id]
    );

    // Any of these edits invalidates the sessions that were issued against the old
    // identity: a stolen or deactivated account must not ride its existing cookie out.
    const identityChanged =
      (newPassword && newPassword.trim()) ||
      cleanEmail !== String(existingUser.email || "").toLowerCase().trim() ||
      userRole !== normalizeRole(existingUser.role) ||
      refId !== existingUser.reference_id ||
      (userStatus && userStatus !== existingUser.status);
    if (identityChanged) {
      await revokeAllUserSessions(db, id, "credential_updated");
    }

    return NextResponse.json({ success: true, message: "User credential updated successfully." });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    console.error("API PUT Users error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole(request, "admin");
    const db = await getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "User ID is required." }, { status: 400 });
    }

    const existing = await db.get("SELECT * FROM users WHERE id = ?", id);
    if (!existing) {
      return NextResponse.json({ success: false, message: "User credential not found." }, { status: 404 });
    }

    // Revoke before deleting: an existing cookie kept authenticating for days after the
    // account was removed, and deleting first drops the session rows this would mark.
    await revokeAllUserSessions(db, id, "account_deleted");
    await db.run("DELETE FROM users WHERE id = ?", id);

    return NextResponse.json({ success: true, message: "User credential deleted successfully." });
  } catch (error: any) {
    const authRes = apiAuthErrorResponse(error);
    if (authRes) return authRes;
    console.error("API DELETE Users error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
