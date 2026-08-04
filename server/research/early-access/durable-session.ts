import { createHash, randomBytes } from "node:crypto";

import type {
  PrivateAccessSessionRepository,
  PrivateAccessSessionRepositoryResult,
  StoredPrivateAccessSession,
} from "./private-access-session-repository";

// Durable Private Early Access session minting.
//
// The accepted migration deliberately exposes NO standalone session-minting
// function, and revokes table privileges from every browser-reachable role. A
// session exists only as the atomic exchange of a one-time grant nonce, inside
// a SECURITY DEFINER function the trusted server role alone may execute.
//
// This module orchestrates that two-step exchange so the mounted unlock route
// can create a session that survives a restart, a redeploy, and a request
// landing on another instance.
//
//   verify password (already done by the caller)
//     -> generate a random grant nonce, register only its SHA-256
//     -> generate an INDEPENDENT random session token
//     -> exchange the grant atomically for a session row keyed by token hash
//     -> hand the raw token back for the HttpOnly cookie
//
// The browser never sees, sends, or stores the grant nonce. The database never
// stores the raw token or the raw nonce. Nothing here logs either value.

/** A repository that can register a grant, which the durable path requires. */
export interface GrantIssuingRepository extends PrivateAccessSessionRepository {
  issueNonce(nonceHash: string): Promise<PrivateAccessSessionRepositoryResult<number>>;
}

export type DurableSessionMintResult =
  | Readonly<{ ok: true; token: string; expiresAtEpochMs: number }>
  | Readonly<{ ok: false; code: DurableSessionMintFailure }>;

export type DurableSessionMintFailure =
  | "GRANT_REGISTRATION_FAILED"
  | "EXCHANGE_FAILED"
  | "CONFIGURATION_INVALID";

export interface DurableSessionMintInput {
  readonly repository: GrantIssuingRepository;
  readonly ownerId: string;
  readonly now: number;
  readonly ttlSeconds: number;
  /** Injected so a test can force a collision or a weak value. */
  readonly randomToken?: () => string;
}

/** Lowercase 64-hex, the exact shape both RPCs validate. */
export function hashToStorageHex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function defaultRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Mint a durable session.
 *
 * Fails closed on every branch. A failure never leaves a usable cookie, because
 * the caller only receives a token when the database has actually committed the
 * session row.
 */
export async function mintDurableSession(
  input: DurableSessionMintInput,
): Promise<DurableSessionMintResult> {
  const { repository, ownerId, now, ttlSeconds } = input;
  if (!Number.isSafeInteger(now) || now <= 0) return frozen("CONFIGURATION_INVALID");
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) return frozen("CONFIGURATION_INVALID");
  if (typeof ownerId !== "string" || ownerId.length === 0) return frozen("CONFIGURATION_INVALID");

  const randomToken = input.randomToken ?? defaultRandomToken;

  // The grant and the session token are INDEPENDENTLY random. Deriving one from
  // the other would make a leaked grant sufficient to predict a session.
  const grantNonce = randomToken();
  const sessionToken = randomToken();
  if (grantNonce === sessionToken) return frozen("CONFIGURATION_INVALID");

  const nonceHash = hashToStorageHex(grantNonce);
  const sessionHash = hashToStorageHex(sessionToken);

  const registered = await repository.issueNonce(nonceHash);
  if (!registered.ok) return frozen("GRANT_REGISTRATION_FAILED");

  // The exchange is the atomic step: it locks the grant, refuses it if missing,
  // expired, already consumed, or foreign, marks it consumed, and inserts the
  // session row in one transaction. Two concurrent exchanges of one grant can
  // therefore produce at most one session.
  const created = await repository.create({
    sessionHash,
    ownerId,
    issuedAt: now,
    expiresAt: now + ttlSeconds * 1_000,
    nonceHash,
  } as Parameters<PrivateAccessSessionRepository["create"]>[0]);
  if (!created.ok) return frozen("EXCHANGE_FAILED");

  // The database is the authority on the expiry it actually committed; fall
  // back to the requested lifetime only if it declines to state one.
  const stored = created.value as StoredPrivateAccessSession;
  const expiresAtEpochMs =
    typeof stored?.expiresAtEpochMs === "number"
      ? stored.expiresAtEpochMs
      : now + ttlSeconds * 1_000;

  return Object.freeze({ ok: true as const, token: sessionToken, expiresAtEpochMs });
}

function frozen(code: DurableSessionMintFailure): DurableSessionMintResult {
  return Object.freeze({ ok: false as const, code });
}

/** True when a repository can perform the durable two-step exchange. */
export function isGrantIssuingRepository(
  repository: PrivateAccessSessionRepository | GrantIssuingRepository,
): repository is GrantIssuingRepository {
  return typeof (repository as GrantIssuingRepository).issueNonce === "function";
}

export type EarlyAccessAdapterDecision =
  | Readonly<{ ok: true; durable: boolean; warning: string | null }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Decide whether the configured session store may be used.
 *
 * THE RULE THAT MATTERS: production with Early Access ENABLED requires a
 * durable store. An in-memory session disappears on restart, on redeploy, and
 * whenever a request reaches another instance, so a customer would be signed
 * out mid-order with no explanation. Rather than silently degrade, the gate
 * refuses to open.
 */
export function decideEarlyAccessAdapter(input: {
  readonly isProduction: boolean;
  readonly earlyAccessEnabled: boolean;
  readonly durableAvailable: boolean;
}): EarlyAccessAdapterDecision {
  if (input.isProduction && input.earlyAccessEnabled && !input.durableAvailable) {
    return Object.freeze({
      ok: false as const,
      reason:
        "Private Early Access is enabled in production but no durable session store is configured. " +
        "An in-memory session would be lost on restart, redeploy, or any request served by another " +
        "instance. The gate stays closed rather than signing customers out mid-order.",
    });
  }
  if (!input.durableAvailable) {
    return Object.freeze({
      ok: true as const,
      durable: false,
      warning:
        "Private Early Access is using the in-memory session store. This is for tests and local " +
        "development only and does not survive a restart.",
    });
  }
  return Object.freeze({ ok: true as const, durable: true, warning: null });
}
