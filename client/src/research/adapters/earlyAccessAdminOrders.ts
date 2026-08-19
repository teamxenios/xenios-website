// ---------------------------------------------------------------------------
// Early Access LEGACY-order fulfillment operations adapter (pages/adminx/*).
// The five live operator endpoints register.ts mounts behind
// requireSupabaseAdmin - the payment review queue, the per-order read, the
// supplier packet + dispatch trail, tracking entry, and mark-shipped - plus
// the two fail-closed fulfillment reads (settled-awaiting-fulfillment and
// open exceptions) and the assisted-order submitted count for the cockpit.
//
// Bearer discipline is adminOps.ts's, unchanged: every function takes the
// admin access token explicitly and forwards it to lib/api, which attaches
// "Authorization: Bearer <token>"; the SERVER decides authority on every
// request. Refusals come back as honest ApiResults: a 409 with a machine
// code (TRACKING_REQUIRED, DISPATCH_TRAIL_MOVED) is a routable denial the
// page turns into operator guidance, a 503/404 is "unavailable" and renders
// a designed pending state, and nothing on any surface is invented.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";

const PAYMENTS = "/api/admin/research/payments";
const SUPPLIER_ORDERS = "/api/admin/research/supplier-orders";
// Exported from server routes/admin-routes.ts as
// EARLY_ACCESS_ADMIN_FULFILLMENT_QUEUE_PATH / _EXCEPTIONS_PATH; spelled here
// because the client bundle never imports server modules.
const FULFILLMENT_QUEUE = "/api/admin/research/early-access/fulfillment-queue";
const EXCEPTIONS = "/api/admin/research/early-access/exceptions";
const enc = encodeURIComponent;

// ---------------------------------- DTOs -----------------------------------
// Wire shapes are the server's own views (paymentOrderView, dispatchView,
// settlementView projections in routes/admin-routes.ts), copied field for
// field. Integer cents only; display formatting happens in the page.

export type EarlyAccessAdminProofDto = Readonly<{
  reviewedProofRef: string;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  method: string;
  submittedAt: string;
}>;

export type EarlyAccessAdminPaymentOrderDto = Readonly<{
  orderNumber: string;
  placedAt: string;
  paymentState: "awaiting_payment" | "under_review" | "payment_verified" | "payment_rejected";
  payableTotalCents: number;
  currency: string;
  sku: string;
  quantity: number;
  /** Null for orders placed before contact collection existed. */
  contact: Readonly<{ email: string; phone: string }> | null;
  paymentReference: string;
  proofCount: number;
  currentProof: EarlyAccessAdminProofDto | null;
}>;

export type EarlyAccessSupplierRecipientDto = Readonly<{
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}>;

/** The packet an operator sends to the supplier, by hand when needed. The
 * ONLY admin response that carries the shipping address. */
export type EarlyAccessSupplierPacketDto = Readonly<{
  releaseId: string;
  orderReference: string;
  supplierId: string;
  supplierSku: string;
  quantity: number;
  recipient: EarlyAccessSupplierRecipientDto;
}>;

export type EarlyAccessSupplierOrderRecordDto = Readonly<{
  releaseId: string;
  orderId: string;
  supplierId: string;
  supplierSku: string;
  quantity: number;
  releasedByActorId: string;
  releasedAt: string;
  verificationIdempotencyKey: string;
}>;

export type EarlyAccessDispatchEventDto = Readonly<{
  orderNumber: string;
  kind: "notification_attempt" | "acknowledgement" | "packing";
  channel: string | null;
  recipient: string | null;
  reference: string | null;
  outcome: "sent" | "failed" | "recorded";
  actorId: string;
  at: string;
  sequence: number;
}>;

export type EarlyAccessTrackingDto = Readonly<{
  releaseId: string;
  orderId: string;
  carrier: string;
  trackingNumber: string;
  recordedByActorId: string;
  recordedAt: string;
  sequence: number;
}>;

export type EarlyAccessFulfillmentDto = Readonly<{
  orderId: string;
  releaseId: string;
  carrier: string;
  trackingNumber: string;
  fulfilledByActorId: string;
  fulfilledAt: string;
}>;

export type EarlyAccessDispatchViewDto = Readonly<{
  supplierOrder: EarlyAccessSupplierOrderRecordDto;
  events: readonly EarlyAccessDispatchEventDto[];
  tracking: readonly EarlyAccessTrackingDto[];
  fulfillment: EarlyAccessFulfillmentDto | null;
}>;

export type EarlyAccessSupplierOrderReadDto = EarlyAccessDispatchViewDto &
  Readonly<{ ok: true; packet: EarlyAccessSupplierPacketDto }>;

export type EarlyAccessSettledAwaitingFulfillmentDto = Readonly<{
  orderNumber: string;
  settledAt: string;
  sku: string;
  quantity: number;
  payableTotalCents: number;
  currency: string;
  trackingCount: number;
  dispatchEventCount: number;
}>;

export type EarlyAccessAdminExceptionDto = Readonly<{
  id: number;
  kind: string;
  orderNumber: string | null;
  detail: unknown;
  raisedAt: string;
}>;

// --------------------------------- reads -----------------------------------

/** GET /api/admin/research/payments: every order under payment review. */
export function listEarlyAccessPaymentQueue(
  token: string,
): Promise<ApiResult<{ ok: true; items: EarlyAccessAdminPaymentOrderDto[] }>> {
  return apiGet(PAYMENTS, token);
}

/** GET one order in ANY payment state, by the number the operator holds. */
export function getEarlyAccessPaymentOrder(
  token: string,
  orderNumber: string,
): Promise<ApiResult<{ ok: true; order: EarlyAccessAdminPaymentOrderDto }>> {
  return apiGet(`${PAYMENTS}/${enc(orderNumber)}`, token);
}

/** GET the supplier packet and the full dispatch trail for a settled order. */
export function getEarlyAccessSupplierOrder(
  token: string,
  orderNumber: string,
): Promise<ApiResult<EarlyAccessSupplierOrderReadDto>> {
  return apiGet(`${SUPPLIER_ORDERS}/${enc(orderNumber)}`, token);
}

/** GET settled orders still owed a shipment. 503 until the founder-gated
 * RPC candidate is deployed and wired; the page renders that honestly. */
export function listEarlyAccessFulfillmentQueue(
  token: string,
): Promise<ApiResult<{ ok: true; items: EarlyAccessSettledAwaitingFulfillmentDto[] }>> {
  return apiGet(FULFILLMENT_QUEUE, token);
}

/** GET the open admin exceptions (deployed RPC; route wiring in register.ts). */
export function listEarlyAccessAdminExceptions(
  token: string,
): Promise<ApiResult<{ ok: true; items: EarlyAccessAdminExceptionDto[] }>> {
  return apiGet(EXCEPTIONS, token);
}

/**
 * The assisted-orders submitted count for the cockpit tile. The admin list
 * endpoint already pages, so one item is enough to read `total`; the tile
 * stays honest through the envelope when the M71 bridge is not deployed
 * (the endpoint answers unavailable, never a fake zero).
 */
export function countAssistedOrdersSubmitted(
  token: string,
): Promise<ApiResult<{ items: unknown[]; total: number; page: number; pageSize: number }>> {
  return apiGet(`/api/admin/research/assisted-orders?status=submitted&page=1&pageSize=1`, token);
}

// -------------------------------- actions ----------------------------------

/**
 * POST a carrier and tracking number against the one supplier release.
 * Corrections append (a new sequence); nothing is overwritten.
 */
export function postEarlyAccessTracking(
  token: string,
  orderNumber: string,
  input: Readonly<{ carrier: string; trackingNumber: string }>,
): Promise<ApiResult<{ ok: true; paymentState: string } & EarlyAccessDispatchViewDto>> {
  return apiPost(`${SUPPLIER_ORDERS}/${enc(orderNumber)}/tracking`, input, token);
}

/**
 * POST mark-shipped. The server refuses 409 TRACKING_REQUIRED until a
 * tracking row exists; the page surfaces that code as guidance, not failure.
 * Shipping twice returns the original record and writes nothing.
 */
export function markEarlyAccessShipped(
  token: string,
  orderNumber: string,
): Promise<ApiResult<{ ok: true; shipped: boolean; paymentState: string } & EarlyAccessDispatchViewDto>> {
  return apiPost(`${SUPPLIER_ORDERS}/${enc(orderNumber)}/shipped`, {}, token);
}
