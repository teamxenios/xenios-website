import { describe, expect, it } from "vitest";

import {
  decideEarlyAccessAdapter,
  hashToStorageHex,
  isGrantIssuingRepository,
  mintDurableSession,
  type GrantIssuingRepository,
} from "./durable-session";
import { InMemoryPrivateAccessSessionRepository } from "./private-access-session-repository";

const OWNER = "00000000-0000-4000-8000-000000000001";
const NOW = 1_800_000_000_000;
const TTL = 240 * 60;

/**
 * A fake standing in for the real database exchange. It enforces the same
 * invariants the SQL function does, so the orchestration can be proven without
 * a live PostgreSQL: a grant must exist, be unconsumed, and is consumed
 * atomically on first use.
 */
function fakeDurableRepository() {
  const grants = new Map<string, { consumed: boolean }>();
  const sessions = new Map<string, { expiresAt: number }>();
  let exchangeAttempts = 0;
  const repository: GrantIssuingRepository = {
    async issueNonce(nonceHash: string) {
      grants.set(nonceHash, { consumed: false });
      return Object.freeze({ ok: true as const, value: NOW + 5 * 60 * 1_000 });
    },
    async create(input: any) {
      exchangeAttempts += 1;
      const grant = grants.get(input.nonceHash);
      if (!grant || grant.consumed) return Object.freeze({ ok: false as const, code: "NONCE_REQUIRED" as const });
      grant.consumed = true;
      sessions.set(input.sessionHash, { expiresAt: input.expiresAt });
      return Object.freeze({
        ok: true as const,
        value: { sessionHash: input.sessionHash, expiresAt: input.expiresAt },
      });
    },
    async resolve(sessionHash: string) {
      const found = sessions.get(sessionHash);
      return found
        ? Object.freeze({ ok: true as const, value: { sessionHash, expiresAt: found.expiresAt } })
        : Object.freeze({ ok: false as const, code: "NOT_FOUND" as const });
    },
    async touch() {
      return Object.freeze({ ok: true as const, value: undefined as never });
    },
    async revoke() {
      return Object.freeze({ ok: true as const, value: undefined as never });
    },
    async pruneExpired() {
      return Object.freeze({ ok: true as const, value: 0 });
    },
  } as unknown as GrantIssuingRepository;
  return { repository, grants, sessions, attempts: () => exchangeAttempts };
}

describe("durable session minting via the grant-nonce exchange", () => {
  it("mints a session and returns a token the caller can put in the cookie", async () => {
    const { repository, sessions } = fakeDurableRepository();
    const result = await mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token.length).toBe(43);
    expect(result.expiresAtEpochMs).toBe(NOW + TTL * 1_000);
    // The database holds only the HASH of the token, never the token itself.
    expect(sessions.has(hashToStorageHex(result.token))).toBe(true);
    expect([...sessions.keys()]).not.toContain(result.token);
  });

  it("registers only the HASH of the grant nonce, never the nonce", async () => {
    const { repository, grants } = fakeDurableRepository();
    const result = await mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL });
    expect(result.ok).toBe(true);
    for (const key of grants.keys()) {
      // 64 lowercase hex, the exact shape the SQL validates.
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("uses INDEPENDENT randomness for the grant and the session token", async () => {
    // A session token derived from the grant would make a leaked grant enough
    // to predict the session.
    const issued: string[] = [];
    const { repository } = fakeDurableRepository();
    const result = await mintDurableSession({
      repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL,
      randomToken: () => {
        const value = `token-${issued.length}`.padEnd(43, "x");
        issued.push(value);
        return value;
      },
    });
    expect(result.ok).toBe(true);
    expect(issued).toHaveLength(2);
    expect(issued[0]).not.toBe(issued[1]);
  });

  it("REFUSES when the same value is drawn for grant and token", async () => {
    const { repository } = fakeDurableRepository();
    const result = await mintDurableSession({
      repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL,
      randomToken: () => "identical-value".padEnd(43, "x"),
    });
    expect(result.ok).toBe(false);
  });

  it("a grant is single use: a replayed exchange creates no second session", async () => {
    const { repository, grants, sessions } = fakeDurableRepository();
    const first = await mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL });
    expect(first.ok).toBe(true);
    const before = sessions.size;
    // Replay the consumed grant directly against the exchange.
    const consumedHash = [...grants.keys()][0];
    const replay = await (repository as any).create({
      sessionHash: hashToStorageHex("another-token"),
      ownerId: OWNER,
      issuedAt: NOW,
      expiresAt: NOW + TTL * 1_000,
      nonceHash: consumedHash,
    });
    expect(replay.ok).toBe(false);
    expect(sessions.size).toBe(before);
  });

  it("concurrent mints each get their own grant and produce distinct sessions", async () => {
    const { repository, sessions } = fakeDurableRepository();
    const results = await Promise.all([
      mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL }),
      mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL }),
      mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(sessions.size).toBe(3);
  });

  it("fails closed when grant registration fails, and mints nothing", async () => {
    const { repository, sessions } = fakeDurableRepository();
    (repository as any).issueNonce = async () => Object.freeze({ ok: false as const, code: "RPC_FAILED" });
    const result = await mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GRANT_REGISTRATION_FAILED");
    expect(sessions.size).toBe(0);
  });

  it("fails closed when the exchange refuses, and returns no token", async () => {
    const { repository } = fakeDurableRepository();
    (repository as any).create = async () => Object.freeze({ ok: false as const, code: "NONCE_REQUIRED" });
    const result = await mintDurableSession({ repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("EXCHANGE_FAILED");
    expect(JSON.stringify(result)).not.toMatch(/token/i);
  });

  it("refuses a malformed clock or TTL rather than minting an odd session", async () => {
    const { repository } = fakeDurableRepository();
    for (const bad of [{ now: 0 }, { now: -1 }, { now: 1.5 }, { ttlSeconds: 0 }, { ttlSeconds: -60 }]) {
      const result = await mintDurableSession({
        repository, ownerId: OWNER, now: NOW, ttlSeconds: TTL, ...bad,
      } as never);
      expect(result.ok).toBe(false);
    }
  });
});

describe("the in-memory store can never be the production store", () => {
  it("BLOCKS production when Early Access is enabled without a durable store", () => {
    const decision = decideEarlyAccessAdapter({
      isProduction: true, earlyAccessEnabled: true, durableAvailable: false,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/durable/i);
  });

  it("allows production with a durable store", () => {
    const decision = decideEarlyAccessAdapter({
      isProduction: true, earlyAccessEnabled: true, durableAvailable: true,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.durable).toBe(true);
  });

  it("allows production while the gate is DISABLED, since nobody can reach it", () => {
    const decision = decideEarlyAccessAdapter({
      isProduction: true, earlyAccessEnabled: false, durableAvailable: false,
    });
    expect(decision.ok).toBe(true);
  });

  it("allows local development on memory, but says so out loud", () => {
    const decision = decideEarlyAccessAdapter({
      isProduction: false, earlyAccessEnabled: true, durableAvailable: false,
    });
    expect(decision.ok).toBe(true);
    if (decision.ok) {
      expect(decision.durable).toBe(false);
      expect(decision.warning).toMatch(/does not survive a restart/i);
    }
  });

  it("recognizes which repositories can actually do the durable exchange", () => {
    expect(isGrantIssuingRepository(new InMemoryPrivateAccessSessionRepository())).toBe(false);
  });
});
