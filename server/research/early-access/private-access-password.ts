import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Private Early Access password verification.
//
// The merged session core (private-access-session.ts) compares a configured
// access password against the presented one by SHA-256 digest equality, which
// requires the deployment to hold the RAW password. Operations policy is that
// the application only ever receives a salted hash, so this module owns the
// hash format and the verification, and the route hands the session core an
// already-authenticated result.
//
// Format, matching the operator secret-generation script exactly:
//
//   scrypt$<N>$<r>$<p>$<salt base64url>$<digest base64url>
//
// N=32768, r=8, p=1, 16-byte salt, 64-byte digest. Note that N=32768 with r=8
// needs about 33.5 MB, which is above Node's 32 MB default maxmem, so every
// call sites sets maxmem explicitly or scryptSync throws.

const SCHEME = "scrypt";
const FIELD_COUNT = 6;
const SALT_BYTES = 16;
const DIGEST_BYTES = 64;
const MAX_PASSWORD_BYTES = 1_024;
const MAXMEM = 128 * 1024 * 1024;

// Bounds keep a hostile configuration value from turning verification into a
// memory or CPU exhaustion primitive.
const MIN_N = 16_384;
const MAX_N = 1_048_576;
const MAX_R = 32;
const MAX_P = 16;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type PrivateAccessPasswordParameters = Readonly<{
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  digest: Buffer;
}>;

/**
 * Decode base64url without accepting a non-canonical encoding. Two different
 * strings must never decode to the same bytes, or a stored hash could be
 * matched by more than one literal.
 */
function decodeCanonicalBase64Url(value: string, expectedBytes: number): Buffer | null {
  if (!BASE64URL.test(value)) return null;
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    return null;
  }
  if (decoded.length !== expectedBytes) return null;
  if (decoded.toString("base64url") !== value) return null;
  return decoded;
}

function positiveInteger(value: string, max: number): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > max) return null;
  return parsed;
}

/**
 * Parse a stored hash. Returns null for anything that is not exactly the
 * canonical shape, so a malformed or truncated configuration fails closed
 * rather than verifying loosely.
 */
export function parsePrivateAccessPasswordHash(
  value: unknown,
): PrivateAccessPasswordParameters | null {
  if (typeof value !== "string") return null;
  if (value.length > 4_096) return null;
  const parts = value.split("$");
  if (parts.length !== FIELD_COUNT) return null;
  const [scheme, rawN, rawR, rawP, rawSalt, rawDigest] = parts;
  if (scheme !== SCHEME) return null;

  const n = positiveInteger(rawN, MAX_N);
  const r = positiveInteger(rawR, MAX_R);
  const p = positiveInteger(rawP, MAX_P);
  if (n === null || r === null || p === null) return null;
  if (n < MIN_N) return null;
  // scrypt requires N to be a power of two greater than one.
  if ((n & (n - 1)) !== 0) return null;

  const salt = decodeCanonicalBase64Url(rawSalt, SALT_BYTES);
  const digest = decodeCanonicalBase64Url(rawDigest, DIGEST_BYTES);
  if (salt === null || digest === null) return null;

  return Object.freeze({ n, r, p, salt, digest });
}

/**
 * Verify a presented password against a stored hash.
 *
 * Returns false for every failure mode, including an unconfigured or malformed
 * hash, so a misconfigured deployment refuses everyone instead of admitting
 * everyone. The digest comparison is constant time; the parse happens before
 * any key derivation so hostile input cannot force expensive work.
 */
export function verifyPrivateAccessPassword(
  presentedPassword: unknown,
  storedHash: unknown,
): boolean {
  if (typeof presentedPassword !== "string") return false;
  if (Buffer.byteLength(presentedPassword, "utf8") > MAX_PASSWORD_BYTES) return false;
  const parameters = parsePrivateAccessPasswordHash(storedHash);
  if (parameters === null) return false;

  let derived: Buffer;
  try {
    derived = scryptSync(presentedPassword, parameters.salt, DIGEST_BYTES, {
      N: parameters.n,
      r: parameters.r,
      p: parameters.p,
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }
  if (derived.length !== parameters.digest.length) return false;
  return timingSafeEqual(derived, parameters.digest);
}

/**
 * Produce a stored hash in the canonical format. Used by tests and by any
 * operator tooling that needs to generate a value without the PowerShell
 * script. The raw password never leaves the caller.
 */
export function hashPrivateAccessPassword(
  password: string,
  options?: Readonly<{ n?: number; r?: number; p?: number; salt?: Buffer }>,
): string {
  const n = options?.n ?? 32_768;
  const r = options?.r ?? 8;
  const p = options?.p ?? 1;
  const salt = options?.salt ?? randomBytes(SALT_BYTES);
  const digest = scryptSync(password, salt, DIGEST_BYTES, {
    N: n,
    r,
    p,
    maxmem: MAXMEM,
  });
  return [SCHEME, n, r, p, salt.toString("base64url"), digest.toString("base64url")].join("$");
}
