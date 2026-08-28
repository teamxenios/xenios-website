// xenios research: inbound provider webhook handling.
//
// This is the most attackable surface in the commerce lane, because it is the one
// place where an unauthenticated stranger can speak to the order state machine.
// Three properties are enforced by the contracts in this file, not by
// convention:
//
//   1. Signature verification runs before anything else. An unsigned or wrongly
//      signed body never reaches the replay store, never reaches an order, and is
//      never recorded as seen, so a forged body cannot burn a real event id and
//      suppress the genuine event that follows it.
//   2. Replay identity is bound to the exact signed payload, so reusing an event
//      id for different bytes is a conflict rather than a duplicate.
//   3. A recognized event can move an order only through one storage operation
//      that atomically commits the inbox claim and the order effect. Separate
//      `seen`, `record`, and `save` calls are deliberately never composed into a
//      claim. Without that atomic capability the handler fails closed.
//
// No state is ever assigned. Every advance goes through `transitionOrder` with the
// provider reference carried by the verified event, so a webhook cannot move an
// order to a paid state on its own say-so.
//
// Nothing here logs the raw body, the signature, or any payload field. Ids and
// event types only.

import crypto from "crypto";

import { transitionOrder, type OrderState } from "@shared/research/commerce";
import type { PaymentProvider } from "../providers/payment";
import type { FulfillmentProvider } from "../providers/fulfillment";

/**
 * The shipment fields a VERIFIED fulfillment event carries. Glue only: the
 * handler attaches this to the order it is about to save, and the composed
 * order store decides how it lands on the durable shipment records. It is set
 * exclusively from a signature-verified FulfillmentStatusUpdate, never from an
 * unverified body.
 */
export interface WebhookShipmentUpdate {
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
}

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
  /**
   * Present only while an APPLYING fulfillment event is being saved: the
   * status and tracking the partner reported, for the store to project onto
   * the order's shipment records. Payment events never set it.
   */
  shipmentUpdate?: WebhookShipmentUpdate;
}

/**
 * Legacy replay observation. The two calls are inherently non-atomic with an
 * order save and therefore never authorize a webhook effect. Retained only for
 * compatibility and diagnostics while the durable atomic seam is implemented.
 */
export interface WebhookEventStore {
  seen(providerName: string, eventId: string): boolean | Promise<boolean>;
  record(providerName: string, eventId: string, at: Date, eventType?: string): void | Promise<void>;
}

/**
 * Identity and durable evidence for one signature-verified provider event.
 * `payloadSha256` binds the provider event id to the exact verified bytes; it is
 * not a business-field fingerprint and must be compared byte-for-byte.
 */
export interface WebhookAtomicEvent {
  providerName: string;
  eventId: string;
  eventType: string;
  payloadSha256: string;
  receivedAt: Date;
  /** Null only for a verified event type that intentionally has no order effect. */
  orderId: string | null;
}

/** A pure decision made while the atomic store owns the event and order rows. */
export type WebhookAtomicDecision =
  | { kind: "apply"; order: WebhookOrder }
  | { kind: "acknowledge" }
  | { kind: "retry"; code: "unknown_order" };

export type WebhookAtomicApplyResult =
  | { outcome: "applied" }
  | { outcome: "acknowledged" }
  | { outcome: "duplicate" }
  | { outcome: "conflict" }
  | { outcome: "unknown_order" };

/**
 * The only persistence authority a webhook handler may use for an order effect.
 *
 * An implementation MUST serialize the `(providerName,eventId)` inbox key and
 * the addressed order, compare an existing claim's payload digest, run `decide`
 * against the order read inside that same transaction, and commit the inbox row
 * plus any returned order together. A throw or `retry` decision MUST commit
 * neither. A two-call `seen`/`record` adapter does not satisfy this interface.
 */
export interface WebhookAtomicApplyStore {
  claimAndApply(
    event: WebhookAtomicEvent,
    decide: (order: WebhookOrder | undefined) => WebhookAtomicDecision,
  ): Promise<WebhookAtomicApplyResult>;
}

export interface WebhookOrderStore {
  get(orderId: string): Promise<WebhookOrder | undefined>;
  save(order: WebhookOrder): Promise<void>;
}

export interface WebhookDeps {
  /**
   * Legacy observation/replay seam. Retained for source compatibility only;
   * the handler never uses it to authorize or deduplicate an order effect.
   */
  store: WebhookEventStore;
  payment: PaymentProvider;
  /** Absent means the fulfillment capability is not wired. Absent is not an outage. */
  fulfillment?: FulfillmentProvider;
  orders: WebhookOrderStore;
  /** Absent until a real inbox+order transaction is wired; absence fails closed. */
  atomic?: WebhookAtomicApplyStore;
  commerceEnabled: boolean;
}

export type WebhookDenialCode =
  | "invalid_signature"
  | "malformed"
  | "duplicate"
  | "event_conflict"
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

function payloadSha256(rawBody: string): string {
  return crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export function createWebhookHandler(deps: WebhookDeps): WebhookHandler {
  const combinedOrderStore = deps.orders as WebhookOrderStore &
    Partial<WebhookAtomicApplyStore>;
  const atomic =
    deps.atomic ??
    (typeof combinedOrderStore.claimAndApply === "function"
      ? (combinedOrderStore as WebhookAtomicApplyStore)
      : undefined);

  /**
   * Computes an order transition without performing I/O. The atomic store calls
   * this while it owns both the inbox key and the addressed order row.
   *
   * The event id is passed as the idempotency key on both sides of the
   * transition. A denied transition is acknowledged as a durable no-op; an
   * unknown order is a retry decision and therefore claims no inbox row.
   */
  function decideTransition(
    order: WebhookOrder | undefined,
    to: OrderState,
    eventId: string,
    providerConfirmation: string | undefined,
    shipmentUpdate?: WebhookShipmentUpdate,
  ): WebhookAtomicDecision {
    if (!order) return { kind: "retry", code: "unknown_order" };

    const result = transitionOrder({
      from: order.state,
      to,
      actor: "provider_webhook",
      providerConfirmation,
      idempotencyKey: eventId,
      lastAppliedIdempotencyKey: order.lastWebhookEventId,
    });
    if (!result.ok || result.idempotent) return { kind: "acknowledge" };

    const next: WebhookOrder = {
      ...order,
      state: result.state,
      lastWebhookEventId: eventId,
    };
    if (result.state === "payment_captured") next.captured = true;
    if (providerConfirmation && !next.paymentReference) {
      next.paymentReference = providerConfirmation;
    }
    if (shipmentUpdate) next.shipmentUpdate = { ...shipmentUpdate };
    return { kind: "apply", order: next };
  }

  async function atomicallyApply(
    event: WebhookAtomicEvent,
    decide: (order: WebhookOrder | undefined) => WebhookAtomicDecision,
  ): Promise<WebhookResult> {
    // The legacy event and order stores are deliberately not composed here:
    // separate durable calls leave an unavoidable crash/race window. Until a
    // transaction-capable adapter is wired, verified events fail closed.
    if (!atomic) return { ok: false, code: "capability_disabled" };

    const result = await atomic.claimAndApply(event, decide);
    switch (result.outcome) {
      case "applied":
        return { ok: true, applied: true, eventId: event.eventId };
      case "acknowledged":
      case "duplicate":
        return { ok: true, applied: false, eventId: event.eventId };
      case "conflict":
        return { ok: false, code: "event_conflict" };
      case "unknown_order":
        return { ok: false, code: "unknown_order" };
    }
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

    // A disabled capability acknowledges and claims nothing. A redelivery after
    // enablement therefore remains eligible for its first atomic application.
    if (!deps.commerceEnabled) {
      return { ok: true, applied: false, eventId };
    }

    const target = PAYMENT_EVENT_STATES[eventType];
    if (!target) {
      return atomicallyApply(
        {
          providerName,
          eventId,
          eventType,
          payloadSha256: payloadSha256(rawBody),
          receivedAt: asOf,
          orderId: null,
        },
        () => ({ kind: "acknowledge" }),
      );
    }

    const body = parseJsonObject(rawBody);
    const orderId = readString(body, "orderId");
    if (!orderId) return { ok: false, code: "malformed" };

    return atomicallyApply(
      {
        providerName,
        eventId,
        eventType,
        payloadSha256: payloadSha256(rawBody),
        receivedAt: asOf,
        orderId,
      },
      (order) => decideTransition(order, target, eventId, providerReference),
    );
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
    if (!body) return { ok: false, code: "malformed" };
    // A carrier status update does not always carry its own event id. When it does
    // not, the identity of the event is the state it reports, which is exactly what
    // a redelivery repeats.
    const eventId =
      readString(body, "eventId") ??
      readString(body, "id") ??
      `${update.fulfillmentOrderId}:${update.status}:${update.trackingNumber ?? ""}`;
    const providerName = fulfillment.name;

    if (!deps.commerceEnabled) {
      return { ok: true, applied: false, eventId };
    }

    const target = FULFILLMENT_STATUS_STATES[update.status];
    if (!target) {
      return atomicallyApply(
        {
          providerName,
          eventId,
          eventType: update.status,
          payloadSha256: payloadSha256(rawBody),
          receivedAt: asOf,
          orderId: null,
        },
        () => ({ kind: "acknowledge" }),
      );
    }

    // The fulfillment order id is the order key. A partner never supplies a payment
    // reference, so no provider confirmation is carried from this surface, which is
    // why a fulfillment event can never reach a paid state.
    const shipmentUpdate: WebhookShipmentUpdate = {
      status: update.status,
      trackingNumber: update.trackingNumber ?? null,
      carrier: update.carrier ?? null,
    };

    return atomicallyApply(
      {
        providerName,
        eventId,
        eventType: update.status,
        payloadSha256: payloadSha256(rawBody),
        receivedAt: asOf,
        orderId: update.fulfillmentOrderId,
      },
      (order) => decideTransition(order, target, eventId, undefined, shipmentUpdate),
    );
  }

  return { handlePayment, handleFulfillment };
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

/**
 * The legacy in-memory event observer.
 *
 * The key is composed of the provider name and the event id, so two providers
 * that independently number their events from one cannot suppress each other.
 * This store is not consulted by the handler's atomic effect path.
 */
export function createInMemoryWebhookEventStore(): WebhookEventStore {
  const seenAt = new Map<string, Date>();
  const key = (providerName: string, eventId: string): string =>
    JSON.stringify([providerName, eventId]);

  return {
    seen(providerName: string, eventId: string): boolean {
      return seenAt.has(key(providerName, eventId));
    },
    record(providerName: string, eventId: string, at: Date): void {
      seenAt.set(key(providerName, eventId), at);
    },
  };
}

/**
 * Transactional in-memory reference for tests and local composition. It owns
 * both order rows and inbox claims, serializes every operation, and publishes
 * neither write until the decision has completed and passed ownership checks.
 */
export interface InMemoryWebhookAtomicStore
  extends WebhookAtomicApplyStore,
    WebhookOrderStore {}

export function createInMemoryWebhookAtomicStore(
  seed: readonly WebhookOrder[] = [],
): InMemoryWebhookAtomicStore {
  const orders = new Map<string, WebhookOrder>();
  const inbox = new Map<string, string>();
  let tail: Promise<void> = Promise.resolve();

  const clone = (order: WebhookOrder): WebhookOrder => ({
    ...order,
    ...(order.shipmentUpdate ? { shipmentUpdate: { ...order.shipmentUpdate } } : {}),
  });
  const inboxKey = (event: WebhookAtomicEvent): string =>
    JSON.stringify([event.providerName, event.eventId]);

  for (const order of seed) orders.set(order.orderId, clone(order));

  async function exclusively<T>(work: () => T): Promise<T> {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return work();
    } finally {
      release();
    }
  }

  return {
    async claimAndApply(event, decide) {
      return exclusively((): WebhookAtomicApplyResult => {
        const key = inboxKey(event);
        const existingDigest = inbox.get(key);
        if (existingDigest !== undefined) {
          return existingDigest === event.payloadSha256
            ? { outcome: "duplicate" }
            : { outcome: "conflict" };
        }

        const current = event.orderId === null ? undefined : orders.get(event.orderId);
        const decision = decide(current ? clone(current) : undefined);
        if (decision.kind === "retry") return { outcome: "unknown_order" };

        if (decision.kind === "apply") {
          if (event.orderId === null || decision.order.orderId !== event.orderId) {
            throw new Error("atomic webhook decision attempted to write a different order");
          }
          // These adjacent writes are one synchronous publication under the
          // in-memory mutex. A durable implementation must use a DB transaction.
          inbox.set(key, event.payloadSha256);
          orders.set(event.orderId, clone(decision.order));
          return { outcome: "applied" };
        }

        inbox.set(key, event.payloadSha256);
        return { outcome: "acknowledged" };
      });
    },

    async get(orderId) {
      const order = orders.get(orderId);
      return order ? clone(order) : undefined;
    },

    async save(order) {
      await exclusively(() => {
        orders.set(order.orderId, clone(order));
      });
    },
  };
}
