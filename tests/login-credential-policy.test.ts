import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { hashPassword, looksLikeStoredCredential, verifyPassword } from "@/lib/auth";
import { isAccountDisabled } from "@/lib/authGuard";

const loginSource = readFileSync(join(process.cwd(), "src/app/api/login/route.ts"), "utf8");

describe("login auto-provisioning verifies the credential already on the roster row", () => {
  it("checks the profile hash instead of hashing whatever was just typed", () => {
    expect(loginSource).toContain("verifyPassword(password, stored)");
    // The bypass this replaces: the submitted password became the stored password.
    expect(loginSource).not.toMatch(/const newHashed = hashPassword\(password\);/);
  });

  it("recognises storable credentials and refuses plaintext or empty rows", () => {
    expect(looksLikeStoredCredential(hashPassword("hunter2"))).toBe(true);
    expect(looksLikeStoredCredential(`salt:${"a".repeat(64)}`)).toBe(true);
    expect(looksLikeStoredCredential("password123")).toBe(false);
    expect(looksLikeStoredCredential("")).toBe(false);
    expect(looksLikeStoredCredential(null)).toBe(false);
    expect(looksLikeStoredCredential(undefined)).toBe(false);
  });

  it("keeps plaintext rows from authenticating at all", () => {
    expect(verifyPassword("password123", "password123")).toBe(false);
  });
});

describe("failed sign-ins are counted", () => {
  it("records attempts through the login_attempts guard before answering", () => {
    expect(loginSource).toContain("login_attempts");
    const firstRejection = loginSource.indexOf("message: INVALID_CREDENTIALS_MESSAGE");
    expect(loginSource.slice(loginSource.lastIndexOf("await noteLoginAttempt", firstRejection), firstRejection))
      .toContain("noteLoginAttempt(db, lowerEmail, ip, false)");
  });

  it("counts failures without ever locking the account out", () => {
    expect(loginSource).not.toContain("LOGIN_LOCKOUT_MINUTES");
    expect(loginSource).not.toContain("LOGIN_MAX_FAILURES");
    expect(loginSource).not.toContain("status: 429");
  });

  it("returns one generic message for every rejected credential", () => {
    expect(loginSource).toContain('const INVALID_CREDENTIALS_MESSAGE = "Incorrect email or password."');
    expect(loginSource).not.toContain("No account found with this email");
    expect(loginSource).not.toContain("Incorrect password. Please check your password");
  });
});

describe("disabled accounts", () => {
  it("blocks every turned-off spelling, case and padding aside", () => {
    for (const status of ["Inactive", "inactive", " INACTIVE ", "Blocked", "suspended", "Disabled", "Deactivated"]) {
      expect(isAccountDisabled(status)).toBe(true);
    }
  });

  it("leaves active and blank legacy statuses usable", () => {
    for (const status of ["Active", "active", "", null, undefined, "Pending"]) {
      expect(isAccountDisabled(status)).toBe(false);
    }
  });

  it("rejects a disabled account at login and in session resolution", () => {
    expect(loginSource).toContain("isAccountDisabled(user.status)");
    expect(readFileSync(join(process.cwd(), "src/lib/authGuard.ts"), "utf8"))
      .toContain("isAccountDisabled(user.status)");
  });
});
