import {
  clearPrivateAccessCookie,
  decodePrivateAccessCookie,
  encodePrivateAccessCookie,
} from "./private-access-cookie-session";
import {
  clearEarlyAccessContinuityCookie,
  mintEarlyAccessContinuityCookie,
  readEarlyAccessContinuityToken,
} from "./identity/session-scoped-identity";
import type { EarlyAccessConfig } from "./private-access-config";
import { verifyPrivateAccessPassword } from "./private-access-password";
import {
  hashPrivateAccessSessionToken,
  type PrivateAccessSessionRepository,
} from "./private-access-session-repository";

/**
 * The three Private Early Access HTTP handlers: unlock, session read, logout.
 *
 * Every handler is a pure function of injected dependencies. There is no
 * environment read, no ambient clock, no crypto randomness, and no header
 * parsing inside this module, so each one is exercised end to end in unit tests
 * with no server, no database, and no browser.
 *
 * The security posture, stated once because it drives every branch below:
 *
 *   FAIL CLOSED, AND FAIL IDENTICALLY. An unlock attempt has exactly one failure
 *   response. The flag being off, the hash being absent, the hash being
 *   malformed, the password being wrong, the client being locked out, the token
 *   generator misbehaving, and the store refusing the write all produce the same
 *   status, the same body, and the same headers. The endpoint is therefore not
 *   an oracle for the deployment's configuration state, and (because the
 *   post-authentication faults answer identically too) not an oracle for whether
 *   a guessed password was correct.
 *
 *   THE PASSWORD IS NOT CHECKED WHEN THE GATE IS SHUT. Configuration and rate
 *   limiting are evaluated before verification, so a closed deployment performs
 *   no key derivation and a locked-out client cannot use the endpoint as a
 *   scrypt work generator.
 *
 *   THE COOKIE MAY NEVER OUTLIVE THE ROW. The durable session is created first,
 *   the cookie second, and the cookie's lifetime is compared against the stored
 *   expiry before either is returned. A disagreement revokes the row and refuses
 *   the request rather than handing out a credential the store will not honor.
 */

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** Structural response port. An Express `Response` satisfies it as written. */
export interface PrivateAccessResponsePort {
  setHeader(name: string, value: string | readonly string[]): unknown;
  status(code: number): unknown;
  json(body: unknown): unknown;
}

/**
 * The unlock request.
 *
 * `clientKey` is the rate-limit identity and is supplied BY THE CALLER. This
 * module never reads a header, because deciding which header is trustworthy
 * (and which proxy is allowed to set it) is a deployment question the
 * integration lane owns. A missing or malformed key fails closed.
 */
export interface PrivateAccessUnlockRequest {
  readonly body: unknown;
  readonly clientKey: unknown;
  /**
   * The raw Cookie header, used for exactly one read: whether a valid
   * continuity credential already exists, so a re-unlock keeps the same
   * customer instead of minting a new one. Never used to authenticate the
   * unlock itself.
   */
  readonly cookieHeader?: unknown;
}

export interface PrivateAccessSessionRequest {
  readonly cookieHeader: unknown;
}

export interface PrivateAccessLogoutRequest {
  readonly cookieHeader: unknown;
}

export type PrivateAccessUnlockRoute = (
  request: PrivateAccessUnlockRequest,
  response: PrivateAccessResponsePort,
) => Promise<void>;

export type PrivateAccessSessionRoute = (
  request: PrivateAccessSessionRequest,
  response: PrivateAccessResponsePort,
) => Promise<void>;

export type PrivateAccessLogoutRoute = (
  request: PrivateAccessLogoutRequest,
  response: PrivateAccessResponsePort,
) => Promise<void>;

export interface PrivateAccessLogger {
  warn(event: string, detail?: Readonly<Record<string, unknown>>): void;
}

/** The cookie codec, injected so the TTL policy is never assumed here. */
export interface PrivateAccessCookiePort {
  issue(
    input: Readonly<{ sessionHandle: string; now: number; ttlSeconds: number }>,
  ):
    | Readonly<{ ok: true; setCookie: string; expiresAtEpochMs: number; maxAgeSeconds: number }>
    | Readonly<{ ok: false }>;
  read(
    input: Readonly<{ cookieHeader: unknown; now: number; ttlSeconds: number }>,
  ): Readonly<{ ok: true; sessionHandle: string }> | Readonly<{ ok: false }>;
  clear(): string;
}

/**
 * Everything the handlers need.
 *
 * `verifyPassword` and `cookies` default to the accepted modules; they are
 * injectable so a test can PROVE the password verifier is never reached on a
 * closed or locked path, which an import cannot demonstrate.
 */
export interface PrivateAccessRouteDependencies {
  readonly config: EarlyAccessConfig;
  readonly repository: PrivateAccessSessionRepository;
  /** Epoch milliseconds. */
  readonly now: () => number;
  /** A 43-character base64url encoding of 32 random bytes. */
  readonly randomToken: () => string;
  readonly logger?: PrivateAccessLogger;
  readonly attempts?: PrivateAccessAttemptLimiter;
  /** Injected so the rate-limit switch is testable without touching process.env. */
  readonly env?: NodeJS.ProcessEnv;
  readonly cookies?: PrivateAccessCookiePort;
  /**
   * When set, unlock issues the long-lived customer CONTINUITY cookie beside
   * the session cookie (only if the browser does not already carry a valid
   * one), and logout clears it. Null or absent means the session-identity
   * pilot is off and no continuity credential exists. See
   * identity/session-scoped-identity.ts for what the credential is and is not.
   */
  readonly continuitySecret?: string | null;
  readonly verifyPassword?: (presented: unknown, storedHash: unknown) => boolean;
  /**
   * The deployment-scoped owner every Private Early Access session belongs to.
   * The gate is one shared password, not per-person accounts, so this is
   * configuration and never comes from a request.
   */
  readonly ownerId?: string;
  /**
   * How a session comes into existence.
   *
   * The default mints it by writing a row directly. A durable deployment mints
   * it through the database's grant-nonce exchange, which is the ONLY path the
   * accepted migration exposes. Everything after the mint is identical either
   * way, so the route's security properties do not depend on which store is
   * configured.
   */
  readonly mintSession?: PrivateAccessSessionMint;
}

export type PrivateAccessSessionMintResult =
  | Readonly<{ ok: true; token: string; expiresAtEpochMs: number | null }>
  | Readonly<{ ok: false; code: string }>;

export interface PrivateAccessSessionMint {
  (
    input: Readonly<{ ownerId: string; now: number; ttlSeconds: number }>,
  ): Promise<PrivateAccessSessionMintResult>;
}

/** The default mint: one row, written directly. Used by tests and local dev. */
export function createDirectSessionMint(
  deps: PrivateAccessRouteDependencies,
): PrivateAccessSessionMint {
  return async ({ ownerId, now, ttlSeconds }) => {
    const token = deps.randomToken();
    if (!isOpaqueToken(token)) {
      return Object.freeze({ ok: false as const, code: "TOKEN_SOURCE_INVALID" });
    }
    const created = await deps.repository.create({
      sessionHash: hashPrivateAccessSessionToken(token),
      ownerId,
      issuedAt: now,
      expiresAt: now + ttlSeconds * 1_000,
    });
    if (!created.ok) return Object.freeze({ ok: false as const, code: created.code });
    const expiresAtEpochMs = created.value?.expiresAtEpochMs;
    return Object.freeze({
      ok: true as const,
      token,
      expiresAtEpochMs: typeof expiresAtEpochMs === "number" ? expiresAtEpochMs : null,
    });
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Applied to every response from all three handlers, before any decision. */
export const PRIVATE_ACCESS_PRIVATE_HEADERS = Object.freeze([
  ["Cache-Control", "no-store"],
  ["Pragma", "no-cache"],
  ["Referrer-Policy", "no-referrer"],
  ["X-Robots-Tag", "noindex, nofollow"],
] as const);

/** The single unlock failure. Every refusal, whatever its cause, is this. */
export const PRIVATE_ACCESS_INVALID_CREDENTIALS = Object.freeze({
  ok: false as const,
  code: "invalid_credentials" as const,
});

export const PRIVATE_ACCESS_UNLOCK_STATUS_OK = 200;
export const PRIVATE_ACCESS_UNLOCK_STATUS_DENIED = 401;

/** The default owner when the integration lane does not name one. */
export const PRIVATE_ACCESS_DEFAULT_OWNER_ID = "00000000-0000-4000-8000-000000000001";

const DEFAULT_COOKIE_KEY_ID = "primary";
const MAX_PASSWORD_BYTES = 1_024;
const MAX_CLIENT_KEY_LENGTH = 256;
const OPAQUE_TOKEN_LENGTH = 43;
const OPAQUE_TOKEN_BYTES = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_AGE = /(?:^|;)\s*Max-Age=(\d+)(?:;|$)/i;
const JAVASCRIPT_DATE_MAX_MS = 8_640_000_000_000_000;

// ---------------------------------------------------------------------------
// Rate limiting and lockout
// ---------------------------------------------------------------------------

export interface PrivateAccessAttemptLimiter {
  /** True while the key is refused regardless of what it presents. */
  isLocked(key: string, now: number): boolean;
  recordFailure(key: string, now: number): void;
  /** Called on a successful unlock; the key starts again with a full budget. */
  reset(key: string): void;
}

export type PrivateAccessAttemptLimiterOptions = Readonly<{
  maxAttempts: number;
  lockoutMinutes: number;
  maxKeys?: number;
}>;

type AttemptEntry = { failures: number; lockedUntil: number | null; lastSeen: number };

export const PRIVATE_ACCESS_ATTEMPT_MAX_KEYS = 10_000;

/**
 * A bounded per-client failure counter with a lockout window.
 *
 * The bound matters: without one, an attacker rotating client keys would grow
 * the map without limit. At capacity the limiter evicts an entry that is NOT
 * currently locked, and if every tracked key is locked it refuses to admit a new
 * one (reporting it locked). Flooding therefore cannot be used to evict an
 * attacker's own lockout, and cannot turn rate limiting off.
 */
export function createPrivateAccessAttemptLimiter(
  options: PrivateAccessAttemptLimiterOptions,
): PrivateAccessAttemptLimiter {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const lockoutMs = Math.max(1, Math.floor(options.lockoutMinutes)) * 60_000;
  const maxKeys = Math.max(1, Math.floor(options.maxKeys ?? PRIVATE_ACCESS_ATTEMPT_MAX_KEYS));
  const entries = new Map<string, AttemptEntry>();

  function sweep(now: number): void {
    // Snapshot first: the map is mutated inside the loop.
    for (const [key, entry] of Array.from(entries.entries())) {
      const lockExpired = entry.lockedUntil !== null && now >= entry.lockedUntil;
      if (lockExpired && entry.failures === 0) entries.delete(key);
      else if (lockExpired) entry.lockedUntil = null;
    }
  }

  /** Returns false when capacity is exhausted by locked keys only. */
  function admit(key: string, now: number): boolean {
    if (entries.has(key) || entries.size < maxKeys) return true;
    for (const [candidate, entry] of Array.from(entries.entries())) {
      if (entry.lockedUntil === null || now >= entry.lockedUntil) {
        entries.delete(candidate);
        return true;
      }
    }
    return false;
  }

  return {
    isLocked(key: string, now: number): boolean {
      sweep(now);
      const entry = entries.get(key);
      if (entry) return entry.lockedUntil !== null && now < entry.lockedUntil;
      // An unseen key at saturated, fully locked capacity is treated as locked.
      return !admit(key, now);
    },
    recordFailure(key: string, now: number): void {
      sweep(now);
      if (!admit(key, now)) return;
      const entry = entries.get(key) ?? { failures: 0, lockedUntil: null, lastSeen: now };
      entry.lastSeen = now;
      if (entry.lockedUntil !== null && now < entry.lockedUntil) {
        entries.set(key, entry);
        return;
      }
      entry.failures += 1;
      if (entry.failures >= maxAttempts) {
        entry.failures = 0;
        entry.lockedUntil = now + lockoutMs;
      }
      entries.set(key, entry);
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Default cookie port
// ---------------------------------------------------------------------------

/**
 * The default codec, over the accepted cookie module.
 *
 * The requested TTL is passed in by the caller and reported back as ACTUALLY
 * ISSUED, never as requested. The accepted codec seals its own lifetime into the
 * signed value, so if it issues something shorter than the deployment asked for,
 * the route sees the real number and synchronizes the durable row to it. Nothing
 * here hardcodes a duration.
 */
export function createDefaultPrivateAccessCookiePort(
  sessionSecret: string,
): PrivateAccessCookiePort {
  const keyRing = { activeKeyId: DEFAULT_COOKIE_KEY_ID, keys: { [DEFAULT_COOKIE_KEY_ID]: sessionSecret } };
  return {
    issue({ sessionHandle, now, ttlSeconds }) {
      // The resolved TTL must reach the codec, or the cookie carries the codec
      // default while the durable row carries the configured lifetime. The two
      // then disagree, the synchronization guard below refuses the cookie, and
      // a correct password returns 401. Threading it here is what makes the
      // cookie Max-Age and the database expiry one value rather than two.
      const issued = encodePrivateAccessCookie({ keyRing, now, sessionHandle, ttlSeconds });
      if (!issued.ok) return Object.freeze({ ok: false as const });
      const maxAge = MAX_AGE.exec(issued.value.setCookie);
      if (!maxAge) return Object.freeze({ ok: false as const });
      return Object.freeze({
        ok: true as const,
        setCookie: issued.value.setCookie,
        expiresAtEpochMs: issued.value.session.expiresAtEpochSeconds * 1_000,
        maxAgeSeconds: Number(maxAge[1]),
      });
    },
    read({ cookieHeader, now, ttlSeconds }) {
      // Decode against the SAME resolved lifetime the cookie was sealed with;
      // the codec pins exp - iat, so a mismatched TTL reads as an invalid
      // cookie and silently signs the customer out.
      const decoded = decodePrivateAccessCookie({ cookieHeader, keyRing, now, ttlSeconds });
      if (!decoded.ok) return Object.freeze({ ok: false as const });
      return Object.freeze({ ok: true as const, sessionHandle: decoded.value.sessionHandle });
    },
    clear() {
      return clearPrivateAccessCookie();
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function applyPrivateHeaders(response: PrivateAccessResponsePort): void {
  for (const [name, value] of PRIVATE_ACCESS_PRIVATE_HEADERS) {
    response.setHeader(name, value);
  }
}

function send(response: PrivateAccessResponsePort, status: number, body: unknown): void {
  response.status(status);
  response.json(body);
}

function denyUnlock(response: PrivateAccessResponsePort): void {
  send(response, PRIVATE_ACCESS_UNLOCK_STATUS_DENIED, PRIVATE_ACCESS_INVALID_CREDENTIALS);
}

function log(
  logger: PrivateAccessLogger | undefined,
  event: string,
  detail?: Readonly<Record<string, unknown>>,
): void {
  if (!logger) return;
  try {
    logger.warn(event, detail);
  } catch {
    // A broken logger must never change a security outcome.
  }
}

/** The gate is shut when the flag is off OR any secret is missing or malformed. */
function gateIsOpen(config: EarlyAccessConfig): boolean {
  return (
    config !== null &&
    typeof config === "object" &&
    config.enabled === true &&
    Array.isArray(config.problems) &&
    config.problems.length === 0 &&
    // A password hash is required only while there IS a password. This was the
    // dead dependency that would have failed the whole lane closed: with the
    // prompt removed and the secret retired, `passwordHash` is "" and every
    // door — unlock, session read, the session resolver every ordering route
    // depends on — reported the gate shut and answered a refusal. The surface
    // would have looked switched off rather than open.
    (config.openAccess === true ||
      (typeof config.passwordHash === "string" && config.passwordHash.length > 0)) &&
    // The session secret is NOT optional either way: sessions are still minted
    // and signed, because they carry the identity every ownership check uses.
    typeof config.sessionSecret === "string" &&
    config.sessionSecret.length > 0
  );
}

function readInstant(now: () => number): number | null {
  try {
    const value = now();
    return Number.isSafeInteger(value) && value > 0 && value <= JAVASCRIPT_DATE_MAX_MS
      ? value
      : null;
  } catch {
    return null;
  }
}

function readClientKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CLIENT_KEY_LENGTH) return null;
  return trimmed;
}

/** The presented password, read without touching accessors on a hostile body. */
function readPresentedPassword(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(body, "password");
  if (!descriptor || !("value" in descriptor)) return null;
  const value = descriptor.value as unknown;
  if (typeof value !== "string" || value.length === 0) return null;
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) return null;
  return value;
}

function isOpaqueToken(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== OPAQUE_TOKEN_LENGTH || !BASE64URL.test(value)) {
    return false;
  }
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === OPAQUE_TOKEN_BYTES && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function cookiePortOf(deps: PrivateAccessRouteDependencies): PrivateAccessCookiePort {
  return deps.cookies ?? createDefaultPrivateAccessCookiePort(deps.config.sessionSecret);
}

/** The env switch for the Early Access password limiter, and nothing else. */
export const PRIVATE_ACCESS_RATE_LIMIT_ENV = "RESEARCH_EARLY_ACCESS_RATE_LIMIT_ENABLED";

/**
 * FAILS CLOSED. The limiter is on unless the value is EXACTLY "false".
 *
 * Missing, empty, "0", "no", "FALSE", or any malformed value keeps rate
 * limiting ENABLED. Only the one exact string turns it off, so a typo or a
 * half-set variable can never quietly remove the brute-force guard.
 */
export function privateAccessRateLimitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[PRIVATE_ACCESS_RATE_LIMIT_ENV] !== "false";
}

/**
 * A limiter that never locks and records nothing.
 *
 * It is NOT a weaker password check. `verify` still runs on every attempt and a
 * wrong password still returns the same refusal; what is removed is only the
 * lockout that would refuse a LATER CORRECT password. It keeps no per-client
 * state, so there is nothing to write and nothing to leak, and it logs nothing.
 *
 * This exists for launch, where a locked-out founder and a locked-out approved
 * member are indistinguishable from a broken deployment. Restore the limiter
 * after launch by setting the variable back to "true" or removing it.
 */
export function createPrivateAccessUnlimitedAttempts(): PrivateAccessAttemptLimiter {
  return {
    isLocked: () => false,
    recordFailure: () => {},
    reset: () => {},
  };
}

function limiterOf(deps: PrivateAccessRouteDependencies): PrivateAccessAttemptLimiter {
  if (deps.attempts !== undefined) return deps.attempts;
  // Read per call rather than at module load, so the switch takes effect on a
  // restart without depending on import order.
  if (!privateAccessRateLimitEnabled(deps.env ?? process.env)) {
    return createPrivateAccessUnlimitedAttempts();
  }
  return createPrivateAccessAttemptLimiter({
    maxAttempts: deps.config.maxAttempts,
    lockoutMinutes: deps.config.lockoutMinutes,
  });
}

// ---------------------------------------------------------------------------
// POST unlock
// ---------------------------------------------------------------------------

/**
 * Exchange the shared access password for a durable session and a signed cookie.
 *
 * The order of the checks is the design. Configuration and lockout come before
 * verification so a shut gate performs no key derivation; the durable row is
 * written before the cookie so no cookie can exist without a row; and the
 * lifetimes are reconciled before anything is returned.
 */
export function createUnlockRoute(deps: PrivateAccessRouteDependencies): PrivateAccessUnlockRoute {
  const limiter = limiterOf(deps);
  const cookies = cookiePortOf(deps);
  const verify = deps.verifyPassword ?? verifyPrivateAccessPassword;
  const ownerId = deps.ownerId ?? PRIVATE_ACCESS_DEFAULT_OWNER_ID;
  const mintSession = deps.mintSession ?? createDirectSessionMint(deps);

  return async (request, response): Promise<void> => {
    try {
      applyPrivateHeaders(response);

      const now = readInstant(deps.now);
      if (now === null) {
        log(deps.logger, "private_access.unlock.clock_unavailable");
        denyUnlock(response);
        return;
      }

      // Without a rate-limit identity there is no way to bound guessing, so the
      // attempt is refused before the password is looked at.
      const clientKey = readClientKey(request?.clientKey);
      if (clientKey === null) {
        log(deps.logger, "private_access.unlock.client_key_missing");
        denyUnlock(response);
        return;
      }

      if (limiter.isLocked(clientKey, now)) {
        log(deps.logger, "private_access.unlock.locked");
        denyUnlock(response);
        return;
      }

      if (!gateIsOpen(deps.config)) {
        // Deliberately recorded as a failure: if a shut gate did not count
        // toward lockout, the lockout behavior itself would reveal that the
        // deployment is closed.
        limiter.recordFailure(clientKey, now);
        log(deps.logger, "private_access.unlock.gate_closed");
        denyUnlock(response);
        return;
      }

      // OPEN ACCESS: no customer-facing password (founder decision 2026-08-20).
      //
      // Only the password CHECK is skipped. Everything around it is deliberately
      // kept: the rate-limit identity is still required and still consulted
      // above, the gate must still be open, the session is still minted, signed
      // and written before any cookie exists, and the same audit line is still
      // written. What changes is what the caller must prove to obtain an
      // anonymous session — nothing — not what that session then permits.
      //
      // The limiter stays because it now bounds session MINTING rather than
      // password guessing: without it, one caller could ask for unlimited
      // durable session rows.
      if (!deps.config.openAccess) {
        const password = readPresentedPassword(request?.body);
        if (password === null || !verify(password, deps.config.passwordHash)) {
          limiter.recordFailure(clientKey, now);
          log(deps.logger, "private_access.unlock.denied");
          denyUnlock(response);
          return;
        }
      }

      // Everything below this line runs only for a CORRECT password (or, under
      // open access, for any caller), so every remaining failure must answer
      // exactly like a wrong one. A distinct status or body here would confirm
      // a guess while a password still exists.
      const ttlSeconds = Math.max(1, Math.floor(deps.config.sessionTtlMinutes)) * 60;
      const minted = await mintSession({ ownerId, now, ttlSeconds });
      if (!minted.ok) {
        limiter.recordFailure(clientKey, now);
        log(deps.logger, "private_access.unlock.store_refused", { code: minted.code });
        denyUnlock(response);
        return;
      }

      const token = minted.token;
      const sessionHash = hashPrivateAccessSessionToken(token);
      if (!isOpaqueToken(token)) {
        // A row may already exist, so it must not be left behind reachable.
        await revokeQuietly(deps, sessionHash, now);
        limiter.recordFailure(clientKey, now);
        log(deps.logger, "private_access.unlock.token_source_invalid");
        denyUnlock(response);
        return;
      }

      const issued = cookies.issue({ sessionHandle: token, now, ttlSeconds });
      if (!issued.ok) {
        await revokeQuietly(deps, sessionHash, now);
        limiter.recordFailure(clientKey, now);
        log(deps.logger, "private_access.unlock.cookie_issue_failed");
        denyUnlock(response);
        return;
      }

      // The cookie must never outlive the row, and Max-Age must agree with the
      // cookie's own sealed expiry. A drift of more than the rounding of one
      // second is a configuration fault, not a request to be served.
      const storedExpiry = minted.expiresAtEpochMs;
      const lifetimeMs = issued.expiresAtEpochMs - now;
      const maxAgeMs = issued.maxAgeSeconds * 1_000;
      const synchronized =
        lifetimeMs > 0 &&
        lifetimeMs <= maxAgeMs &&
        maxAgeMs - lifetimeMs < 1_000 &&
        (storedExpiry === null || issued.expiresAtEpochMs <= storedExpiry);
      if (!synchronized) {
        await revokeQuietly(deps, sessionHash, now);
        limiter.recordFailure(clientKey, now);
        log(deps.logger, "private_access.unlock.lifetime_mismatch");
        denyUnlock(response);
        return;
      }

      if (deps.config.openAccess === true) {
        // COUNT THE ISSUANCE. With no password there is nothing to guess, so
        // every call reaches this line — and a reset here would clear the very
        // counter it should be filling, leaving session minting completely
        // unbounded for any caller. The limiter's increment is named for the
        // guessing it used to bound, but the mechanism is a per-client attempt
        // counter, and bounding how many durable session rows one client can
        // demand is exactly what it is still needed for.
        limiter.recordFailure(clientKey, now);
      } else {
        limiter.reset(clientKey);
      }
      // The CONTINUITY cookie rides beside the session cookie, minted once
      // per browser: a later unlock that already carries a valid credential
      // keeps it, which is exactly what lets a purchaser renew their session
      // without becoming a different customer. An invalid or forged one is
      // replaced rather than honored.
      const setCookies: string[] = [issued.setCookie];
      if (typeof deps.continuitySecret === "string" && deps.continuitySecret.length > 0) {
        const existing = readEarlyAccessContinuityToken(
          request?.cookieHeader,
          deps.continuitySecret,
        );
        if (existing === null) {
          setCookies.push(mintEarlyAccessContinuityCookie(deps.continuitySecret).setCookie);
        }
      }
      response.setHeader("Set-Cookie", setCookies.length === 1 ? issued.setCookie : setCookies);
      // The token appears in the Set-Cookie header, which is its purpose, and
      // nowhere in the body. The hash, the password, and the configured hash
      // are absent from both.
      send(response, PRIVATE_ACCESS_UNLOCK_STATUS_OK, {
        ok: true,
        expiresAt: new Date(issued.expiresAtEpochMs).toISOString(),
      });
    } catch {
      // An unexpected fault answers exactly like a refusal, so a crash cannot be
      // used to distinguish a correct password from a wrong one.
      try {
        denyUnlock(response);
      } catch {
        // The response port itself is broken; there is nothing further to do.
      }
    }
  };
}

async function revokeQuietly(
  deps: PrivateAccessRouteDependencies,
  sessionHash: string,
  now: number,
): Promise<void> {
  try {
    await deps.repository.revoke(sessionHash, now);
  } catch {
    // Compensation is best effort. The row expires on its own regardless, and
    // no cookie for it was ever returned.
  }
}

// ---------------------------------------------------------------------------
// GET session
// ---------------------------------------------------------------------------

/**
 * Report whether the presented cookie maps to a live session.
 *
 * The body carries a boolean and, when the store can state one, an expiry.
 * Nothing else: no session handle, no hash, no owner, no reason. A missing
 * cookie, a forged cookie, an expired cookie, a revoked session, and a closed
 * deployment are one answer.
 */
/** The answer to "may this cookie see anything behind the gate". */
export type EarlyAccessSessionCheck = Readonly<{
  authenticated: boolean;
  expiresAtEpochMs: number | null;
}>;

const SESSION_DENIED: EarlyAccessSessionCheck = Object.freeze({
  authenticated: false,
  expiresAtEpochMs: null,
});

/**
 * ONE definition of session validity, for every route behind the gate.
 *
 * The session endpoint and any protected resource must agree exactly. Two
 * implementations of "is this cookie good" drift, and the drift shows up as a
 * customer who is signed in on one screen and signed out on the next, or worse,
 * as a resource that answers a cookie the session endpoint would reject.
 */
export function createEarlyAccessSessionResolver(
  deps: PrivateAccessRouteDependencies,
): (cookieHeader: unknown) => Promise<EarlyAccessSessionCheck> {
  const cookies = cookiePortOf(deps);

  return async (cookieHeader) => {
    const now = readInstant(deps.now);
    if (now === null || !gateIsOpen(deps.config)) return SESSION_DENIED;

    // Same derivation as unlock, so read and issue always agree.
    const ttlSeconds = Math.max(1, Math.floor(deps.config.sessionTtlMinutes)) * 60;
    const read = cookies.read({ cookieHeader, now, ttlSeconds });
    if (!read.ok || !isOpaqueToken(read.sessionHandle)) return SESSION_DENIED;

    const resolved = await deps.repository.resolve(
      hashPrivateAccessSessionToken(read.sessionHandle),
      now,
    );
    if (!resolved.ok || resolved.value === null) return SESSION_DENIED;

    // Liveness telemetry only. It cannot extend the session, and a store that
    // does not support it (or throws) must not change this answer.
    try {
      await deps.repository.touch(resolved.value.sessionHash, now);
    } catch {
      // Deliberately ignored.
    }

    return Object.freeze({
      authenticated: true,
      expiresAtEpochMs: resolved.value.expiresAtEpochMs,
    });
  };
}

/**
 * The identity a session BINDING may be keyed by: the hash of the verified
 * cookie's session handle, exactly as the session repository stores it. The
 * raw handle never leaves this module, so a binding store can never become a
 * table of bearer tokens.
 *
 * This reader states nothing about liveness. It verifies the cookie's
 * signature and lifetime only and cannot see a revocation, so every consumer
 * must sit BEHIND `createEarlyAccessSessionResolver`, the one definition of
 * session validity. The order routes do exactly that: they resolve the session
 * first and consult identity second, so a revoked session is refused before
 * any binding is read.
 */
export function createEarlyAccessSessionIdReader(
  deps: PrivateAccessRouteDependencies,
): (cookieHeader: unknown) => string | null {
  const cookies = cookiePortOf(deps);

  return (cookieHeader) => {
    const now = readInstant(deps.now);
    if (now === null || !gateIsOpen(deps.config)) return null;

    // Same derivation as unlock and the session resolver, so the id a binding
    // was written under is the id this reader yields for the same cookie.
    const ttlSeconds = Math.max(1, Math.floor(deps.config.sessionTtlMinutes)) * 60;
    const read = cookies.read({ cookieHeader, now, ttlSeconds });
    if (!read.ok || !isOpaqueToken(read.sessionHandle)) return null;

    return hashPrivateAccessSessionToken(read.sessionHandle);
  };
}

export function createSessionRoute(deps: PrivateAccessRouteDependencies): PrivateAccessSessionRoute {
  const resolve = createEarlyAccessSessionResolver(deps);

  return async (request, response): Promise<void> => {
    try {
      applyPrivateHeaders(response);

      // `openAccess` tells the browser there is no password to ask for, so the
      // customer is never shown a prompt it could not satisfy. It reveals no
      // secret: it is the same fact the ordering surface demonstrates by simply
      // working, and it is a boolean about the deployment, never about a
      // caller.
      const openAccess = deps.config.openAccess === true;

      const check = await resolve(request?.cookieHeader);
      if (!check.authenticated) {
        send(response, 200, { authenticated: false, openAccess });
        return;
      }

      const expiresAtEpochMs = check.expiresAtEpochMs;
      send(
        response,
        200,
        expiresAtEpochMs === null
          ? { authenticated: true, openAccess }
          : { authenticated: true, openAccess, expiresAt: new Date(expiresAtEpochMs).toISOString() },
      );
    } catch {
      try {
        // Same shape on the failure path. A body that changes its KEYS when the
        // store is down would let a caller detect an outage from the outside,
        // and would make the browser think the deployment had a password again.
        send(response, 200, {
          authenticated: false,
          openAccess: deps.config.openAccess === true,
        });
      } catch {
        // The response port itself is broken.
      }
    }
  };
}

// ---------------------------------------------------------------------------
// POST logout
// ---------------------------------------------------------------------------

/**
 * End the session: revoke the durable row and expire the cookie.
 *
 * Idempotent by construction. The cookie is cleared unconditionally (clearing an
 * absent cookie is a no-op for the browser), the revocation is attempted only
 * when a handle can be read, and the answer is the same whether a session
 * existed, had already ended, or never existed at all.
 */
export function createLogoutRoute(deps: PrivateAccessRouteDependencies): PrivateAccessLogoutRoute {
  const cookies = cookiePortOf(deps);

  return async (request, response): Promise<void> => {
    try {
      applyPrivateHeaders(response);
      try {
        // Sign-out severs BOTH credentials: the session that grants entry and
        // the continuity credential that names the customer. On a shared
        // machine the next person to unlock must start as somebody new, not
        // inherit the last purchaser's orders.
        response.setHeader(
          "Set-Cookie",
          typeof deps.continuitySecret === "string" && deps.continuitySecret.length > 0
            ? [cookies.clear(), clearEarlyAccessContinuityCookie()]
            : cookies.clear(),
        );
      } catch {
        // A broken port must not prevent the revocation below.
      }

      const now = readInstant(deps.now);
      if (now !== null && gateIsOpen(deps.config)) {
        // Same derivation as unlock, so read and issue always agree.
      const ttlSeconds = Math.max(1, Math.floor(deps.config.sessionTtlMinutes)) * 60;
      const read = cookies.read({ cookieHeader: request?.cookieHeader, now, ttlSeconds });
        if (read.ok && isOpaqueToken(read.sessionHandle)) {
          const revoked = await revokeQuietlyResult(
            deps,
            hashPrivateAccessSessionToken(read.sessionHandle),
            now,
          );
          if (!revoked) log(deps.logger, "private_access.logout.revoke_failed");
        }
      }

      send(response, 200, { ok: true });
    } catch {
      try {
        send(response, 200, { ok: true });
      } catch {
        // The response port itself is broken.
      }
    }
  };
}

async function revokeQuietlyResult(
  deps: PrivateAccessRouteDependencies,
  sessionHash: string,
  now: number,
): Promise<boolean> {
  try {
    const result = await deps.repository.revoke(sessionHash, now);
    return result.ok;
  } catch {
    return false;
  }
}
