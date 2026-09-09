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
} as const;

export function loadCheckoutContinuation(token: string | null, requestKey: string): Promise<ApiResult<{ continuation: CheckoutContinuationView }>> {
  return apiGet(checkoutContinuationPaths.status(requestKey), token);
}

export function continueCheckout(token: string | null, requestKey: string): Promise<ApiResult<{ continuation: CheckoutContinuationView }>> {
  return apiPost(checkoutContinuationPaths.continue(requestKey), {}, token);
}
