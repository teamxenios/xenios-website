// The attribution spine end to end, over the real modules: the capture door
// validates the code and mints the signed cookie, the identity decorator
// turns that cookie into a durable customer binding at the first identified
// request, and the grant adapter translates the binding for the Early Access
// cart lane — refusing economics while the program is not activated and
// emitting the exact grant shape once it is. An invalid code changes nothing
// anywhere: the visit succeeds, no cookie, no touch, no binding, no grant.

import { describe, expect, it } from "vitest";
import { DEFAULT_LAUNCH_PROGRAM } from "../../../shared/research/affiliate-program/config";
import {
  createAttributionService,
  createInMemoryAttributionRepository,
} from "./attribution";
import {
  createInMemoryAttributionTouchStore,
  createInMemoryPartnerLinkStore,
} from "../commerce/persistence/partners-store";
import {
  REFERRAL_CAPTURE_PATH,
  createReferralCaptureRouteTable,
} from "./referral-capture-routes";
import {
  createCustomerAttributionBinder,
  createInMemoryAffiliateCustomerBindingStore,
  withCustomerAttributionBinding,
} from "./customer-attribution-binding";
import { earlyAccessGrantFromBinding } from "./early-access-grant-adapter";

const SECRET = "spine-secret";
const NOW = new Date("2026-08-19T12:00:00.000Z");
const CUSTOMER = "eac_0123456789abcdef0123456789abcdef";
const AFFILIATE_EA_REF = "eac_fedcba9876543210fedcba9876543210";

async function harness() {
  const service = createAttributionService({
    repository: createInMemoryAttributionRepository(),
    linkSecret: SECRET,
    linkBaseUrl: "https://xeniostechnology.com",
  });
  const links = createInMemoryPartnerLinkStore();
  const touches = createInMemoryAttributionTouchStore();

  // One signed link (never stored) and one stored short code, the two real
  // arrival shapes the capture door accepts.
  const signedCode = service.signCode("partner-1", "nonce-1");
  await links.saveLink({
    code: "SPRING24",
    partnerId: "partner-1",
    channel: "code",
    campaign: null,
    issuedAt: NOW.toISOString(),
  });

  const routes = createReferralCaptureRouteTable({
    linkSecret: SECRET,
    attribution: service,
    links,
    touches,
    program: DEFAULT_LAUNCH_PROGRAM,
    clock: () => NOW,
    newVisitorId: () => "visitor-1",
  });
  const captureRoute = routes.find((route) => route.path === REFERRAL_CAPTURE_PATH);
  if (!captureRoute) throw new Error("capture descriptor missing");

  async function capture(ref: string): Promise<string | null> {
    const response = await captureRoute!.handler({
      method: "GET",
      path: REFERRAL_CAPTURE_PATH,
      headers: {},
      query: { ref },
      params: {},
    });
    expect(response.status).toBe(204);
    const setCookie = response.headers["set-cookie"];
    // The cookie pair alone is what the browser would send back.
    return setCookie ? setCookie.split(";")[0] : null;
  }

  const bindings = createInMemoryAffiliateCustomerBindingStore();
  const binder = createCustomerAttributionBinder({
    linkSecret: SECRET,
    bindings,
    program: null, // economics NOT activated for the bind: pending_program
    clock: () => NOW,
  });
  const identity = withCustomerAttributionBinding(
    { resolve: async () => ({ customerRef: CUSTOMER }) },
    binder,
  );

  return { service, touches, capture, bindings, binder, identity, signedCode };
}

describe("attribution spine: landing -> cookie -> bind -> grant", () => {
  it("carries a signed-link referral from capture to a pending_program binding, then to a grant once activated", async () => {
    const h = await harness();

    // 1. Landing with a valid signed code: 204 plus the signed cookie, and
    //    the durable touch under the derived subject key.
    const cookieHeader = await h.capture(h.signedCode);
    expect(cookieHeader).not.toBeNull();
    const subjectKey = h.service.deriveSubjectKey("visitor-1");
    const touchesWritten = await h.touches.touchesFor(subjectKey);
    expect(touchesWritten).toHaveLength(1);
    expect(touchesWritten[0].partnerId).toBe("partner-1");

    // 2. The first identified request binds. Identity itself is untouched.
    const resolved = await h.identity.resolve({ cookieHeader: cookieHeader! });
    expect(resolved).toEqual({ customerRef: CUSTOMER });
    const binding = await h.bindings.findByCustomerKey(CUSTOMER);
    expect(binding).not.toBeNull();
    expect(binding!.partnerId).toBe("partner-1");
    expect(binding!.code).toBe(h.signedCode);
    expect(binding!.subjectKey).toBe(subjectKey);
    expect(binding!.programState).toBe("pending_program");

    // 3. Economics not approved: the grant refuses by name and invents nothing.
    await expect(
      earlyAccessGrantFromBinding(binding!, {
        program: null,
        affiliateCustomerRefFor: async () => AFFILIATE_EA_REF,
      }),
    ).resolves.toEqual({ ok: false, reason: "pending_program" });

    // 4. Founder activates: the SAME preserved binding translates, reading
    //    the rate NOW, with the over-long signed code carried as its digest.
    const granted = await earlyAccessGrantFromBinding(binding!, {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async () => AFFILIATE_EA_REF,
    });
    expect(granted.ok).toBe(true);
    if (granted.ok) {
      expect(granted.grant.customerRef).toBe(CUSTOMER);
      expect(granted.grant.affiliateId).toBe("partner-1");
      expect(granted.grant.affiliateCustomerRef).toBe(AFFILIATE_EA_REF);
      expect(granted.grant.holdBasisPoints).toBe(
        DEFAULT_LAUNCH_PROGRAM.firstOrderRateBasisPoints,
      );
      expect(granted.grant.referralCode.startsWith("xc")).toBe(true);
    }
  });

  it("carries a stored short code verbatim into the binding", async () => {
    const h = await harness();
    const cookieHeader = await h.capture("SPRING24");
    expect(cookieHeader).not.toBeNull();
    await h.identity.resolve({ cookieHeader: cookieHeader! });
    const binding = await h.bindings.findByCustomerKey(CUSTOMER);
    expect(binding!.code).toBe("SPRING24");
    const granted = await earlyAccessGrantFromBinding(binding!, {
      program: DEFAULT_LAUNCH_PROGRAM,
      affiliateCustomerRefFor: async () => AFFILIATE_EA_REF,
    });
    expect(granted.ok && granted.grant.referralCode).toBe("SPRING24");
  });

  it("gives an invalid code a normal journey and no attribution anywhere", async () => {
    const h = await harness();

    // The door answers 204 with no cookie — indistinguishable from a hit
    // apart from the cookie itself.
    const cookieHeader = await h.capture("TOTALLY-FAKE-CODE");
    expect(cookieHeader).toBeNull();

    // No touch was written for any subject this deployment can derive.
    const subjectKey = h.service.deriveSubjectKey("visitor-1");
    await expect(h.touches.touchesFor(subjectKey)).resolves.toHaveLength(0);

    // Identity still resolves; nothing binds; nothing can be granted.
    const resolved = await h.identity.resolve({ cookieHeader: undefined });
    expect(resolved).toEqual({ customerRef: CUSTOMER });
    await expect(h.bindings.findByCustomerKey(CUSTOMER)).resolves.toBeNull();
  });

  it("keeps the first binding even when a rival partner's cookie arrives after sign-in", async () => {
    const h = await harness();
    const first = await h.capture(h.signedCode);
    await h.identity.resolve({ cookieHeader: first! });

    // A later visit lands on a rival partner's signed link; capture mints a
    // fresh cookie for partner-2, but the customer's binding is settled.
    const rivalSigned = h.service.signCode("partner-2", "nonce-2");
    const rivalCookie = await h.capture(rivalSigned);
    expect(rivalCookie).not.toBeNull();
    await h.identity.resolve({ cookieHeader: rivalCookie! });

    const binding = await h.bindings.findByCustomerKey(CUSTOMER);
    expect(binding!.partnerId).toBe("partner-1");
    expect(binding!.code).toBe(h.signedCode);
  });
});
