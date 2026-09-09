// Adapter for the durable checkout door and its browser configuration. Same
// envelope as every other member adapter (lib/api): denials route on code,
// never message. The request body is the frozen CheckoutRequest contract plus
// the provider payment-method reference the provider's own surface produced;
// no card data can travel through it.
import { apiGet, apiPost, type ApiResult } from "../lib/api";
import type { CheckoutRequest } from "@shared/research/commerce-api";
import type { CheckoutContinuationState } from "./checkoutContinuation";

export type DurableCheckoutState = CheckoutContinuationState;

/** The durable door's answer: the truthful execution state, never a guess. */
export interface DurableCheckoutResult {
  requestKey: string;
  orderId: string;
  state: DurableCheckoutState;
  /** True when this request continued an execution that already existed. */
  idempotent: boolean;
}

export interface PaymentClientConfig {
  provider: "stripe" | "test";
  publishableKey: string | null;
  mode: "test" | "live";
}

export const durableCheckoutPaths = {
  submit: "/api/research/checkout/durable",
  paymentConfig: "/api/research/checkout/payment-config",
} as const;

export function loadPaymentClientConfig(token: string | null): Promise<ApiResult<{ config: PaymentClientConfig }>> {
  return apiGet(durableCheckoutPaths.paymentConfig, token);
}

export function submitDurableCheckout(token: string | null, req: CheckoutRequest): Promise<ApiResult<{ checkout: DurableCheckoutResult }>> {
  return apiPost(durableCheckoutPaths.submit, req, token);
}
