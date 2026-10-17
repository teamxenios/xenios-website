import { describe, expect, it, vi } from "vitest";
import type { EarlyAccessConfig } from "./private-access-config";
import { hashPrivateAccessPassword } from "./private-access-password";
import {
  createLogoutRoute,
  createPrivateAccessAttemptLimiter,
  createSessionRoute,
  createUnlockRoute,
  PRIVATE_ACCESS_DEFAULT_OWNER_ID,
  PRIVATE_ACCESS_INVALID_CREDENTIALS,
  PRIVATE_ACCESS_PRIVATE_HEADERS,
  type PrivateAccessCookiePort,
  type PrivateAccessResponsePort,
  type PrivateAccessRouteDependencies,
} from "./private-access-routes";
import {
  hashPrivateAccessSessionToken,
  InMemoryPrivateAccessSessionRepository,
  type CreatePrivateAccessSessionInput,
  type PrivateAccessSessionRepository,
} from "./private-access-session-repository";

const PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "correct horse battery stapl3";
// A real scrypt hash at the minimum accepted cost, so the default verifier is
// exercised for real without making the suite slow.
const PASSWORD_HASH = hashPrivateAccessPassword(PASSWORD, { n: 16_384 });
const SESSION_SECRET = "private-early-access-session-secret-0123456789";
const START = Date.UTC(2026, 0, 1);

const BASE_CONFIG: EarlyAccessConfig = Object.freeze({
  enabled: true,
  passwordHash: PASSWORD_HASH,
  sessionSecret: SESSION_SECRET,
  sessionTtlMinutes: 15,
  sessionTtlClampedFrom: null,
  maxAttempts: 3,
  lockoutMinutes: 5,
  cookieName: null,
  problems: Object.freeze([]),
});

function makeConfig(overrides: Partial<EarlyAccessConfig> = {}): EarlyAccessConfig {
  return Object.freeze({ ...BASE_CONFIG, ...overrides }) as EarlyAccessConfig;
}

// The three shut-gate configurations, each indistinguishable from the others.
const FLAG_OFF = makeConfig({ enabled: false });
const HASH_MISSING = makeConfig({
  enabled: false,
  passwordHash: "",
  problems: Object.freeze(["PASSWORD_HASH_MISSING" as const]),
});
const HASH_MALFORMED = makeConfig({
  enabled: false,
  passwordHash: "scrypt$32768$8$1$not-base64url$also-not",
  problems: Object.freeze(["PASSWORD_HASH_INVALID" as const]),
});

type Recorded = {
  headers: Record<string, string>;
  status: number | null;
  body: unknown;
};

function makeResponse(): { port: PrivateAccessResponsePort; recorded: Recorded } {
  const recorded: Recorded = { headers: {}, status: null, body: undefined };
  const port: PrivateAccessResponsePort = {
    setHeader(name: string, value: string) {
      recorded.headers[name] = value;
      return undefined;
    },
    status(code: number) {
      recorded.status = code;
      return undefined;
    },
    json(body: unknown) {
      recorded.body = body;
      return undefined;
    },
  };
  return { port, recorded };
}

function tokenFor(seed: number): string {
  const bytes = Buffer.alloc(32, 7);
  bytes.writeUInt32LE(seed >>> 0, 0);
  return bytes.toString("base64url");
}

/** The Set-Cookie's first segment is already a valid Cookie request header. */
function cookieHeaderFrom(setCookie: string): string {
  return setCookie.split(";")[0];
}

/** The signed cookie carries the opaque handle as its third dot-segment. */
function handleFrom(setCookie: string): string {
  return cookieHeaderFrom(setCookie).split("=").slice(1).join("=").split(".")[2];
}

type Harness = {
  deps: PrivateAccessRouteDependencies;
  repository: InMemoryPrivateAccessSessionRepository;
  clock: { value: number };
  verifyPassword: ReturnType<typeof vi.fn>;
  randomToken: ReturnType<typeof vi.fn>;
  logger: { warn: ReturnType<typeof vi.fn> };
};

function makeHarness(overrides: Partial<PrivateAccessRouteDependencies> = {}): Harness {
  const repository = new InMemoryPrivateAccessSessionRepository();
  const clock = { value: START };
  const verifyPassword = vi.fn((presented: unknown) => presented === PASSWORD);
  let seed = 0;
  const randomToken = vi.fn(() => {
    seed += 1;
    return tokenFor(seed);
  });
  const logger = { warn: vi.fn() };
  const deps: PrivateAccessRouteDependencies = {
    config: makeConfig(),
    repository,
    now: () => clock.value,
    randomToken,
    logger,
    verifyPassword,
    ...overrides,
  };
  return { deps, repository, clock, verifyPassword, randomToken, logger };
}

/** Wraps the real store so one operation can be made to fail or throw. */
function withRepositoryOverrides(
  inner: PrivateAccessSessionRepository,
  overrides: Partial<PrivateAccessSessionRepository>,
): PrivateAccessSessionRepository {
  return {
    create: (input: CreatePrivateAccessSessionInput) =>
      (overrides.create ?? inner.create.bind(inner))(input),
    resolve: (hash: string, now: number) => (overrides.resolve ?? inner.resolve.bind(inner))(hash, now),
    touch: (hash: string, now: number) => (overrides.touch ?? inner.touch.bind(inner))(hash, now),
    revoke: (hash: string, now: number) => (overrides.revoke ?? inner.revoke.bind(inner))(hash, now),
    pruneExpired: (now: number) => (overrides.pruneExpired ?? inner.pruneExpired.bind(inner))(now),
  };
}

/** A codec whose lifetime is whatever the caller requested. */
function requestHonouringCookiePort(
  distort: (ttlSeconds: number) => { expiresDeltaSeconds: number; maxAgeSeconds: number } = (
    ttlSeconds,
  ) => ({ expiresDeltaSeconds: ttlSeconds, maxAgeSeconds: ttlSeconds }),
): PrivateAccessCookiePort {
  return {
    issue({ sessionHandle, now, ttlSeconds }) {
      const { expiresDeltaSeconds, maxAgeSeconds } = distort(ttlSeconds);
      const issuedAtSeconds = Math.floor(now / 1_000);
      return Object.freeze({
        ok: true as const,
        setCookie: `__Host-XeniosPrivateEarlyAccess=${sessionHandle}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`,
        expiresAtEpochMs: (issuedAtSeconds + expiresDeltaSeconds) * 1_000,
        maxAgeSeconds,
      });
    },
    read({ cookieHeader }) {
      if (typeof cookieHeader !== "string") return Object.freeze({ ok: false as const });
      const value = cookieHeader.split("=").slice(1).join("=");
      return value.length > 0
        ? Object.freeze({ ok: true as const, sessionHandle: value })
        : Object.freeze({ ok: false as const });
    },
    clear() {
      return "__Host-XeniosPrivateEarlyAccess=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
    },
  };
}

// ---------------------------------------------------------------------------
// Fail closed, and fail identically
// ---------------------------------------------------------------------------

describe("unlock: one indistinguishable failure", () => {
  async function unlockOnce(
    config: EarlyAccessConfig,
    password: string,
  ): Promise<Recorded & { verifyCalls: number }> {
    const harness = makeHarness({ config });
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password }, clientKey: "203.0.113.7" }, port);
    return { ...recorded, verifyCalls: harness.verifyPassword.mock.calls.length };
  }

  it("answers the flag being off, the hash missing, the hash malformed, and a wrong password identically", async () => {
    const flagOff = await unlockOnce(FLAG_OFF, PASSWORD);
    const hashMissing = await unlockOnce(HASH_MISSING, PASSWORD);
    const hashMalformed = await unlockOnce(HASH_MALFORMED, PASSWORD);
    const wrongPassword = await unlockOnce(makeConfig(), WRONG_PASSWORD);

    const visible = (value: Recorded) => ({
      status: value.status,
      body: value.body,
      headers: value.headers,
    });
    expect(visible(flagOff)).toEqual(visible(hashMissing));
    expect(visible(flagOff)).toEqual(visible(hashMalformed));
    expect(visible(flagOff)).toEqual(visible(wrongPassword));
    expect(visible(flagOff)).toEqual({
      status: 401,
      body: PRIVATE_ACCESS_INVALID_CREDENTIALS,
      headers: Object.fromEntries(PRIVATE_ACCESS_PRIVATE_HEADERS.map(([k, v]) => [k, v])),
    });
  });

  it("never checks the password when the gate is shut, even if it is correct", async () => {
    for (const config of [FLAG_OFF, HASH_MISSING, HASH_MALFORMED]) {
      const result = await unlockOnce(config, PASSWORD);
      expect(result.verifyCalls).toBe(0);
    }
  });

  it("never reaches the store or the token source when the gate is shut", async () => {
    const harness = makeHarness({ config: FLAG_OFF });
    const route = createUnlockRoute(harness.deps);
    const { port } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "203.0.113.7" }, port);
    expect(harness.randomToken).not.toHaveBeenCalled();
    expect(harness.repository.size()).toBe(0);
  });

  it("sets no cookie on any refusal", async () => {
    const flagOff = await unlockOnce(FLAG_OFF, PASSWORD);
    const wrong = await unlockOnce(makeConfig(), WRONG_PASSWORD);
    expect(flagOff.headers["Set-Cookie"]).toBeUndefined();
    expect(wrong.headers["Set-Cookie"]).toBeUndefined();
  });

  it("refuses a body that carries no usable password, without an exception", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    for (const body of [undefined, null, "a string", {}, { password: 42 }, { password: "" }]) {
      const { port, recorded } = makeResponse();
      await route({ body, clientKey: "203.0.113.9" }, port);
      expect(recorded.status).toBe(401);
      expect(recorded.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    }
  });
});

// ---------------------------------------------------------------------------
// Rate limiting and lockout
// ---------------------------------------------------------------------------

describe("unlock: rate limit and lockout", () => {
  it("refuses the CORRECT password once the client is locked out, without checking it", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    const key = "198.51.100.4";

    for (let attempt = 0; attempt < BASE_CONFIG.maxAttempts; attempt += 1) {
      const { port, recorded } = makeResponse();
      await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, port);
      expect(recorded.status).toBe(401);
    }
    expect(harness.verifyPassword).toHaveBeenCalledTimes(BASE_CONFIG.maxAttempts);

    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: key }, port);
    expect(recorded.status).toBe(401);
    expect(recorded.headers["Set-Cookie"]).toBeUndefined();
    // The verifier was not reached: the lockout is enforced before any work.
    expect(harness.verifyPassword).toHaveBeenCalledTimes(BASE_CONFIG.maxAttempts);
  });

  it("answers a lockout exactly as it answers a wrong password", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);

    const wrong = makeResponse();
    await route({ body: { password: WRONG_PASSWORD }, clientKey: "198.51.100.5" }, wrong.port);

    const key = "198.51.100.6";
    for (let attempt = 0; attempt < BASE_CONFIG.maxAttempts; attempt += 1) {
      await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, makeResponse().port);
    }
    const locked = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: key }, locked.port);

    expect(locked.recorded).toEqual(wrong.recorded);
  });

  it("releases the lockout after config.lockoutMinutes and then admits the correct password", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    const key = "198.51.100.7";

    for (let attempt = 0; attempt < BASE_CONFIG.maxAttempts; attempt += 1) {
      await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, makeResponse().port);
    }
    const stillLocked = makeResponse();
    harness.clock.value = START + BASE_CONFIG.lockoutMinutes * 60_000 - 1;
    await route({ body: { password: PASSWORD }, clientKey: key }, stillLocked.port);
    expect(stillLocked.recorded.status).toBe(401);

    const released = makeResponse();
    harness.clock.value = START + BASE_CONFIG.lockoutMinutes * 60_000;
    await route({ body: { password: PASSWORD }, clientKey: key }, released.port);
    expect(released.recorded.status).toBe(200);
    expect(released.recorded.headers["Set-Cookie"]).toBeDefined();
  });

  it("locks one client without locking another", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    for (let attempt = 0; attempt < BASE_CONFIG.maxAttempts; attempt += 1) {
      await route({ body: { password: WRONG_PASSWORD }, clientKey: "a" }, makeResponse().port);
    }
    const other = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "b" }, other.port);
    expect(other.recorded.status).toBe(200);
  });

  it("clears a client's failure budget on success", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    const key = "198.51.100.8";
    await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, makeResponse().port);
    await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, makeResponse().port);
    await route({ body: { password: PASSWORD }, clientKey: key }, makeResponse().port);
    // Two further failures would have tripped the limit had the budget survived.
    await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, makeResponse().port);
    await route({ body: { password: WRONG_PASSWORD }, clientKey: key }, makeResponse().port);
    const stillOpen = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: key }, stillOpen.port);
    expect(stillOpen.recorded.status).toBe(200);
  });

  it("fails closed when the caller supplies no client identity", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    for (const clientKey of [undefined, null, "", "   ", 7, "x".repeat(257)]) {
      const { port, recorded } = makeResponse();
      await route({ body: { password: PASSWORD }, clientKey }, port);
      expect(recorded.status).toBe(401);
      expect(recorded.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    }
    expect(harness.verifyPassword).not.toHaveBeenCalled();
  });

  it("keeps rate limiting under a key flood rather than evicting a live lockout", () => {
    const limiter = createPrivateAccessAttemptLimiter({
      maxAttempts: 1,
      lockoutMinutes: 5,
      maxKeys: 2,
    });
    limiter.recordFailure("victim", START);
    expect(limiter.isLocked("victim", START)).toBe(true);
    limiter.recordFailure("filler", START);
    // Capacity is now exhausted by locked keys, so a fresh key is refused rather
    // than admitted by evicting somebody's live lockout.
    expect(limiter.isLocked("flood-1", START)).toBe(true);
    expect(limiter.isLocked("victim", START)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Secret containment
// ---------------------------------------------------------------------------

describe("unlock: nothing secret escapes", () => {
  it("keeps the password and the stored hash out of every response and log", async () => {
    // The REAL verifier and the REAL hash, so this is not a property of the stub.
    const harness = makeHarness({ verifyPassword: undefined });
    const deps: PrivateAccessRouteDependencies = { ...harness.deps, verifyPassword: undefined };
    const route = createUnlockRoute(deps);

    const observed: string[] = [];
    for (const [password, key] of [
      [WRONG_PASSWORD, "k1"],
      [PASSWORD, "k2"],
    ] as const) {
      const { port, recorded } = makeResponse();
      await route({ body: { password }, clientKey: key }, port);
      observed.push(JSON.stringify(recorded));
    }
    observed.push(JSON.stringify(harness.logger.warn.mock.calls));

    const digest = PASSWORD_HASH.split("$").pop() as string;
    for (const text of observed) {
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(WRONG_PASSWORD);
      expect(text).not.toContain(PASSWORD_HASH);
      expect(text).not.toContain(digest);
      expect(text).not.toContain(SESSION_SECRET);
    }
  });

  it("keeps the raw session token out of the body and the store, and only in the cookie", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);

    const token = tokenFor(1);
    expect(JSON.stringify(recorded.body)).not.toContain(token);
    // The cookie is where the token belongs, and nowhere else.
    expect(recorded.headers["Set-Cookie"]).toContain(token);

    const stored = await harness.repository.resolve(
      hashPrivateAccessSessionToken(token),
      harness.clock.value,
    );
    expect(stored.ok && stored.value?.sessionHash).toBe(hashPrivateAccessSessionToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});

// ---------------------------------------------------------------------------
// Cookie and expiry synchronization
// ---------------------------------------------------------------------------

describe("unlock: the cookie and the row agree", () => {
  it("sets HttpOnly, Secure, SameSite, Path, and Max-Age", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    const setCookie = recorded.headers["Set-Cookie"];
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toMatch(/Max-Age=\d+/);
  });

  it("synchronizes Max-Age to the SAME resolved lifetime as the database row", async () => {
    const harness = makeHarness();
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);

    const maxAgeSeconds = Number(/Max-Age=(\d+)/.exec(recorded.headers["Set-Cookie"])?.[1]);
    const stored = await harness.repository.resolve(
      hashPrivateAccessSessionToken(handleFrom(recorded.headers["Set-Cookie"])),
      harness.clock.value,
    );
    const row = stored.ok ? stored.value : null;
    const rowLifetimeSeconds = ((row?.expiresAtEpochMs ?? 0) - (row?.issuedAtEpochMs ?? 0)) / 1_000;
    expect(maxAgeSeconds).toBe(rowLifetimeSeconds);
    expect(maxAgeSeconds).toBe(BASE_CONFIG.sessionTtlMinutes * 60);
    // The advertised expiry is the cookie's own, not a separate number.
    expect((recorded.body as { expiresAt: string }).expiresAt).toBe(
      new Date(row?.expiresAtEpochMs as number).toISOString(),
    );
  });

  it("tracks a longer configured TTL with no hardcoded duration", async () => {
    // The ceiling is a property of the config module and the codec, not of these
    // handlers: at 240 minutes the cookie and the row still agree exactly.
    const harness = makeHarness({
      config: makeConfig({ sessionTtlMinutes: 240 }),
      cookies: requestHonouringCookiePort(),
    });
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);

    expect(recorded.status).toBe(200);
    const maxAgeSeconds = Number(/Max-Age=(\d+)/.exec(recorded.headers["Set-Cookie"])?.[1]);
    expect(maxAgeSeconds).toBe(240 * 60);
    const stored = await harness.repository.resolve(
      hashPrivateAccessSessionToken(tokenFor(1)),
      harness.clock.value,
    );
    const row = stored.ok ? stored.value : null;
    expect(((row?.expiresAtEpochMs ?? 0) - (row?.issuedAtEpochMs ?? 0)) / 1_000).toBe(240 * 60);
  });

  it("refuses and revokes when the cookie would outlive the row", async () => {
    const harness = makeHarness({
      cookies: requestHonouringCookiePort((ttl) => ({
        expiresDeltaSeconds: ttl + 3_600,
        maxAgeSeconds: ttl + 3_600,
      })),
    });
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);

    expect(recorded.status).toBe(401);
    expect(recorded.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    expect(recorded.headers["Set-Cookie"]).toBeUndefined();
    // The row written a moment earlier is revoked, not left orphaned and usable.
    const stored = await harness.repository.resolve(
      hashPrivateAccessSessionToken(tokenFor(1)),
      harness.clock.value,
    );
    expect(stored).toEqual({ ok: true, value: null });
  });

  it("refuses when Max-Age disagrees with the cookie's own sealed expiry", async () => {
    const harness = makeHarness({
      cookies: requestHonouringCookiePort((ttl) => ({
        expiresDeltaSeconds: ttl,
        maxAgeSeconds: ttl * 2,
      })),
    });
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    expect(recorded.status).toBe(401);
    expect(recorded.headers["Set-Cookie"]).toBeUndefined();
  });

  it("uses the configured owner and never one from a request", async () => {
    const harness = makeHarness();
    const seen: CreatePrivateAccessSessionInput[] = [];
    const repository = withRepositoryOverrides(harness.repository, {
      create: async (input) => {
        seen.push(input);
        return harness.repository.create(input);
      },
    });
    const route = createUnlockRoute({ ...harness.deps, repository });
    await route(
      { body: { password: PASSWORD, ownerId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }, clientKey: "k" },
      makeResponse().port,
    );
    expect(seen[0]?.ownerId).toBe(PRIVATE_ACCESS_DEFAULT_OWNER_ID);
  });
});

// ---------------------------------------------------------------------------
// Post-authentication faults answer like a refusal
// ---------------------------------------------------------------------------

describe("unlock: infrastructure faults are not an oracle", () => {
  it("refuses generically when the token source is not a canonical opaque token", async () => {
    const harness = makeHarness({ randomToken: () => "too-short" });
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    expect(recorded.status).toBe(401);
    expect(recorded.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    expect(recorded.headers["Set-Cookie"]).toBeUndefined();
    expect(harness.repository.size()).toBe(0);
  });

  it("refuses generically when the store refuses the write", async () => {
    const harness = makeHarness();
    const repository = withRepositoryOverrides(harness.repository, {
      create: async () => ({ ok: false, code: "BACKEND_UNAVAILABLE" }) as const,
    });
    const route = createUnlockRoute({ ...harness.deps, repository });
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    expect(recorded.status).toBe(401);
    expect(recorded.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    expect(recorded.headers["Set-Cookie"]).toBeUndefined();
  });

  it("refuses generically when the store throws", async () => {
    const harness = makeHarness();
    const repository = withRepositoryOverrides(harness.repository, {
      create: async () => {
        throw new Error("connection refused postgres://user:hunter2@db");
      },
    });
    const route = createUnlockRoute({ ...harness.deps, repository });
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    expect(recorded.status).toBe(401);
    expect(recorded.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    expect(JSON.stringify(recorded)).not.toContain("hunter2");
  });

  it("refuses generically when the injected clock is unusable", async () => {
    const harness = makeHarness({
      now: () => {
        throw new Error("clock");
      },
    });
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    expect(recorded.status).toBe(401);
    expect(harness.verifyPassword).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Session read
// ---------------------------------------------------------------------------

describe("session read", () => {
  async function unlock(harness: Harness): Promise<string> {
    const route = createUnlockRoute(harness.deps);
    const { port, recorded } = makeResponse();
    await route({ body: { password: PASSWORD }, clientKey: "k" }, port);
    return cookieHeaderFrom(recorded.headers["Set-Cookie"]);
  }

  it("reports a live session with its expiry and nothing else", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const { port, recorded } = makeResponse();
    await createSessionRoute(harness.deps)({ cookieHeader }, port);

    expect(recorded.status).toBe(200);
    expect(Object.keys(recorded.body as object).sort()).toEqual(["authenticated", "expiresAt"]);
    expect((recorded.body as { authenticated: boolean }).authenticated).toBe(true);
    // No handle, hash, owner, role, or reason reaches the client.
    const serialized = JSON.stringify(recorded.body);
    expect(serialized).not.toContain(tokenFor(1));
    expect(serialized).not.toContain(hashPrivateAccessSessionToken(tokenFor(1)));
    expect(serialized).not.toContain(PRIVATE_ACCESS_DEFAULT_OWNER_ID);
  });

  it("reports no session for a missing, malformed, or foreign cookie", async () => {
    const harness = makeHarness();
    const route = createSessionRoute(harness.deps);
    const foreign = makeHarness({ config: makeConfig({ sessionSecret: `${SESSION_SECRET}-other` }) });
    const foreignCookie = await unlock(foreign);

    for (const cookieHeader of [undefined, "", "unrelated=1", "__Host-XeniosPrivateEarlyAccess=nope", foreignCookie]) {
      const { port, recorded } = makeResponse();
      await route({ cookieHeader }, port);
      expect(recorded.body).toEqual({ authenticated: false });
      expect(recorded.status).toBe(200);
    }
  });

  it("reports no session once the row has expired", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    harness.clock.value = START + BASE_CONFIG.sessionTtlMinutes * 60_000;
    const { port, recorded } = makeResponse();
    await createSessionRoute(harness.deps)({ cookieHeader }, port);
    expect(recorded.body).toEqual({ authenticated: false });
  });

  it("reports no session once the row has been revoked, even with a valid cookie", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    await harness.repository.revoke(
      hashPrivateAccessSessionToken(tokenFor(1)),
      harness.clock.value,
    );
    const { port, recorded } = makeResponse();
    await createSessionRoute(harness.deps)({ cookieHeader }, port);
    expect(recorded.body).toEqual({ authenticated: false });
  });

  it("reports no session when the gate is shut, without consulting the store", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const resolve = vi.fn();
    const repository = withRepositoryOverrides(harness.repository, { resolve });
    const { port, recorded } = makeResponse();
    await createSessionRoute({ ...harness.deps, config: FLAG_OFF, repository })({ cookieHeader }, port);
    expect(recorded.body).toEqual({ authenticated: false });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("omits the expiry when the durable store cannot state one", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const repository = withRepositoryOverrides(harness.repository, {
      resolve: async (sessionHash) =>
        ({
          ok: true,
          value: {
            sessionHash,
            ownerId: PRIVATE_ACCESS_DEFAULT_OWNER_ID,
            accessRole: "private_early_access_member",
            issuedAtEpochMs: START,
            expiresAtEpochMs: null,
            revokedAtEpochMs: null,
            lastSeenAtEpochMs: null,
          },
        }) as const,
    });
    const { port, recorded } = makeResponse();
    await createSessionRoute({ ...harness.deps, repository })({ cookieHeader }, port);
    expect(recorded.body).toEqual({ authenticated: true });
  });

  it("is unaffected by a touch that fails or throws, and touch never extends the session", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const repository = withRepositoryOverrides(harness.repository, {
      touch: async () => {
        throw new Error("unsupported");
      },
    });
    const route = createSessionRoute({ ...harness.deps, repository });

    const first = makeResponse();
    await route({ cookieHeader }, first.port);
    expect((first.recorded.body as { authenticated: boolean }).authenticated).toBe(true);

    // Used repeatedly right up to the boundary, then still expired on schedule.
    harness.clock.value = START + BASE_CONFIG.sessionTtlMinutes * 60_000 - 1;
    await route({ cookieHeader }, makeResponse().port);
    harness.clock.value = START + BASE_CONFIG.sessionTtlMinutes * 60_000;
    const last = makeResponse();
    await route({ cookieHeader }, last.port);
    expect(last.recorded.body).toEqual({ authenticated: false });
  });

  it("reports no session when the store throws", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const repository = withRepositoryOverrides(harness.repository, {
      resolve: async () => {
        throw new Error("down");
      },
    });
    const { port, recorded } = makeResponse();
    await createSessionRoute({ ...harness.deps, repository })({ cookieHeader }, port);
    expect(recorded.body).toEqual({ authenticated: false });
  });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

describe("logout", () => {
  async function unlock(harness: Harness): Promise<string> {
    const { port, recorded } = makeResponse();
    await createUnlockRoute(harness.deps)({ body: { password: PASSWORD }, clientKey: "k" }, port);
    return cookieHeaderFrom(recorded.headers["Set-Cookie"]);
  }

  it("revokes the row and expires the cookie", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const { port, recorded } = makeResponse();
    await createLogoutRoute(harness.deps)({ cookieHeader }, port);

    expect(recorded.status).toBe(200);
    expect(recorded.body).toEqual({ ok: true });
    expect(recorded.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(recorded.headers["Set-Cookie"]).toContain("HttpOnly");

    const stored = await harness.repository.resolve(
      hashPrivateAccessSessionToken(tokenFor(1)),
      harness.clock.value,
    );
    expect(stored).toEqual({ ok: true, value: null });
  });

  it("is idempotent: repeating it, and calling it with no session, answer the same", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const route = createLogoutRoute(harness.deps);

    const first = makeResponse();
    await route({ cookieHeader }, first.port);
    const second = makeResponse();
    await route({ cookieHeader }, second.port);
    const never = makeResponse();
    await route({ cookieHeader: undefined }, never.port);

    expect(second.recorded).toEqual(first.recorded);
    expect(never.recorded).toEqual(first.recorded);
  });

  it("still expires the cookie when the gate is shut or the store is broken", async () => {
    const harness = makeHarness();
    const cookieHeader = await unlock(harness);
    const repository = withRepositoryOverrides(harness.repository, {
      revoke: async () => {
        throw new Error("down");
      },
    });

    const shut = makeResponse();
    await createLogoutRoute({ ...harness.deps, config: FLAG_OFF })({ cookieHeader }, shut.port);
    expect(shut.recorded.status).toBe(200);
    expect(shut.recorded.headers["Set-Cookie"]).toContain("Max-Age=0");

    const broken = makeResponse();
    await createLogoutRoute({ ...harness.deps, repository })({ cookieHeader }, broken.port);
    expect(broken.recorded.status).toBe(200);
    expect(broken.recorded.headers["Set-Cookie"]).toContain("Max-Age=0");
  });
});

// ---------------------------------------------------------------------------
// Headers and the round trip
// ---------------------------------------------------------------------------

describe("every response is private", () => {
  it("carries the four private headers on success and on refusal, from all three routes", async () => {
    const harness = makeHarness();
    const unlockRoute = createUnlockRoute(harness.deps);
    const sessionRoute = createSessionRoute(harness.deps);
    const logoutRoute = createLogoutRoute(harness.deps);

    const success = makeResponse();
    await unlockRoute({ body: { password: PASSWORD }, clientKey: "k" }, success.port);
    const cookieHeader = cookieHeaderFrom(success.recorded.headers["Set-Cookie"]);

    const refusal = makeResponse();
    await unlockRoute({ body: { password: WRONG_PASSWORD }, clientKey: "k2" }, refusal.port);

    const live = makeResponse();
    await sessionRoute({ cookieHeader }, live.port);
    const anonymous = makeResponse();
    await sessionRoute({ cookieHeader: undefined }, anonymous.port);
    const ended = makeResponse();
    await logoutRoute({ cookieHeader }, ended.port);

    for (const recorded of [success, refusal, live, anonymous, ended].map((r) => r.recorded)) {
      for (const [name, value] of PRIVATE_ACCESS_PRIVATE_HEADERS) {
        expect(recorded.headers[name]).toBe(value);
      }
    }
  });

  it("runs the whole loop: unlock, authenticated, logout, no longer authenticated", async () => {
    const harness = makeHarness();
    const unlockRoute = createUnlockRoute(harness.deps);
    const sessionRoute = createSessionRoute(harness.deps);
    const logoutRoute = createLogoutRoute(harness.deps);

    const unlocked = makeResponse();
    await unlockRoute({ body: { password: PASSWORD }, clientKey: "k" }, unlocked.port);
    expect(unlocked.recorded.status).toBe(200);
    const cookieHeader = cookieHeaderFrom(unlocked.recorded.headers["Set-Cookie"]);

    const before = makeResponse();
    await sessionRoute({ cookieHeader }, before.port);
    expect((before.recorded.body as { authenticated: boolean }).authenticated).toBe(true);

    await logoutRoute({ cookieHeader }, makeResponse().port);

    const after = makeResponse();
    await sessionRoute({ cookieHeader }, after.port);
    expect(after.recorded.body).toEqual({ authenticated: false });
  });
});
