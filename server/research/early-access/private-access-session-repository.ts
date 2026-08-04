import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The durable session repository for Private Early Access.
 *
 * This module owns the storage PORT and two implementations: an in-memory one
 * for tests and local development, and a Supabase-shaped adapter that speaks the
 * exact RPC contract in `supabase/research-private-early-access-sessions.sql`.
 *
 * Three rules are structural rather than a matter of discipline:
 *
 *   1. THE RAW TOKEN IS NEVER STORED AND NEVER ACCEPTED. Every operation takes a
 *      `sessionHash`, validated against the same lowercase 64-hex shape the
 *      database enforces. An opaque 43-character base64url token cannot satisfy
 *      that pattern, so a caller who passes a raw token by mistake is refused at
 *      the boundary instead of persisting a credential.
 *
 *   2. TIME IS ALWAYS INJECTED. No implementation reads `Date.now()`. Expiry is
 *      therefore deterministic under test and cannot drift from the clock the
 *      route used to mint the cookie.
 *
 *   3. LOOKUP IS CONSTANT-TIME OVER THE HASH. `resolve` and `touch` compare every
 *      stored hash with `timingSafeEqual` and never short-circuit, so the time to
 *      answer does not depend on which row matched or on how many leading
 *      characters of a guess were correct.
 *
 * A missing row, an expired row, and a revoked row are all reported as the same
 * `null`, so a caller cannot use this repository as an oracle for which of the
 * three happened.
 */

export const PRIVATE_ACCESS_SESSION_ACCESS_ROLE = "private_early_access_member" as const;

/** The durable table the adapter is written against. */
export const PRIVATE_ACCESS_SESSION_TABLE = "research_private_early_access_sessions" as const;

/** The four database functions the migration installs. No other call is made. */
export const PRIVATE_ACCESS_SESSION_RPC = Object.freeze({
  issueNonce: "research_private_early_access_issue_nonce",
  exchangeNonce: "research_private_early_access_exchange_nonce",
  sessionActive: "research_private_early_access_session_active",
  revokeSession: "research_private_early_access_revoke_session",
} as const);

export type PrivateAccessSessionRpcName =
  (typeof PRIVATE_ACCESS_SESSION_RPC)[keyof typeof PRIVATE_ACCESS_SESSION_RPC];

const LOWER_HEX_SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const JAVASCRIPT_DATE_MAX_MS = 8_640_000_000_000_000;

/** A bound on the in-memory store so a hostile unlock loop cannot exhaust heap. */
export const PRIVATE_ACCESS_SESSION_MEMORY_LIMIT = 10_000;

// ---------------------------------------------------------------------------
// Result idiom
// ---------------------------------------------------------------------------

export type PrivateAccessSessionRepositoryFailureCode =
  | "INPUT_INVALID"
  | "SESSION_HASH_INVALID"
  | "NONCE_REQUIRED"
  | "CONFLICT"
  | "CAPACITY_EXCEEDED"
  | "BACKEND_UNAVAILABLE"
  | "UNSUPPORTED";

export type PrivateAccessSessionRepositoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: PrivateAccessSessionRepositoryFailureCode }>;

function failure(
  code: PrivateAccessSessionRepositoryFailureCode,
): Readonly<{ ok: false; code: PrivateAccessSessionRepositoryFailureCode }> {
  return Object.freeze({ ok: false as const, code });
}

function success<T>(value: T): Readonly<{ ok: true; value: T }> {
  return Object.freeze({ ok: true as const, value });
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * A stored session. Deliberately absent: the raw token, the cookie value, the
 * access password, and the password hash. None of them is an input to this
 * module, so none of them can appear here.
 */
export type StoredPrivateAccessSession = Readonly<{
  sessionHash: string;
  ownerId: string;
  accessRole: typeof PRIVATE_ACCESS_SESSION_ACCESS_ROLE;
  issuedAtEpochMs: number;
  /**
   * Null ONLY when the backend has asserted liveness without being able to
   * report the exact instant (the durable predicate answers a boolean). A caller
   * must then omit the expiry rather than invent one.
   */
  expiresAtEpochMs: number | null;
  revokedAtEpochMs: number | null;
  /** Best-effort liveness telemetry. Never an authorization input. */
  lastSeenAtEpochMs: number | null;
}>;

export type CreatePrivateAccessSessionInput = Readonly<{
  /** Lowercase hex SHA-256 of the opaque token. The token itself is not accepted. */
  sessionHash: string;
  ownerId: string;
  issuedAt: number;
  expiresAt: number;
  /**
   * The one-time grant nonce hash. The durable migration exposes no standalone
   * session-minting function: a session exists only as the atomic exchange of a
   * registered nonce. The Supabase adapter therefore REQUIRES this; the
   * in-memory store accepts a session without one.
   */
  nonceHash?: string | null;
}>;

/**
 * The storage port.
 *
 * Every method returns a result rather than throwing, so a route can fail closed
 * on a backend fault without a try/catch around business logic, and an adapter
 * cannot leak a driver error message into a response.
 */
export interface PrivateAccessSessionRepository {
  create(
    input: CreatePrivateAccessSessionInput,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession>>;
  /** A live session, or null for missing, expired, or revoked (indistinguishable). */
  resolve(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null>>;
  /** Records last-seen. NEVER slides expiry. Best-effort; callers ignore failure. */
  touch(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null>>;
  /** Idempotent. True when a row existed; the first revocation timestamp wins. */
  revoke(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<boolean>>;
  /** Housekeeping only. Expiry is enforced on read, never by this running. */
  pruneExpired(now: number): Promise<PrivateAccessSessionRepositoryResult<number>>;
}

// ---------------------------------------------------------------------------
// Hashing and validation
// ---------------------------------------------------------------------------

/**
 * The one place a raw token becomes a stored identifier.
 *
 * Lowercase hex SHA-256, which is exactly the shape the database check
 * constraint accepts. The token has 256 bits of entropy, so there is no
 * dictionary to precompute and no salt to add.
 */
export function hashPrivateAccessSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPrivateAccessSessionHash(value: unknown): value is string {
  return typeof value === "string" && LOWER_HEX_SHA256.test(value);
}

function validOwnerId(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_UUID.test(value);
}

function validInstant(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    Number(value) > 0 &&
    Number(value) <= JAVASCRIPT_DATE_MAX_MS
  );
}

/**
 * Compare two hashes without an early exit. Both are decoded to fixed 32-byte
 * buffers first, so a length difference cannot be observed either.
 */
function constantTimeHashEqual(left: string, right: string): boolean {
  if (!LOWER_HEX_SHA256.test(left) || !LOWER_HEX_SHA256.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== 32 || rightBuffer.length !== 32) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isLive(row: StoredPrivateAccessSession, now: number): boolean {
  if (row.revokedAtEpochMs !== null) return false;
  if (row.issuedAtEpochMs > now) return false;
  // A row with no recorded expiry is one the backend already declared live; the
  // in-memory store always records one, so this branch is the durable path only.
  return row.expiresAtEpochMs === null || now < row.expiresAtEpochMs;
}

// ---------------------------------------------------------------------------
// In-memory implementation
// ---------------------------------------------------------------------------

/**
 * The reference implementation.
 *
 * Used by tests and by any deployment that has not yet wired the durable store.
 * It enforces every invariant the database enforces, so a test that passes here
 * is exercising the same rules the migration applies.
 */
export class InMemoryPrivateAccessSessionRepository implements PrivateAccessSessionRepository {
  private readonly rows = new Map<string, StoredPrivateAccessSession>();

  constructor(private readonly limit: number = PRIVATE_ACCESS_SESSION_MEMORY_LIMIT) {}

  async create(
    input: CreatePrivateAccessSessionInput,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession>> {
    if (input === null || typeof input !== "object") return failure("INPUT_INVALID");
    if (!isPrivateAccessSessionHash(input.sessionHash)) return failure("SESSION_HASH_INVALID");
    if (!validOwnerId(input.ownerId)) return failure("INPUT_INVALID");
    if (!validInstant(input.issuedAt) || !validInstant(input.expiresAt)) {
      return failure("INPUT_INVALID");
    }
    if (input.expiresAt <= input.issuedAt) return failure("INPUT_INVALID");
    if (
      input.nonceHash !== undefined &&
      input.nonceHash !== null &&
      !isPrivateAccessSessionHash(input.nonceHash)
    ) {
      return failure("INPUT_INVALID");
    }
    if (this.rows.has(input.sessionHash)) return failure("CONFLICT");

    // Expired rows are reclaimed before the capacity rule is applied, so normal
    // traffic never trips the bound and a flood still cannot grow without limit.
    this.dropExpired(input.issuedAt);
    if (this.rows.size >= this.limit) return failure("CAPACITY_EXCEEDED");

    const row: StoredPrivateAccessSession = Object.freeze({
      sessionHash: input.sessionHash,
      ownerId: input.ownerId,
      accessRole: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
      issuedAtEpochMs: input.issuedAt,
      expiresAtEpochMs: input.expiresAt,
      revokedAtEpochMs: null,
      lastSeenAtEpochMs: null,
    });
    this.rows.set(row.sessionHash, row);
    return success(row);
  }

  async resolve(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null>> {
    const found = this.constantTimeFind(sessionHash, now);
    if (!found.ok) return found;
    return success(found.value);
  }

  async touch(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null>> {
    const found = this.constantTimeFind(sessionHash, now);
    if (!found.ok) return found;
    if (found.value === null) return success(null);
    // Expiry is copied forward unchanged. A session cannot be kept alive by
    // being used, which is what the database's exact-expiry check enforces.
    const touched: StoredPrivateAccessSession = Object.freeze({
      ...found.value,
      lastSeenAtEpochMs: now,
    });
    this.rows.set(touched.sessionHash, touched);
    return success(touched);
  }

  async revoke(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<boolean>> {
    if (!isPrivateAccessSessionHash(sessionHash)) return failure("SESSION_HASH_INVALID");
    if (!validInstant(now)) return failure("INPUT_INVALID");
    const existing = this.rows.get(sessionHash);
    if (!existing) return success(false);
    if (existing.revokedAtEpochMs === null) {
      this.rows.set(
        sessionHash,
        Object.freeze({ ...existing, revokedAtEpochMs: now }),
      );
    }
    // A second revocation reports the same answer and leaves the original
    // timestamp in place, matching the database's coalesce.
    return success(true);
  }

  async pruneExpired(now: number): Promise<PrivateAccessSessionRepositoryResult<number>> {
    if (!validInstant(now)) return failure("INPUT_INVALID");
    return success(this.dropExpired(now));
  }

  /** Test and diagnostic helper. Never used to make an authorization decision. */
  size(): number {
    return this.rows.size;
  }

  private dropExpired(now: number): number {
    let removed = 0;
    // Snapshot first: the map is mutated inside the loop.
    for (const [key, row] of Array.from(this.rows.entries())) {
      if (row.expiresAtEpochMs !== null && row.expiresAtEpochMs <= now) {
        this.rows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Walk every row, comparing hashes in constant time and never breaking early.
   * The liveness test is applied to the matched row only after the whole walk,
   * so neither the match position nor the expiry state is observable in timing.
   */
  private constantTimeFind(
    sessionHash: string,
    now: number,
  ): PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null> {
    if (!isPrivateAccessSessionHash(sessionHash)) return failure("SESSION_HASH_INVALID");
    if (!validInstant(now)) return failure("INPUT_INVALID");
    let matched: StoredPrivateAccessSession | null = null;
    for (const row of Array.from(this.rows.values())) {
      if (constantTimeHashEqual(row.sessionHash, sessionHash)) {
        matched = row;
      }
    }
    if (matched === null || !isLive(matched, now)) return success(null);
    return success(matched);
  }
}

// ---------------------------------------------------------------------------
// Supabase adapter
// ---------------------------------------------------------------------------

/** One database call. The adapter builds nothing else and issues no raw SQL. */
export type PrivateAccessSessionDatabaseCall = Readonly<{
  fn: PrivateAccessSessionRpcName;
  args: Readonly<Record<string, string>>;
}>;

/**
 * The injected executor.
 *
 * The Supabase client is deliberately NOT imported here. The integration lane
 * supplies a function that performs the RPC (for example
 * `client.rpc(call.fn, call.args)`) and returns its scalar result. That keeps
 * this adapter unit-testable with no database, no credential, and no network,
 * and keeps the service-role key out of this module entirely.
 */
export type PrivateAccessSessionQuery = (
  call: PrivateAccessSessionDatabaseCall,
) => Promise<unknown>;

export type SupabasePrivateAccessSessionRepositoryOptions = Readonly<{
  query: PrivateAccessSessionQuery;
  /**
   * The deployment-scoped owner for Private Early Access.
   *
   * The gate is one shared password, not per-person accounts, so every session
   * belongs to the same owner. Fixing it here means no request can influence
   * whose sessions are read or revoked: there is no owner field on the wire to
   * tamper with.
   */
  ownerId: string;
}>;

/**
 * The durable adapter, written against the migration exactly as it exists.
 *
 * Two operations are reported UNSUPPORTED rather than emulated, because the
 * migration deliberately does not provide them and inventing a table write
 * would require privileges the migration revokes from every role:
 *
 *   - `touch`: the read predicate performs no write and never slides expiry.
 *   - `pruneExpired`: expiry is enforced on every read by `session_active`;
 *     no delete function exists.
 *
 * Callers treat both as best-effort, so an UNSUPPORTED answer changes no
 * security decision.
 */
export class SupabasePrivateAccessSessionRepository implements PrivateAccessSessionRepository {
  private readonly query: PrivateAccessSessionQuery;
  private readonly ownerId: string;

  constructor(options: SupabasePrivateAccessSessionRepositoryOptions) {
    this.query = options.query;
    this.ownerId = options.ownerId;
  }

  /**
   * Register a one-time grant nonce, returning its database-authored expiry.
   *
   * Exposed separately because minting a session is a two-step exchange in the
   * migration: register a grant, then trade it atomically for a session.
   */
  async issueNonce(nonceHash: string): Promise<PrivateAccessSessionRepositoryResult<number>> {
    if (!isPrivateAccessSessionHash(nonceHash)) return failure("SESSION_HASH_INVALID");
    if (!validOwnerId(this.ownerId)) return failure("INPUT_INVALID");
    const raw = await this.call({
      fn: PRIVATE_ACCESS_SESSION_RPC.issueNonce,
      args: {
        p_nonce_hash: nonceHash,
        p_owner_id: this.ownerId,
        p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
      },
    });
    if (!raw.ok) return raw;
    const expiresAt = readTimestamp(raw.value);
    if (expiresAt === null) return failure("CONFLICT");
    return success(expiresAt);
  }

  async create(
    input: CreatePrivateAccessSessionInput,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession>> {
    if (input === null || typeof input !== "object") return failure("INPUT_INVALID");
    if (!isPrivateAccessSessionHash(input.sessionHash)) return failure("SESSION_HASH_INVALID");
    if (!validOwnerId(this.ownerId)) return failure("INPUT_INVALID");
    // The owner is adapter configuration. A caller asking for a different one is
    // refused rather than silently redirected to the configured owner.
    if (!validOwnerId(input.ownerId) || input.ownerId !== this.ownerId) {
      return failure("INPUT_INVALID");
    }
    if (!validInstant(input.issuedAt)) return failure("INPUT_INVALID");
    if (!isPrivateAccessSessionHash(input.nonceHash)) return failure("NONCE_REQUIRED");

    const raw = await this.call({
      fn: PRIVATE_ACCESS_SESSION_RPC.exchangeNonce,
      args: {
        p_nonce_hash: input.nonceHash,
        p_session_hash: input.sessionHash,
        p_owner_id: this.ownerId,
        p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
      },
    });
    if (!raw.ok) return raw;

    // NULL means the grant was missing, expired, already consumed, or belonged
    // to someone else. All four are one refusal; the database is the authority.
    const expiresAt = readTimestamp(raw.value);
    if (expiresAt === null) return failure("CONFLICT");

    // The database authors the expiry. The caller's requested value is not
    // trusted or echoed: an adapter that returned the request would let the
    // cookie outlive the row.
    return success(
      Object.freeze({
        sessionHash: input.sessionHash,
        ownerId: this.ownerId,
        accessRole: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
        issuedAtEpochMs: input.issuedAt,
        expiresAtEpochMs: expiresAt,
        revokedAtEpochMs: null,
        lastSeenAtEpochMs: null,
      }),
    );
  }

  async resolve(
    sessionHash: string,
    now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null>> {
    if (!isPrivateAccessSessionHash(sessionHash)) return failure("SESSION_HASH_INVALID");
    if (!validInstant(now)) return failure("INPUT_INVALID");
    if (!validOwnerId(this.ownerId)) return failure("INPUT_INVALID");

    const raw = await this.call({
      fn: PRIVATE_ACCESS_SESSION_RPC.sessionActive,
      args: {
        p_session_hash: sessionHash,
        p_owner_id: this.ownerId,
        p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
      },
    });
    if (!raw.ok) return raw;
    if (raw.value !== true) return success(null);

    // The predicate answers liveness only, so the exact stored expiry is not
    // available without a table read the migration forbids. The expiry is
    // reported as null rather than guessed, and the route omits it from the
    // response instead of publishing a number the database never said.
    return success(
      Object.freeze({
        sessionHash,
        ownerId: this.ownerId,
        accessRole: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
        issuedAtEpochMs: now,
        expiresAtEpochMs: null,
        revokedAtEpochMs: null,
        lastSeenAtEpochMs: null,
      }),
    );
  }

  async touch(
    _sessionHash: string,
    _now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<StoredPrivateAccessSession | null>> {
    return failure("UNSUPPORTED");
  }

  async revoke(
    sessionHash: string,
    _now: number,
  ): Promise<PrivateAccessSessionRepositoryResult<boolean>> {
    if (!isPrivateAccessSessionHash(sessionHash)) return failure("SESSION_HASH_INVALID");
    if (!validOwnerId(this.ownerId)) return failure("INPUT_INVALID");
    // The revocation timestamp is database time, and a repeat revocation is a
    // no-op there, so the injected clock is deliberately unused on this path.
    const raw = await this.call({
      fn: PRIVATE_ACCESS_SESSION_RPC.revokeSession,
      args: {
        p_session_hash: sessionHash,
        p_owner_id: this.ownerId,
        p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
      },
    });
    if (!raw.ok) return raw;
    return success(raw.value === true);
  }

  async pruneExpired(_now: number): Promise<PrivateAccessSessionRepositoryResult<number>> {
    return failure("UNSUPPORTED");
  }

  /**
   * Every call goes through here so a driver rejection becomes one opaque
   * failure code. The thrown error is discarded rather than wrapped: a
   * PostgREST message can carry the connection string, the function signature,
   * and the argument values.
   */
  private async call(
    call: PrivateAccessSessionDatabaseCall,
  ): Promise<PrivateAccessSessionRepositoryResult<unknown>> {
    try {
      return success(await this.query(call));
    } catch {
      return failure("BACKEND_UNAVAILABLE");
    }
  }
}

/**
 * Read a timestamptz result. Accepts the ISO string a PostgREST RPC returns and
 * a Date from a direct driver, and refuses anything else rather than coercing.
 */
function readTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
