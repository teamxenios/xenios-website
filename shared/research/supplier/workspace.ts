import {
  SUPPLIER_PERMITTED_ACTIONS,
  type FulfillmentAction,
  type FulfillmentAssignmentView,
  type FulfillmentState,
} from "../fulfillment/contracts";

// ---------------------------------------------------------------------------
// The supplier workspace view model.
//
// THIS MODULE HOLDS NO AUTHORITY. The fulfillment service
// (server/research/fulfillment/service.ts, FULFILLMENT_TRANSITIONS) decides
// what a transition does and whether it is allowed; the HTTP layer
// independently refuses any action outside SUPPLIER_PERMITTED_ACTIONS. What
// lives here is the browser's copy of "which buttons to draw", which the
// client bundle cannot get by importing server code.
//
// A second copy of a rule is a copy that drifts, so `workspace.test.ts`
// imports the server's real table and asserts this map equals
// FULFILLMENT_TRANSITIONS narrowed to the supplier-permitted actions,
// state for state. If the engine's rules change and this map does not, that
// test fails rather than the supplier being shown a button the server will
// reject.
//
// Every offered action here is advisory. The server is still asked, and its
// refusal is what the workspace reports.
// ---------------------------------------------------------------------------

/**
 * The supplier-permitted actions available from each state, mirroring the
 * fulfillment engine's own table narrowed to what a supplier operator may do.
 *
 * States a supplier can never act from are present with an empty list rather
 * than absent, so a missing key is a bug and not a silent "no actions".
 */
export const SUPPLIER_WORKSPACE_ACTIONS: Readonly<Record<FulfillmentState, readonly FulfillmentAction[]>> = {
  assigned: ["acknowledge", "record_exception"],
  acknowledged: ["start_picking", "record_exception"],
  picking: ["pack", "record_exception"],
  packed: ["record_tracking", "record_exception"],
  tracking_created: ["ship", "record_exception"],
  shipped: ["deliver", "record_exception"],
  delivered: [],
  // Recovery passes back through the evidence-bearing steps. A supplier can
  // resume work from an exception but can never jump straight to shipped.
  exception: ["start_picking", "pack", "record_tracking"],
  returned: [],
  replacement: [],
  refunded: [],
  damaged: [],
  lost: [],
  recalled: [],
  cancelled: [],
};

export function supplierActionsFor(state: FulfillmentState): readonly FulfillmentAction[] {
  return SUPPLIER_WORKSPACE_ACTIONS[state] ?? [];
}

/**
 * The action a supplier would normally take next, or null when the assignment
 * is waiting on someone else. `record_exception` is never the primary action:
 * reporting a problem is always available but is never what we suggest.
 */
export function primarySupplierAction(state: FulfillmentState): FulfillmentAction | null {
  const forward = supplierActionsFor(state).filter((a) => a !== "record_exception");
  return forward[0] ?? null;
}

export const FULFILLMENT_ACTION_LABEL: Readonly<Record<FulfillmentAction, string>> = {
  acknowledge: "Acknowledge",
  start_picking: "Start picking",
  pack: "Mark packed",
  record_tracking: "Add tracking",
  ship: "Mark shipped",
  deliver: "Mark delivered",
  record_exception: "Report a problem",
  record_return: "Record return",
  record_replacement: "Record replacement",
  record_refund: "Record refund",
  record_damage: "Record damage",
  record_loss: "Record loss",
  record_recall: "Record recall",
  cancel: "Cancel",
};

export const FULFILLMENT_STATE_LABEL: Readonly<Record<FulfillmentState, string>> = {
  assigned: "Assigned to you",
  acknowledged: "Acknowledged",
  picking: "Picking",
  packed: "Packed",
  tracking_created: "Tracking added, not yet shipped",
  shipped: "Shipped",
  delivered: "Delivered",
  exception: "Problem reported",
  returned: "Returned",
  replacement: "Replacement recorded",
  refunded: "Refund recorded",
  damaged: "Damaged",
  lost: "Lost",
  recalled: "Recalled",
  cancelled: "Cancelled",
};

/** Which states read as "work is with you right now". Drives the queue split. */
export function isOpenForSupplier(state: FulfillmentState): boolean {
  return supplierActionsFor(state).length > 0;
}

/**
 * `record_tracking` is its own audited step and does NOT mean the parcel has
 * moved. The workspace must never imply carrier possession from a tracking
 * number alone, which is why shipped-ness is asked as its own question.
 */
export function hasShipped(state: FulfillmentState): boolean {
  return state === "shipped" || state === "delivered";
}

/** The extra evidence an action needs before the server will accept it. */
export function requiredEvidenceFor(action: FulfillmentAction): readonly ("tracking" | "reason")[] {
  if (action === "record_tracking") return ["tracking"];
  if (action === "record_exception") return ["reason"];
  return [];
}

// ---------------------------------------------------------------------------
// Minimum-necessary projection guard
// ---------------------------------------------------------------------------

/**
 * Field names that must never reach a supplier surface. Checked as a
 * lowercased substring so `xeniosMargin`, `retail_price_cents`, and
 * `commissionCents` are all caught by the same list.
 *
 * The server's FulfillmentAssignmentView already excludes these by
 * construction. This is the second, independent check: if a future engine
 * change widens the projection, the workspace refuses to render the field
 * rather than quietly displaying it.
 */
export const SUPPLIER_FORBIDDEN_FIELD_MARKERS = [
  "margin",
  "markup",
  "commission",
  "affiliate",
  "referral",
  "retail",
  "wholesale",
  "cost",
  "price",
  "payment",
  "paid",
  "memberid",
  "member_id",
  "email",
  "health",
  "assessment",
  "diagnos",
] as const;

/**
 * The forbidden field names present anywhere in a projection, deeply. Empty is
 * the passing answer. Returned rather than thrown so a caller can decide
 * between refusing to render and reporting.
 */
export function forbiddenSupplierFields(value: unknown, path: string[] = []): string[] {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item, i) => forbiddenSupplierFields(item, [...path, String(i)]));
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (SUPPLIER_FORBIDDEN_FIELD_MARKERS.some((marker) => lower.includes(marker))) {
      found.push([...path, key].join("."));
    }
    found.push(...forbiddenSupplierFields(child, [...path, key]));
  }
  return found;
}

/** A projection is renderable only when it carries nothing forbidden. */
export function isRenderableSupplierAssignment(view: FulfillmentAssignmentView): boolean {
  return forbiddenSupplierFields(view).length === 0;
}

export { SUPPLIER_PERMITTED_ACTIONS };
