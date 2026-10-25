import { z } from "zod";

export const FULFILLMENT_NOTIFICATION_AUDIENCES = ["customer", "operations"] as const;

export const FULFILLMENT_NOTIFICATION_EVENTS = [
  "shipment_assigned",
  "supplier_acknowledged",
  "shipment_packed",
  "shipment_shipped",
  "shipment_delivered",
  "shipment_delayed",
  "shipment_exception",
  "replacement_created",
  "return_authorized",
  "recall_opened",
] as const;

export const FULFILLMENT_DELAY_CODES = [
  "supplier_processing_delay",
  "carrier_delay",
  "weather_delay",
  "address_issue",
  "unknown_under_review",
] as const;

export const FULFILLMENT_EXCEPTION_CODES = [
  "address_verification_required",
  "carrier_exception",
  "damaged_in_transit",
  "lost_in_transit",
  "temperature_review",
  "documentation_hold",
  "supplier_hold",
  "other_review",
] as const;

export const FULFILLMENT_CARRIER_CODES = [
  "usps",
  "ups",
  "fedex",
  "dhl_express",
] as const;

export type FulfillmentNotificationAudience =
  (typeof FULFILLMENT_NOTIFICATION_AUDIENCES)[number];
export type FulfillmentNotificationEvent =
  (typeof FULFILLMENT_NOTIFICATION_EVENTS)[number];

const canonicalUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "Identifier must be a canonical lowercase UUID.",
  );

const canonicalInstant = z.string().refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}, "Timestamp must be a normalized millisecond UTC instant.");

const publicReference = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Reference contains unsupported characters.");

const trackingReference = z
  .string()
  .min(6)
  .max(64)
  .regex(/^[A-Za-z0-9]+$/, "Tracking reference must be an opaque carrier token.");

const commonShape = {
  schemaVersion: z.literal(1),
  eventId: canonicalUuid,
  occurredAt: canonicalInstant,
  fulfillmentOrderId: canonicalUuid,
  assignmentId: canonicalUuid,
  supplierId: canonicalUuid,
  orderReference: publicReference,
  shipmentReference: publicReference,
} as const;

const noDetailEvent = (eventType: "shipment_assigned" | "supplier_acknowledged" | "shipment_packed") =>
  z.object({ ...commonShape, eventType: z.literal(eventType) }).strict();

const trackedEvent = (eventType: "shipment_shipped" | "shipment_delivered") =>
  z
    .object({
      ...commonShape,
      eventType: z.literal(eventType),
      carrierCode: z.enum(FULFILLMENT_CARRIER_CODES),
      trackingReference,
      expectedDeliveryAt: canonicalInstant.optional(),
    })
    .strict();

export const FulfillmentNotificationInputSchema = z.discriminatedUnion("eventType", [
  noDetailEvent("shipment_assigned"),
  noDetailEvent("supplier_acknowledged"),
  noDetailEvent("shipment_packed"),
  trackedEvent("shipment_shipped"),
  trackedEvent("shipment_delivered"),
  z
    .object({
      ...commonShape,
      eventType: z.literal("shipment_delayed"),
      delayCode: z.enum(FULFILLMENT_DELAY_CODES),
      expectedDeliveryAt: canonicalInstant.optional(),
    })
    .strict(),
  z
    .object({
      ...commonShape,
      eventType: z.literal("shipment_exception"),
      exceptionCode: z.enum(FULFILLMENT_EXCEPTION_CODES),
    })
    .strict(),
  z
    .object({
      ...commonShape,
      eventType: z.literal("replacement_created"),
      replacementReference: publicReference,
    })
    .strict(),
  z
    .object({
      ...commonShape,
      eventType: z.literal("return_authorized"),
      returnReference: publicReference,
    })
    .strict(),
  z
    .object({
      ...commonShape,
      eventType: z.literal("recall_opened"),
      recallReference: publicReference,
    })
    .strict(),
]);

export type FulfillmentNotificationInput = z.infer<
  typeof FulfillmentNotificationInputSchema
>;

const audienceSchema = z.enum(FULFILLMENT_NOTIFICATION_AUDIENCES);

const TEMPLATE_KEYS = {
  customer: {
    shipment_assigned: "fulfillment_customer_shipment_assigned",
    supplier_acknowledged: "fulfillment_customer_supplier_acknowledged",
    shipment_packed: "fulfillment_customer_shipment_packed",
    shipment_shipped: "fulfillment_customer_shipment_shipped",
    shipment_delivered: "fulfillment_customer_shipment_delivered",
    shipment_delayed: "fulfillment_customer_shipment_delayed",
    shipment_exception: "fulfillment_customer_shipment_exception",
    replacement_created: "fulfillment_customer_replacement_created",
    return_authorized: "fulfillment_customer_return_authorized",
    recall_opened: "fulfillment_customer_recall_opened",
  },
  operations: {
    shipment_assigned: "fulfillment_ops_shipment_assigned",
    supplier_acknowledged: "fulfillment_ops_supplier_acknowledged",
    shipment_packed: "fulfillment_ops_shipment_packed",
    shipment_shipped: "fulfillment_ops_shipment_shipped",
    shipment_delivered: "fulfillment_ops_shipment_delivered",
    shipment_delayed: "fulfillment_ops_shipment_delayed",
    shipment_exception: "fulfillment_ops_shipment_exception",
    replacement_created: "fulfillment_ops_replacement_created",
    return_authorized: "fulfillment_ops_return_authorized",
    recall_opened: "fulfillment_ops_recall_opened",
  },
} as const satisfies Record<
  FulfillmentNotificationAudience,
  Record<FulfillmentNotificationEvent, string>
>;

const STATUS_CODES = {
  shipment_assigned: "preparing",
  supplier_acknowledged: "preparing",
  shipment_packed: "packed",
  shipment_shipped: "shipped",
  shipment_delivered: "delivered",
  shipment_delayed: "delayed",
  shipment_exception: "exception",
  replacement_created: "replacement_pending",
  return_authorized: "return_authorized",
  recall_opened: "recall_notice",
} as const satisfies Record<FulfillmentNotificationEvent, string>;

export interface FulfillmentNotificationEnvelope {
  schemaVersion: 1;
  eventKey: string;
  eventId: string;
  eventType: FulfillmentNotificationEvent;
  audience: FulfillmentNotificationAudience;
  templateKey: string;
  occurredAt: string;
  payload: Readonly<Record<string, string>>;
}

function eventPayload(input: FulfillmentNotificationInput): Record<string, string> {
  switch (input.eventType) {
    case "shipment_shipped":
    case "shipment_delivered":
      return {
        carrierCode: input.carrierCode,
        trackingReference: input.trackingReference,
        ...(input.expectedDeliveryAt
          ? { expectedDeliveryAt: input.expectedDeliveryAt }
          : {}),
      };
    case "shipment_delayed":
      return {
        reasonCode: input.delayCode,
        ...(input.expectedDeliveryAt
          ? { expectedDeliveryAt: input.expectedDeliveryAt }
          : {}),
      };
    case "shipment_exception":
      return { reasonCode: input.exceptionCode };
    case "replacement_created":
      return { replacementReference: input.replacementReference };
    case "return_authorized":
      return { returnReference: input.returnReference };
    case "recall_opened":
      return { recallReference: input.recallReference };
    default:
      return {};
  }
}

/**
 * Creates a persistence- and provider-independent notification envelope.
 *
 * The input schema is strict: rich order, customer, clinical, payment, margin,
 * affiliate, address, and free-text objects are refused rather than silently
 * carried into an outbox. Recipient lookup and delivery remain separate seams.
 */
export function buildFulfillmentNotification(
  rawInput: unknown,
  rawAudience: unknown,
): FulfillmentNotificationEnvelope {
  const input = FulfillmentNotificationInputSchema.parse(rawInput);
  const audience = audienceSchema.parse(rawAudience);
  const payload: Record<string, string> = {
    orderReference: input.orderReference,
    shipmentReference: input.shipmentReference,
    statusCode: STATUS_CODES[input.eventType],
    occurredAt: input.occurredAt,
    ...eventPayload(input),
  };

  if (audience === "operations") {
    payload.fulfillmentOrderId = input.fulfillmentOrderId;
    payload.assignmentId = input.assignmentId;
    payload.supplierId = input.supplierId;
  }

  return {
    schemaVersion: 1,
    eventKey: `fulfillment:${input.eventId}:${audience}`,
    eventId: input.eventId,
    eventType: input.eventType,
    audience,
    templateKey: TEMPLATE_KEYS[audience][input.eventType],
    occurredAt: input.occurredAt,
    payload,
  };
}
