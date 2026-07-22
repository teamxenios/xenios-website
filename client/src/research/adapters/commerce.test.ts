// Adapter contract tests for the FROZEN commerce surface: every function must
// hit the exact frozen route with the exact method and body, and every server
// condition must surface through the one ApiResult envelope, including the
// denied kind ({ ok: false, code } on any status, and 403 carrying a code).
// fetch is stubbed, so this pins the mapping matrix without a server and
// catches any drift in the shared paths.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCartLine,
  commercePaths,
  createSubscription,
  fetchOrder,
  fetchOrders,
  fetchSubscriptions,
  getCart,
  getClaim,
  getOrder,
  getProduct,
  getStoreCredit,
  listClaims,
  listGoals,
  listOrders,
  listProducts,
  listSubscriptions,
  quoteShipping,
  removeCartLine,
  submitCheckout,
  submitClaim,
  subscriptionAction,
  updateCartLine,
} from "./commerce";
import { frozenGuidePaths, getGuide, listGuides } from "./guides";
import type { ApiResult } from "../lib/api";
import type { CheckoutRequest, ShippingQuoteRequest } from "@shared/research/commerce-api";

type Call = { url: string; init: RequestInit };

const calls: Call[] = [];

function stubFetch(status: number, body: unknown) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          if (body === undefined) throw new Error("no body");
          return body;
        },
      };
    }),
  );
}

function stubFetchReject() {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("network down");
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const headers = () => calls[0].init.headers as Record<string, string>;

// ---------------------------------------------------------------------------
// The full mapping matrix, exercised through one GET adapter from each file.
// The mapping lives in lib/api, so one representative per adapter proves the
// adapter routes through it unchanged.
// ---------------------------------------------------------------------------

const matrixSubjects: Array<{
  name: string;
  run: () => Promise<ApiResult<unknown>>;
  path: string;
}> = [
  { name: "commerce.listProducts", run: () => listProducts(null), path: commercePaths.products },
  { name: "guides.listGuides", run: () => listGuides(null), path: frozenGuidePaths.guides },
];

describe.each(matrixSubjects)("ApiResult matrix via $name", ({ run, path }) => {
  it("maps 200 with data to ok", async () => {
    stubFetch(200, { items: [1, 2] });
    expect(await run()).toEqual({ kind: "ok", data: { items: [1, 2] } });
    expect(calls[0].url).toBe(path);
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("maps 200 with an empty object to ok with empty data", async () => {
    stubFetch(200, {});
    expect(await run()).toEqual({ kind: "ok", data: {} });
  });

  it("maps 200 with an unparseable (empty) body to error", async () => {
    stubFetch(200, undefined);
    expect(await run()).toEqual({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
  });

  it("maps 401 to unauthorized", async () => {
    stubFetch(401, { message: "nope" });
    expect(await run()).toEqual({ kind: "unauthorized" });
  });

  it("maps 403 without a code to forbidden with the server message", async () => {
    stubFetch(403, { message: "Members only." });
    expect(await run()).toEqual({ kind: "forbidden", message: "Members only." });
  });

  it("maps 403 WITH a machine code to denied (routable)", async () => {
    stubFetch(403, { ok: false, code: "commerce_disabled" });
    expect(await run()).toEqual({ kind: "denied", code: "commerce_disabled" });
  });

  it("maps 200 with ok:false and a machine code to denied", async () => {
    stubFetch(200, { ok: false, code: "large_order_review_required", message: "held" });
    expect(await run()).toEqual({
      kind: "denied",
      code: "large_order_review_required",
      message: "held",
    });
  });

  it.each([404, 501, 503])("maps %i to unavailable", async (status) => {
    stubFetch(status, { message: "not here" });
    expect(await run()).toEqual({ kind: "unavailable" });
  });

  it("maps a 500 with a message to error", async () => {
    stubFetch(500, { message: "Boom." });
    expect(await run()).toEqual({ kind: "error", message: "Boom." });
  });

  it("maps a network failure to the connection error", async () => {
    stubFetchReject();
    expect(await run()).toEqual({
      kind: "error",
      message: "The connection failed. Please try again.",
    });
  });
});

// ---------------------------------------------------------------------------
// Frozen catalog routes
// ---------------------------------------------------------------------------

describe("catalog endpoints", () => {
  it("listProducts GETs /api/research/products with the bearer token", async () => {
    stubFetch(200, { ok: true, products: [] });
    await listProducts("tok-1");
    expect(calls[0].url).toBe("/api/research/products");
    expect(calls[0].init.method).toBe("GET");
    expect(headers().Authorization).toBe("Bearer tok-1");
  });

  it("getProduct encodes the slug into the path", async () => {
    stubFetch(200, { ok: true, product: {} });
    await getProduct("tok", "bpc 157/x");
    expect(calls[0].url).toBe("/api/research/products/bpc%20157%2Fx");
  });

  it("listGoals GETs /api/research/goals", async () => {
    stubFetch(200, { ok: true, goals: [] });
    await listGoals("tok");
    expect(calls[0].url).toBe("/api/research/goals");
    expect(calls[0].init.method).toBe("GET");
  });
});

// ---------------------------------------------------------------------------
// Frozen cart routes
// ---------------------------------------------------------------------------

describe("cart endpoints", () => {
  it("getCart GETs /api/research/cart", async () => {
    stubFetch(200, { ok: true, cart: {} });
    await getCart("tok");
    expect(calls[0].url).toBe("/api/research/cart");
    expect(calls[0].init.method).toBe("GET");
  });

  it("addCartLine POSTs the AddCartLineRequest to /api/research/cart/lines", async () => {
    stubFetch(200, { ok: true, cart: {} });
    await addCartLine("tok", {
      sku: "XN-01",
      quantity: 2,
      purchaseMode: "subscription",
      subscriptionFrequencyDays: 30,
    });
    expect(calls[0].url).toBe("/api/research/cart/lines");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(
      JSON.stringify({ sku: "XN-01", quantity: 2, purchaseMode: "subscription", subscriptionFrequencyDays: 30 }),
    );
    expect(headers()["Content-Type"]).toBe("application/json");
  });

  it("updateCartLine PATCHes the encoded sku with the patch body", async () => {
    stubFetch(200, { ok: true, cart: {} });
    await updateCartLine("tok", "XN 01/a", { quantity: 3, purchaseMode: "one_time" });
    expect(calls[0].url).toBe("/api/research/cart/lines/XN%2001%2Fa");
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].init.body).toBe(JSON.stringify({ quantity: 3, purchaseMode: "one_time" }));
  });

  it("removeCartLine DELETEs the encoded sku with no body and no content type", async () => {
    stubFetch(200, { ok: true, cart: {} });
    await removeCartLine("tok", "XN-01");
    expect(calls[0].url).toBe("/api/research/cart/lines/XN-01");
    expect(calls[0].init.method).toBe("DELETE");
    expect(calls[0].init.body).toBeUndefined();
    expect(headers()["Content-Type"]).toBeUndefined();
    expect(headers().Authorization).toBe("Bearer tok");
  });
});

// ---------------------------------------------------------------------------
// Shipping and checkout
// ---------------------------------------------------------------------------

const destination: ShippingQuoteRequest["destination"] = {
  line1: "1 Research Way",
  city: "Austin",
  state: "TX",
  postalCode: "78701",
  country: "US",
};

describe("shipping and checkout endpoints", () => {
  it("quoteShipping POSTs the ShippingQuoteRequest", async () => {
    stubFetch(200, { ok: true, quote: {} });
    await quoteShipping("tok", { destination, service: "standard" });
    expect(calls[0].url).toBe("/api/research/shipping/quote");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ destination, service: "standard" });
  });

  it("submitCheckout POSTs the CheckoutRequest (no client-supplied price fields exist)", async () => {
    stubFetch(200, { ok: true, order: {} });
    const req: CheckoutRequest = {
      shippingAddress: destination,
      shippingService: "standard",
      acceptedAgreementKeys: ["research_terms_v1"],
      researchAttestation: true,
      idempotencyKey: "idem-1",
    };
    await submitCheckout("tok", req);
    expect(calls[0].url).toBe("/api/research/checkout");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(req);
  });

  it("routes a 403 commerce_disabled checkout to the denied kind", async () => {
    stubFetch(403, { ok: false, code: "commerce_disabled" });
    const result = await submitCheckout("tok", {
      shippingAddress: destination,
      shippingService: "standard",
      acceptedAgreementKeys: [],
      idempotencyKey: "idem-2",
    });
    expect(result).toEqual({ kind: "denied", code: "commerce_disabled" });
  });

  it("routes a 200 large_order_review_required checkout to the denied kind (order held, not an error)", async () => {
    stubFetch(200, { ok: false, code: "large_order_review_required" });
    const result = await submitCheckout("tok", {
      shippingAddress: destination,
      shippingService: "standard",
      acceptedAgreementKeys: [],
      idempotencyKey: "idem-3",
    });
    expect(result).toEqual({ kind: "denied", code: "large_order_review_required" });
  });
});

// ---------------------------------------------------------------------------
// Orders, subscriptions, claims, store credit
// ---------------------------------------------------------------------------

describe("orders, subscriptions, claims, and store credit endpoints", () => {
  it("listOrders GETs /api/research/orders", async () => {
    stubFetch(200, { ok: true, orders: [] });
    await listOrders("tok");
    expect(calls[0].url).toBe("/api/research/orders");
  });

  it("getOrder encodes the order id into the path", async () => {
    stubFetch(200, { ok: true, order: {} });
    await getOrder("tok", "ord/1 x");
    expect(calls[0].url).toBe("/api/research/orders/ord%2F1%20x");
  });

  it("listSubscriptions GETs /api/research/subscriptions", async () => {
    stubFetch(200, { ok: true, subscriptions: [] });
    await listSubscriptions("tok");
    expect(calls[0].url).toBe("/api/research/subscriptions");
    expect(calls[0].init.method).toBe("GET");
  });

  it("subscriptionAction POSTs the SubscriptionActionRequest to the encoded id", async () => {
    stubFetch(200, { ok: true, subscription: {} });
    await subscriptionAction("tok", "sub 9", { action: "reschedule", rescheduleTo: "2026-08-01" });
    expect(calls[0].url).toBe("/api/research/subscriptions/sub%209");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ action: "reschedule", rescheduleTo: "2026-08-01" }));
  });

  it("createSubscription POSTs the exact wire shape to /api/research/subscriptions", async () => {
    stubFetch(200, { ok: true, subscription: {} });
    await createSubscription("tok", {
      sku: "XN-01",
      quantity: 2,
      frequencyDays: 60,
      priceVersion: "cents-6900",
    });
    expect(calls[0].url).toBe("/api/research/subscriptions");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      sku: "XN-01",
      quantity: 2,
      frequencyDays: 60,
      priceVersion: "cents-6900",
    });
  });

  it("routes a subscription_action_invalid create to the denied kind", async () => {
    stubFetch(400, { ok: false, code: "subscription_action_invalid", message: "not eligible" });
    expect(
      await createSubscription("tok", { sku: "XN-01", quantity: 1, frequencyDays: 30, priceVersion: "cents-1" }),
    ).toEqual({ kind: "denied", code: "subscription_action_invalid", message: "not eligible" });
  });

  it("getClaim encodes the claim id into the frozen claim detail path", async () => {
    stubFetch(200, { ok: true, claim: {} });
    await getClaim("tok", "clm/7 x");
    expect(calls[0].url).toBe("/api/research/claims/clm%2F7%20x");
    expect(calls[0].init.method).toBe("GET");
  });

  it("submitClaim POSTs the CreateClaimRequest to /api/research/claims", async () => {
    stubFetch(200, { ok: true, claim: {} });
    await submitClaim("tok", {
      orderId: "ord-1",
      sku: "XN-01",
      reason: "damaged",
      detail: "Arrived cracked.",
      evidenceRefs: ["ref-1"],
    });
    expect(calls[0].url).toBe("/api/research/claims");
    expect(calls[0].init.method).toBe("POST");
  });

  it("listClaims GETs /api/research/claims", async () => {
    stubFetch(200, { ok: true, claims: [] });
    await listClaims("tok");
    expect(calls[0].url).toBe("/api/research/claims");
    expect(calls[0].init.method).toBe("GET");
  });

  it("getStoreCredit GETs /api/research/store-credit", async () => {
    stubFetch(200, { ok: true, storeCredit: {} });
    await getStoreCredit("tok");
    expect(calls[0].url).toBe("/api/research/store-credit");
  });

  it("omits the Authorization header when no token is given", async () => {
    stubFetch(200, { ok: true, orders: [] });
    await listOrders(null);
    expect(headers().Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Legacy-name wrappers hit the SAME frozen paths with the old argument order
// ---------------------------------------------------------------------------

describe("legacy-name compatibility wrappers", () => {
  it("fetchOrders hits the frozen orders path", async () => {
    stubFetch(200, { ok: true, orders: [] });
    await fetchOrders("tok");
    expect(calls[0].url).toBe("/api/research/orders");
  });

  it("fetchOrder keeps the (orderId, token) argument order against the frozen path", async () => {
    stubFetch(200, { ok: true, order: {} });
    await fetchOrder("ord-7", "tok-x");
    expect(calls[0].url).toBe("/api/research/orders/ord-7");
    expect(headers().Authorization).toBe("Bearer tok-x");
  });

  it("fetchSubscriptions hits the frozen subscriptions path", async () => {
    stubFetch(200, { ok: true, subscriptions: [] });
    await fetchSubscriptions("tok");
    expect(calls[0].url).toBe("/api/research/subscriptions");
  });
});

// ---------------------------------------------------------------------------
// Frozen guide routes (the commerce-lane pair added to the guides adapter)
// ---------------------------------------------------------------------------

describe("frozen guide endpoints", () => {
  it("listGuides GETs /api/research/guides with the bearer token", async () => {
    stubFetch(200, { ok: true, guides: [] });
    await listGuides("tok");
    expect(calls[0].url).toBe("/api/research/guides");
    expect(calls[0].init.method).toBe("GET");
    expect(headers().Authorization).toBe("Bearer tok");
  });

  it("getGuide encodes the slug into the path", async () => {
    stubFetch(200, { ok: true, guide: {} });
    await getGuide("tok", "dosing 101/a");
    expect(calls[0].url).toBe("/api/research/guides/dosing%20101%2Fa");
  });

  it("an unpublished guide detail surfaces as denied with guide_not_published", async () => {
    stubFetch(200, { ok: false, code: "guide_not_published" });
    expect(await getGuide("tok", "in-review-guide")).toEqual({
      kind: "denied",
      code: "guide_not_published",
    });
  });
});
