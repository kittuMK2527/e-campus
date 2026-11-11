import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolveLiveUser, pickProfileRow, IDENTITY_SQL } from "../src/lib/authGuard";

/**
 * Fake adapter that records which method answered each read, so the tests can
 * prove identity costs one round trip and still survives the old two-step path.
 */
function fakeDb(handlers: {
  all?: () => any[];
  get?: (sql: string, params: any[]) => any;
}) {
  const calls: { kind: string; sql: string }[] = [];
  return {
    calls,
    async all(sql: string, params?: any[]) {
      calls.push({ kind: "all", sql });
      if (!handlers.all) throw new Error("all() is not stubbed");
      return handlers.all();
    },
    async get(sql: string, ...params: any[]) {
      calls.push({ kind: "get", sql });
      if (!handlers.get) throw new Error("get() is not stubbed");
      return handlers.get(sql, params);
    }
  } as any;
}

/** First word of every column line inside a CREATE TABLE block. */
function columnNames(schema: string, table: string): string[] {
  const lines = schema.split(/\r?\n/);
  const start = lines.findIndex(line =>
    new RegExp(`CREATE TABLE.*\\b${table}\\s*\\(`, "i").test(line)
  );
  if (start === -1) return [];
  const names: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\);?\s*$/.test(lines[i])) break;
    const first = lines[i].trim().split(/\s+/)[0];
    if (first) names.push(first.toLowerCase());
  }
  return names;
}

const usersColumns = {
  id: "user_mentor_1",
  email: "mentor@example.com",
  role: "mentor",
  reference_id: "mentor_1",
  status: "Active",
  must_change_password: 0
};

describe("single-round-trip identity read", () => {
  it("resolves user and profile from one statement", async () => {
    const db = fakeDb({
      all: () => [
        { ...usersColumns, table_key: "mentors", profile_id: "mentor_1", profile_name: "Asha Mentor", profile_college_id: "col_9" },
        { ...usersColumns, table_key: "students", profile_id: "stu_5", profile_name: "Wrong Table", profile_college_id: "col_1" }
      ]
    });

    const user = await resolveLiveUser(db, "user_mentor_1");

    expect(db.calls.map((c: any) => c.kind)).toEqual(["all"]);
    expect(user?.name).toBe("Asha Mentor");
    expect(user?.college_id).toBe("col_9");
    expect(user?.role).toBe("mentor");
    expect(user?.reference_id).toBe("mentor_1");
    expect(user?.isSuperAdmin).toBe(false);
  });

  it("prefers the row matched by id over one matched by email", () => {
    const rows = [
      { table_key: "mentors", profile_id: "other_1", profile_name: "Email Match" },
      { table_key: "mentors", profile_id: "mentor_1", profile_name: "Id Match" }
    ];
    expect(pickProfileRow(rows, "mentors", "user_mentor_1", "mentor_1")?.profile_name).toBe("Id Match");
    expect(pickProfileRow(rows, "campus_managers", "user_mentor_1", "mentor_1")).toBeNull();
  });

  it("still refuses a disabled account without a second read", async () => {
    const db = fakeDb({
      all: () => [{ ...usersColumns, status: "Inactive", table_key: "mentors", profile_id: "mentor_1", profile_name: "Asha", profile_college_id: null }]
    });
    expect(await resolveLiveUser(db, "user_mentor_1")).toBeNull();
    expect(db.calls.length).toBe(1);
  });

  it("falls back to the two-step path when the combined read cannot run", async () => {
    // Prod schema drift (a renamed/missing profile column) must degrade exactly
    // like it did before, not log everyone out.
    const profileRow = { id: "mentor_1", name: "Asha Mentor", college_id: "col_9" };
    let getNumber = 0;
    const db = fakeDb({
      all: () => {
        throw new Error('column "profile_college_id" does not exist');
      },
      get: (sql) => {
        getNumber++;
        if (sql.includes("FROM users")) return { ...usersColumns, password_hash: "x" };
        if (getNumber === 2) return profileRow;
        return undefined;
      }
    });

    const user = await resolveLiveUser(db, "user_mentor_1");

    expect(db.calls.filter((c: any) => c.kind === "all").length).toBe(1);
    expect(db.calls.filter((c: any) => c.kind === "get").length).toBe(2);
    expect(user?.name).toBe("Asha Mentor");
    expect(user?.college_id).toBe("col_9");
  });

  it("builds the SQL only from tables that exist in the schema", () => {
    const schema = readFileSync("postgres_schema.sql", "utf8");
    const tables = new Set(
      [...schema.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?([a-z_]+)/gi)].map(m => m[1].toLowerCase())
    );
    const referenced = [...IDENTITY_SQL.matchAll(/\bFROM ([a-z_]+)/gi)]
      .map(m => m[1])
      .filter(name => name !== "u" && name !== "p"); // the CTE and lateral aliases

    // users + one branch per role profile table, all present in the schema file.
    expect(referenced).toContain("users");
    expect(new Set(referenced).size).toBe(7);
    for (const table of referenced) {
      expect(tables.has(table), `${table} missing from postgres_schema.sql`).toBe(true);
    }
  });

  it("asks for college_id only on tables that carry it", () => {
    const schema = readFileSync("postgres_schema.sql", "utf8");
    const branches = IDENTITY_SQL.split(" UNION ALL ");

    for (const table of ["admin_users", "campus_managers", "mentors", "students", "kam_users", "sme_users"]) {
      const branch = branches.find(part => part.includes(`FROM ${table} `));
      expect(branch, `${table} branch present`).toBeTruthy();

      const hasColumn = columnNames(schema, table).includes("college_id");
      expect(branch!.includes("college_id AS profile_college_id"), `${table} college_id in SQL`).toBe(hasColumn);
    }
  });

  it("takes exactly one bind parameter", () => {
    expect((IDENTITY_SQL.match(/\?/g) || []).length).toBe(1);
  });
});
