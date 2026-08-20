// The assisted-order PAYMENT contract — the half of the commercial loop that
// sits between an accepted quote and a canonical order.
//
// The quote engine already answers "what does the customer owe": it issues a
// versioned, server-priced quote and mints an `acceptanceId` when the customer
// accepts the exact version and total they were shown. Nothing consumed that
// acceptance. A request could be accepted forever and never become money, and
// there was no durable place to record that instructions were sent, that a
// customer claimed to have paid, that an admin was looking at it, or that the
// money arrived. This file is the vocabulary for that missing stretch.
//
// FOUR RULES SHAPE EVERY SHAPE HERE.
//
// 1. A CLAIM IS NOT A FACT. `proof_submitted` is a customer assertion and it is
//    modelled as one. It is a state the customer can reach and `paid` is not.
//    There is no input field anywhere in this contract that sets `paid`, so a
//    browser posting `{"paid": true}` is not "rejected by validation" — it is
//    describing a field that does not exist. Only two things produce `paid`: a
//    real processor fact carrying a provider event id, or a named admin holding
//    an explicit verification grant. Both are recorded with who and when.
//
// 2. MONEY IS OWED, NOT SUBMITTED. The amount due is copied once from the
//    accepted quote — its exact version and exact total — and is immutable for
//    the life of the payment. A customer never submits a total, an admin never
//    retypes one, and a paid amount that disagrees with the amount due becomes
//    an `exception` rather than a silent partial settlement. A payment whose
//    quote carried no price cannot exist at all; there is no zero.
//
// 3. THE TERMINAL STATES ARE HONEST. `rejected` is not the end of a customer
//    relationship — a rejected proof returns to a payable state so the customer
//    can try again — but `refunded` is terminal, and `exception` is a real place
//    to sit rather than a euphemism for "we lost track". Every state listed here
//    is one the domain can actually produce from recorded evidence.
//
// 4. FULFILLMENT READS PAYMENT, NEVER THE REVERSE. `isSettledPaymentState` is
//    the ONE predicate any fulfillment-readiness decision may consult. It is
//    true for exactly one state.

// ---------------------------------------------------------------------------
// The lifecycle.
// ---------------------------------------------------------------------------

/**
 * The manual-lane payment lifecycle for one accepted assisted-order quote.
 *
 * `payment_required`       acceptance recorded, money owed, nothing sent yet
 * `instructions_presented` Xenios has given the customer a way to pay
 * `proof_submitted`        the customer claims to have paid (a CLAIM)
 * `under_review`           a named human or a reconciliation job is deciding
 * `paid`                   the money is real; only evidence reaches this
 * `rejected`               the attempt failed; the customer may pay again
 * `exception`              something is wrong that a human must resolve
 * `refunded`               money that was paid has been returned (terminal)
 */
export const assistedOrderPaymentStates = [
  "payment_required",
  "instructions_presented",
  "proof_submitted",
  "under_review",
  "paid",
  "rejected",
  "exception",
  "refunded",
] as const;

export type AssistedOrderPaymentState =
  (typeof assistedOrderPaymentStates)[number];

export function isAssistedOrderPaymentState(
  value: unknown,
): value is AssistedOrderPaymentState {
  return (
    typeof value === "string" &&
    (assistedOrderPaymentStates as readonly string[]).includes(value)
  );
}

/**
 * The only predicate a fulfillment-readiness decision may consult, spelled once
 * so no call site re-derives "paid enough" from a list of states it half
 * remembers. `refunded` is deliberately NOT settled: the money went back.
 */
export function isSettledPaymentState(
  state: AssistedOrderPaymentState,
): boolean {
  return state === "paid";
}

/** True once no further customer or admin action can change the outcome. */
export function isTerminalPaymentState(
  state: AssistedOrderPaymentState,
): boolean {
  return state === "refunded";
}

// ---------------------------------------------------------------------------
// Who may cause a transition.
// ---------------------------------------------------------------------------

/**
 * The four actor kinds, ordered by how much the domain trusts them.
 *
 * `customer`  the person who accepted the quote. May follow instructions and
 *             submit proof. Cannot review, cannot verify, cannot refund.
 * `system`    an unattended Xenios process (presenting instructions, expiring,
 *             routing a provider callback into review). Cannot verify.
 * `admin`     a NAMED operator. Verification additionally requires an explicit
 *             grant that admission to the admin surface does not confer.
 * `processor` a real external payment provider fact, carrying the provider's
 *             own event id. This is the only non-human path to `paid`.
 */
export const assistedOrderPaymentActorKinds = [
  "customer",
  "system",
  "admin",
  "processor",
] as const;

export type AssistedOrderPaymentActorKind =
  (typeof assistedOrderPaymentActorKinds)[number];

// ---------------------------------------------------------------------------
// The transition table. Closed, total, and the single source of truth.
// ---------------------------------------------------------------------------

/**
 * Every legal move, keyed by origin. A pair absent from this table is illegal —
 * including every self-transition except the two deliberate re-issues
 * (`instructions_presented` may be re-presented, `exception` may be re-raised
 * with a different reason), which the engine treats as idempotent replays
 * rather than progress.
 *
 * Note what is NOT here:
 * - nothing reaches `paid` except from `under_review` (a decision is always
 *   recorded before money is believed) and from `exception` (a resolved
 *   discrepancy), so there is no path where money becomes real without a human
 *   or a provider fact in the audit trail;
 * - `refunded` has no outgoing edges;
 * - `rejected` returns to `instructions_presented`, never straight to `paid`.
 */
export const assistedOrderPaymentTransitions: Readonly<
  Record<AssistedOrderPaymentState, readonly AssistedOrderPaymentState[]>
> = Object.freeze({
  payment_required: Object.freeze([
    "instructions_presented",
    "exception",
  ] as const),
  instructions_presented: Object.freeze([
    "instructions_presented",
    "proof_submitted",
    "under_review",
    "exception",
  ] as const),
  proof_submitted: Object.freeze(["under_review", "exception"] as const),
  under_review: Object.freeze(["paid", "rejected", "exception"] as const),
  paid: Object.freeze(["refunded", "exception"] as const),
  rejected: Object.freeze(["instructions_presented", "exception"] as const),
  exception: Object.freeze([
    "exception",
    "instructions_presented",
    "under_review",
    "paid",
    "rejected",
    "refunded",
  ] as const),
  refunded: Object.freeze([] as const),
}) as Readonly<
  Record<AssistedOrderPaymentState, readonly AssistedOrderPaymentState[]>
>;

export function isLegalPaymentTransition(
  from: AssistedOrderPaymentState,
  to: AssistedOrderPaymentState,
): boolean {
  return assistedOrderPaymentTransitions[from].includes(to);
}

/**
 * Which actor kinds may cause an arrival at each state, independent of where it
 * came from. This is the authority half of the rule; the transition table is
 * the shape half, and the engine requires BOTH.
 *
 * `paid` lists `admin` and `processor` only, and the engine additionally
 * demands a named verification grant for the admin case. `customer` appears
 * against exactly one state.
 */
export const assistedOrderPaymentStateAuthority: Readonly<
  Record<AssistedOrderPaymentState, readonly AssistedOrderPaymentActorKind[]>
> = Object.freeze({
  payment_required: Object.freeze(["system", "admin"] as const),
  instructions_presented: Object.freeze(["system", "admin"] as const),
  proof_submitted: Object.freeze(["customer", "admin"] as const),
  under_review: Object.freeze(["system", "admin", "processor"] as const),
  paid: Object.freeze(["admin", "processor"] as const),
  rejected: Object.freeze(["admin", "processor"] as const),
  exception: Object.freeze(["system", "admin", "processor"] as const),
  refunded: Object.freeze(["admin"] as const),
}) as Readonly<
  Record<AssistedOrderPaymentState, readonly AssistedOrderPaymentActorKind[]>
>;

export function mayActorReachPaymentState(
  actor: AssistedOrderPaymentActorKind,
  state: AssistedOrderPaymentState,
): boolean {
  return assistedOrderPaymentStateAuthority[state].includes(actor);
}

// ---------------------------------------------------------------------------
// What the customer is told to do next.
// ---------------------------------------------------------------------------

/**
 * The customer's next action, derived from state — never stored, never sent by
 * a client. A projection exists so the UI renders one authoritative sentence
 * instead of each surface inventing its own reading of the state name.
 */
export const assistedOrderPaymentNextActions = [
  /** Xenios owes the customer instructions. */
  "await_instructions",
  /** Instructions are live; pay them. */
  "follow_instructions",
  /** The claim is in; nothing for the customer to do. */
  "await_review",
  /** Settled. */
  "none_paid",
  /** The attempt failed; new instructions are available. */
  "retry_payment",
  /** A human needs to untangle it; contacting Xenios is the action. */
  "contact_xenios",
  /** Money returned; the request is closed commercially. */
  "none_refunded",
] as const;

export type AssistedOrderPaymentNextAction =
  (typeof assistedOrderPaymentNextActions)[number];

export function paymentNextActionFor(
  state: AssistedOrderPaymentState,
): AssistedOrderPaymentNextAction {
  switch (state) {
    case "payment_required":
      return "await_instructions";
    case "instructions_presented":
      return "follow_instructions";
    case "proof_submitted":
    case "under_review":
      return "await_review";
    case "paid":
      return "none_paid";
    case "rejected":
      return "retry_payment";
    case "exception":
      return "contact_xenios";
    case "refunded":
      return "none_refunded";
  }
}

// ---------------------------------------------------------------------------
// Money.
// ---------------------------------------------------------------------------

/** $1,000,000.00. A single assisted request beyond this is a bug, not a sale. */
export const MAX_ASSISTED_ORDER_PAYMENT_CENTS = 100_000_000;

/**
 * The amount owed, copied from the accepted quote and never recomputed from a
 * later catalog read. `quoteVersion` travels with it so an admin looking at a
 * payment can see exactly which quote the customer agreed to.
 */
export type AssistedOrderAmountDue = Readonly<{
  amountDueCents: number;
  currency: "USD";
  quoteId: string;
  quoteVersion: number;
  acceptanceId: string;
}>;

/**
 * Guard for an amount the domain is willing to owe. A missing or zero price is
 * refused here rather than defaulted, which is the mechanism behind the
 * platform-wide "never show $0" rule: an unpriced line cannot reach a quote,
 * an unpriced quote cannot reach an acceptance, and an acceptance without a
 * positive total cannot open a payment.
 */
export function isPayableAmountCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_ASSISTED_ORDER_PAYMENT_CENTS
  );
}

// ---------------------------------------------------------------------------
// Customer-facing projections. Allowlists, never spreads.
// ---------------------------------------------------------------------------

/**
 * Payment instructions as the customer receives them. `methodCode` and
 * `reference` identify how to pay and how Xenios will recognise the money.
 * There is no account number field: the instruction body is composed
 * server-side from configured secrets, and this type carries the rendered,
 * customer-safe text only.
 */
export type AssistedOrderPaymentInstructionsView = Readonly<{
  methodCode: string;
  methodLabel: string;
  /** The reference the customer must quote. Derived from the request. */
  paymentReference: string;
  /** Server-composed, customer-safe. Never contains internal notes. */
  body: string;
  presentedAt: string;
  /** After this instant the instructions are stale and must be re-presented. */
  expiresAt: string;
}>;

/**
 * What the customer sees. Carries the amount and the next action and nothing
 * operational: no verifier name, no internal note, no evidence hash, no
 * provider event id, no reviewer decision text.
 */
export type AssistedOrderPaymentView = Readonly<{
  paymentId: string;
  requestPublicReference: string;
  state: AssistedOrderPaymentState;
  nextAction: AssistedOrderPaymentNextAction;
  amountDueCents: number;
  currency: "USD";
  quoteId: string;
  quoteVersion: number;
  /** Present only while instructions are live and unexpired. */
  instructions: AssistedOrderPaymentInstructionsView | null;
  /** True only when the domain holds real settlement evidence. */
  settled: boolean;
  openedAt: string;
  updatedAt: string;
  /** Set only on arrival at `paid`. Never a claim timestamp. */
  settledAt: string | null;
}>;

/**
 * What the customer submits when claiming to have paid. Note the shape: there
 * is no amount, no date the customer chooses, and no state. A claim carries a
 * reference and a description of evidence held OUTSIDE the platform, and that
 * is all it is allowed to influence.
 */
export type AssistedOrderPaymentProofInput = Readonly<{
  paymentId: string;
  /** The customer's own reference for the transfer they say they made. */
  customerReference: string;
  /** Free text: "wire sent Tuesday from the business account". */
  note: string;
  /**
   * Caller-supplied de-duplication key so a double-tapped submit button files
   * one claim. Scoped to the payment; a key reused with different content is a
   * conflict, not a replay.
   */
  idempotencyKey: string;
}>;

/** The receipt for a filed claim. `replayed` reports a de-duplicated submit. */
export type AssistedOrderPaymentProofReceipt = Readonly<{
  proofId: string;
  paymentId: string;
  state: AssistedOrderPaymentState;
  nextAction: AssistedOrderPaymentNextAction;
  submittedAt: string;
  replayed: boolean;
}>;

// ---------------------------------------------------------------------------
// The operator projection. Authorized admin surfaces only.
// ---------------------------------------------------------------------------

/**
 * What an authorized operator sees. Carries the two things the customer view
 * deliberately withholds — who verified what, and what actually arrived — plus
 * the claim trail, so an admin can tell "the customer says so" apart from "we
 * checked" at a glance.
 *
 * `exceptionReason` is here and nowhere else. It is operator text and may name
 * amounts, bank detail or suspicion; it has no customer rendering anywhere.
 */
export type AssistedOrderPaymentAdminProofView = Readonly<{
  proofId: string;
  customerReference: string;
  note: string;
  submittedAt: string;
  submittedByLabel: string;
  reviewOutcome: "pending" | "accepted" | "rejected";
}>;

export type AssistedOrderPaymentAdminSettlementView = Readonly<{
  settlementId: string;
  verifiedAmountCents: number;
  currency: "USD";
  verifiedAt: string;
  verifiedByLabel: string;
  verifiedByKind: "admin" | "processor";
  evidenceRef: string;
}>;

export type AssistedOrderPaymentAdminEventView = Readonly<{
  eventId: string;
  from: AssistedOrderPaymentState | null;
  to: AssistedOrderPaymentState;
  actorKind: AssistedOrderPaymentActorKind;
  actorLabel: string;
  at: string;
  evidenceRef: string | null;
}>;

export type AssistedOrderPaymentAdminView = Readonly<{
  paymentId: string;
  requestId: string;
  requestPublicReference: string;
  state: AssistedOrderPaymentState;
  amountDueCents: number;
  currency: "USD";
  quoteId: string;
  quoteVersion: number;
  acceptanceId: string;
  instructions: AssistedOrderPaymentInstructionsView | null;
  proofs: readonly AssistedOrderPaymentAdminProofView[];
  settlement: AssistedOrderPaymentAdminSettlementView | null;
  exceptionReason: string | null;
  history: readonly AssistedOrderPaymentAdminEventView[];
  openedAt: string;
  updatedAt: string;
  settledAt: string | null;
}>;

// ---------------------------------------------------------------------------
// Refusal vocabulary, shared by the engine and the doors above it.
// ---------------------------------------------------------------------------

export const assistedOrderPaymentRefusalCodes = [
  "PAYMENT_NOT_FOUND",
  "QUOTE_NOT_ACCEPTED",
  "QUOTE_STALE",
  "AMOUNT_NOT_PAYABLE",
  "ILLEGAL_TRANSITION",
  "ACTOR_NOT_AUTHORIZED",
  "VERIFICATION_GRANT_REQUIRED",
  "EVIDENCE_REQUIRED",
  "AMOUNT_MISMATCH",
  "IDEMPOTENCY_CONFLICT",
  "INSTRUCTIONS_EXPIRED",
  "PAYMENT_ALREADY_OPEN",
  "NOT_SETTLED",
] as const;

export type AssistedOrderPaymentRefusalCode =
  (typeof assistedOrderPaymentRefusalCodes)[number];
