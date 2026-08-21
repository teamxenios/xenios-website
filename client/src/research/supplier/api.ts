import { apiGet, apiPost, type ApiResult } from "../lib/api";
import type {
  FulfillmentAction,
  FulfillmentAssignmentView,
  FulfillmentCommandResult,
} from "@shared/research/fulfillment/contracts";

// ---------------------------------------------------------------------------
// Supplier workspace API adapter. Every fulfillment path the supplier surface
// touches lives HERE and nowhere else, so pages never spell an endpoint.
//
// The two paths are published by the fulfillment engine
// (server/research/fulfillment/register.ts) and are re-spelled here because the
// browser bundle cannot import server code. That makes them a SECOND COPY, and
// a second copy drifts: these doors were moved OUT of the research namespace
// into /api/admin/research/... because the research wall answered 401 for
// operator traffic, and this adapter silently kept pointing at the old ones.
// `api.test.ts` now imports the engine's own path constants and asserts these
// match, so the next move fails a test instead of a supplier.
//
// Supplier identity is resolved
// ENTIRELY server-side from the request, by the engine's injected
// `resolveSupplierActor`; nothing in this file names a supplier, and no
// supplier id is ever sent. A workspace that cannot say who it is cannot
// address another supplier's work.
//
// While `resolveSupplierActor` is unwired the engine answers 503, which the
// shared envelope reports as `unavailable` and the workspace renders as its
// honest "access is not switched on yet" state.
// ---------------------------------------------------------------------------

export const SUPPLIER_API = {
  assignments: "/api/admin/research/fulfillment/supplier/assignments",
  transition: (assignmentId: string) =>
    `/api/admin/research/fulfillment/supplier/assignments/${encodeURIComponent(assignmentId)}/transition`,
} as const;

export type SupplierToken = string | null;

export function getSupplierAssignments(
  token: SupplierToken,
): Promise<ApiResult<{ assignments: FulfillmentAssignmentView[] }>> {
  return apiGet(SUPPLIER_API.assignments, token);
}

/**
 * The evidence a transition may carry. Passed through by explicit field, so a
 * stray key from a form cannot reach the engine.
 */
export interface SupplierTransitionEvidence {
  carrier?: string;
  service?: string;
  trackingReference?: string;
  reason?: string;
}

/**
 * Drive one assignment forward.
 *
 * `expectedVersion` is the version the workspace last read, so a stale tab
 * loses to a 409 rather than overwriting someone else's step.
 * `idempotencyKey` makes a double-submit a replay instead of a second action.
 */
export function transitionSupplierAssignment(
  assignmentId: string,
  action: FulfillmentAction,
  expectedVersion: number,
  idempotencyKey: string,
  evidence: SupplierTransitionEvidence,
  token: SupplierToken,
): Promise<ApiResult<{ result: FulfillmentCommandResult }>> {
  const body: Record<string, unknown> = { action, expectedVersion, idempotencyKey };
  if (evidence.carrier) body.carrier = evidence.carrier;
  if (evidence.service) body.service = evidence.service;
  if (evidence.trackingReference) body.trackingReference = evidence.trackingReference;
  if (evidence.reason) body.reason = evidence.reason;
  return apiPost(SUPPLIER_API.transition(assignmentId), body, token);
}

/** A per-attempt key. Exported so a test can supply a deterministic one. */
export function newIdempotencyKey(assignmentId: string, action: string, stamp: string): string {
  return `sw-${assignmentId}-${action}-${stamp}`;
}
