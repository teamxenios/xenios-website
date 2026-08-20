// Ports for the assisted-order payment engine. Same discipline as the quote
// lane's ports.ts: pure interfaces, no I/O, no Express, composition decides.
//
// Two ports here carry the authority rules that make this lane safe, and both
// are deliberately OUTBOUND — the engine asks, it never assumes.
//
// `AssistedOrderPaymentVerificationAuthority` answers "may this viewer mark
// money real, and under what recorded name". Admission to an admin surface is
// not authorization to verify payment, so this is a separate grant the
// composition root resolves from the real role store. The engine cannot fake
// it, and a memory implementation that returns null in tests is the reason the
// negative tests can prove a browser cannot buy its way to `paid`.
//
// `AssistedOrderPaymentInstructionsComposer` renders the customer-safe payment
// instruction body from configured server-side secrets. The engine never sees
// an account number and never accepts one from an input, which is why no
// instruction field in the contract can leak from a client payload.

import type {
  AssistedOrderPaymentActorKind,
  AssistedOrderPaymentInstructionsView,
  AssistedOrderPaymentState,
} from "../../../../shared/research/assisted-order/payment-contract";
import type { AssistedOrderViewer } from "../ports";

// ---------------------------------------------------------------------------
// Actors.
// ---------------------------------------------------------------------------

/**
 * The recordable actor behind one transition. Every variant carries the label
 * that lands in the audit trail; there is no anonymous transition.
 *
 * `processor` additionally carries the provider's own event id. That id is the
 * evidence — the engine refuses a processor transition without one, so a
 * fabricated "the processor said so" cannot be spelled.
 */
export type AssistedOrderPaymentActor =
  | Readonly<{ kind: "customer"; label: string }>
  | Readonly<{ kind: "system"; label: string }>
  | Readonly<{ kind: "admin"; label: string; adminId: string }>
  | Readonly<{
      kind: "processor";
      label: string;
      providerId: string;
      providerEventId: string;
    }>;

export function actorKindOf(
  actor: AssistedOrderPaymentActor,
): AssistedOrderPaymentActorKind {
  return actor.kind;
}

// ---------------------------------------------------------------------------
// Records.
// ---------------------------------------------------------------------------

/** One recorded step in a payment's life. Append-only; never rewritten. */
export type AssistedOrderPaymentEventRecord = Readonly<{
  eventId: string;
  from: AssistedOrderPaymentState | null;
  to: AssistedOrderPaymentState;
  actorKind: AssistedOrderPaymentActorKind;
  actorLabel: string;
  at: string;
  /** Points at real evidence: a provider event id, a review decision, a proof. */
  evidenceRef: string | null;
  /** INTERNAL ONLY. Never enters a customer projection. */
  internalNote: string | null;
}>;

/** A customer's claim to have paid. A claim, not a settlement. */
export type AssistedOrderPaymentProofRecord = Readonly<{
  proofId: string;
  paymentId: string;
  customerReference: string;
  note: string;
  idempotencyKey: string;
  submittedAt: string;
  submittedByLabel: string;
  /**
   * Whether an admin has adjudicated this specific claim. A proof is never
   * "accepted" by the act of arriving.
   */
  reviewOutcome: "pending" | "accepted" | "rejected";
}>;

/**
 * The settlement fact. Exists only when `state === "paid"`, and holds the
 * amount that ACTUALLY arrived alongside the amount that was owed, so a
 * mismatch is visible rather than averaged away.
 */
export type AssistedOrderPaymentSettlementRecord = Readonly<{
  settlementId: string;
  /** What really arrived. Compared against amountDueCents, never replacing it. */
  verifiedAmountCents: number;
  currency: "USD";
  verifiedAt: string;
  /** The named admin, or the provider id for a processor fact. Never blank. */
  verifiedByLabel: string;
  verifiedByKind: Extract<AssistedOrderPaymentActorKind, "admin" | "processor">;
  /** Provider event id, bank reference, or the reviewed proof id. Never blank. */
  evidenceRef: string;
  /**
   * Derived once at settlement from the ORDER identity, so first call and every
   * replay compute the same key. A store treating this as a unique constraint
   * physically holds one settlement per payment.
   */
  settlementUniqueKey: string;
}>;

export type AssistedOrderPaymentRefundRecord = Readonly<{
  refundId: string;
  refundedAmountCents: number;
  currency: "USD";
  refundedAt: string;
  refundedByLabel: string;
  reason: string;
  evidenceRef: string;
}>;

/** The durable payment. Server-only; never serialized to a customer directly. */
export type AssistedOrderPaymentRecord = Readonly<{
  paymentId: string;
  requestId: string;
  requestPublicReference: string;
  state: AssistedOrderPaymentState;
  /** Optimistic-concurrency counter. Every write bumps it. */
  revision: number;

  // Money, copied once from the accepted quote.
  amountDueCents: number;
  currency: "USD";
  quoteId: string;
  quoteVersion: number;
  acceptanceId: string;

  instructions: AssistedOrderPaymentInstructionsView | null;
  proofs: readonly AssistedOrderPaymentProofRecord[];
  settlement: AssistedOrderPaymentSettlementRecord | null;
  refund: AssistedOrderPaymentRefundRecord | null;
  /** Set whenever the payment enters `exception`; cleared on resolution. */
  exceptionReason: string | null;
  history: readonly AssistedOrderPaymentEventRecord[];

  openedAt: string;
  updatedAt: string;
  settledAt: string | null;
}>;

// ---------------------------------------------------------------------------
// Outbound ports.
// ---------------------------------------------------------------------------

export type AssistedOrderPaymentRepository = Readonly<{
  /**
   * Insert-once on `requestId`. An implementation MUST refuse a second open
   * payment for the same request; the engine reports the incumbent instead.
   */
  create(record: AssistedOrderPaymentRecord): Promise<void>;
  byId(paymentId: string): Promise<AssistedOrderPaymentRecord | null>;
  byRequest(requestId: string): Promise<AssistedOrderPaymentRecord | null>;
  /**
   * Replace the stored record whose paymentId matches AND whose stored revision
   * equals `expectedRevision`. Both the memory and SQL implementations refuse a
   * lost update rather than overwriting one.
   */
  update(
    record: AssistedOrderPaymentRecord,
    expectedRevision: number,
  ): Promise<void>;
}>;

/**
 * How the payment engine learns what was accepted. Implemented by the
 * composition over the EXISTING quote repository — the payment lane never
 * grows a second copy of quote state, and never re-prices anything.
 */
export type AssistedOrderPaymentQuoteDirectory = Readonly<{
  acceptedQuoteFor(requestId: string): Promise<Readonly<{
    quoteId: string;
    requestId: string;
    requestPublicReference: string;
    version: number;
    state: string;
    totalCents: number;
    currency: "USD";
    acceptanceId: string | null;
    acceptedAt: string | null;
    validUntil: string;
  }> | null>;
}>;

/** Ownership, resolved against the request — identical shape to the quote lane. */
export type AssistedOrderPaymentRequestDirectory = Readonly<{
  byPublicReference(publicReference: string): Promise<Readonly<{
    requestId: string;
    publicReference: string;
    actorMemberId: string | null;
    earlyAccessSessionHash: string | null;
    normalizedEmail: string | null;
  }> | null>;
}>;

/**
 * Resolves whether a viewer holds the explicit, named grant to turn money real.
 * Returns the label to record, or null. Composition reads the real role store;
 * no default implementation returns a non-null value.
 */
export type AssistedOrderPaymentVerificationAuthority = Readonly<{
  verifierFor(viewer: AssistedOrderViewer): Promise<Readonly<{
    adminId: string;
    label: string;
  }> | null>;
}>;

/**
 * Renders customer-safe instructions from server-side configuration. The engine
 * supplies the reference and the amount; the composer supplies the method and
 * the body. No secret ever passes through the engine.
 */
export type AssistedOrderPaymentInstructionsComposer = Readonly<{
  compose(input: Readonly<{
    methodCode: string;
    paymentReference: string;
    amountDueCents: number;
    currency: "USD";
    presentedAt: Date;
  }>): Promise<Readonly<{
    methodCode: string;
    methodLabel: string;
    body: string;
    expiresAt: string;
  }> | null>;
}>;

export type AssistedOrderPaymentAuditSink = Readonly<{
  record(event: Readonly<Record<string, unknown>>): Promise<void>;
}>;

export type AssistedOrderPaymentClock = Readonly<{ now(): Date }>;

export type AssistedOrderPaymentIds = Readonly<{ uuid(): string }>;

export type AssistedOrderPaymentDependencies = Readonly<{
  repository: AssistedOrderPaymentRepository;
  quotes: AssistedOrderPaymentQuoteDirectory;
  requests: AssistedOrderPaymentRequestDirectory;
  verification: AssistedOrderPaymentVerificationAuthority;
  instructions: AssistedOrderPaymentInstructionsComposer;
  audit: AssistedOrderPaymentAuditSink;
  clock: AssistedOrderPaymentClock;
  ids: AssistedOrderPaymentIds;
}>;

export type { AssistedOrderViewer };
