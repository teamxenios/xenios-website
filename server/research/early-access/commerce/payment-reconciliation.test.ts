import { describe, expect, it } from "vitest";

import { buildOrderMoneySnapshot, type OrderMoneySnapshot } from "./order-money";
import {
  EARLY_ACCESS_PAYMENT_CLASSIFICATIONS,
  EARLY_ACCESS_VERIFIER_ROLES,
  isPaymentTransactionRef,
  isSettled,
  reconcilePayment,
} from "./payment-reconciliation";
import {
  EARLY_ACCESS_OVERPAYMENT_ACTIONS,
  overpaymentActionPermitsVerification,
  overpaymentResolutionFor,
  paymentExceptionIdFor,
  readOverpaymentException,
  recordOverpaymentException,
} from "./payment-exception";

const GRANTED_AT = "2026-08-04T14:00:00.000Z";
const FOUNDER = Object.freeze({ id: "adm_alex", role: "founder_admin" as const });

function money(overrides: Record<string, unknown> = {}): OrderMoneySnapshot {
  const result = buildOrderMoneySnapshot({
    currency: "USD",
    subtotalCents: 59_700,
    discountCents: 11_940,
    shippingCents: 0,
    taxCents: 0,
    promotionId: "early-access-bundle-3",
    promotionVersion: "b".repeat(64),
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture money refused: ${result.code}`);
  return result.value;
}

function reconcile(observedAmountCents: number, extra: Record<string, unknown> = {}) {
  return reconcilePayment({
    money: money(),
    observedAmountCents,
    observedCurrency: "USD",
    ...extra,
  });
}

describe("reconciliation classifies against the payable total", () => {
  it("exposes exactly the five outcomes", () => {
    expect([...EARLY_ACCESS_PAYMENT_CLASSIFICATIONS]).toEqual([
      "EXACT_MATCH",
      "UNDERPAYMENT",
      "OVERPAYMENT",
      "CURRENCY_MISMATCH",
      "DUPLICATE_TRANSACTION",
    ]);
  });

  it("reports the payable total and the subtotal separately", () => {
    const result = reconcile(47_760);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payableTotalCents).toBe(47_760);
    expect(result.value.subtotalCents).toBe(59_700);
    expect(result.value.varianceCents).toBe(0);
    expect(result.value.classification).toBe("EXACT_MATCH");
    expect(result.value.approvable).toBe(true);
    expect(isSettled(result.value)).toBe(true);
  });

  it("reports a shortfall as a negative variance", () => {
    const result = reconcile(40_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.classification).toBe("UNDERPAYMENT");
    expect(result.value.varianceCents).toBe(-7_760);
    expect(result.value.approvable).toBe(false);
    expect(isSettled(result.value)).toBe(false);
  });

  it("reports an excess as a positive variance", () => {
    const result = reconcile(59_700);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.classification).toBe("OVERPAYMENT");
    expect(result.value.varianceCents).toBe(11_940);
  });

  it("refuses a money snapshot that no longer holds its invariant", () => {
    expect(
      reconcilePayment({
        money: { ...money(), payableTotalCents: 59_700 },
        observedAmountCents: 59_700,
        observedCurrency: "USD",
      }),
    ).toEqual({ ok: false, code: "money_invalid" });
  });

  it("refuses an observed amount that is not an amount", () => {
    for (const observedAmountCents of [0, -1, 1.5, "47760", null, Number.NaN]) {
      expect(reconcilePayment({ money: money(), observedAmountCents, observedCurrency: "USD" })).toEqual(
        { ok: false, code: "observed_amount_invalid" },
      );
    }
  });

  it("validates a transaction reference before comparing it", () => {
    expect(isPaymentTransactionRef("zelle-8837-aa")).toBe(true);
    expect(isPaymentTransactionRef("ab")).toBe(false);
    expect(isPaymentTransactionRef("with space")).toBe(false);
    expect(reconcile(47_760, { transactionRef: "no" })).toEqual({
      ok: false,
      code: "transaction_ref_invalid",
    });
    expect(reconcile(47_760, { settledTransactionRefs: ["no"] })).toEqual({
      ok: false,
      code: "settled_references_invalid",
    });
  });

  it("ranks a duplicate reference above the amount comparison", () => {
    const result = reconcile(47_760, {
      transactionRef: "zelle-8837-aa",
      settledTransactionRefs: ["other-ref-01", "zelle-8837-aa"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.classification).toBe("DUPLICATE_TRANSACTION");
  });
});

describe("the overpayment actions", () => {
  it("maps each action to exactly one resolution and one permission", () => {
    expect([...EARLY_ACCESS_OVERPAYMENT_ACTIONS]).toEqual([
      "record_overpayment_and_hold_order",
      "record_overpayment_and_refund_difference",
      "record_overpayment_and_apply_approved_credit",
      "reject_verification_pending_resolution",
    ]);
    expect(overpaymentResolutionFor("record_overpayment_and_hold_order")).toBe("held");
    expect(overpaymentResolutionFor("record_overpayment_and_refund_difference")).toBe(
      "refund_required",
    );
    expect(overpaymentResolutionFor("record_overpayment_and_apply_approved_credit")).toBe(
      "credit_applied",
    );
    expect(overpaymentResolutionFor("reject_verification_pending_resolution")).toBe("rejected");

    expect(overpaymentActionPermitsVerification("record_overpayment_and_hold_order")).toBe(false);
    expect(
      overpaymentActionPermitsVerification("reject_verification_pending_resolution"),
    ).toBe(false);
  });

  it("is decided only by a named human who may decide money", () => {
    expect([...EARLY_ACCESS_VERIFIER_ROLES]).toEqual(["founder_admin", "operations_admin"]);
    const result = reconcile(59_700);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const role of ["member", "support", "affiliate", "supplier", "analyst"]) {
      expect(
        recordOverpaymentException({
          orderId: "ord_ea_0001",
          reconciliation: result.value,
          actor: { id: "usr_someone", role },
          reason: "They wanted it applied.",
          grantedAt: GRANTED_AT,
        }),
      ).toEqual({ ok: false, code: "forbidden" });
    }
  });

  it("requires a stated reason", () => {
    const result = reconcile(59_700);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const reason of ["", "short", "   ", null, 12]) {
      expect(
        recordOverpaymentException({
          orderId: "ord_ea_0001",
          reconciliation: result.value,
          actor: FOUNDER,
          reason,
          grantedAt: GRANTED_AT,
        }),
      ).toEqual({ ok: false, code: "reason_insufficient" });
    }
  });

  it("round trips a stored exception and refuses a tampered one", () => {
    const reconciled = reconcile(59_700);
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    const granted = recordOverpaymentException({
      orderId: "ord_ea_0001",
      reconciliation: reconciled.value,
      actor: FOUNDER,
      reason: "Customer paid the undiscounted list price.",
      grantedAt: GRANTED_AT,
    });
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(granted.value.exceptionId).toBe(paymentExceptionIdFor("ord_ea_0001"));
    expect(readOverpaymentException({ ...granted.value })).toEqual(granted.value);

    // A row that claims a resolution its action does not produce.
    expect(
      readOverpaymentException({ ...granted.value, resolution: "credit_applied" }),
    ).toBeNull();
    // A row that claims to permit a verification its action does not permit.
    expect(
      readOverpaymentException({
        ...granted.value,
        action: "record_overpayment_and_hold_order",
      }),
    ).toBeNull();
    // A row whose excess is not the arithmetic.
    expect(readOverpaymentException({ ...granted.value, excessCents: 1 })).toBeNull();
    // A row carrying a credit reference on an action that grants no credit.
    expect(
      readOverpaymentException({ ...granted.value, approvedCreditRef: "credit-1" }),
    ).toBeNull();
  });
});
