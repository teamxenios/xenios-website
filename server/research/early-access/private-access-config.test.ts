import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_ENV,
  EARLY_ACCESS_MAX_SESSION_TTL_MINUTES,
  describeEarlyAccessConfig,
  resolveEarlyAccessConfig,
} from "./private-access-config";
import { hashPrivateAccessPassword } from "./private-access-password";

const HASH = hashPrivateAccessPassword("a-launch-password-12", { n: 16_384, r: 8, p: 1 });
const SECRET = "s".repeat(86);

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    [EARLY_ACCESS_ENV.enabled]: "true",
    [EARLY_ACCESS_ENV.passwordHash]: HASH,
    [EARLY_ACCESS_ENV.sessionSecret]: SECRET,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("Early Access deployment configuration", () => {
  it("enables only when the flag is true and every secret is valid", () => {
    expect(resolveEarlyAccessConfig(env()).enabled).toBe(true);
    expect(resolveEarlyAccessConfig(env()).problems).toEqual([]);
  });

  it("stays closed when the flag is absent or not exactly true", () => {
    for (const flag of [undefined, "", "false", "TRUE", "1", "yes", " true "]) {
      const config = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.enabled]: flag }));
      // " true " trims to "true" and is accepted; everything else stays closed.
      if (flag === " true ") expect(config.enabled).toBe(true);
      else expect(config.enabled).toBe(false);
    }
  });

  it("FAILS CLOSED when the flag is true but a secret is missing", () => {
    // The dangerous case: an operator flips the flag before adding secrets.
    const noHash = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.passwordHash]: undefined }));
    expect(noHash.enabled).toBe(false);
    expect(noHash.problems).toContain("PASSWORD_HASH_MISSING");

    const noSecret = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.sessionSecret]: undefined }));
    expect(noSecret.enabled).toBe(false);
    expect(noSecret.problems).toContain("SESSION_SECRET_MISSING");
  });

  it("FAILS CLOSED on a malformed password hash", () => {
    const config = resolveEarlyAccessConfig(
      env({ [EARLY_ACCESS_ENV.passwordHash]: "scrypt$notavalidhash" }),
    );
    expect(config.enabled).toBe(false);
    expect(config.problems).toContain("PASSWORD_HASH_INVALID");
  });

  it("FAILS CLOSED on a too-short session secret", () => {
    const config = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.sessionSecret]: "short" }));
    expect(config.enabled).toBe(false);
    expect(config.problems).toContain("SESSION_SECRET_TOO_SHORT");
  });

  it("refuses a session secret reused as the password hash", () => {
    // Reusing one value for both would let a leaked hash forge sessions.
    const config = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.sessionSecret]: HASH }));
    expect(config.enabled).toBe(false);
    expect(config.problems).toContain("SESSION_SECRET_EQUALS_PASSWORD_HASH");
  });

  it("honors 240 minutes without clamping, the decided lifetime", () => {
    const config = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.sessionTtlMinutes]: "240" }));
    expect(config.sessionTtlMinutes).toBe(240);
    expect(config.sessionTtlClampedFrom).toBeNull();
    expect(describeEarlyAccessConfig(config).sessionTtlClamped).toBe("no");
  });

  it("clamps beyond the maximum and REPORTS the clamp", () => {
    const config = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.sessionTtlMinutes]: "600" }));
    expect(config.sessionTtlMinutes).toBe(EARLY_ACCESS_MAX_SESSION_TTL_MINUTES);
    expect(config.sessionTtlClampedFrom).toBe(600);
    expect(describeEarlyAccessConfig(config).sessionTtlClamped).toBe("yes, requested 600");
  });

  it("clamps below the minimum up to 15 so a session is never uselessly short", () => {
    const config = resolveEarlyAccessConfig(env({ [EARLY_ACCESS_ENV.sessionTtlMinutes]: "5" }));
    expect(config.sessionTtlMinutes).toBe(15);
    expect(config.sessionTtlClampedFrom).toBe(5);
  });

  it("falls back to safe defaults for malformed numeric settings", () => {
    const config = resolveEarlyAccessConfig(
      env({
        [EARLY_ACCESS_ENV.maxAttempts]: "not-a-number",
        [EARLY_ACCESS_ENV.lockoutMinutes]: "-5",
      }),
    );
    expect(config.maxAttempts).toBe(8);
    expect(config.lockoutMinutes).toBe(15);
  });

  it("never exposes a secret value through the operator projection", () => {
    const described = describeEarlyAccessConfig(resolveEarlyAccessConfig(env()));
    const serialized = JSON.stringify(described);
    expect(serialized).not.toContain(HASH);
    expect(serialized).not.toContain(SECRET);
    expect(described.passwordHash).toBe("configured");
    expect(described.sessionSecret).toBe("configured");
  });

  it("reads no browser-exposed variable name", () => {
    for (const name of Object.values(EARLY_ACCESS_ENV)) {
      expect(name.startsWith("NEXT_PUBLIC_")).toBe(false);
      expect(name.startsWith("VITE_")).toBe(false);
    }
  });
});
