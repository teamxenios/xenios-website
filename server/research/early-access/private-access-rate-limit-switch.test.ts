import { describe, expect, it } from "vitest";

import {
  PRIVATE_ACCESS_RATE_LIMIT_ENV,
  createPrivateAccessAttemptLimiter,
  createPrivateAccessUnlimitedAttempts,
  privateAccessRateLimitEnabled,
} from "./private-access-routes";

/**
 * The launch switch for the Early Access password limiter.
 *
 * It removes ONLY the lockout that would refuse a later CORRECT password. The
 * password check itself is untouched, which is the property these tests exist
 * to keep honest: a switch that quietly let a wrong password through would be a
 * far worse bug than the lockout it was added to relieve.
 */

describe("the switch fails closed", () => {
  it("keeps rate limiting enabled when the variable is absent", () => {
    expect(privateAccessRateLimitEnabled({})).toBe(true);
  });

  it("keeps rate limiting enabled for anything that is not exactly \"false\"", () => {
    // A typo, a wrong case, or a half-set value must never remove the guard.
    for (const value of ["true", "TRUE", "False", "FALSE", "0", "no", "off", "", " false", "false "]) {
      expect(
        privateAccessRateLimitEnabled({ [PRIVATE_ACCESS_RATE_LIMIT_ENV]: value }),
        `${JSON.stringify(value)} must not disable rate limiting`,
      ).toBe(true);
    }
  });

  it("disables only on the exact string \"false\"", () => {
    expect(privateAccessRateLimitEnabled({ [PRIVATE_ACCESS_RATE_LIMIT_ENV]: "false" })).toBe(false);
  });
});

describe("enabled mode still locks", () => {
  it("locks a client after the configured threshold", () => {
    const limiter = createPrivateAccessAttemptLimiter({ maxAttempts: 3, lockoutMinutes: 15 });
    const now = 1_000;

    expect(limiter.isLocked("ip", now)).toBe(false);
    limiter.recordFailure("ip", now);
    limiter.recordFailure("ip", now);
    limiter.recordFailure("ip", now);

    expect(limiter.isLocked("ip", now)).toBe(true);
  });
});

describe("disabled mode", () => {
  it("never locks, however many failures are recorded", () => {
    // The whole point: a correct password AFTER a run of failures must work.
    const limiter = createPrivateAccessUnlimitedAttempts();
    const now = 1_000;

    for (let i = 0; i < 500; i += 1) limiter.recordFailure("ip", now);

    expect(limiter.isLocked("ip", now)).toBe(false);
    expect(limiter.isLocked("ip", now + 60 * 60_000)).toBe(false);
  });

  it("keeps no per-client state, so there is nothing to write or leak", () => {
    const limiter = createPrivateAccessUnlimitedAttempts();

    // Every method is a no-op returning undefined; none records a key, an IP,
    // or a count. Distinct clients are indistinguishable because none is
    // remembered.
    expect(limiter.recordFailure("198.51.100.7", 1)).toBeUndefined();
    expect(limiter.reset("198.51.100.7")).toBeUndefined();
    expect(limiter.isLocked("198.51.100.7", 1)).toBe(false);
    expect(Object.keys(limiter).sort()).toEqual(["isLocked", "recordFailure", "reset"]);
  });

  it("is a lockout switch only, and carries no password logic at all", () => {
    // A wrong password is still refused by the verifier in the unlock handler,
    // which this object cannot reach. It exposes no verify, no hash, no secret.
    const limiter = createPrivateAccessUnlimitedAttempts() as Record<string, unknown>;

    for (const forbidden of ["verify", "verifyPassword", "passwordHash", "secret", "config"]) {
      expect(limiter[forbidden]).toBeUndefined();
    }
  });
});

describe("scope", () => {
  it("names one variable, scoped to the Early Access password limiter", () => {
    // Not a general kill switch. Admin auth, Supabase auth, session expiry,
    // nonce and replay protection read none of this.
    expect(PRIVATE_ACCESS_RATE_LIMIT_ENV).toBe("RESEARCH_EARLY_ACCESS_RATE_LIMIT_ENABLED");
  });

  it("leaves the real limiter implementation intact and still usable", () => {
    // The switch selects between limiters; it does not modify or remove one.
    const limiter = createPrivateAccessAttemptLimiter({ maxAttempts: 1, lockoutMinutes: 1 });
    limiter.recordFailure("ip", 0);

    expect(limiter.isLocked("ip", 0)).toBe(true);
    limiter.reset("ip");
    expect(limiter.isLocked("ip", 0)).toBe(false);
  });
});
