import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Express, type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../routes", () => ({
  requireSupabaseAdmin(_req: unknown, res: { status(code: number): { json(body: unknown): unknown } }) {
    res.status(401).json({ ok: false });
  },
}));

import { catalogPriceFields, EARLY_ACCESS_QUOTE_ONLY_RELEASE } from "../../../shared/research/early-access/quote-only";
import type { CareAccessDependencies } from "../../care/access";
import { createAssistedOrderRouteTable, type AssistedOrderHttpRequest } from "../assisted-order/http";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import type { AssistedOrderProductionWiring } from "../assisted-order/production-deps";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { registerRequestIntentApi } from "../assisted-order/request-intent/production";
import type { AssistedOrderService } from "../assisted-order/service";
import { EARLY_ACCESS_CART_ENV } from "./cart/feature-flag";
import { InMemoryEarlyAccessCartStore } from "./cart/store";
import { InMemoryPrivateAccessSessionRepository } from "./private-access-session-repository";
import { registerPrivateEarlyAccessApi } from "./register";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  ORDER_CONTACT,
  SHIP_TO,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "./routes/route-fixtures";
import { InMemoryEarlyAccessCommerceStore } from "./routes/store";

/**
 * THE QUOTE-ONLY RELEASE, ROUTE BY ROUTE.
 *
 * Each quote-only change has its own test at its own door. This file asks the
 * question a release has to answer instead: across EVERY route the three Early
 * Access registrations mount, is there one a customer can call and get a
 * catalog price back?
 *
 * It answers in three steps for each registration:
 *
 *   1. List the routes the real registration mounts, and require every one to
 *      be classified below. A route added later fails here until someone says
 *      what kind it is.
 *   2. Call every customer route under the PRODUCTION DEFAULT (no option
 *      given), with the cart flag on, and require no price in any answer.
 *   3. Make the same calls against a priced release and require prices to be
 *      found. Without this, step 2 would pass with a blind detector.
 *
 * Three kinds of route:
 *
 *   browse  A customer reaches it while browsing or starting something new.
 *           It must carry no catalog price.
 *   record  It reads or completes an order that ALREADY exists. It keeps that
 *           order's amounts by design: what was sold stays readable and
 *           payable. Without such an order it answers with no price.
 *   staff   Behind the admin guard. Staff pricing is unchanged.
 *
 * Out of reach of this file, and said here so nobody reads it as covered: the
 * member catalog (`/api/research/member/products`), the founder and partner
 * catalogs, hosted CI and a browser. Synthetic values only.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Mounted = Readonly<{ method: string; path: string }>;
type Layer = Readonly<{
  route?: { path: unknown; methods: Record<string, boolean> };
  handle?: { stack?: readonly Layer[] };
}>;

function stackOf(target: unknown): readonly Layer[] {
  const holder = target as { router?: { stack?: readonly Layer[] }; _router?: { stack?: readonly Layer[] }; stack?: readonly Layer[] };
  return holder.router?.stack ?? holder._router?.stack ?? holder.stack ?? [];
}

/** Every `METHOD path` registered directly on this app or router. */
function routesOf(target: unknown, prefix = ""): string[] {
  const rows: string[] = [];
  for (const layer of stackOf(target)) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      rows.push(`${method.toUpperCase()} ${prefix}${String(layer.route.path)}`);
    }
  }
  return rows.sort();
}

/** The routers mounted with `app.use(...)`, so their routes are listed too. */
function mountedRouters(app: unknown): unknown[] {
  return stackOf(app).filter((layer) => !layer.route && Array.isArray(layer.handle?.stack)).map((layer) => layer.handle);
}

/**
 * Wider than the named price keys: any number under a key ending in "Cents",
 * and any formatted dollar amount in a string. A browse answer must be clean
 * under both this and `catalogPriceFields`.
 */
function moneyLike(value: unknown, path = ""): string[] {
  if (typeof value === "string") return /\$\s?\d/.test(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => moneyLike(entry, `${path}.${index}`));
  if (typeof value !== "object" || value === null) return [];
  const found: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (/cents$/i.test(key) && typeof entry === "number") found.push(here);
    else found.push(...moneyLike(entry, here));
  }
  return found;
}

function priceIn(body: unknown): string[] {
  return [...new Set([...catalogPriceFields(body), ...moneyLike(body)])].sort();
}

function parse(route: string): Mounted {
  const [method, path] = route.split(" ");
  return { method: method ?? "", path: path ?? "" };
}

// ---------------------------------------------------------------------------
// 1. The private Early Access registration
// ---------------------------------------------------------------------------

const EA = "/api/research/early-access";
const ADMIN = "/api/admin/research";

const BROWSE = [
  `GET ${EA}/agreements`,
  `GET ${EA}/cart/capability`,
  `GET ${EA}/catalog`,
  `GET ${EA}/session`,
  `POST ${EA}/agreements/accept`,
  `POST ${EA}/cart/checkout`,
  `POST ${EA}/cart/quote`,
  `POST ${EA}/logout`,
  `POST ${EA}/orders`,
  `POST ${EA}/unlock`,
  `POST ${EA}/verification/request`,
  `POST ${EA}/verify`,
] as const;

const RECORD = [
  `GET ${EA}/cart/:cartCheckoutNumber`,
  `GET ${EA}/cart/:cartCheckoutNumber/payment-instructions`,
  `GET ${EA}/cart/:cartCheckoutNumber/status`,
  `GET ${EA}/orders/:orderNumber`,
  `GET ${EA}/orders/:orderNumber/invoice`,
  `POST ${EA}/orders/:orderNumber/payment-proof`,
] as const;

const STAFF = [
  `GET ${ADMIN}/early-access/exceptions`,
  `GET ${ADMIN}/early-access/fulfillment-queue`,
  `GET ${ADMIN}/early-access/releases`,
  `GET ${ADMIN}/early-access/releases/history`,
  `GET ${ADMIN}/early-access/verification-requests`,
  `GET ${ADMIN}/payments`,
  `GET ${ADMIN}/payments/:orderNumber`,
  `GET ${ADMIN}/supplier-orders/:orderNumber`,
  `POST ${ADMIN}/cart/:cartCheckoutNumber/confirm-payment`,
  `POST ${ADMIN}/cart/:cartCheckoutNumber/external-proof`,
  `POST ${ADMIN}/early-access/customers`,
  `POST ${ADMIN}/early-access/holds`,
  `POST ${ADMIN}/early-access/holds/withdraw`,
  `POST ${ADMIN}/early-access/releases`,
  `POST ${ADMIN}/early-access/supplier-confirmations`,
  `POST ${ADMIN}/payments/:orderNumber/confirm`,
  `POST ${ADMIN}/payments/:orderNumber/external-proof`,
  `POST ${ADMIN}/payments/:orderNumber/overpayment-exception`,
  `POST ${ADMIN}/payments/:orderNumber/refund`,
  `POST ${ADMIN}/payments/:orderNumber/reject`,
  `POST ${ADMIN}/supplier-orders/:orderNumber`,
  `POST ${ADMIN}/supplier-orders/:orderNumber/acknowledgement`,
  `POST ${ADMIN}/supplier-orders/:orderNumber/notification`,
  `POST ${ADMIN}/supplier-orders/:orderNumber/packing`,
  `POST ${ADMIN}/supplier-orders/:orderNumber/shipped`,
  `POST ${ADMIN}/supplier-orders/:orderNumber/tracking`,
] as const;

const CART_ON = { NODE_ENV: "test", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv;
const ADMIN_GUARD_CODE = "FIXTURE_ADMIN_GUARD";
const fixtureAdminGuard: RequestHandler = (_req, res) => {
  res.status(401).json({ ok: false, code: ADMIN_GUARD_CODE });
};

/** What a redeploy keeps: sessions, single orders and cart orders. */
type Durable = Readonly<{
  repository: InMemoryPrivateAccessSessionRepository;
  store: InMemoryEarlyAccessCommerceStore;
  cartStore: InMemoryEarlyAccessCartStore;
}>;

function durable(): Durable {
  return {
    repository: new InMemoryPrivateAccessSessionRepository(),
    store: new InMemoryEarlyAccessCommerceStore(),
    cartStore: new InMemoryEarlyAccessCartStore(),
  };
}

/**
 * The real registration with the cart flag on. `overrides` is `{}` for the
 * production default and `{ quoteOnly: false }` for the priced control.
 */
async function earlyAccessApp(kept: Durable, overrides: Record<string, unknown>): Promise<Express> {
  const app = express();
  app.use(express.json());
  const unit = cleanUnit();
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    sessionIdentity: true,
    env: CART_ON,
    repository: kept.repository,
    store: kept.store,
    cartStore: kept.cartStore,
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    orderNumber: sequentialOrderNumbers(),
    proofId: sequentialProofIds(),
    agreements: new StubAgreementGate(true),
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
    shipping: new StubShippingPolicy(true),
    referrals: new StubReferralResolver(null),
    requireAdmin: fixtureAdminGuard,
    ...overrides,
  });
  return app;
}

async function unlock(app: Express): Promise<string> {
  const res = await request(app).post(`${EA}/unlock`).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

const CART_KEY = "xeac_cart000000000000000001";
const CART_QUOTE_BODY = {
  items: [{ productId: "prod-clean", variantId: "var-10mg", quantity: 3, expectedUnitPriceCents: 19_900, expectedCurrency: "USD" }],
  contact: ORDER_CONTACT,
  shipTo: SHIP_TO,
};
const UNKNOWN_ORDER = "XEA-0000000000009999";
const UNKNOWN_CART = "XEC-0000000000009999";

type Answer = Readonly<{ route: string; status: number; price: readonly string[] }>;

function send(app: Express, route: string, cookie: string | null, body?: unknown) {
  const { method, path } = parse(route);
  const concrete = path.replace(":orderNumber", UNKNOWN_ORDER).replace(":cartCheckoutNumber", UNKNOWN_CART);
  const call = method === "GET" ? request(app).get(concrete) : request(app).post(concrete);
  if (cookie) call.set("Cookie", cookie);
  return method === "GET" ? call : call.send(body ?? {});
}

/**
 * Every browse route, called as a customer with an open session and the
 * agreement on file. `cookie` is the session that took `checkoutBody`'s cart
 * quote on a priced release, so the checkout door is asked about a quote that
 * really exists and really is this customer's.
 */
async function browseSweep(app: Express, cookie: string, checkoutBody: Record<string, unknown>): Promise<Answer[]> {
  const bodies: Record<(typeof BROWSE)[number], unknown> = {
    [`GET ${EA}/agreements`]: undefined,
    [`GET ${EA}/cart/capability`]: undefined,
    [`GET ${EA}/catalog`]: undefined,
    [`GET ${EA}/session`]: undefined,
    [`POST ${EA}/agreements/accept`]: {},
    [`POST ${EA}/cart/checkout`]: checkoutBody,
    [`POST ${EA}/cart/quote`]: CART_QUOTE_BODY,
    [`POST ${EA}/orders`]: { ...ORDER_BODY },
    [`POST ${EA}/unlock`]: { password: EARLY_ACCESS_TEST_PASSWORD },
    [`POST ${EA}/verification/request`]: { email: ORDER_CONTACT.email },
    [`POST ${EA}/verify`]: { token: "synthetic-token" },
    // Last, and on its own session, so it cannot close the one the others use.
    [`POST ${EA}/logout`]: {},
  } as Record<(typeof BROWSE)[number], unknown>;

  const answers: Answer[] = [];
  for (const route of BROWSE.filter((entry) => entry !== `POST ${EA}/logout`)) {
    const res = await send(app, route, cookie, bodies[route]);
    answers.push({ route, status: res.status, price: priceIn(res.body) });
  }
  const closing = await unlock(app);
  const loggedOut = await send(app, `POST ${EA}/logout`, closing, {});
  answers.push({ route: `POST ${EA}/logout`, status: loggedOut.status, price: priceIn(loggedOut.body) });
  return answers;
}

/** A cart quote taken on a priced release, on a session both releases share. */
async function pricedQuote(priced: Express) {
  const cookie = await unlock(priced);
  const quoted = await request(priced).post(`${EA}/cart/quote`).set("Cookie", cookie).send(CART_QUOTE_BODY);
  expect(quoted.status).toBe(200);
  return {
    cookie,
    checkoutBody: {
      quoteId: quoted.body.quote.quoteId as string,
      idempotencyKey: CART_KEY,
      expectedIntentHash: quoted.body.quote.intentHash as string,
    },
  };
}

function statusOf(answers: readonly Answer[], route: string): number | undefined {
  return answers.find((answer) => answer.route === route)?.status;
}

describe("the private Early Access registration: every route is accounted for", () => {
  it("mounts exactly the routes classified in this file, each in one class", async () => {
    const mounted = routesOf(await earlyAccessApp(durable(), {}));
    const classified = [...BROWSE, ...RECORD, ...STAFF];

    // The listing itself must work: an Express upgrade that hides the stack
    // would otherwise turn this whole file into a silent pass.
    expect(mounted.length).toBeGreaterThan(40);
    expect(mountedRouters(await earlyAccessApp(durable(), {}))).toEqual([]);
    expect(new Set(classified).size).toBe(classified.length);
    expect(mounted).toEqual([...classified].sort());
  });

  it("puts every customer path under the Early Access root and every staff path under the admin root", () => {
    for (const route of [...BROWSE, ...RECORD]) expect(parse(route).path.startsWith(`${EA}/`)).toBe(true);
    for (const route of STAFF) expect(parse(route).path.startsWith(`${ADMIN}/`)).toBe(true);
  });
});

describe("browsing routes under the production default, with the cart flag on", () => {
  it("answer every call with no price", async () => {
    const kept = durable();
    const priced = await earlyAccessApp(kept, { quoteOnly: false });
    const { cookie, checkoutBody } = await pricedQuote(priced);
    const live = await earlyAccessApp(kept, {});

    const answers = await browseSweep(live, cookie, checkoutBody);

    expect(answers.map((answer) => answer.route).sort()).toEqual([...BROWSE].sort());
    expect(answers.filter((answer) => answer.price.length > 0)).toEqual([]);
    // Every call reached a handler that answered on purpose.
    expect(answers.filter((answer) => answer.status >= 500)).toEqual([]);
  });

  it("shut each way into a new order, and still serve the catalog", async () => {
    const kept = durable();
    const priced = await earlyAccessApp(kept, { quoteOnly: false });
    const { cookie, checkoutBody } = await pricedQuote(priced);
    const live = await earlyAccessApp(kept, {});

    const answers = await browseSweep(live, cookie, checkoutBody);

    expect(statusOf(answers, `GET ${EA}/catalog`)).toBe(200);
    expect(statusOf(answers, `GET ${EA}/cart/capability`)).toBe(404);
    expect(statusOf(answers, `POST ${EA}/cart/quote`)).toBe(409);
    expect(statusOf(answers, `POST ${EA}/cart/checkout`)).toBe(409);
    expect(statusOf(answers, `POST ${EA}/orders`)).toBe(409);
    // Nothing was written by any of them.
    expect(await kept.store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
    expect(await kept.cartStore.byIdempotencyKey(CART_KEY)).toBeNull();
  });

  it("serve a catalog that is not empty: the units are there, marked quote-only, with a null price", async () => {
    const live = await earlyAccessApp(durable(), {});
    const cookie = await unlock(live);

    const catalog = await request(live).get(`${EA}/catalog`).set("Cookie", cookie);

    expect(catalog.status).toBe(200);
    const units = catalog.body.units as Array<Record<string, unknown>>;
    expect(units.length).toBeGreaterThan(0);
    for (const unit of units) {
      expect(unit.priceCents).toBeNull();
      expect(unit.pricing).toBe("quote");
    }
  });

  it("is a real check: the same calls on a priced release DO return prices", async () => {
    const kept = durable();
    const priced = await earlyAccessApp(kept, { quoteOnly: false });
    const { cookie, checkoutBody } = await pricedQuote(priced);

    const answers = await browseSweep(priced, cookie, checkoutBody);
    const withPrice = answers.filter((answer) => answer.price.length > 0).map((answer) => answer.route).sort();

    expect(withPrice).toEqual([
      `GET ${EA}/catalog`,
      `POST ${EA}/cart/checkout`,
      `POST ${EA}/cart/quote`,
      `POST ${EA}/orders`,
    ]);
    expect(statusOf(answers, `POST ${EA}/orders`)).toBe(201);
    expect(statusOf(answers, `POST ${EA}/cart/checkout`)).toBe(201);
  });

  it("answer a caller with no session with no price either", async () => {
    const live = await earlyAccessApp(durable(), {});
    for (const route of BROWSE) {
      const res = await send(live, route, null, route === `POST ${EA}/orders` ? { ...ORDER_BODY } : CART_QUOTE_BODY);
      expect({ route, price: priceIn(res.body) }).toEqual({ route, price: [] });
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe("record routes: amounts only for an order that already exists", () => {
  it("answer an unknown order with no price", async () => {
    const live = await earlyAccessApp(durable(), {});
    const cookie = await unlock(live);
    for (const route of RECORD) {
      const res = await send(live, route, cookie, {
        filename: "transfer.png", contentType: "image/png", byteSize: 240_000, sha256: "a".repeat(64), method: "zelle",
      });
      expect({ route, status: res.status >= 400 && res.status < 500, price: priceIn(res.body) })
        .toEqual({ route, status: true, price: [] });
    }
  });

  it("still show the amounts of orders placed before the cutover, to the customer who placed them", async () => {
    const kept = durable();
    const priced = await earlyAccessApp(kept, { quoteOnly: false });
    const { cookie, checkoutBody } = await pricedQuote(priced);
    const order = await request(priced).post(`${EA}/orders`).set("Cookie", cookie).send({ ...ORDER_BODY });
    const cart = await request(priced).post(`${EA}/cart/checkout`).set("Cookie", cookie).send(checkoutBody);
    expect([order.status, cart.status]).toEqual([201, 201]);
    const orderNumber = order.body.order.orderNumber as string;
    const cartNumber = cart.body.checkout.cartCheckoutNumber as string;
    const live = await earlyAccessApp(kept, {});

    const invoice = await request(live).get(`${EA}/orders/${orderNumber}/invoice`).set("Cookie", cookie);
    const cartRead = await request(live).get(`${EA}/cart/${cartNumber}`).set("Cookie", cookie);

    expect([invoice.status, cartRead.status]).toEqual([200, 200]);
    expect(catalogPriceFields(invoice.body).length).toBeGreaterThan(0);
    expect(catalogPriceFields(cartRead.body).length).toBeGreaterThan(0);

    // And still to nobody else: a second customer's session reads neither.
    const stranger = await unlock(live);
    const theirs = await request(live).get(`${EA}/orders/${orderNumber}/invoice`).set("Cookie", stranger);
    const theirCart = await request(live).get(`${EA}/cart/${cartNumber}`).set("Cookie", stranger);
    expect(priceIn(theirs.body)).toEqual([]);
    expect(priceIn(theirCart.body)).toEqual([]);
    expect([theirs.status, theirCart.status].every((status) => status >= 400 && status < 500)).toBe(true);
  });
});

describe("staff routes", () => {
  it("are all answered by the admin guard for a customer session, before any handler", async () => {
    const live = await earlyAccessApp(durable(), {});
    const cookie = await unlock(live);
    for (const route of STAFF) {
      const res = await send(live, route, cookie, {});
      expect({ route, status: res.status, body: res.body })
        .toEqual({ route, status: 401, body: { ok: false, code: ADMIN_GUARD_CODE } });
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The assisted-order route table (the request catalog and its requests)
// ---------------------------------------------------------------------------

const AO = `${EA}/assisted-orders`;

/** Customer routes whose answer is a catalog page or a request view. */
const AO_PROJECTED = [`GET ${AO}/:publicReference`, `GET ${AO}/catalog`, `POST ${AO}`] as const;
/** Customer routes that carry no product data at all: feature state and document upload. */
const AO_NO_PRODUCT_DATA = [
  `GET ${AO}/config`,
  `POST ${AO}/:requestId/documents/:documentId/complete`,
  `POST ${AO}/:requestId/documents/upload-url`,
] as const;

const AO_ITEM = {
  productId: "prod-synthetic", variantId: "var-synthetic", productName: "Synthetic Peptide",
  specification: "10 mg", minimumQuantity: 1, maximumQuantity: 5, quantityIncrement: 1,
  unitPriceCents: 4_900, currency: "USD", workflowMode: "direct_order_request",
  actionLabel: "Add to order request", catalogVersion: "catalog-v1", priceVersion: "price-v1",
};
const AO_LINE = {
  lineId: "line-1", productId: "prod-synthetic", variantId: "var-synthetic", productName: "Synthetic Peptide",
  quantity: 2, unitPriceCents: 4_900, lineEstimateCents: 9_800, currency: "USD", priceVersion: "price-v1",
};
const AO_RECEIPT = {
  requestId: "req-1", publicReference: "XAO-SYNTHETIC", statusToken: "tok", status: "submitted",
  createdAt: "2026-11-09T00:00:00.000Z", estimatedTotalCents: 9_800, currency: "USD", lines: [AO_LINE], nextSteps: [],
};

function assistedOrderTable(options: Readonly<{ quoteOnly?: boolean }>) {
  // A service that still prices everything, as the real one does.
  const service = {
    config: async () => ({ enabled: true, requiredAgreements: [], formAcknowledgments: [] }),
    catalog: async () => ({ items: [AO_ITEM], page: 1, pageSize: 24, total: 1 }),
    submit: async () => AO_RECEIPT,
    status: async () => ({ ...AO_RECEIPT, updatedAt: AO_RECEIPT.createdAt, timeline: [], documents: [], actionRequired: null }),
    createDocumentUpload: async () => ({ documentId: "doc-1", uploadUrl: "https://upload.example.invalid/doc-1", expiresAt: AO_RECEIPT.createdAt }),
    completeDocumentUpload: async () => undefined,
  } as unknown as AssistedOrderService;
  const resolver = { resolve: async () => ({ actorType: "early_access_session" }) } as never;
  return createAssistedOrderRouteTable(service, resolver, null, options);
}

async function callDescriptor(table: ReturnType<typeof assistedOrderTable>, route: string) {
  const { method, path } = parse(route);
  const descriptor = table.find((candidate) => candidate.method === method && candidate.path === path);
  if (!descriptor) throw new Error(`no descriptor ${route}`);
  const req: AssistedOrderHttpRequest = {
    method, path, headers: {}, query: {},
    params: { publicReference: "XAO-SYNTHETIC", requestId: "req-1", documentId: "doc-1" },
    body: { publicReference: "XAO-SYNTHETIC" },
  };
  return descriptor.handler(req);
}

describe("the assisted-order route table", () => {
  it("has exactly the customer routes classified here; every other route is an admin route", () => {
    const table = assistedOrderTable({ quoteOnly: EARLY_ACCESS_QUOTE_ONLY_RELEASE });
    const customerRoutes = table.filter((route) => route.auth !== "admin");
    const customer = customerRoutes.filter((route) => route.method !== "OPTIONS")
      .map((route) => `${route.method} ${route.path}`).sort();
    const admin = table.filter((route) => route.auth === "admin");

    expect(customer).toEqual([...AO_PROJECTED, ...AO_NO_PRODUCT_DATA].sort());
    expect(admin.length).toBeGreaterThan(0);
    for (const route of admin) expect(route.path.startsWith("/api/admin/")).toBe(true);

    // The table also describes a preflight for each customer path. They are
    // for the same paths and no others.
    const classifiedPaths = new Set([...AO_PROJECTED, ...AO_NO_PRODUCT_DATA].map((route) => parse(route).path));
    const preflights = customerRoutes.filter((route) => route.method === "OPTIONS");
    for (const route of preflights) expect(classifiedPaths.has(route.path)).toBe(true);
  });

  it("answers every preflight descriptor with no price", async () => {
    const table = assistedOrderTable({ quoteOnly: EARLY_ACCESS_QUOTE_ONLY_RELEASE });
    const preflights = table.filter((route) => route.auth !== "admin" && route.method === "OPTIONS");
    expect(preflights.length).toBeGreaterThan(0);
    for (const route of preflights) {
      const res = await callDescriptor(table, `OPTIONS ${route.path}`);
      expect({ path: route.path, price: priceIn(res.body) }).toEqual({ path: route.path, price: [] });
    }
  });

  it("carries no price on any customer route when built as server/index.ts builds it", async () => {
    const table = assistedOrderTable({ quoteOnly: EARLY_ACCESS_QUOTE_ONLY_RELEASE });
    for (const route of [...AO_PROJECTED, ...AO_NO_PRODUCT_DATA]) {
      const res = await callDescriptor(table, route);
      expect({ route, ok: res.status < 300, price: priceIn(res.body) }).toEqual({ route, ok: true, price: [] });
    }
  });

  it("is a real check: without the option the catalog, the receipt and the status DO carry prices", async () => {
    const table = assistedOrderTable({ quoteOnly: false });
    for (const route of AO_PROJECTED) {
      expect({ route, priced: priceIn((await callDescriptor(table, route)).body).length > 0 }).toEqual({ route, priced: true });
    }
    for (const route of AO_NO_PRODUCT_DATA) {
      expect({ route, price: priceIn((await callDescriptor(table, route)).body) }).toEqual({ route, price: [] });
    }
  });

  it("is built with the cutover constant in server/index.ts", () => {
    // server/index.ts cannot be booted in a unit test, so this is a source pin:
    // the weakest kind of check, and the only one this wiring can have here.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../index.ts"), "utf8");
    const start = source.indexOf("createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(");
    expect(start).toBeGreaterThan(-1);
    const call = source.slice(start, source.indexOf("const assistedOrderDoor", start));
    expect(call).toContain("{ quoteOnly: EARLY_ACCESS_QUOTE_ONLY_RELEASE }");
  });
});

// ---------------------------------------------------------------------------
// 3. The request-intent registration
// ---------------------------------------------------------------------------

const RI = `${EA}/request-intents`;
const RI_CUSTOMER = [`GET ${RI}/catalog`, `GET ${RI}/config`, `POST ${RI}/`, `POST ${RI}/recover`] as const;
const RI_STAFF = [`GET ${RI}/staff`, `GET ${RI}/staff/:requestId`] as const;
const RI_ORIGIN = "https://fixture.example.invalid";

const RI_VIEWER: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, authUserId: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-hash",
  normalizedEmail: null, capabilities: new Set(["assisted_orders:submit"]),
} as AssistedOrderViewer;

/** One research offering with one variant, priced by the master catalog. */
function pricedCatalogInput() {
  const offering = {
    id: "off-1", slug: "synthetic-1", canonicalKey: "synthetic-1",
    displayName: "Synthetic 1", canonicalName: "Synthetic 1",
    family: "research_peptides_materials", category: "Synthetic", subcategory: null, brand: null, aliases: [],
    displayState: "request_access", stateExplanation: "", copyState: "approved", visibility: "member",
    variants: [{ id: "var-1", label: "10 mg", displayState: "request_access", visibility: "member", sourceReferences: [] }],
    sourceReferences: [],
  };
  const select = async (query: { page?: number; pageSize?: number }) => ({
    offerings: [offering],
    prices: new Map([["var-1", { state: "priced", amountCents: 4_900, priceId: "price-1", currency: "USD" }]]),
    page: { page: query.page ?? 1, pageSize: Math.min(query.pageSize ?? 24, 100), total: 1 },
  });
  return {
    serviceFor: () => ({ select }),
    bindingFor: (variantId: string) => ({ productId: `product-${variantId}`, variantId: `pc-${variantId}` }),
    offeringVariantFor: () => null,
    catalogVersion: "synthetic-v1",
  };
}

function requestIntentApp(): Express {
  const input = pricedCatalogInput();
  const rpc = vi.fn(async (name: string) => {
    if (name === "research_rate_limit_hit") return { data: true, error: null };
    if (name === "request_intent_find_attempt") return { data: null, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
  const wiring = {
    env: { SITE_URL: RI_ORIGIN, RESEARCH_REQUEST_INTENT_ENABLED: "true", CARE_ENABLED: "false", CARE_ENABLE_APPROVED: "false" },
    requiredAgreements: [{ kind: "fixture-terms", version: "fixture-v1" }],
    agreementGate: { accepted: async () => true },
    masterOfferingServiceFor: input.serviceFor, bindingFor: input.bindingFor, offeringVariantFor: input.offeringVariantFor,
    catalogVersion: input.catalogVersion, supabaseRpc: { rpc }, supabaseStorage: null, log: () => undefined,
  } as unknown as AssistedOrderProductionWiring;
  const care = {
    loadCapabilityStatus: async () => ({ rail: "care", state: "disabled", enabled: false, publicMessage: "", checkedAt: "2026-11-10T00:00:00.000Z" }),
    resolvePrincipal: async () => null,
    recordAccessDecision: async () => undefined,
  } as unknown as CareAccessDependencies;
  const app = express();
  app.use(express.json());
  registerRequestIntentApi(app, wiring, { customer: async () => RI_VIEWER }, care);
  return app;
}

describe("the request-intent registration", () => {
  it("mounts exactly the routes classified here", () => {
    const app = requestIntentApp();
    const routers = mountedRouters(app);
    expect(routers.length).toBe(1);
    const mounted = [...routesOf(app), ...routesOf(routers[0], RI)].sort();
    expect(mounted).toEqual([...RI_CUSTOMER, ...RI_STAFF].sort());
  });

  it("is given a catalog that really is priced", async () => {
    const page = await createRequestIntentCatalog(pricedCatalogInput() as never).list(RI_VIEWER, {});
    expect(page.items).toHaveLength(1);
    expect(catalogPriceFields(page)).toEqual(["items.0.unitPriceCents"]);
  });

  it("serves that catalog with no price through the production registration", async () => {
    const res = await request(requestIntentApp()).get(`${RI}/catalog`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ specification: "10 mg", unitPriceCents: null, priceVersion: null });
    expect(priceIn(res.body)).toEqual([]);
  });

  it("answers every other customer route, and a customer on a staff route, with no price", async () => {
    const app = requestIntentApp();
    const config = await request(app).get(`${RI}/config`);
    expect(config.status).toBe(200);
    expect(priceIn(config.body)).toEqual([]);

    for (const path of [`${RI}/`, `${RI}/recover`]) {
      const res = await request(app).post(path).set("Origin", RI_ORIGIN).send({});
      expect({ path, price: priceIn(res.body) }).toEqual({ path, price: [] });
    }
    for (const path of [`${RI}/staff`, `${RI}/staff/10000000-0000-4000-8000-000000000001`]) {
      const res = await request(app).get(path);
      expect({ path, refused: res.status >= 400, price: priceIn(res.body) }).toEqual({ path, refused: true, price: [] });
    }
  });
});
