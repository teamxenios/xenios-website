/**
 * The money the customer actually owes, end to end.
 *
 * This suite exists because of one defect: `orderTotalCents` is structurally
 * `unitPriceCents * quantity`, which is the PRE-DISCOUNT merchandise subtotal, and the
 * receipt and the affiliate commission were both built from it. On a three unit bundle
 * the customer owes 47,760 while both of those read 59,700.
 *
 * Every assertion below states exact cents on purpose. A test that asserts a
 * relationship rather than a number cannot catch a defect that keeps the relationship
 * and changes the number.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_PROMOTIONS,
  earlyAccessPromotionDiscountCents,
  earlyAccessPromotionFor,
  earlyAccessPromotionVersion,
  type EarlyAccessPromotion,
} from "./promotion";
import {
  createEarlyAccessOrder,
  readEarlyAccessOrder,
  type EarlyAccessOrder,
} from "./early-access-order";
import { buildInvoice } from "./early-access-invoice";
import { earlyAccessPaymentReferenceFor } from "./invoice-service";
import {
  verifyManualPayment,
  type EarlyAccessVerifiedOrder,
  type EarlyAccessVerificationResult,
} from "./payment-verification";
import { classifyAgainstPayable, reconcilePayment } from "./payment-reconciliation";
import {
  EARLY_ACCESS_DEFAULT_OVERPAYMENT_ACTION,
  recordOverpaymentException,
  type EarlyAccessOverpaymentException,
} from "./payment-exception";
import {
  EARLY_ACCESS_COMMISSION_POLICY,
  buildCommissionAccrual,
  buildCommissionHold,
  commissionBasisCentsFor,
  commissionBreakdownFor,
  readCommissionAccrual,
} from "./commission-event";
import { eligibleNetRevenueCents } from "@shared/research/distribution";
import {
  buildRefundAdjustment,
  outstandingCommissionCents,
  recordRefund,
  reversalCentsFor,
} from "./refund";
import { buildAdminPaymentReview, buildCustomerOrderView } from "./order-views";

const CREATED_AT = "2026-08-04T12:00:00.000Z";
const DECIDED_AT = "2026-08-04T14:00:00.000Z";
const REFUNDED_AT = "2026-08-05T09:00:00.000Z";
const PRICE_VERSION = "prdver-9f2c1a";
const UNIT_PRICE_CENTS = 19_900;
const KEY = "verify-ord-ea-money-0001";

const FOUNDER = Object.freeze({ id: "adm_alex", role: "founder_admin" as const });

function order(
  quantity: number,
  overrides: Record<string, unknown> = {},
  promotions: readonly EarlyAccessPromotion[] = EARLY_ACCESS_PROMOTIONS,
): EarlyAccessOrder {
  const result = createEarlyAccessOrder(
    {
      orderId: "ord_ea_money_0001",
      customerRef: "cus_samuel",
      productId: "prd_bpc157",
      variantId: "var_5mg",
      sku: "XEA-BPC-5MG",
      quantity,
      unitPriceCents: UNIT_PRICE_CENTS,
      unitPriceVersion: PRICE_VERSION,
      currency: "USD",
      referralCode: "ALEX-2026",
      now: CREATED_AT,
      ...overrides,
    },
    promotions,
  );
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return result.value;
}

function verify(
  quantity: number,
  verifiedAmountCents: number,
  extra: Record<string, unknown> = {},
): EarlyAccessVerificationResult {
  return verifyManualPayment({
    order: { ...order(quantity), status: "payment_under_review" },
    actor: FOUNDER,
    decision: "approve",
    idempotencyKey: KEY,
    now: DECIDED_AT,
    appliedVerifications: [],
    verifiedAmountCents,
    verifiedCurrency: "USD",
    method: "zelle",
    ...extra,
  });
}

function verified(
  quantity: number,
  verifiedAmountCents: number,
  extra: Record<string, unknown> = {},
): EarlyAccessVerifiedOrder {
  const result = verify(quantity, verifiedAmountCents, extra);
  if (!result.ok || !result.value.verifiedOrder) {
    throw new Error(`fixture verification refused: ${result.ok ? "no order" : result.code}`);
  }
  return result.value.verifiedOrder;
}

// ---------------------------------------------------------------------------
// The bundle arithmetic, in exact cents
// ---------------------------------------------------------------------------

describe("the amount owed, in exact cents", () => {
  it("charges the full price for one unit", () => {
    const money = order(1).money;
    expect(money.subtotalCents).toBe(19_900);
    expect(money.discountCents).toBe(0);
    expect(money.payableTotalCents).toBe(19_900);
    expect(money.promotionId).toBeNull();
    expect(money.promotionVersion).toBeNull();
  });

  it("charges the full price for two units", () => {
    const money = order(2).money;
    expect(money.subtotalCents).toBe(39_800);
    expect(money.discountCents).toBe(0);
    expect(money.payableTotalCents).toBe(39_800);
    expect(money.promotionId).toBeNull();
  });

  it("takes exactly twenty percent off three units", () => {
    const placed = order(3);
    expect(placed.money.subtotalCents).toBe(59_700);
    expect(placed.money.discountCents).toBe(11_940);
    expect(placed.money.payableTotalCents).toBe(47_760);
    expect(placed.money.promotionId).toBe("early-access-bundle-3");
    // The pre-discount subtotal is still exactly unit price times quantity, and it is
    // still stated on the order. It is simply not the amount anyone is asked to pay.
    expect(placed.orderTotalCents).toBe(59_700);
    expect(placed.line.lineTotalCents).toBe(59_700);
  });

  it("drops the fractional cent rather than inventing one, on a non even total", () => {
    // 19,999 x 3 = 59,997. Twenty percent is 11,999.4 cents.
    const placed = order(3, { unitPriceCents: 19_999 });
    expect(placed.money.subtotalCents).toBe(59_997);
    expect(placed.money.discountCents).toBe(11_999);
    expect(placed.money.payableTotalCents).toBe(47_998);

    // 33,333 x 3 = 99,999. Twenty percent is 19,999.8 cents.
    const odd = order(3, { unitPriceCents: 33_333 });
    expect(odd.money.subtotalCents).toBe(99_999);
    expect(odd.money.discountCents).toBe(19_999);
    expect(odd.money.payableTotalCents).toBe(80_000);

    // 1 cent x 3 = 3. Twenty percent of 3 cents rounds away entirely.
    const tiny = order(3, { unitPriceCents: 1 });
    expect(tiny.money.subtotalCents).toBe(3);
    expect(tiny.money.discountCents).toBe(0);
    expect(tiny.money.payableTotalCents).toBe(3);
    expect(tiny.promotion).toBeNull();
  });

  /**
   * The 14 distinct founder-approved unit prices from the first release.
   *
   * READ THE NEXT SENTENCE BEFORE TRUSTING THIS TEST. Twenty percent of every
   * subtotal below lands on a whole cent, so not one of these rows reaches the
   * floor in `earlyAccessPromotionDiscountCents`. This test proves the discount
   * is right for the prices that exist today; it CANNOT catch a rounding defect,
   * and it must never be treated as the evidence that rounding works. The
   * non-divisible cases immediately above are that evidence, and they stay.
   *
   * The day a price ending in an odd cent is approved, the floor path runs
   * against real money for the first time, and only those cases will be
   * standing under it.
   *
   * Verified independently against the server rule
   * `discount = floor(subtotal * 2000 / 10000)` rather than copied from the
   * price sheet, so a wrong sheet would fail here instead of being ratified.
   */
  const FIRST_RELEASE_UNIT_PRICES_AT_THREE = [
    [5_600, 16_800, 3_360, 13_440],
    [3_350, 10_050, 2_010, 8_040],
    [4_750, 14_250, 2_850, 11_400],
    [14_000, 42_000, 8_400, 33_600],
    [7_000, 21_000, 4_200, 16_800],
    [2_250, 6_750, 1_350, 5_400],
    [4_200, 12_600, 2_520, 10_080],
    [8_400, 25_200, 5_040, 20_160],
    [5_050, 15_150, 3_030, 12_120],
    [4_475, 13_425, 2_685, 10_740],
    [10_075, 30_225, 6_045, 24_180],
    [3_925, 11_775, 2_355, 9_420],
    [5_325, 15_975, 3_195, 12_780],
    [10_650, 31_950, 6_390, 25_560],
  ] as const;

  it.each(FIRST_RELEASE_UNIT_PRICES_AT_THREE)(
    "prices the real %i-cent unit at three for %i less %i = %i",
    (unitPriceCents, subtotalCents, discountCents, payableTotalCents) => {
      const placed = order(3, { unitPriceCents });
      expect(placed.money.subtotalCents).toBe(subtotalCents);
      expect(placed.money.discountCents).toBe(discountCents);
      expect(placed.money.payableTotalCents).toBe(payableTotalCents);
      // Only the single-unit price is ever stored. The bundle total is computed,
      // because a persisted bundle price is a second source of truth and the two
      // drift the moment either is edited.
      expect(placed.line.unitPriceCents).toBe(unitPriceCents);
      expect(placed.orderTotalCents).toBe(subtotalCents);
    },
  );

  it.each(FIRST_RELEASE_UNIT_PRICES_AT_THREE)(
    "charges the real %i-cent unit at full price below the bundle threshold",
    (unitPriceCents) => {
      const one = order(1, { unitPriceCents });
      expect(one.money.discountCents).toBe(0);
      expect(one.money.payableTotalCents).toBe(unitPriceCents);
      expect(one.money.promotionId).toBeNull();

      const two = order(2, { unitPriceCents });
      expect(two.money.discountCents).toBe(0);
      expect(two.money.payableTotalCents).toBe(unitPriceCents * 2);
      expect(two.money.promotionId).toBeNull();
    },
  );

  it(
    "never rounds a discount up, across the whole supported price range",
    () => {
      for (let unit = 1; unit <= 500_000; unit += 997) {
        for (const promotion of EARLY_ACCESS_PROMOTIONS) {
          const subtotal = unit * promotion.eligibleQuantity;
          const discount = earlyAccessPromotionDiscountCents(
            subtotal,
            promotion.discountBasisPoints,
          );
          expect(Number.isSafeInteger(discount)).toBe(true);
          expect(discount * 10_000).toBeLessThanOrEqual(subtotal * promotion.discountBasisPoints);
          expect((discount + 1) * 10_000).toBeGreaterThan(
            subtotal * promotion.discountBasisPoints,
          );
          expect(subtotal - discount).toBeGreaterThan(0);
        }
      }
    },
    // The candidate expands the promotion table from 20 to 50 quantities, so
    // this exhaustive cent/property loop now performs 2.5x the assertions.
    15_000,
  );
});

// ---------------------------------------------------------------------------
// The promotion is a server fact, and it is historical
// ---------------------------------------------------------------------------

describe("the promotion is server side and versioned", () => {
  it("refuses a request that names its own promotion or discount", () => {
    for (const key of ["promotionId", "discountCents", "discount", "payableTotalCents"]) {
      const result = createEarlyAccessOrder({
        orderId: "ord_ea_money_0001",
        customerRef: "cus_samuel",
        productId: "prd_bpc157",
        variantId: "var_5mg",
        sku: "XEA-BPC-5MG",
        quantity: 3,
        unitPriceCents: UNIT_PRICE_CENTS,
        unitPriceVersion: PRICE_VERSION,
        currency: "USD",
        now: CREATED_AT,
        [key]: 1,
      });
      expect(result).toEqual({ ok: false, code: "client_total_supplied" });
    }
  });

  it("stores the rule, the version, the quantity, the price version and the amounts", () => {
    const placed = order(3);
    const promotion = earlyAccessPromotionFor(3);
    expect(promotion).not.toBeNull();
    expect(placed.unitPriceVersion).toBe(PRICE_VERSION);
    expect(placed.promotion).toEqual({
      promotionId: "early-access-bundle-3",
      promotionVersion: promotion?.promotionVersion,
      rule: "bundle_quantity_percentage",
      eligibleQuantity: 3,
      discountBasisPoints: 2_000,
      subtotalCents: 59_700,
      discountCents: 11_940,
      payableTotalCents: 47_760,
    });
  });

  it("changes the version when the rule changes", () => {
    const rule = {
      promotionId: "early-access-bundle-3",
      rule: "bundle_quantity_percentage" as const,
      eligibleQuantity: 3,
      discountBasisPoints: 2_000,
      label: "3-Unit Bundle",
    };
    expect(earlyAccessPromotionVersion(rule)).toBe(
      earlyAccessPromotionFor(3)?.promotionVersion,
    );
    expect(earlyAccessPromotionVersion({ ...rule, discountBasisPoints: 2_500 })).not.toBe(
      earlyAccessPromotionVersion(rule),
    );
  });

  it("stops NEW orders when a promotion is withdrawn, and rewrites no historical one", () => {
    const historical = order(3);
    expect(historical.money.payableTotalCents).toBe(47_760);

    const withoutBundle = EARLY_ACCESS_PROMOTIONS.filter(
      (promotion) => promotion.eligibleQuantity !== 3,
    );
    const now = createEarlyAccessOrder(
      {
        orderId: "ord_ea_money_0002",
        customerRef: "cus_samuel",
        productId: "prd_bpc157",
        variantId: "var_5mg",
        sku: "XEA-BPC-5MG",
        quantity: 3,
        unitPriceCents: UNIT_PRICE_CENTS,
        unitPriceVersion: PRICE_VERSION,
        currency: "USD",
        now: CREATED_AT,
      },
      withoutBundle,
    );
    // A withdrawn promotion stops the sale rather than quietly charging full price.
    expect(now).toEqual({ ok: false, code: "promotion_unavailable" });

    // The order already placed still reads, still states its twenty percent, and still
    // names the exact rule version that authorized it.
    const reread = readEarlyAccessOrder({ ...historical });
    expect(reread?.money.payableTotalCents).toBe(47_760);
    expect(reread?.money.discountCents).toBe(11_940);
    expect(reread?.promotion?.promotionVersion).toBe(historical.promotion?.promotionVersion);
  });

  it("keeps a historical order's approved price and promotion after the price moves", () => {
    const historical = order(3);
    // The catalog reprices the unit. The stored order is unaffected: it carries the
    // price it was sold at and the version of the price that was approved.
    const reread = readEarlyAccessOrder({ ...historical });
    expect(reread?.line.unitPriceCents).toBe(19_900);
    expect(reread?.unitPriceVersion).toBe(PRICE_VERSION);
    expect(reread?.money.payableTotalCents).toBe(47_760);
  });

  it("refuses a stored order whose discount does not follow its own stored rule", () => {
    const placed = order(3);
    const tamperedMoney = {
      ...placed,
      money: { ...placed.money, discountCents: 20_000, payableTotalCents: 39_700 },
    };
    expect(readEarlyAccessOrder(tamperedMoney)).toBeNull();

    const tamperedPromotion = {
      ...placed,
      promotion: { ...placed.promotion, discountBasisPoints: 5_000 },
    };
    expect(readEarlyAccessOrder(tamperedPromotion)).toBeNull();

    // A discount with the promotion snapshot removed is unattributable.
    const orphaned = { ...placed, promotion: null };
    expect(readEarlyAccessOrder(orphaned)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Invoice and payment reference
// ---------------------------------------------------------------------------

describe("the invoice bills the payable total", () => {
  it("states the payable total as the amount due, never the subtotal", () => {
    const reference = earlyAccessPaymentReferenceFor("ord_ea_money_0001");
    const invoice = buildInvoice(order(3), reference);
    expect(invoice.ok).toBe(true);
    if (!invoice.ok) return;
    expect(invoice.value.amountDueCents).toBe(47_760);
    expect(invoice.value.subtotalCents).toBe(59_700);
    expect(invoice.value.discountCents).toBe(11_940);
    // The reference a customer quotes is attached to the amount they actually owe.
    expect(invoice.value.paymentReference).toBe(reference);
  });
});

// ---------------------------------------------------------------------------
// Verification compares against the payable total
// ---------------------------------------------------------------------------

describe("verification compares against the payable total", () => {
  it("verifies the exact discounted amount", () => {
    const result = verify(3, 47_760);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.classification).toBe("EXACT_MATCH");
    expect(result.value.verifiedOrder?.verifiedAmountCents).toBe(47_760);
    expect(result.value.verifiedOrder?.money.payableTotalCents).toBe(47_760);
  });

  it("classifies the undiscounted subtotal as an OVERPAYMENT and does not approve it", () => {
    // This is the exact defect. A customer looking at a three unit bundle sends 59,700.
    const result = verify(3, 59_700);
    expect(result).toEqual({ ok: false, code: "payment_overpaid" });

    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 59_700,
      observedCurrency: "USD",
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.classification).toBe("OVERPAYMENT");
    expect(reconciled.value.payableTotalCents).toBe(47_760);
    expect(reconciled.value.varianceCents).toBe(11_940);
    expect(reconciled.value.approvable).toBe(false);
    expect(reconciled.value.requiresException).toBe(true);
    // No credit is created anywhere by classifying it.
    expect(JSON.stringify(reconciled.value)).not.toContain("credit");
  });

  it("refuses an underpayment outright, with no exception that could approve it", () => {
    expect(verify(3, 47_759)).toEqual({ ok: false, code: "payment_underpaid" });
    expect(verify(3, 1)).toEqual({ ok: false, code: "payment_underpaid" });

    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 47_759,
      observedCurrency: "USD",
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.classification).toBe("UNDERPAYMENT");
    expect(reconciled.value.varianceCents).toBe(-1);

    // Even a recorded exception cannot be built for a shortfall.
    expect(
      recordOverpaymentException({
        orderId: "ord_ea_money_0001",
        reconciliation: reconciled.value,
        actor: FOUNDER,
        reason: "The customer says they will send the rest.",
        grantedAt: DECIDED_AT,
      }),
    ).toEqual({ ok: false, code: "not_overpaid" });
  });

  it("refuses a payment in another currency, and it is not exceptable", () => {
    const result = verify(3, 47_760, { verifiedCurrency: "EUR" });
    expect(result).toEqual({ ok: false, code: "currency_mismatch" });

    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 47_760,
      observedCurrency: "EUR",
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.value.classification).toBe("CURRENCY_MISMATCH");
    expect(reconciled.value.requiresException).toBe(false);
  });

  it("classifies a transaction reference that already settled as a duplicate", () => {
    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 47_760,
      observedCurrency: "USD",
      transactionRef: "zelle-8837-aa",
      settledTransactionRefs: ["zelle-8837-aa"],
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    // The amount is perfect, which is exactly why the reference has to be checked.
    expect(reconciled.value.classification).toBe("DUPLICATE_TRANSACTION");
    expect(reconciled.value.approvable).toBe(false);
    expect(reconciled.value.requiresException).toBe(false);
  });

  it("classifies each of the five outcomes from the payable total alone", () => {
    const money = order(3).money;
    expect(classifyAgainstPayable(money.payableTotalCents, "USD", 47_760, "USD")).toBe(
      "EXACT_MATCH",
    );
    expect(classifyAgainstPayable(money.payableTotalCents, "USD", 47_759, "USD")).toBe(
      "UNDERPAYMENT",
    );
    expect(classifyAgainstPayable(money.payableTotalCents, "USD", 59_700, "USD")).toBe(
      "OVERPAYMENT",
    );
    expect(classifyAgainstPayable(money.payableTotalCents, "USD", 47_760, "EUR")).toBe(
      "CURRENCY_MISMATCH",
    );
  });

  it("reports a replay and refuses a second decision under one key with another amount", () => {
    const first = verify(3, 47_760);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const replay = verifyManualPayment({
      order: { ...order(3), status: "payment_verified" },
      actor: FOUNDER,
      decision: "approve",
      idempotencyKey: KEY,
      now: "2026-08-04T18:00:00.000Z",
      appliedVerifications: [first.value.record],
      verifiedAmountCents: 47_760,
      verifiedCurrency: "USD",
      method: "zelle",
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.outcome).toBe("replayed");
    expect(replay.value.commit.firstApplication).toBe(false);
    expect(replay.value.receiptIntent?.payableTotalCents).toBe(47_760);

    // A replay under the same key that confirms a DIFFERENT amount is a second
    // decision wearing one name. The amount is part of the replay identity, so it
    // conflicts rather than quietly reporting the first decision.
    const exception = overpaymentException();
    const conflicting = verifyManualPayment({
      order: { ...order(3), status: "payment_verified" },
      actor: FOUNDER,
      decision: "approve",
      idempotencyKey: KEY,
      now: "2026-08-04T18:00:00.000Z",
      appliedVerifications: [first.value.record],
      verifiedAmountCents: 59_700,
      verifiedCurrency: "USD",
      method: "zelle",
      exception: { ...exception },
    });
    expect(conflicting).toEqual({ ok: false, code: "idempotency_conflict" });
  });

  it("refuses a concurrent second approval under a different key", () => {
    const first = verify(3, 47_760);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const concurrent = verifyManualPayment({
      order: { ...order(3), status: "payment_verified" },
      actor: { id: "adm_other", role: "operations_admin" },
      decision: "approve",
      idempotencyKey: "verify-ord-ea-money-0002",
      now: "2026-08-04T18:00:00.000Z",
      appliedVerifications: [first.value.record],
      verifiedAmountCents: 47_760,
      verifiedCurrency: "USD",
      method: "zelle",
    });
    // Reported as a no-op carrying the ORIGINAL record, so the effect happens once.
    expect(concurrent.ok).toBe(true);
    if (!concurrent.ok) return;
    expect(concurrent.value.outcome).toBe("noop");
    expect(concurrent.value.commit.firstApplication).toBe(false);
    expect(concurrent.value.record).toEqual(first.value.record);
  });
});

// ---------------------------------------------------------------------------
// The overpayment path
// ---------------------------------------------------------------------------

function overpaymentException(
  action?: string,
  extra: Record<string, unknown> = {},
): EarlyAccessOverpaymentException {
  const reconciled = reconcilePayment({
    money: order(3).money,
    observedAmountCents: 59_700,
    observedCurrency: "USD",
  });
  if (!reconciled.ok) throw new Error("fixture reconciliation refused");
  const result = recordOverpaymentException({
    orderId: "ord_ea_money_0001",
    reconciliation: reconciled.value,
    actor: FOUNDER,
    reason: "Customer paid the undiscounted list price by mistake.",
    grantedAt: DECIDED_AT,
    ...(action === undefined ? {} : { action }),
    ...extra,
  });
  if (!result.ok) throw new Error(`fixture exception refused: ${result.code}`);
  return result.value;
}

describe("an overpayment is recorded and decided, never absorbed", () => {
  it("records the expected amount, the received amount and the excess", () => {
    const exception = overpaymentException();
    expect(exception.expectedAmountCents).toBe(47_760);
    expect(exception.receivedAmountCents).toBe(59_700);
    expect(exception.excessCents).toBe(11_940);
    expect(exception.actorId).toBe("adm_alex");
    expect(exception.actorRole).toBe("founder_admin");
  });

  it("defaults to refunding the difference", () => {
    const exception = overpaymentException();
    expect(exception.action).toBe(EARLY_ACCESS_DEFAULT_OVERPAYMENT_ACTION);
    expect(exception.action).toBe("record_overpayment_and_refund_difference");
    expect(exception.resolution).toBe("refund_required");
    expect(exception.approvedCreditRef).toBeNull();
  });

  it("lets the verification proceed only under the two resolving actions", () => {
    for (const action of [
      "record_overpayment_and_refund_difference",
      "record_overpayment_and_apply_approved_credit",
    ]) {
      const exception = overpaymentException(
        action,
        action === "record_overpayment_and_apply_approved_credit"
          ? { approvedCreditRef: "credit-approval-7741" }
          : {},
      );
      expect(exception.permitsVerification).toBe(true);
      const result = verify(3, 59_700, { exception: { ...exception } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.record.classification).toBe("OVERPAYMENT");
      expect(result.value.record.verifiedAmountCents).toBe(59_700);
    }

    for (const action of [
      "record_overpayment_and_hold_order",
      "reject_verification_pending_resolution",
    ]) {
      const exception = overpaymentException(action);
      expect(exception.permitsVerification).toBe(false);
      expect(verify(3, 59_700, { exception: { ...exception } })).toEqual({
        ok: false,
        code: "exception_invalid",
      });
    }
  });

  it("refuses to apply credit without a separately approved credit reference", () => {
    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 59_700,
      observedCurrency: "USD",
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(
      recordOverpaymentException({
        orderId: "ord_ea_money_0001",
        reconciliation: reconciled.value,
        actor: FOUNDER,
        reason: "Applying it to their account instead.",
        grantedAt: DECIDED_AT,
        action: "record_overpayment_and_apply_approved_credit",
      }),
    ).toEqual({ ok: false, code: "credit_not_approved" });
  });

  it("cannot be reused for a different order or a different excess", () => {
    const exception = overpaymentException();
    expect(
      verify(3, 59_701, { exception: { ...exception } }),
    ).toEqual({ ok: false, code: "exception_invalid" });
    expect(
      verify(3, 59_700, {
        exception: { ...exception, orderId: "ord_ea_money_0009" },
      }),
    ).toEqual({ ok: false, code: "exception_invalid" });
  });

  it("refuses an actor who may not decide money", () => {
    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 59_700,
      observedCurrency: "USD",
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(
      recordOverpaymentException({
        orderId: "ord_ea_money_0001",
        reconciliation: reconciled.value,
        actor: { id: "usr_member", role: "member" },
        reason: "I would like to keep it.",
        grantedAt: DECIDED_AT,
      }),
    ).toEqual({ ok: false, code: "forbidden" });
  });
});

// ---------------------------------------------------------------------------
// The receipt
// ---------------------------------------------------------------------------

describe("the receipt", () => {
  it("states the payable total and the verified amount, never the subtotal as paid", () => {
    const result = verify(3, 47_760);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const receipt = result.value.receiptIntent;
    expect(receipt).not.toBeNull();
    expect(receipt?.payableTotalCents).toBe(47_760);
    expect(receipt?.verifiedAmountCents).toBe(47_760);
    expect(receipt?.subtotalCents).toBe(59_700);
    expect(receipt?.discountCents).toBe(11_940);
    // There is no field on the receipt carrying the subtotal as the amount paid.
    expect(Object.keys(receipt ?? {}).sort()).toEqual([
      "currency",
      "discountCents",
      "intentId",
      "issuedAt",
      "kind",
      "orderReference",
      "payableTotalCents",
      "performed",
      "subtotalCents",
      "verifiedAmountCents",
    ]);
  });

  it("shows the money that actually arrived when an overpayment was resolved", () => {
    const exception = overpaymentException();
    const result = verify(3, 59_700, { exception: { ...exception } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.receiptIntent?.verifiedAmountCents).toBe(59_700);
    expect(result.value.receiptIntent?.payableTotalCents).toBe(47_760);
  });
});

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

const ATTRIBUTION = Object.freeze({
  affiliateId: "aff_alex",
  affiliateCustomerRef: "cus_alex",
  referralCode: "ALEX-2026",
  holdBasisPoints: 1_500,
});

describe("commission is computed on the configured basis", () => {
  it("uses the merchandise subtotal less the discount, in exact cents", () => {
    const projection = verified(3, 47_760);
    expect(commissionBasisCentsFor(projection)).toBe(47_760);

    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;
    expect(accrual.value.commissionBasisCents).toBe(47_760);
    // 15 percent of 47,760 is 7,164, exactly.
    expect(accrual.value.commissionAmountCents).toBe(7_164);
    expect(accrual.value.commissionRate).toBe(1_500);
    expect(accrual.value.commissionPolicyId).toBe(
      EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyId,
    );
    expect(accrual.value.commissionPolicyVersion).toBe(
      EARLY_ACCESS_COMMISSION_POLICY.commissionPolicyVersion,
    );
    expect(accrual.value.basis).toBe("subtotal_less_discount");
    expect(accrual.value.affiliateId).toBe("aff_alex");
    expect(accrual.value.referralCode).toBe("ALEX-2026");
  });

  it("is NOT the pre-discount subtotal", () => {
    const projection = verified(3, 47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;
    // 15 percent of the undiscounted 59,700 would be 8,955. That is the defect.
    expect(accrual.value.commissionAmountCents).not.toBe(8_955);
    expect(accrual.value.commissionBasisCents).not.toBe(projection.orderTotalCents);
  });

  it("agrees with the partner ledger's own definition of eligible net revenue", () => {
    const projection = verified(3, 47_760);
    expect(commissionBasisCentsFor(projection)).toBe(
      eligibleNetRevenueCents(commissionBreakdownFor(projection)),
    );
  });

  it("excludes shipping and tax", () => {
    const projection = verified(3, 47_760);
    const withCosts: EarlyAccessVerifiedOrder = {
      ...projection,
      money: {
        ...projection.money,
        shippingCents: 1_500,
        taxCents: 3_000,
        payableTotalCents: (47_760 + 4_500) as EarlyAccessVerifiedOrder["money"]["payableTotalCents"],
      },
    };
    // The basis is unchanged by shipping and tax, in either direction.
    expect(commissionBasisCentsFor(withCosts)).toBe(47_760);
  });

  it("excludes an overpayment", () => {
    const exception = overpaymentException();
    const projection = verified(3, 59_700, { exception: { ...exception } });
    expect(projection.verifiedAmountCents).toBe(59_700);
    // The basis never reads the amount that arrived, so 11,940 of excess earns nothing.
    expect(commissionBasisCentsFor(projection)).toBe(47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;
    expect(accrual.value.commissionAmountCents).toBe(7_164);
  });

  it("cannot be built from an unverified payment", () => {
    const placed = order(3);
    expect(buildCommissionAccrual({ ...placed }, ATTRIBUTION)).toEqual({
      ok: false,
      code: "verified_order_invalid",
    });
  });

  it("keeps the affiliate facing hold free of the economics", () => {
    const projection = verified(3, 47_760);
    const hold = buildCommissionHold(projection, ATTRIBUTION);
    expect(hold.ok).toBe(true);
    if (!hold.ok) return;
    expect(hold.value.holdAmountCents).toBe(7_164);
    const serialized = JSON.stringify(hold.value);
    expect(serialized).not.toContain("47760");
    expect(serialized).not.toContain("59700");
    expect(serialized).not.toContain("1500");
    expect(serialized).not.toContain("Basis");
  });

  it("refuses a stored accrual whose commission does not follow its rate and basis", () => {
    const projection = verified(3, 47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;
    expect(readCommissionAccrual({ ...accrual.value })).toEqual(accrual.value);
    expect(
      readCommissionAccrual({ ...accrual.value, commissionAmountCents: 8_955 }),
    ).toBeNull();
    expect(
      readCommissionAccrual({ ...accrual.value, commissionBasisCents: 59_700 }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

describe("refunds are bounded by the money that actually arrived", () => {
  function refund(
    projection: EarlyAccessVerifiedOrder,
    amountCents: number,
    extra: Record<string, unknown> = {},
  ) {
    return recordRefund({
      verifiedOrder: { ...projection },
      refunds: [],
      actor: FOUNDER,
      amountCents,
      currency: "USD",
      reason: "Customer changed their mind before shipping.",
      refundedAt: REFUNDED_AT,
      ...extra,
    });
  }

  it("allows a refund up to the verified amount", () => {
    const projection = verified(3, 47_760);
    const result = refund(projection, 47_760);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amountCents).toBe(47_760);
    expect(result.value.verifiedPaidCents).toBe(47_760);
    expect(result.value.sequence).toBe(1);
  });

  it("refuses a refund above the verified amount, even below the subtotal", () => {
    const projection = verified(3, 47_760);
    // 47,761 is still well below the 59,700 subtotal, and it is still too much.
    expect(refund(projection, 47_761)).toEqual({
      ok: false,
      code: "refund_exceeds_verified_paid",
    });
    expect(refund(projection, 59_700)).toEqual({
      ok: false,
      code: "refund_exceeds_verified_paid",
    });
  });

  it("counts refunds already completed against the ceiling", () => {
    const projection = verified(3, 47_760);
    const first = refund(projection, 40_000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = recordRefund({
      verifiedOrder: { ...projection },
      refunds: [{ ...first.value }],
      actor: FOUNDER,
      amountCents: 7_761,
      currency: "USD",
      reason: "Refunding the rest of it.",
      refundedAt: REFUNDED_AT,
    });
    expect(second).toEqual({ ok: false, code: "refund_exceeds_verified_paid" });

    const exact = recordRefund({
      verifiedOrder: { ...projection },
      refunds: [{ ...first.value }],
      actor: FOUNDER,
      amountCents: 7_760,
      currency: "USD",
      reason: "Refunding the rest of it.",
      refundedAt: REFUNDED_AT,
    });
    expect(exact.ok).toBe(true);
  });

  it("refuses a refund above the payable total unless the overpayment path allows it", () => {
    const exception = overpaymentException();
    const projection = verified(3, 59_700, { exception: { ...exception } });
    // Refunding more than the order was ever worth needs the recorded decision.
    expect(refund(projection, 55_000)).toEqual({
      ok: false,
      code: "excess_refund_not_authorized",
    });
    const authorized = refund(projection, 55_000, {
      overpaymentException: { ...exception },
    });
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) return;
    expect(authorized.value.amountCents).toBe(55_000);

    // Up to the whole verified amount, still through the same path.
    const whole = refund(projection, 59_700, { overpaymentException: { ...exception } });
    expect(whole.ok).toBe(true);
    // And never beyond it.
    expect(refund(projection, 59_701, { overpaymentException: { ...exception } })).toEqual({
      ok: false,
      code: "refund_exceeds_verified_paid",
    });
  });

  it("refuses an actor who may not decide money", () => {
    const projection = verified(3, 47_760);
    expect(refund(projection, 100, { actor: { id: "usr_member", role: "member" } })).toEqual({
      ok: false,
      code: "forbidden",
    });
  });
});

describe("a refund reverses commission by appending, never by editing", () => {
  it("reverses in proportion to the basis returned, and rounds up", () => {
    const projection = verified(3, 47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;

    // Half the basis back on a 7,164 commission is 3,582 exactly.
    expect(reversalCentsFor(accrual.value, 23_880)).toBe(3_582);
    // A single cent back still reverses a whole cent rather than nothing.
    expect(reversalCentsFor(accrual.value, 1)).toBe(1);
    // The whole basis back reverses the whole commission.
    expect(reversalCentsFor(accrual.value, 47_760)).toBe(7_164);
    expect(reversalCentsFor(accrual.value, 999_999)).toBe(7_164);
  });

  it("appends a negative adjustment and leaves the accrual untouched", () => {
    const projection = verified(3, 47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;

    const refunded = recordRefund({
      verifiedOrder: { ...projection },
      refunds: [],
      actor: FOUNDER,
      amountCents: 23_880,
      currency: "USD",
      reason: "Returned one and a half units worth.",
      refundedAt: REFUNDED_AT,
    });
    expect(refunded.ok).toBe(true);
    if (!refunded.ok) return;

    const adjustment = buildRefundAdjustment({
      accrual: { ...accrual.value },
      refund: { ...refunded.value },
      adjustments: [],
    });
    expect(adjustment.ok).toBe(true);
    if (!adjustment.ok) return;
    expect(adjustment.value.amountCents).toBe(-3_582);
    expect(adjustment.value.kind).toBe("refund_reversal");
    expect(adjustment.value.accrualId).toBe(accrual.value.accrualId);
    expect(adjustment.value.sequence).toBe(1);

    // The original accrual still states what was accrued, and on what basis.
    expect(accrual.value.commissionAmountCents).toBe(7_164);
    expect(accrual.value.commissionBasisCents).toBe(47_760);
    expect(outstandingCommissionCents(accrual.value, [adjustment.value])).toBe(3_582);
  });

  it("does not round up twice across two partial refunds", () => {
    const projection = verified(3, 47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;

    const first = recordRefund({
      verifiedOrder: { ...projection },
      refunds: [],
      actor: FOUNDER,
      amountCents: 1,
      currency: "USD",
      reason: "A one cent goodwill correction.",
      refundedAt: REFUNDED_AT,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstAdjustment = buildRefundAdjustment({
      accrual: { ...accrual.value },
      refund: { ...first.value },
      adjustments: [],
    });
    expect(firstAdjustment.ok).toBe(true);
    if (!firstAdjustment.ok) return;
    expect(firstAdjustment.value.amountCents).toBe(-1);

    const second = recordRefund({
      verifiedOrder: { ...projection },
      refunds: [{ ...first.value }],
      actor: FOUNDER,
      amountCents: 1,
      currency: "USD",
      reason: "Another one cent goodwill correction.",
      refundedAt: REFUNDED_AT,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const secondAdjustment = buildRefundAdjustment({
      accrual: { ...accrual.value },
      refund: { ...second.value },
      adjustments: [{ ...firstAdjustment.value }],
    });
    expect(secondAdjustment.ok).toBe(true);
    if (!secondAdjustment.ok) return;
    // Two cents of a 47,760 basis is still one cent of a 7,164 commission, so the
    // second adjustment takes nothing more rather than rounding up again.
    expect(secondAdjustment.value.amountCents).toBe(0);
    expect(
      outstandingCommissionCents(accrual.value, [
        firstAdjustment.value,
        secondAdjustment.value,
      ]),
    ).toBe(7_163);
  });

  it("refuses an adjustment for another order", () => {
    const projection = verified(3, 47_760);
    const accrual = buildCommissionAccrual(projection, ATTRIBUTION);
    expect(accrual.ok).toBe(true);
    if (!accrual.ok) return;
    const refunded = recordRefund({
      verifiedOrder: { ...projection },
      refunds: [],
      actor: FOUNDER,
      amountCents: 100,
      currency: "USD",
      reason: "A small correction.",
      refundedAt: REFUNDED_AT,
    });
    expect(refunded.ok).toBe(true);
    if (!refunded.ok) return;
    expect(
      buildRefundAdjustment({
        accrual: { ...accrual.value, orderReference: "ord_ea_money_0009" },
        refund: { ...refunded.value },
        adjustments: [],
      }),
    ).toEqual({ ok: false, code: "accrual_invalid" });
  });
});

// ---------------------------------------------------------------------------
// The projections a human reads
// ---------------------------------------------------------------------------

describe("the customer and admin projections", () => {
  it("shows the customer the payable total, with the subtotal beside it", () => {
    const view = buildCustomerOrderView(order(3));
    expect(view.payableTotalCents).toBe(47_760);
    expect(view.subtotalCents).toBe(59_700);
    expect(view.discountCents).toBe(11_940);
    expect(view.status).toBe("awaiting_payment");
    expect(view.paymentReference).toBe(earlyAccessPaymentReferenceFor("ord_ea_money_0001"));
    // Nothing on the customer's own view identifies another customer or an actor.
    expect(JSON.stringify(view)).not.toContain("cus_samuel");
  });

  it("shows the admin the subtotal, the discount, the payable total and the difference", () => {
    const reconciled = reconcilePayment({
      money: order(3).money,
      observedAmountCents: 59_700,
      observedCurrency: "USD",
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;

    const review = buildAdminPaymentReview({
      order: order(3),
      reconciliation: reconciled.value,
      decisions: [],
    });
    expect(review.subtotalCents).toBe(59_700);
    expect(review.discountCents).toBe(11_940);
    expect(review.payableTotalCents).toBe(47_760);
    expect(review.observedAmountCents).toBe(59_700);
    expect(review.varianceCents).toBe(11_940);
    expect(review.classification).toBe("OVERPAYMENT");
    expect(review.approvable).toBe(false);
    expect(review.requiresException).toBe(true);
  });

  it("shows nothing approvable before any payment has been compared", () => {
    const review = buildAdminPaymentReview({
      order: order(3),
      reconciliation: null,
      decisions: [],
    });
    expect(review.observedAmountCents).toBeNull();
    expect(review.varianceCents).toBeNull();
    expect(review.classification).toBeNull();
    expect(review.approvable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The supplier sees no amount at all
// ---------------------------------------------------------------------------

describe("the supplier summary", () => {
  it("carries no amount of any kind", async () => {
    const { buildSupplierReleasePacket } = await import("./supplier-release");
    const projection = verified(3, 47_760);
    const packet = buildSupplierReleasePacket(
      { ...projection },
      {
        supplierId: "sup_apex",
        supplierSku: "APX-BPC-5MG",
        recipient: {
          recipientName: "Samuel Boadu",
          line1: "1 Research Way",
          line2: null,
          city: "Houston",
          region: "TX",
          postalCode: "77002",
          country: "US",
        },
      },
    );
    expect(packet.ok).toBe(true);
    if (!packet.ok) return;
    const serialized = JSON.stringify(packet.value);
    for (const amount of ["47760", "59700", "19900", "11940", "Cents", "price", "total"]) {
      expect(serialized).not.toContain(amount);
    }
  });
});

// ---------------------------------------------------------------------------
// No live financial call site reads the subtotal as the amount due
// ---------------------------------------------------------------------------

describe("orderTotalCents is only ever read as a subtotal", () => {
  /**
   * A grep over the source, not a runtime check.
   *
   * The brand on `PayableTotalCents` makes reintroducing the defect a compile error, and
   * `npm run check` catches that. This catches the other half: a NEW financial call site
   * that reads `orderTotalCents` into a plain `number` and calls it the amount due would
   * still compile. Every remaining reference is enumerated here on purpose, so adding
   * one is a deliberate act with a test to update rather than an accident.
   */
  /**
   * Strip comments before grepping.
   *
   * The point is to catch a live READ of the field, not a sentence explaining why the
   * field is not the amount due. Naming it in prose is exactly the documentation the
   * deprecation depends on, so prose must not fail this test.
   */
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  }

  const COMMERCE_DIR = path.join(
    process.cwd(),
    "server",
    "research",
    "early-access",
    "commerce",
  );

  /**
   * Every reference that is allowed to remain, and why.
   *
   * Each one is the field's own definition, validation, or pass-through, never a read of
   * it as an amount owed. Raising a number here is a deliberate act that has to be
   * justified in review.
   */
  const ALLOWED_BY_FILE: Readonly<Record<string, number>> = Object.freeze({
    // 1 deny-list entry (a client may not supply it), 1 type declaration, 1 stored-key
    // entry, 1 assignment from unit price times quantity on create, 1 re-derivation
    // check on read, 1 assignment from that same re-derivation.
    "early-access-order.ts": 6,
    // 1 type declaration on the verified projection, 1 stored-key entry, 3 shape guards,
    // 1 cross check that it equals the money snapshot's subtotal, then two
    // pass-throughs which name the field on both sides of the assignment: 2 on read and
    // 2 when the projection is built.
    "payment-verification.ts": 10,
  });

  it("appears in no commerce module except as the declared subtotal", () => {
    const files = [
      "early-access-order.ts",
      "early-access-invoice.ts",
      "order-service.ts",
      "invoice-service.ts",
      "payment-verification.ts",
      "payment-reconciliation.ts",
      "payment-exception.ts",
      "verification-service.ts",
      "commission-event.ts",
      "refund.ts",
      "release-service.ts",
      "supplier-release.ts",
      "order-views.ts",
      "order-money.ts",
      "promotion.ts",
      "proof-service.ts",
      "payment-proof.ts",
    ];

    for (const file of files) {
      const source = withoutComments(readFileSync(path.join(COMMERCE_DIR, file), "utf8"));
      const matches = source.match(/orderTotalCents/g) ?? [];
      const allowed = ALLOWED_BY_FILE[file] ?? 0;
      expect(
        matches.length,
        `${file} reads orderTotalCents ${matches.length} times, expected ${allowed}. ` +
          "A new financial consumer must read money.payableTotalCents instead.",
      ).toBe(allowed);
    }
  });

  it("is never the amount on a receipt, an invoice, a commission or a refund", () => {
    for (const file of [
      "early-access-invoice.ts",
      "invoice-service.ts",
      "commission-event.ts",
      "refund.ts",
      "order-views.ts",
      "payment-reconciliation.ts",
    ]) {
      const source = withoutComments(readFileSync(path.join(COMMERCE_DIR, file), "utf8"));
      expect(source, `${file}`).not.toMatch(/orderTotalCents/);
    }
  });
});
