import { describe, expect, it } from "vitest";
import {
  ORDER_STATES,
  ORDER_TRANSITIONS,
  TERMINAL_ORDER_STATES,
  canTransitionOrder,
  transitionOrder,
  evaluateLargeOrderReview,
  LARGE_ORDER_THRESHOLD_CENTS,
  applySubscriptionAction,
  SUBSCRIPTION_FREQUENCIES,
  configuredStandardQuote,
  orderShippingTotalCents,
  STANDARD_SHIPPING_CENTS,
  type OrderState,
  type ShippingQuote,
} from "./commerce";

describe("order state machine", () => {
  it("advances through the ordinary happy path", () => {
    const path: Array<[OrderState, OrderState, "member" | "admin" | "system"]> = [
      ["draft", "checkout_pending", "member"],
      ["payment_authorized", "approved", "admin"],
      ["payment_captured", "processing", "system"],
      ["processing", "fulfilled", "system"],
    ];
    for (const [from, to, actor] of path) {
      expect(transitionOrder({ from, to, actor }).ok).toBe(true);
    }
  });

  it("denies a transition that is not in the table", () => {
    const r = transitionOrder({ from: "draft", to: "fulfilled", actor: "admin" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_transition");
  });

  it("denies a member driving an admin-only transition", () => {
    const r = transitionOrder({ from: "manual_review", to: "approved", actor: "member" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("actor_not_permitted");
  });

  // The central money guard: nothing reaches a paid state on assertion alone.
  it("refuses to reach payment_authorized without provider confirmation", () => {
    const r = transitionOrder({ from: "checkout_pending", to: "payment_authorized", actor: "system" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_confirmation_required");
  });

  it("refuses to reach payment_captured without provider confirmation", () => {
    const r = transitionOrder({ from: "approved", to: "payment_captured", actor: "system" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_confirmation_required");
  });

  it("allows a paid state only with a provider reference", () => {
    const r = transitionOrder({
      from: "approved",
      to: "payment_captured",
      actor: "provider_webhook",
      providerConfirmation: "pi_verified_reference",
    });
    expect(r.ok).toBe(true);
  });

  it("refuses to refund without provider confirmation even for an admin", () => {
    const r = transitionOrder({ from: "payment_captured", to: "refunded", actor: "admin" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("provider_confirmation_required");
  });

  it("treats a replayed webhook as an idempotent no-op", () => {
    const r = transitionOrder({
      from: "checkout_pending",
      to: "payment_authorized",
      actor: "provider_webhook",
      providerConfirmation: "pi_ref",
      idempotencyKey: "evt_1",
      lastAppliedIdempotencyKey: "evt_1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.idempotent).toBe(true);
      // The state must not advance on a replay.
      expect(r.state).toBe("checkout_pending");
    }
  });

  it("applies a genuinely new event with a different idempotency key", () => {
    const r = transitionOrder({
      from: "checkout_pending",
      to: "payment_authorized",
      actor: "provider_webhook",
      providerConfirmation: "pi_ref",
      idempotencyKey: "evt_2",
      lastAppliedIdempotencyKey: "evt_1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.idempotent).toBe(false);
      expect(r.state).toBe("payment_authorized");
    }
  });

  // Idempotency is deliberately checked BEFORE authorization, because a replayed
  // provider event must be absorbed even after the order has moved on, and the
  // authorization check already ran when the key was first applied. The guarantee
  // that makes this safe is that an absorbed replay NEVER changes state, so a
  // replayed key cannot be used to drive an order anywhere.
  it("absorbs a replayed key without advancing state, even for a forbidden actor", () => {
    const r = transitionOrder({
      from: "manual_review",
      to: "approved",
      actor: "member", // a member may never approve
      idempotencyKey: "evt_9",
      lastAppliedIdempotencyKey: "evt_9",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.idempotent).toBe(true);
      // The critical assertion: no state change, so this grants nothing.
      expect(r.state).toBe("manual_review");
    }
  });

  it("denies that same forbidden actor when the key is genuinely new", () => {
    const r = transitionOrder({
      from: "manual_review",
      to: "approved",
      actor: "member",
      idempotencyKey: "evt_10",
      lastAppliedIdempotencyKey: "evt_9",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("actor_not_permitted");
  });

  it("denies every transition out of a terminal state", () => {
    for (const terminal of TERMINAL_ORDER_STATES) {
      for (const to of ORDER_STATES) {
        const r = transitionOrder({ from: terminal, to, actor: "admin" });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("terminal_state");
      }
    }
  });

  it("has no transition table entry that originates in a terminal state", () => {
    for (const t of ORDER_TRANSITIONS) {
      expect(TERMINAL_ORDER_STATES.has(t.from)).toBe(false);
    }
  });

  it("references only declared states in the transition table", () => {
    for (const t of ORDER_TRANSITIONS) {
      expect(ORDER_STATES).toContain(t.from);
      expect(ORDER_STATES).toContain(t.to);
    }
  });

  it("never lets a member reach a fulfillment or payment state directly", () => {
    const memberForbidden: OrderState[] = [
      "payment_authorized",
      "payment_captured",
      "processing",
      "partially_fulfilled",
      "fulfilled",
      "delivered",
      "approved",
      "refunded",
      "replaced",
    ];
    for (const from of ORDER_STATES) {
      for (const to of memberForbidden) {
        expect(canTransitionOrder(from, to, "member")).toBe(false);
      }
    }
  });
});

describe("large-order review", () => {
  it("does not trigger on an ordinary order", () => {
    const r = evaluateLargeOrderReview({ totalCents: 12_000, maxUnitQuantity: 2, fraudFlagged: false });
    expect(r.requiresReview).toBe(false);
    expect(r.triggers).toEqual([]);
  });

  it("triggers strictly above the threshold, not at it", () => {
    expect(
      evaluateLargeOrderReview({
        totalCents: LARGE_ORDER_THRESHOLD_CENTS,
        maxUnitQuantity: 1,
        fraudFlagged: false,
      }).requiresReview,
    ).toBe(false);

    expect(
      evaluateLargeOrderReview({
        totalCents: LARGE_ORDER_THRESHOLD_CENTS + 1,
        maxUnitQuantity: 1,
        fraudFlagged: false,
      }).triggers,
    ).toContain("total_exceeds_threshold");
  });

  it("triggers on unusual quantity and on a fraud rule independently", () => {
    expect(
      evaluateLargeOrderReview({ totalCents: 100, maxUnitQuantity: 99, fraudFlagged: false }).triggers,
    ).toContain("unusual_quantity");
    expect(
      evaluateLargeOrderReview({ totalCents: 100, maxUnitQuantity: 1, fraudFlagged: true }).triggers,
    ).toContain("fraud_rule");
  });

  it("accumulates every trigger rather than stopping at the first", () => {
    const r = evaluateLargeOrderReview({
      totalCents: LARGE_ORDER_THRESHOLD_CENTS + 1,
      maxUnitQuantity: 99,
      fraudFlagged: true,
    });
    expect(r.triggers).toHaveLength(3);
  });
});

describe("subscription state machine", () => {
  it("offers exactly the three founder-approved frequencies", () => {
    expect(SUBSCRIPTION_FREQUENCIES).toEqual([30, 60, 90]);
  });

  it("supports the member controls", () => {
    expect(applySubscriptionAction("active", "pause", "member")).toEqual({ ok: true, state: "paused" });
    expect(applySubscriptionAction("paused", "resume", "member")).toEqual({ ok: true, state: "active" });
    expect(applySubscriptionAction("active", "skip", "member")).toEqual({
      ok: true,
      state: "skip_scheduled",
    });
    expect(applySubscriptionAction("active", "cancel", "member")).toEqual({
      ok: true,
      state: "cancelled",
    });
  });

  it("does not let a member self-activate a subscription", () => {
    const r = applySubscriptionAction("pending", "activate", "member");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("actor_not_permitted");
  });

  it("does not let a member fabricate or clear a payment issue", () => {
    expect(applySubscriptionAction("active", "report_payment_issue", "member").ok).toBe(false);
    expect(applySubscriptionAction("payment_issue", "resolve_payment_issue", "member").ok).toBe(false);
    expect(applySubscriptionAction("payment_issue", "resolve_payment_issue", "admin").ok).toBe(false);
  });

  it("treats cancellation as terminal", () => {
    const r = applySubscriptionAction("cancelled", "resume", "admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("terminal_state");
  });

  it("rejects an action that does not apply to the current state", () => {
    const r = applySubscriptionAction("paused", "skip", "member");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_transition");
  });
});

describe("shipping presentation", () => {
  it("labels the configured rate as a fallback and never invents a delivery date", () => {
    const q = configuredStandardQuote();
    expect(q.kind).toBe("configured_fallback");
    expect(q.amountCents).toBe(STANDARD_SHIPPING_CENTS);
    expect(q.estimatedDeliveryRange).toBeNull();
    expect(q.disclosure).toContain("not a live carrier quote");
  });

  // Founder decision: one shipping charge per order, even on a split shipment.
  it("charges shipping once per order across split fulfillment", () => {
    const quotes: ShippingQuote[] = [
      { ...configuredStandardQuote() },
      { ...configuredStandardQuote() },
    ];
    expect(orderShippingTotalCents(quotes)).toBe(STANDARD_SHIPPING_CENTS);
  });

  it("charges the higher service when a split mixes services", () => {
    const quotes: ShippingQuote[] = [
      configuredStandardQuote(),
      {
        kind: "live_carrier_quote",
        service: "temperature_controlled",
        amountCents: 4200,
        estimatedDeliveryRange: { earliestDays: 1, latestDays: 2 },
        disclosure: "Live carrier quote.",
      },
    ];
    expect(orderShippingTotalCents(quotes)).toBe(4200);
  });

  it("charges nothing when there are no shipments", () => {
    expect(orderShippingTotalCents([])).toBe(0);
  });
});
