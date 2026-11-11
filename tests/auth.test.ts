import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { hashPassword, verifyPassword, needsRehash, LEGACY_PBKDF2_ITERATIONS } from "../src/lib/auth";

describe("password hashing", () => {
  it("hashes and verifies at the current cost", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^pbkdf2\$210000\$/);
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("still verifies legacy salt:hash format (1,000 iters)", () => {
    const salt = crypto.randomBytes(16).toString("hex");
    const legacyHash = crypto.pbkdf2Sync("oldpass", salt, LEGACY_PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
    const stored = `${salt}:${legacyHash}`;
    expect(verifyPassword("oldpass", stored)).toBe(true);
    expect(verifyPassword("nope", stored)).toBe(false);
  });

  it("NO LONGER accepts plaintext rows", () => {
    expect(verifyPassword("plaintextpw", "plaintextpw")).toBe(false);
  });

  it("flags legacy hashes and plaintext for rehash", () => {
    const salt = crypto.randomBytes(16).toString("hex");
    const legacyHash = crypto.pbkdf2Sync("oldpass", salt, LEGACY_PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
    expect(needsRehash(`${salt}:${legacyHash}`)).toBe(true);
    expect(needsRehash("plaintextrow")).toBe(true);
    expect(needsRehash(hashPassword("x"))).toBe(false);
    expect(needsRehash("")).toBe(true);
  });

  it("handles empty inputs safely", () => {
    expect(verifyPassword("", "x")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
    expect(hashPassword("")).toBe("");
  });
});
