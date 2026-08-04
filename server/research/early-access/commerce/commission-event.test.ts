import { describe, expect, it } from "vitest";
import { createEarlyAccessOrder } from "./early-access-order";
import { verifyManualPayment, type EarlyAccessVerifiedOrder } from "./payment-verification";
import * as commissionModule from "./commission-event";
import {
  COMMISSION_HOLD_KEYS,
  EARLY_ACCESS_MAX_HOLD_BASIS_POINTS,
  buildCommissionHold,
  commissionHoldIdFor,
} from "./commission-event";

const CREATED_AT = "2026-08-04T12:00:00.000Z";
const DECIDED_AT = "2026-08-04T14:00:00.000Z";

const ATTRIBUTION = Object.freeze({
  affiliateId: "aff_alex",
  affiliateCustomerRef: "cus_alex",
  referralCode: "ALEX-2026",
  holdBasisPoints: 1_500,
});

function verifiedOrder(overrides: Record<string, unknown> = {}): EarlyAccessVerifiedOrder {
  const created = createEarlyAccessOrder({
    orderId: "ord_ea_0001",
    customerRef: "cus_samuel",
    productId: "prd_bpc157",
    variantId: "var_5mg",
    sku: "XEA-BPC-5MG",
    quantity: 2,
    unitPriceCents: 12_450,
    unitPriceVersion: "prdver-9f2c1a",
    currency: "USD",
    referralCode: "ALEX-2026",
    now: CREATED_AT,
  });
  if (!created.ok) throw new Error(`fixture order refused: ${created.code}`);
  const decided = verifyManualPayment({
    order: { ...created.value, status: "payment_under_review" },
    actor: { id: "adm_alex", role: "founder_admin" },
    decision: "approve",
    idempotencyKey: "verify-ord-ea-0001-a",
    now: DECIDED_AT,
    appliedVerifications: [],
    verifiedAmountCents: 24_900,
    verifiedCurrency: "USD",
    method: "zelle",
  });
  if (!decided.ok || !decided.value.verifiedOrder) {
    throw new Error("fixture verification refused");
  }
  return Object.freeze({
    ...decided.value.verifiedOrder,
    ...overrides,
  }) as EarlyAccessVerifiedOrder;
}

function build(
  attributionOverrides: Record<string, unknown> = {},
  orderOverrides: Record<string, unknown> = {},
) {
  return buildCommissionHold(verifiedOrder(orderOverrides), {
    ...ATTRIBUTION,
    ...attributionOverrides,
  });
}

describe("commission hold", () => {
  it("records a hold against a verified payment, never a payout", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toBe("held");
    expect(result.value.payout).toBe(false);
    expect(result.value.holdAmountCents).toBe(3_735);
    expect(result.value.currency).toBe("USD");
    expect(result.value.affiliateId).toBe("aff_alex");
    expect(result.value.referralCode).toBe("ALEX-2026");
    // Tied to the moment the human verified the payment, not to a fresh clock.
    expect(result.value.heldAt).toBe(DECIDED_AT);
    expect(result.value.holdId).toBe(commissionHoldIdFor("ord_ea_0001"));
  });

  it("rounds a partial cent down", () => {
    const result = build({ holdBasisPoints: 333 });
    expect(result.ok && result.value.holdAmountCents).toBe(829);
  });

  it("exposes exactly the reviewed key set", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([...COMMISSION_HOLD_KEYS].sort());
  });

  it("exposes no economics beyond the hold amount", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain("24900");
    expect(serialized).not.toContain("orderTotalCents");
    expect(serialized).not.toContain("1500");
    expect(serialized).not.toContain("basisPoints");
    expect(serialized).not.toContain("rate");
    expect(serialized).not.toContain("margin");
    expect(serialized).not.toContain("cost");
    expect(serialized).not.toContain("12450");
    // Nothing about the buyer, the product, or the payment.
    expect(serialized).not.toContain("cus_samuel");
    expect(serialized).not.toContain("XEA-BPC-5MG");
    expect(serialized).not.toContain("prd_bpc157");
    expect(serialized).not.toContain("zelle");
    expect(serialized).not.toContain("adm_alex");
    expect(serialized).not.toContain("quantity");
  });

  it("exports no function that could pay a commission out", () => {
    const exported = Object.keys(commissionModule).filter(
      (name) => typeof (commissionModule as unknown as Record<string, unknown>)[name] === "function",
    );
    expect(exported.sort()).toEqual([
      "buildCommissionAccrual",
      "buildCommissionHold",
      "commissionAccrualIdFor",
      "commissionBasisCentsFor",
      "commissionBreakdownFor",
      "commissionHoldFrom",
      "commissionHoldIdFor",
      "readCommissionAccrual",
    ]);
    expect(JSON.stringify(build())).not.toContain("payable");
    expect(JSON.stringify(build())).toContain("\"state\":\"held\"");
  });
});

describe("commission hold refusals", () => {
  it("refuses a self referral under either identifier", () => {
    expect(build({ affiliateCustomerRef: "cus_samuel" })).toEqual({
      ok: false,
      code: "self_referral",
    });
    expect(build({ affiliateId: "cus_samuel" })).toEqual({ ok: false, code: "self_referral" });
  });

  it("refuses attribution that does not match the code the order was placed with", () => {
    expect(build({ referralCode: "DANA-2026" })).toEqual({
      ok: false,
      code: "attribution_mismatch",
    });
  });

  it("refuses an order with no referral at all", () => {
    expect(build({}, { referralCode: null })).toEqual({ ok: false, code: "referral_missing" });
  });

  it("refuses a payment that a human has not verified", () => {
    for (const status of ["awaiting_payment", "payment_under_review", "payment_rejected"]) {
      expect(build({}, { status })).toEqual({ ok: false, code: "verified_order_invalid" });
    }
    expect(buildCommissionHold(null, ATTRIBUTION)).toEqual({
      ok: false,
      code: "verified_order_invalid",
    });
    expect(buildCommissionHold(new Proxy({ ...verifiedOrder() }, {}), ATTRIBUTION)).toEqual({
      ok: false,
      code: "verified_order_invalid",
    });
  });

  it("refuses a hold rate outside one basis point through half the order", () => {
    for (const holdBasisPoints of [
      0,
      -1,
      1.5,
      "1500",
      null,
      EARLY_ACCESS_MAX_HOLD_BASIS_POINTS + 1,
    ]) {
      const result = build({ holdBasisPoints });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("hold_rate_invalid");
    }
    expect(build({ holdBasisPoints: EARLY_ACCESS_MAX_HOLD_BASIS_POINTS }).ok).toBe(true);
  });

  it("refuses a hold that rounds away to nothing", () => {
    expect(
      build(
        { holdBasisPoints: 1 },
        {
          orderTotalCents: 1,
          verifiedAmountCents: 1,
          money: {
            currency: "USD",
            subtotalCents: 1,
            discountCents: 0,
            shippingCents: 0,
            taxCents: 0,
            payableTotalCents: 1,
            promotionId: null,
            promotionVersion: null,
          },
        },
      ),
    ).toEqual({
      ok: false,
      code: "hold_amount_invalid",
    });
  });

  it("refuses malformed or over-specified attribution", () => {
    expect(buildCommissionHold(verifiedOrder(), null)).toEqual({
      ok: false,
      code: "attribution_invalid",
    });
    expect(build({ affiliateId: "" })).toEqual({ ok: false, code: "attribution_invalid" });
    expect(buildCommissionHold(verifiedOrder(), { ...ATTRIBUTION, holdAmountCents: 99_999 })).toEqual(
      { ok: false, code: "attribution_invalid" },
    );
  });

  it("freezes the hold and is deterministic", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(() => {
      (result.value as unknown as Record<string, unknown>).holdAmountCents = 99_999;
    }).toThrow();
    expect(build()).toEqual(build());
  });
});
