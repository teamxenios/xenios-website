// Adapter for the owner-guarded checkout continuation doors. Same envelope as
// every other member adapter (lib/api): denials route on code, never message.
// The client secret in an authentication_required answer lives only in memory
// for the provider's client flow; it is never written to storage or a URL.
import { apiGet, apiPost, type ApiResult } from "../lib/api";

export type CheckoutContinuationState =
  | "pending"
  | "authentication_required"
  | "processing"
  | "completed"
  | "cancelled"
  | "reconciliation_required";

export interface CheckoutContinuationView {
  requestKey: string;
  orderId: string;
  state: CheckoutContinuationState;
  amountCents: number;
  currency: "usd";
  authentication?: { providerReference: string; clientSecret: string };
}

const enc = encodeURIComponent;
export const checkoutContinuationPaths = {
  status: (requestKey: string) => `/api/research/checkout/executions/${enc(requestKey)}/continuation`,
  continue: (requestKey: string) => `/api/research/checkout/executions/${enc(requestKey)}/continue`,
  cancel: (requestKey: string) => `/api/research/checkout/executions/${enc(requestKey)}/cancel`,
} as const;

// The doors answer 404 { code: "not_found" } for a reference that is not this
// account's (or does not exist): a routable denial the page acts on, not an
// unpublished API, so the callers opt into it explicitly.
const KNOWN_NOT_FOUND = ["not_found"] as const;

export function loadCheckoutContinuation(token: string | null, requestKey: string): Promise<ApiResult<{ continuation: CheckoutContinuationView }>> {
  return apiGet(checkoutContinuationPaths.status(requestKey), token, KNOWN_NOT_FOUND);
}

export function continueCheckout(token: string | null, requestKey: string): Promise<ApiResult<{ continuation: CheckoutContinuationView }>> {
  return apiPost(checkoutContinuationPaths.continue(requestKey), {}, token, KNOWN_NOT_FOUND);
}

/** The buyer abandons an unpaid checkout. The server releases the provider hold and settles the order; a captured payment completes instead. */
export function cancelCheckout(token: string | null, requestKey: string): Promise<ApiResult<{ continuation: CheckoutContinuationView }>> {
  return apiPost(checkoutContinuationPaths.cancel(requestKey), {}, token, KNOWN_NOT_FOUND);
}
