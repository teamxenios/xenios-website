import { describe, expect, it, vi } from "vitest";
import type { EarlyAccessConfig } from "./private-access-config";
import {
  createOpenAccessMintLimiter,
  createSessionRoute,
  createUnlockRoute,
  PRIVATE_ACCESS_INVALID_CREDENTIALS,
  type PrivateAccessResponsePort,
  type PrivateAccessRouteDependencies,
} from "./private-access-routes";
import { InMemoryPrivateAccessSessionRepository } from "./private-access-session-repository";

const MINUTE = 60_000;
const START = Date.UTC(2026, 8, 30);

function response() {
  const recorded = { status: 0, body: undefined as unknown, headers: {} as Record<string, string | readonly string[]> };
  const port: PrivateAccessResponsePort = {
    status(code) { recorded.status = code; },
    json(body) { recorded.body = body; },
    setHeader(name, value) { recorded.headers[name] = value; },
  };
  return { port, recorded };
}

function harness(overrides: Partial<PrivateAccessRouteDependencies> = {}) {
  const clock = { now: START };
  let sequence = 0;
  const repository = new InMemoryPrivateAccessSessionRepository();
  const config: EarlyAccessConfig = {
    enabled: true, openAccess: true, passwordHash: "",
    sessionSecret: "synthetic-open-access-window-test-secret-20260930",
    sessionTtlMinutes: 240, sessionTtlClampedFrom: null,
    maxAttempts: 30, lockoutMinutes: 30, cookieName: null, problems: [],
  };
  const deps: PrivateAccessRouteDependencies = {
    config, repository, now: () => clock.now, env: {},
    randomToken: () => {
      const bytes = Buffer.alloc(32);
      bytes.writeUInt32BE(++sequence);
      return bytes.toString("base64url");
    },
    ...overrides,
  };
  const route = createUnlockRoute(deps);
  async function unlock(clientKey: unknown = "shared-ip") {
    const result = response();
    await route({ body: {}, clientKey }, result.port);
    return result.recorded;
  }
  return { clock, deps, repository, unlock };
}

describe("HL-23: bounded rolling anonymous mint window", () => {
  it("expires each attempt independently, rather than accumulating lifetime failures", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 2, windowMinutes: 30 });
    expect(limiter.tryAcquire("shared", START)).toBe(true);
    expect(limiter.tryAcquire("shared", START + 10 * MINUTE)).toBe(true);
    expect(limiter.tryAcquire("shared", START + 29 * MINUTE)).toBe(false);
    expect(limiter.tryAcquire("shared", START + 30 * MINUTE)).toBe(true);
    expect(limiter.tryAcquire("shared", START + 39 * MINUTE)).toBe(false);
    expect(limiter.tryAcquire("shared", START + 40 * MINUTE)).toBe(true);
  });

  it("does not extend the budget window when requests are refused", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 1, windowMinutes: 1 });
    expect(limiter.tryAcquire("a", START)).toBe(true);
    expect(limiter.tryAcquire("a", START + MINUTE - 1)).toBe(false);
    expect(limiter.tryAcquire("a", START + MINUTE)).toBe(true);
  });

  it("evicts the below-budget key with the oldest last attempt, not oldest insertion", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 3, windowMinutes: 1, maxKeys: 2 });
    expect(limiter.tryAcquire("a", START)).toBe(true);
    expect(limiter.tryAcquire("b", START + 1)).toBe(true);
    expect(limiter.tryAcquire("a", START + 2)).toBe(true);
    expect(limiter.tryAcquire("new-client", START + 3)).toBe(true);
    // a was used more recently than b, so its two reservations must survive.
    expect(limiter.tryAcquire("a", START + 4)).toBe(true);
    expect(limiter.tryAcquire("a", START + 5)).toBe(false);
  });

  it("preserves an exhausted budget even when its last attempt is the oldest", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 2, windowMinutes: 1, maxKeys: 2 });
    expect(limiter.tryAcquire("a", START)).toBe(true);
    expect(limiter.tryAcquire("a", START)).toBe(true);
    expect(limiter.tryAcquire("b", START + 1)).toBe(true);
    for (let index = 2; index < 12; index += 1) {
      expect(limiter.tryAcquire(`rotation-${index}`, START + index)).toBe(true);
      expect(limiter.tryAcquire("a", START + index)).toBe(false);
    }
  });

  it("refuses a new key only when every tracked budget is exhausted", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 2, windowMinutes: 1, maxKeys: 2 });
    for (const key of ["a", "b"]) {
      expect(limiter.tryAcquire(key, START)).toBe(true);
      expect(limiter.tryAcquire(key, START)).toBe(true);
    }
    expect(limiter.tryAcquire("new-client", START + 1)).toBe(false);
    expect(limiter.tryAcquire("a", START + 1)).toBe(false);
    expect(limiter.tryAcquire("b", START + 1)).toBe(false);
  });

  it("recovers capacity when exhausted attempts expire without extending refusal", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 1, windowMinutes: 1, maxKeys: 2 });
    expect(limiter.tryAcquire("a", START)).toBe(true);
    expect(limiter.tryAcquire("b", START + 1)).toBe(true);
    expect(limiter.tryAcquire("new-client", START + MINUTE - 1)).toBe(false);
    expect(limiter.tryAcquire("new-client", START + MINUTE)).toBe(true);
    expect(limiter.tryAcquire("b", START + MINUTE)).toBe(false);
    expect(limiter.tryAcquire("another-client", START + MINUTE + 1)).toBe(true);
  });

  it("keeps a backward clock step from prematurely aging a new reservation", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 2, windowMinutes: 1 });
    expect(limiter.tryAcquire("a", START)).toBe(true);
    expect(limiter.tryAcquire("a", START - 2 * MINUTE)).toBe(true);
    expect(limiter.tryAcquire("a", START)).toBe(false);
  });

  it("refuses malformed identities and time rather than allocating a budget", () => {
    const limiter = createOpenAccessMintLimiter({ maxMints: 1, windowMinutes: 1, maxKeys: 1 });
    for (const key of ["", " ", "a".repeat(257)]) expect(limiter.tryAcquire(key, START)).toBe(false);
    for (const now of [NaN, Infinity, -1, 0.5]) expect(limiter.tryAcquire("a", now)).toBe(false);
    expect(limiter.tryAcquire("a", START)).toBe(true);
  });

  it("fails closed for invalid budget configuration", () => {
    for (const value of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => createOpenAccessMintLimiter({ maxMints: 1, windowMinutes: value })).toThrow(RangeError);
    }
  });
});

describe("HL-23: composed unlock uses the rolling budget", () => {
  it("allows ordinary shared-IP traffic over a day without periodic lifetime lockout", async () => {
    const test = harness();
    for (let index = 0; index < 144; index += 1) {
      test.clock.now = START + index * 10 * MINUTE;
      expect((await test.unlock()).status, `session ${index + 1}`).toBe(200);
    }
  });

  it("limits a burst to the configured budget and recovers at the oldest expiry", async () => {
    const test = harness();
    for (let index = 0; index < 30; index += 1) expect((await test.unlock()).status).toBe(200);
    const denied = await test.unlock();
    expect(denied.status).toBe(401);
    expect(denied.body).toEqual(PRIVATE_ACCESS_INVALID_CREDENTIALS);
    expect(denied.headers["Set-Cookie"]).toBeUndefined();
    expect(test.repository.size()).toBe(30);
    test.clock.now += 30 * MINUTE;
    expect((await test.unlock()).status).toBe(200);
  });

  it("reserves before asynchronous writes so concurrent unlocks cannot exceed the quota", async () => {
    const test = harness();
    const results = await Promise.all(Array.from({ length: 40 }, () => test.unlock()));
    expect(results.filter((result) => result.status === 200)).toHaveLength(30);
    expect(results.filter((result) => result.status === 401)).toHaveLength(10);
    expect(test.repository.size()).toBe(30);
  });

  it("keeps anonymous mint limiting even when the password-only lockout switch is off", async () => {
    const test = harness({ env: { RESEARCH_EARLY_ACCESS_RATE_LIMIT_ENABLED: "false" } });
    const results = await Promise.all(Array.from({ length: 31 }, () => test.unlock()));
    expect(results.filter((result) => result.status === 200)).toHaveLength(30);
    expect(results.at(-1)?.status).toBe(401);
  });

  it("does not consult or mutate the password failure counter in open-access mode", async () => {
    const attempts = { isLocked: vi.fn(() => true), recordFailure: vi.fn(), reset: vi.fn() };
    const verifyPassword = vi.fn(() => false);
    expect((await harness({ attempts, verifyPassword }).unlock()).status).toBe(200);
    expect(attempts.isLocked).not.toHaveBeenCalled();
    expect(attempts.recordFailure).not.toHaveBeenCalled();
    expect(attempts.reset).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("bounds failing or interrupted mint writes without issuing a cookie", async () => {
    const mintSession = vi.fn(async () => { throw new Error("synthetic interruption"); });
    const test = harness({ mintSession });
    for (let index = 0; index < 31; index += 1) {
      const result = await test.unlock();
      expect(result.status).toBe(401);
      expect(result.headers["Set-Cookie"]).toBeUndefined();
    }
    expect(mintSession).toHaveBeenCalledTimes(30);
    test.clock.now += 30 * MINUTE;
    await test.unlock();
    expect(mintSession).toHaveBeenCalledTimes(31);
  });

  it("still requires a real signed session and retains its exact expiry", async () => {
    const test = harness();
    const opened = await test.unlock();
    const cookie = opened.headers["Set-Cookie"];
    expect(typeof cookie).toBe("string");
    const cookieHeader = (cookie as string).split(";")[0];
    const read = createSessionRoute(test.deps);
    const live = response();
    await read({ cookieHeader }, live.port);
    expect(live.recorded.body).toMatchObject({ authenticated: true, openAccess: true });
    test.clock.now += 240 * MINUTE;
    const expired = response();
    await read({ cookieHeader }, expired.port);
    expect(expired.recorded.body).toEqual({ authenticated: false, openAccess: true });
    const anonymous = response();
    await read({ cookieHeader: undefined }, anonymous.port);
    expect(anonymous.recorded.body).toEqual({ authenticated: false, openAccess: true });
  });
});
