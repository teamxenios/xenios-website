import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_CART_ATTRIBUTION_WINDOW_MS,
  ReferralGrantCartAttribution,
  type EarlyAccessCartReferralGrantSource,
} from "./attribution-adapter";

const CUSTOMER = "eac_0123456789abcdef0123456789abcdef";
const AFFILIATE_CUSTOMER = "eac_ffffffffffffffffffffffffffffffff";
const NOW_MS = Date.parse("2026-08-19T12:00:00.000Z");

const grant = Object.freeze({
  referralCode: "XEN-PARTNER-7",
  affiliateId: "aff_partner_7",
  affiliateCustomerRef: AFFILIATE_CUSTOMER,
  holdBasisPoints: 750,
});

function source(
  answer: Awaited<ReturnType<EarlyAccessCartReferralGrantSource["forCustomer"]>>,
): EarlyAccessCartReferralGrantSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async forCustomer(customerRef: string) {
      calls.push(customerRef);
      return answer;
    },
  };
}

describe("ReferralGrantCartAttribution", () => {
  it("no grant answers null, so the checkout proceeds unattributed", async () => {
    const referrals = source(null);
    const adapter = new ReferralGrantCartAttribution({ referrals });
    await expect(adapter.snapshot(CUSTOMER, NOW_MS)).resolves.toBeNull();
    // The durable record was actually consulted, with the handle the identity
    // seam resolved, not skipped or answered from anywhere else.
    expect(referrals.calls).toEqual([CUSTOMER]);
  });

  it("a valid live grant attributes, with every field from server data", async () => {
    const adapter = new ReferralGrantCartAttribution({ referrals: source(grant) });
    const attribution = await adapter.snapshot(CUSTOMER, NOW_MS);
    expect(attribution).toEqual({
      affiliateId: "aff_partner_7",
      codeId: "XEN-PARTNER-7",
      campaignId: null,
      method: "referral_session",
      attributedAt: "2026-08-19T12:00:00.000Z",
      expiresAt: new Date(NOW_MS + EARLY_ACCESS_CART_ATTRIBUTION_WINDOW_MS).toISOString(),
      scheduleId: null,
      scheduleVersion: null,
    });
    expect(Object.isFrozen(attribution)).toBe(true);
  });

  it("an expired grant answers null, not an attribution with a past expiry", async () => {
    const expired = {
      ...grant,
      grantedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-04-01T00:00:00.000Z",
    };
    const adapter = new ReferralGrantCartAttribution({ referrals: source(expired) });
    await expect(adapter.snapshot(CUSTOMER, NOW_MS)).resolves.toBeNull();
  });

  it("a stated grant time drives the window; a live one attributes from it", async () => {
    const dated = { ...grant, grantedAt: "2026-08-01T00:00:00.000Z" };
    const adapter = new ReferralGrantCartAttribution({ referrals: source(dated) });
    const attribution = await adapter.snapshot(CUSTOMER, NOW_MS);
    expect(attribution).toMatchObject({
      attributedAt: "2026-08-01T00:00:00.000Z",
      expiresAt: new Date(
        Date.parse("2026-08-01T00:00:00.000Z") + EARLY_ACCESS_CART_ATTRIBUTION_WINDOW_MS,
      ).toISOString(),
    });
  });

  it("a grant older than the window answers null through the default policy", async () => {
    const stale = { ...grant, grantedAt: "2026-01-01T00:00:00.000Z" };
    const adapter = new ReferralGrantCartAttribution({
      referrals: source(stale),
      windowMs: 24 * 60 * 60 * 1000,
    });
    await expect(adapter.snapshot(CUSTOMER, NOW_MS)).resolves.toBeNull();
  });

  it("a self-referral grant never attributes", async () => {
    const self = { ...grant, affiliateCustomerRef: CUSTOMER };
    const adapter = new ReferralGrantCartAttribution({ referrals: source(self) });
    await expect(adapter.snapshot(CUSTOMER, NOW_MS)).resolves.toBeNull();
  });

  it.each([
    ["affiliate id", { ...grant, affiliateId: "" }],
    ["referral code", { ...grant, referralCode: "a b" }],
    ["affiliate handle", { ...grant, affiliateCustomerRef: "not-a-handle" }],
    ["zero rate", { ...grant, holdBasisPoints: 0 }],
    ["over-cap rate", { ...grant, holdBasisPoints: 10_001 }],
    ["fractional rate", { ...grant, holdBasisPoints: 12.5 }],
  ])("a grant with a malformed %s answers null", async (_field, malformed) => {
    const adapter = new ReferralGrantCartAttribution({
      referrals: source(malformed as never),
    });
    await expect(adapter.snapshot(CUSTOMER, NOW_MS)).resolves.toBeNull();
  });

  it("a foreign handle or a broken clock never reaches the resolver", async () => {
    const referrals = source(grant);
    const adapter = new ReferralGrantCartAttribution({ referrals });
    await expect(adapter.snapshot("someone-else", NOW_MS)).resolves.toBeNull();
    await expect(adapter.snapshot(CUSTOMER, Number.NaN)).resolves.toBeNull();
    await expect(adapter.snapshot(CUSTOMER, 0)).resolves.toBeNull();
    expect(referrals.calls).toEqual([]);
  });

  it("a durable read failure propagates rather than silently unattributing", async () => {
    const adapter = new ReferralGrantCartAttribution({
      referrals: {
        async forCustomer() {
          throw new Error("early-access persistence call failed: research_early_access_referral_for_customer");
        },
      },
    });
    await expect(adapter.snapshot(CUSTOMER, NOW_MS)).rejects.toThrow(
      "research_early_access_referral_for_customer",
    );
  });
});
