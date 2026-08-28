// xenios research: the order service. Lifecycle, delayed capture, and the
// large-order review queue.
//
// Three rules shape this file.
//
// First, an order never reaches a paid state without a provider reference. Every
// move goes through `transitionOrder` and every paid move carries a
// `providerConfirmation` taken from a real `ProviderResult`. No state is ever
// assigned directly, and no reference is ever synthesized.
//
// Second, delayed capture is the founder flow for a large order: authorize, hold
// for review, capture only after Samuel approves. `capture` therefore refuses on
// anything that is not an approved order backed by a real authorization.
//
// Third, ownership is checked on read. `getForMember` returns null for another
// member's order rather than the order, so a cross-member read is impossible
// rather than merely unlikely.

import { createHash } from "node:crypto";
import type {
  CommerceDenialCode,
  OrderDetailDto,
  OrderSummaryDto,
} from "@shared/research/commerce-api";
import {
  canTransitionOrder,
  transitionOrder,
  type Actor,
  type OrderState,
} from "@shared/research/commerce";
import type { ProviderFailureCode } from "@shared/research/capability";
import type { PaymentProvider } from "../providers/payment";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface OrderLineRecord {
  sku: string;
  displayName: string;
  quantity: number;
  /** Integer minor units. Computed server-side, never read from a client. */
  lineTotalCents: number;
}

export interface OrderTotals {
  subtotalCents: number;
  shippingCents: number;
  storeCreditAppliedCents: number;
  totalCents: number;
}

export interface OrderShipmentRecord {
  owner: "mitch" | "xenios";
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
}

/**
 * The stored order. Wider than the wire DTO on purpose: the provider reference,
 * the idempotency key, and the review triggers are operator data that must never
 * be serialized to a member by a route that spreads this object.
 */
export interface OrderRecord {
  orderId: string;
  memberId: string;
  state: OrderState;
  lines: OrderLineRecord[];
  totals: OrderTotals;
  /** The authorization reference returned by the provider. Never fabricated. */
  providerReference: string | null;
  /**
   * The amount the provider actually authorized, as the provider reported it. A
   * capture may never exceed this, so a total that changes after the hold is
   * placed cannot take more than the member agreed to.
   */
  authorizedAmountCents?: number;
  /** Exact provider-reported currency bound at authorization time. */
  authorizedCurrency?: "usd";
  /**
   * The customer-supplied key that created this order. It is immutable for the
   * lifetime of the order and remains the checkout replay identity even after
   * later webhook/admin transitions replace `lastIdempotencyKey`.
   */
  checkoutIdempotencyKey: string | null;
  lastIdempotencyKey: string | null;
  reviewTriggers: string[];
  createdAt: string;
  updatedAt: string;
  /** Present once money has actually been taken, bounded by what was authorized. */
  capturedAmountCents?: number;
  /**
   * Cents refunded so far (P1-A, 2026-08-27). The refund lane accumulates
   * this in research_orders.refunded_cents (claims-store writes it,
   * bounded ≤ captured by the DB constraint); this field closes the loop so
   * the wire can carry the fact instead of downstream code guessing from
   * lifecycle state. Absent on legacy in-memory records that predate it.
   */
  refundedCents?: number;
  shipments?: OrderShipmentRecord[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  cancellationReason?: string | null;
  /**
   * True when the order was cancelled but the provider refused to release the
   * authorization. The hold is still on the member's card, so this is surfaced
   * for an operator rather than swallowed.
   */
  authorizationReleaseFailed?: boolean;
}

export interface OrderRepository {
  get(orderId: string): Promise<OrderRecord | null>;
  save(order: OrderRecord): Promise<void>;
  listByMember(memberId: string): Promise<OrderRecord[]>;
  /**
   * Exact immutable checkout replay authority. Implementations must scope by
   * member + checkoutIdempotencyKey and reject duplicate matches rather than
   * choosing an arbitrary row.
   */
  findByCheckoutIdempotencyKey(memberId: string, key: string): Promise<OrderRecord | null>;
  findByIdempotencyKey(memberId: string, key: string): Promise<OrderRecord | null>;
  /** Admin-only cross-member listing. The review queue has no single member. */
  listAll(): Promise<OrderRecord[]>;
}

export interface OrderServiceDeps {
  repository: OrderRepository;
  payment: PaymentProvider;
  commerceEnabled: boolean;
  /** False in production until payment side effects and order saves share durable reconciliation. */
  durablePaymentExecutionAvailable?: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface OrderDenial {
  ok: false;
  denials: CommerceDenialCode[];
  message: string;
}

export type OrderResult = { ok: true; order: OrderRecord; idempotent: boolean } | OrderDenial;

export interface LargeOrderQueueEntry {
  orderId: string;
  totalCents: number;
  triggers: string[];
  heldSince: string;
}

export interface OrderService {
  authorize(orderId: string, actor: Actor, asOf: Date, idempotencyKey?: string): Promise<OrderResult>;
  approve(orderId: string, adminId: string, asOf: Date): Promise<OrderResult>;
  capture(orderId: string, actor: Actor, asOf: Date, idempotencyKey?: string): Promise<OrderResult>;
  cancel(orderId: string, actor: Actor, reason: string, asOf: Date): Promise<OrderResult>;
  beginProcessing(orderId: string, actor: Actor, asOf: Date): Promise<OrderResult>;
  markFulfilled(orderId: string, actor: Actor, asOf: Date, evidence?: string): Promise<OrderResult>;
  markDelivered(orderId: string, actor: Actor, asOf: Date, evidence?: string): Promise<OrderResult>;
  listForMember(memberId: string): Promise<OrderSummaryDto[]>;
  getForMember(memberId: string, orderId: string): Promise<OrderDetailDto | null>;
  adminLargeOrderQueue(): Promise<LargeOrderQueueEntry[]>;
}

// ---------------------------------------------------------------------------
// Denial accumulation
// ---------------------------------------------------------------------------

/** Preserves gate order and drops repeats, so the same code is never reported twice. */
class Denials {
  private readonly ordered: CommerceDenialCode[] = [];

  add(code: CommerceDenialCode): void {
    if (this.ordered.indexOf(code) !== -1) return;
    this.ordered.push(code);
  }

  addAll(codes: readonly CommerceDenialCode[]): void {
    codes.forEach((code) => this.add(code));
  }

  get list(): CommerceDenialCode[] {
    return this.ordered.slice();
  }

  get empty(): boolean {
    return this.ordered.length === 0;
  }
}

/**
 * A disabled provider is a capability refusal, not a transient payment failure.
 * Reporting it as `payment_failed` would invite a retry that can never succeed.
 */
function paymentDenials(code: ProviderFailureCode): CommerceDenialCode[] {
  if (code === "DISABLED" || code === "MISCONFIGURED") {
    return ["capability_disabled", "payment_disabled"];
  }
  return ["payment_failed"];
}

function denied(denials: Denials, message: string): OrderDenial {
  return { ok: false, denials: denials.list, message };
}

function deny(codes: CommerceDenialCode[], message: string): OrderDenial {
  const acc = new Denials();
  acc.addAll(codes);
  return denied(acc, message);
}

/**
 * Provider keys live in an account-wide namespace, while the caller-facing key
 * is intentionally only member-scoped. Hash the exact authorization intent so
 * the same caller key on another member/order cannot poison the provider replay
 * cache or disclose member/order identifiers in provider metadata.
 */
export function authorizationProviderIdempotencyKey(input: Readonly<{
  memberId: string;
  orderId: string;
  amountCents: number;
  callerKey: string;
}>): string {
  const scope = JSON.stringify([
    "xenios-order-authorization-v1",
    input.memberId,
    input.orderId,
    input.amountCents,
    "usd",
    input.callerKey,
  ]);
  return `xr-order-auth-v1-${createHash("sha256").update(scope, "utf8").digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function toSummary(order: OrderRecord): OrderSummaryDto {
  const shipments = order.shipments ?? [];
  return {
    orderId: order.orderId,
    recordKind: "order",
    state: order.state,
    placedAt: order.createdAt,
    totalCents: order.totals.totalCents,
    // P1-A: monetary FACTS ride the wire. Amounts are what the record holds;
    // null means the fact is unavailable, which downstream must render as
    // unknown rather than guess. Wholesale/margin data is not involved —
    // these are the member's own charge amounts.
    payment: {
      amountDueCents: order.totals.totalCents,
      amountCapturedCents: order.capturedAmountCents ?? null,
      amountRefundedCents: order.refundedCents ?? null,
      currency: "USD",
    },
    // The commerce lane's shipments array IS its durable shipment source.
    shipmentsSource: "connected",
    shipments: shipments.map((s) => ({
      owner: s.owner,
      status: s.status,
      trackingNumber: s.trackingNumber,
      carrier: s.carrier,
    })),
  };
}

function toDetail(order: OrderRecord): OrderDetailDto {
  return {
    ...toSummary(order),
    lines: order.lines.map((line) => ({
      sku: line.sku,
      displayName: line.displayName,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    })),
    shippingCents: order.totals.shippingCents,
    storeCreditAppliedCents: order.totals.storeCreditAppliedCents,
    reviewReason: order.reviewTriggers.length > 0 ? order.reviewTriggers.join(", ") : null,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createOrderService(deps: OrderServiceDeps): OrderService {
  /**
   * Writes a new revision rather than mutating the caller's object, so a denial
   * later in the same call cannot leave a half-applied record behind.
   */
  async function persist(order: OrderRecord, changes: Partial<OrderRecord>, asOf: Date): Promise<OrderRecord> {
    const next: OrderRecord = { ...order, ...changes, updatedAt: asOf.toISOString() };
    await deps.repository.save(next);
    return next;
  }

  /**
   * Absorbs a replay. A key already applied to this order is a no-op, and a key
   * already bound to a different order is refused rather than reused, because a
   * reused key on a new payload is how a second charge happens.
   *
   * `alreadyApplied` is the operation's own effect marker. A key that matches but
   * whose effect is absent means the key was reused across two different
   * operations, which is a conflict rather than a replay: absorbing it would
   * report a capture that never took money as a success.
   */
  async function replayCheck(
    order: OrderRecord,
    key: string,
    alreadyApplied: (candidate: OrderRecord) => boolean,
  ): Promise<{ kind: "fresh" } | { kind: "replay"; order: OrderRecord } | { kind: "conflict" }> {
    if (order.lastIdempotencyKey === key) {
      return alreadyApplied(order) ? { kind: "replay", order } : { kind: "conflict" };
    }
    const prior = await deps.repository.findByIdempotencyKey(order.memberId, key);
    if (!prior) return { kind: "fresh" };
    if (prior.orderId !== order.orderId) return { kind: "conflict" };
    return alreadyApplied(prior) ? { kind: "replay", order: prior } : { kind: "conflict" };
  }

  /** An authorization has run when the provider reference it returned is on record. */
  function isAuthorized(candidate: OrderRecord): boolean {
    return candidate.providerReference !== null;
  }

  /** A capture has run when the amount the provider took is on record. */
  function isCaptured(candidate: OrderRecord): boolean {
    return candidate.capturedAmountCents !== undefined;
  }

  async function move(
    order: OrderRecord,
    to: OrderState,
    actor: Actor,
    asOf: Date,
    options: { providerConfirmation?: string; changes?: Partial<OrderRecord> } = {},
  ): Promise<OrderResult> {
    const result = transitionOrder({
      from: order.state,
      to,
      actor,
      providerConfirmation: options.providerConfirmation,
    });
    if (!result.ok) {
      return deny(["order_state_invalid"], result.message);
    }
    const saved = await persist(order, { ...options.changes, state: result.state }, asOf);
    return { ok: true, order: saved, idempotent: false };
  }

  async function authorize(
    orderId: string,
    actor: Actor,
    asOf: Date,
    idempotencyKey?: string,
  ): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);

    if (!deps.durablePaymentExecutionAvailable) {
      return deny(["payment_disabled"], "Durable payment execution is not available.");
    }

    const key = idempotencyKey ?? `authorize:${orderId}`;
    const replay = await replayCheck(order, key, isAuthorized);
    if (replay.kind === "replay") return { ok: true, order: replay.order, idempotent: true };
    if (replay.kind === "conflict") {
      return deny(["order_state_invalid"], "Idempotency key is already bound to another action.");
    }

    const denials = new Denials();
    if (!deps.commerceEnabled) denials.add("commerce_disabled");
    // The legality of the move is checked before any money is touched, so a
    // doomed order never leaves an authorization hold behind.
    if (!canTransitionOrder(order.state, "payment_authorized", actor)) {
      denials.add("order_state_invalid");
    }
    // Money is integer minor units. A fractional total is refused before it can be
    // handed to a provider that would round it into something plausible.
    if (!Number.isSafeInteger(order.totals.totalCents) || order.totals.totalCents <= 0) {
      denials.add("quantity_invalid");
    }
    if (!denials.empty) return denied(denials, `Order ${orderId} cannot be authorized.`);

    const auth = await deps.payment.createAuthorization({
      amountCents: order.totals.totalCents,
      currency: "usd",
      orderId,
      memberId: order.memberId,
      idempotencyKey: authorizationProviderIdempotencyKey({
        memberId: order.memberId,
        orderId,
        amountCents: order.totals.totalCents,
        callerKey: key,
      }),
    });
    if (!auth.ok) {
      return deny(paymentDenials(auth.code), auth.message);
    }
    if (
      typeof auth.value.providerReference !== "string" ||
      auth.value.providerReference.trim() === "" ||
      !Number.isSafeInteger(auth.value.amountCents) ||
      auth.value.amountCents !== order.totals.totalCents ||
      auth.value.currency !== "usd" ||
      auth.value.status !== "authorized"
    ) {
      return deny(["payment_failed"], "Payment authorization evidence did not match the order.");
    }

    const authorized = await move(order, "payment_authorized", actor, asOf, {
      providerConfirmation: auth.value.providerReference,
      changes: {
        providerReference: auth.value.providerReference,
        authorizedAmountCents: auth.value.amountCents,
        authorizedCurrency: auth.value.currency,
        lastIdempotencyKey: key,
      },
    });
    if (!authorized.ok) {
      // The move was pre-checked, so reaching here means the table refused after
      // a real hold was placed. Release it rather than stranding the member's funds.
      await deps.payment.cancelAuthorization(auth.value.providerReference);
      return authorized;
    }

    // A held order is not an error. It waits in manual_review until Samuel decides,
    // and the authorization stands uncaptured while it waits.
    if (authorized.order.reviewTriggers.length > 0) {
      return move(authorized.order, "manual_review", "system", asOf);
    }
    return authorized;
  }

  async function approve(orderId: string, adminId: string, asOf: Date): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);

    return move(order, "approved", "admin", asOf, {
      changes: { approvedBy: adminId, approvedAt: asOf.toISOString() },
    });
  }

  async function capture(
    orderId: string,
    actor: Actor,
    asOf: Date,
    idempotencyKey?: string,
  ): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);

    if (!deps.durablePaymentExecutionAvailable) {
      return deny(["payment_disabled"], "Durable payment execution is not available.");
    }

    const key = idempotencyKey ?? `capture:${orderId}`;
    const replay = await replayCheck(order, key, isCaptured);
    if (replay.kind === "replay") return { ok: true, order: replay.order, idempotent: true };
    if (replay.kind === "conflict") {
      return deny(["order_state_invalid"], "Idempotency key is already bound to another action.");
    }

    const denials = new Denials();
    if (!deps.commerceEnabled) denials.add("commerce_disabled");
    // Capture is legal only out of `approved`. A cancelled, captured, or
    // still-under-review order all fail here, which is the point.
    if (order.state !== "approved") denials.add("order_state_invalid");
    if (!canTransitionOrder(order.state, "payment_captured", actor)) {
      denials.add("order_state_invalid");
    }
    if (
      typeof order.providerReference !== "string" ||
      order.providerReference.trim() === ""
    ) {
      denials.add("payment_failed");
    }
    if (!Number.isSafeInteger(order.totals.totalCents) || order.totals.totalCents <= 0) {
      denials.add("quantity_invalid");
    }
    // Capture is not a partial-capture feature. The durable order must carry the
    // exact positive amount and currency the provider returned at authorization,
    // and the current total must still match that evidence. Missing legacy facts,
    // growth, and shrinkage all fail before the provider can move money.
    if (
      !Number.isSafeInteger(order.authorizedAmountCents) ||
      (order.authorizedAmountCents ?? 0) <= 0 ||
      order.totals.totalCents !== order.authorizedAmountCents ||
      order.authorizedCurrency !== "usd"
    ) {
      denials.add("payment_failed");
    }
    // A held order was authorized at one moment and captured at another, which
    // only a provider that defers capture can honor.
    if (order.reviewTriggers.length > 0 && !deps.payment.supportsDeferredCapture) {
      denials.add("capability_disabled");
    }
    if (!denials.empty) return denied(denials, `Order ${orderId} cannot be captured.`);

    const reference = order.providerReference as string;
    const captured = await deps.payment.captureAuthorization(reference, order.totals.totalCents);
    if (!captured.ok) {
      // The authorization stands and the order waits. It is never marked paid here.
      return deny(paymentDenials(captured.code), captured.message);
    }
    if (
      captured.value.providerReference !== reference ||
      !Number.isSafeInteger(captured.value.capturedAmountCents) ||
      captured.value.capturedAmountCents !== order.totals.totalCents ||
      captured.value.currency !== "usd" ||
      captured.value.status !== "captured"
    ) {
      return deny(["payment_failed"], "Payment capture evidence did not match the authorized order.");
    }

    return move(order, "payment_captured", actor, asOf, {
      providerConfirmation: captured.value.providerReference,
      changes: {
        capturedAmountCents: captured.value.capturedAmountCents,
        lastIdempotencyKey: key,
      },
    });
  }

  async function cancel(
    orderId: string,
    actor: Actor,
    reason: string,
    asOf: Date,
  ): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);

    if (!canTransitionOrder(order.state, "cancelled", actor)) {
      return deny(["order_state_invalid"], `Order ${orderId} cannot be cancelled from ${order.state}.`);
    }

    const providerReference =
      order.providerReference === null
        ? null
        : typeof order.providerReference === "string" && order.providerReference.trim() !== ""
          ? order.providerReference
          : undefined;
    const capturedEvidenceIsAbsent = order.capturedAmountCents === undefined;
    const capturedEvidenceIsExactZero =
      Number.isSafeInteger(order.capturedAmountCents) && order.capturedAmountCents === 0;
    if (
      providerReference === undefined ||
      (!capturedEvidenceIsAbsent && !capturedEvidenceIsExactZero)
    ) {
      return deny(["payment_failed"], "Stored payment evidence does not prove an uncaptured order.");
    }

    if (providerReference === null) {
      // A pre-authorization order may be cancelled without a provider call.
      // Any stored authorization/capture evidence without its exact provider
      // reference is contradictory and must not be turned into "cancelled".
      if (
        !capturedEvidenceIsAbsent ||
        order.authorizedAmountCents !== undefined ||
        order.authorizedCurrency !== undefined ||
        order.state === "payment_authorized" ||
        order.state === "manual_review" ||
        order.state === "approved"
      ) {
        return deny(["payment_failed"], "Stored payment evidence is missing its provider reference.");
      }
    } else {
      if (
        !Number.isSafeInteger(order.totals.totalCents) ||
        order.totals.totalCents <= 0 ||
        !Number.isSafeInteger(order.authorizedAmountCents) ||
        (order.authorizedAmountCents ?? 0) <= 0 ||
        order.authorizedAmountCents !== order.totals.totalCents ||
        order.authorizedCurrency !== "usd"
      ) {
        return deny(["payment_failed"], "Stored authorization evidence does not match the order.");
      }
      if (!deps.durablePaymentExecutionAvailable) {
        return deny(["payment_disabled"], "Durable authorization release is not available.");
      }
      const released = await deps.payment.cancelAuthorization(providerReference);
      if (!released.ok) {
        // A failed or unavailable release is not evidence that the hold was
        // cancelled. Keep the durable order unchanged so a later reviewed
        // reconciliation can retry without contradicting provider truth.
        return deny(paymentDenials(released.code), released.message);
      }
    }

    return move(order, "cancelled", actor, asOf, {
      changes: { cancellationReason: reason, authorizationReleaseFailed: false },
    });
  }

  async function beginProcessing(orderId: string, actor: Actor, asOf: Date): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);
    return move(order, "processing", actor, asOf);
  }

  async function markFulfilled(orderId: string, actor: Actor, asOf: Date, evidence?: string): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);
    return move(order, "fulfilled", actor, asOf, { providerConfirmation: evidence });
  }

  async function markDelivered(orderId: string, actor: Actor, asOf: Date, evidence?: string): Promise<OrderResult> {
    const order = await deps.repository.get(orderId);
    if (!order) return deny(["order_not_found"], `No order ${orderId}.`);
    return move(order, "delivered", actor, asOf, { providerConfirmation: evidence });
  }

  async function listForMember(memberId: string): Promise<OrderSummaryDto[]> {
    return (await deps.repository.listByMember(memberId))
      .filter((order) => order.memberId === memberId)
      .map(toSummary);
  }

  async function getForMember(memberId: string, orderId: string): Promise<OrderDetailDto | null> {
    const order = await deps.repository.get(orderId);
    if (!order) return null;
    // Ownership is the gate. Another member's order does not exist to this caller.
    if (order.memberId !== memberId) return null;
    return toDetail(order);
  }

  async function adminLargeOrderQueue(): Promise<LargeOrderQueueEntry[]> {
    const held: LargeOrderQueueEntry[] = [];
    (await deps.repository.listAll()).forEach((order) => {
      if (order.state !== "manual_review") return;
      held.push({
        orderId: order.orderId,
        totalCents: order.totals.totalCents,
        triggers: order.reviewTriggers.slice(),
        heldSince: order.updatedAt,
      });
    });
    return held;
  }

  return {
    authorize,
    approve,
    capture,
    cancel,
    beginProcessing,
    markFulfilled,
    markDelivered,
    listForMember,
    getForMember,
    adminLargeOrderQueue,
  };
}
