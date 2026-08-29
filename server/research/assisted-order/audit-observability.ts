import {
  assistedOrderAuditActorTypes,
  assistedOrderAuditEventTypes,
} from "./audit-store";

// The allowlists are the ONE audit vocabulary (audit-store.ts), never a copy:
// the 2026-08-29 recut found this projection still naming the pre-197eeeb
// event names, so three of the five events the service emits logged as
// `event=unknown`. A category is allowlisted, never the payload.
const SAFE_EVENT_TYPES: ReadonlySet<string> = new Set<string>(
  assistedOrderAuditEventTypes,
);

const SAFE_ACTOR_TYPES: ReadonlySet<string> = new Set<string>(
  assistedOrderAuditActorTypes,
);

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
