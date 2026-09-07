import { ORDER_STATES } from "@shared/research/commerce";
import type { OrderSummaryDto } from "@shared/research/commerce-api";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const cents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === "string"
  && value.length > 0 && value.length <= 160 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const nullableText = (value: unknown) => value === null || text(value);

/** Validate only the frozen order-list contract; never infer a missing row or a permission. */
export function readMemberOrders(value: unknown): OrderSummaryDto[] | null {
  if (!object(value) || value.ok !== true || !Array.isArray(value.orders)) return null;
  const ids = new Set<string>();
  const orders: OrderSummaryDto[] = [];
  for (const row of value.orders) {
    if (!object(row) || typeof row.orderId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(row.orderId) || ids.has(row.orderId)
      || typeof row.state !== "string" || !ORDER_STATES.some((state) => state === row.state)
      || typeof row.placedAt !== "string" || row.placedAt.length > 64
      || !/^\d{4}-\d{2}-\d{2}T/.test(row.placedAt) || !Number.isFinite(Date.parse(row.placedAt))
      || !cents(row.totalCents) || !Array.isArray(row.shipments)
      || (row.recordKind !== undefined && row.recordKind !== "order" && row.recordKind !== "request")
      || (row.shipmentsSource !== undefined && row.shipmentsSource !== "connected" && row.shipmentsSource !== "unavailable")) return null;
    if (row.payment !== undefined && row.payment !== null
      && (!object(row.payment) || !cents(row.payment.amountDueCents) || row.payment.currency !== "USD"
        || (row.payment.amountCapturedCents !== null && !cents(row.payment.amountCapturedCents))
        || (row.payment.amountRefundedCents !== null && !cents(row.payment.amountRefundedCents)))) return null;
    if (!row.shipments.every((shipment: unknown) => object(shipment)
      && (shipment.owner === "mitch" || shipment.owner === "xenios") && text(shipment.status)
      && nullableText(shipment.trackingNumber) && nullableText(shipment.carrier))) return null;
    ids.add(row.orderId);
    // Project the validated fields, excluding unrelated response data from this view.
    orders.push({
      orderId: row.orderId, state: row.state as OrderSummaryDto["state"], placedAt: row.placedAt,
      totalCents: row.totalCents,
      shipments: row.shipments.map((shipment) => ({
        owner: shipment.owner, status: shipment.status,
        trackingNumber: shipment.trackingNumber, carrier: shipment.carrier,
      })),
      ...(row.recordKind !== undefined ? { recordKind: row.recordKind } : {}),
      ...(row.shipmentsSource !== undefined ? { shipmentsSource: row.shipmentsSource } : {}),
      ...(row.payment !== undefined ? { payment: row.payment === null ? null : {
        amountDueCents: row.payment.amountDueCents as number,
        amountCapturedCents: row.payment.amountCapturedCents as number | null,
        amountRefundedCents: row.payment.amountRefundedCents as number | null,
        currency: "USD" as const,
      } } : {}),
    });
  }
  return orders;
}

export function memberShipmentSummary(order: OrderSummaryDto): string {
  if (order.shipmentsSource !== "connected") return "Shipment details unavailable";
  if (order.shipments.length === 0) return "No shipment records returned";
  return order.shipments.map((shipment) => {
    const owner = shipment.owner === "mitch" ? "Mitch" : "Xenios";
    const tracking = shipment.trackingNumber ? `, tracking ${shipment.trackingNumber}` : "";
    return `${owner}: ${shipment.status}${tracking}`;
  }).join(" · ");
}
