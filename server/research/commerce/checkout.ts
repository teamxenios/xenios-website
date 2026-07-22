// xenios research: checkout validation and submission.
//
// One decision, assembled from every gate: cart, eligibility, agreements, address,
// serviceable state, shipping, payment, and large-order review.
//
// Two rules shape the whole file.
//
// First, it fails closed and it accumulates. No gate returns early, because an
// operator who fixes one blocker and resubmits only to hit the next one has been
// told a partial truth. `validate` reports the COMPLETE blocking set.
//
// Second, money is never assumed. Product commerce is disabled today, so the
// ordinary path through this file is a denial, and that path is the one under test.
// Nothing here marks an order paid on its own: every advance goes through
// `transitionOrder`, which requires a provider reference for a paid state.

import { randomUUID } from "node:crypto";
import type { CartDto, CheckoutRequest, CommerceDenialCode } from "@shared/research/commerce-api";
import {
  evaluateLargeOrderReview,
  orderShippingTotalCents,
  transitionOrder,
  type LargeOrderTrigger,
  type OrderState,
  type ShippingQuote,
} from "@shared/research/commerce";
import {
  allocateFefo,
  type AllocationLine,
  type InventoryLot,
  type LotEvaluation,
} from "../inventory/lots";
import type { PaymentProvider } from "../providers/payment";
import type { ShippingProvider } from "../providers/shipping";
import type { InventoryLotRepository } from "./persistence/inventory-store";
import type { ReservationRepository } from "./persistence/reservations-store";

/**
 * A configured package weight so a quote can be requested at all. It is a shipping
 * input, not a supplier fact about any product, and a caller with real parcel data
 * overrides it.
 */
export const DEFAULT_PACKAGE_WEIGHT_GRAMS = 500;

// ---------------------------------------------------------------------------
// Inventory reservation seam
// ---------------------------------------------------------------------------

/**
 * Why a reservation was refused. `insufficient_stock` is the member-facing
 * denial; the lot-precise codes reuse the exact names the subscription renewal
 * gate already established (RenewalRefusalCode in subscriptions.ts), so an
 * operator sees one vocabulary for "this lot cannot ship" everywhere.
 */
export type ReservationRefusalCode =
  | "insufficient_stock"
  | "coa_missing"
  | "lot_expired"
  | "lot_recalled";

export interface ReservationLineRequest {
  sku: string;
  quantity: number;
}

export type ReserveOutcome =
  | { ok: true; reservationIds: string[] }
  | { ok: false; refusals: ReservationRefusalCode[] };

/**
 * The inventory hold around a checkout. `reserve` pins real lots (FEFO) and
 * decrements their available quantity so no concurrent checkout can sell the
 * same units; `release` restores the hold when the checkout fails; `finalize`
 * makes the decrement permanent on settlement. All-or-nothing per call: a
 * refusal reserves nothing.
 */
export interface ReservationSeam {
  reserve(
    memberId: string,
    lines: readonly ReservationLineRequest[],
    asOf: Date,
  ): Promise<ReserveOutcome>;
  release(reservationIds: readonly string[]): Promise<void>;
  finalize(reservationIds: readonly string[]): Promise<void>;
}

/**
 * One reservation audit event. The append-only order state trail
 * (research_order_state_events) has no metadata column and its writer lives in
 * orders-store.ts (owned elsewhere), so reservation evidence goes through this
 * injected recorder rather than a new audit system. The production wave that
 * wires the seam decides where these land.
 */
export interface ReservationAuditEvent {
  type: "reserved" | "released" | "finalized";
  orderId: string;
  memberId: string;
  reservationIds: string[];
  at: string;
}

export interface CheckoutDeps {
  cart: { revalidate(memberId: string, asOf: Date): Promise<CartDto> };
  payment: PaymentProvider;
  shipping: ShippingProvider;
  commerceEnabled: boolean;
  /** US state codes xenios may ship to. An empty list ships nowhere. */
  serviceableStates: string[];
  /** Agreement versions currently required at checkout. */
  acceptedAgreementKeys: string[];
  packageWeightGrams?: number;
  /** Per-SKU sane individual quantity, passed through to large-order review. */
  unusualQuantityThreshold?: number;
  /** Fraud signal owned elsewhere. Absent means no signal, never means cleared. */
  isFraudFlagged?: (memberId: string) => boolean;
  /**
   * The store-credit ledger seam. When present, checkout RECORDS the credit an
   * order consumed (a negative ledger row) the moment the payment is
   * authorized at the reduced amount, so the same credit cannot be applied
   * again on the next order. Absent (the default, and today's production
   * wiring, where the balance is stubbed to zero) nothing changes. A recording
   * failure propagates: an order must not proceed on a discount the ledger
   * refused to debit.
   */
  storeCredit?: {
    recordSpend(memberId: string, amountCents: number, orderId: string, asOf: Date): Promise<void>;
  };
  /**
   * The inventory reservation seam. When present, a clean submit reserves real
   * lot stock (FEFO) BEFORE any money moves, releases it when the payment is
   * refused, and finalizes it on capture. Absent (the default, and today's
   * production wiring) nothing changes: no stock is held, exactly as before.
   */
  inventory?: ReservationSeam;
  /** Where reservation audit evidence goes. Absent means no recording. */
  reservationAudit?: {
    record(event: ReservationAuditEvent): Promise<void> | void;
  };
}

export interface CheckoutValidation {
  ok: boolean;
  denials: CommerceDenialCode[];
}

/**
 * The stored order. Wider than the wire DTO on purpose: the payment reference and
 * the review triggers are operator data that must never be serialized to a member
 * by a route that simply spreads this object.
 */
export interface CheckoutOrder {
  orderId: string;
  memberId: string;
  state: OrderState;
  placedAt: string;
  subtotalCents: number;
  shippingCents: number;
  storeCreditAppliedCents: number;
  totalCents: number;
  lines: CartDto["lines"];
  shipmentGroups: CartDto["shipmentGroups"];
  paymentReference: string | null;
  captured: boolean;
  reviewTriggers: LargeOrderTrigger[];
  idempotencyKey: string;
  /** The inventory holds backing this order. Empty when no seam is wired. */
  reservationIds: string[];
}

export type CheckoutOutcome =
  | { ok: true; order: CheckoutOrder; idempotent: boolean }
  | {
      ok: false;
      denials: CommerceDenialCode[];
      /**
       * Present only when the reservation seam refused: the lot-precise
       * operator codes behind the member-facing `insufficient_stock` denial.
       */
      reservationRefusals?: ReservationRefusalCode[];
    };

export interface CheckoutService {
  validate(memberId: string, req: CheckoutRequest, asOf: Date): Promise<CheckoutValidation>;
  submit(memberId: string, req: CheckoutRequest, asOf: Date): Promise<CheckoutOutcome>;
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

  addAll(codes: readonly CommerceDenialCode[]): void {
    for (const code of codes) this.add(code);
  }

  get list(): CommerceDenialCode[] {
    return [...this.ordered];
  }

  get empty(): boolean {
    return this.ordered.length === 0;
  }
}

// ---------------------------------------------------------------------------
// Structural address validation
// ---------------------------------------------------------------------------

function addressIsStructurallyValid(address: CheckoutRequest["shippingAddress"]): boolean {
  if (address.country !== "US") return false;
  if (address.line1.trim() === "") return false;
  if (address.city.trim() === "") return false;
  if (!/^[A-Za-z]{2}$/.test(address.state)) return false;
  if (!/^\d{5}(-\d{4})?$/.test(address.postalCode)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

interface Evaluation {
  denials: Denials;
  cart: CartDto;
  quote: ShippingQuote | null;
}

export function createCheckoutService(deps: CheckoutDeps): CheckoutService {
  const orders = new Map<string, CheckoutOrder>();
  /** Idempotency is scoped per member so two members cannot collide on one key. */
  const byIdempotencyKey = new Map<string, string>();
  /**
   * Submissions that have started but not finished, keyed by the same scope.
   *
   * A settled-order map alone does not make submit idempotent, because the key is
   * only recorded after the first `await`. Two submissions of one key that overlap
   * would both find the map empty and each create an order and an authorization.
   * An in-flight entry is claimed before any await, so the second submission joins
   * the first instead of racing it.
   */
  const inFlight = new Map<string, Promise<CheckoutOutcome>>();

  /**
   * Probes the payment provider without side effects. A provider that cannot take a
   * payment answers DISABLED or MISCONFIGURED to everything, including a read, so
   * this learns the capability without creating an authorization.
   */
  async function paymentIsUsable(): Promise<boolean> {
    const probe = await deps.payment.retrieveStatus("");
    if (probe.ok) return true;
    return probe.code !== "DISABLED" && probe.code !== "MISCONFIGURED";
  }

  async function evaluate(memberId: string, req: CheckoutRequest, asOf: Date): Promise<Evaluation> {
    const denials = new Denials();
    const cart = await deps.cart.revalidate(memberId, asOf);

    if (!deps.commerceEnabled) denials.add("commerce_disabled");

    if (cart.lines.length === 0) denials.add("cart_empty");

    if (!cart.checkoutReady) {
      denials.add("cart_revalidation_failed");
      denials.addAll(cart.blockingReasons);
    }

    // A line with no total cannot be charged. Prefer the cart's own reason for it,
    // and fall back to the conservative one rather than assuming a price of zero.
    for (const line of cart.lines) {
      if (line.lineTotalCents === null || line.unitPriceCents === null) {
        denials.add(line.blockedReason ?? "unconfirmed_supplier_facts");
      }
    }

    const required = [...deps.acceptedAgreementKeys, ...cart.requiredAgreements];
    const presented = new Set(req.acceptedAgreementKeys);
    if (required.some((key) => !presented.has(key))) denials.add("agreement_required");

    const addressValid = addressIsStructurallyValid(req.shippingAddress);
    if (!addressValid) denials.add("address_invalid");

    const serviceable = new Set(deps.serviceableStates.map((s) => s.toUpperCase()));
    if (!serviceable.has(req.shippingAddress.state.toUpperCase())) {
      denials.add("state_not_serviceable");
    }

    let quote: ShippingQuote | null = null;
    const quoteResult = await deps.shipping.quote({
      destination: req.shippingAddress,
      service: req.shippingService,
      weightGrams: deps.packageWeightGrams ?? DEFAULT_PACKAGE_WEIGHT_GRAMS,
      temperatureControlled: req.shippingService === "temperature_controlled",
    });
    if (quoteResult.ok) {
      quote = quoteResult.value;
    } else {
      denials.add("shipping_unavailable");
    }

    if (!(await paymentIsUsable())) denials.add("payment_disabled");

    return { denials, cart, quote };
  }

  async function validate(
    memberId: string,
    req: CheckoutRequest,
    asOf: Date,
  ): Promise<CheckoutValidation> {
    const { denials } = await evaluate(memberId, req, asOf);
    return { ok: denials.empty, denials: denials.list };
  }

  /**
   * The idempotency front door. Everything before the first `await` is one
   * uninterrupted step, so a duplicate key is resolved before any work begins.
   */
  async function submit(
    memberId: string,
    req: CheckoutRequest,
    asOf: Date,
  ): Promise<CheckoutOutcome> {
    const idempotencyScope = `${memberId}:${req.idempotencyKey}`;

    const existingId = byIdempotencyKey.get(idempotencyScope);
    if (existingId) {
      return { ok: true, order: orders.get(existingId)!, idempotent: true };
    }

    const running = inFlight.get(idempotencyScope);
    if (running) {
      const outcome = await running;
      // A duplicate never creates a second order, so it reports the first one.
      return outcome.ok ? { ...outcome, idempotent: true } : outcome;
    }

    // Claimed synchronously. `performSubmit` runs up to its own first await before
    // this line, and no other submission can interleave until then.
    const run = performSubmit(memberId, req, asOf, idempotencyScope);
    inFlight.set(idempotencyScope, run);
    try {
      return await run;
    } finally {
      // Cleared either way. A denial creates no order, so a later retry of the same
      // key is evaluated fresh rather than being handed a stale refusal.
      inFlight.delete(idempotencyScope);
    }
  }

  async function performSubmit(
    memberId: string,
    req: CheckoutRequest,
    asOf: Date,
    idempotencyScope: string,
  ): Promise<CheckoutOutcome> {
    const { denials, cart, quote } = await evaluate(memberId, req, asOf);
    // Nothing is created, charged, or reserved on a denial. This is the live path today.
    if (!denials.empty || quote === null) {
      return { ok: false, denials: denials.list };
    }

    /**
     * The inventory hold, taken only after every gate has passed and BEFORE any
     * money moves. A refusal reserves nothing (the seam is all-or-nothing) and
     * creates no order, so the idempotency key stays clean for a retry once
     * stock exists. The member sees `insufficient_stock`; the precise lot-level
     * refusals ride alongside for the operator queue.
     */
    let reservationIds: string[] = [];
    if (deps.inventory) {
      const reserved = await deps.inventory.reserve(
        memberId,
        cart.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
        asOf,
      );
      if (!reserved.ok) {
        return {
          ok: false,
          denials: ["insufficient_stock"],
          reservationRefusals: reserved.refusals,
        };
      }
      reservationIds = reserved.reservationIds;
    }

    const audit = async (type: ReservationAuditEvent["type"], orderId: string): Promise<void> => {
      if (!deps.reservationAudit || reservationIds.length === 0) return;
      await deps.reservationAudit.record({
        type,
        orderId,
        memberId,
        reservationIds: [...reservationIds],
        at: asOf.toISOString(),
      });
    };

    /** The compensation for a checkout that dies after the hold was taken. */
    const releaseReservations = async (orderId: string): Promise<void> => {
      if (!deps.inventory || reservationIds.length === 0) return;
      await deps.inventory.release(reservationIds);
      await audit("released", orderId);
    };

    // Totals are rebuilt from the revalidated cart. A client-supplied amount is not
    // read anywhere in this function.
    const shippingCents = orderShippingTotalCents([quote]);
    /**
     * The value of the order, before any credit is applied. This is the number the
     * large-order review is assessed on.
     *
     * Store credit is the balance referral abuse manufactures, so allowing it to
     * shrink the number that decides whether a human looks at an order would let a
     * member spend their way under the review threshold. Credit reduces what is
     * charged, never whether the order is reviewed.
     */
    const orderValueCents = cart.subtotalCents + shippingCents;
    const totalCents = Math.max(0, orderValueCents - cart.storeCreditAppliedCents);

    // Globally unique, not a per-process counter: two service instances over
    // one durable repository (a restart, or a second app instance) must never
    // mint the same order id, because a colliding id lets a later save
    // silently overwrite another instance's projected order.
    const orderId = `ord_${randomUUID()}`;
    const order: CheckoutOrder = {
      orderId,
      memberId,
      state: "draft",
      placedAt: asOf.toISOString(),
      subtotalCents: cart.subtotalCents,
      shippingCents,
      storeCreditAppliedCents: cart.storeCreditAppliedCents,
      totalCents,
      lines: [...cart.lines],
      shipmentGroups: [...cart.shipmentGroups],
      paymentReference: null,
      captured: false,
      reviewTriggers: [],
      idempotencyKey: req.idempotencyKey,
      reservationIds,
    };

    const opened = transitionOrder({ from: order.state, to: "checkout_pending", actor: "system" });
    if (!opened.ok) {
      await releaseReservations(orderId);
      return { ok: false, denials: ["order_state_invalid"] };
    }
    order.state = opened.state;

    orders.set(orderId, order);
    byIdempotencyKey.set(idempotencyScope, orderId);
    await audit("reserved", orderId);

    const review = evaluateLargeOrderReview({
      totalCents: orderValueCents,
      maxUnitQuantity: cart.lines.reduce((max, line) => Math.max(max, line.quantity), 0),
      fraudFlagged: deps.isFraudFlagged?.(memberId) ?? false,
      unusualQuantityThreshold: deps.unusualQuantityThreshold,
    });
    order.reviewTriggers = review.triggers;

    /**
     * Records the credit this order consumed, once the charge exists at the
     * reduced amount. The applied credit funded part of this order, so the
     * ledger must show it leaving; without this row the same balance would
     * apply again on every later order.
     */
    const recordAppliedCredit = async (): Promise<void> => {
      if (!deps.storeCredit || order.storeCreditAppliedCents <= 0) return;
      await deps.storeCredit.recordSpend(memberId, order.storeCreditAppliedCents, orderId, asOf);
    };

    if (review.requiresReview) {
      // A held order, not an error. Authorize only where the funds can be released
      // again without a capture, and never capture while Samuel has not decided.
      if (deps.payment.supportsDeferredCapture) {
        const auth = await deps.payment.createAuthorization({
          amountCents: totalCents,
          currency: "usd",
          orderId,
          memberId,
          idempotencyKey: req.idempotencyKey,
        });
        if (auth.ok) {
          order.paymentReference = auth.value.providerReference;
          await recordAppliedCredit();
        }
      }
      const held = transitionOrder({ from: order.state, to: "manual_review", actor: "system" });
      if (held.ok) order.state = held.state;
      return { ok: true, order, idempotent: false };
    }

    const auth = await deps.payment.createAuthorization({
      amountCents: totalCents,
      currency: "usd",
      orderId,
      memberId,
      idempotencyKey: req.idempotencyKey,
    });
    if (!auth.ok) {
      // The hold is returned to the shelf: no payment, no reservation. This is
      // the leak test's path, and the release must restore every unit reserved.
      await releaseReservations(orderId);
      const cancelled = transitionOrder({ from: order.state, to: "cancelled", actor: "system" });
      if (cancelled.ok) order.state = cancelled.state;
      return { ok: false, denials: ["payment_failed"] };
    }
    order.paymentReference = auth.value.providerReference;
    await recordAppliedCredit();

    const authorized = transitionOrder({
      from: order.state,
      to: "payment_authorized",
      actor: "system",
      providerConfirmation: auth.value.providerReference,
    });
    if (!authorized.ok) return { ok: false, denials: ["order_state_invalid"] };
    order.state = authorized.state;

    const approved = transitionOrder({ from: order.state, to: "approved", actor: "system" });
    if (!approved.ok) return { ok: true, order, idempotent: false };
    order.state = approved.state;

    const capture = await deps.payment.captureAuthorization(auth.value.providerReference, totalCents);
    if (!capture.ok) {
      // The authorization stands and the order waits. It is never marked paid here.
      return { ok: true, order, idempotent: false };
    }

    const captured = transitionOrder({
      from: order.state,
      to: "payment_captured",
      actor: "system",
      providerConfirmation: capture.value.providerReference,
    });
    if (captured.ok) {
      order.state = captured.state;
      order.captured = true;
      // Settlement: the reserve-time decrement becomes permanent. The units are
      // sold, so a later release (or refund) must never put them back.
      if (deps.inventory && reservationIds.length > 0) {
        await deps.inventory.finalize(reservationIds);
        await audit("finalized", orderId);
      }
    }

    return { ok: true, order, idempotent: false };
  }

  return { validate, submit };
}

// ---------------------------------------------------------------------------
// The real reservation seam: FEFO over persisted lots
// ---------------------------------------------------------------------------

/** How long a hold lives before a sweeper may return it to the shelf. */
export const DEFAULT_RESERVATION_HOLD_MINUTES = 30;

export interface InventoryReservationSeamDeps {
  lots: InventoryLotRepository;
  reservations: ReservationRepository;
  /** Hold lifetime written onto every reservation. */
  holdMinutes?: number;
  /** Injected for tests; defaults to a UUID so ids are database-compatible. */
  newReservationId?: () => string;
  /** Clock for settlement timestamps; reserve stamps use the caller's asOf. */
  now?: () => Date;
}

/**
 * Builds the ReservationSeam over the persisted lot and reservation stores.
 *
 * Model: the hold IS the decrement. `reserve` lowers each allocated lot's
 * quantity_available immediately (a hold that does not decrement is not a hold
 * under concurrency, per inventory-store.ts), `release` raises it back, and
 * `finalize` marks the allocations final WITHOUT touching quantity again: the
 * settlement decrement already happened at reserve time and finalizing makes
 * it permanent rather than double-counting it.
 *
 * `reserve` is all-or-nothing across every requested line. Allocation is
 * planned entirely in memory first (a working copy is decremented so two lines
 * of one sku cannot claim the same units), and only a fully satisfiable plan
 * is persisted. A mid-persist failure compensates what it applied, so a
 * refused or failed reserve never leaks a partial hold.
 */
export function createInventoryReservationSeam(deps: InventoryReservationSeamDeps): ReservationSeam {
  const holdMinutes = deps.holdMinutes ?? DEFAULT_RESERVATION_HOLD_MINUTES;
  const newId = deps.newReservationId ?? (() => `rsv_${randomUUID()}`);
  const now = deps.now ?? (() => new Date());

  /**
   * Mines the precise lot-level refusals out of a failed allocation, using the
   * exact vocabulary subscriptions.ts established. Only a FAILED allocation
   * reaches here: while clean lots can satisfy the quantity, a bad lot
   * elsewhere in the pool is FEFO's problem, not a refusal.
   */
  function preciseRefusals(
    pool: readonly InventoryLot[],
    rejected: readonly LotEvaluation[],
    into: ReservationRefusalCode[],
  ): void {
    const push = (code: ReservationRefusalCode): void => {
      if (!into.includes(code)) into.push(code);
    };
    push("insufficient_stock");
    for (const evaluation of rejected) {
      if (evaluation.blockReasons.includes("expired")) push("lot_expired");
      if (evaluation.blockReasons.includes("recalled")) push("lot_recalled");
      if (evaluation.blockReasons.includes("documentation_missing")) {
        const lot = pool.find((l) => l.lotId === evaluation.lotId);
        if (lot && !lot.documents.coaOnFile) push("coa_missing");
      }
    }
  }

  return {
    async reserve(memberId, lines, asOf) {
      // Plan phase, entirely in memory. listBySku returns defensive copies, so
      // decrementing the working pool never touches stored state.
      const pools = new Map<string, InventoryLot[]>();
      const refusals: ReservationRefusalCode[] = [];
      const planned: Array<{ sku: string; quantity: number; allocation: AllocationLine[] }> = [];

      for (const line of lines) {
        let pool = pools.get(line.sku);
        if (!pool) {
          pool = await deps.lots.listBySku(line.sku);
          pools.set(line.sku, pool);
        }
        const result = allocateFefo(pool, line.sku, line.quantity, asOf);
        if (!result.ok) {
          // Accumulate across lines (the operator sees the complete picture),
          // and keep planning nothing: one refused line refuses the whole hold.
          preciseRefusals(pool, result.rejected, refusals);
          continue;
        }
        for (const alloc of result.lines) {
          const lot = pool.find((l) => l.lotId === alloc.lotId)!;
          lot.quantityAvailable -= alloc.quantity;
        }
        planned.push({ sku: line.sku, quantity: line.quantity, allocation: result.lines });
      }

      if (refusals.length > 0) return { ok: false, refusals };

      // Persist phase: decrement the real lots, compensating on any failure so
      // a half-applied hold cannot survive.
      const applied: AllocationLine[] = [];
      try {
        for (const plan of planned) {
          for (const alloc of plan.allocation) {
            await deps.lots.adjustQuantityAvailable(alloc.lotId, -alloc.quantity);
            applied.push(alloc);
          }
        }

        const reservationIds: string[] = [];
        const expiresAt = new Date(asOf.getTime() + holdMinutes * 60 * 1000).toISOString();
        for (const plan of planned) {
          const reservationId = newId();
          await deps.reservations.save({
            reservationId,
            memberId,
            sku: plan.sku,
            quantity: plan.quantity,
            lines: plan.allocation.map((line) => ({ ...line })),
            status: "held",
            expiresAt,
            createdAt: asOf.toISOString(),
            releasedAt: null,
            finalizedAt: null,
          });
          reservationIds.push(reservationId);
        }
        return { ok: true, reservationIds };
      } catch (error) {
        for (const alloc of applied) {
          await deps.lots.adjustQuantityAvailable(alloc.lotId, alloc.quantity);
        }
        // A concurrent depletion surfaces as the store's refusal to go
        // negative: that is an out-of-stock race, reported as such.
        if (error instanceof Error && /negative/.test(error.message)) {
          return { ok: false, refusals: ["insufficient_stock"] };
        }
        throw error;
      }
    },

    async release(reservationIds) {
      for (const reservationId of reservationIds) {
        const reservation = await deps.reservations.get(reservationId);
        // Idempotent: only a HELD reservation restores stock. A repeated
        // release, or a release after finalize, must never double-restore.
        if (!reservation || reservation.status !== "held") continue;
        for (const line of reservation.lines) {
          await deps.lots.adjustQuantityAvailable(line.lotId, line.quantity);
        }
        await deps.reservations.save({
          ...reservation,
          status: "released",
          releasedAt: now().toISOString(),
        });
      }
    },

    async finalize(reservationIds) {
      for (const reservationId of reservationIds) {
        const reservation = await deps.reservations.get(reservationId);
        if (!reservation) throw new Error(`reservation not found: ${reservationId}`);
        if (reservation.status === "finalized") continue; // settlement replay
        if (reservation.status === "released") {
          // Released stock is back on the shelf; settling it now would ship
          // units the hold no longer owns. Surface loudly.
          throw new Error(`reservation ${reservationId} was released and cannot be finalized`);
        }
        await deps.reservations.save({
          ...reservation,
          status: "finalized",
          finalizedAt: now().toISOString(),
        });
      }
    },
  };
}
