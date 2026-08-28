// xenios research: refund and replacement claims.
//
// Founder policy: there are NO ordinary returns. A member cannot send a product back
// because they changed their mind or never opened it. Only a defect, a loss, or a
// handling failure opens a claim, and the accepted reasons are enumerated below.
//
// Two rules shape the file.
//
// First, nothing restocks. A unit that left custody has a broken chain of custody and
// never re-enters allocatable inventory, so this service holds no inventory dependency
// at all and every resolution reports the returned unit as destroyed. There is no code
// path here that can raise a lot quantity.
//
// Second, money moves only on a provider result. `resolveWithRefund` calls the provider
// and moves the order to `refunded` through `transitionOrder` carrying the reference the
// provider returned. A disabled provider leaves the claim approved and unpaid, which is
// an honest state, rather than resolved, which would be a lie about money.

import crypto from "crypto";

import type { ClaimDto, ClaimReason, CommerceDenialCode, CreateClaimRequest } from "@shared/research/commerce-api";
import {
  TERMINAL_ORDER_STATES,
  canTransitionOrder,
  transitionOrder,
  type OrderState,
} from "@shared/research/commerce";
import type { ProviderFailureCode } from "@shared/research/capability";
import type { LotDisposition } from "../inventory/lots";
import type { PaymentProvider } from "../providers/payment";

export type { ClaimReason };

/**
 * The complete set of reasons that open a claim.
 *
 * A change-of-mind or unopened-package reason is absent on purpose. Product integrity
 * and chain of custody are the reason, and adding an entry here is a founder decision,
 * not an implementation detail.
 */
export const ACCEPTED_CLAIM_REASONS: readonly ClaimReason[] = [
  "damaged",
  "lost",
  "incorrect",
  "missing",
  "temperature_concern",
] as const;

export type ClaimState = ClaimDto["state"];
export type ClaimResolution = ClaimDto["resolution"];

/** The admin decisions that move a claim without resolving it. */
export type ClaimReviewDecision = "under_review" | "information_requested" | "approved" | "declined";

/**
 * The stored claim. Wider than the wire DTO on purpose: memberId, lotId, evidenceRefs,
 * reviewedBy, and notes are operator data, so a route that spreads this object would
 * leak. `toClaimDto` is the only projection that crosses the boundary.
 */
export interface ClaimRecord {
  claimId: string;
  orderId: string;
  memberId: string;
  sku: string;
  /** The lot the unit came from, when it is known. Never used to restock. */
  lotId: string | null;
  reason: ClaimReason;
  state: ClaimState;
  resolution: ClaimResolution;
  /** Opaque references. No image bytes and no URLs to private media cross this boundary. */
  evidenceRefs: string[];
  submittedAt: string;
  reviewedBy: string | null;
  notes: string;
}

export interface ClaimRepository {
  get(claimId: string): Promise<ClaimRecord | null>;
  save(claim: ClaimRecord): Promise<void>;
  listByMember(memberId: string): Promise<ClaimRecord[]>;
  listByOrder(orderId: string): Promise<ClaimRecord[]>;

  /**
   * Refund idempotency, owned by the repository rather than by this module.
   *
   * It lived in a per-process Map, which is not idempotency at all once the service
   * restarts or runs on a second instance: the map is empty, the key looks new, and a
   * repeated request issues a SECOND refund. Real money moves twice.
   *
   * Putting it on the repository makes durability the caller's responsibility and
   * visible in the interface, so an in-memory implementation is an explicit test-only
   * choice rather than an invisible production defect.
   */
  hasRefundKey(scope: string): Promise<boolean>;
  recordRefundKey(scope: string, refundReference: string): Promise<void>;
  listOpen(): Promise<ClaimRecord[]>;
}

/**
 * The slice of an order this service needs.
 *
 * `capturedAmountCents` is what the provider actually took, not the order total, because
 * a refund is bounded by money that really moved.
 *
 * `refundedCents` is carried and checked against the capture, but note that partial
 * refunds are NOT reachable today: the first refund moves the order to a terminal
 * refunded state, so a second is denied by the state machine before the arithmetic is
 * consulted. The bound is therefore a second line of defence rather than the active
 * one. If partial refunds are ever wanted, the terminal transition is what has to
 * change, not this field.
 */
export interface ClaimOrderView {
  orderId: string;
  memberId: string;
  state: OrderState;
  capturedAmountCents: number;
  /** The provider reference from the capture. Null when nothing was captured. */
  paymentReference: string | null;
  refundedCents: number;
  lines: Array<{ sku: string; lotId: string | null }>;
  /** Set by the last applied money transition, so a replay is absorbed. */
  lastAppliedIdempotencyKey?: string;
}

export interface ClaimOrderRepository {
  get(orderId: string): Promise<ClaimOrderView | null>;
  save(order: ClaimOrderView): Promise<void>;
}

export interface RefundServiceDeps {
  claims: ClaimRepository;
  orders: ClaimOrderRepository;
  payment: PaymentProvider;
  commerceEnabled: boolean;
  /**
   * Explicit proof that the caller has supplied the durable refund
   * intent/reconciliation authority required around the provider call.
   *
   * Production deliberately leaves this absent until that adapter exists. The
   * in-memory service tests opt in so they can exercise the pure money rules;
   * setting general commerce enabled must never silently enable refunds.
   */
  durableRefundExecutionAvailable?: boolean;
  /**
   * Explicit proof that replacement fulfillment and the terminal order/claim
   * transition are owned by a durable atomic adapter. General commerce being
   * enabled does not establish either fact.
   */
  durableReplacementExecutionAvailable?: boolean;
  /** Injected only when a test needs deterministic claim ids. */
  newClaimId?: (sequence: number) => string;
}

export type ClaimDenial = { ok: false; codes: CommerceDenialCode[] };
export type ClaimOutcome = { ok: true; claim: ClaimDto } | ClaimDenial;

/**
 * The result of resolving a claim.
 *
 * `restockedUnits` is typed as the literal 0 and `returnedLotDisposition` as the literal
 * "destroyed", so a future edit that tries to restock fails to compile rather than
 * quietly putting a returned unit back in the allocatable pool.
 */
export interface ResolutionSuccess {
  ok: true;
  claim: ClaimDto;
  restockedUnits: 0;
  returnedLotDisposition: Extract<LotDisposition, "destroyed">;
}

export type ResolutionOutcome = ResolutionSuccess | ClaimDenial;

export interface RefundService {
  submitClaim(memberId: string, req: CreateClaimRequest, asOf: Date): Promise<ClaimOutcome>;
  reviewClaim(
    claimId: string,
    adminId: string,
    decision: ClaimReviewDecision,
    asOf: Date,
    note?: string,
  ): Promise<ClaimOutcome>;
  resolveWithReplacement(claimId: string, adminId: string, asOf: Date): Promise<ResolutionOutcome>;
  resolveWithRefund(
    claimId: string,
    adminId: string,
    amountCents: number,
    idempotencyKey: string,
    asOf: Date,
  ): Promise<ResolutionOutcome>;
  listForMember(memberId: string): Promise<ClaimDto[]>;
  getForMember(memberId: string, claimId: string): Promise<ClaimDto | null>;
  listOpenForAdmin(): Promise<ClaimRecord[]>;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export function toClaimDto(record: ClaimRecord): ClaimDto {
  return {
    claimId: record.claimId,
    orderId: record.orderId,
    sku: record.sku,
    reason: record.reason,
    state: record.state,
    resolution: record.resolution,
    submittedAt: record.submittedAt,
  };
}

// ---------------------------------------------------------------------------
// Accumulator
// ---------------------------------------------------------------------------

/** Preserves gate order and drops repeats, so the same code is never reported twice. */
class Denials {
  private readonly seen = new Set<CommerceDenialCode>();
  private readonly ordered: CommerceDenialCode[] = [];

  add(code: CommerceDenialCode): void {
    if (this.seen.has(code)) return;
    this.seen.add(code);
    this.ordered.push(code);
  }

  get list(): CommerceDenialCode[] {
    return this.ordered.slice();
  }

  get empty(): boolean {
    return this.ordered.length === 0;
  }
}

function deny(...codes: CommerceDenialCode[]): ClaimDenial {
  const denials = new Denials();
  codes.forEach((code) => denials.add(code));
  return { ok: false, codes: denials.list };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Order states in which the member plausibly has, or was owed, the goods. */
const CLAIMABLE_ORDER_STATES: readonly OrderState[] = [
  "payment_captured",
  "processing",
  "partially_fulfilled",
  "fulfilled",
  "delivered",
  "exception",
] as const;

/** A claim no longer waiting on anyone. */
const CLOSED_CLAIM_STATES: readonly ClaimState[] = ["resolved", "declined"] as const;

/** Review moves that are legal from each state. Anything absent is denied. */
const CLAIM_REVIEW_TRANSITIONS: ReadonlyArray<{ from: ClaimState; to: ClaimReviewDecision }> = [
  { from: "submitted", to: "under_review" },
  { from: "submitted", to: "information_requested" },
  { from: "submitted", to: "approved" },
  { from: "submitted", to: "declined" },
  { from: "under_review", to: "information_requested" },
  { from: "under_review", to: "approved" },
  { from: "under_review", to: "declined" },
  { from: "information_requested", to: "under_review" },
  { from: "information_requested", to: "approved" },
  { from: "information_requested", to: "declined" },
];

/**
 * An evidence reference is an opaque handle to media stored elsewhere. A URL, a data
 * URI, or a filesystem path would either carry bytes or hand out a link to private
 * media, so both are refused at the boundary rather than sanitized later.
 */
function evidenceRefIsOpaque(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed === "") return false;
  if (trimmed.length > 200) return false;
  if (trimmed.indexOf("://") !== -1) return false;
  if (/^(https?|data|file|ftp|blob):/i.test(trimmed)) return false;
  if (/[\s<>"']/.test(trimmed)) return false;
  return true;
}

function reasonIsAccepted(reason: string): boolean {
  return ACCEPTED_CLAIM_REASONS.indexOf(reason as ClaimReason) !== -1;
}

/**
 * A disabled or misconfigured provider is a capability state, not a transient
 * payment failure. Both are reported as `payment_disabled` so an operator is not
 * invited to retry a refund that cannot succeed until the capability is fixed.
 */
function refundDenialCode(code: ProviderFailureCode): CommerceDenialCode {
  return code === "DISABLED" || code === "MISCONFIGURED" ? "payment_disabled" : "payment_failed";
}

/**
 * Provider idempotency is scoped to the exact refund operation, not to an
 * operator-supplied token that may be reused on another order. The raw key is
 * never sent to the provider. JSON tuple framing prevents delimiter aliases;
 * the fixed digest stays well within provider header limits.
 */
export function refundProviderIdempotencyKey(input: Readonly<{
  orderId: string;
  claimId: string;
  amountCents: number;
  callerKey: string;
}>): string {
  const scope = JSON.stringify([
    "xenios-refund-provider-idempotency-v1",
    input.orderId,
    input.claimId,
    input.amountCents,
    "usd",
    input.callerKey,
  ]);
  return `xr-refund-v1-${crypto.createHash("sha256").update(scope, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createRefundService(deps: RefundServiceDeps): RefundService {
  // A process-local counter restarts and can overwrite another instance's
  // durable UPSERT row. UUIDs make the default safe across restarts/instances;
  // deterministic sequences remain an explicit test-only injection.
  const mintId = deps.newClaimId ?? ((_sequence: number): string => crypto.randomUUID());
  let counter = 0;

  async function submitClaim(memberId: string, req: CreateClaimRequest, asOf: Date): Promise<ClaimOutcome> {
    const denials = new Denials();

    if (!deps.commerceEnabled) denials.add("commerce_disabled");

    // Only the five enumerated reasons open a claim. Everything else, including a
    // change of mind or an unopened package, is refused: there are no ordinary returns.
    if (!reasonIsAccepted(req.reason)) denials.add("forbidden");

    if (!req.evidenceRefs.every(evidenceRefIsOpaque)) denials.add("forbidden");

    const order = await deps.orders.get(req.orderId);
    if (!order) {
      denials.add("order_not_found");
      return { ok: false, codes: denials.list };
    }

    // A member may claim only against their own order, and the denial does not reveal
    // whether the order exists for someone else.
    if (order.memberId !== memberId) {
      return deny("order_not_found");
    }

    if (CLAIMABLE_ORDER_STATES.indexOf(order.state) === -1) denials.add("order_state_invalid");

    const line = order.lines.find((l) => l.sku === req.sku);
    if (!line) denials.add("product_not_found");

    if (!denials.empty) return { ok: false, codes: denials.list };

    // Idempotency: a member who taps submit twice gets the claim they already have.
    const open = (await deps.claims.listByOrder(req.orderId)).find(
        (c) =>
          c.sku === req.sku &&
          c.reason === req.reason &&
          CLOSED_CLAIM_STATES.indexOf(c.state) === -1,
      );
    if (open) return { ok: true, claim: toClaimDto(open) };

    const claimId = mintId(++counter);
    // The durable research_claims.id column is UUID, not text. Refuse a bad
    // injected generator before persistence instead of relying on a database
    // cast error after a production-reachable claim submission.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimId)) {
      return deny("capability_disabled");
    }
    const record: ClaimRecord = {
      claimId,
      orderId: req.orderId,
      memberId,
      sku: req.sku,
      lotId: line ? line.lotId : null,
      reason: req.reason,
      state: "submitted",
      resolution: null,
      evidenceRefs: req.evidenceRefs.slice(),
      submittedAt: asOf.toISOString(),
      reviewedBy: null,
      notes: req.detail,
    };
    await deps.claims.save(record);
    return { ok: true, claim: toClaimDto(record) };
  }

  async function reviewClaim(
    claimId: string,
    adminId: string,
    decision: ClaimReviewDecision,
    asOf: Date,
    note?: string,
  ): Promise<ClaimOutcome> {
    void asOf;
    const claim = await deps.claims.get(claimId);
    if (!claim) return deny("order_not_found");

    const legal = CLAIM_REVIEW_TRANSITIONS.some((t) => t.from === claim.state && t.to === decision);
    if (!legal) return deny("order_state_invalid");

    claim.state = decision;
    claim.reviewedBy = adminId;
    if (note !== undefined) claim.notes = note;
    await deps.claims.save(claim);
    return { ok: true, claim: toClaimDto(claim) };
  }

  async function resolveWithReplacement(claimId: string, adminId: string, asOf: Date): Promise<ResolutionOutcome> {
    void asOf;
    const claim = await deps.claims.get(claimId);
    if (!claim) return deny("order_not_found");
    // A replacement commits a physical shipment and moves the order to a terminal
    // state, so it is gated on the capability exactly as a refund is.
    if (!deps.commerceEnabled) return deny("commerce_disabled");
    if (!deps.durableReplacementExecutionAvailable) return deny("capability_disabled");
    if (claim.state !== "approved") return deny("order_state_invalid");

    const order = await deps.orders.get(claim.orderId);
    if (!order) return deny("order_not_found");

    const moved = transitionOrder({ from: order.state, to: "replaced", actor: "admin" });
    if (!moved.ok) return deny("order_state_invalid");
    order.state = moved.state;
    await deps.orders.save(order);

    claim.state = "resolved";
    claim.resolution = "replacement";
    claim.reviewedBy = adminId;
    await deps.claims.save(claim);

    // The replaced unit is destroyed, not restocked. Its chain of custody is broken and
    // no inventory quantity is touched anywhere in this function.
    return { ok: true, claim: toClaimDto(claim), restockedUnits: 0, returnedLotDisposition: "destroyed" };
  }

  async function resolveWithRefund(
    claimId: string,
    adminId: string,
    amountCents: number,
    idempotencyKey: string,
    asOf: Date,
  ): Promise<ResolutionOutcome> {
    void asOf;
    const claim = await deps.claims.get(claimId);
    if (!claim) return deny("order_not_found");

    // Capability authority leads every replay path. A stale/pre-recorded key
    // must never turn a production-disabled or commerce-disabled operation
    // into a reported success.
    const capabilityDenials = new Denials();
    if (!deps.commerceEnabled) capabilityDenials.add("commerce_disabled");
    if (!deps.durableRefundExecutionAvailable) capabilityDenials.add("payment_disabled");
    if (!capabilityDenials.empty) return { ok: false, codes: capabilityDenials.list };

    if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      return deny("payment_failed");
    }
    const providerIdempotencyKey = refundProviderIdempotencyKey({
      orderId: claim.orderId,
      claimId,
      amountCents,
      callerKey: idempotencyKey,
    });
    const replayScope = providerIdempotencyKey;
    const order = await deps.orders.get(claim.orderId);
    if (!order) return deny("order_not_found");

    // A key alone is not completion evidence: a crash can record it before the
    // order and claim saves. Absorb a replay only when every durable projection
    // proves this exact scoped operation already committed.
    if (await deps.claims.hasRefundKey(replayScope)) {
      const completed =
        claim.state === "resolved" &&
        (claim.resolution === "refund" || claim.resolution === "partial_refund") &&
        order.state === "refunded" &&
        order.lastAppliedIdempotencyKey === replayScope &&
        order.refundedCents === amountCents;
      if (!completed) return deny("payment_failed");
      return {
        ok: true,
        claim: toClaimDto(claim),
        restockedUnits: 0,
        returnedLotDisposition: "destroyed",
      };
    }

    if (claim.state !== "approved") return deny("order_state_invalid");

    const denials = new Denials();

    // Every ledger value must be a bounded integer before arithmetic or a
    // provider call. Unsafe/fractional/negative stored facts are unavailable
    // evidence, not numbers to round or subtract through.
    const moneyFactsValid =
      Number.isSafeInteger(order.capturedAmountCents) &&
      order.capturedAmountCents > 0 &&
      Number.isSafeInteger(order.refundedCents) &&
      order.refundedCents >= 0 &&
      order.refundedCents <= order.capturedAmountCents;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !moneyFactsValid) {
      denials.add("payment_failed");
    }

    const refundable = moneyFactsValid
      ? order.capturedAmountCents - order.refundedCents
      : 0;
    if (amountCents > refundable) denials.add("payment_failed");

    // One claim resolution makes the order terminal. Supporting another refund
    // operation would require a durable per-operation cumulative ledger; the
    // current replay evidence stores only this operation's scoped key. Refuse a
    // pre-existing refunded balance before the provider call so a successful
    // first execution can always prove its exact replay with
    // `refundedCents === amountCents`.
    if (moneyFactsValid && order.refundedCents !== 0) denials.add("payment_failed");

    if (
      typeof order.paymentReference !== "string" ||
      order.paymentReference.trim() === ""
    ) {
      denials.add("payment_failed");
    }

    // The order must be able to accept `refunded` BEFORE money moves. Refunding an
    // order that cannot record the refund would leave the provider and the ledger
    // disagreeing, so legality is checked first and the provider is never called.
    if (TERMINAL_ORDER_STATES.has(order.state) || !canTransitionOrder(order.state, "refunded", "admin")) {
      denials.add("order_state_invalid");
    }

    if (!denials.empty) return { ok: false, codes: denials.list };

    const paymentReference = order.paymentReference as string;
    const result = await deps.payment.refund(
      paymentReference,
      amountCents,
      providerIdempotencyKey,
    );
    if (!result.ok) {
      // A disabled provider is not a resolution. The claim stays approved and unpaid,
      // the order is untouched, and the key is not consumed so a retry after the
      // capability is enabled still works.
      return deny(refundDenialCode(result.code));
    }

    // The order reaches `refunded` only on the reference the provider returned. An
    // empty one is refused rather than substituted with anything of our own.
    const refundReference = result.value.providerReference;
    const reported = result.value.refundedAmountCents;
    if (
      typeof refundReference !== "string" ||
      refundReference.trim() === "" ||
      result.value.paymentReference !== paymentReference ||
      !Number.isSafeInteger(reported) ||
      reported !== amountCents ||
      result.value.currency !== "usd" ||
      result.value.status !== "refunded"
    ) {
      return deny("payment_failed");
    }

    const moved = transitionOrder({
      from: order.state,
      to: "refunded",
      actor: "admin",
      providerConfirmation: refundReference,
      idempotencyKey: providerIdempotencyKey,
      lastAppliedIdempotencyKey: order.lastAppliedIdempotencyKey,
    });
    if (!moved.ok) return deny("order_state_invalid");

    await deps.claims.recordRefundKey(replayScope, refundReference);
    order.state = moved.state;
    order.refundedCents = order.refundedCents + reported;
    order.lastAppliedIdempotencyKey = providerIdempotencyKey;
    await deps.orders.save(order);

    claim.state = "resolved";
    claim.resolution = order.refundedCents >= order.capturedAmountCents ? "refund" : "partial_refund";
    claim.reviewedBy = adminId;
    await deps.claims.save(claim);

    // A refunded unit is destroyed for the same reason a replaced one is.
    return { ok: true, claim: toClaimDto(claim), restockedUnits: 0, returnedLotDisposition: "destroyed" };
  }

  async function listForMember(memberId: string): Promise<ClaimDto[]> {
    return (await deps.claims.listByMember(memberId)).map(toClaimDto);
  }

  async function getForMember(memberId: string, claimId: string): Promise<ClaimDto | null> {
    const claim = await deps.claims.get(claimId);
    // A cross-member read is indistinguishable from a missing claim.
    if (!claim || claim.memberId !== memberId) return null;
    return toClaimDto(claim);
  }

  async function listOpenForAdmin(): Promise<ClaimRecord[]> {
    return deps.claims.listOpen();
  }

  return {
    submitClaim,
    reviewClaim,
    resolveWithReplacement,
    resolveWithRefund,
    listForMember,
    getForMember,
    listOpenForAdmin,
  };
}

// ---------------------------------------------------------------------------
// In-memory repositories
// ---------------------------------------------------------------------------

export function createInMemoryClaimRepository(seed: readonly ClaimRecord[] = []): ClaimRepository {
  const byId = new Map<string, ClaimRecord>();
  const order: string[] = [];
  /**
   * Test-only durability. A real implementation persists this alongside the claims,
   * because losing it means a repeated refund key issues a second refund.
   */
  const refundKeys = new Map<string, string>();

  function put(claim: ClaimRecord): void {
    if (!byId.has(claim.claimId)) order.push(claim.claimId);
    byId.set(claim.claimId, claim);
  }

  seed.forEach(put);

  function all(): ClaimRecord[] {
    const out: ClaimRecord[] = [];
    order.forEach((id) => {
      const found = byId.get(id);
      if (found) out.push(found);
    });
    return out;
  }

  return {
    async get(claimId) {
      return byId.get(claimId) ?? null;
    },
    async save(claim) {
      put(claim);
    },
    async listByMember(memberId) {
      return all().filter((c) => c.memberId === memberId);
    },
    async listByOrder(orderId) {
      return all().filter((c) => c.orderId === orderId);
    },
    async listOpen() {
      return all().filter((c) => CLOSED_CLAIM_STATES.indexOf(c.state) === -1);
    },
    async hasRefundKey(scope) {
      return refundKeys.has(scope);
    },
    async recordRefundKey(scope, refundReference) {
      refundKeys.set(scope, refundReference);
    },
  };
}

export function createInMemoryClaimOrderRepository(
  seed: readonly ClaimOrderView[] = [],
): ClaimOrderRepository {
  const byId = new Map<string, ClaimOrderView>();
  seed.forEach((order) => byId.set(order.orderId, order));
  return {
    async get(orderId) {
      return byId.get(orderId) ?? null;
    },
    async save(order) {
      byId.set(order.orderId, order);
    },
  };
}
