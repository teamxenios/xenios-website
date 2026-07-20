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

import type { CartDto, CheckoutRequest, CommerceDenialCode } from "@shared/research/commerce-api";
import {
  evaluateLargeOrderReview,
  orderShippingTotalCents,
  transitionOrder,
  type LargeOrderTrigger,
  type OrderState,
  type ShippingQuote,
} from "@shared/research/commerce";
import type { PaymentProvider } from "../providers/payment";
import type { ShippingProvider } from "../providers/shipping";

/**
 * A configured package weight so a quote can be requested at all. It is a shipping
 * input, not a supplier fact about any product, and a caller with real parcel data
 * overrides it.
 */
export const DEFAULT_PACKAGE_WEIGHT_GRAMS = 500;

export interface CheckoutDeps {
  cart: { revalidate(memberId: string, asOf: Date): CartDto };
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
}

export type CheckoutOutcome =
  | { ok: true; order: CheckoutOrder; idempotent: boolean }
  | { ok: false; denials: CommerceDenialCode[] };

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
  let counter = 0;

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
    const cart = deps.cart.revalidate(memberId, asOf);

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

    const { denials, cart, quote } = await evaluate(memberId, req, asOf);
    // Nothing is created, charged, or reserved on a denial. This is the live path today.
    if (!denials.empty || quote === null) {
      return { ok: false, denials: denials.list };
    }

    // Totals are rebuilt from the revalidated cart. A client-supplied amount is not
    // read anywhere in this function.
    const shippingCents = orderShippingTotalCents([quote]);
    const totalCents = Math.max(
      0,
      cart.subtotalCents + shippingCents - cart.storeCreditAppliedCents,
    );

    const orderId = `ord_${++counter}`;
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
    };

    const opened = transitionOrder({ from: order.state, to: "checkout_pending", actor: "system" });
    if (!opened.ok) return { ok: false, denials: ["order_state_invalid"] };
    order.state = opened.state;

    orders.set(orderId, order);
    byIdempotencyKey.set(idempotencyScope, orderId);

    const review = evaluateLargeOrderReview({
      totalCents,
      maxUnitQuantity: cart.lines.reduce((max, line) => Math.max(max, line.quantity), 0),
      fraudFlagged: deps.isFraudFlagged?.(memberId) ?? false,
      unusualQuantityThreshold: deps.unusualQuantityThreshold,
    });
    order.reviewTriggers = review.triggers;

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
        if (auth.ok) order.paymentReference = auth.value.providerReference;
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
      const cancelled = transitionOrder({ from: order.state, to: "cancelled", actor: "system" });
      if (cancelled.ok) order.state = cancelled.state;
      return { ok: false, denials: ["payment_failed"] };
    }
    order.paymentReference = auth.value.providerReference;

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
    }

    return { ok: true, order, idempotent: false };
  }

  return { validate, submit };
}
