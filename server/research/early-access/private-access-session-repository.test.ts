import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  hashPrivateAccessSessionToken,
  InMemoryPrivateAccessSessionRepository,
  isPrivateAccessSessionHash,
  PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
  PRIVATE_ACCESS_SESSION_RPC,
  SupabasePrivateAccessSessionRepository,
  type PrivateAccessSessionDatabaseCall,
} from "./private-access-session-repository";

// The exact shape the durable migration's check constraint accepts.
const DATABASE_HASH_CONSTRAINT = /^[a-f0-9]{64}$/;

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER_OWNER = "00000000-0000-4000-8000-000000000002";

/** A canonical 43-character base64url opaque token, distinct per seed. */
function tokenFor(seed: number): string {
  const bytes = Buffer.alloc(32, 7);
  bytes.writeUInt32LE(seed >>> 0, 0);
  return bytes.toString("base64url");
}

function hashFor(seed: number): string {
  return hashPrivateAccessSessionToken(tokenFor(seed));
}

describe("hashPrivateAccessSessionToken", () => {
  it("produces exactly the lowercase 64-hex shape the database constrains", () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const hash = hashPrivateAccessSessionToken(tokenFor(seed));
      expect(hash).toMatch(DATABASE_HASH_CONSTRAINT);
      expect(isPrivateAccessSessionHash(hash)).toBe(true);
    }
  });

  it("is one-way: the hash does not contain the token", () => {
    const token = tokenFor(1);
    expect(hashPrivateAccessSessionToken(token)).not.toContain(token);
  });

  it("refuses a raw opaque token as a session hash", () => {
    // The structural guarantee: a 43-character base64url token can never satisfy
    // the 64-hex pattern, so a caller who passes a token instead of its hash is
    // rejected at the boundary rather than persisting a live credential.
    expect(isPrivateAccessSessionHash(tokenFor(1))).toBe(false);
    expect(isPrivateAccessSessionHash("ABCDEF".repeat(11).slice(0, 64))).toBe(false);
  });
});

describe("InMemoryPrivateAccessSessionRepository", () => {
  it("stores only the hash; the raw token never enters the store", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    const token = tokenFor(1);
    const created = await repository.create({
      sessionHash: hashPrivateAccessSessionToken(token),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    expect(created.ok).toBe(true);

    const resolved = await repository.resolve(hashPrivateAccessSessionToken(token), 1_500_000);
    expect(resolved.ok).toBe(true);
    const serialized = JSON.stringify(resolved);
    expect(serialized).not.toContain(token);
    expect(serialized).toContain(hashPrivateAccessSessionToken(token));
  });

  it("refuses a raw token where a hash is required, on every operation", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    const token = tokenFor(1);
    expect(
      await repository.create({
        sessionHash: token,
        ownerId: OWNER,
        issuedAt: 1_000,
        expiresAt: 2_000,
      }),
    ).toEqual({ ok: false, code: "SESSION_HASH_INVALID" });
    expect(await repository.resolve(token, 1_500)).toEqual({
      ok: false,
      code: "SESSION_HASH_INVALID",
    });
    expect(await repository.touch(token, 1_500)).toEqual({
      ok: false,
      code: "SESSION_HASH_INVALID",
    });
    expect(await repository.revoke(token, 1_500)).toEqual({
      ok: false,
      code: "SESSION_HASH_INVALID",
    });
  });

  it("decides liveness from the injected clock alone, never from ambient time", async () => {
    // The window is in 1970. Any use of a real clock would report it expired.
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    const live = await repository.resolve(hashFor(1), 1_500_000);
    expect(live.ok && live.value?.sessionHash).toBe(hashFor(1));
    expect(live.ok && live.value?.accessRole).toBe(PRIVATE_ACCESS_SESSION_ACCESS_ROLE);
  });

  it("refuses an expired row, at and after the boundary", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    const atBoundary = await repository.resolve(hashFor(1), 1_900_000);
    expect(atBoundary).toEqual({ ok: true, value: null });
    const after = await repository.resolve(hashFor(1), 1_900_001);
    expect(after).toEqual({ ok: true, value: null });
  });

  it("refuses a revoked row and reports it identically to a missing one", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    expect(await repository.revoke(hashFor(1), 1_200_000)).toEqual({ ok: true, value: true });

    const revoked = await repository.resolve(hashFor(1), 1_300_000);
    const missing = await repository.resolve(hashFor(9), 1_300_000);
    expect(revoked).toEqual({ ok: true, value: null });
    expect(revoked).toEqual(missing);
  });

  it("revokes idempotently", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    expect(await repository.revoke(hashFor(1), 1_200_000)).toEqual({ ok: true, value: true });
    expect(await repository.revoke(hashFor(1), 1_300_000)).toEqual({ ok: true, value: true });
    // Revoking something that never existed is not an error either.
    expect(await repository.revoke(hashFor(9), 1_300_000)).toEqual({ ok: true, value: false });
  });

  it("touch records last-seen and NEVER slides expiry", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    const touched = await repository.touch(hashFor(1), 1_800_000);
    expect(touched.ok && touched.value?.expiresAtEpochMs).toBe(1_900_000);
    expect(touched.ok && touched.value?.lastSeenAtEpochMs).toBe(1_800_000);

    // Being used right before expiry does not buy another window.
    const afterExpiry = await repository.resolve(hashFor(1), 1_900_000);
    expect(afterExpiry).toEqual({ ok: true, value: null });
  });

  it("touch on an expired or revoked session reports null", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    });
    expect(await repository.touch(hashFor(1), 1_900_000)).toEqual({ ok: true, value: null });
  });

  it("finds the row wherever it sits and rejects a near-miss hash", async () => {
    // Exercises the non-short-circuiting walk: position must not matter, and a
    // hash differing only in its final character must not match.
    const repository = new InMemoryPrivateAccessSessionRepository();
    for (let seed = 0; seed < 20; seed += 1) {
      await repository.create({
        sessionHash: hashFor(seed),
        ownerId: OWNER,
        issuedAt: 1_000_000,
        expiresAt: 1_900_000,
      });
    }
    for (const seed of [0, 9, 19]) {
      const found = await repository.resolve(hashFor(seed), 1_500_000);
      expect(found.ok && found.value?.sessionHash).toBe(hashFor(seed));
    }
    const target = hashFor(5);
    const nearMiss = `${target.slice(0, 63)}${target.endsWith("a") ? "b" : "a"}`;
    expect(await repository.resolve(nearMiss, 1_500_000)).toEqual({ ok: true, value: null });
  });

  it("refuses a duplicate session hash", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    const input = {
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    };
    expect((await repository.create(input)).ok).toBe(true);
    expect(await repository.create(input)).toEqual({ ok: false, code: "CONFLICT" });
  });

  it("refuses malformed create input", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    const base = {
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
    };
    expect(await repository.create({ ...base, ownerId: "not-a-uuid" })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(await repository.create({ ...base, expiresAt: base.issuedAt })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(await repository.create({ ...base, issuedAt: -1 })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
    expect(await repository.create({ ...base, nonceHash: "not-a-hash" })).toEqual({
      ok: false,
      code: "INPUT_INVALID",
    });
  });

  it("prunes expired rows and leaves live ones", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository();
    await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_100_000,
    });
    await repository.create({
      sessionHash: hashFor(2),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 9_000_000,
    });
    expect(await repository.pruneExpired(1_200_000)).toEqual({ ok: true, value: 1 });
    expect(repository.size()).toBe(1);
    const survivor = await repository.resolve(hashFor(2), 1_200_000);
    expect(survivor.ok && survivor.value?.sessionHash).toBe(hashFor(2));
  });

  it("bounds its own size rather than growing without limit", async () => {
    const repository = new InMemoryPrivateAccessSessionRepository(2);
    for (const seed of [1, 2]) {
      expect(
        (
          await repository.create({
            sessionHash: hashFor(seed),
            ownerId: OWNER,
            issuedAt: 1_000_000,
            expiresAt: 9_000_000,
          })
        ).ok,
      ).toBe(true);
    }
    expect(
      await repository.create({
        sessionHash: hashFor(3),
        ownerId: OWNER,
        issuedAt: 1_000_000,
        expiresAt: 9_000_000,
      }),
    ).toEqual({ ok: false, code: "CAPACITY_EXCEEDED" });
  });
});

describe("SupabasePrivateAccessSessionRepository", () => {
  function recorder(result: unknown | ((call: PrivateAccessSessionDatabaseCall) => unknown)) {
    const calls: PrivateAccessSessionDatabaseCall[] = [];
    const query = vi.fn(async (call: PrivateAccessSessionDatabaseCall) => {
      calls.push(call);
      return typeof result === "function"
        ? (result as (c: PrivateAccessSessionDatabaseCall) => unknown)(call)
        : result;
    });
    return { calls, query };
  }

  it("does not import a Supabase client, so it needs no credential to test", () => {
    const source = readFileSync(
      new URL("./private-access-session-repository.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*supabase[^"']*["']/i);
    expect(source).not.toMatch(/require\(\s*["'][^"']*supabase/i);
  });

  it("refuses to mint a session without a one-time grant nonce", async () => {
    // The migration exposes no standalone session-minting function; a session
    // exists only as the atomic exchange of a registered nonce.
    const { query, calls } = recorder("2026-01-01T00:15:00.000Z");
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    expect(
      await repository.create({
        sessionHash: hashFor(1),
        ownerId: OWNER,
        issuedAt: 1_000_000,
        expiresAt: 1_900_000,
      }),
    ).toEqual({ ok: false, code: "NONCE_REQUIRED" });
    expect(calls).toHaveLength(0);
  });

  it("exchanges a nonce through the exact RPC and returns the DATABASE expiry", async () => {
    const { query, calls } = recorder("2026-01-01T00:15:00.000Z");
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    const created = await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      // A caller-requested expiry is deliberately ignored: the database authors it.
      expiresAt: 9_999_999_999,
      nonceHash: hashFor(2),
    });
    expect(calls).toEqual([
      {
        fn: PRIVATE_ACCESS_SESSION_RPC.exchangeNonce,
        args: {
          p_nonce_hash: hashFor(2),
          p_session_hash: hashFor(1),
          p_owner_id: OWNER,
          p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
        },
      },
    ]);
    expect(created.ok && created.value.expiresAtEpochMs).toBe(
      Date.parse("2026-01-01T00:15:00.000Z"),
    );
    expect(created.ok && created.value.ownerId).toBe(OWNER);
  });

  it("treats a NULL exchange (replayed, expired, foreign, consumed) as one refusal", async () => {
    const { query } = recorder(null);
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    expect(
      await repository.create({
        sessionHash: hashFor(1),
        ownerId: OWNER,
        issuedAt: 1_000_000,
        expiresAt: 1_900_000,
        nonceHash: hashFor(2),
      }),
    ).toEqual({ ok: false, code: "CONFLICT" });
  });

  it("refuses an owner the adapter was not configured for", async () => {
    const { query, calls } = recorder("2026-01-01T00:15:00.000Z");
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    expect(
      await repository.create({
        sessionHash: hashFor(1),
        ownerId: OTHER_OWNER,
        issuedAt: 1_000_000,
        expiresAt: 1_900_000,
        nonceHash: hashFor(2),
      }),
    ).toEqual({ ok: false, code: "INPUT_INVALID" });
    expect(calls).toHaveLength(0);
  });

  it("resolves through the liveness predicate and reports no invented expiry", async () => {
    const { query, calls } = recorder(true);
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    const resolved = await repository.resolve(hashFor(1), 1_500_000);
    expect(calls[0]?.fn).toBe(PRIVATE_ACCESS_SESSION_RPC.sessionActive);
    expect(calls[0]?.args).toEqual({
      p_session_hash: hashFor(1),
      p_owner_id: OWNER,
      p_access_role: PRIVATE_ACCESS_SESSION_ACCESS_ROLE,
    });
    expect(resolved.ok && resolved.value?.expiresAtEpochMs).toBeNull();
  });

  it("reports a false predicate as no session", async () => {
    const { query } = recorder(false);
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    expect(await repository.resolve(hashFor(1), 1_500_000)).toEqual({ ok: true, value: null });
  });

  it("revokes through the exact RPC and is idempotent there", async () => {
    const { query, calls } = recorder(true);
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    expect(await repository.revoke(hashFor(1), 1_500_000)).toEqual({ ok: true, value: true });
    expect(await repository.revoke(hashFor(1), 1_600_000)).toEqual({ ok: true, value: true });
    expect(calls.every((call) => call.fn === PRIVATE_ACCESS_SESSION_RPC.revokeSession)).toBe(true);
  });

  it("registers a grant nonce through the exact RPC", async () => {
    const { query, calls } = recorder("2026-01-01T00:05:00.000Z");
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    const issued = await repository.issueNonce(hashFor(3));
    expect(calls[0]?.fn).toBe(PRIVATE_ACCESS_SESSION_RPC.issueNonce);
    expect(issued).toEqual({ ok: true, value: Date.parse("2026-01-01T00:05:00.000Z") });
  });

  it("reports touch and pruneExpired UNSUPPORTED rather than emulating a write", async () => {
    // The migration's predicate performs no write and never slides expiry, and
    // it revokes table privileges from every role. Faking either would need
    // access the migration deliberately withholds.
    const { query, calls } = recorder(true);
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    expect(await repository.touch(hashFor(1), 1_500_000)).toEqual({
      ok: false,
      code: "UNSUPPORTED",
    });
    expect(await repository.pruneExpired(1_500_000)).toEqual({ ok: false, code: "UNSUPPORTED" });
    expect(calls).toHaveLength(0);
  });

  it("turns a driver failure into one opaque code, leaking no detail", async () => {
    const secret = "postgres://user:hunter2@db.internal:5432/postgres";
    const query = vi.fn(async () => {
      throw new Error(`connection refused ${secret}`);
    });
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    const created = await repository.create({
      sessionHash: hashFor(1),
      ownerId: OWNER,
      issuedAt: 1_000_000,
      expiresAt: 1_900_000,
      nonceHash: hashFor(2),
    });
    expect(created).toEqual({ ok: false, code: "BACKEND_UNAVAILABLE" });
    expect(JSON.stringify(created)).not.toContain("hunter2");

    const resolved = await repository.resolve(hashFor(1), 1_500_000);
    expect(resolved).toEqual({ ok: false, code: "BACKEND_UNAVAILABLE" });
  });

  it("refuses a raw token as a hash on every durable operation", async () => {
    const { query, calls } = recorder(true);
    const repository = new SupabasePrivateAccessSessionRepository({ query, ownerId: OWNER });
    const token = tokenFor(1);
    expect(await repository.resolve(token, 1_500_000)).toEqual({
      ok: false,
      code: "SESSION_HASH_INVALID",
    });
    expect(await repository.revoke(token, 1_500_000)).toEqual({
      ok: false,
      code: "SESSION_HASH_INVALID",
    });
    expect(await repository.issueNonce(token)).toEqual({
      ok: false,
      code: "SESSION_HASH_INVALID",
    });
    expect(calls).toHaveLength(0);
  });
});
