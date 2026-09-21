import { ASSISTED_ORDER_MAX_LINES, assistedOrderStatuses } from "@shared/research/assisted-order/contract";
import type { AssistedOrderHistoryRequest } from "@shared/research/assisted-order/member-history";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, limit = 500): value is string => typeof value === "string"
  && value.length > 0 && value.length <= limit && value.trim() === value
  && !/[\u0000-\u001f\u007f]/.test(value);
const cents = (value: unknown): value is number | null => value === null
  || typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown): value is string => text(value, 64)
  && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export type AssistedRequestHistory = Readonly<{
  requests: readonly AssistedOrderHistoryRequest[];
  source: Readonly<{ connected: boolean; complete: boolean }>;
}>;

/** Missing or malformed evidence is unavailable, not a verified empty history. */
export function readAssistedRequestHistory(rows: unknown, source: unknown): AssistedRequestHistory | null {
  if (!Array.isArray(rows) || rows.length > 100 || !object(source) || typeof source.connected !== "boolean"
    || typeof source.complete !== "boolean" || source.complete && !source.connected) return null;
  if (!source.connected && rows.length !== 0) return null;
  const ids = new Set<string>();
  const references = new Set<string>();
  const requests: AssistedOrderHistoryRequest[] = [];
  for (const row of rows) {
    if (!object(row) || row.kind !== "assisted_request" || !text(row.requestId, 192)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.requestId) || ids.has(row.requestId)
      || typeof row.publicReference !== "string" || !/^XRR-\d{8}-[0-9A-F]{10}$/.test(row.publicReference)
      || references.has(row.publicReference) || typeof row.status !== "string"
      || !assistedOrderStatuses.some((status) => status === row.status)
      || !date(row.createdAt) || !date(row.updatedAt) || !cents(row.estimatedTotalCents)
      || row.currency !== "USD" || !Array.isArray(row.lines) || row.lines.length < 1 || row.lines.length > ASSISTED_ORDER_MAX_LINES
      || !(row.trackingReference === null || text(row.trackingReference))) return null;
    const lines: AssistedOrderHistoryRequest["lines"][number][] = [];
    for (const line of row.lines) {
      if (!object(line) || !text(line.productName)
        || !(line.specification === null || text(line.specification))
        || typeof line.quantity !== "number" || !Number.isSafeInteger(line.quantity) || line.quantity < 1
        || !cents(line.lineEstimateCents)) return null;
      lines.push({ productName: line.productName, specification: line.specification,
        quantity: line.quantity, lineEstimateCents: line.lineEstimateCents });
    }
    ids.add(row.requestId); references.add(row.publicReference);
    requests.push({ kind: "assisted_request", requestId: row.requestId, publicReference: row.publicReference,
      status: row.status as AssistedOrderHistoryRequest["status"], createdAt: row.createdAt, updatedAt: row.updatedAt,
      estimatedTotalCents: row.estimatedTotalCents, currency: "USD", lines, trackingReference: row.trackingReference });
  }
  return { requests, source: { connected: source.connected, complete: source.complete } };
}

export function readMemberOrderRequests(value: unknown): AssistedRequestHistory | null {
  return object(value) && value.ok === true
    ? readAssistedRequestHistory(value.requests, value.requestsSource) : null;
}
