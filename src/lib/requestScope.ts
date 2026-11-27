import type { AuthenticatedUser } from "./authGuard";

/**
 * Campus (college) scoping shared by the approval / mutation routes.
 *
 * Every write that acts on another person's record has to answer one question:
 * "is this record on a campus the signed-in user governs?" The routes used to
 * answer it inline, and several only checked it on one branch, which let a CM
 * approve another campus's requests. Keep the rule here so it cannot drift.
 */

/** Roles that see every campus. */
export function isUnscopedRole(role?: string | null): boolean {
  const r = String(role || "").toLowerCase().trim();
  return r === "admin" || r === "super admin" || r === "superadmin";
}

/**
 * Colleges a KAM governs. Mirrors lib/kamScope: a KAM with no explicit assignment
 * falls back to every college (that is the existing portfolio rule elsewhere).
 * Returns null for a missing KAM profile so callers fail closed.
 */
export async function resolveKamCollegeIds(db: any, user: AuthenticatedUser): Promise<string[] | null> {
  const kam = await db.get(
    "SELECT id FROM kam_users WHERE id = ? OR LOWER(email) = ? LIMIT 1",
    [user.reference_id, String(user.email || "").toLowerCase()]
  );
  if (!kam) return null;
  const colleges = await db.all("SELECT id FROM colleges WHERE kam_id = ?", [kam.id]);
  return colleges.map((c: any) => String(c.id));
}

/**
 * True when `user` may act on a record that belongs to `collegeId`.
 * - admin: always
 * - cm / mentor / student: only their own college (fails closed when either side is unknown)
 * - kam: only colleges in their portfolio
 */
export async function canActOnCollege(db: any, user: AuthenticatedUser, collegeId: string | null | undefined): Promise<boolean> {
  if (isUnscopedRole(user.role)) return true;
  const target = String(collegeId || "").toLowerCase().trim();
  if (!target) return false;
  if (user.role === "kam") {
    const ids = await resolveKamCollegeIds(db, user);
    return !!ids && ids.some((id) => id.toLowerCase() === target);
  }
  const own = String(user.college_id || "").toLowerCase().trim();
  return !!own && own === target;
}

/**
 * Campus of a handover / approval request. Older rows have no college_id, so fall
 * back to the requesting mentor's campus, then to the slot's campus.
 */
export async function resolveRequestCollegeId(db: any, req: any): Promise<string | null> {
  if (req?.college_id) return String(req.college_id);
  if (req?.requestorId) {
    const m = await db.get("SELECT college_id FROM mentors WHERE id = ?", [req.requestorId]);
    if (m?.college_id) return String(m.college_id);
  }
  if (req?.slotId) {
    const s = await db.get("SELECT college_id FROM slots WHERE id = ?", [req.slotId]);
    if (s?.college_id) return String(s.college_id);
  }
  return null;
}

/** Display label for audit rows, derived from the session instead of the request body. */
export function actorRoleLabel(role?: string | null): string {
  switch (String(role || "").toLowerCase()) {
    case "admin": return "Admin";
    case "cm": return "Campus Manager";
    case "kam": return "Key Account Manager";
    case "mentor": return "Mentor";
    case "sme": return "SME";
    case "l and d": return "L&D";
    case "fee_manager": return "Fee Manager";
    case "student": return "Student";
    default: return "User";
  }
}

/** Thrown inside a transaction when a conditional status update matched no row. */
export class StaleStateError extends Error {
  constructor(message = "This request was already processed by someone else. Refresh and try again.") {
    super(message);
    this.name = "StaleStateError";
  }
}
