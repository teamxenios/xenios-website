// The assisted-order payment engine: open -> present instructions -> customer
// claim -> review -> settle | reject | exception -> refund.
//
// Deliberately NOT mounted anywhere yet — the HTTP doors and the admin UI
// action are the next slice, behind their own lease on the mount seams.
//
// EVERY transition in this file goes through one private helper, `advance`,
// which checks the shape rule (the transition table) and the authority rule
// (which actor kinds may arrive at the destination) and refuses unless BOTH
// pass. That is the reason no method here can accidentally invent a new path
// to `paid`: adding a method does not add an edge, and adding an edge does not
// add an actor.
//
// Authorization mirrors the quote lane:
// - operator actions need `assisted_orders:manage` (the admin guard runs first
//   at the door; capability is still checked here — admission is not
//   authorization);
// - marking money real needs `assisted_orders:manage` AND a separate named
//   verification grant resolved through a port, because being an admin is not
//   the same as being allowed to say a wire landed;
// - customer actions need the same ownership the status read uses, and
//   ownership failures collapse into not-found so no door becomes an existence
//   oracle.

import {
  isLegalPaymentTransition,
  isPayableAmountCents,
  isSettledPaymentState,
  mayActorReachPaymentState,
  paymentNextActionFor,
  type AssistedOrderAmountDue,
  type AssistedOrderPaymentAdminView,
  type AssistedOrderPaymentProofInput,
  type AssistedOrderPaymentProofReceipt,
  type AssistedOrderPaymentRefusalCode,
  type AssistedOrderPaymentState,
  type AssistedOrderPaymentView,
} from "../../../../shared/research/assisted-order/payment-contract";
import type {
  AssistedOrderPaymentActor,
  AssistedOrderPaymentDependencies,
  AssistedOrderPaymentEventRecord,
  AssistedOrderPaymentProofRecord,
  AssistedOrderPaymentRecord,
  AssistedOrderViewer,
} from "./ports";

// ---------------------------------------------------------------------------
// Refusals.
// ---------------------------------------------------------------------------

export class AssistedOrderPaymentValidationError extends Error {
  public constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "AssistedOrderPaymentValidationError";
  }
}

export class AssistedOrderPaymentAuthorizationError extends Error {
  public constructor(
    public readonly code: AssistedOrderPaymentRefusalCode,
    message = "This action is not authorized.",
  ) {
    super(message);
    this.name = "AssistedOrderPaymentAuthorizationError";
  }
}

export class AssistedOrderPaymentNotFoundError extends Error {
  public readonly code: AssistedOrderPaymentRefusalCode = "PAYMENT_NOT_FOUND";
  public constructor(message = "The payment was not found.") {
    super(message);
    this.name = "AssistedOrderPaymentNotFoundError";
  }
}

export class AssistedOrderPaymentConflictError extends Error {
  public constructor(
    public readonly code: AssistedOrderPaymentRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "AssistedOrderPaymentConflictError";
  }
}

// ---------------------------------------------------------------------------
// Small guards.
// ---------------------------------------------------------------------------

function requireCapability(
  viewer: AssistedOrderViewer,
  capability: "assisted_orders:manage" | "assisted_orders:read_own",
): void {
  if (!viewer.capabilities.has(capability)) {
    throw new AssistedOrderPaymentAuthorizationError("ACTOR_NOT_AUTHORIZED");
  }
}

function ownsRequest(
  viewer: AssistedOrderViewer,
  binding: Readonly<{
    actorMemberId: string | null;
    earlyAccessSessionHash: string | null;
  }>,
): boolean {
  if (viewer.actorType === "member") {
    return (
      viewer.memberId !== null && viewer.memberId === binding.actorMemberId
    );
  }
  if (viewer.actorType === "early_access_session") {
    return (
      viewer.earlyAccessSessionHash !== null &&
      viewer.earlyAccessSessionHash === binding.earlyAccessSessionHash
    );
  }
  return false;
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AssistedOrderPaymentValidationError(
      field,
      `${field} must be a non-empty string.`,
    );
  }
  return value.trim();
}

/**
 * The settlement key is a pure function of the PAYMENT id, never of the
 * idempotency key or the actor, so the first call and every replay derive the
 * same value. A store enforcing uniqueness on it physically holds one
 * settlement per payment even if two admins click at the same instant.
 */
export function settlementUniqueKeyFor(paymentId: string): string {
  return `assisted-order-payment-settlement:${paymentId}`;
}

// ---------------------------------------------------------------------------
// Projections.
// ---------------------------------------------------------------------------

/** The customer-safe view. An allowlist; nothing operational crosses. */
export function customerPaymentView(
  record: AssistedOrderPaymentRecord,
  now: Date,
): AssistedOrderPaymentView {
  const live =
    record.instructions !== null &&
    Date.parse(record.instructions.expiresAt) > now.getTime()
      ? record.instructions
      : null;
  return Object.freeze({
    paymentId: record.paymentId,
    requestPublicReference: record.requestPublicReference,
    state: record.state,
    nextAction: paymentNextActionFor(record.state),
    amountDueCents: record.amountDueCents,
    currency: record.currency,
    quoteId: record.quoteId,
    quoteVersion: record.quoteVersion,
    instructions: live,
    settled: isSettledPaymentState(record.state),
    openedAt: record.openedAt,
    updatedAt: record.updatedAt,
    settledAt: record.settledAt,
  });
}

/**
 * The operator projection. Still an allowlist rather than the raw record: the
 * internal note on each history event stays server-side even for an admin
 * surface, because it is scratch reasoning rather than a recorded decision.
 */
export function adminPaymentView(
  record: AssistedOrderPaymentRecord,
): AssistedOrderPaymentAdminView {
  return Object.freeze({
    paymentId: record.paymentId,
    requestId: record.requestId,
    requestPublicReference: record.requestPublicReference,
    state: record.state,
    amountDueCents: record.amountDueCents,
    currency: record.currency,
    quoteId: record.quoteId,
    quoteVersion: record.quoteVersion,
    acceptanceId: record.acceptanceId,
    instructions: record.instructions,
    proofs: Object.freeze(
      record.proofs.map((proof) =>
        Object.freeze({
          proofId: proof.proofId,
          customerReference: proof.customerReference,
          note: proof.note,
          submittedAt: proof.submittedAt,
          submittedByLabel: proof.submittedByLabel,
          reviewOutcome: proof.reviewOutcome,
        }),
      ),
    ),
    settlement: record.settlement
      ? Object.freeze({
          settlementId: record.settlement.settlementId,
          verifiedAmountCents: record.settlement.verifiedAmountCents,
          currency: record.settlement.currency,
          verifiedAt: record.settlement.verifiedAt,
          verifiedByLabel: record.settlement.verifiedByLabel,
          verifiedByKind: record.settlement.verifiedByKind,
          evidenceRef: record.settlement.evidenceRef,
        })
      : null,
    exceptionReason: record.exceptionReason,
    history: Object.freeze(
      record.history.map((event) =>
        Object.freeze({
          eventId: event.eventId,
          from: event.from,
          to: event.to,
          actorKind: event.actorKind,
          actorLabel: event.actorLabel,
          at: event.at,
          evidenceRef: event.evidenceRef,
        }),
      ),
    ),
    openedAt: record.openedAt,
    updatedAt: record.updatedAt,
    settledAt: record.settledAt,
  });
}

/** The amount owed, for the conversion lane. Never recomputed downstream. */
export function amountDueOf(
  record: AssistedOrderPaymentRecord,
): AssistedOrderAmountDue {
  return Object.freeze({
    amountDueCents: record.amountDueCents,
    currency: record.currency,
    quoteId: record.quoteId,
    quoteVersion: record.quoteVersion,
    acceptanceId: record.acceptanceId,
  });
}

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------

export type MarkPaidInput = Readonly<{
  paymentId: string;
  /** What actually arrived. Compared to the amount owed, never replacing it. */
  verifiedAmountCents: number;
  /** Bank reference, provider event id, or the reviewed proof id. Required. */
  evidenceRef: string;
  externalTransactionId?: string | null;
  internalNote?: string | null;
}>;

export type ProcessorSettlementFact = Readonly<{
  paymentId: string;
  providerId: string;
  providerEventId: string;
  verifiedAmountCents: number;
  currency: "USD";
}>;

export class AssistedOrderPaymentService {
  public constructor(
    private readonly deps: AssistedOrderPaymentDependencies,
  ) {}

  // -------------------------------------------------------------------------
  // Opening.
  // -------------------------------------------------------------------------

  /**
   * Open the payment for a request whose quote the customer accepted. The
   * amount is copied from the ACCEPTED quote and from nowhere else: an admin
   * cannot pass a total, and a request with no accepted quote has no payment.
   *
   * Idempotent: a second open returns the incumbent rather than a second
   * payment, so a duplicated admin click cannot produce two amounts owed.
   */
  public async open(
    viewer: AssistedOrderViewer,
    requestId: string,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const id = nonBlank(requestId, "requestId");

    const existing = await this.deps.repository.byRequest(id);
    if (existing) {
      return customerPaymentView(existing, this.deps.clock.now());
    }

    const quote = await this.deps.quotes.acceptedQuoteFor(id);
    if (!quote) {
      throw new AssistedOrderPaymentNotFoundError(
        "This request has no quote to pay.",
      );
    }
    if (quote.state !== "accepted" || !quote.acceptanceId) {
      throw new AssistedOrderPaymentConflictError(
        "QUOTE_NOT_ACCEPTED",
        "A payment can only be opened against an accepted quote.",
      );
    }
    // A quote that expired before acceptance was recorded, or that has since
    // been superseded, must be re-quoted rather than silently billed.
    if (!isPayableAmountCents(quote.totalCents)) {
      throw new AssistedOrderPaymentConflictError(
        "AMOUNT_NOT_PAYABLE",
        "The accepted quote does not carry a payable total.",
      );
    }

    const now = this.deps.clock.now();
    const paymentId = this.deps.ids.uuid();
    const opened: AssistedOrderPaymentRecord = Object.freeze({
      paymentId,
      requestId: quote.requestId,
      requestPublicReference: quote.requestPublicReference,
      state: "payment_required" as AssistedOrderPaymentState,
      revision: 1,
      amountDueCents: quote.totalCents,
      currency: quote.currency,
      quoteId: quote.quoteId,
      quoteVersion: quote.version,
      acceptanceId: quote.acceptanceId,
      instructions: null,
      proofs: Object.freeze([]),
      settlement: null,
      refund: null,
      exceptionReason: null,
      history: Object.freeze([
        Object.freeze({
          eventId: this.deps.ids.uuid(),
          from: null,
          to: "payment_required" as AssistedOrderPaymentState,
          actorKind: "admin" as const,
          actorLabel: viewer.actorLabel ?? "admin",
          at: now.toISOString(),
          evidenceRef: quote.acceptanceId,
          internalNote: null,
        }),
      ]),
      openedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      settledAt: null,
    });

    await this.deps.repository.create(opened);
    await this.deps.audit.record({
      type: "assisted_order_payment_opened",
      paymentId,
      requestId: opened.requestId,
      quoteId: opened.quoteId,
      quoteVersion: opened.quoteVersion,
      acceptanceId: opened.acceptanceId,
      amountDueCents: opened.amountDueCents,
      at: opened.openedAt,
    });
    return customerPaymentView(opened, now);
  }

  // -------------------------------------------------------------------------
  // Instructions.
  // -------------------------------------------------------------------------

  /**
   * Present (or re-present) payment instructions. The body is composed by the
   * configured server-side composer; nothing about an account reaches this
   * method, so nothing about an account can arrive from a client.
   */
  public async presentInstructions(
    viewer: AssistedOrderViewer,
    paymentId: string,
    methodCode: string,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const record = await this.load(paymentId);
    const now = this.deps.clock.now();
    const method = nonBlank(methodCode, "methodCode");

    const composed = await this.deps.instructions.compose({
      methodCode: method,
      paymentReference: record.requestPublicReference,
      amountDueCents: record.amountDueCents,
      currency: record.currency,
      presentedAt: now,
    });
    if (!composed) {
      throw new AssistedOrderPaymentConflictError(
        "EVIDENCE_REQUIRED",
        `No configured payment instructions for method ${method}.`,
      );
    }

    const next = await this.advance(record, "instructions_presented", {
      kind: "admin",
      label: viewer.actorLabel ?? "admin",
      adminId: viewer.memberId ?? (viewer.actorLabel ?? "admin"),
    }, {
      evidenceRef: null,
      mutate: (base) => ({
        ...base,
        exceptionReason: null,
        instructions: Object.freeze({
          methodCode: composed.methodCode,
          methodLabel: composed.methodLabel,
          paymentReference: record.requestPublicReference,
          body: composed.body,
          presentedAt: now.toISOString(),
          expiresAt: composed.expiresAt,
        }),
      }),
    });
    return customerPaymentView(next, now);
  }

  // -------------------------------------------------------------------------
  // The customer's claim.
  // -------------------------------------------------------------------------

  /**
   * File the customer's claim to have paid. This is the ONLY state a customer
   * can cause, and it is `proof_submitted` — a claim. There is no amount on the
   * input and no path from here to `paid` without a review.
   *
   * Idempotent on `idempotencyKey`, scoped to the payment: a double-tapped
   * submit files one claim; the same key with different content is a conflict.
   */
  public async submitProof(
    viewer: AssistedOrderViewer,
    publicReference: string,
    input: AssistedOrderPaymentProofInput,
  ): Promise<AssistedOrderPaymentProofReceipt> {
    requireCapability(viewer, "assisted_orders:read_own");
    const binding = await this.deps.requests.byPublicReference(publicReference);
    if (!binding || !ownsRequest(viewer, binding)) {
      throw new AssistedOrderPaymentNotFoundError("The request was not found.");
    }
    const record = await this.load(input.paymentId);
    // Ownership is decided on the REQUEST the viewer proved, then the payment
    // must belong to that same request. A payment id guessed from another
    // customer's request therefore reads as not-found, not as forbidden.
    if (record.requestId !== binding.requestId) {
      throw new AssistedOrderPaymentNotFoundError();
    }

    const customerReference = nonBlank(
      input.customerReference,
      "customerReference",
    );
    const note = typeof input.note === "string" ? input.note.trim() : "";
    const idempotencyKey = nonBlank(input.idempotencyKey, "idempotencyKey");

    const prior = record.proofs.find((p) => p.idempotencyKey === idempotencyKey);
    if (prior) {
      if (
        prior.customerReference !== customerReference ||
        prior.note !== note
      ) {
        throw new AssistedOrderPaymentConflictError(
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used with different content.",
        );
      }
      return Object.freeze({
        proofId: prior.proofId,
        paymentId: record.paymentId,
        state: record.state,
        nextAction: paymentNextActionFor(record.state),
        submittedAt: prior.submittedAt,
        replayed: true,
      });
    }

    const now = this.deps.clock.now();
    const proof: AssistedOrderPaymentProofRecord = Object.freeze({
      proofId: this.deps.ids.uuid(),
      paymentId: record.paymentId,
      customerReference,
      note,
      idempotencyKey,
      submittedAt: now.toISOString(),
      submittedByLabel: viewer.actorLabel ?? "customer",
      reviewOutcome: "pending" as const,
    });

    const next = await this.advance(record, "proof_submitted", {
      kind: "customer",
      label: proof.submittedByLabel,
    }, {
      evidenceRef: proof.proofId,
      mutate: (base) => ({
        ...base,
        proofs: Object.freeze([...base.proofs, proof]),
      }),
    });

    await this.deps.audit.record({
      type: "assisted_order_payment_proof_submitted",
      paymentId: record.paymentId,
      requestId: record.requestId,
      proofId: proof.proofId,
      at: proof.submittedAt,
    });

    return Object.freeze({
      proofId: proof.proofId,
      paymentId: next.paymentId,
      state: next.state,
      nextAction: paymentNextActionFor(next.state),
      submittedAt: proof.submittedAt,
      replayed: false,
    });
  }

  // -------------------------------------------------------------------------
  // Review.
  // -------------------------------------------------------------------------

  /** Take the claim into review. Records who is looking, before any decision. */
  public async beginReview(
    viewer: AssistedOrderViewer,
    paymentId: string,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const record = await this.load(paymentId);
    const next = await this.advance(record, "under_review", {
      kind: "admin",
      label: viewer.actorLabel ?? "admin",
      adminId: viewer.memberId ?? (viewer.actorLabel ?? "admin"),
    }, { evidenceRef: null });
    return customerPaymentView(next, this.deps.clock.now());
  }

  /**
   * Turn money real, by a NAMED admin holding an explicit verification grant.
   *
   * Three separate things must be true, and the negative tests pin each: the
   * viewer has `assisted_orders:manage`; the verification port returns a named
   * grant for that viewer; and the amount that arrived equals the amount owed.
   * A mismatch does NOT become a partial payment — it becomes an `exception`
   * for a human, because a wrong number silently accepted is worse than a
   * flagged one.
   *
   * Idempotent: the settlement key is derived from the payment id, so a replay
   * returns the original settlement and reports it once.
   */
  public async markPaid(
    viewer: AssistedOrderViewer,
    input: MarkPaidInput,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const grant = await this.deps.verification.verifierFor(viewer);
    if (!grant) {
      throw new AssistedOrderPaymentAuthorizationError(
        "VERIFICATION_GRANT_REQUIRED",
        "Marking a payment verified requires an explicit verification grant.",
      );
    }
    const record = await this.load(input.paymentId);
    const evidenceRef = nonBlank(input.evidenceRef, "evidenceRef");

    if (record.settlement) {
      // Replay. Report the incumbent rather than settling twice.
      return customerPaymentView(record, this.deps.clock.now());
    }
    return this.settle(record, {
      kind: "admin",
      label: grant.label,
      adminId: grant.adminId,
    }, {
      verifiedAmountCents: input.verifiedAmountCents,
      evidenceRef,
      verifiedByKind: "admin",
      internalNote: input.internalNote ?? null,
    });
  }

  /**
   * Turn money real from a real processor fact. The provider's own event id is
   * the evidence and is required; there is no way to spell this call without
   * one, which is what stops a fabricated processor event.
   */
  public async recordProcessorSettlement(
    fact: ProcessorSettlementFact,
  ): Promise<AssistedOrderPaymentView> {
    const providerId = nonBlank(fact.providerId, "providerId");
    const providerEventId = nonBlank(fact.providerEventId, "providerEventId");
    const record = await this.load(fact.paymentId);

    if (record.settlement) {
      if (record.settlement.evidenceRef === providerEventId) {
        return customerPaymentView(record, this.deps.clock.now());
      }
      throw new AssistedOrderPaymentConflictError(
        "IDEMPOTENCY_CONFLICT",
        "This payment already settled against different evidence.",
      );
    }
    return this.settle(record, {
      kind: "processor",
      label: providerId,
      providerId,
      providerEventId,
    }, {
      verifiedAmountCents: fact.verifiedAmountCents,
      evidenceRef: providerEventId,
      verifiedByKind: "processor",
      internalNote: null,
    });
  }

  /** Reject the attempt. The customer may pay again; nothing is terminal here. */
  public async reject(
    viewer: AssistedOrderViewer,
    paymentId: string,
    reason: string,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const record = await this.load(paymentId);
    const note = nonBlank(reason, "reason");
    const next = await this.advance(record, "rejected", {
      kind: "admin",
      label: viewer.actorLabel ?? "admin",
      adminId: viewer.memberId ?? (viewer.actorLabel ?? "admin"),
    }, {
      evidenceRef: null,
      internalNote: note,
      mutate: (base) => ({
        ...base,
        proofs: Object.freeze(
          base.proofs.map((p) =>
            p.reviewOutcome === "pending"
              ? Object.freeze({ ...p, reviewOutcome: "rejected" as const })
              : p,
          ),
        ),
      }),
    });
    return customerPaymentView(next, this.deps.clock.now());
  }

  /** Park the payment for a human. The reason is internal, never customer text. */
  public async raiseException(
    viewer: AssistedOrderViewer,
    paymentId: string,
    reason: string,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const record = await this.load(paymentId);
    const note = nonBlank(reason, "reason");
    const next = await this.advance(record, "exception", {
      kind: "admin",
      label: viewer.actorLabel ?? "admin",
      adminId: viewer.memberId ?? (viewer.actorLabel ?? "admin"),
    }, {
      evidenceRef: null,
      internalNote: note,
      mutate: (base) => ({ ...base, exceptionReason: note }),
    });
    return customerPaymentView(next, this.deps.clock.now());
  }

  /**
   * Return money that really arrived. Requires a settled payment and the same
   * named verification grant that turning it real required.
   */
  public async refund(
    viewer: AssistedOrderViewer,
    paymentId: string,
    input: Readonly<{
      refundedAmountCents: number;
      reason: string;
      evidenceRef: string;
    }>,
  ): Promise<AssistedOrderPaymentView> {
    requireCapability(viewer, "assisted_orders:manage");
    const grant = await this.deps.verification.verifierFor(viewer);
    if (!grant) {
      throw new AssistedOrderPaymentAuthorizationError(
        "VERIFICATION_GRANT_REQUIRED",
        "Recording a refund requires an explicit verification grant.",
      );
    }
    const record = await this.load(paymentId);
    if (!record.settlement) {
      throw new AssistedOrderPaymentConflictError(
        "NOT_SETTLED",
        "Only a settled payment can be refunded.",
      );
    }
    if (record.refund) {
      return customerPaymentView(record, this.deps.clock.now());
    }
    const reason = nonBlank(input.reason, "reason");
    const evidenceRef = nonBlank(input.evidenceRef, "evidenceRef");
    if (
      !isPayableAmountCents(input.refundedAmountCents) ||
      input.refundedAmountCents > record.settlement.verifiedAmountCents
    ) {
      throw new AssistedOrderPaymentValidationError(
        "refundedAmountCents",
        "A refund must be positive integer cents, at most the settled amount.",
      );
    }

    const now = this.deps.clock.now();
    const next = await this.advance(record, "refunded", {
      kind: "admin",
      label: grant.label,
      adminId: grant.adminId,
    }, {
      evidenceRef,
      internalNote: reason,
      mutate: (base) => ({
        ...base,
        refund: Object.freeze({
          refundId: this.deps.ids.uuid(),
          refundedAmountCents: input.refundedAmountCents,
          currency: base.currency,
          refundedAt: now.toISOString(),
          refundedByLabel: grant.label,
          reason,
          evidenceRef,
        }),
      }),
    });
    await this.deps.audit.record({
      type: "assisted_order_payment_refunded",
      paymentId: next.paymentId,
      requestId: next.requestId,
      refundedAmountCents: input.refundedAmountCents,
      by: grant.label,
      at: now.toISOString(),
    });
    return customerPaymentView(next, now);
  }

  // -------------------------------------------------------------------------
  // Reads.
  // -------------------------------------------------------------------------

  /** The customer's own payment, resolved through request ownership. */
  public async forRequest(
    viewer: AssistedOrderViewer,
    publicReference: string,
  ): Promise<AssistedOrderPaymentView | null> {
    requireCapability(viewer, "assisted_orders:read_own");
    const binding = await this.deps.requests.byPublicReference(publicReference);
    if (!binding || !ownsRequest(viewer, binding)) {
      throw new AssistedOrderPaymentNotFoundError("The request was not found.");
    }
    const record = await this.deps.repository.byRequest(binding.requestId);
    return record
      ? customerPaymentView(record, this.deps.clock.now())
      : null;
  }

  /** The operator's read. Carries the full record; never returned to a customer. */
  public async adminRecord(
    viewer: AssistedOrderViewer,
    paymentId: string,
  ): Promise<AssistedOrderPaymentRecord> {
    requireCapability(viewer, "assisted_orders:manage");
    return this.load(paymentId);
  }

  // -------------------------------------------------------------------------
  // Internals.
  // -------------------------------------------------------------------------

  private async load(paymentId: string): Promise<AssistedOrderPaymentRecord> {
    const id = nonBlank(paymentId, "paymentId");
    const record = await this.deps.repository.byId(id);
    if (!record) {
      throw new AssistedOrderPaymentNotFoundError();
    }
    return record;
  }

  /** The shared settlement path for both the admin and the processor route. */
  private async settle(
    record: AssistedOrderPaymentRecord,
    actor: AssistedOrderPaymentActor,
    input: Readonly<{
      verifiedAmountCents: number;
      evidenceRef: string;
      verifiedByKind: "admin" | "processor";
      internalNote: string | null;
    }>,
  ): Promise<AssistedOrderPaymentView> {
    const now = this.deps.clock.now();
    if (!isPayableAmountCents(input.verifiedAmountCents)) {
      throw new AssistedOrderPaymentValidationError(
        "verifiedAmountCents",
        "A verified amount must be positive integer cents.",
      );
    }
    // A discrepancy is a human problem, not a rounding decision. The payment
    // parks in `exception` carrying both numbers and never reports `settled`.
    if (input.verifiedAmountCents !== record.amountDueCents) {
      const reason =
        `Verified ${input.verifiedAmountCents} cents against ` +
        `${record.amountDueCents} cents due.`;
      const parked = await this.advance(record, "exception", actor, {
        evidenceRef: input.evidenceRef,
        internalNote: reason,
        mutate: (base) => ({ ...base, exceptionReason: reason }),
      });
      await this.deps.audit.record({
        type: "assisted_order_payment_amount_mismatch",
        paymentId: parked.paymentId,
        requestId: parked.requestId,
        amountDueCents: parked.amountDueCents,
        verifiedAmountCents: input.verifiedAmountCents,
        at: now.toISOString(),
      });
      throw new AssistedOrderPaymentConflictError("AMOUNT_MISMATCH", reason);
    }

    const next = await this.advance(record, "paid", actor, {
      evidenceRef: input.evidenceRef,
      internalNote: input.internalNote,
      mutate: (base) => ({
        ...base,
        exceptionReason: null,
        settledAt: now.toISOString(),
        proofs: Object.freeze(
          base.proofs.map((p) =>
            p.reviewOutcome === "pending"
              ? Object.freeze({ ...p, reviewOutcome: "accepted" as const })
              : p,
          ),
        ),
        settlement: Object.freeze({
          settlementId: this.deps.ids.uuid(),
          verifiedAmountCents: input.verifiedAmountCents,
          currency: base.currency,
          verifiedAt: now.toISOString(),
          verifiedByLabel: actor.label,
          verifiedByKind: input.verifiedByKind,
          evidenceRef: input.evidenceRef,
          settlementUniqueKey: settlementUniqueKeyFor(base.paymentId),
        }),
      }),
    });

    await this.deps.audit.record({
      type: "assisted_order_payment_settled",
      paymentId: next.paymentId,
      requestId: next.requestId,
      quoteId: next.quoteId,
      amountDueCents: next.amountDueCents,
      verifiedAmountCents: input.verifiedAmountCents,
      verifiedByKind: input.verifiedByKind,
      verifiedByLabel: actor.label,
      evidenceRef: input.evidenceRef,
      at: now.toISOString(),
    });
    return customerPaymentView(next, now);
  }

  /**
   * The ONE place a payment changes state. Checks the transition table and the
   * actor authority table and refuses unless both allow it, then appends the
   * history event and writes with optimistic concurrency.
   */
  private async advance(
    record: AssistedOrderPaymentRecord,
    to: AssistedOrderPaymentState,
    actor: AssistedOrderPaymentActor,
    options: Readonly<{
      evidenceRef: string | null;
      internalNote?: string | null;
      mutate?: (
        base: AssistedOrderPaymentRecord,
      ) => AssistedOrderPaymentRecord;
    }>,
  ): Promise<AssistedOrderPaymentRecord> {
    if (!isLegalPaymentTransition(record.state, to)) {
      throw new AssistedOrderPaymentConflictError(
        "ILLEGAL_TRANSITION",
        `A payment cannot move from ${record.state} to ${to}.`,
      );
    }
    if (!mayActorReachPaymentState(actor.kind, to)) {
      throw new AssistedOrderPaymentAuthorizationError(
        "ACTOR_NOT_AUTHORIZED",
        `A ${actor.kind} cannot move a payment to ${to}.`,
      );
    }
    // A processor transition without the provider's own event id is not a
    // processor fact; it is an assertion wearing a processor's name.
    if (actor.kind === "processor" && !actor.providerEventId.trim()) {
      throw new AssistedOrderPaymentAuthorizationError(
        "EVIDENCE_REQUIRED",
        "A processor transition requires the provider event id.",
      );
    }

    const now = this.deps.clock.now();
    const event: AssistedOrderPaymentEventRecord = Object.freeze({
      eventId: this.deps.ids.uuid(),
      from: record.state,
      to,
      actorKind: actor.kind,
      actorLabel: actor.label,
      at: now.toISOString(),
      evidenceRef: options.evidenceRef,
      internalNote: options.internalNote ?? null,
    });

    const base: AssistedOrderPaymentRecord = Object.freeze({
      ...record,
      state: to,
      revision: record.revision + 1,
      updatedAt: now.toISOString(),
      history: Object.freeze([...record.history, event]),
    });
    const next = Object.freeze(options.mutate ? options.mutate(base) : base);
    await this.deps.repository.update(next, record.revision);
    return next;
  }
}
