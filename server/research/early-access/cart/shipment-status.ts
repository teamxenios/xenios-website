import {
  earlyAccessIsOverdue,
  type EarlyAccessFulfilmentView,
  type EarlyAccessOrderStage,
} from "@shared/research/early-access-hardening";

export type EarlyAccessShipmentEvent = Readonly<{
  eventId: string;
  cartCheckoutNumber: string;
  orderNumber: string;
  kind:
    | "shipment_shipped"
    | "tracking_added"
    | "tracking_corrected"
    | "shipment_voided";
  tracking: readonly string[];
  recordedAt: string;
  recordedBy: string;
  /** Required for corrections; null for the original shipped fact. */
  supersedesEventId: string | null;
}>;

export type EarlyAccessShipmentLine = Readonly<{
  orderNumber: string;
  quantity: number;
}>;

export type ShipmentProjectionFailure =
  | "event_invalid"
  | "order_unknown"
  | "duplicate_event_id"
  | "correction_target_missing"
  | "correction_target_wrong_order"
  | "correction_target_wrong_kind";

export type ShipmentProjectionResult =
  | Readonly<{ ok: true; fulfilment: EarlyAccessFulfilmentView }>
  | Readonly<{ ok: false; reason: ShipmentProjectionFailure }>;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9@._:/+-]{2,239}$/;

function exactInstant(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function stageFor(shipped: number, total: number, paymentVerified: boolean): EarlyAccessOrderStage {
  if (total > 0 && shipped === total) return "shipped";
  if (shipped > 0) return "partially_shipped";
  return paymentVerified ? "processing" : "checkout_reserved";
}

/**
 * Append-only shipment projection. A corrected tracking value never rewrites
 * history: it names the prior event it supersedes, and current state follows
 * the latest valid event for that child order.
 */
export function projectEarlyAccessShipmentEvents(input: Readonly<{
  cartCheckoutNumber: string;
  lines: readonly EarlyAccessShipmentLine[];
  events: readonly EarlyAccessShipmentEvent[];
  paymentVerifiedAt: string | null;
  shipByAt: string | null;
  nowIso: string;
}>): ShipmentProjectionResult {
  const lineByOrder = new Map(input.lines.map((line) => [line.orderNumber, line] as const));
  const eventById = new Map<string, EarlyAccessShipmentEvent>();
  const superseded = new Set<string>();

  for (const event of input.events) {
    if (
      !SAFE_ID.test(event.eventId) ||
      !SAFE_ID.test(event.cartCheckoutNumber) ||
      !SAFE_ID.test(event.orderNumber) ||
      !SAFE_ID.test(event.recordedBy) ||
      !exactInstant(event.recordedAt) ||
      event.cartCheckoutNumber !== input.cartCheckoutNumber ||
      event.tracking.some((value) => value.trim() === "" || value.length > 240)
    ) {
      return { ok: false, reason: "event_invalid" };
    }
    if (!lineByOrder.has(event.orderNumber)) return { ok: false, reason: "order_unknown" };
    if (eventById.has(event.eventId)) return { ok: false, reason: "duplicate_event_id" };

    if (event.kind === "shipment_shipped" || event.kind === "tracking_added") {
      if (event.supersedesEventId !== null) return { ok: false, reason: "event_invalid" };
    } else {
      if (event.supersedesEventId === null) {
        return { ok: false, reason: "correction_target_missing" };
      }
      const target = eventById.get(event.supersedesEventId);
      if (!target) return { ok: false, reason: "correction_target_missing" };
      if (target.orderNumber !== event.orderNumber) {
        return { ok: false, reason: "correction_target_wrong_order" };
      }
      const correctTarget =
        (event.kind === "tracking_corrected" &&
          (target.kind === "tracking_added" || target.kind === "tracking_corrected")) ||
        (event.kind === "shipment_voided" && target.kind === "shipment_shipped");
      if (!correctTarget || superseded.has(target.eventId)) {
        return { ok: false, reason: "correction_target_wrong_kind" };
      }
      superseded.add(target.eventId);
    }
    eventById.set(event.eventId, event);
  }

  const lines = Object.freeze(
    input.lines.map((line) => {
      const active = input.events.filter(
        (event) => event.orderNumber === line.orderNumber && !superseded.has(event.eventId),
      );
      const shipped = [...active].reverse().find((event) => event.kind === "shipment_shipped");
      const tracking = [...active].reverse().find(
        (event) => event.kind === "tracking_added" || event.kind === "tracking_corrected",
      );
      return Object.freeze({
        orderNumber: line.orderNumber,
        quantity: line.quantity,
        shippedAt: shipped?.recordedAt ?? null,
        tracking: Object.freeze([...(tracking?.tracking ?? [])]),
      });
    }),
  );
  const stage = stageFor(
    lines.filter((line) => line.shippedAt !== null).length,
    lines.length,
    input.paymentVerifiedAt !== null,
  );
  return Object.freeze({
    ok: true as const,
    fulfilment: Object.freeze({
      stage,
      paymentVerifiedAt: input.paymentVerifiedAt,
      shipByAt: input.shipByAt,
      timezone: "UTC" as const,
      overdue: earlyAccessIsOverdue({ stage, shipByAt: input.shipByAt, nowIso: input.nowIso }),
      lines,
    }),
  });
}
