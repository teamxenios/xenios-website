/**
 * Manual product-order payments: the pure domain foundation.
 *
 * A member pays for a product order outside the site (bank transfer, or another
 * approved manual method), reports that they paid, and a NAMED human verifies
 * it before anything settles. This module is the decision core for that flow.
 *
 * What this module is deliberately NOT:
 *
 * It does not write rows, call a provider, capture money, finalize a
 * reservation, issue a durable receipt, accrue commission, send email, or
 * activate checkout. Every function here is pure: it takes explicit inputs,
 * including every instant (there is no clock read anywhere), and returns either
 * a frozen record or a refusal. Where an action would touch the world, this
 * module emits a PLAN describing what a later, separately reviewed lane should
 * do. A plan is evidence for a human, never an instruction that executes
 * itself.
 *
 * Two boundaries are load bearing and are enforced in code, not by convention:
 *
 * 1. The membership manual-payment contract is not reused. Its
 *    manual_external_payment path forbids product purchases, so product orders
 *    get their own reference namespace here. Only the cryptographic reference
 *    SEMANTICS are shared (32-symbol unambiguous alphabet, 8 symbols of
 *    randomness from a CSPRNG), so a membership reference can never be mistaken
 *    for an order reference.
 * 2. Receiving details never enter this module. Where money is actually sent is
 *    server configuration, referenced by an opaque key. No account number, no
 *    recipient name, and no routing value appears in source, in a record, or in
 *    a member-facing projection. The payment memo carries the order reference
 *    and nothing else, so a bank statement can never leak what was bought.
 */

import { randomBytes } from "node:crypto";
import {
  computeLineTotalCents,
  isValidCartPriceSnapshot,
  normalizePriceCurrency,
  type CartPriceSnapshot,
  type SupportedPriceCurrency,
} from "@shared/research/pricing";
import {
  computeQuoteHash,
  type CheckoutPriceQuote,
} from "../pricing/checkout-recompute";

// ---------------------------------------------------------------------------
// Refusal taxonomy
// ---------------------------------------------------------------------------

export type ManualPaymentRefusalReason =
  // Quote revalidation
  | "quote_empty"
  | "quote_line_invalid"
  | "quote_line_total_mismatch"
  | "quote_subtotal_mismatch"
  | "quote_hash_mismatch"
  | "currency_unsupported"
  // Shape
  | "amount_invalid"
  | "instant_invalid"
  | "identity_missing"
  | "config_reference_missing"
  | "memo_unsafe"
  // Lifecycle
  | "invoice_expired"
  | "not_reported"
  | "already_verified"
  // Verification evidence
  | "method_mismatch"
  | "reference_mismatch"
  | "currency_mismatch"
  | "amount_mismatch"
  | "provider_evidence_missing"
  | "duplicate_evidence_missing"
  | "duplicate_reference"
  | "reservation_missing"
  | "reservation_expired"
  | "admin_not_named"
  // Refund
  | "refund_amount_invalid"
  | "refund_exceeds_verified"
  | "refund_line_unknown";

export interface ManualPaymentRefusal {
  readonly ok: false;
  readonly reason: ManualPaymentRefusalReason;
  /** Operator-facing detail. Never contains a receiving detail or a secret. */
  readonly detail: string;
}

export type ManualPaymentResult<T> =
  | { readonly ok: true; readonly value: T }
  | ManualPaymentRefusal;

function refuse(
  reason: ManualPaymentRefusalReason,
  detail: string,
): ManualPaymentRefusal {
  return { ok: false, reason, detail };
}

// ---------------------------------------------------------------------------
// Reference and memo
// ---------------------------------------------------------------------------

/**
 * The same unambiguous alphabet the membership reference uses: no I, O, 0, or
 * 1, so a reference read off a bank statement or a phone call cannot be
 * transcribed into a different valid reference.
 */
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Product-order references are XRO-, distinct from the membership XRM- space.
 * Same entropy and same alphabet, different namespace, so the two manual
 * payment contracts can never be confused for one another.
 */
export const ORDER_HUMAN_REF_PATTERN =
  /^XRO-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function newOrderHumanRef(
  random: (size: number) => Buffer = randomBytes,
): string {
  const bytes = random(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) out += REF_ALPHABET[bytes[i] & 0x1f];
  return `XRO-${out}`;
}

/**
 * The payment memo is exactly the order reference. It is built here rather than
 * assembled by a caller so no product name, SKU, quantity, or clinical word can
 * ever reach a bank record. isMemoSafe is the enforcement, and it is checked on
 * every invoice this module creates.
 */
export function buildPaymentMemo(humanRef: string): string {
  return humanRef;
}

export function isMemoSafe(memo: string): boolean {
  return ORDER_HUMAN_REF_PATTERN.test(memo);
}

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

function isPositiveSafeIntegerCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isValidInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Case and whitespace insensitive comparison for operator-entered evidence. */
function sameToken(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// The invoice
// ---------------------------------------------------------------------------

export type ManualPaymentMethod = "bank_transfer" | "wire" | "other_approved";

export interface ManualOrderInvoice {
  readonly invoiceId: string;
  readonly orderIntentId: string;
  readonly memberId: string;
  readonly humanRef: string;
  readonly memo: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
  /** Frozen copies of the revalidated quote lines. Immutable once issued. */
  readonly lines: readonly CartPriceSnapshot[];
  readonly quoteHash: string;
  readonly quotedAt: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  /** Opaque configuration keys. Never a recipient or account value. */
  readonly instructionsRef: string;
  readonly receivingAccountRef: string;
  readonly status: "awaiting_payment";
}

export interface CreateManualOrderInvoiceInput {
  readonly invoiceId: string;
  readonly orderIntentId: string;
  readonly memberId: string;
  /** The authoritative quote. Revalidated here, never trusted as handed. */
  readonly quote: CheckoutPriceQuote;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly instructionsRef: string;
  readonly receivingAccountRef: string;
  readonly humanRef?: string;
}

/**
 * Revalidate an authoritative quote from first principles.
 *
 * The quote is re-derived rather than trusted: every line must be a structurally
 * valid snapshot, every line total must equal unit times quantity recomputed
 * here, the subtotal must equal the sum of those recomputed totals, the currency
 * must be on the allowlist, and the quote hash must match a hash recomputed over
 * the lines. A tampered amount therefore cannot become an invoice.
 */
export function revalidateCheckoutQuote(
  quote: CheckoutPriceQuote,
): ManualPaymentResult<{
  lines: readonly CartPriceSnapshot[];
  subtotalCents: number;
  currency: SupportedPriceCurrency;
}> {
  if (!Array.isArray(quote?.lines) || quote.lines.length === 0) {
    return refuse("quote_empty", "The quote carries no priced lines.");
  }
  if (!isValidInstant(quote.quotedAt)) {
    return refuse("instant_invalid", "The quote instant is not a valid date.");
  }
  const currency = normalizePriceCurrency(String(quote.currency ?? ""));
  if (!currency) {
    return refuse(
      "currency_unsupported",
      "The quote currency is not on the supported allowlist.",
    );
  }

  let subtotal = 0;
  for (const line of quote.lines) {
    if (!isValidCartPriceSnapshot(line)) {
      return refuse(
        "quote_line_invalid",
        "A quote line is not a structurally valid price snapshot.",
      );
    }
    if (line.currency !== currency) {
      return refuse(
        "currency_unsupported",
        `Line ${line.sku} is priced in a different currency than the quote.`,
      );
    }
    let recomputed: number;
    try {
      recomputed = computeLineTotalCents(line.unitAmountCents, line.quantity);
    } catch {
      return refuse(
        "quote_line_total_mismatch",
        `Line ${line.sku} has an out-of-range unit amount or quantity.`,
      );
    }
    if (recomputed !== line.lineTotalCents) {
      return refuse(
        "quote_line_total_mismatch",
        `Line ${line.sku} total does not equal unit amount times quantity.`,
      );
    }
    subtotal += recomputed;
    if (!Number.isSafeInteger(subtotal)) {
      return refuse(
        "quote_subtotal_mismatch",
        "The recomputed subtotal exceeds the safe integer range.",
      );
    }
  }

  if (subtotal !== quote.subtotalCents) {
    return refuse(
      "quote_subtotal_mismatch",
      "The recomputed subtotal does not equal the quoted subtotal.",
    );
  }

  const expectedHash = computeQuoteHash(
    quote.lines,
    quote.subtotalCents,
    currency,
    quote.quotedAt,
  );
  if (expectedHash !== quote.quoteHash) {
    return refuse(
      "quote_hash_mismatch",
      "The quote hash does not match the quote contents.",
    );
  }

  return {
    ok: true,
    value: {
      lines: Object.freeze(quote.lines.map((line) => Object.freeze({ ...line }))),
      subtotalCents: subtotal,
      currency,
    },
  };
}

export function createManualOrderInvoice(
  input: CreateManualOrderInvoiceInput,
  newRef: () => string = newOrderHumanRef,
): ManualPaymentResult<ManualOrderInvoice> {
  if (
    !isNonEmptyString(input.invoiceId) ||
    !isNonEmptyString(input.orderIntentId) ||
    !isNonEmptyString(input.memberId)
  ) {
    return refuse(
      "identity_missing",
      "Invoice, order intent, and member identity are all required.",
    );
  }
  if (
    !isNonEmptyString(input.instructionsRef) ||
    !isNonEmptyString(input.receivingAccountRef)
  ) {
    return refuse(
      "config_reference_missing",
      "Payment instructions and receiving account must be opaque configuration references.",
    );
  }
  if (!isValidInstant(input.issuedAt) || !isValidInstant(input.expiresAt)) {
    return refuse("instant_invalid", "Issue and expiry instants are required.");
  }
  if (Date.parse(input.expiresAt) <= Date.parse(input.issuedAt)) {
    return refuse("instant_invalid", "The invoice expiry must follow issuance.");
  }

  const revalidated = revalidateCheckoutQuote(input.quote);
  if (!revalidated.ok) return revalidated;

  const humanRef = input.humanRef ?? newRef();
  const memo = buildPaymentMemo(humanRef);
  if (!ORDER_HUMAN_REF_PATTERN.test(humanRef) || !isMemoSafe(memo)) {
    return refuse(
      "memo_unsafe",
      "The order reference is malformed, so a safe payment memo cannot be built.",
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      invoiceId: input.invoiceId,
      orderIntentId: input.orderIntentId,
      memberId: input.memberId,
      humanRef,
      memo,
      amountCents: revalidated.value.subtotalCents,
      currency: revalidated.value.currency,
      lines: revalidated.value.lines,
      quoteHash: input.quote.quoteHash,
      quotedAt: input.quote.quotedAt,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      instructionsRef: input.instructionsRef,
      receivingAccountRef: input.receivingAccountRef,
      status: "awaiting_payment",
    }),
  };
}

// ---------------------------------------------------------------------------
// Member-safe projection
// ---------------------------------------------------------------------------

export interface MemberInvoiceProjection {
  readonly humanRef: string;
  readonly memo: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly instructionsRef: string;
  readonly status: "awaiting_payment" | "reported" | "verified";
}

/**
 * What a browser may see. receivingAccountRef is withheld even though it is
 * only a key, because a member never needs it: the server renders instructions
 * from configuration. Line snapshots are withheld as well, since the member
 * already has the order; the invoice is about money, not contents.
 */
export function projectInvoiceForMember(
  invoice: ManualOrderInvoice,
  status: MemberInvoiceProjection["status"] = invoice.status,
): MemberInvoiceProjection {
  return Object.freeze({
    humanRef: invoice.humanRef,
    memo: invoice.memo,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    issuedAt: invoice.issuedAt,
    expiresAt: invoice.expiresAt,
    instructionsRef: invoice.instructionsRef,
    status,
  });
}

// ---------------------------------------------------------------------------
// Customer payment report
// ---------------------------------------------------------------------------

export interface ManualPaymentReport {
  readonly invoiceId: string;
  readonly memberId: string;
  readonly method: ManualPaymentMethod;
  readonly reference: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
  readonly reportedAt: string;
  readonly claimedPaidAt: string;
  /**
   * Always "reported". A customer statement is a claim, never proof, so this
   * type has no representation for paid. Only a named human verification can
   * produce a settlement plan.
   */
  readonly status: "reported";
}

export interface ReportManualPaymentInput {
  readonly invoice: ManualOrderInvoice;
  readonly memberId: string;
  readonly method: ManualPaymentMethod;
  readonly reference: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly reportedAt: string;
  readonly claimedPaidAt: string;
}

export function reportManualPayment(
  input: ReportManualPaymentInput,
): ManualPaymentResult<ManualPaymentReport> {
  if (input.memberId !== input.invoice.memberId) {
    return refuse(
      "identity_missing",
      "A payment report must come from the member the invoice was issued to.",
    );
  }
  if (!isNonEmptyString(input.reference)) {
    return refuse("reference_mismatch", "A payment reference is required.");
  }
  if (!isPositiveSafeIntegerCents(input.amountCents)) {
    return refuse(
      "amount_invalid",
      "The reported amount must be a positive safe integer number of cents.",
    );
  }
  if (
    !isValidInstant(input.reportedAt) ||
    !isValidInstant(input.claimedPaidAt)
  ) {
    return refuse("instant_invalid", "Report instants must be valid dates.");
  }
  const currency = normalizePriceCurrency(input.currency);
  if (!currency) {
    return refuse(
      "currency_unsupported",
      "The reported currency is not on the supported allowlist.",
    );
  }
  if (Date.parse(input.reportedAt) > Date.parse(input.invoice.expiresAt)) {
    return refuse(
      "invoice_expired",
      "The invoice expired before this payment was reported.",
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      invoiceId: input.invoice.invoiceId,
      memberId: input.memberId,
      method: input.method,
      reference: input.reference.trim(),
      amountCents: input.amountCents,
      currency,
      reportedAt: input.reportedAt,
      claimedPaidAt: input.claimedPaidAt,
      status: "reported",
    }),
  };
}

// ---------------------------------------------------------------------------
// Named human verification
// ---------------------------------------------------------------------------

export interface ProviderTransactionEvidence {
  readonly transactionId: string;
  readonly method: ManualPaymentMethod;
  readonly reference: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly settledAt: string;
  /** The statement window the operator actually inspected. */
  readonly observedFrom: string;
  readonly observedTo: string;
}

export interface HeldReservation {
  readonly reservationId: string;
  readonly sku: string;
  readonly quantity: number;
  readonly expiresAt: string;
}

export interface VerifyManualPaymentInput {
  readonly invoice: ManualOrderInvoice;
  readonly report: ManualPaymentReport;
  readonly evidence: ProviderTransactionEvidence;
  readonly reservations: readonly HeldReservation[];
  /** References already verified. Presence proves the duplicate check ran. */
  readonly priorVerifiedReferences: readonly string[];
  readonly adminId: string;
  readonly adminName: string;
  readonly verifiedAt: string;
  readonly alreadyVerified?: boolean;
}

export interface SettlementIntent {
  readonly kind: "settlement";
  readonly invoiceId: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
  readonly providerTransactionId: string;
}

export interface ReservationFinalizeIntent {
  readonly kind: "reservation_finalize";
  readonly reservationIds: readonly string[];
}

export interface ReceiptCandidate {
  readonly kind: "receipt_candidate";
  readonly invoiceId: string;
  readonly humanRef: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
  readonly lines: readonly CartPriceSnapshot[];
}

export interface CommissionIntent {
  readonly kind: "commission";
  readonly invoiceId: string;
  readonly eligibleAmountCents: number;
  readonly currency: SupportedPriceCurrency;
}

export interface ManualPaymentVerificationPlan {
  readonly invoiceId: string;
  readonly verifiedAmountCents: number;
  readonly currency: SupportedPriceCurrency;
  readonly verifiedBy: { readonly adminId: string; readonly adminName: string };
  readonly verifiedAt: string;
  /**
   * Intents only. Nothing in this object has happened. A later lane, under its
   * own review, is responsible for executing any of it atomically.
   */
  readonly intents: readonly (
    | SettlementIntent
    | ReservationFinalizeIntent
    | ReceiptCandidate
    | CommissionIntent
  )[];
}

/**
 * Verification is where a human takes responsibility, so every condition is
 * explicit and every failure is a refusal rather than a downgrade. The evidence
 * must match the report exactly on method, reference, currency, and amount; the
 * operator must have inspected a bounded statement window that contains the
 * settlement; every reservation must still be held; the duplicate check must
 * have been performed; and the approver must be named.
 */
export function planManualPaymentVerification(
  input: VerifyManualPaymentInput,
): ManualPaymentResult<ManualPaymentVerificationPlan> {
  if (input.alreadyVerified) {
    return refuse(
      "already_verified",
      "This invoice already carries a verification.",
    );
  }
  if (input.report.status !== "reported") {
    return refuse("not_reported", "There is no payment report to verify.");
  }
  if (input.report.invoiceId !== input.invoice.invoiceId) {
    return refuse(
      "identity_missing",
      "The report does not belong to this invoice.",
    );
  }
  if (!isNonEmptyString(input.adminId) || !isNonEmptyString(input.adminName)) {
    return refuse(
      "admin_not_named",
      "Verification requires a named human approver.",
    );
  }
  if (!isValidInstant(input.verifiedAt)) {
    return refuse("instant_invalid", "The verification instant is required.");
  }

  const evidence = input.evidence;
  if (!evidence || !isNonEmptyString(evidence.transactionId)) {
    return refuse(
      "provider_evidence_missing",
      "A provider transaction reference is required.",
    );
  }
  if (
    !isValidInstant(evidence.settledAt) ||
    !isValidInstant(evidence.observedFrom) ||
    !isValidInstant(evidence.observedTo)
  ) {
    return refuse(
      "provider_evidence_missing",
      "The evidence must carry a settlement instant and the inspected window.",
    );
  }
  const settled = Date.parse(evidence.settledAt);
  if (
    settled < Date.parse(evidence.observedFrom) ||
    settled > Date.parse(evidence.observedTo)
  ) {
    return refuse(
      "provider_evidence_missing",
      "The settlement falls outside the statement window the operator inspected.",
    );
  }

  if (evidence.method !== input.report.method) {
    return refuse(
      "method_mismatch",
      "The evidence method does not match the reported method.",
    );
  }
  if (!sameToken(evidence.reference, input.report.reference)) {
    return refuse(
      "reference_mismatch",
      "The evidence reference does not match the reported reference.",
    );
  }
  const evidenceCurrency = normalizePriceCurrency(evidence.currency);
  if (
    !evidenceCurrency ||
    evidenceCurrency !== input.report.currency ||
    evidenceCurrency !== input.invoice.currency
  ) {
    return refuse(
      "currency_mismatch",
      "The evidence, report, and invoice currencies must all agree.",
    );
  }
  if (
    evidence.amountCents !== input.report.amountCents ||
    evidence.amountCents !== input.invoice.amountCents
  ) {
    return refuse(
      "amount_mismatch",
      "The evidence amount must equal both the reported and invoiced amounts exactly.",
    );
  }

  if (!Array.isArray(input.priorVerifiedReferences)) {
    return refuse(
      "duplicate_evidence_missing",
      "The duplicate check must be performed and its result supplied.",
    );
  }
  if (
    input.priorVerifiedReferences.some((reference) =>
      sameToken(reference, evidence.reference),
    )
  ) {
    return refuse(
      "duplicate_reference",
      "This provider reference has already been verified against another invoice.",
    );
  }

  if (!Array.isArray(input.reservations) || input.reservations.length === 0) {
    return refuse(
      "reservation_missing",
      "Verification requires the held reservations for this order.",
    );
  }
  const verifiedAtMs = Date.parse(input.verifiedAt);
  for (const reservation of input.reservations) {
    if (!isValidInstant(reservation.expiresAt)) {
      return refuse(
        "reservation_missing",
        `Reservation ${reservation.reservationId} has no valid expiry.`,
      );
    }
    if (Date.parse(reservation.expiresAt) <= verifiedAtMs) {
      return refuse(
        "reservation_expired",
        `Reservation ${reservation.reservationId} expired before verification.`,
      );
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      invoiceId: input.invoice.invoiceId,
      verifiedAmountCents: evidence.amountCents,
      currency: input.invoice.currency,
      verifiedBy: Object.freeze({
        adminId: input.adminId,
        adminName: input.adminName,
      }),
      verifiedAt: input.verifiedAt,
      intents: Object.freeze([
        Object.freeze({
          kind: "settlement" as const,
          invoiceId: input.invoice.invoiceId,
          amountCents: evidence.amountCents,
          currency: input.invoice.currency,
          providerTransactionId: evidence.transactionId,
        }),
        Object.freeze({
          kind: "reservation_finalize" as const,
          reservationIds: Object.freeze(
            input.reservations.map((reservation) => reservation.reservationId),
          ),
        }),
        Object.freeze({
          kind: "receipt_candidate" as const,
          invoiceId: input.invoice.invoiceId,
          humanRef: input.invoice.humanRef,
          amountCents: evidence.amountCents,
          currency: input.invoice.currency,
          lines: input.invoice.lines,
        }),
        Object.freeze({
          kind: "commission" as const,
          invoiceId: input.invoice.invoiceId,
          eligibleAmountCents: evidence.amountCents,
          currency: input.invoice.currency,
        }),
      ]),
    }),
  };
}

// ---------------------------------------------------------------------------
// Refund candidate
// ---------------------------------------------------------------------------

export interface CommissionReversalIntent {
  readonly kind: "commission_reversal";
  readonly invoiceId: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
}

export interface ManualRefundPlan {
  readonly invoiceId: string;
  readonly amountCents: number;
  readonly currency: SupportedPriceCurrency;
  /** Immutable snapshots of the lines this refund concerns. */
  readonly affectedLines: readonly CartPriceSnapshot[];
  readonly requestedBy: {
    readonly adminId: string;
    readonly adminName: string;
  };
  readonly requestedAt: string;
  readonly intents: readonly CommissionReversalIntent[];
  /**
   * Manual refunds never restock. Inventory returns to sale only after a
   * physical goods-received check, which is a separate human decision.
   */
  readonly restock: false;
}

export interface PlanManualRefundInput {
  readonly invoice: ManualOrderInvoice;
  readonly verification: ManualPaymentVerificationPlan;
  readonly amountCents: number;
  readonly affectedSkus: readonly string[];
  readonly priorRefundedCents?: number;
  readonly adminId: string;
  readonly adminName: string;
  readonly requestedAt: string;
}

export function planManualRefund(
  input: PlanManualRefundInput,
): ManualPaymentResult<ManualRefundPlan> {
  if (!isNonEmptyString(input.adminId) || !isNonEmptyString(input.adminName)) {
    return refuse(
      "admin_not_named",
      "A refund plan requires a named human approver.",
    );
  }
  if (!isValidInstant(input.requestedAt)) {
    return refuse("instant_invalid", "The refund instant is required.");
  }
  if (input.verification.invoiceId !== input.invoice.invoiceId) {
    return refuse(
      "identity_missing",
      "The verification does not belong to this invoice.",
    );
  }
  if (!isPositiveSafeIntegerCents(input.amountCents)) {
    return refuse(
      "refund_amount_invalid",
      "The refund amount must be a positive safe integer number of cents.",
    );
  }

  const priorRefunded = input.priorRefundedCents ?? 0;
  if (
    typeof priorRefunded !== "number" ||
    !Number.isSafeInteger(priorRefunded) ||
    priorRefunded < 0
  ) {
    return refuse(
      "refund_amount_invalid",
      "Prior refunded total must be a non-negative safe integer.",
    );
  }
  // Bounded in AGGREGATE, so a sequence of partial refunds cannot exceed the
  // verified amount even though each one looks acceptable alone.
  if (priorRefunded + input.amountCents > input.verification.verifiedAmountCents) {
    return refuse(
      "refund_exceeds_verified",
      "The refund total would exceed the verified amount.",
    );
  }

  if (!Array.isArray(input.affectedSkus) || input.affectedSkus.length === 0) {
    return refuse(
      "refund_line_unknown",
      "A refund must name the lines it concerns.",
    );
  }
  const affected: CartPriceSnapshot[] = [];
  for (const sku of input.affectedSkus) {
    const line = input.invoice.lines.find((candidate) => candidate.sku === sku);
    if (!line) {
      return refuse(
        "refund_line_unknown",
        `SKU ${sku} is not on this invoice.`,
      );
    }
    affected.push(Object.freeze({ ...line }));
  }

  return {
    ok: true,
    value: Object.freeze({
      invoiceId: input.invoice.invoiceId,
      amountCents: input.amountCents,
      currency: input.invoice.currency,
      affectedLines: Object.freeze(affected),
      requestedBy: Object.freeze({
        adminId: input.adminId,
        adminName: input.adminName,
      }),
      requestedAt: input.requestedAt,
      intents: Object.freeze([
        Object.freeze({
          kind: "commission_reversal" as const,
          invoiceId: input.invoice.invoiceId,
          amountCents: input.amountCents,
          currency: input.invoice.currency,
        }),
      ]),
      restock: false,
    }),
  };
}
