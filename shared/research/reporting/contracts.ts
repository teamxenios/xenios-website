import { z } from "zod";

const opaqueId = z.string().uuid().transform((value) => value.toLowerCase());
const timestamp = z.string().datetime({ offset: true }).transform((value) => new Date(value).toISOString());

export const reportingEventKinds = [
  "partner_referral_status",
  "supplier_fulfillment_status",
  "inventory_reconciliation_summary",
] as const;

const partnerPayload = z.object({
  partnerReference: opaqueId,
  referralReference: opaqueId,
  status: z.enum(["received", "qualified", "declined", "converted"]),
}).strict();

const supplierPayload = z.object({
  supplierReference: opaqueId,
  fulfillmentReference: opaqueId,
  status: z.enum(["pending", "accepted", "shipped", "delivered", "cancelled"]),
}).strict();

const inventoryPayload = z.object({
  supplierReference: opaqueId,
  reconciliationReference: opaqueId,
  matchedLines: z.number().int().min(0).max(100_000),
  mismatchedLines: z.number().int().min(0).max(100_000),
}).strict();

export const reportingEventSchema = z.discriminatedUnion("kind", [
  z.object({ schemaVersion: z.literal(1), eventId: opaqueId, occurredAt: timestamp, kind: z.literal("partner_referral_status"), payload: partnerPayload }).strict(),
  z.object({ schemaVersion: z.literal(1), eventId: opaqueId, occurredAt: timestamp, kind: z.literal("supplier_fulfillment_status"), payload: supplierPayload }).strict(),
  z.object({ schemaVersion: z.literal(1), eventId: opaqueId, occurredAt: timestamp, kind: z.literal("inventory_reconciliation_summary"), payload: inventoryPayload }).strict(),
]);

export type ReportingEvent = z.infer<typeof reportingEventSchema>;

export type ReportingRow = Readonly<{
  schemaVersion: 1;
  eventId: string;
  occurredAt: string;
  kind: ReportingEvent["kind"];
  referenceA: string;
  referenceB: string;
  status: string;
  matchedLines: number | null;
  mismatchedLines: number | null;
}>;

export function parseReportingEvent(value: unknown): ReportingEvent {
  return reportingEventSchema.parse(value);
}

export function toReportingRow(value: unknown): ReportingRow {
  const event = parseReportingEvent(value);
  if (event.kind === "partner_referral_status") {
    return Object.freeze({ schemaVersion: 1, eventId: event.eventId, occurredAt: event.occurredAt, kind: event.kind, referenceA: event.payload.partnerReference, referenceB: event.payload.referralReference, status: event.payload.status, matchedLines: null, mismatchedLines: null });
  }
  if (event.kind === "supplier_fulfillment_status") {
    return Object.freeze({ schemaVersion: 1, eventId: event.eventId, occurredAt: event.occurredAt, kind: event.kind, referenceA: event.payload.supplierReference, referenceB: event.payload.fulfillmentReference, status: event.payload.status, matchedLines: null, mismatchedLines: null });
  }
  return Object.freeze({ schemaVersion: 1, eventId: event.eventId, occurredAt: event.occurredAt, kind: event.kind, referenceA: event.payload.supplierReference, referenceB: event.payload.reconciliationReference, status: "reconciled", matchedLines: event.payload.matchedLines, mismatchedLines: event.payload.mismatchedLines });
}
