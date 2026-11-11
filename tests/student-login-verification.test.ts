import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPassword } from "@/lib/auth";

const testPassword = "password123";
const testPasswordHash = hashPassword(testPassword);

const mockDbState: {
  users: any[];
  students: any[];
} = {
  users: [],
  students: []
};

vi.mock("@/lib/db", () => ({
  getDb: async () => ({
    get: async (sql: string, params: any[] = []) => {
      const lowerSql = sql.toLowerCase();

      // Check users query
      if (lowerSql.includes("from users")) {
        return mockDbState.users.find(u =>
          params.some(p => {
            const str = String(p || "").toLowerCase();
            return u.email.toLowerCase() === str ||
              (u.reference_id && u.reference_id.toLowerCase() === str) ||
              u.id.toLowerCase() === str;
          })
        ) || null;
      }

      // Check students query during role lookup
      if (lowerSql.includes("from students")) {
        const val = params[0];
        return mockDbState.students.find(s =>
          s.email.toLowerCase() === val ||
          s.id.toLowerCase() === val ||
          (s.roll_number && s.roll_number.toLowerCase() === val) ||
          (s.register_number && s.register_number.toLowerCase() === val)
        );
      }

      // Campus managers, mentors, etc
      if (lowerSql.includes("from campus_managers") || lowerSql.includes("from mentors") ||
        lowerSql.includes("from kam_users") || lowerSql.includes("from sme_users")) {
        return null;
      }

      return null;
    },
    run: async (sql: string, params: any[] = []) => {
      const lowerSql = sql.toLowerCase();
      if (lowerSql.includes("insert into users")) {
        const [id, email, password_hash, role, reference_id] = params;
        // Check unique email constraint
        const duplicateEmail = mockDbState.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (duplicateEmail && duplicateEmail.id !== id) {
          throw new Error('duplicate key value violates unique constraint "users_email_key"');
        }
        mockDbState.users.push({ id, email, password_hash, role, reference_id, status: "Active" });
        return { changes: 1 };
      }
      return { changes: 1 };
    },
    multiQuery: async () => [[]]
  })
}));

vi.mock("@/lib/session", () => ({
  createUserSession: async () => ({
    rawToken: "test-token",
    csrfToken: "test-csrf",
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  }),
  buildSessionCookie: () => "fp_session=test-token; Path=/",
  buildCsrfCookie: () => "fp_csrf=test-csrf; Path=/",
  buildClearSessionCookies: () => []
}));

vi.mock("@/lib/migrations", () => ({
  ensureMigration: async () => { }
}));

import { POST } from "../src/app/api/login/route";

describe("Student Login Logic Verification", () => {
  beforeEach(() => {
    mockDbState.users = [
      {
        id: "usr_student_123",
        email: "student@faceprep.in",
        password_hash: testPasswordHash,
        role: "student",
        reference_id: "stu_rec_456",
        status: "Active"
      }
    ];

    mockDbState.students = [
      {
        id: "stu_rec_456",
        name: "Test Student",
        email: "student@faceprep.in",
        roll_number: "21CS099",
        register_number: "710021104099",
        password_hash: testPasswordHash,
        college_id: "clg_test",
        status: "Active"
      }
    ];
  });

  it("authenticates student using email", async () => {
    const req = new Request("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "student@faceprep.in", password: testPassword })
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe("student");
    expect(data.userName).toBe("Test Student");
  });

  it("authenticates student using roll number when user record has different ID", async () => {
    const req = new Request("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "21CS099", password: testPassword })
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe("student");
  });

  it("authenticates student using register number", async () => {
    const req = new Request("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "710021104099", password: testPassword })
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe("student");
  });

  it("authenticates student with roll number when not yet in users table (auto-provision)", async () => {
    mockDbState.users = []; // empty users table

    const req = new Request("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "21CS099", password: testPassword })
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.role).toBe("student");
    expect(mockDbState.users.length).toBe(1);
  });
});
