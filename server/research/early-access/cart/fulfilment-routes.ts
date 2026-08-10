/**
 * THE NAMED-ADMIN FULFILMENT DOOR, and the only application path that writes a
 * cart shipment fact.
 *
 * Every write goes through M62's `research_early_access_record_cart_fulfilment_event`
 * via `SupabaseEarlyAccessShipmentEventStore`. There is deliberately no second
 * mutation path: the application never touches
 * `research_early_access_cart_fulfilment_events` directly (it could not, the
 * table is revoked from `service_role`), and the RPC owns every refusal:
 * unknown checkout, superseded checkout, unverified payment, unknown child
 * order, and an unknown or already-superseded correction target.
 *
 * APPEND-ONLY, ENFORCED BELOW THIS FILE. A correction does not rewrite the fact
 * it corrects; it names it in `supersedesEventId`, and the database's own
 * `research_ea_fulfilment_correction_shape` constraint refuses a correction
 * without one and a shipment WITH one. This route therefore validates the same
 * rule in the request rather than restating it: a caller who omits the target
 * on a correction is refused here with a typed code instead of an opaque
 * database error, and a caller who supplies one on a shipment is refused too.
 *
 * WHAT MAY TRAVEL IN THE METADATA. Tracking references and a carrier label, and
 * nothing else. The metadata column is free-form jsonb, which is exactly why
 * this door narrows it: a shipment event is read back into a CUSTOMER-facing
 * projection, so an operator's free text has no business being in it.
 */

import { isCartCheckoutNumber } from "./model";
import type { CartAdminRequest } from "./admin-routes";
import type { CartResponsePort } from "./routes";
import type {
  EarlyAccessFulfilmentEventCommand,
  EarlyAccessFulfilmentEventCommit,
  EarlyAccessFulfilmentEventType,
} from "./supabase-shipment-events";

const EVENT_TYPES = Object.freeze([
  "shipment_shipped",
  "tracking_added",
  "tracking_corrected",
  "shipment_voided",
] as const);

/** Corrections and voids MUST name the fact they supersede. Shipments and the
 * first tracking record MUST NOT: they are original facts. */
const CORRECTIONS = Object.freeze(["tracking_corrected", "shipment_voided"] as const);

const SAFE_TRACKING = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,239}$/;
const SAFE_CARRIER = /^[A-Za-z0-9][A-Za-z0-9 .&'/-]{1,79}$/;
const SAFE_ORDER = /^XEA-CART-[A-Z0-9-]{8,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EarlyAccessFulfilmentEventWriter {
  record(
    command: EarlyAccessFulfilmentEventCommand,
    actorId: string,
  ): Promise<EarlyAccessFulfilmentEventCommit>;
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isEventType(value: unknown): value is EarlyAccessFulfilmentEventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

function trackingOf(value: unknown): readonly string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !SAFE_TRACKING.test(entry.trim())) return null;
    out.push(entry.trim());
  }
  return out;
}

/**
 * A named admin records one shipment fact or one correction to a prior one.
 * Nothing here settles a payment, releases a supplier or issues a receipt: the
 * writer holds no port that could, and the RPC refuses the event outright if
 * the payment is not already verified.
 */
export function createEarlyAccessCartFulfilmentEventAdminRoute(
  deps: Readonly<{ events: EarlyAccessFulfilmentEventWriter }>,
) {
  return async (request: CartAdminRequest, response: CartResponsePort): Promise<void> => {
    response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
    response.setHeader?.("Pragma", "no-cache");
    response.setHeader?.("X-Content-Type-Options", "nosniff");

    if (request.actor === null || request.actor === undefined) {
      response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      return;
    }
    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const body = object(request.body);
    if (body === null) {
      response.status(400).json({ ok: false, code: "REQUEST_INVALID" });
      return;
    }
    const eventType = body.eventType;
    const orderNumber = typeof body.orderNumber === "string" ? body.orderNumber.trim() : "";
    if (!isEventType(eventType) || !SAFE_ORDER.test(orderNumber)) {
      response.status(400).json({ ok: false, code: "REQUEST_INVALID" });
      return;
    }

    const correction = (CORRECTIONS as readonly string[]).includes(eventType);
    const supersedes =
      typeof body.supersedesEventId === "string" ? body.supersedesEventId.trim() : null;
    if (correction ? supersedes === null || !UUID.test(supersedes) : supersedes !== null) {
      response.status(400).json({ ok: false, code: "SUPERSEDES_INVALID" });
      return;
    }

    const tracking = trackingOf(body.tracking);
    const carrier = body.carrierLabel;
    if (
      tracking === null ||
      (carrier !== undefined && (typeof carrier !== "string" || !SAFE_CARRIER.test(carrier.trim())))
    ) {
      response.status(400).json({ ok: false, code: "REQUEST_INVALID" });
      return;
    }

    const result = await deps.events.record(
      Object.freeze({
        cartCheckoutNumber: request.cartCheckoutNumber,
        orderNumber,
        eventType,
        supersedesEventId: correction ? supersedes : null,
        // Rebuilt from validated reads, never spread from the body, so an
        // unexpected key has no field to travel in.
        metadata: Object.freeze({
          tracking: [...tracking],
          ...(typeof carrier === "string" ? { carrierLabel: carrier.trim() } : {}),
        }),
      }),
      // The acting admin comes from what the guard put on the request, never
      // from the body. An audit trail that records the name the caller typed is
      // not an audit trail.
      request.actor.id,
    );

    if (result.recorded) {
      response.status(201).json({ ok: true, recorded: true, eventId: result.eventId });
      return;
    }
    const status =
      result.reason === "checkout_unknown" || result.reason === "child_order_unknown"
        ? 404
        : 409;
    response.status(status).json({ ok: false, code: result.reason, recorded: false });
  };
}
