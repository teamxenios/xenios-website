import { parsePrivateAccessPasswordHash } from "./private-access-password";

// The one place the Private Early Access deployment configuration is read.
//
// Every value comes from the server environment. Nothing here is exposed to the
// browser, and no NEXT_PUBLIC_/VITE_ name is read, so the hash and the session
// secret cannot reach a bundle.
//
// Names are canonical as of this module: the merged Early Access code defined
// only path constants, so these are the first authoritative definitions and the
// operator secret-generation script emits exactly this set.

export const EARLY_ACCESS_ENV = {
  enabled: "RESEARCH_EARLY_ACCESS_ENABLED",
  passwordHash: "RESEARCH_EARLY_ACCESS_PASSWORD_HASH",
  sessionSecret: "RESEARCH_EARLY_ACCESS_SESSION_SECRET",
  sessionTtlMinutes: "RESEARCH_EARLY_ACCESS_SESSION_TTL_MINUTES",
  maxAttempts: "RESEARCH_EARLY_ACCESS_MAX_ATTEMPTS",
  lockoutMinutes: "RESEARCH_EARLY_ACCESS_LOCKOUT_MINUTES",
  cookieName: "RESEARCH_EARLY_ACCESS_COOKIE_NAME",
  openAccess: "RESEARCH_EARLY_ACCESS_OPEN_ACCESS",
} as const;

// Session lifetime is 240 minutes by decision, because the Early Access order
// flow is an eight-step stepper with an identity document and a payment-proof
// upload. The session core and the cookie codec now carry the same bounds, so a
// configured value inside them is honored end to end rather than clamped away.
// A value outside the bounds is clamped to the nearest bound and reported; a
// malformed value uses the documented default rather than disabling the gate,
// so a typo cannot take Early Access offline.
export const EARLY_ACCESS_DEFAULT_SESSION_TTL_MINUTES = 240;
export const EARLY_ACCESS_MIN_SESSION_TTL_MINUTES = 15;
export const EARLY_ACCESS_MAX_SESSION_TTL_MINUTES = 480;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 100;
const MIN_LOCKOUT_MINUTES = 1;
const MAX_LOCKOUT_MINUTES = 24 * 60;
const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 4_096;

export type EarlyAccessConfigProblem =
  | "PASSWORD_HASH_MISSING"
  | "PASSWORD_HASH_INVALID"
  | "SESSION_SECRET_MISSING"
  | "SESSION_SECRET_TOO_SHORT"
  | "SESSION_SECRET_EQUALS_PASSWORD_HASH";

export type EarlyAccessConfig = Readonly<{
  /** True only when the flag is exactly "true" AND every secret is valid. */
  enabled: boolean;
  /**
   * No customer-facing password at all (founder decision, 2026-08-20).
   *
   * The Early Access ordering surface is open: a visitor reaches the catalog
   * and the order form without a shared code. The SESSION does not go away with
   * it — it stops being proof of access and becomes the anonymous identity that
   * scopes what a browser owns. Removing it as well would collapse every
   * ownership check in the lane, because "whose order is this" would have no
   * answer, so a status read could become an oracle over other customers'
   * requests.
   */
  openAccess: boolean;
  passwordHash: string;
  sessionSecret: string;
  sessionTtlMinutes: number;
  /** Set when the operator asked for a longer TTL than the token can carry. */
  sessionTtlClampedFrom: number | null;
  maxAttempts: number;
  lockoutMinutes: number;
  cookieName: string | null;
  /** Empty when the deployment is fully configured. */
  problems: readonly EarlyAccessConfigProblem[];
}>;

function readString(env: NodeJS.ProcessEnv, key: string): string | null {
  const raw = env[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readBoundedInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = readString(env, key);
  if (raw === null || !/^[0-9]+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

/**
 * Resolve the deployment configuration.
 *
 * FAILS CLOSED: `enabled` is true only when the flag is exactly "true" and every
 * secret it still needs is present and well formed. A deployment that sets the
 * flag but forgets one stays closed and reports the reason, rather than opening
 * a gate that admits nobody or, worse, admits everybody.
 *
 * Under RESEARCH_EARLY_ACCESS_OPEN_ACCESS the password hash is no longer one of
 * those secrets, because there is no password to check. The SESSION SECRET
 * still is: sessions continue to be minted and signed, since they carry the
 * anonymous identity every ownership check in the lane depends on.
 */
export function resolveEarlyAccessConfig(
  env: NodeJS.ProcessEnv = process.env,
): EarlyAccessConfig {
  const problems: EarlyAccessConfigProblem[] = [];

  // Founder decision, 2026-08-20: no customer-facing Early Access password.
  const openAccess = readString(env, EARLY_ACCESS_ENV.openAccess) === "true";

  const passwordHash = readString(env, EARLY_ACCESS_ENV.passwordHash);
  // With no password in the journey, a missing hash is the EXPECTED state, not
  // a misconfiguration. Keeping it a problem would have been the trap: the
  // moment an operator removed the now-unused secret, `enabled` would flip
  // false and the whole ordering surface would go dark with a 503 that looks
  // like an outage. A hash that is still present is still validated, because a
  // malformed one means somebody is mid-change and should be told.
  if (!openAccess && passwordHash === null) {
    problems.push("PASSWORD_HASH_MISSING");
  } else if (passwordHash !== null && parsePrivateAccessPasswordHash(passwordHash) === null) {
    problems.push("PASSWORD_HASH_INVALID");
  }

  const sessionSecret = readString(env, EARLY_ACCESS_ENV.sessionSecret);
  if (sessionSecret === null) {
    problems.push("SESSION_SECRET_MISSING");
  } else {
    const bytes = Buffer.byteLength(sessionSecret, "utf8");
    if (bytes < MIN_SECRET_BYTES || bytes > MAX_SECRET_BYTES) {
      problems.push("SESSION_SECRET_TOO_SHORT");
    }
    // Operations rule: the session secret must be a different value from the
    // password material. Reusing one for both would let a leaked hash forge
    // sessions.
    if (passwordHash !== null && sessionSecret === passwordHash) {
      problems.push("SESSION_SECRET_EQUALS_PASSWORD_HASH");
    }
  }

  // Read the raw request without bounds so an out-of-range value can be clamped
  // and REPORTED rather than silently replaced by the default.
  const rawTtl = readString(env, EARLY_ACCESS_ENV.sessionTtlMinutes);
  const parsedTtl =
    rawTtl !== null && /^[0-9]+$/.test(rawTtl) && Number.isSafeInteger(Number(rawTtl))
      ? Number(rawTtl)
      : null;
  const requestedTtl = parsedTtl ?? EARLY_ACCESS_DEFAULT_SESSION_TTL_MINUTES;
  const sessionTtlMinutes = Math.min(
    Math.max(requestedTtl, EARLY_ACCESS_MIN_SESSION_TTL_MINUTES),
    EARLY_ACCESS_MAX_SESSION_TTL_MINUTES,
  );
  const sessionTtlClampedFrom = requestedTtl !== sessionTtlMinutes ? requestedTtl : null;

  const flag = readString(env, EARLY_ACCESS_ENV.enabled);
  const flagOn = flag === "true";

  return Object.freeze({
    enabled: flagOn && problems.length === 0,
    openAccess,
    passwordHash: passwordHash ?? "",
    sessionSecret: sessionSecret ?? "",
    sessionTtlMinutes,
    sessionTtlClampedFrom,
    maxAttempts: readBoundedInteger(env, EARLY_ACCESS_ENV.maxAttempts, 8, MIN_ATTEMPTS, MAX_ATTEMPTS),
    lockoutMinutes: readBoundedInteger(
      env,
      EARLY_ACCESS_ENV.lockoutMinutes,
      15,
      MIN_LOCKOUT_MINUTES,
      MAX_LOCKOUT_MINUTES,
    ),
    cookieName: readString(env, EARLY_ACCESS_ENV.cookieName),
    problems: Object.freeze([...problems]),
  });
}

/**
 * An operator-facing status projection. Reports only whether each input is
 * present and usable, never a value, so it is safe to log or surface on an
 * internal health view.
 */
export function describeEarlyAccessConfig(
  config: EarlyAccessConfig,
): Readonly<Record<string, string>> {
  return Object.freeze({
    enabled: String(config.enabled),
    passwordHash: config.passwordHash.length > 0 ? "configured" : "missing",
    sessionSecret: config.sessionSecret.length > 0 ? "configured" : "missing",
    sessionTtlMinutes: String(config.sessionTtlMinutes),
    sessionTtlClamped:
      config.sessionTtlClampedFrom === null
        ? "no"
        : `yes, requested ${config.sessionTtlClampedFrom}`,
    problems: config.problems.length === 0 ? "none" : config.problems.join(","),
  });
}
