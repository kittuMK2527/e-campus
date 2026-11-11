import { beforeEach, describe, expect, it, vi } from "vitest";

// Full module stubs: never import the real database, session, password, or logger
// modules. The guards, identity shaping, CSRF crypto and route handlers are real.
const h = vi.hoisted(() => ({
  getDb: vi.fn(),
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  transaction: vi.fn(),
  txRun: vi.fn(),
  validateSession: vi.fn(),
  shouldStampActivity: vi.fn(),
  stampSessionActivity: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  createUserSession: vi.fn(),
  buildSessionCookie: vi.fn(),
  buildCsrfCookie: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: h.getDb }));
vi.mock("@/lib/session", () => ({
  SESSION_COOKIE_NAME: "ecampus_session",
  validateSession: h.validateSession,
  shouldStampActivity: h.shouldStampActivity,
  stampSessionActivity: h.stampSessionActivity,
  revokeAllUserSessions: h.revokeAllUserSessions,
  createUserSession: h.createUserSession,
  buildSessionCookie: h.buildSessionCookie,
  buildCsrfCookie: h.buildCsrfCookie,
}));
vi.mock("@/lib/auth", () => ({
  verifyPassword: h.verifyPassword,
  hashPassword: h.hashPassword,
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { requireAuth, type Role } from "../src/lib/authGuard";
import {
  ApiAuthError, apiAuthErrorResponse, getSessionFromRequest, requireRole, requireSession,
} from "../src/lib/api-auth";
import { generateCsrfToken, verifyCsrfToken } from "../src/lib/csrf";
import { GET as identity } from "../src/app/api/auth/me/route";
import { POST as changePassword } from "../src/app/api/change-password/route";

const ROLES = ["admin", "cm", "mentor", "student", "kam", "sme", "fee_manager", "L and D", "hr"] as const satisfies readonly Role[];
const PROFILE_TABLES: Partial<Record<Role, string>> = {
  admin: "admin_users", cm: "campus_managers", mentor: "mentors",
  student: "students", kam: "kam_users", sme: "sme_users",
};
const CURRENT = "test-current-password";
const NEW = "  test-new-password  ";
const SECRET = "test-only-csrf-secret";
const db = { all: h.all, get: h.get, run: h.run, transaction: h.transaction };
let row: Record<string, unknown>;
let events: string[];

function setUser(role: Role, mustChangePassword: boolean) {
  row = {
    id: "user-1", reference_id: "profile-1", role,
    email: "user@example.invalid", status: "Active",
    must_change_password: mustChangePassword,
    table_key: PROFILE_TABLES[role], profile_id: "profile-1",
    profile_name: "Live User", profile_college_id: "college-1",
    password_hash: "test-stored-hash", plain_password: "test-stored-plaintext",
  };
  // Deliberately stale session claims must never decide the gate or identity.
  h.validateSession.mockResolvedValue({
    isValid: true, userId: "user-1", csrfSecret: SECRET,
    session: {
      user_id: "user-1", session_id_hash: "test-session-hash",
      expires_at: "2099-01-01T00:00:00.000Z", last_activity_at: "2026-01-01T00:00:00.000Z",
      role: "student", mustChangePassword: !mustChangePassword,
    },
  });
}

function expectedUser(role: Role, mustChangePassword: boolean) {
  return {
    id: "user-1", reference_id: "profile-1", role,
    email: "user@example.invalid",
    name: PROFILE_TABLES[role] ? "Live User" : "user@example.invalid",
    college_id: PROFILE_TABLES[role] ? "college-1" : null,
    isSuperAdmin: role === "admin", mustChangePassword,
  };
}

function request(method = "GET", body?: unknown, csrf: string | null = generateCsrfToken(SECRET)) {
  const headers = new Headers({ cookie: "ecampus_session=test-old-token" });
  if (csrf !== null) headers.set("x-csrf-token", csrf);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request("http://test.invalid/api/protected", {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function expectNoWrites() {
  expect(h.run).not.toHaveBeenCalled();
  expect(h.transaction).not.toHaveBeenCalled();
  expect(h.txRun).not.toHaveBeenCalled();
  expect(h.hashPassword).not.toHaveBeenCalled();
  expect(h.revokeAllUserSessions).not.toHaveBeenCalled();
  expect(h.createUserSession).not.toHaveBeenCalled();
  expect(h.stampSessionActivity).not.toHaveBeenCalled();
  expect(h.buildSessionCookie).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  events = [];
  setUser("mentor", true);
  h.getDb.mockResolvedValue(db);
  h.all.mockImplementation(async () => [{ ...row }]);
  h.get.mockImplementation(async () => ({ ...row }));
  h.shouldStampActivity.mockReturnValue(false);
  h.verifyPassword.mockImplementation((password, hash) => password === CURRENT && hash === "test-stored-hash");
  h.hashPassword.mockReturnValue("test-new-hash");
  h.txRun.mockResolvedValue({ changes: 1 });
  h.transaction.mockImplementation(async (callback) => {
    events.push("transaction");
    await callback({ run: h.txRun });
    row.must_change_password = false;
    events.push("commit");
  });
  h.revokeAllUserSessions.mockImplementation(async () => { events.push("revoke"); });
  h.createUserSession.mockImplementation(async () => {
    events.push("create");
    return { rawToken: "test-rotated-token", csrfToken: "test-rotated-csrf" };
  });
  h.buildSessionCookie.mockImplementation((token) => `ecampus_session=${token}; Path=/; HttpOnly`);
  h.buildCsrfCookie.mockImplementation((token) => `ecampus_csrf=${token}; Path=/`);
});

const API_PATHS = [
  ["getSessionFromRequest", getSessionFromRequest],
  ["requireSession", requireSession],
  ["requireRole", (req: Request) => requireRole(req, ...ROLES)],
] as const;

describe.each(ROLES)("mandatory password gate: %s", (role) => {
  it.each(["GET", "POST"])("blocks flagged %s requests by default", async (method) => {
    setUser(role, true);
    const result = await requireAuth(request(method));
    expect(result.auth).toBeUndefined();
    expect(result.errorResponse?.status).toBe(403);
    expect(await result.errorResponse?.json()).toMatchObject({ success: false, code: "PASSWORD_CHANGE_REQUIRED" });
    expectNoWrites();
  });

  it("blocks an explicit false exception before role permissions", async () => {
    setUser(role, true);
    const result = await requireAuth(request(), { allowPasswordChangeRequired: false, allowedRoles: ["admin"] });
    expect(result.errorResponse?.status).toBe(403);
    expect(await result.errorResponse?.json()).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });

  it.each(["GET", "POST"])("allows unflagged %s requests with a permitted live role", async (method) => {
    setUser(role, false);
    const result = await requireAuth(request(method), { allowedRoles: [role] });
    expect(result.errorResponse).toBeUndefined();
    expect(result.auth?.user).toEqual(expectedUser(role, false));
  });

  it.each(API_PATHS)("blocks the independent %s path and forwards its 403 code", async (_name, authenticate) => {
    setUser(role, true);
    const error = await authenticate(request()).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiAuthError);
    expect(error).toMatchObject({ status: 403, code: "PASSWORD_CHANGE_REQUIRED" });
    const response = apiAuthErrorResponse(error);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ success: false, code: "PASSWORD_CHANGE_REQUIRED" });
    expectNoWrites();
  });

  it.each(API_PATHS)("allows the independent %s path when the live flag is false", async (_name, authenticate) => {
    setUser(role, false);
    const user = expectedUser(role, false);
    expect(await authenticate(request())).toEqual({
      userId: user.reference_id, role, email: user.email, collegeId: user.college_id, name: user.name,
    });
  });

  it.each([true, false])("identity returns the live flag %s and only sanitized user fields", async (flag) => {
    setUser(role, flag);
    const response = await identity(request("GET", undefined, null));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toEqual(expectedUser(role, flag));
    expect(verifyCsrfToken(body.csrfToken, SECRET)).toBe(true);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain(`ecampus_csrf=${body.csrfToken}`);
    expectNoWrites();
  });

  it.each([true, false])("rotation clears live flag %s, commits, revokes and rotates both cookies", async (flag) => {
    setUser(role, flag);
    const response = await changePassword(request("POST", {
      currentPassword: CURRENT, newPassword: NEW,
      userId: "attacker-supplied-id", role: "admin", mustChangePassword: true,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true, message: "Password updated successfully!",
      user: expectedUser(role, false), csrfToken: "test-rotated-csrf",
    });
    expect(h.get).toHaveBeenCalledWith("SELECT * FROM users WHERE id = ?", ["user-1"]);
    expect(h.verifyPassword).toHaveBeenCalledWith(CURRENT, "test-stored-hash");
    expect(h.hashPassword).toHaveBeenCalledExactlyOnceWith(NEW);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.txRun).toHaveBeenNthCalledWith(1,
      "UPDATE users SET password_hash = ?, plain_password = ?, must_change_password = 0, updated_at = ? WHERE id = ?",
      ["test-new-hash", NEW, expect.any(String), "user-1"],
    );
    const profileTable = role === "student" ? "students" : role === "mentor" ? "mentors" : null;
    if (profileTable) {
      expect(h.txRun).toHaveBeenNthCalledWith(2,
        `UPDATE ${profileTable} SET password_hash = ?, updated_at = ? WHERE id = ?`,
        ["test-new-hash", expect.any(String), "profile-1"],
      );
    } else if (role === "sme") {
      expect(h.txRun).toHaveBeenNthCalledWith(2,
        "UPDATE sme_users SET password = ? WHERE id = ?", ["test-new-hash", "profile-1"],
      );
    }
    expect(h.txRun).toHaveBeenCalledTimes(profileTable || role === "sme" ? 2 : 1);
    expect(h.run).not.toHaveBeenCalled();
    expect(events).toEqual(["transaction", "commit", "revoke", "create"]);
    expect(h.revokeAllUserSessions).toHaveBeenCalledExactlyOnceWith(db, "user-1", "password_changed");
    expect(h.createUserSession).toHaveBeenCalledExactlyOnceWith(db, "user-1", { ip: "127.0.0.1", userAgent: "Web Browser" });
    expect(h.buildSessionCookie).toHaveBeenCalledExactlyOnceWith("test-rotated-token");
    expect(h.buildCsrfCookie).toHaveBeenCalledExactlyOnceWith("test-rotated-csrf");
    const cookies = response.headers.get("set-cookie");
    expect(cookies).toContain("ecampus_session=test-rotated-token");
    expect(cookies).toContain("ecampus_csrf=test-rotated-csrf");
    expect(cookies).not.toContain("test-old-token");
  });
});

describe("password gate exceptions retain authentication, CSRF and role checks", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("still requires CSRF on %s with the exception", async (method) => {
    const result = await requireAuth(request(method, undefined, null), { allowPasswordChangeRequired: true });
    expect(result.errorResponse?.status).toBe(403);
    expect(await result.errorResponse?.json()).toMatchObject({ code: "INVALID_CSRF" });
    expectNoWrites();
  });

  it("still honors an explicit CSRF check on GET", async () => {
    const result = await requireAuth(request("GET", undefined, null), { allowPasswordChangeRequired: true, checkCsrf: true });
    expect(await result.errorResponse?.json()).toMatchObject({ code: "INVALID_CSRF" });
  });

  it.each([null, "malformed", generateCsrfToken("different-test-session")])("rejects password changes with invalid CSRF (%s)", async (csrf) => {
    const response = await changePassword(request("POST", { currentPassword: CURRENT, newPassword: NEW }, csrf));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_CSRF" });
    expect(h.verifyPassword).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each([true, false])("keeps role restrictions when exception is %s", async (allowPasswordChangeRequired) => {
    setUser("mentor", allowPasswordChangeRequired);
    const result = await requireAuth(request(), { allowPasswordChangeRequired, allowedRoles: ["admin"] });
    expect(await result.errorResponse?.json()).toMatchObject({ code: "FORBIDDEN_ROLE" });
    expect(result.auth).toBeUndefined();
  });

  it("never gives flagged admins a role-based bypass in api-auth", async () => {
    setUser("admin", true);
    await expect(requireRole(request(), "student")).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    setUser("admin", false);
    expect(await requireRole(request(), "student")).toMatchObject({ role: "admin" });
  });

  it.each([
    ["identity", "GET", identity],
    ["password change", "POST", changePassword],
  ] as const)("%s still requires a session and active live user", async (_name, method, handler) => {
    const anonymous = await handler(new Request("http://test.invalid/api/protected", { method }));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ code: "NO_SESSION" });
    row.status = "Disabled";
    const disabled = await handler(request(method));
    expect(disabled.status).toBe(401);
    expect(await disabled.json()).toMatchObject({ code: "USER_NOT_FOUND" });
    h.validateSession.mockResolvedValue({ isValid: false, reason: "revoked" });
    const revoked = await handler(request(method));
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ code: "SESSION_EXPIRED" });
    expectNoWrites();
  });

  it("uses the latest database flag on successive requests through both paths", async () => {
    for (const flag of [true, false, true]) {
      row.must_change_password = flag;
      const guarded = await requireAuth(request());
      expect(guarded.errorResponse?.status).toBe(flag ? 403 : undefined);
      if (flag) {
        await expect(getSessionFromRequest(request())).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
      } else {
        expect(await getSessionFromRequest(request())).toMatchObject({ role: "mentor" });
      }
    }
  });

  it("preserves the response shape for auth errors without an optional code", async () => {
    const response = apiAuthErrorResponse(new ApiAuthError("Unauthorized", 401));
    expect(response?.status).toBe(401);
    expect(await response?.json()).toEqual({ success: false, message: "Unauthorized" });
    expect(apiAuthErrorResponse(new Error("unrelated"))).toBeNull();
  });
});

describe("invalid password input never writes", () => {
  const nonStrings = [undefined, null, 12345678, true, false, {}, [], ["test-password"], { length: 12 }];
  for (const field of ["currentPassword", "newPassword"] as const) {
    it.each(nonStrings.map((value) => ({ value })))(`rejects non-string ${field}: $value`, async ({ value }) => {
      const response = await changePassword(request("POST", { currentPassword: CURRENT, newPassword: NEW, [field]: value }));
      expect(response.status).toBe(400);
      expect(h.get).not.toHaveBeenCalled();
      expect(h.verifyPassword).not.toHaveBeenCalled();
      expect(response.headers.get("set-cookie")).toBeNull();
      expectNoWrites();
    });
  }

  it.each([
    { currentPassword: "wrong-test-password", newPassword: NEW },
    { currentPassword: "", newPassword: NEW },
    { currentPassword: CURRENT, newPassword: "" },
    { currentPassword: CURRENT, newPassword: "  short  " },
    { currentPassword: CURRENT, newPassword: CURRENT },
    null,
  ])("rejects invalid input %j", async (body) => {
    const response = await changePassword(request("POST", body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
    expect(response.headers.get("set-cookie")).toBeNull();
    expectNoWrites();
  });
});
