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

describe("what the resolver will attribute", () => {
  it("does not use an existing valid cookie while referral capture is disabled", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const resolver = createReferralV1AttributionResolver({ enabled: false, secret: SECRET, store, now: () => NOW });
    expect(await resolver.resolve(cookiesFor())).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it("attributes the partner the durable authority names, and only that", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const ref = await resolverWith(store).resolve(cookiesFor());

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
    expect(await resolverWith(store).resolve(cookiesFor())).toBeNull();
  });

  it("attributes nothing when the authority cannot be read", async () => {
    // Includes the state this ships in: the operation does not exist yet, so
    // the RPC refuses and the store reports unavailable.
    const { store } = storeFor({ ok: false, reason: "unavailable" });
    expect(await resolverWith(store).resolve(cookiesFor())).toBeNull();
  });

  it("attributes nothing for a denial", async () => {
    const { store } = storeFor({ ok: false, reason: "invalid_link" });
    expect(await resolverWith(store).resolve(cookiesFor())).toBeNull();
  });
});

describe("what a browser cannot do", () => {
  it("cannot name a partner, only a touch", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    // A cookie that tries to carry a partner id outright.
    const forged = `${ATTRIBUTION_COOKIE_NAME}=xrv1.${Buffer.from(
      JSON.stringify({ partnerId: "33333333-3333-4333-8333-333333333333", expiresAt: NOW + 1000 }),
    ).toString("base64url")}.${"b".repeat(43)}`;

    expect(await resolverWith(store).resolve(forged)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot use a claim sealed with another secret", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    expect(await resolverWith(store).resolve(cookiesFor(TOUCH, "z".repeat(48)))).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot present a claim without the visitor cookie that binds it to this browser", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const full = cookiesFor();
    const claimOnly = full.split("; ").find((part) => part.startsWith(`${ATTRIBUTION_COOKIE_NAME}=`))!;

    expect(await resolverWith(store).resolve(claimOnly)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot lift a claim into a different browser", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    // Another visitor's cookie beside this claim: the subject will not match.
    const other = sealReferralVisitor(SECRET, createReferralVisitor(NOW));
    const claim = cookiesFor().split("; ")[1];

    expect(await resolverWith(store).resolve(`${REFERRAL_VISITOR_COOKIE}=${other}; ${claim}`)).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot attribute anything when no secret is configured", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    expect(await resolverWith(store, null).resolve(cookiesFor())).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("cannot attribute anything with no cookie at all", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    expect(await resolverWith(store).resolve(undefined)).toBeNull();
    expect(await resolverWith(store).resolve("")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("does not read the legacy xa1 format, which no mounted writer produces", async () => {
    const { store, calls } = storeFor({ ok: true, value: { partnerId: PARTNER, eligible: true } });
    const legacy = `${ATTRIBUTION_COOKIE_NAME}=xa1.${Buffer.from(
      JSON.stringify({ partnerId: PARTNER, expiresAt: NOW + 1000 }),
    ).toString("base64url")}.${"c".repeat(43)}`;

    expect(await resolverWith(store).resolve(legacy)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
