import { describe, expect, it } from "vitest";

import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import { eligibleNetRevenueCents } from "@shared/research/distribution";
import {
  EARLY_ACCESS_COMMISSION_POLICY,
  readCommissionAccrual,
} from "../commerce/commission-event";
import { cartSettlementVerificationKey, decideCartCommission } from "./commission";

const SETTLED_AT = "2026-08-19T12:00:00.000Z";

const grant = Object.freeze({
  referralCode: "XEN-PARTNER-7",
  affiliateId: "aff_partner_7",
  affiliateCustomerRef: "eac_ffffffffffffffffffffffffffffffff",
  holdBasisPoints: 1_500,
});

function checkout(
  overrides: Partial<{
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    taxCents: number;
    attribution: EarlyAccessCartCheckoutRecord["attribution"];
  }> = {},
): EarlyAccessCartCheckoutRecord {
  const subtotalCents = overrides.subtotalCents ?? 59_700;
  const discountCents = overrides.discountCents ?? 11_940;
  const shippingCents = overrides.shippingCents ?? 0;
  const taxCents = overrides.taxCents ?? 0;
  const payableTotalCents = subtotalCents - discountCents + shippingCents + taxCents;
  return {
    cartCheckoutNumber: "XEC-0123456789ABCDEF",
    customerRef: "eac_0123456789abcdef0123456789abcdef",
    contact: { email: "buyer@example.com", phone: "+15125550100" },
    shipTo: { recipientName: "Buyer", line1: "1 Main", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" },
    idempotencyKey: "xeac_1234567890123456",
    intentHash: "a".repeat(64),
    quoteId: "xeaq_1234567890123456",
    children: [
      { orderNumber: "XEA-CART-01234567-01", productId: "P", variantId: "V", sku: "SKU-1", quantity: 3, supplierId: "raw-peptides", supplierSku: "RP-1", unitPriceCents: 19_900, subtotalCents, discountCents, payableCents: subtotalCents - discountCents },
    ],
    invoice: {
      invoiceNumber: "XEI-0123456789ABCDEF",
      cartCheckoutNumber: "XEC-0123456789ABCDEF",
      paymentReference: "XEACART-0123456789ABCDEF",
      currency: "USD",
      lines: [{ orderNumber: "XEA-CART-01234567-01", sku: "SKU-1", quantity: 3, unitPriceCents: 19_900, subtotalCents, discountCents, payableCents: subtotalCents - discountCents }],
      subtotalCents,
      discountCents,
      shippingCents,
      taxCents,
      payableTotalCents,
      instructions: "manual",
      issuedAt: "2026-08-18T00:00:00.000Z",
      status: "awaiting_payment",
    },
    paymentState: "under_review",
    placedAt: "2026-08-18T00:00:00.000Z",
    attribution:
      "attribution" in overrides
        ? (overrides.attribution ?? null)
        : {
            affiliateId: "aff_partner_7",
            codeId: "XEN-PARTNER-7",
            campaignId: null,
            method: "referral_session",
            attributedAt: "2026-08-01T00:00:00.000Z",
            expiresAt: "2026-10-30T00:00:00.000Z",
            scheduleId: null,
            scheduleVersion: null,
          },
  };
}

describe("decideCartCommission", () => {
  it("an unattributed checkout earns nothing, by name", () => {
    const decision = decideCartCommission({
      checkout: checkout({ attribution: null }),
      grant,
      settledAt: SETTLED_AT,
    });
    expect(decision).toEqual({ commission: false, reason: "attribution_absent" });
  });

  it("computes the locked founder basis: subtotal less discount, nothing else", () => {
    const decision = decideCartCommission({ checkout: checkout(), grant, settledAt: SETTLED_AT });
    expect(decision.commission).toBe(true);
    if (!decision.commission) return;
    expect(decision.accrual.commissionBasisCents).toBe(47_760);
    // 15 percent of 47,760 is 7,164 exactly. Of the undiscounted 59,700 it
    // would be 8,955, which is the historical defect this basis exists to end.
    expect(decision.accrual.commissionAmountCents).toBe(7_164);
    expect(decision.accrual.commissionAmountCents).not.toBe(8_955);
    expect(decision.accrual.basis).toBe("subtotal_less_discount");
    expect(decision.accrual.commissionPolicyId).toBe(
      EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyId,
    );
    expect(decision.accrual.commissionPolicyVersion).toBe(
      EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyVersion,
    );
  });

  it("agrees with the partner ledger's own definition of eligible net revenue", () => {
    const record = checkout();
    const decision = decideCartCommission({ checkout: record, grant, settledAt: SETTLED_AT });
    expect(decision.commission).toBe(true);
    if (!decision.commission) return;
    expect(decision.accrual.commissionBasisCents).toBe(
      eligibleNetRevenueCents({
        grossItemsCents: record.invoice.subtotalCents,
        taxCents: record.invoice.taxCents,
        shippingCents: record.invoice.shippingCents,
        discountsCents: record.invoice.discountCents,
        storeCreditAppliedCents: 0,
        refundedCents: 0,
        chargebackCents: 0,
        ineligibleCategoryCents: 0,
      }),
    );
  });

  it("shipping and tax never change the basis, in either direction", () => {
    const withCosts = decideCartCommission({
      checkout: checkout({ shippingCents: 1_500, taxCents: 3_000 }),
      grant,
      settledAt: SETTLED_AT,
    });
    expect(withCosts.commission).toBe(true);
    if (!withCosts.commission) return;
    expect(withCosts.accrual.commissionBasisCents).toBe(47_760);
  });

  it("the accrual round-trips the existing fail-closed reader and derives the hold", () => {
    const decision = decideCartCommission({ checkout: checkout(), grant, settledAt: SETTLED_AT });
    expect(decision.commission).toBe(true);
    if (!decision.commission) return;
    expect(readCommissionAccrual(decision.accrual)).toEqual(decision.accrual);
    expect(decision.accrual.orderReference).toBe("XEC-0123456789ABCDEF");
    expect(decision.accrual.verificationIdempotencyKey).toBe(
      cartSettlementVerificationKey("XEC-0123456789ABCDEF"),
    );
    expect(decision.accrual.accruedAt).toBe(SETTLED_AT);
    expect(decision.hold).toEqual({
      holdId: "early-access-commission-hold:XEC-0123456789ABCDEF",
      orderReference: "XEC-0123456789ABCDEF",
      affiliateId: "aff_partner_7",
      referralCode: "XEN-PARTNER-7",
      state: "held",
      holdAmountCents: 7_164,
      currency: "USD",
      heldAt: SETTLED_AT,
      payout: false,
    });
  });

  it("a revoked grant earns nothing: silence is the safe answer about money", () => {
    const decision = decideCartCommission({ checkout: checkout(), grant: null, settledAt: SETTLED_AT });
    expect(decision).toEqual({ commission: false, reason: "grant_missing" });
  });

  it("a grant re-pointed at another affiliate credits NOBODY", () => {
    const decision = decideCartCommission({
      checkout: checkout(),
      grant: { ...grant, affiliateId: "aff_somebody_else" },
      settledAt: SETTLED_AT,
    });
    expect(decision).toEqual({ commission: false, reason: "attribution_mismatch" });
  });

  it("an affiliate cannot earn on their own order under either handle", () => {
    const own = checkout();
    expect(
      decideCartCommission({
        checkout: own,
        grant: { ...grant, affiliateCustomerRef: own.customerRef },
        settledAt: SETTLED_AT,
      }),
    ).toEqual({ commission: false, reason: "self_referral" });
    // The wholly self-consistent variant: the checkout was ATTRIBUTED to the
    // buyer's own handle and the grant agrees. Consistency does not launder it.
    const selfAttributed = checkout({
      attribution: {
        affiliateId: own.customerRef,
        codeId: "XEN-PARTNER-7",
        campaignId: null,
        method: "referral_session",
        attributedAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2026-10-30T00:00:00.000Z",
        scheduleId: null,
        scheduleVersion: null,
      },
    });
    expect(
      decideCartCommission({
        checkout: selfAttributed,
        grant: { ...grant, affiliateId: own.customerRef },
        settledAt: SETTLED_AT,
      }),
    ).toEqual({ commission: false, reason: "self_referral" });
  });

  it("refuses a rate of nothing, a fractional rate, and a rate over the ceiling", () => {
    for (const holdBasisPoints of [0, 12.5, 5_001]) {
      expect(
        decideCartCommission({
          checkout: checkout(),
          grant: { ...grant, holdBasisPoints },
          settledAt: SETTLED_AT,
        }),
      ).toEqual({ commission: false, reason: "hold_rate_invalid" });
    }
  });

  it("a commission that rounds to nothing is not recorded", () => {
    const decision = decideCartCommission({
      checkout: checkout({ subtotalCents: 500, discountCents: 495 }),
      grant: { ...grant, holdBasisPoints: 100 },
      settledAt: SETTLED_AT,
    });
    expect(decision).toEqual({ commission: false, reason: "hold_amount_invalid" });
  });
});
