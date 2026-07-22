// xenios research: inbound provider webhook handling.
//
// This is the most attackable surface in the commerce lane, because it is the one
// place where an unauthenticated stranger can speak to the order state machine.
// Three properties are enforced by the ORDER of operations in this file, not by
// convention:
//
//   1. Signature verification runs before anything else. An unsigned or wrongly
//      signed body never reaches the replay store, never reaches an order, and is
//      never recorded as seen, so a forged body cannot burn a real event id and
//      suppress the genuine event that follows it.
//   2. Replay is checked before any effect. A duplicate is acknowledged so the
//      provider stops retrying, and it changes nothing.
//   3. The event id is recorded before the effect is applied. Delivery is
//      at-least-once, so recording first means a crash between record and apply
//      loses an effect, while recording last would double-apply it. Losing a
//      state advance is recoverable by an operator; charging twice is not.
//
// No state is ever assigned. Every advance goes through `transitionOrder` with the
// provider reference carried by the verified event, so a webhook cannot move an
// order to a paid state on its own say-so.
//
// Nothing here logs the raw body, the signature, or any payload field. Ids and
// event types only.

import { transitionOrder, type OrderState } from "@shared/research/commerce";
import type { PaymentProvider } from "../providers/payment";
import type { FulfillmentProvider } from "../providers/fulfillment";

/**
 * The order fields a webhook may read or move. Deliberately narrow: a webhook has
 * no business reading a member id, a total, or a line.
 */
export interface WebhookOrder {
  orderId: string;
  state: OrderState;
  paymentReference: string | null;
  captured: boolean;
  /** Set to the event id that last moved this order, for transition idempotency. */
  lastWebhookEventId?: string;
}

export interface WebhookEventStore {
  seen(providerName: string, eventId: string): boolean;
  record(providerName: string, eventId: string, at: Date): void;
}

export interface WebhookOrderStore {
  get(orderId: string): Promise<WebhookOrder | undefined>;
  save(order: WebhookOrder): Promise<void>;
}

export interface WebhookDeps {
  store: WebhookEventStore;
  payment: PaymentProvider;
  /** Absent means the fulfillment capability is not wired. Absent is not an outage. */
  fulfillment?: FulfillmentProvider;
  orders: WebhookOrderStore;
  commerceEnabled: boolean;
}

export type WebhookDenialCode =
  | "invalid_signature"
  | "malformed"
  | "duplicate"
  | "unknown_order"
  | "capability_disabled";

export type WebhookResult =
  | { ok: true; applied: boolean; eventId: string }
  | { ok: false; code: WebhookDenialCode };

export interface WebhookHandler {
  handlePayment(rawBody: string, signature: string | undefined, asOf: Date): Promise<WebhookResult>;
  handleFulfillment(rawBody: string, signature: string | undefined, asOf: Date): Promise<WebhookResult>;
}

// ---------------------------------------------------------------------------
// Event type mapping
// ---------------------------------------------------------------------------

/**
 * Payment event type to target order state.
 *
 * An event type absent from this table is acknowledged and ignored rather than
 * guessed at. A provider adding a new event type must not be able to move an
 * order by accident.
 */
const PAYMENT_EVENT_STATES: Record<string, OrderState> = {
  "payment.authorized": "payment_authorized",
  "payment.captured": "payment_captured",
  "payment.refunded": "refunded",
  "payment.failed": "exception",
};

/** Fulfillment status to target order state. Same rule for anything unlisted. */
const FULFILLMENT_STATUS_STATES: Record<string, OrderState> = {
  shipped: "fulfilled",
  delivered: "delivered",
  exception: "exception",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonObject(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readString(source: Record<string, unknown> | null, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Classifies a provider verification refusal.
 *
 * DISABLED and MISCONFIGURED are capability states, never transient failures to
 * retry. Everything else is a rejection of the body itself, split into malformed
 * (the bytes are not a JSON object at all) and invalid_signature. The split is
 * decided structurally rather than by reading the provider's message text, and it
 * is reporting only: both outcomes apply nothing and record nothing.
 */
function classifyVerificationFailure(code: string, rawBody: string): WebhookDenialCode {
  if (code === "DISABLED" || code === "MISCONFIGURED") return "capability_disabled";
  return parseJsonObject(rawBody) === null ? "malformed" : "invalid_signature";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createWebhookHandler(deps: WebhookDeps): WebhookHandler {
  /**
   * Applies a target state to an order.
   *
   * The event id is passed as the idempotency key on both sides of the
   * transition, so an event that somehow reaches this point twice for the same
   * order is absorbed by `transitionOrder` as well as by the event store. A
   * denied transition is not an error to report upward: the event was genuine and
   * the provider must stop retrying, so it is acknowledged with applied false.
   */
  async function applyTransition(
    order: WebhookOrder,
    to: OrderState,
    eventId: string,
    providerConfirmation: string | undefined,
  ): Promise<boolean> {
    const result = transitionOrder({
      from: order.state,
      to,
      actor: "provider_webhook",
      providerConfirmation,
      idempotencyKey: eventId,
      lastAppliedIdempotencyKey: order.lastWebhookEventId,
    });
    if (!result.ok || result.idempotent) return false;

    order.state = result.state;
    order.lastWebhookEventId = eventId;
    if (result.state === "payment_captured") order.captured = true;
    if (providerConfirmation && !order.paymentReference) {
      order.paymentReference = providerConfirmation;
    }
    await deps.orders.save(order);
    return true;
  }

  async function handlePayment(
    rawBody: string,
    signature: string | undefined,
    asOf: Date,
  ): Promise<WebhookResult> {
    // Step 1. An absent signature is refused without consulting the provider, the
    // store, or any order.
    if (!signature) return { ok: false, code: "invalid_signature" };

    const verified = await deps.payment.verifyWebhook(rawBody, signature);
    if (!verified.ok) {
      return { ok: false, code: classifyVerificationFailure(verified.code, rawBody) };
    }

    const { eventId, eventType, providerReference } = verified.value;
    const providerName = deps.payment.name;

    // Step 2. Replay, before any effect and before the event is recorded.
    if (deps.store.seen(providerName, eventId)) {
      return { ok: true, applied: false, eventId };
    }

    // A disabled capability acknowledges the event so the provider stops retrying,
    // and applies nothing. The event is deliberately NOT recorded: nothing happened,
    // so a redelivery once commerce is enabled is a first application, not a second.
    if (!deps.commerceEnabled) {
      return { ok: true, applied: false, eventId };
    }

    const target = PAYMENT_EVENT_STATES[eventType];
    if (!target) {
      return { ok: true, applied: false, eventId };
    }

    const body = parseJsonObject(rawBody);
    const orderId = readString(body, "orderId");
    if (!orderId) return { ok: false, code: "malformed" };

    const order = await deps.orders.get(orderId);
    if (!order) return { ok: false, code: "unknown_order" };

    // Step 3. Record, then apply.
    deps.store.record(providerName, eventId, asOf);
    const applied = await applyTransition(order, target, eventId, providerReference);
    return { ok: true, applied, eventId };
  }

  async function handleFulfillment(
    rawBody: string,
    signature: string | undefined,
    asOf: Date,
  ): Promise<WebhookResult> {
    if (!signature) return { ok: false, code: "invalid_signature" };

    const fulfillment = deps.fulfillment;
    if (!fulfillment) return { ok: false, code: "capability_disabled" };

    const verified = await fulfillment.verifyInboundWebhook(rawBody, signature);
    if (!verified.ok) {
      return { ok: false, code: classifyVerificationFailure(verified.code, rawBody) };
    }

    const update = verified.value;
    const body = parseJsonObject(rawBody);
    // A carrier status update does not always carry its own event id. When it does
    // not, the identity of the event is the state it reports, which is exactly what
    // a redelivery repeats.
    const eventId =
      readString(body, "eventId") ??
      readString(body, "id") ??
      `${update.fulfillmentOrderId}:${update.status}:${update.trackingNumber ?? ""}`;
    const providerName = fulfillment.name;

    if (deps.store.seen(providerName, eventId)) {
      return { ok: true, applied: false, eventId };
    }

    if (!deps.commerceEnabled) {
      return { ok: true, applied: false, eventId };
    }

    const target = FULFILLMENT_STATUS_STATES[update.status];
    if (!target) {
      return { ok: true, applied: false, eventId };
    }

    // The fulfillment order id is the order key. A partner never supplies a payment
    // reference, so no provider confirmation is carried from this surface, which is
    // why a fulfillment event can never reach a paid state.
    const order = await deps.orders.get(update.fulfillmentOrderId);
    if (!order) return { ok: false, code: "unknown_order" };

    deps.store.record(providerName, eventId, asOf);
    const applied = await applyTransition(order, target, eventId, undefined);
    return { ok: true, applied, eventId };
  }

  return { handlePayment, handleFulfillment };
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/**
 * The default event store.
 *
 * The key is composed of the provider name and the event id, so two providers
 * that independently number their events from one cannot suppress each other.
 * A durable store replaces this without changing the handler.
 */
export function createInMemoryWebhookEventStore(): WebhookEventStore {
  const seenAt = new Map<string, Date>();
  const key = (providerName: string, eventId: string): string => `${providerName}:${eventId}`;

  return {
    seen(providerName: string, eventId: string): boolean {
      return seenAt.has(key(providerName, eventId));
    },
    record(providerName: string, eventId: string, at: Date): void {
      seenAt.set(key(providerName, eventId), at);
    },
  };
}
