// PRIVATE PROPOSAL: eventual server/research/partners/referral-v1-locator.test.ts.
// Authored against ff524580 token helpers and the 90228240 SQL locator domain.
// No test in this file has run; this does not qualify managed attribution.
import { describe, expect, it, vi } from "vitest";
import {
  createReferralV1RequestLocator,
  type ReferralV1RequestLocatorInput,
  type ServerReferralSource,
} from "./referral-v1-locator";
import {
  ATTRIBUTION_COOKIE_NAME,
  REFERRAL_VISITOR_COOKIE,
  readReferralCapture,
  readReferralVisitor,
  referralSubject,
  sealReferralCapture,
  sealReferralVisitor,
  type ReferralVisitor,
} from "./referral-v1-tokens";

const SECRET = "synthetic-referral-locator-test-key-not-for-production";
const NOW = 1_800_000_000_000;
const SQL_EPOCH_LIMIT_MS = 8_640_000_000_000_000;
const ACTOR = "abcdef00-1234-4abc-8def-0123456789ab";
const TOUCH = "abcdef12-3456-4abc-8def-123456789abc";
const OTHER_TOUCH = "fedcba98-7654-4fed-8cba-9876543210fe";
const NONE = { kind: "no_supported_touch" };
const INVALID = { kind: "unavailable", reason: "invalid_source" };

/** Actual purpose-bound seals, never mocked readers or fabricated validation. */
function capturedBrowser(options: {
  secret?: string;
  issuedAt?: number;
  visitor?: ReferralVisitor;
  touchId?: string;
  expiresAt?: number;
} = {}) {
  const secret = options.secret ?? SECRET;
  const issuedAt = options.issuedAt ?? NOW;
  const visitor = Object.freeze(options.visitor ?? {
    nonce: "A".repeat(43), expiresAt: issuedAt + 60_000,
  });
  const claim = Object.freeze({
    touchId: options.touchId ?? TOUCH,
    subjectKeyHash: referralSubject(secret, visitor),
    expiresAt: options.expiresAt ?? issuedAt + 30_000,
  });
  const visitorCookie = `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(secret, visitor)}`;
  const captureCookie = `${ATTRIBUTION_COOKIE_NAME}=${sealReferralCapture(secret, claim)}`;
  return Object.freeze({
    visitor, claim, visitorCookie, captureCookie,
    cookieHeader: `${visitorCookie}; ${captureCookie}`,
  });
}

function locator(secret: string | null = SECRET, now: () => number = () => NOW) {
  return createReferralV1RequestLocator({ enabled: true, secret, now });
}

describe("server referral request locator: C4 U1-U14", () => {
  it("U1: disabled wins even with an actor and a valid captured browser", () => {
    const browser = capturedBrowser();
    const clock = vi.fn(() => { throw new Error("disabled clock must not be read"); });
    const result = createReferralV1RequestLocator({ enabled: false, secret: SECRET, now: clock })
      .locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: ACTOR });
    expect(result).toEqual({ kind: "unavailable", reason: "disabled" });
    expect(clock).not.toHaveBeenCalled();
  });

  it("U2: a member ignores the conflicting guest capture, secret and clock", () => {
    const browser = capturedBrowser({ touchId: OTHER_TOUCH });
    const clock = vi.fn(() => { throw new Error("member clock must not be read"); });
    const memberLocator = locator(null, clock);
    expect(memberLocator.locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: ACTOR }))
      .toEqual({ kind: "account", actorAuthUserId: ACTOR });
    expect(memberLocator.locate({
      actorAuthUserId: ACTOR,
      get cookieHeader(): string | undefined { throw new Error("member cookie must not be read"); },
    })).toEqual({ kind: "account", actorAuthUserId: ACTOR });
    expect(clock).not.toHaveBeenCalled();
  });

  it("U3: normalizes an upper-case member UUID without changing the input", () => {
    const input = Object.freeze({ cookieHeader: undefined, actorAuthUserId: ACTOR.toUpperCase() });
    expect(locator(null).locate(input)).toEqual({ kind: "account", actorAuthUserId: ACTOR });
    expect(input.actorAuthUserId).toBe(ACTOR.toUpperCase());
    // This checks the tuple only, not request-owner hashing or a managed binding.
  });

  it("U4: refuses invalid or missing actor bindings instead of trusting a guest cookie", () => {
    const browser = capturedBrowser();
    for (const actorAuthUserId of [
      "", "not-a-uuid", ` ${ACTOR}`, ACTOR.replace("4abc", "0abc"), ACTOR.replace("8def", "7def"),
    ]) {
      expect(locator().locate({ cookieHeader: browser.cookieHeader, actorAuthUserId })).toEqual(INVALID);
    }
    const untypedInputs: unknown[] = [
      { cookieHeader: browser.cookieHeader },
      { cookieHeader: browser.cookieHeader, actorAuthUserId: undefined },
    ];
    for (const input of untypedInputs) {
      expect(locator().locate(input as ReferralV1RequestLocatorInput)).toEqual(INVALID);
    }
    expect(locator().locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null }).kind)
      .toBe("guest_touch");
  });

  it("U5: requires the existing secret's UTF-8 byte threshold for guest cookies", () => {
    const browser = capturedBrowser();
    for (const secret of [null, "", "x".repeat(31)]) {
      expect(locator(secret).locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null }))
        .toEqual({ kind: "unavailable", reason: "unconfigured" });
    }
    const byteReadySecret = "\u00e9".repeat(16);
    expect(Buffer.byteLength(byteReadySecret)).toBe(32);
    const byteReadyBrowser = capturedBrowser({ secret: byteReadySecret });
    expect(locator(byteReadySecret).locate({ cookieHeader: byteReadyBrowser.cookieHeader, actorAuthUserId: null }).kind)
      .toBe("guest_touch");
  });

  it("U6: finds no supported touch without a visitor cookie", () => {
    const browser = capturedBrowser();
    for (const cookieHeader of [undefined, "", browser.captureCookie]) {
      expect(locator().locate({ cookieHeader, actorAuthUserId: null })).toEqual(NONE);
    }
  });

  it("U7: a valid visitor alone supplies no captured touch", () => {
    const browser = capturedBrowser();
    expect(readReferralVisitor(SECRET, browser.visitorCookie, NOW)).toEqual(browser.visitor);
    expect(locator().locate({ cookieHeader: browser.visitorCookie, actorAuthUserId: null })).toEqual(NONE);
  });

  it("U8: cannot move a real capture to a different signed visitor", () => {
    const browser = capturedBrowser();
    const otherVisitor = Object.freeze({ nonce: "B".repeat(43), expiresAt: NOW + 60_000 });
    const otherCookie = `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(SECRET, otherVisitor)}`;
    expect(readReferralVisitor(SECRET, otherCookie, NOW)).toEqual(otherVisitor);
    expect(referralSubject(SECRET, otherVisitor)).not.toBe(browser.claim.subjectKeyHash);
    expect(locator().locate({ cookieHeader: `${otherCookie}; ${browser.captureCookie}`, actorAuthUserId: null }))
      .toEqual(NONE);
  });

  it("U9: refuses a changed signature and seals made with another secret", () => {
    const browser = capturedBrowser();
    const last = browser.captureCookie.at(-1);
    const tampered = browser.captureCookie.slice(0, -1) + (last === "A" ? "B" : "A");
    expect(locator().locate({ cookieHeader: `${browser.visitorCookie}; ${tampered}`, actorAuthUserId: null }))
      .toEqual(NONE);
    const rotated = capturedBrowser({ secret: `${SECRET}-rotated` });
    expect(locator().locate({ cookieHeader: rotated.cookieHeader, actorAuthUserId: null })).toEqual(NONE);
  });

  it("U10: rejects capture expiry at the boundary and an expired visitor", () => {
    const browser = capturedBrowser({ expiresAt: NOW + 1_000 });
    expect(locator(SECRET, () => NOW + 999).locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null }).kind)
      .toBe("guest_touch");
    expect(locator(SECRET, () => NOW + 1_000).locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null }))
      .toEqual(NONE);
    const expiredVisitor = capturedBrowser({
      visitor: { nonce: "A".repeat(43), expiresAt: NOW }, expiresAt: NOW + 1_000,
    });
    expect(locator().locate({ cookieHeader: expiredVisitor.cookieHeader, actorAuthUserId: null })).toEqual(NONE);
  });

  it("U11: duplicate visitor/capture names and oversized headers supply no touch", () => {
    const browser = capturedBrowser();
    for (const cookieHeader of [
      `${browser.cookieHeader}; ${browser.visitorCookie}`,
      `${browser.cookieHeader}; ${browser.captureCookie}`,
      `${browser.cookieHeader}; unrelated=${"x".repeat(16_384)}`,
    ]) {
      expect(locator().locate({ cookieHeader, actorAuthUserId: null })).toEqual(NONE);
    }
  });

  it("U12: emits the exact guest tuple, normalizes UUIDs and respects SQL expiry bounds", () => {
    const browser = capturedBrowser({ touchId: TOUCH.toUpperCase() });
    expect(readReferralVisitor(SECRET, browser.cookieHeader, NOW)).toEqual(browser.visitor);
    expect(readReferralCapture(SECRET, browser.cookieHeader, browser.visitor, NOW)).toEqual(browser.claim);
    const input = Object.freeze({ cookieHeader: browser.cookieHeader, actorAuthUserId: null });
    const before = JSON.stringify({ input, visitor: browser.visitor, claim: browser.claim });
    const clock = vi.fn(() => NOW);
    const result = locator(SECRET, clock).locate(input);
    expect(result).toEqual({
      kind: "guest_touch", touchId: TOUCH,
      subjectKeyHash: browser.claim.subjectKeyHash, claimExpiresAt: browser.claim.expiresAt,
    });
    expect(Object.keys(result).sort()).toEqual(["claimExpiresAt", "kind", "subjectKeyHash", "touchId"]);
    expect(clock).toHaveBeenCalledTimes(1);
    if (result.kind !== "guest_touch") throw new Error("expected synthetic guest tuple");
    expect(result.subjectKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof result.claimExpiresAt).toBe("number");
    expect(Number.isSafeInteger(result.claimExpiresAt)).toBe(true);
    expect(JSON.stringify(result.claimExpiresAt)).toMatch(/^[0-9]{1,16}$/);
    expect(JSON.stringify({ input, visitor: browser.visitor, claim: browser.claim })).toBe(before);

    const nearLimit = SQL_EPOCH_LIMIT_MS - 1_000;
    const visitor = { nonce: "A".repeat(43), expiresAt: SQL_EPOCH_LIMIT_MS };
    const atLimit = capturedBrowser({ issuedAt: nearLimit, visitor, expiresAt: SQL_EPOCH_LIMIT_MS });
    expect(locator(SECRET, () => nearLimit).locate({ cookieHeader: atLimit.cookieHeader, actorAuthUserId: null }))
      .toEqual({ kind: "guest_touch", touchId: TOUCH,
        subjectKeyHash: atLimit.claim.subjectKeyHash, claimExpiresAt: SQL_EPOCH_LIMIT_MS });
    const beyondSql = capturedBrowser({ issuedAt: nearLimit, visitor, expiresAt: SQL_EPOCH_LIMIT_MS + 1 });
    // A real, well-sealed claim passes the old reader but must not reach SQL.
    expect(readReferralCapture(SECRET, beyondSql.cookieHeader, beyondSql.visitor, nearLimit))
      .toEqual(beyondSql.claim);
    expect(locator(SECRET, () => nearLimit).locate({ cookieHeader: beyondSql.cookieHeader, actorAuthUserId: null }))
      .toEqual(INVALID);
  });

  it("U13: every outcome has only its SQL kind's exact key set", () => {
    const browser = capturedBrowser();
    const results = [
      createReferralV1RequestLocator({ enabled: false, secret: SECRET })
        .locate({ cookieHeader: undefined, actorAuthUserId: null }),
      locator(null).locate({ cookieHeader: undefined, actorAuthUserId: null }),
      locator().locate({ cookieHeader: undefined, actorAuthUserId: "invalid" }),
      locator().locate({ cookieHeader: undefined, actorAuthUserId: ACTOR }),
      locator().locate({ cookieHeader: undefined, actorAuthUserId: null }),
      locator().locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null }),
    ];
    const keys: Record<ServerReferralSource["kind"], readonly string[]> = {
      unavailable: ["kind", "reason"], account: ["actorAuthUserId", "kind"],
      guest_touch: ["claimExpiresAt", "kind", "subjectKeyHash", "touchId"],
      no_supported_touch: ["kind"],
    };
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(keys[result.kind]);
      expect(Object.keys(JSON.parse(JSON.stringify(result))).sort()).toEqual(keys[result.kind]);
    }
  });

  it("U14: refuses invalid clocks and throwing inputs without logging", () => {
    const browser = capturedBrowser();
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const)
      .map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
    try {
      for (const instant of [NaN, Infinity, -Infinity, -1, NOW + 0.5,
        SQL_EPOCH_LIMIT_MS + 1, Number.MAX_SAFE_INTEGER + 1]) {
        expect(locator(SECRET, () => instant).locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null }))
          .toEqual(INVALID);
      }
      expect(locator(SECRET, () => { throw new Error("synthetic clock refusal"); })
        .locate({ cookieHeader: browser.cookieHeader, actorAuthUserId: null })).toEqual(INVALID);
      expect(locator().locate({
        actorAuthUserId: null,
        get cookieHeader(): string | undefined { throw new Error("synthetic cookie read refusal"); },
      })).toEqual(INVALID);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
