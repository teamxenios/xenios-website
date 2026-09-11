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
  CheckoutQuoteSnapshot,
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
import { CURRENT_CHECKOUT_CREDIT_POLICY } from "@shared/research/checkout-credit-policy";

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

const shippingServices: readonly ShippingQuote["service"][] = ["standard", "expedited_2day", "next_day", "same_day", "temperature_controlled"];
const quoteObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const quoteOwn = (value: Record<string, unknown>, fields: readonly string[]) => fields.every(field => Object.hasOwn(value, field));
const quoteCents = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Recheck after asynchronous work: a once-valid displayed quote can expire. */
export function isCheckoutQuoteSnapshot(
  value: unknown,
  service?: ShippingQuote["service"],
  now: number = Date.now(),
): value is CheckoutQuoteSnapshot {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())
    || !quoteObject(value) || !quoteOwn(value, ["quote", "subtotalCents", "checkoutConsent", "expiresAt"])
    || (Object.hasOwn(value, "ok") && value.ok !== true)) return false;
  const quote = value.quote;
  const consent = value.checkoutConsent;
  if (!quoteObject(quote) || !quoteOwn(quote, ["kind", "service", "amountCents", "estimatedDeliveryRange", "disclosure"])
    || (quote.kind !== "configured_fallback" && quote.kind !== "live_carrier_quote")
    || !shippingServices.includes(quote.service as ShippingQuote["service"])
    || (service !== undefined && quote.service !== service)
    || !quoteCents(quote.amountCents) || typeof quote.disclosure !== "string" || quote.disclosure.trim().length === 0
    || /[\u0000-\u001f\u007f]/.test(quote.disclosure)
    || !quoteObject(consent) || !quoteOwn(consent, ["policyVersion", "totalCents", "appliedCents"])
    || consent.policyVersion !== CURRENT_CHECKOUT_CREDIT_POLICY.version
    || !quoteCents(value.subtotalCents) || !quoteCents(consent.totalCents) || !quoteCents(consent.appliedCents)
    || consent.appliedCents > value.subtotalCents) return false;
  const range = quote.estimatedDeliveryRange;
  if (range !== null && (quote.kind === "configured_fallback" || !quoteObject(range)
    || !quoteOwn(range, ["earliestDays", "latestDays"])
    || !quoteCents(range.earliestDays) || !quoteCents(range.latestDays) || range.earliestDays > range.latestDays)) return false;
  const gross = value.subtotalCents + quote.amountCents;
  if (!quoteCents(gross) || gross - consent.appliedCents !== consent.totalCents
    || typeof value.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.expiresAt)) return false;
  const expiresAt = Date.parse(value.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now && new Date(expiresAt).toISOString() === value.expiresAt;
}

export async function quoteShipping(token: MemberToken, req: ShippingQuoteRequest): Promise<ApiResult<CheckoutQuoteSnapshot>> {
  const result = await apiPost<unknown>(commercePaths.shippingQuote, req, token);
  if (result.kind !== "ok") return result;
  if (!isCheckoutQuoteSnapshot(result.data, req.service)) return { kind: "unavailable" };
  const { quote, subtotalCents, checkoutConsent, expiresAt } = result.data;
  // Only the reviewed snapshot crosses the boundary; extra server fields and
  // object aliases cannot become part of the customer's later consent payload.
  return { kind: "ok", data: {
    quote: { kind: quote.kind, service: quote.service, amountCents: quote.amountCents,
      estimatedDeliveryRange: quote.estimatedDeliveryRange === null ? null : {
        earliestDays: quote.estimatedDeliveryRange.earliestDays, latestDays: quote.estimatedDeliveryRange.latestDays,
      }, disclosure: quote.disclosure },
    subtotalCents,
    checkoutConsent: { policyVersion: checkoutConsent.policyVersion, totalCents: checkoutConsent.totalCents, appliedCents: checkoutConsent.appliedCents },
    expiresAt,
  } };
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
