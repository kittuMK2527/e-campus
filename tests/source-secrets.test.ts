import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(full)) out.push(full);
  }
  return out;
}

describe("no credentials embedded in application source", () => {
  it("keeps connection strings with inline auth out of src/", () => {
    const offenders = sourceFiles(join(process.cwd(), "src"))
      .filter((file) => /(?:postgres(?:ql)?|mysql|mongodb):\/\/[^"'`\s]*:[^"'@\s]+@/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });

  it("reads the external HackerRank/LeetCode database URL from the environment only", () => {
    ["src/app/api/coding-stats/route.ts", "src/app/api/student/contest-links/route.ts"].forEach((rel) => {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source).toContain("process.env.HACKERRANK_LEETCODE_DB_URL");
      expect(source).toContain("if (!pool)");
    });
  });

  it("keeps signed tokens (Supabase service_role / JWTs) out of src/", () => {
    // `eyJ….` is the base64url encoding of every JWT header, so a literal of that
    // shape in source is a credential rather than a constant.
    const offenders = sourceFiles(join(process.cwd(), "src"))
      .filter((file) => /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));
    expect(offenders).toEqual([]);
  });

  it("reads the placement project URL and bypass key from the environment only", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/audit/placement/route.ts"), "utf8");
    expect(source).toContain("process.env.PLACEMENT_SUPABASE_URL");
    expect(source).toContain("process.env.PLACEMENT_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/);
    expect(source).toMatch(/if \(!supabaseUrl \|\| !apiKey\)/);
  });

  it("hashes the password a self-service signup supplies", () => {
    const source = readFileSync(join(process.cwd(), "src/app/api/signup/route.ts"), "utf8");
    expect(source).toContain("hashPassword(password)");
    expect(source).not.toMatch(/cleanEmail,\s*password,/);
  });
});
