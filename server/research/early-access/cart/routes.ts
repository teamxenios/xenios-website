import type {
  EarlyAccessCartCapability,
  EarlyAccessCartCheckoutRequest,
  EarlyAccessCartQuoteRequest,
} from "@shared/research/early-access-cart";
import {
  EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS,
  EARLY_ACCESS_CART_MAX_QUANTITY,
} from "@shared/research/early-access-cart";
import { checkoutEarlyAccessCart, type EarlyAccessCartCheckoutDeps } from "./checkout-service";
import { checkoutView, customerCartStatusView, isCartCheckoutNumber } from "./model";
import type {
  CartCustomer,
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartSettlementStore,
} from "./ports";
import { quoteEarlyAccessCart, type EarlyAccessCartQuoteDeps } from "./quote-service";

export interface CartResponsePort {
  status(code: number): CartResponsePort;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
}

export type CartRequest = Readonly<{
  cookieHeader?: unknown;
  body?: unknown;
  cartCheckoutNumber?: unknown;
}>;

export interface EarlyAccessCartIdentityPort {
  resolve(cookieHeader: unknown): Promise<CartCustomer | null>;
}

function privateHeaders(response: CartResponsePort): void {
  response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
  response.setHeader?.("Pragma", "no-cache");
  response.setHeader?.("X-Content-Type-Options", "nosniff");
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function quoteBody(value: unknown): EarlyAccessCartQuoteRequest | null {
  const row = object(value);
  if (row === null || !Array.isArray(row.items)) return null;
  const contact = object(row.contact);
  const shipTo = object(row.shipTo);
  if (contact === null || shipTo === null) return null;
  return {
    items: row.items as EarlyAccessCartQuoteRequest["items"],
    contact: contact as EarlyAccessCartQuoteRequest["contact"],
    shipTo: shipTo as EarlyAccessCartQuoteRequest["shipTo"],
  };
}

function checkoutBody(value: unknown): EarlyAccessCartCheckoutRequest | null {
  const row = object(value);
  if (row === null) return null;
  if (
    typeof row.quoteId !== "string" ||
    typeof row.idempotencyKey !== "string" ||
    typeof row.expectedIntentHash !== "string"
  ) return null;
  return {
    quoteId: row.quoteId,
    idempotencyKey: row.idempotencyKey,
    expectedIntentHash: row.expectedIntentHash,
  };
}

export function createEarlyAccessCartCapabilityRoute(
  identity: EarlyAccessCartIdentityPort,
) {
  const capability: EarlyAccessCartCapability = Object.freeze({
    enabled: true,
    maxDistinctItems: EARLY_ACCESS_CART_MAX_DISTINCT_ITEMS,
    maxQuantityPerItem: EARLY_ACCESS_CART_MAX_QUANTITY,
    paymentMode: "manual_concierge",
  });
  return async (request: CartRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    const customer = await identity.resolve(request.cookieHeader);
    if (customer === null) {
      response.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
      return;
    }
    response.status(200).json({ ok: true, capability });
  };
}

export function createEarlyAccessCartQuoteRoute(
  deps: EarlyAccessCartQuoteDeps & Readonly<{ identity: EarlyAccessCartIdentityPort }>,
) {
  return async (request: CartRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    const customer = await deps.identity.resolve(request.cookieHeader);
    if (customer === null) {
      response.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
      return;
    }
    const body = quoteBody(request.body);
    if (body === null) {
      response.status(400).json({ ok: false, code: "CART_INVALID" });
      return;
    }
    const result = await quoteEarlyAccessCart(deps, customer, body);
    response
      .status(
        result.ok
          ? 200
          : result.code === "AGREEMENT_REQUIRED"
            ? 403
            : result.code === "LINE_REFUSED"
              ? 409
              : result.code === "UNAVAILABLE"
                ? 503
                : 400,
      )
      .json(result);
  };
}

export function createEarlyAccessCartCheckoutRoute(
  deps: EarlyAccessCartCheckoutDeps & Readonly<{ identity: EarlyAccessCartIdentityPort }>,
) {
  return async (request: CartRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    const customer = await deps.identity.resolve(request.cookieHeader);
    if (customer === null) {
      response.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
      return;
    }
    const body = checkoutBody(request.body);
    if (body === null) {
      response.status(400).json({ ok: false, code: "CART_INVALID" });
      return;
    }
    const result = await checkoutEarlyAccessCart(deps, customer, body);
    const status = result.ok
      ? result.replayed
        ? 200
        : 201
      : result.code === "IDEMPOTENCY_CONFLICT" || result.code === "QUOTE_CHANGED"
        ? 409
        : result.code === "QUOTE_NOT_FOUND"
          ? 404
          : result.code === "UNAVAILABLE"
            ? 503
            : 400;
    response.status(status).json(result);
  };
}

export function createEarlyAccessCartReadRoute(
  deps: Readonly<{
    identity: EarlyAccessCartIdentityPort;
    checkouts: EarlyAccessCartCheckoutStore;
  }>,
) {
  return async (request: CartRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    const customer = await deps.identity.resolve(request.cookieHeader);
    if (customer === null) {
      response.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
      return;
    }
    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const checkout = await deps.checkouts.byCheckoutNumber(request.cartCheckoutNumber);
    const owned =
      checkout !== null &&
      [customer.customerRef, ...(customer.aliases ?? [])].includes(checkout.customerRef);
    if (!owned || checkout === null) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    response.status(200).json({ ok: true, checkout: checkoutView(checkout) });
  };
}

export function createEarlyAccessCartStatusRoute(
  deps: Readonly<{
    identity: EarlyAccessCartIdentityPort;
    checkouts: EarlyAccessCartCheckoutStore;
    settlements: EarlyAccessCartSettlementStore;
  }>,
) {
  return async (request: CartRequest, response: CartResponsePort): Promise<void> => {
    privateHeaders(response);
    const customer = await deps.identity.resolve(request.cookieHeader);
    if (customer === null) {
      response.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
      return;
    }
    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const checkout = await deps.checkouts.byCheckoutNumber(request.cartCheckoutNumber);
    const owned =
      checkout !== null &&
      [customer.customerRef, ...(customer.aliases ?? [])].includes(checkout.customerRef);
    if (!owned) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    const status = await deps.settlements.status(request.cartCheckoutNumber);
    if (status === null) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }
    // PROJECT, DO NOT FORWARD.
    //
    // This route used to return the store's answer verbatim, and the durable
    // answer carries supplier identity on every child release. The read route
    // beside it projected and this one did not, which is precisely how the
    // leak survived: one door was hardened and its twin was not.
    response.status(200).json({ ok: true, status: customerCartStatusView(status) });
  };
}
