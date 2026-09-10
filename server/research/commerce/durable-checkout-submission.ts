// The durable checkout submission path.
//
// One submission is one logical request, identified by the buyer's request
// key. In order: the canonical gates decide (nothing is reserved or charged on
// a denial); inventory is held; the canonical order is persisted in
// checkout_pending; the recoverable execution intent is persisted, bound to
// the exact request body, the priced cart, the order, the holds and stable
// provider operation keys; ONLY THEN the coordinator touches the provider.
// A retry with the same key and the same body continues the same execution
// (no second order, no second payment); the same key with changed details
// conflicts. The buyer gets the request key, the order reference and the
// truthful state, never "success" before the provider's truth is recorded.
//
// NOT MOUNTED. The composition root wires it behind the existing readiness
// boundary; the production provider resolver still returns Disabled.
import type { Express, Request, Response } from "express";
import type { CartDto, CheckoutRequest, CommerceDenialCode } from "@shared/research/commerce-api";
import { evaluateLargeOrderReview, orderShippingTotalCents, transitionOrder, type ShippingQuote } from "@shared/research/commerce";
import type { CheckoutEvaluationResult, ReservationAuditEvent, ReservationRefusalCode, ReservationSeam } from "./checkout";
import type { DurableExecutionOutcome } from "./durable-checkout-executor";
import type { OrderRecord, OrderRepository } from "./orders";
import { CheckoutCreditReservationRefused, CheckoutExecutionConflict, requestBodySha256, type CheckoutExecutionRepository } from "./persistence/checkout-executions-store";
import { subjectOf } from "./routes";
import { cancellationOf } from "./checkout-continuation";
import type { CancellationReason, CheckoutExecutionRecord } from "@shared/research/durable-checkout-execution";

export type DurableCheckoutState =
  | "pending"
  | "authentication_required"
  | "processing"
  | "completed"
  | "cancelled"
  | "reconciliation_required";

export type DurableCheckoutOutcome =
  | { ok: true; requestKey: string; orderId: string; state: DurableCheckoutState; idempotent: boolean; cancellation?: { reason: CancellationReason } }
  | { ok: false; code: CommerceDenialCode; codes: CommerceDenialCode[]; reservationRefusals?: ReservationRefusalCode[] };

export interface DurableCheckoutSubmissionDeps {
  /** The canonical gates and pricing (CheckoutService.evaluate). Side-effect free. */
  evaluate(memberId: string, req: CheckoutRequest, asOf: Date): Promise<CheckoutEvaluationResult>;
  orders: OrderRepository;
  executions: CheckoutExecutionRepository;
  executor: {
    run(memberId: string, requestKey: string): Promise<DurableExecutionOutcome>;
    /** A retry of the same request is the buyer asking again: a parked execution gets one bounded reconciliation. */
    recover(memberId: string, requestKey: string): Promise<DurableExecutionOutcome>;
  };
  inventory?: ReservationSeam;
  reservationAudit?: { record(event: ReservationAuditEvent): Promise<void> | void };
  isFraudFlagged?: (memberId: string) => boolean;
  /** The canonical approved price version for this cart when the catalog carries one; null today. */
  priceVersion?: (cart: CartDto) => string | null;
  now: () => Date;
  newId: () => string;
  /** Downstream after commit (order confirmation over the canonical outbox). Absent means no notification. */
  onCommitted?: (order: OrderRecord) => Promise<void> | void;
}

const REQUEST_KEY = /^[A-Za-z0-9_-]{8,120}$/;
const PAYMENT_METHOD = /^pm_[A-Za-z0-9_]+$/;

/** The price identity a submission binds: every priced line, the shipping quote and the credit applied. */
export function quoteFingerprint(cart: CartDto, quote: ShippingQuote | null, storeCreditAppliedCents: number): string {
  return requestBodySha256({
    lines: cart.lines.map((line) => [line.sku, line.quantity, line.unitPriceCents, line.lineTotalCents]),
    shipping: quote ? [quote.service, quote.amountCents] : null,
    subtotalCents: cart.subtotalCents,
    storeCreditAppliedCents,
  });
}

function stateOf(outcome: DurableExecutionOutcome): DurableCheckoutState {
  switch (outcome.kind) {
    case "committed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "action_required":
      return "authentication_required";
    case "reconciliation_required":
      return "reconciliation_required";
    default:
      return "pending";
  }
}

function orderStateToCheckoutState(order: OrderRecord): DurableCheckoutState {
  if (order.state === "cancelled") return "cancelled";
  if (["payment_captured", "processing", "partially_fulfilled", "fulfilled", "delivered"].includes(order.state)) return "completed";
  return "processing";
}

export function createDurableCheckoutSubmission(deps: DurableCheckoutSubmissionDeps) {
  const deny = (codes: CommerceDenialCode[], reservationRefusals?: ReservationRefusalCode[]): DurableCheckoutOutcome => ({
    ok: false,
    code: codes[0] ?? "forbidden",
    codes,
    ...(reservationRefusals ? { reservationRefusals } : {}),
  });

  async function continueExisting(memberId: string, requestKey: string, orderId: string, idempotent: boolean): Promise<DurableCheckoutOutcome> {
    const outcome = idempotent ? await deps.executor.recover(memberId, requestKey) : await deps.executor.run(memberId, requestKey);
    if (outcome.kind === "committed" && deps.onCommitted) {
      const order = await deps.orders.get(orderId);
      if (order && order.memberId === memberId) await deps.onCommitted(order);
    }
    const state = stateOf(outcome);
    if (state === "cancelled") {
      const record = await deps.executions.getForMember(memberId, requestKey);
      return { ok: true, requestKey, orderId, state, idempotent, cancellation: cancellationOf(record ?? { lastProviderResult: null } as CheckoutExecutionRecord) };
    }
    return { ok: true, requestKey, orderId, state, idempotent };
  }

  return {
    async submit(memberId: string, req: CheckoutRequest, asOf: Date): Promise<DurableCheckoutOutcome> {
      const requestKey = typeof req?.idempotencyKey === "string" ? req.idempotencyKey : "";
      if (!REQUEST_KEY.test(requestKey)) return deny(["idempotency_conflict"]);
      const requestDigest = requestBodySha256(req);

      // 1. The same logical request continues the same execution; changed details conflict.
      const existing = await deps.executions.getForMember(memberId, requestKey);
      if (existing) {
        const stored = await deps.orders.get(existing.orderId);
        // The execution binds the exact body digest at creation; the repository
        // read re-checks the order really belongs to this buyer.
        if (!stored || stored.memberId !== memberId) return deny(["order_not_found"]);
        if (stored.checkoutIdempotencyKey !== requestKey) return deny(["idempotency_conflict"]);
        if ((await deps.executions.verifyRequest(memberId, requestKey, requestDigest)) !== "match") return deny(["idempotency_conflict"]);
        return continueExisting(memberId, requestKey, existing.orderId, true);
      }
      // A legacy order settled under this key answers with its truth; no new execution.
      const legacy = await deps.orders.findByCheckoutIdempotencyKey(memberId, requestKey);
      if (legacy) return { ok: true, requestKey, orderId: legacy.orderId, state: orderStateToCheckoutState(legacy), idempotent: true };

      // 2. Canonical gates. Nothing is created, reserved or charged on a denial.
      const { denials, cart, quote } = await deps.evaluate(memberId, req, asOf);
      if (denials.length > 0 || quote === null) return deny(denials.length > 0 ? denials : ["shipping_unavailable"]);
      const shippingCents = orderShippingTotalCents([quote]);
      const orderValueCents = cart.subtotalCents + shippingCents;
      const totalCents = Math.max(0, orderValueCents - cart.storeCreditAppliedCents);
      // The buyer approved a specific amount. If this fresh revalidation prices
      // the order differently, the approval does not cover it: refuse before
      // anything is reserved or charged and let them approve the new figure.
      if (typeof req.expectedTotalCents === "number" && req.expectedTotalCents !== totalCents) {
        return deny(["cart_revalidation_failed"]);
      }
      if (totalCents === 0) {
        // A fully credit-covered order has no provider effect and no capture
        // evidence to commit on; it stays on the assisted path for now.
        return deny(["payment_disabled"]);
      }
      if (!req.paymentMethodReference || !PAYMENT_METHOD.test(req.paymentMethodReference)) return deny(["payment_method_required"]);
      const review = evaluateLargeOrderReview({
        totalCents: orderValueCents,
        maxUnitQuantity: cart.lines.reduce((max, line) => Math.max(max, line.quantity), 0),
        fraudFlagged: deps.isFraudFlagged?.(memberId) ?? false,
      });
      if (review.requiresReview) {
        // The durable path captures automatically; a held authorization awaiting
        // a human decision is the assisted/manual path today.
        return deny(["large_order_review_required"]);
      }

      // 3. Inventory hold, all-or-nothing, before any money moves.
      let reservationIds: string[] = [];
      if (deps.inventory) {
        const reserved = await deps.inventory.reserve(memberId, cart.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })), asOf);
        if (!reserved.ok) return deny(["insufficient_stock"], reserved.refusals);
        reservationIds = reserved.reservationIds;
      }
      const orderId = deps.newId();
      const audit = async (type: ReservationAuditEvent["type"]) => {
        if (!deps.reservationAudit || reservationIds.length === 0) return;
        await deps.reservationAudit.record({ type, orderId, memberId, reservationIds: [...reservationIds], at: asOf.toISOString() });
      };
      const release = async () => {
        if (!deps.inventory || reservationIds.length === 0) return;
        await deps.inventory.release(reservationIds);
        await audit("released");
      };

      // 4. The canonical order, persisted in checkout_pending BEFORE the execution and the provider.
      const opened = transitionOrder({ from: "draft", to: "checkout_pending", actor: "system" });
      if (!opened.ok) {
        await release();
        return deny(["order_state_invalid"]);
      }
      const placedAt = asOf.toISOString();
      const order: OrderRecord = {
        orderId,
        memberId,
        state: opened.state,
        lines: cart.lines.map((line) => ({ sku: line.sku, displayName: line.displayName, quantity: line.quantity, lineTotalCents: line.lineTotalCents ?? -1 })),
        totals: { subtotalCents: cart.subtotalCents, shippingCents, storeCreditAppliedCents: cart.storeCreditAppliedCents, totalCents },
        providerReference: null,
        checkoutIdempotencyKey: requestKey,
        lastIdempotencyKey: requestKey,
        reviewTriggers: [...review.triggers],
        createdAt: placedAt,
        updatedAt: placedAt,
        refundedCents: 0,
        shipments: cart.shipmentGroups.map((group) => ({ owner: group.owner, status: "pending", trackingNumber: null, carrier: null })),
      };
      try {
        await deps.orders.save(order);
        await audit("reserved");
      } catch (error) {
        await release();
        throw error;
      }

      // 5. The recoverable intent, before any external effect.
      const executionId = deps.newId();
      try {
        await deps.executions.create({
          executionId,
          requestKey,
          requestBodySha256: requestDigest,
          priceVersion: deps.priceVersion?.(cart) ?? null,
          phase: "reserved",
          version: 1,
          providerReference: null,
          orderId,
          memberId,
          amountCents: totalCents,
          currency: "usd",
          paymentMethodReference: req.paymentMethodReference,
          quoteFingerprint: quoteFingerprint(cart, quote, cart.storeCreditAppliedCents),
          authorizationKey: `xr-auth-${executionId}`,
          captureKey: `xr-capture-${executionId}`,
          cancelKey: `xr-cancel-${executionId}`,
          reservationIds,
          createdAt: placedAt,
          authorizationAttemptedAt: null,
          settledAt: null,
        });
      } catch (error) {
        // A transport failure may follow a committed INSERT. Establish canonical
        // identity before any compensation; absence after an uncertain response
        // is not proof that the write cannot still finish.
        const winner = await deps.executions.getForMember(memberId, requestKey);
        if (winner?.executionId === executionId && winner.orderId === orderId
          && winner.memberId === memberId && winner.requestKey === requestKey
          && winner.amountCents === totalCents
          && (await deps.executions.verifyRequest(memberId, requestKey, requestDigest)) === "match") {
          // This is still the explicit original customer submission, now with
          // its durable intent confirmed. The executor retains provider CAS and
          // idempotency. Unattended recovery behavior is not changed.
          return continueExisting(memberId, requestKey, orderId, false);
        }
        if (error instanceof CheckoutCreditReservationRefused && !winner
          && !(await deps.executions.findByOrder(orderId))) {
          // Exact PostgreSQL trigger refusal means this INSERT transaction
          // rolled back. Read-back confirms no other intent owns this order.
          // Unlike transport uncertainty, its own inventory can be released.
          await release();
          const cancelled = transitionOrder({ from: order.state, to: "cancelled", actor: "system" });
          if (!cancelled.ok) throw error;
          await deps.orders.save({ ...order, state: cancelled.state,
            cancellationReason: "credit_reservation_refused", updatedAt: deps.now().toISOString() });
          return deny([error.reason === "credit_reservation_insufficient" ? "cart_revalidation_failed" : "capability_disabled"]);
        }
        if (!(error instanceof CheckoutExecutionConflict) || !winner
          || winner.executionId === executionId || winner.orderId === orderId
          || winner.memberId !== memberId || winner.requestKey !== requestKey) {
          // Preserve the order/holds for reconciliation. Do not manufacture a
          // cancellation or risk releasing resources owned by a committed intent.
          throw error;
        }
        const same = (await deps.executions.verifyRequest(memberId, requestKey, requestDigest)) === "match";
        // Only a definitive conflict with a different canonical execution AND
        // order proves this attempt lost. Its own holds may now be compensated.
        await release();
        const cancelled = transitionOrder({ from: order.state, to: "cancelled", actor: "system" });
        if (cancelled.ok) await deps.orders.save({ ...order, state: cancelled.state, cancellationReason: "duplicate_submission", updatedAt: deps.now().toISOString() });
        if (same) return continueExisting(memberId, requestKey, winner.orderId, true);
        return deny(["idempotency_conflict"]);
      }

      // 6. Only now the provider, through the recovery-aware coordinator.
      return continueExisting(memberId, requestKey, orderId, false);
    },
  };
}

export type DurableCheckoutSubmission = ReturnType<typeof createDurableCheckoutSubmission>;

export const DURABLE_CHECKOUT_PATH = "/api/research/checkout/durable";

function privateNoStore(res: Response): void {
  res.set("Cache-Control", "private, no-store");
  res.set("Pragma", "no-cache");
  res.set("Referrer-Policy", "no-referrer");
}

/**
 * What the submit door does. `unavailable` is not an absent dependency: a
 * surface that cannot take a card says so explicitly, and the type makes
 * "neither" impossible to express, so a wiring mistake cannot quietly turn the
 * live door into a refusal.
 */
export type DurableCheckoutApiDeps =
  | { submission: DurableCheckoutSubmission; now?: () => Date }
  | { unavailable: true };

/**
 * One door behind the canonical active-member guard. Body is the frozen
 * CheckoutRequest.
 *
 * There is exactly ONE registration of this path in the repository, and the
 * surface chooses what it does rather than whether a second one exists.
 * Registering a path twice does not fail loudly: Express lets the first
 * registration win, so a refusal mounted beside the real door could shadow
 * checkout, or be shadowed by it, with nothing to see at startup.
 */
export function registerDurableCheckoutApi(
  app: Express,
  guards: { requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void> },
  deps: DurableCheckoutApiDeps,
): void {
  const live = "unavailable" in deps ? null : deps;
  const refuse = (_req: Request, res: Response): void => {
    privateNoStore(res);
    res.status(503).json({ ok: false, code: "capability_disabled", message: "Card checkout is not available right now. Nothing was charged; your cart is kept." });
  };
  const accept = async (req: Request, res: Response): Promise<void> => {
    privateNoStore(res);
    const memberId = subjectOf(req);
    if (!memberId) {
      res.status(403).json({ ok: false, code: "forbidden", message: "This area requires an active membership." });
      return;
    }
    try {
      const outcome = await live!.submission.submit(memberId, req.body as CheckoutRequest, (live!.now ?? (() => new Date()))());
      if (!outcome.ok) {
        // The same status contract as the legacy door: only commerce_disabled is
        // an unpublished capability; every other denial (payment_disabled for a
        // credit-covered order included) is a routable 400 with its code.
        res.status(outcome.code === "commerce_disabled" ? 503 : 400).json({ ok: false, code: outcome.code, codes: outcome.codes, ...(outcome.reservationRefusals ? { reservationRefusals: outcome.reservationRefusals } : {}) });
        return;
      }
      const { ok: _ok, ...checkout } = outcome;
      res.json({ ok: true, checkout });
    } catch {
      if (!res.headersSent) res.status(503).json({ ok: false, code: "capability_disabled", message: "Checkout is not available right now. Nothing has been charged twice; check your orders before retrying." });
    }
  };
  app.post(DURABLE_CHECKOUT_PATH, guards.requireActiveMember, live ? accept : refuse);
}
