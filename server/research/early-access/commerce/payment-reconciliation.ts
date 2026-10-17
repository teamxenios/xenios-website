/**
 * Early Access payment reconciliation. Server only, pure, side effect free.
 *
 * A manual payment is a human reading a bank line, a screenshot, or a transfer receipt
 * and saying "this is the money for that order". This module is the arithmetic under
 * that sentence, and it exists so the comparison is made against ONE number: the amount
 * the customer actually owed.
 *
 * WHAT IT COMPARES AGAINST
 * ------------------------
 * The payable total, and never the merchandise subtotal. `classifyAgainstPayable` takes
 * a branded `PayableTotalCents` as its first parameter, so a caller that reaches for the
 * subtotal, for `orderTotalCents`, or for any other loose number does not compile.
 *
 * WHY NOTHING IS WAVED THROUGH
 * ----------------------------
 * A payment that is not the amount owed is never silently approved.
 *
 * An UNDERPAYMENT is refused outright. Money is still owed, and the answer is the
 * customer sending the rest, not an admin deciding the debt away. There is deliberately
 * no path that approves one.
 *
 * An OVERPAYMENT is the case this lane will actually see: a customer looking at a three
 * unit bundle sends the undiscounted subtotal. That is not approvable either, and it
 * does not silently become account credit. It is recorded with the expected amount, the
 * received amount, and the excess, and a named founder or operations admin chooses one
 * of four actions. The default for the MVP is that the excess is REFUNDED. Applying
 * credit instead requires a separately approved credit reference, so this module cannot
 * invent a customer wallet, and no wallet is built here.
 *
 * A currency that is not the order's currency and a transaction reference that has
 * already settled are NOT exceptable at all. Converting a currency needs a rate this
 * domain does not hold, and counting one transaction twice is not a variance, it is a
 * double count. Both refuse outright.
 */

import {
  accepted,
  isBoundedText,
  isCanonicalTimestamp,
  isOneOf,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
  type CommerceResult,
} from "./input-guards";
import {
  EARLY_ACCESS_MAX_MONEY_CENTS,
  readOrderMoneySnapshot,
  type EarlyAccessCurrency,
  type OrderMoneySnapshot,
  type PayableTotalCents,
} from "./order-money";

/**
 * The only roles that may decide anything about money on this lane: verify a manual
 * payment, grant a variance exception, or record a refund.
 *
 * Owned here rather than by `payment-verification.ts` because verification, exceptions,
 * and refunds all need the same list and only one of them can own it without a cycle.
 * `payment-verification.ts` re-exports it, so existing importers are unaffected.
 * Everything else, including every support, analyst, partner, affiliate, and member
 * role, is refused with `forbidden`.
 */
export const EARLY_ACCESS_VERIFIER_ROLES = ["founder_admin", "operations_admin"] as const;
export type EarlyAccessVerifierRole = (typeof EARLY_ACCESS_VERIFIER_ROLES)[number];

export const EARLY_ACCESS_PAYMENT_CLASSIFICATIONS = [
  "EXACT_MATCH",
  "UNDERPAYMENT",
  "OVERPAYMENT",
  "CURRENCY_MISMATCH",
  "DUPLICATE_TRANSACTION",
] as const;

export type EarlyAccessPaymentClassification =
  (typeof EARLY_ACCESS_PAYMENT_CLASSIFICATIONS)[number];

/**
 * The only classification a named human may resolve and then proceed on.
 *
 * An underpayment is deliberately absent. Accepting one would record a debt as settled.
 */
export const EARLY_ACCESS_EXCEPTABLE_CLASSIFICATIONS = ["OVERPAYMENT"] as const;

export type EarlyAccessExceptableClassification =
  (typeof EARLY_ACCESS_EXCEPTABLE_CLASSIFICATIONS)[number];

const MAX_SETTLED_REFERENCES = 64;
const MIN_REASON_LENGTH = 8;
const MAX_REASON_LENGTH = 500;

const TRANSACTION_REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{3,127}$/;

export function isPaymentTransactionRef(value: unknown): value is string {
  return typeof value === "string" && TRANSACTION_REF.test(value);
}

/**
 * Compare one observed payment against the amount owed.
 *
 * The payable total is the FIRST parameter and is branded, so this function cannot be
 * called with a subtotal. That is the compile-time half of the fix; the runtime half is
 * that nothing downstream will approve a classification other than `EXACT_MATCH`
 * without an exception on file.
 */
export function classifyAgainstPayable(
  payableTotalCents: PayableTotalCents,
  currency: EarlyAccessCurrency,
  observedAmountCents: number,
  observedCurrency: string,
): EarlyAccessPaymentClassification {
  if (observedCurrency !== currency) return "CURRENCY_MISMATCH";
  if (observedAmountCents === payableTotalCents) return "EXACT_MATCH";
  return observedAmountCents < payableTotalCents ? "UNDERPAYMENT" : "OVERPAYMENT";
}

export type EarlyAccessPaymentReconciliation = Readonly<{
  classification: EarlyAccessPaymentClassification;
  /** The amount owed. Branded, so it can only have come from a validated snapshot. */
  payableTotalCents: PayableTotalCents;
  /** The merchandise subtotal, carried so an admin screen can show both without re-deriving. */
  subtotalCents: number;
  observedAmountCents: number;
  /** Observed minus payable. Negative on an underpayment, positive on an overpayment. */
  varianceCents: number;
  currency: EarlyAccessCurrency;
  observedCurrency: string;
  transactionRef: string | null;
  /** True only for an exact match. Everything else needs a decision by a human. */
  approvable: boolean;
  /** True when a named human could accept this variance with a stated reason. */
  requiresException: boolean;
}>;

export type ReconciliationFailureCode =
  | "input_invalid"
  | "money_invalid"
  | "observed_amount_invalid"
  | "observed_currency_invalid"
  | "transaction_ref_invalid"
  | "settled_references_invalid";

export type ReconciliationResult = CommerceResult<
  EarlyAccessPaymentReconciliation,
  ReconciliationFailureCode
>;

const RECONCILE_REQUIRED_KEYS = ["money", "observedAmountCents", "observedCurrency"] as const;
const RECONCILE_OPTIONAL_KEYS = ["transactionRef", "settledTransactionRefs"] as const;

/**
 * Reconcile one observed payment against an order's money snapshot.
 *
 * The snapshot is revalidated here rather than trusted, because it may have come back
 * from storage since the order was placed, and a snapshot whose invariant no longer
 * holds must not be the basis for accepting money.
 */
export function reconcilePayment(input: unknown): ReconciliationResult {
  const record = readPlainRecord(input, RECONCILE_REQUIRED_KEYS, RECONCILE_OPTIONAL_KEYS);
  if (!record) return refused("input_invalid");

  const money = readOrderMoneySnapshot(record.money);
  if (!money) return refused("money_invalid");

  if (
    typeof record.observedAmountCents !== "number" ||
    !Number.isSafeInteger(record.observedAmountCents) ||
    record.observedAmountCents <= 0 ||
    record.observedAmountCents > EARLY_ACCESS_MAX_MONEY_CENTS
  ) {
    return refused("observed_amount_invalid");
  }
  const observedAmountCents = record.observedAmountCents;

  // An unrecognized currency is read as a mismatch rather than rejected as malformed,
  // because "the customer sent euros" is a real answer an admin needs to see.
  if (!isBoundedText(record.observedCurrency, 8)) return refused("observed_currency_invalid");
  const observedCurrency = record.observedCurrency;

  const transactionRefValue =
    record.transactionRef === undefined || record.transactionRef === null
      ? null
      : record.transactionRef;
  if (transactionRefValue !== null && !isPaymentTransactionRef(transactionRefValue)) {
    return refused("transaction_ref_invalid");
  }
  const transactionRef = transactionRefValue;

  const settledValue =
    record.settledTransactionRefs === undefined || record.settledTransactionRefs === null
      ? []
      : readPlainArray(record.settledTransactionRefs, MAX_SETTLED_REFERENCES);
  if (settledValue === null) return refused("settled_references_invalid");
  for (const entry of settledValue) {
    if (!isPaymentTransactionRef(entry)) return refused("settled_references_invalid");
  }

  // A reference that already settled takes precedence over the amount comparison. The
  // amount may look perfect precisely because it is the same money counted twice.
  const duplicate =
    transactionRef !== null && (settledValue as readonly string[]).includes(transactionRef);

  const classification: EarlyAccessPaymentClassification = duplicate
    ? "DUPLICATE_TRANSACTION"
    : classifyAgainstPayable(
        money.payableTotalCents,
        money.currency,
        observedAmountCents,
        observedCurrency,
      );

  return accepted(
    Object.freeze({
      classification,
      payableTotalCents: money.payableTotalCents,
      subtotalCents: money.subtotalCents,
      observedAmountCents,
      varianceCents: observedAmountCents - money.payableTotalCents,
      currency: money.currency,
      observedCurrency,
      transactionRef,
      approvable: classification === "EXACT_MATCH",
      requiresException:
        classification === "UNDERPAYMENT" || classification === "OVERPAYMENT",
    }),
  );
}


/** True when nothing is left owing and nothing is left over. */
export function isSettled(reconciliation: EarlyAccessPaymentReconciliation): boolean {
  return reconciliation.classification === "EXACT_MATCH";
}

export type { OrderMoneySnapshot };
