// Partner attribution for a visitor who is not signed in.
//
// The property that matters is negative: nothing a browser sends can choose
// which partner an order attributes to. The cookie locates a touch; the durable
// authority decides whose it is and whether they may still be paid.
import { describe, expect, it, vi } from "vitest";
import { createReferralV1AttributionResolver } from "./referral-v1-attribution";
import type { ReferralV1Store } from "./referral-v1-store";
import {
  ATTRIBUTION_COOKIE_NAME,
  REFERRAL_VISITOR_COOKIE,
  createReferralVisitor,
  referralSubject,
  sealReferralCapture,
  sealReferralVisitor,
} from "./referral-v1-tokens";

const SECRET = "a".repeat(48);
const NOW = 1_800_000_000_000;
const TOUCH = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

function storeFor(
  answer: Awaited<ReturnType<ReferralV1Store["attributionForTouch"]>>,
): { store: ReferralV1Store; calls: unknown[] } {
  const calls: unknown[] = [];
  const store = {
    attributionForTouch: vi.fn(async (input: unknown) => {
      calls.push(input);
      return answer;
    }),
  } as unknown as ReferralV1Store;
  return { store, calls };
}

/** A browser that captured a referral: visitor cookie plus its sealed claim. */
function cookiesFor(touchId = TOUCH, secret = SECRET): string {
  const visitor = createReferralVisitor(NOW);
  const claim = sealReferralCapture(secret, {
    touchId,
    subjectKeyHash: referralSubject(secret, visitor),
    expiresAt: NOW + 86_400_000,
  });
  return `${REFERRAL_VISITOR_COOKIE}=${sealReferralVisitor(secret, visitor)}; ${ATTRIBUTION_COOKIE_NAME}=${claim}`;
}

function resolverWith(store: ReferralV1Store, secret: string | null = SECRET) {
  return createReferralV1AttributionResolver({ enabled: true, secret, store, now: () => NOW });
}

const resolve = (
  resolver: ReturnType<typeof createReferralV1AttributionResolver>,
  cookieHeader: string | undefined,
  actorAuthUserId: string | null = null,
) => resolver.resolve({ cookieHeader, actorAuthUserId });

describe("what the resolver will attribute", () => {
  it("does not use an existing valid cookie while referral capture is disabled", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const resolver = createReferralV1AttributionResolver({ enabled: false, secret: SECRET, store, now: () => NOW });
    expect(await resolve(resolver, cookiesFor())).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it("attributes the partner the durable authority names, and only that", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const ref = await resolve(resolverWith(store), cookiesFor());

    expect(ref).toBe(PARTNER);
    // It asked about the touch in the cookie, and passed the subject with it.
    expect(calls).toHaveLength(1);
    expect((calls[0] as { touchId: string }).touchId).toBe(TOUCH);
    expect((calls[0] as { subjectKeyHash: string }).subjectKeyHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("attributes nothing when the partner is no longer eligible", async () => {
    // A suspended or terminated partner. The cookie is perfectly valid; the
    // answer is still no.
    const { store } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: false } });
    expect(await resolve(resolverWith(store), cookiesFor())).toBeNull();
  });

  it("attributes nothing when the authority cannot be read", async () => {
    // Includes the state this ships in: the operation does not exist yet, so
    // the RPC refuses and the store reports unavailable.
    const { store } = storeFor({ ok: false, reason: "unavailable" });
    expect(await resolve(resolverWith(store), cookiesFor())).toBeNull();
  });

  it("attributes nothing for a denial", async () => {
    const { store } = storeFor({ ok: false, reason: "invalid_link" });
    expect(await resolve(resolverWith(store), cookiesFor())).toBeNull();
  });
});

describe("authenticated account ownership", () => {
  function boundStore(availability: "ready" | "partner_inactive" | "self_referral") {
    const bindingCalls: unknown[] = [], touchCalls: unknown[] = [];
    const store = {
      bindingAt: vi.fn(async (input: unknown) => {
        bindingCalls.push(input);
        return { ok: true as const, value: { binding: {
          accountKey: `auth:${ACTOR}`, touchId: TOUCH,
          linkId: "44444444-4444-4444-8444-444444444444", partnerId: PARTNER,
          boundAt: "2026-01-01T00:00:00.000Z", revisionId: TOUCH,
          effectiveAt: "2026-01-01T00:00:00.000Z", source: "capture" as const,
        }, created: false as const, availability } };
      }),
      attributionForTouch: vi.fn(async (input: unknown) => {
        touchCalls.push(input);
        return { ok: true as const, value: { partnerId: "55555555-5555-4555-8555-555555555555", eligible: true } };
      }),
    } as unknown as ReferralV1Store;
    return { store, bindingCalls, touchCalls };
  }

  it("resolves a cross-device claimed binding without any cookie or visitor secret", async () => {
    const { store, bindingCalls, touchCalls } = boundStore("ready");
    expect(await resolve(resolverWith(store, null), undefined, ACTOR)).toBe(PARTNER);
    expect(bindingCalls).toEqual([{ actorAuthUserId: ACTOR, occurredAt: new Date(NOW).toISOString() }]);
    expect(touchCalls).toHaveLength(0);
  });

  it("ignores a conflicting later cookie and preserves the first-valid account winner", async () => {
    const { store, touchCalls } = boundStore("ready");
    expect(await resolve(resolverWith(store), cookiesFor(), ACTOR)).toBe(PARTNER);
    expect(touchCalls).toHaveLength(0);
  });

  it("keeps a claimed binding after link expiry or revocation when canonical binding eligibility is ready", async () => {
    const { store } = boundStore("ready");
    expect(await resolve(resolverWith(store), undefined, ACTOR)).toBe(PARTNER);
  });

  it("does not let a current partner suspension rewrite the structural account owner", async () => {
    const { store, touchCalls } = boundStore("partner_inactive");
    expect(await resolve(resolverWith(store), cookiesFor(), ACTOR)).toBe(PARTNER);
    expect(touchCalls).toHaveLength(0);
  });

  it("fails closed if the authority reports self-referral", async () => {
    const { store, touchCalls } = boundStore("self_referral");
    expect(await resolve(resolverWith(store), cookiesFor(), ACTOR)).toBeNull();
    expect(touchCalls).toHaveLength(0);
  });
});

describe("what a browser cannot do", () => {
  it("cannot name a partner, only a touch", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    // A cookie that tries to carry a partner id outright.
    const forged = `${ATTRIBUTION_COOKIE_NAME}=xrv1.${Buffer.from(
      JSON.stringify({ partnerId: "33333333-3333-4333-8333-333333333333", expiresAt: NOW + 1000 }),
    ).toString("base64url")}.${"b".repeat(43)}`;

    expect(await resolve(resolverWith(store), forged)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot use a claim sealed with another secret", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    expect(await resolve(resolverWith(store), cookiesFor(TOUCH, "z".repeat(48)))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot present a claim without the visitor cookie that binds it to this browser", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const full = cookiesFor();
    const claimOnly = full.split("; ").find((part) => part.startsWith(`${ATTRIBUTION_COOKIE_NAME}=`))!;

    expect(await resolve(resolverWith(store), claimOnly)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot lift a claim into a different browser", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    // Another visitor's cookie beside this claim: the subject will not match.
    const other = sealReferralVisitor(SECRET, createReferralVisitor(NOW));
    const claim = cookiesFor().split("; ")[1];

    expect(await resolve(resolverWith(store), `${REFERRAL_VISITOR_COOKIE}=${other}; ${claim}`)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot attribute anything when no secret is configured", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    expect(await resolve(resolverWith(store, null), cookiesFor())).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot attribute anything with no cookie at all", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    expect(await resolve(resolverWith(store), undefined)).toBeNull();
    expect(await resolve(resolverWith(store), "")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("does not read the legacy xa1 format, which no mounted writer produces", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const legacy = `${ATTRIBUTION_COOKIE_NAME}=xa1.${Buffer.from(
      JSON.stringify({ partnerId: PARTNER, expiresAt: NOW + 1000 }),
    ).toString("base64url")}.${"c".repeat(43)}`;

    expect(await resolve(resolverWith(store), legacy)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
