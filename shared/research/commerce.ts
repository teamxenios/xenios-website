// xenios research: commerce domain contract.
//
// Order and subscription lifecycles are expressed as explicit state machines with
// an allowed-transition table and an actor requirement per transition. Nothing
// advances an order by assignment; every move goes through `transitionOrder`, so
// an unauthorized or out-of-order move is impossible rather than merely unlikely.
//
// The rule that governs the money-adjacent states: an order NEVER reaches a paid
// state without a provider confirmation. Code cannot mark itself paid.

export type OrderState =
  | "draft"
  | "checkout_pending"
  | "payment_authorized"
  | "manual_review"
  | "approved"
  | "payment_captured"
  | "processing"
  | "partially_fulfilled"
  | "fulfilled"
  | "delivered"
  | "exception"
  | "cancelled"
  | "refunded"
  | "replaced";

export const ORDER_STATES: readonly OrderState[] = [
  "draft",
  "checkout_pending",
  "payment_authorized",
  "manual_review",
  "approved",
  "payment_captured",
  "processing",
  "partially_fulfilled",
  "fulfilled",
  "delivered",
  "exception",
  "cancelled",
  "refunded",
  "replaced",
] as const;

/** Who is permitted to drive a transition. */
export type Actor = "member" | "admin" | "system" | "provider_webhook";

export interface OrderTransition {
  from: OrderState;
  to: OrderState;
  /** At least one of these actors must be the caller. */
  actors: readonly Actor[];
  /**
   * True when the transition may only be applied on confirmed provider evidence
   * (a payment capture, an authorization, a carrier delivery event).
   */
  requiresProviderConfirmation?: boolean;
}

/**
 * The complete allowed-transition table. Anything not listed here is denied.
 *
 * Note that `payment_authorized` and `payment_captured` are reachable only by a
 * provider webhook or the system acting on a provider result, never by a member
 * and never by an admin clicking a button.
 */
export const ORDER_TRANSITIONS: readonly OrderTransition[] = [
  { from: "draft", to: "checkout_pending", actors: ["member", "system"] },
  { from: "draft", to: "cancelled", actors: ["member", "admin", "system"] },

  {
    from: "checkout_pending",
    to: "payment_authorized",
    actors: ["system", "provider_webhook"],
    requiresProviderConfirmation: true,
  },
  { from: "checkout_pending", to: "manual_review", actors: ["system"] },
  { from: "checkout_pending", to: "cancelled", actors: ["member", "admin", "system"] },
  { from: "checkout_pending", to: "exception", actors: ["system"] },

  { from: "payment_authorized", to: "manual_review", actors: ["system", "admin"] },
  { from: "payment_authorized", to: "approved", actors: ["admin", "system"] },
  { from: "payment_authorized", to: "cancelled", actors: ["admin", "system"] },
  { from: "payment_authorized", to: "exception", actors: ["system"] },

  // Large-order review resolution. Samuel is the only actor who can approve.
  { from: "manual_review", to: "approved", actors: ["admin"] },
  { from: "manual_review", to: "cancelled", actors: ["admin"] },
  { from: "manual_review", to: "exception", actors: ["system", "admin"] },

  {
    from: "approved",
    to: "payment_captured",
    actors: ["system", "provider_webhook"],
    requiresProviderConfirmation: true,
  },
  { from: "approved", to: "cancelled", actors: ["admin", "system"] },
  { from: "approved", to: "exception", actors: ["system"] },

  { from: "payment_captured", to: "processing", actors: ["system", "admin"] },
  { from: "payment_captured", to: "refunded", actors: ["admin"], requiresProviderConfirmation: true },
  { from: "payment_captured", to: "exception", actors: ["system"] },

  { from: "processing", to: "partially_fulfilled", actors: ["system", "admin"] },
  { from: "processing", to: "fulfilled", actors: ["system", "admin"] },
  { from: "processing", to: "exception", actors: ["system", "admin"] },
  { from: "processing", to: "cancelled", actors: ["admin"] },

  { from: "partially_fulfilled", to: "fulfilled", actors: ["system", "admin"] },
  { from: "partially_fulfilled", to: "exception", actors: ["system", "admin"] },

  { from: "fulfilled", to: "delivered", actors: ["system", "provider_webhook"] },
  { from: "fulfilled", to: "exception", actors: ["system", "admin"] },

  { from: "delivered", to: "replaced", actors: ["admin"] },
  { from: "delivered", to: "refunded", actors: ["admin"], requiresProviderConfirmation: true },
  { from: "delivered", to: "exception", actors: ["system", "admin"] },

  // An exception is recoverable, which matters because a carrier hiccup should
  // not permanently strand an order.
  { from: "exception", to: "processing", actors: ["admin"] },
  { from: "exception", to: "cancelled", actors: ["admin"] },
  { from: "exception", to: "refunded", actors: ["admin"], requiresProviderConfirmation: true },
  { from: "exception", to: "replaced", actors: ["admin"] },
] as const;

/** States from which nothing further may happen. */
export const TERMINAL_ORDER_STATES: ReadonlySet<OrderState> = new Set<OrderState>([
  "cancelled",
  "refunded",
  "replaced",
]);

export type TransitionDenialReason =
  | "unknown_transition"
  | "actor_not_permitted"
  | "provider_confirmation_required"
  | "terminal_state"
  | "idempotency_conflict";

export type TransitionResult =
  | { ok: true; state: OrderState; idempotent: boolean }
  | { ok: false; reason: TransitionDenialReason; message: string };

export interface TransitionInput {
  from: OrderState;
  to: OrderState;
  actor: Actor;
  /** A verified provider reference. Absent means no provider confirmed anything. */
  providerConfirmation?: string;
  /**
   * When supplied together with `lastAppliedIdempotencyKey`, a repeat of the same
   * key is treated as an idempotent no-op rather than an error, so a retried
   * webhook does not double-apply.
   */
  idempotencyKey?: string;
  lastAppliedIdempotencyKey?: string;
}

/**
 * The single authority for advancing an order.
 *
 * Fails closed on every unknown case. Order matters: idempotency is checked first
 * so a duplicate webhook is absorbed even when the order has already moved on.
 */
export function transitionOrder(input: TransitionInput): TransitionResult {
  const { from, to, actor } = input;

  if (
    input.idempotencyKey !== undefined &&
    input.lastAppliedIdempotencyKey !== undefined &&
    input.idempotencyKey === input.lastAppliedIdempotencyKey
  ) {
    return { ok: true, state: from, idempotent: true };
  }

  if (TERMINAL_ORDER_STATES.has(from)) {
    return {
      ok: false,
      reason: "terminal_state",
      message: `Order is in terminal state ${from} and cannot transition.`,
    };
  }

  const rule = ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!rule) {
    return {
      ok: false,
      reason: "unknown_transition",
      message: `No allowed transition from ${from} to ${to}.`,
    };
  }

  if (!rule.actors.includes(actor)) {
    return {
      ok: false,
      reason: "actor_not_permitted",
      message: `Actor ${actor} may not move an order from ${from} to ${to}.`,
    };
  }

  if (rule.requiresProviderConfirmation && !input.providerConfirmation) {
    return {
      ok: false,
      reason: "provider_confirmation_required",
      message: `Transition ${from} to ${to} requires a confirmed provider reference.`,
    };
  }

  return { ok: true, state: to, idempotent: false };
}

/** Convenience predicate used by routes and tests. */
export function canTransitionOrder(from: OrderState, to: OrderState, actor: Actor): boolean {
  const rule = ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
  return Boolean(rule && rule.actors.includes(actor));
}

// ---------------------------------------------------------------------------
// Large-order review
// ---------------------------------------------------------------------------

/** Founder decision: review above $1,000, or on unusual quantity, or on a fraud rule. */
export const LARGE_ORDER_THRESHOLD_CENTS = 100_000;

export interface LargeOrderInput {
  totalCents: number;
  maxUnitQuantity: number;
  fraudFlagged: boolean;
  /** Per-SKU sane individual quantity. Configurable, not hardcoded per product here. */
  unusualQuantityThreshold?: number;
}

export type LargeOrderTrigger = "total_exceeds_threshold" | "unusual_quantity" | "fraud_rule";

export function evaluateLargeOrderReview(input: LargeOrderInput): {
  requiresReview: boolean;
  triggers: LargeOrderTrigger[];
} {
  const triggers: LargeOrderTrigger[] = [];
  if (input.totalCents > LARGE_ORDER_THRESHOLD_CENTS) triggers.push("total_exceeds_threshold");
  if (input.maxUnitQuantity > (input.unusualQuantityThreshold ?? 10)) triggers.push("unusual_quantity");
  if (input.fraudFlagged) triggers.push("fraud_rule");
  return { requiresReview: triggers.length > 0, triggers };
}

// ---------------------------------------------------------------------------
// Product subscriptions
// ---------------------------------------------------------------------------

export type SubscriptionState =
  | "pending"
  | "active"
  | "paused"
  | "skip_scheduled"
  | "rescheduled"
  | "payment_issue"
  | "cancelled";

export type SubscriptionFrequencyDays = 30 | 60 | 90;

export const SUBSCRIPTION_FREQUENCIES: readonly SubscriptionFrequencyDays[] = [30, 60, 90] as const;

export type SubscriptionAction =
  | "activate"
  | "pause"
  | "resume"
  | "skip"
  | "reschedule"
  | "report_payment_issue"
  | "resolve_payment_issue"
  | "cancel";

interface SubscriptionRule {
  from: SubscriptionState;
  action: SubscriptionAction;
  to: SubscriptionState;
  actors: readonly Actor[];
}

export const SUBSCRIPTION_TRANSITIONS: readonly SubscriptionRule[] = [
  { from: "pending", action: "activate", to: "active", actors: ["system", "provider_webhook"] },
  { from: "pending", action: "cancel", to: "cancelled", actors: ["member", "admin", "system"] },

  { from: "active", action: "pause", to: "paused", actors: ["member", "admin"] },
  { from: "active", action: "skip", to: "skip_scheduled", actors: ["member", "admin"] },
  { from: "active", action: "reschedule", to: "rescheduled", actors: ["member", "admin"] },
  { from: "active", action: "report_payment_issue", to: "payment_issue", actors: ["system", "provider_webhook"] },
  { from: "active", action: "cancel", to: "cancelled", actors: ["member", "admin"] },

  { from: "paused", action: "resume", to: "active", actors: ["member", "admin"] },
  { from: "paused", action: "cancel", to: "cancelled", actors: ["member", "admin"] },

  { from: "skip_scheduled", action: "resume", to: "active", actors: ["member", "admin", "system"] },
  { from: "skip_scheduled", action: "cancel", to: "cancelled", actors: ["member", "admin"] },
  { from: "skip_scheduled", action: "reschedule", to: "rescheduled", actors: ["member", "admin"] },

  { from: "rescheduled", action: "resume", to: "active", actors: ["member", "admin", "system"] },
  { from: "rescheduled", action: "cancel", to: "cancelled", actors: ["member", "admin"] },

  { from: "payment_issue", action: "resolve_payment_issue", to: "active", actors: ["system", "provider_webhook"] },
  { from: "payment_issue", action: "cancel", to: "cancelled", actors: ["member", "admin", "system"] },
] as const;

export type SubscriptionResult =
  | { ok: true; state: SubscriptionState }
  | { ok: false; reason: TransitionDenialReason; message: string };

export function applySubscriptionAction(
  from: SubscriptionState,
  action: SubscriptionAction,
  actor: Actor,
): SubscriptionResult {
  if (from === "cancelled") {
    return {
      ok: false,
      reason: "terminal_state",
      message: "A cancelled subscription cannot transition.",
    };
  }
  const rule = SUBSCRIPTION_TRANSITIONS.find((r) => r.from === from && r.action === action);
  if (!rule) {
    return {
      ok: false,
      reason: "unknown_transition",
      message: `Action ${action} is not allowed from ${from}.`,
    };
  }
  if (!rule.actors.includes(actor)) {
    return {
      ok: false,
      reason: "actor_not_permitted",
      message: `Actor ${actor} may not perform ${action} from ${from}.`,
    };
  }
  return { ok: true, state: rule.to };
}

// ---------------------------------------------------------------------------
// Shipping presentation
// ---------------------------------------------------------------------------

/** Founder decision: a working launch rate, charged once per order, admin-configurable. */
export const STANDARD_SHIPPING_CENTS = 1295;

export type ShippingQuoteKind = "configured_fallback" | "live_carrier_quote";

/**
 * A quote always declares how it was produced. A configured fallback must never be
 * presented to a member as if a carrier returned it, and a delivery date is only
 * ever a range, never a commitment.
 */
export interface ShippingQuote {
  kind: ShippingQuoteKind;
  service: "standard" | "expedited_2day" | "next_day" | "same_day" | "temperature_controlled";
  amountCents: number;
  /** Null whenever no carrier confirmed a window. Never invent one. */
  estimatedDeliveryRange: { earliestDays: number; latestDays: number } | null;
  disclosure: string;
}

export function configuredStandardQuote(): ShippingQuote {
  return {
    kind: "configured_fallback",
    service: "standard",
    amountCents: STANDARD_SHIPPING_CENTS,
    estimatedDeliveryRange: null,
    disclosure:
      "This is a configured standard shipping rate, not a live carrier quote. Delivery timing is not guaranteed.",
  };
}

/**
 * Shipping is charged once per order even when the order splits into multiple
 * fulfillment shipments. The founder decision is that Xenios absorbs the extra
 * cost of a split unless checkout clearly displays another charge.
 */
export function orderShippingTotalCents(quotes: readonly ShippingQuote[]): number {
  if (quotes.length === 0) return 0;
  return Math.max(...quotes.map((q) => q.amountCents));
}
