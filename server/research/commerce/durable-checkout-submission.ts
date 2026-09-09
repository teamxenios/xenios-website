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
import { CheckoutExecutionConflict, requestBodySha256, type CheckoutExecutionRepository } from "./persistence/checkout-executions-store";
import { subjectOf } from "./routes";

export type DurableCheckoutState =
  | "pending"
  | "authentication_required"
  | "processing"
  | "completed"
  | "cancelled"
  | "reconciliation_required";

export type DurableCheckoutOutcome =
  | { ok: true; requestKey: string; orderId: string; state: DurableCheckoutState; idempotent: boolean }
  | { ok: false; code: CommerceDenialCode; codes: CommerceDenialCode[]; reservationRefusals?: ReservationRefusalCode[] };

export interface DurableCheckoutSubmissionDeps {
  /** The canonical gates and pricing (CheckoutService.evaluate). Side-effect free. */
  evaluate(memberId: string, req: CheckoutRequest, asOf: Date): Promise<CheckoutEvaluationResult>;
  orders: OrderRepository;
  executions: CheckoutExecutionRepository;
  executor: { run(memberId: string, requestKey: string): Promise<DurableExecutionOutcome> };
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
    const outcome = await deps.executor.run(memberId, requestKey);
    if (outcome.kind === "committed" && deps.onCommitted) {
      const order = await deps.orders.get(orderId);
      if (order && order.memberId === memberId) await deps.onCommitted(order);
    }
    return { ok: true, requestKey, orderId, state: stateOf(outcome), idempotent };
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
        // A concurrent submission of the same key won the intent: this attempt's
        // order and holds are compensated and the buyer continues the winner.
        await release();
        const cancelled = transitionOrder({ from: order.state, to: "cancelled", actor: "system" });
        if (cancelled.ok) await deps.orders.save({ ...order, state: cancelled.state, cancellationReason: "duplicate_submission", updatedAt: deps.now().toISOString() });
        if (error instanceof CheckoutExecutionConflict) {
          const winner = await deps.executions.getForMember(memberId, requestKey);
          const same = winner && (await deps.executions.verifyRequest(memberId, requestKey, requestDigest)) === "match";
          if (winner && same) return continueExisting(memberId, requestKey, winner.orderId, true);
          return deny(["idempotency_conflict"]);
        }
        throw error;
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

/** One door behind the canonical active-member guard. Body is the frozen CheckoutRequest. */
export function registerDurableCheckoutApi(
  app: Express,
  guards: { requireActiveMember: (req: Request, res: Response, next: () => void) => void | Promise<void> },
  deps: { submission: DurableCheckoutSubmission; now?: () => Date },
): void {
  app.post(DURABLE_CHECKOUT_PATH, guards.requireActiveMember, async (req: Request, res: Response) => {
    privateNoStore(res);
    const memberId = subjectOf(req);
    if (!memberId) {
      res.status(403).json({ ok: false, code: "forbidden", message: "This area requires an active membership." });
      return;
    }
    try {
      const outcome = await deps.submission.submit(memberId, req.body as CheckoutRequest, (deps.now ?? (() => new Date()))());
      if (!outcome.ok) {
        res.status(outcome.code === "commerce_disabled" || outcome.code === "payment_disabled" ? 503 : 400).json({ ok: false, code: outcome.code, codes: outcome.codes, ...(outcome.reservationRefusals ? { reservationRefusals: outcome.reservationRefusals } : {}) });
        return;
      }
      const { ok: _ok, ...checkout } = outcome;
      res.json({ ok: true, checkout });
    } catch {
      if (!res.headersSent) res.status(503).json({ ok: false, code: "capability_disabled", message: "Checkout is not available right now. Nothing has been charged twice; check your orders before retrying." });
    }
  });
}
