import {
  isCustomerAccountOrderReference, ORDER_FULFILLMENT_DISPLAY_STATES,
  ORDER_HISTORY_SOURCE_KEYS, ORDER_PAYMENT_DISPLAY_STATES, type OrderSummaryDto,
} from "@shared/research/customer-account/contract";
import { safeExternalUrl } from "./format";

type OrderLookup = { kind: "record"; record: OrderSummaryDto }
  | { kind: "ambiguous" } | { kind: "unavailable" } | { kind: "absent"; definitive: boolean };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const textOrNull = (value: unknown) => value === null || typeof value === "string";

function readableOrder(value: unknown): value is OrderSummaryDto {
  if (!object(value)) return false;
  return isCustomerAccountOrderReference(value.reference)
    && ["order", "request", "unknown"].includes(value.recordKind as string)
    && typeof value.placedAt === "string"
    && ["available", "unavailable"].includes(value.detailAvailability as string)
    && textOrNull(value.itemLabel) && textOrNull(value.variantLabel)
    && (value.quantity === null || (typeof value.quantity === "number" && Number.isFinite(value.quantity)))
    && (ORDER_PAYMENT_DISPLAY_STATES as readonly unknown[]).includes(value.paymentState)
    && (ORDER_FULFILLMENT_DISPLAY_STATES as readonly unknown[]).includes(value.fulfillmentState)
    && textOrNull(value.trackingUrl) && typeof value.lotCoaAvailable === "boolean";
}

/** Lookup only within the canonical server-returned account projection. */
export function resolveAccountOrder(data: unknown, reference: string): OrderLookup {
  if (!object(data) || !Array.isArray(data.research) || !data.research.every(readableOrder)) return { kind: "unavailable" };
  const rows: OrderSummaryDto[] = data.research;
  if (!isCustomerAccountOrderReference(reference)) return { kind: "absent", definitive: false };
  const matches = rows.filter(row => row.reference === reference);
  if (matches.length > 1) return { kind: "ambiguous" };
  if (matches.length === 1) return { kind: "record", record: matches[0] };
  const history = data.history;
  const definitive = object(history) && history.availability === "complete"
    && typeof history.authoritativeRecordCount === "number" && Number.isSafeInteger(history.authoritativeRecordCount)
    && history.authoritativeRecordCount === rows.length
    && new Set(rows.map(row => row.reference)).size === rows.length
    && object(history.sources) && ORDER_HISTORY_SOURCE_KEYS.every(key => {
      const source = (history.sources as Record<string, unknown>)[key];
      return object(source) && source.connected === true && source.complete === true;
    });
  return { kind: "absent", definitive };
}

const PAYMENT_GUIDANCE: Record<OrderSummaryDto["paymentState"], string> = {
  unpaid: "This record reports unpaid. This page does not start or authorize a payment; ask account support to confirm the next step.",
  paid: "Payment is recorded. It does not establish shipment, delivery, product eligibility, or Care approval.",
  partially_refunded: "A partial refund is recorded. Settlement timing and any remaining balance are not established by this page.",
  refunded: "A refund is recorded. Settlement timing is not available here, and fulfillment remains a separate fact.",
  unknown: "Payment status is unavailable. Neither the reference format nor fulfillment status establishes payment.",
};
const FULFILLMENT_GUIDANCE: Record<OrderSummaryDto["fulfillmentState"], { title: string; detail: string }> = {
  unfulfilled: { title: "Fulfillment not completed", detail: "No fulfillment completion is reported for this record. A dispatch date or delivery estimate is not available here." },
  processing: { title: "Processing reported", detail: "Processing does not confirm dispatch or delivery. No dispatch date or delivery estimate is provided by this record." },
  shipped: { title: "Shipment reported", detail: "Shipment is recorded separately from payment. Use the recorded tracking link when available; this page does not establish a delivery date." },
  delivered: { title: "Delivery reported", detail: "The record reports delivery. If you have not received the shipment or need help, ask account support to review it." },
  cancelled: { title: "Cancellation reported", detail: "Cancellation does not establish whether a payment or refund occurred. Review the separate payment status and contact support with questions." },
  exception: { title: "Fulfillment needs review", detail: "An exception is reported. Ask account support to review the record; no dispatch or delivery promise can be made here." },
  unknown: { title: "Fulfillment status unavailable", detail: "No fulfillment conclusion or delivery estimate can be confirmed from this record. Ask account support to review the available evidence." },
};

export function accountOrderGuidance(record: OrderSummaryDto) {
  const fulfillment = FULFILLMENT_GUIDANCE[record.fulfillmentState];
  return {
    payment: PAYMENT_GUIDANCE[record.paymentState],
    fulfillment,
    // A URL alone does not promote an unknown/processing state to a shipment.
    trackingUrl: record.fulfillmentState === "shipped" || record.fulfillmentState === "delivered"
      ? safeExternalUrl(record.trackingUrl) : null,
  };
}
