// Commerce adapter: the single home for the FROZEN member commerce endpoints
// (catalog, goals, cart, shipping, checkout, orders, subscriptions, claims,
// store credit). Paths and payload shapes come from
// docs/research-commerce/API_CONTRACTS_COMMERCE.md and the authoritative types
// in @shared/research/commerce-api; nothing here re-declares a contract type.
// Every function returns the one ApiResult envelope from lib/api, so a denial
// ({ ok: false, code }) always surfaces as { kind: "denied", code } for the
// page to route on. Route on code, never on message.

import { apiDelete, apiGet, apiPatch, apiPost, type ApiResult } from "../lib/api";
import type {
  AddCartLineRequest,
  CartDto,
  CheckoutRequest,
  ClaimDto,
  CreateClaimRequest,
  GoalDto,
  OrderDetailDto,
  OrderSummaryDto,
  ProductDetailDto,
  ProductSummaryDto,
  ShippingQuoteRequest,
  StoreCreditDto,
  SubscriptionActionRequest,
  SubscriptionDto,
} from "@shared/research/commerce-api";
import type { ShippingQuote, SubscriptionFrequencyDays } from "@shared/research/commerce";

export type MemberToken = string | null;

const BASE = "/api/research";
const enc = encodeURIComponent;

// The frozen route table. Pages never spell URL strings; a path lives here
// exactly once.
export const commercePaths = {
  products: `${BASE}/products`,
  product: (slug: string) => `${BASE}/products/${enc(slug)}`,
  goals: `${BASE}/goals`,
  cart: `${BASE}/cart`,
  cartLines: `${BASE}/cart/lines`,
  cartLine: (sku: string) => `${BASE}/cart/lines/${enc(sku)}`,
  shippingQuote: `${BASE}/shipping/quote`,
  checkout: `${BASE}/checkout`,
  orders: `${BASE}/orders`,
  order: (orderId: string) => `${BASE}/orders/${enc(orderId)}`,
  subscriptions: `${BASE}/subscriptions`,
  subscription: (id: string) => `${BASE}/subscriptions/${enc(id)}`,
  claims: `${BASE}/claims`,
  claim: (claimId: string) => `${BASE}/claims/${enc(claimId)}`,
  storeCredit: `${BASE}/store-credit`,
} as const;

// ------------------------------ catalog ------------------------------------

export function listProducts(token: MemberToken): Promise<ApiResult<{ products: ProductSummaryDto[] }>> {
  return apiGet(commercePaths.products, token);
}

export function getProduct(token: MemberToken, slug: string): Promise<ApiResult<{ product: ProductDetailDto }>> {
  return apiGet(commercePaths.product(slug), token);
}

export function listGoals(token: MemberToken): Promise<ApiResult<{ goals: GoalDto[] }>> {
  return apiGet(commercePaths.goals, token);
}

// -------------------------------- cart -------------------------------------

export function getCart(token: MemberToken): Promise<ApiResult<{ cart: CartDto }>> {
  return apiGet(commercePaths.cart, token);
}

export function addCartLine(token: MemberToken, req: AddCartLineRequest): Promise<ApiResult<{ cart: CartDto }>> {
  return apiPost(commercePaths.cartLines, req, token);
}

export function updateCartLine(
  token: MemberToken,
  sku: string,
  patch: {
    quantity?: number;
    purchaseMode?: "one_time" | "subscription";
    subscriptionFrequencyDays?: SubscriptionFrequencyDays;
  },
): Promise<ApiResult<{ cart: CartDto }>> {
  return apiPatch(commercePaths.cartLine(sku), patch, token);
}

export function removeCartLine(token: MemberToken, sku: string): Promise<ApiResult<{ cart: CartDto }>> {
  return apiDelete(commercePaths.cartLine(sku), token);
}

// --------------------------- shipping, checkout -----------------------------

export function quoteShipping(token: MemberToken, req: ShippingQuoteRequest): Promise<ApiResult<{ quote: ShippingQuote }>> {
  return apiPost(commercePaths.shippingQuote, req, token);
}

export function submitCheckout(token: MemberToken, req: CheckoutRequest): Promise<ApiResult<{ order: OrderSummaryDto }>> {
  return apiPost(commercePaths.checkout, req, token);
}

// ------------------------------- orders ------------------------------------

export function listOrders(token: MemberToken): Promise<ApiResult<{ orders: OrderSummaryDto[] }>> {
  return apiGet(commercePaths.orders, token);
}

export function getOrder(token: MemberToken, orderId: string): Promise<ApiResult<{ order: OrderDetailDto }>> {
  return apiGet(commercePaths.order(orderId), token);
}

// ---------------------------- subscriptions --------------------------------

export function listSubscriptions(token: MemberToken): Promise<ApiResult<{ subscriptions: SubscriptionDto[] }>> {
  return apiGet(commercePaths.subscriptions, token);
}

export function subscriptionAction(
  token: MemberToken,
  id: string,
  req: SubscriptionActionRequest,
): Promise<ApiResult<{ subscription: SubscriptionDto }>> {
  return apiPost(commercePaths.subscription(id), req, token);
}

/**
 * The wire shape of POST /api/research/subscriptions (subscription creation).
 * Mirrors the server's CreateSubscriptionWireInput exactly: the server refuses
 * a body without a SKU, a quantity, a frequency, and the price version the
 * member was shown. There is no client-supplied price amount anywhere in it.
 */
export interface CreateSubscriptionRequest {
  sku: string;
  quantity: number;
  frequencyDays: SubscriptionFrequencyDays;
  /** The price version presented to the member at creation time. */
  priceVersion: string;
  paymentProviderReference?: string | null;
  shippingAddressRef?: string | null;
}

export function createSubscription(
  token: MemberToken,
  req: CreateSubscriptionRequest,
): Promise<ApiResult<{ subscription: SubscriptionDto }>> {
  return apiPost(commercePaths.subscriptions, req, token);
}

// ------------------------------- claims ------------------------------------

export function submitClaim(token: MemberToken, req: CreateClaimRequest): Promise<ApiResult<{ claim: ClaimDto }>> {
  return apiPost(commercePaths.claims, req, token);
}

export function listClaims(token: MemberToken): Promise<ApiResult<{ claims: ClaimDto[] }>> {
  return apiGet(commercePaths.claims, token);
}

// Ownership is enforced by the server: another member's claim reads as a 404,
// indistinguishable from a missing one, so nothing here can probe.
export function getClaim(token: MemberToken, claimId: string): Promise<ApiResult<{ claim: ClaimDto }>> {
  return apiGet(commercePaths.claim(claimId), token);
}

// ----------------------------- store credit --------------------------------

export function getStoreCredit(token: MemberToken): Promise<ApiResult<{ storeCredit: StoreCreditDto }>> {
  return apiGet(commercePaths.storeCredit, token);
}

// ------------------------ legacy-name compatibility ------------------------
// Pages written before the freeze import these names. They hit the SAME frozen
// paths (the old /api/research/member/* variants are gone) and preserve the
// old argument order and caller-supplied generics so existing call sites keep
// meaning what they meant. New code uses the frozen functions above.

/** @deprecated Use listOrders(token). */
export function fetchOrders<T = { orders: OrderSummaryDto[] }>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(commercePaths.orders, token);
}

/** @deprecated Use getOrder(token, orderId). */
export function fetchOrder<T = { order: OrderDetailDto }>(orderId: string, token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(commercePaths.order(orderId), token);
}

/** @deprecated Use listSubscriptions(token). */
export function fetchSubscriptions<T = { subscriptions: SubscriptionDto[] }>(token?: string | null): Promise<ApiResult<T>> {
  return apiGet<T>(commercePaths.subscriptions, token);
}
