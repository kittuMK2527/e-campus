import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword } from "@/lib/auth";

const testPassword = "mentorPassword123";
const testPasswordHash = hashPassword(testPassword);

const mockDbState: {
  users: any[];
  mentors: any[];
} = {
  users: [],
  mentors: [],
};

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    get: async (sql: string, params: any[] = []) => {
      const lowerSql = sql.toLowerCase();

      if (lowerSql.includes("from users")) {
        return (
          mockDbState.users.find((u) =>
            params.some((p) => {
              const str = String(p || "").toLowerCase();
              return (
                u.email?.toLowerCase() === str ||
                (u.reference_id && u.reference_id.toLowerCase() === str) ||
                u.id.toLowerCase() === str
              );
            })
          ) || null
        );
      }

      if (lowerSql.includes("from mentors")) {
        const val = String(params[0] || "").toLowerCase();
        return (
          mockDbState.mentors.find(
            (m) =>
              m.email?.toLowerCase() === val ||
              m.id.toLowerCase() === val ||
              (m.phone && m.phone.toLowerCase() === val)
          ) || null
        );
      }

      if (
        lowerSql.includes("from campus_managers") ||
        lowerSql.includes("from students") ||
        lowerSql.includes("from kam_users") ||
        lowerSql.includes("from sme_users")
      ) {
        return null;
      }

      return null;
    },
    all: async () => [],
    run: async (sql: string, params: any[] = []) => {
      const lower = sql.toLowerCase();
      if (lower.startsWith("insert into users")) {
        mockDbState.users.push({
          id: params[0],
          name: params[1],
          email: params[2],
          role: params[3],
          password_hash: params[4],
          college_id: params[5],
          status: params[6],
          reference_id: params[7],
        });
        return { changes: 1 };
      }
      return { changes: 1 };
    },
    multiQuery: async () => [],
  }),
}));

vi.mock("@/lib/session", () => ({
  createUserSession: async () => ({
    rawToken: "test-token",
    csrfToken: "test-csrf",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }),
  buildSessionCookie: () => "fp_session=test-token; Path=/",
  buildCsrfCookie: () => "fp_csrf=test-csrf; Path=/",
  buildClearSessionCookies: () => [],
}));

vi.mock("@/lib/migrations", () => ({
  ensureMigration: async () => {},
}));

import { POST } from "@/app/api/login/route";

describe("Mentor Login Logic Verification", () => {
  beforeEach(() => {
    mockDbState.users = [
      {
        id: "u_m1",
        name: "Test Mentor",
        email: "mentor@test.com",
        role: "mentor",
        password_hash: testPasswordHash,
        college_id: "c1",
        status: "active",
        reference_id: "m1",
      },
    ];

    mockDbState.mentors = [
      {
        id: "m1",
        name: "Test Mentor",
        email: "mentor@test.com",
        phone: "9876543210",
        college_id: "c1",
        password_hash: testPasswordHash,
        status: "active",
      },
    ];
  });

  it("authenticates mentor using email", async () => {
    const req = new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "mentor@test.com",
        password: testPassword,
        role: "mentor",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe("mentor");
    expect(data.userName).toBe("Test Mentor");
  });

  it("authenticates mentor using phone when phone is provided as identifier", async () => {
    const req = new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "9876543210",
        password: testPassword,
        role: "mentor",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe("mentor");
  });

  it("rejects invalid password for mentor", async () => {
    const req = new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "mentor@test.com",
        password: "WrongPassword!",
        role: "mentor",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
  });
});
