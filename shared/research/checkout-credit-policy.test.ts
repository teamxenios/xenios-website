import { describe, expect, it } from "vitest";
import {
  evaluateCreditQuote,
  validateCreditConsent,
  type CreditPolicy,
  type CreditQuote,
} from "./checkout-credit-policy";

const REQUESTED: CreditPolicy = { version: "credit-2026-09-a", mode: "requested", coversShipping: false };
const ALL: CreditPolicy = { version: "credit-2026-09-a", mode: "all_available", coversShipping: false };
const order = { subtotalCents: 39_250, shippingCents: 2_000 };

const quote = (policy: CreditPolicy, input: Partial<Parameters<typeof evaluateCreditQuote>[1]> = {}) =>
  evaluateCreditQuote(policy, { ...order, spendableCents: 10_000, ...input });

const ok = (result: ReturnType<typeof evaluateCreditQuote>): CreditQuote => {
  if (!result.ok) throw new Error(`expected a quote, got ${result.code}`);
  return result;
};

describe("the ceiling is a decision, not an accident", () => {
  it("excludes shipping when the policy says credit does not pay for it", () => {
    const result = ok(quote(REQUESTED, { spendableCents: 500_000, requestedCents: 39_250 }));
    expect(result.ceilingCents).toBe(39_250);
    expect(result.payableCents).toBe(2_000);
    expect(result.paymentMethodRequired).toBe(true);
  });

  it("includes shipping when the policy says it does, and can then clear the whole order", () => {
    const result = ok(evaluateCreditQuote({ ...REQUESTED, coversShipping: true }, { ...order, spendableCents: 500_000, requestedCents: 41_250 }));
    expect(result.ceilingCents).toBe(41_250);
    expect(result.payableCents).toBe(0);
    expect(result.paymentMethodRequired).toBe(false);
  });

  it("never exceeds the balance, whatever the order costs", () => {
    expect(ok(quote(ALL, { spendableCents: 1_500 })).ceilingCents).toBe(1_500);
  });

  it("honours a per-order ceiling beneath both", () => {
    const result = ok(evaluateCreditQuote({ ...ALL, maxPerOrderCents: 2_500 }, { ...order, spendableCents: 500_000 }));
    expect(result.ceilingCents).toBe(2_500);
    expect(result.appliedCents).toBe(2_500);
    expect(result.payableCents).toBe(38_750);
  });
});

describe("a requested amount is refused, never quietly shrunk", () => {
  it("refuses more credit than the account holds, and says which limit was hit", () => {
    const result = quote(REQUESTED, { spendableCents: 5_000, requestedCents: 6_000 });
    expect(result).toMatchObject({ ok: false, code: "credit_exceeds_balance" });
  });

  it("refuses more credit than the order's items cost, and explains that shipping is excluded", () => {
    const result = quote(REQUESTED, { spendableCents: 500_000, requestedCents: 41_250 });
    expect(result).toMatchObject({ ok: false, code: "credit_exceeds_order" });
    expect(result.ok === false && result.message).toContain("does not pay for shipping");
  });

  it("refuses more than one order may use", () => {
    const result = evaluateCreditQuote({ ...REQUESTED, maxPerOrderCents: 1_000 }, { ...order, spendableCents: 500_000, requestedCents: 2_000 });
    expect(result).toMatchObject({ ok: false, code: "credit_exceeds_ceiling" });
  });

  it("refuses an amount that is not whole cents", () => {
    for (const bad of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(quote(REQUESTED, { requestedCents: bad })).toMatchObject({ ok: false, code: "credit_amount_invalid" });
    }
  });

  it("refuses a policy that needs an amount and was given none", () => {
    expect(quote(REQUESTED)).toMatchObject({ ok: false, code: "credit_amount_required" });
  });

  it("accepts asking for none at all", () => {
    const result = ok(quote(REQUESTED, { requestedCents: 0 }));
    expect(result.appliedCents).toBe(0);
    expect(result.payableCents).toBe(41_250);
  });

  it("never returns a clamped amount: a refusal has no applied figure to charge", () => {
    const result = quote(REQUESTED, { spendableCents: 5_000, requestedCents: 6_000 });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("appliedCents");
    expect(result).not.toHaveProperty("payableCents");
  });
});

describe("an all-available policy does not silently overrule the customer", () => {
  it("applies the whole ceiling when nothing was typed", () => {
    const result = ok(quote(ALL, { spendableCents: 10_000 }));
    expect(result.appliedCents).toBe(10_000);
    expect(result.payableCents).toBe(31_250);
  });

  it("refuses a typed amount that contradicts it, rather than ignoring the input", () => {
    const result = quote(ALL, { spendableCents: 10_000, requestedCents: 4_000 });
    expect(result).toMatchObject({ ok: false, code: "credit_amount_not_selectable" });
  });

  it("accepts a typed amount that agrees with it", () => {
    expect(ok(quote(ALL, { spendableCents: 10_000, requestedCents: 10_000 })).appliedCents).toBe(10_000);
  });
});

describe("the gate and the charge come from one result", () => {
  it("asks for a payment method exactly when something is still payable", () => {
    const partial = ok(quote(ALL, { spendableCents: 10_000 }));
    expect(partial.payableCents).toBeGreaterThan(0);
    expect(partial.paymentMethodRequired).toBe(true);

    const covered = ok(evaluateCreditQuote({ ...ALL, coversShipping: true }, { ...order, spendableCents: 500_000 }));
    expect(covered.payableCents).toBe(0);
    expect(covered.paymentMethodRequired).toBe(false);
  });

  it("keeps the gross value separate, so credit cannot buy an order out of review", () => {
    const covered = ok(evaluateCreditQuote({ ...ALL, coversShipping: true }, { subtotalCents: 150_000, shippingCents: 2_000, spendableCents: 500_000 }));
    expect(covered.payableCents).toBe(0);
    // The order is still worth $1,520 for any threshold that reads the gross.
    expect(covered.grossCents).toBe(152_000);
  });

  it("refuses nonsense totals instead of computing on them", () => {
    expect(evaluateCreditQuote(ALL, { subtotalCents: -1, shippingCents: 0, spendableCents: 0 })).toMatchObject({ ok: false, code: "amounts_invalid" });
    expect(evaluateCreditQuote(ALL, { subtotalCents: 1.5, shippingCents: 0, spendableCents: 0 })).toMatchObject({ ok: false, code: "amounts_invalid" });
    expect(evaluateCreditQuote({ ...ALL, maxPerOrderCents: -5 }, { ...order, spendableCents: 0 })).toMatchObject({ ok: false, code: "amounts_invalid" });
  });
});

describe("consent is checked against the same numbers that would be charged", () => {
  const agreed = ok(quote(ALL, { spendableCents: 10_000 }));

  it("accepts consent that still matches", () => {
    expect(validateCreditConsent(agreed, { policyVersion: agreed.policyVersion, totalCents: agreed.payableCents })).toEqual({ ok: true });
  });

  it("refuses when the amount payable moved", () => {
    expect(validateCreditConsent(agreed, { policyVersion: agreed.policyVersion, totalCents: agreed.payableCents - 1 })).toMatchObject({
      ok: false,
      code: "consent_total_changed",
    });
  });

  it("refuses when the terms changed underneath the customer", () => {
    expect(validateCreditConsent(agreed, { policyVersion: "credit-2026-10-b", totalCents: agreed.payableCents })).toMatchObject({
      ok: false,
      code: "consent_policy_changed",
    });
  });

  it("refuses when the credit spent changed even though the payable did not", () => {
    // The order grew by exactly the extra credit taken. The customer pays the
    // same and their balance is drained further than they agreed.
    const shown = ok(evaluateCreditQuote(ALL, { subtotalCents: 39_250, shippingCents: 2_000, spendableCents: 10_000 }));
    const now = ok(evaluateCreditQuote(ALL, { subtotalCents: 41_250, shippingCents: 2_000, spendableCents: 12_000 }));
    expect(now.payableCents).toBe(shown.payableCents);
    expect(now.appliedCents).not.toBe(shown.appliedCents);
    expect(
      validateCreditConsent(now, { policyVersion: shown.policyVersion, totalCents: shown.payableCents, appliedCents: shown.appliedCents }),
    ).toMatchObject({ ok: false, code: "consent_credit_changed" });
  });

  it("accepts consent that pins both numbers when both still hold", () => {
    expect(
      validateCreditConsent(agreed, { policyVersion: agreed.policyVersion, totalCents: agreed.payableCents, appliedCents: agreed.appliedCents }),
    ).toEqual({ ok: true });
  });

  it("refuses a charge with no agreed total at all", () => {
    expect(validateCreditConsent(agreed, null)).toMatchObject({ ok: false, code: "consent_missing" });
    expect(validateCreditConsent(agreed, undefined)).toMatchObject({ ok: false, code: "consent_missing" });
  });

  it("catches the case this exists for: a balance that changed between showing and paying", () => {
    // The customer saw a total computed against a 10,000 balance.
    const shown = ok(quote(ALL, { spendableCents: 10_000 }));
    // By the time they pay, another order has spent some of it.
    const now = ok(quote(ALL, { spendableCents: 4_000 }));
    expect(now.payableCents).not.toBe(shown.payableCents);
    expect(validateCreditConsent(now, { policyVersion: shown.policyVersion, totalCents: shown.payableCents })).toMatchObject({
      ok: false,
      code: "consent_total_changed",
    });
  });
});
