import { NextResponse } from "next/server";
import { PostgresDbAdapter } from "./db";
import { requireAuth, AuthenticatedUser } from "./authGuard";

export interface KamScope {
  auth: AuthenticatedUser;
  /** Resolved kam_users.id for KAM sessions; null for admins (unrestricted). */
  kamId: string | null;
  /** College IDs assigned to the KAM; null for admins (unrestricted). */
  allowedCollegeIds: string[] | null;
}

export async function requireKamScope(
  request: Request,
  db: PostgresDbAdapter
): Promise<{ scope?: KamScope; errorResponse?: NextResponse }> {
  const { auth, errorResponse } = await requireAuth(request, { allowedRoles: ["kam", "admin"] });
  if (errorResponse) return { errorResponse };

  const user = auth!.user;
  if (user.role !== "kam") {
    return { scope: { auth: user, kamId: null, allowedCollegeIds: null } };
  }

  const kam = await db.get(
    "SELECT id FROM kam_users WHERE id = ? OR LOWER(email) = ? LIMIT 1",
    [user.reference_id, String(user.email || "").toLowerCase()]
  );
  if (!kam) {
    return {
      errorResponse: NextResponse.json(
        { success: false, message: "No KAM portfolio is linked to this account." },
        { status: 403 }
      )
    };
  }

  const colleges = await db.all("SELECT id FROM colleges WHERE kam_id = ?", [kam.id]);
  return {
    scope: {
      auth: user,
      kamId: kam.id,
      allowedCollegeIds: colleges.map((c: any) => c.id)
    }
  };
}

/**
 * Normalizes caller-supplied scope IDs. A KAM is pinned to their own portfolio;
 * admins keep the requested filters. A specific college outside the KAM's
 * portfolio is rejected rather than silently widened to the whole institution.
 */
export function resolveScopeParams(
  scope: KamScope,
  requestedKamId: string | null,
  requestedCollegeId: string | null
): { kamId: string | null; collegeId: string | null; errorResponse?: NextResponse } {
  const collegeId = requestedCollegeId && requestedCollegeId !== "all" ? requestedCollegeId : null;

  if (!scope.allowedCollegeIds) {
    return { kamId: requestedKamId || null, collegeId };
  }

  if (requestedKamId && requestedKamId !== scope.kamId) {
    return {
      kamId: null,
      collegeId: null,
      errorResponse: NextResponse.json(
        { success: false, message: "You can only view your own portfolio." },
        { status: 403 }
      )
    };
  }

  if (collegeId && !scope.allowedCollegeIds.includes(collegeId)) {
    return {
      kamId: null,
      collegeId: null,
      errorResponse: NextResponse.json(
        { success: false, message: "This campus is outside your assigned portfolio." },
        { status: 403 }
      )
    };
  }

  return { kamId: scope.kamId, collegeId };
}
