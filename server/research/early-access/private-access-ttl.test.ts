import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PRIVATE_ACCESS_COOKIE_MAX_TTL_SECONDS,
  PRIVATE_ACCESS_COOKIE_MIN_TTL_SECONDS,
  PRIVATE_ACCESS_COOKIE_TTL_SECONDS,
  decodePrivateAccessCookie,
  encodePrivateAccessCookie,
} from "./private-access-cookie-session";
import {
  EARLY_ACCESS_ENV,
  EARLY_ACCESS_MAX_SESSION_TTL_MINUTES,
  EARLY_ACCESS_MIN_SESSION_TTL_MINUTES,
  resolveEarlyAccessConfig,
} from "./private-access-config";
import {
  PRIVATE_ACCESS_SESSION_MAX_TTL_SECONDS,
  PRIVATE_ACCESS_SESSION_MIN_TTL_SECONDS,
  PRIVATE_ACCESS_SESSION_TTL_SECONDS,
  issuePrivateAccessSession,
  verifyPrivateAccessSession,
} from "./private-access-session";
import { hashPrivateAccessPassword } from "./private-access-password";

// The Early Access session lifetime is 240 minutes by decision. These tests pin
// the decision end to end: the environment value, the token, and the cookie all
// resolve to the SAME lifetime, and out-of-bounds or malformed input can never
// widen it.

const SECRET = "s".repeat(86);
const NONCE = randomBytes(32).toString("base64url");
const NOW = 1_800_000_000_000;
const HASH = hashPrivateAccessPassword("a-launch-password-12", { n: 16_384, r: 8, p: 1 });

function ring() {
  return { activeKeyId: "k1", keys: { k1: SECRET } };
}
function handle() {
  return randomBytes(32).toString("base64url");
}
function configFor(value: string | undefined) {
  return resolveEarlyAccessConfig({
    [EARLY_ACCESS_ENV.enabled]: "true",
    [EARLY_ACCESS_ENV.passwordHash]: HASH,
    [EARLY_ACCESS_ENV.sessionSecret]: SECRET,
    ...(value === undefined ? {} : { [EARLY_ACCESS_ENV.sessionTtlMinutes]: value }),
  } as NodeJS.ProcessEnv);
}

describe("Early Access session TTL is 240 minutes by decision", () => {
  it("defaults to 240 minutes in every layer", () => {
    expect(PRIVATE_ACCESS_SESSION_TTL_SECONDS).toBe(240 * 60);
    expect(PRIVATE_ACCESS_COOKIE_TTL_SECONDS).toBe(240 * 60);
    expect(configFor(undefined).sessionTtlMinutes).toBe(240);
  });

  it("bounds are 15 minimum and 480 maximum in every layer", () => {
    expect(PRIVATE_ACCESS_SESSION_MIN_TTL_SECONDS).toBe(15 * 60);
    expect(PRIVATE_ACCESS_SESSION_MAX_TTL_SECONDS).toBe(480 * 60);
    expect(PRIVATE_ACCESS_COOKIE_MIN_TTL_SECONDS).toBe(15 * 60);
    expect(PRIVATE_ACCESS_COOKIE_MAX_TTL_SECONDS).toBe(480 * 60);
    expect(EARLY_ACCESS_MIN_SESSION_TTL_MINUTES).toBe(15);
    expect(EARLY_ACCESS_MAX_SESSION_TTL_MINUTES).toBe(480);
  });

  it.each([
    ["15", 15],
    ["240", 240],
    ["480", 480],
    ["60", 60],
  ])("honors a configured value inside the bounds: %s", (raw, expected) => {
    const config = configFor(raw);
    expect(config.sessionTtlMinutes).toBe(expected);
    expect(config.sessionTtlClampedFrom).toBeNull();
    expect(config.enabled).toBe(true);
  });

  it.each([["14"], ["0"], ["1"]])("clamps a below-minimum value up to 15: %s", (raw) => {
    const config = configFor(raw);
    expect(config.sessionTtlMinutes).toBe(15);
    expect(config.enabled).toBe(true);
  });

  it.each([["481"], ["1440"], ["999999"]])("clamps an above-maximum value to 480: %s", (raw) => {
    const config = configFor(raw);
    expect(config.sessionTtlMinutes).toBe(480);
    expect(config.sessionTtlClampedFrom).toBe(Number(raw));
  });

  it.each([["abc"], [""], ["240m"], ["-240"], ["24.5"], ["  "]])(
    "falls back to the 240 default on a malformed value: %s",
    (raw) => {
      const config = configFor(raw);
      expect(config.sessionTtlMinutes).toBe(240);
      // A malformed setting must never disable the gate; it uses the documented
      // safe default so a typo cannot take Early Access offline.
      expect(config.enabled).toBe(true);
    },
  );

  it("falls back to 240 when the variable is missing entirely", () => {
    expect(configFor(undefined).sessionTtlMinutes).toBe(240);
  });
});

describe("the resolved TTL is what the token and cookie actually carry", () => {
  it("issues and verifies a 240-minute token by default", () => {
    const issued = issuePrivateAccessSession({
      accessPassword: "p", presentedPassword: "p", nonce: NONCE, now: NOW, sessionSecret: SECRET,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.value.session.expiresAtEpochSeconds - issued.value.session.issuedAtEpochSeconds)
      .toBe(240 * 60);
    const verified = verifyPrivateAccessSession({
      token: issued.value.token, expectedNonce: NONCE, consumedNonces: [], now: NOW, sessionSecret: SECRET,
    });
    expect(verified.ok).toBe(true);
  });

  it.each([[15 * 60], [240 * 60], [480 * 60]])(
    "issues and verifies an explicit in-bounds ttl of %i seconds",
    (ttlSeconds) => {
      const issued = issuePrivateAccessSession({
        accessPassword: "p", presentedPassword: "p", nonce: NONCE, now: NOW, sessionSecret: SECRET, ttlSeconds,
      });
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
      expect(issued.value.session.expiresAtEpochSeconds - issued.value.session.issuedAtEpochSeconds)
        .toBe(ttlSeconds);
      const verified = verifyPrivateAccessSession({
        token: issued.value.token, expectedNonce: NONCE, consumedNonces: [], now: NOW, sessionSecret: SECRET, ttlSeconds,
      });
      expect(verified.ok).toBe(true);
    },
  );

  it("REFUSES an out-of-bounds or malformed explicit ttl instead of coercing it", () => {
    for (const ttlSeconds of [14 * 60, 481 * 60, 0, -1, 1.5, Number.NaN, "240", null]) {
      const issued = issuePrivateAccessSession({
        accessPassword: "p", presentedPassword: "p", nonce: NONCE, now: NOW, sessionSecret: SECRET,
        ttlSeconds: ttlSeconds as never,
      });
      expect(issued.ok, `ttl ${String(ttlSeconds)}`).toBe(false);
    }
  });

  it("a token minted at one lifetime does NOT verify against another", () => {
    // The lifetime stays pinned: widening the window on the verifier must not
    // retroactively accept a shorter-lived token, and vice versa.
    const issued = issuePrivateAccessSession({
      accessPassword: "p", presentedPassword: "p", nonce: NONCE, now: NOW, sessionSecret: SECRET,
      ttlSeconds: 15 * 60,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const mismatched = verifyPrivateAccessSession({
      token: issued.value.token, expectedNonce: NONCE, consumedNonces: [], now: NOW, sessionSecret: SECRET,
      ttlSeconds: 480 * 60,
    });
    expect(mismatched.ok).toBe(false);
  });

  it("the cookie Max-Age matches the same resolved lifetime as its encoded expiry", () => {
    for (const ttlSeconds of [15 * 60, 240 * 60, 480 * 60]) {
      const issued = encodePrivateAccessCookie({
        keyRing: ring(), now: NOW, sessionHandle: handle(), ttlSeconds,
      });
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
      expect(issued.value.setCookie).toContain(`Max-Age=${ttlSeconds}`);
      expect(issued.value.session.expiresAtEpochSeconds - issued.value.session.issuedAtEpochSeconds)
        .toBe(ttlSeconds);
      const decoded = decodePrivateAccessCookie({
        cookieHeader: `__Host-XeniosPrivateEarlyAccess=${issued.value.cookieValue}`,
        keyRing: ring(), now: NOW, ttlSeconds,
      });
      expect(decoded.ok).toBe(true);
    }
  });

  it("a customer is NOT signed out at 15 minutes when the TTL is 240", () => {
    // The regression this whole change exists to prevent.
    const issued = issuePrivateAccessSession({
      accessPassword: "p", presentedPassword: "p", nonce: NONCE, now: NOW, sessionSecret: SECRET,
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const atSixteenMinutes = NOW + 16 * 60 * 1_000;
    const stillValid = verifyPrivateAccessSession({
      token: issued.value.token, expectedNonce: NONCE, consumedNonces: [], now: atSixteenMinutes, sessionSecret: SECRET,
    });
    expect(stillValid.ok).toBe(true);
    // And it does expire at the real boundary.
    const pastFourHours = NOW + (240 * 60 + 1) * 1_000;
    const expired = verifyPrivateAccessSession({
      token: issued.value.token, expectedNonce: NONCE, consumedNonces: [], now: pastFourHours, sessionSecret: SECRET,
    });
    expect(expired.ok).toBe(false);
  });
});
