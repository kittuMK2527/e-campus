import crypto from "crypto";
import util from "util";

const pbkdf2Async = util.promisify(crypto.pbkdf2);

/**
 * Password hashing (API_OPTIMIZATION_PLAN item 10).
 *
 * Format history:
 *  v1 (legacy):        `salt:hash`        — PBKDF2-SHA512, 1,000 iters
 *  v1.5 (transitional): `salt:hash`        — also matches, plaintext fallback removed
 *  v2 (current):       `pbkdf2$<iters>$<salt>$<hash>` — PBKDF2-SHA512, 210,000 iters
 *
 * Verification auto-detects the format. Rows in v1 format are transparently
 * re-hashed at the new cost after a successful login (rehash-on-login via
 * needsRehash). The legacy PLAINTEXT comparison fallback is intentionally
 * REMOVED — those rows fail verification until a password reset.
 */

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

/** Iteration count used by the legacy v1 scheme. */
export const LEGACY_PBKDF2_ITERATIONS = 1_000;

export function hashPassword(password: string): string {
  if (!password) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/** Non-blocking async password hashing offloaded to libuv threadpool (PERF-01). */
export async function hashPasswordAsync(password: string): Promise<string> {
  if (!password) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
  const hash = derivedKey.toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/** True when the stored hash is not already at the current cost/format. */
export function needsRehash(storedHash: string): boolean {
  if (!storedHash) return true;
  const m = storedHash.match(/^pbkdf2\$(\d+)\$/);
  if (!m) return true; // legacy `salt:hash` or plaintext → upgrade
  return parseInt(m[1], 10) < PBKDF2_ITERATIONS;
}

/**
 * Verifies a plaintext password against a stored password string.
 * Supports v1 (1,000 iters) and v2 (210,000 iters) formats for one migration
 * window. Plaintext rows no longer authenticate — a reset is required.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  // v2 format: pbkdf2$<iters>$<salt>$<hash>
  const v2 = storedHash.match(/^pbkdf2\$(\d+)\$([^$]+)\$([a-f0-9]+)$/i);
  if (v2) {
    const iterations = Math.min(parseInt(v2[1], 10) || PBKDF2_ITERATIONS, 1_000_000);
    return pbkdf2Equal(password, v2[2], v2[3], iterations, KEY_LENGTH);
  }

  // v1 format: salt:hash (always 1,000 iterations)
  if (storedHash.includes(":")) {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    return pbkdf2Equal(password, salt, originalHash, LEGACY_PBKDF2_ITERATIONS, KEY_LENGTH);
  }

  // Legacy plaintext — no longer accepted.
  return false;
}

/** Non-blocking async password verification offloaded to libuv threadpool (PERF-01). */
export async function verifyPasswordAsync(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  const v2 = storedHash.match(/^pbkdf2\$(\d+)\$([^$]+)\$([a-f0-9]+)$/i);
  if (v2) {
    const iterations = Math.min(parseInt(v2[1], 10) || PBKDF2_ITERATIONS, 1_000_000);
    return pbkdf2EqualAsync(password, v2[2], v2[3], iterations, KEY_LENGTH);
  }

  if (storedHash.includes(":")) {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    return pbkdf2EqualAsync(password, salt, originalHash, LEGACY_PBKDF2_ITERATIONS, KEY_LENGTH);
  }

  return false;
}

/** True when a value stored on a row really is a credential we can verify against. */
export function looksLikeStoredCredential(stored: unknown): boolean {
  const value = String(stored ?? "");
  if (!value) return false;
  if (value.startsWith("pbkdf2$")) return true;
  // Legacy v1 shape is `salt:hash` — both halves are long hex, so a colon inside a
  // short string ("a:b") is a plaintext value, not a hash.
  return value.includes(":") && value.length > 20;
}

function pbkdf2Equal(password: string, salt: string, originalHash: string, iterations: number, keyLength: number): boolean {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, DIGEST).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
  } catch {
    return false;
  }
}

async function pbkdf2EqualAsync(password: string, salt: string, originalHash: string, iterations: number, keyLength: number): Promise<boolean> {
  const derivedKey = await pbkdf2Async(password, salt, iterations, keyLength, DIGEST);
  const hash = derivedKey.toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
  } catch {
    return false;
  }
}
