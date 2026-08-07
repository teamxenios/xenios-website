import { describe, expect, it } from "vitest";
import { affiliateCodeHash, generateAffiliateCode, validateAffiliateCustomerCode } from "./access-code";
import { affiliateReadiness } from "./readiness";
import { calculateAffiliateCommission } from "./commission-engine";
import { choosePrimaryAttribution } from "./attribution";

const secret = "0123456789abcdef0123456789abcdef";

describe("affiliate v2", () => {
  it("generates and hashes a customer code without using it as a portal credential", () => {
    const code = generateAffiliateCode("HINO", 6);
    expect(code).toMatch(/^XR-HINO-[A-HJ-NP-Z2-9]{6}$/);
    expect(affiliateCodeHash(secret, code)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns one generic failure message", async () => {
    const result = await validateAffiliateCustomerCode({
      code: "XR-NOPE-AAAAAA", ipHash: "f".repeat(64), now: "2026-08-07T18:00:00.000Z",
      hmacSecret: secret, attributionWindowDays: 30,
      repo: {
        byHash: async () => null,
        recordAttempt: async () => {}, consume: async () => false,
        createAttributionSession: async () => "never",
      },
    });
    expect(result).toEqual({ valid: false, accessGranted: false, message: "This access code is invalid or no longer active. Contact Xenios support or the person who shared the invitation." });
  });

  it("requires every activation gate", () => {
    const result = affiliateReadiness({
      identityOrBusinessVerified: true, relationshipLane: "standard_affiliate", agreementSigned: true,
      commissionScheduleAssigned: true, taxFormReceived: true, payoutVerified: true,
      privacyAcknowledged: true, trainingCompleted: true, offerMatrixAssigned: true,
      testingCodeGenerated: true, referralLinkGenerated: true, testCustomerLoginPassed: true,
      testCheckoutPassed: true, testAttributionPassed: true, testConfirmationPassed: true,
      contentPackAssigned: true, namedActivationApproval: false,
    });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["named_activation_approval"]);
  });

  it("uses basis points and excludes tax/shipping", () => {
    const calculation = calculateAffiliateCommission({
      scheduleId: "sched", version: 1, firstOrderRateBps: 2000, repeatOrderRateBps: 1500,
      attributionWindowDays: 30, holdDays: 30, minimumPayoutCents: 10000,
      recurringTermMonths: null, currency: "USD",
    }, {
      settledProductRevenueCents: 25000, fundedDiscountsCents: 1000, refundsCents: 0,
      chargebacksCents: 0, complimentaryCents: 0, excludedCents: 0,
      salesTaxCents: 2000, passThroughShippingCents: 1000,
      isFirstEligibleOrder: true, productCommissionable: true, affiliateActive: true, scheduleActive: true,
    });
    expect(calculation).toEqual({ eligibleRevenueCents: 21000, rateBps: 2000, grossCommissionCents: 4200 });
  });

  it("prioritizes explicit checkout code", () => {
    const result = choosePrimaryAttribution([
      { affiliateId: "AFF-1", codeId: null, campaignId: null, method: "referral_link", occurredAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z", commissionScheduleId: "S1", commissionScheduleVersion: 1, publicOfferId: null, sourcePage: "/" },
      { affiliateId: "AFF-2", codeId: "C2", campaignId: null, method: "explicit_code", occurredAt: "2026-08-02T00:00:00.000Z", expiresAt: "2026-09-02T00:00:00.000Z", commissionScheduleId: "S2", commissionScheduleVersion: 1, publicOfferId: null, sourcePage: "/checkout" },
    ], "2026-08-07T00:00:00.000Z");
    expect(result?.affiliateId).toBe("AFF-2");
    expect(result?.method).toBe("explicit_code");
  });
});
