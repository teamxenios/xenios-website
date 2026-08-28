const SAFE_EVENT_TYPES = new Set([
  "assisted_order.submitted",
  "assisted_order.status_changed",
  "assisted_order.document_upload_requested",
  "assisted_order.document_uploaded",
  "assisted_order.document_downloaded",
]);

const SAFE_ACTOR_TYPES = new Set([
  "member",
  "early_access_session",
  "admin",
  "system",
]);

function allowlisted(value: unknown, allowed: ReadonlySet<string>): string {
  return typeof value === "string" && allowed.has(value) ? value : "unknown";
}

/**
 * Operational log projection only; this is not an audit store. Application
 * logs receive no request, actor, document, customer, evidence, or timestamp
 * identifiers. Any complete audit event belongs only in a separately
 * authorized protected store.
 */
export function assistedOrderAuditLogLine(event: Readonly<Record<string, unknown>>): string {
  const eventType = allowlisted(event.eventType, SAFE_EVENT_TYPES);
  const actorType = allowlisted(event.actorType, SAFE_ACTOR_TYPES);
  return `assisted_order_audit event=${eventType} actor=${actorType}`;
}
