// One arithmetic for store credit, and one consent to charge against.
//
// The cart, payment-method gate and durable submission use the same versioned
// arithmetic. The quote shown to the customer also binds credit spent, not just
// cash payable: equal cash totals alone do not establish equal consent.
//
// This module is arithmetic and validation ONLY.
//
//   * It does not reserve credit. Two orders can still evaluate against the same
//     balance; only a transaction in the database can stop them both spending it.
//   * It does not debit the ledger.
//   * It does not choose the policy. The integration owner picks the version and
//     the rules; a browser never does.
//
// Every refusal here is a refusal, not a silent adjustment. Quietly clamping a
// customer's number to something else is how a person ends up charged an amount
// they did not agree to.

export type CreditMode = "requested" | "all_available";

export interface CreditPolicy {
  /**
   * The approved policy identity. It travels into consent, so changing the
   * rules invalidates consent that was given under the old ones.
   */
  version: string;
  mode: CreditMode;
  /**
   * Whether credit may pay for shipping. Required, never inferred by a caller.
   */
  coversShipping: boolean;
  /** An optional per-order ceiling, beneath the balance and the order value. */
  maxPerOrderCents?: number | null;
}

/** Preserves the existing canonical behavior; this is not a new credit offer. */
export const CURRENT_CHECKOUT_CREDIT_POLICY: Readonly<CreditPolicy> = Object.freeze({
  version: "all-available-items-v1",
  mode: "all_available",
  coversShipping: false,
});

export interface CreditQuoteInput {
  subtotalCents: number;
  shippingCents: number;
  /** Approved, unexpired balance. The ledger owns this number. */
  spendableCents: number;
  /** What the customer asked to spend, when the policy lets them ask. */
  requestedCents?: number | null;
}

export type CreditRefusalCode =
  | "policy_invalid"
  | "amounts_invalid"
  | "credit_amount_invalid"
  | "credit_exceeds_balance"
  | "credit_exceeds_order"
  | "credit_exceeds_ceiling"
  | "credit_amount_not_selectable"
  | "credit_amount_required";

export interface CreditQuote {
  ok: true;
  policyVersion: string;
  /** The order's value before credit. Review thresholds use THIS, never the payable. */
  grossCents: number;
  /** The most this order could take from the balance under the policy. */
  ceilingCents: number;
  appliedCents: number;
  /** What the customer is actually charged. */
  payableCents: number;
  /**
   * Derived from the same result as `payableCents`, so a gate and a charge
   * cannot disagree about whether a card was needed.
   */
  paymentMethodRequired: boolean;
}

export interface CreditRefusal {
  ok: false;
  code: CreditRefusalCode;
  message: string;
}

export type CreditQuoteResult = CreditQuote | CreditRefusal;

function wholeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const refuse = (code: CreditRefusalCode, message: string): CreditRefusal => ({ ok: false, code, message });

/**
 * The single applied-credit decision.
 *
 * `requested` refuses an amount above what the policy allows rather than
 * shrinking it, because a customer who asks to spend more than they have has
 * made a mistake worth telling them about. `all_available` refuses a
 * contradicting typed amount rather than ignoring it, for the same reason.
 */
export function evaluateCreditQuote(policy: CreditPolicy, input: CreditQuoteInput): CreditQuoteResult {
  // The policy arrives from configuration, so it is checked rather than
  // trusted. Without this, any mode string other than the exact
  // "all_available" falls through to "requested", which is the mode that lets
  // a caller choose the amount.
  if (policy.mode !== "requested" && policy.mode !== "all_available") {
    return refuse("policy_invalid", "The store credit policy does not name a mode this build understands.");
  }
  if (typeof policy.coversShipping !== "boolean") {
    return refuse("policy_invalid", "The store credit policy does not say whether credit pays for shipping.");
  }
  if (typeof policy.version !== "string" || policy.version.length === 0) {
    return refuse("policy_invalid", "The store credit policy has no version, so consent could not be bound to it.");
  }
  if (!wholeNonNegative(input.subtotalCents) || !wholeNonNegative(input.shippingCents) || !wholeNonNegative(input.spendableCents)) {
    return refuse("amounts_invalid", "An order total or balance was not a whole number of cents.");
  }
  if (policy.maxPerOrderCents !== undefined && policy.maxPerOrderCents !== null && !wholeNonNegative(policy.maxPerOrderCents)) {
    return refuse("amounts_invalid", "The per-order credit ceiling was not a whole number of cents.");
  }

  const grossCents = input.subtotalCents + input.shippingCents;
  // Individually safe inputs can still overflow when added. Credit must not
  // conceal an unsafe gross by reducing the resulting payable to a safe value.
  if (!wholeNonNegative(grossCents)) {
    return refuse("amounts_invalid", "The combined order total was not a safe whole number of cents.");
  }
  const creditableCents = policy.coversShipping ? grossCents : input.subtotalCents;
  const perOrderCents = policy.maxPerOrderCents ?? Number.MAX_SAFE_INTEGER;
  const ceilingCents = Math.min(input.spendableCents, creditableCents, perOrderCents);

  const requested = input.requestedCents ?? null;
  if (requested !== null && !wholeNonNegative(requested)) {
    return refuse("credit_amount_invalid", "The credit amount was not a whole number of cents.");
  }

  let appliedCents: number;
  if (policy.mode === "all_available") {
    // The customer does not choose in this mode. If they nevertheless sent a
    // number, honouring a different one would charge them a total they never saw.
    if (requested !== null && requested !== ceilingCents) {
      return refuse(
        "credit_amount_not_selectable",
        "This account applies its whole available balance, so a different amount cannot be used. Review the total and try again.",
      );
    }
    appliedCents = ceilingCents;
  } else {
    if (requested === null) {
      return refuse("credit_amount_required", "No credit amount was supplied for a policy that requires one.");
    }
    // Each ceiling refused by its own name, so the customer is told what is wrong.
    if (requested > input.spendableCents) {
      return refuse("credit_exceeds_balance", "That is more store credit than this account has available.");
    }
    if (requested > creditableCents) {
      return refuse(
        "credit_exceeds_order",
        policy.coversShipping
          ? "That is more store credit than this order costs."
          : "That is more store credit than this order's items cost. Store credit does not pay for shipping.",
      );
    }
    if (requested > perOrderCents) {
      return refuse("credit_exceeds_ceiling", "That is more store credit than one order may use.");
    }
    appliedCents = requested;
  }

  const payableCents = grossCents - appliedCents;
  return {
    ok: true,
    policyVersion: policy.version,
    grossCents,
    ceilingCents,
    appliedCents,
    payableCents,
    paymentMethodRequired: payableCents > 0,
  };
}

export interface CreditConsent {
  /** The policy the customer was shown. */
  policyVersion: string;
  /** The total the customer agreed to pay. */
  totalCents: number;
  /**
   * The credit the customer agreed to spend. Binding only the payable is not
   * enough: an order whose value rises by exactly the extra credit taken leaves
   * the payable unchanged while draining a balance the customer did not agree
   * to spend. New charge consent must bind both figures.
   */
  appliedCents: number;
}

/** Wire input is unknown until every required field has been checked. */
export function isCreditConsent(value: unknown): value is CreditConsent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const consent = value as Record<string, unknown>;
  return typeof consent.policyVersion === "string"
    && consent.policyVersion.length > 0 && consent.policyVersion.trim() === consent.policyVersion
    && wholeNonNegative(consent.totalCents) && wholeNonNegative(consent.appliedCents);
}

export function creditConsentFor(quote: CreditQuote): CreditConsent {
  return { policyVersion: quote.policyVersion, totalCents: quote.payableCents, appliedCents: quote.appliedCents };
}

export type ConsentRefusalCode =
  | "consent_invalid"
  | "consent_policy_changed"
  | "consent_total_changed"
  | "consent_credit_changed"
  | "consent_missing";

export type ConsentResult = { ok: true } | { ok: false; code: ConsentRefusalCode; message: string };

/**
 * Whether what the customer agreed to is still what they would be charged.
 *
 * A changed amount or a changed policy needs fresh consent. It is never a
 * reason to charge the new amount because the old one is close enough.
 */
export function validateCreditConsent(quote: CreditQuote, consent: unknown): ConsentResult {
  if (consent === null || consent === undefined) {
    return { ok: false, code: "consent_missing", message: "No agreed total was supplied for this charge." };
  }
  if (!isCreditConsent(consent)) {
    return { ok: false, code: "consent_invalid", message: "The agreed policy, total and store credit must all be supplied as valid values." };
  }
  if (consent.policyVersion !== quote.policyVersion) {
    return {
      ok: false,
      code: "consent_policy_changed",
      message: "The store credit terms changed since this total was shown. Review the new total before paying.",
    };
  }
  if (consent.totalCents !== quote.payableCents) {
    return {
      ok: false,
      code: "consent_total_changed",
      message: "The amount payable changed since it was shown. Review the new total before paying.",
    };
  }
  if (consent.appliedCents !== quote.appliedCents) {
    return {
      ok: false,
      code: "consent_credit_changed",
      message: "The store credit this order would use changed since it was shown. Review the new total before paying.",
    };
  }
  return { ok: true };
}
