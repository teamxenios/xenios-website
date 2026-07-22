import { describe, expect, it, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  adminIdOf,
  rawBodyOf,
  registerCommerceApi,
  subjectOf,
  toPartnerSelfDto,
  type CommerceDependencies,
  type PartnerSelfSource,
} from "./routes";

// ---------------------------------------------------------------------------
// Minimal Express double. Records the routes registered and lets a test invoke one.
// ---------------------------------------------------------------------------

type Handler = (req: Request, res: Response, next?: () => void) => unknown;

interface Registered {
  method: string;
  path: string;
  guard: Handler;
  handler: Handler;
}

function fakeApp() {
  const routes: Registered[] = [];
  const add = (method: string) => (path: string, guard: Handler, handler: Handler) => {
    routes.push({ method, path, guard, handler });
  };
  return {
    app: { get: add("get"), post: add("post"), patch: add("patch"), delete: add("delete") } as never,
    routes,
  };
}

function fakeRes() {
  const captured = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    set(k: string, v: string) {
      captured.headers[k] = v;
      return res;
    },
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(payload: unknown) {
      captured.body = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, captured };
}

function reqWith(member: Record<string, unknown> | undefined, extras: Partial<Request> = {}): Request {
  return { researchMember: member, params: {}, body: {}, query: {}, ...extras } as unknown as Request;
}

// ---------------------------------------------------------------------------

const PARTNER_SOURCE: PartnerSelfSource = {
  partnerId: "prt_1",
  role: "affiliate",
  state: "active",
  certifiedAt: "2026-07-01",
  activatedAt: "2026-07-02",
  training: [{ moduleKey: "fraud", moduleVersion: "1.0", completedAt: "2026-06-30" }],
  agreements: [{ agreementKey: "affiliate_terms", agreementVersion: "2", decidedAt: "2026-06-29" }],
};

function deps(overrides: Partial<CommerceDependencies> = {}): CommerceDependencies {
  return {
    catalog: { listProducts: () => [], getProduct: () => null, listGoals: () => [] },
    guides: { listForMember: async () => [], getForMember: async () => null },
    cart: {
      getCart: async (memberId) => ({ owner: memberId }),
      addLine: async () => ({ ok: true, cart: {} }),
      updateLine: async () => ({ ok: true, cart: {} }),
      removeLine: async () => ({ ok: true, cart: {} }),
    },
    checkout: { submit: async () => ({ ok: false, code: "commerce_disabled" }) },
    orders: { listForMember: async (memberId) => [{ owner: memberId }], getForMember: async () => null },
    subscriptions: {
      listForMember: async () => [],
      apply: async () => ({ ok: true }),
      create: async () => ({ ok: true, subscription: { state: "pending" } }),
    },
    claims: {
      submitClaim: async () => ({ ok: true, claim: {} }),
      listForMember: async () => [],
      getForMember: async (memberId, claimId) => (claimId === "clm_owned" ? { claimId, owner: memberId } : null),
    },
    claimsAdmin: {
      listOpen: async () => [],
      review: async (claimId, adminId, decision) => ({ ok: true, claim: { claimId, adminId, decision } }),
      refund: async (claimId) => ({ ok: true, claim: { claimId } }),
      replacement: async (claimId) => ({ ok: true, claim: { claimId } }),
    },
    storeCredit: { forMember: async (memberId) => ({ owner: memberId }) },
    partners: {
      findByMemberId: async (memberId) => (memberId === "mem_1" ? PARTNER_SOURCE : null),
      dashboardFor: async (partner) => ({ partnerId: partner.partnerId }),
      listLinks: async () => [],
      applyForMember: async (memberId, input) => ({ ok: true, partner: { memberIdSeen: memberId, role: input.role } }),
    },
    partnerAdmin: {
      review: async () => ({ ok: false, code: "capability_disabled" }),
    },
    ordersAdmin: {
      approve: async (orderId, adminId) => ({ ok: true, order: { orderId, adminId, state: "approved" } }),
      capture: async (orderId, adminId) => ({ ok: true, order: { orderId, adminId, state: "payment_captured" } }),
      cancel: async (orderId, adminId, reason) => ({
        ok: true,
        order: { orderId, adminId, state: "cancelled", cancellationReason: reason },
      }),
    },
    webhooks: {
      handlePayment: async () => ({ ok: true, applied: true, eventId: "evt_default" }),
      handleFulfillment: async () => ({ ok: true, applied: true, eventId: "evt_ff_default" }),
    },
    shippingQuotes: {
      quoteFor: async (memberId) => ({ ok: true, quote: { owner: memberId }, expiresAt: "2026-07-21T00:15:00Z" }),
    },
    capabilities: { memberVisible: () => ({ product_commerce: { enabled: false } }) },
    adminQueues: { commerce: async () => ({}) },
    now: () => new Date("2026-07-21T00:00:00Z"),
    ...overrides,
  };
}

const guards = {
  requireActiveMember: ((_r: Request, _s: Response, next?: () => void) => next?.()) as Handler,
  requireMember: ((_r: Request, _s: Response, next?: () => void) => next?.()) as Handler,
  requireAdmin: ((_r: Request, _s: Response, next?: () => void) => next?.()) as Handler,
};

function build(d: CommerceDependencies = deps()) {
  const { app, routes } = fakeApp();
  registerCommerceApi(app, d, guards);
  return routes;
}

function route(routes: Registered[], method: string, path: string): Registered {
  const found = routes.find((r) => r.method === method && r.path === path);
  if (!found) throw new Error(`no route ${method} ${path}`);
  return found;
}

// ---------------------------------------------------------------------------

describe("subjectOf, the viewer-enforcement boundary", () => {
  it("reads the member only from what the guard authenticated", () => {
    expect(subjectOf(reqWith({ id: "mem_1" }))).toBe("mem_1");
  });

  it("returns null when nothing was authenticated", () => {
    expect(subjectOf(reqWith(undefined))).toBeNull();
  });

  // The core of the fix: there is no request field an attacker can set to become
  // someone else, because identity is not read from the request at all.
  it("ignores a member id supplied in the body, query, or params", () => {
    const forged = reqWith(undefined, {
      body: { memberId: "mem_victim", partnerId: "prt_victim" },
      query: { memberId: "mem_victim" },
      params: { memberId: "mem_victim" },
    } as Partial<Request>);
    expect(subjectOf(forged)).toBeNull();
  });

  it("does not let a forged body override a real authenticated subject", () => {
    const req = reqWith({ id: "mem_real" }, { body: { memberId: "mem_victim" } } as Partial<Request>);
    expect(subjectOf(req)).toBe("mem_real");
  });

  it("fails closed on a non-string or empty id", () => {
    expect(subjectOf(reqWith({ id: 42 }))).toBeNull();
    expect(subjectOf(reqWith({ id: "" }))).toBeNull();
  });
});

describe("toPartnerSelfDto, the partner leak boundary", () => {
  it("exposes only the whitelisted keys", () => {
    const dto = toPartnerSelfDto(PARTNER_SOURCE);
    expect(Object.keys(dto).sort()).toEqual([
      "active",
      "agreements",
      "certified",
      "partnerId",
      "role",
      "state",
      "training",
    ]);
  });

  // PartnerRecord carries legal name, contact email, internal notes, admin ids, and a
  // lifecycle history containing suspension and termination reasons written for Samuel.
  it("never serializes identity, internal notes, admin ids, or lifecycle history", () => {
    const loaded = {
      ...PARTNER_SOURCE,
      legalName: "LEAK-LEGAL-NAME",
      contactEmail: "LEAK-EMAIL",
      internalNotes: "LEAK-NOTES",
      certifiedByAdminId: "LEAK-ADMIN-1",
      activatedByAdminId: "LEAK-ADMIN-2",
      history: [{ kind: "suspended", detail: "LEAK-SUSPENSION-REASON" }],
    } as unknown as PartnerSelfSource;

    const serialized = JSON.stringify(toPartnerSelfDto(loaded));
    for (const marker of [
      "LEAK-LEGAL-NAME",
      "LEAK-EMAIL",
      "LEAK-NOTES",
      "LEAK-ADMIN-1",
      "LEAK-ADMIN-2",
      "LEAK-SUSPENSION-REASON",
    ]) {
      expect(serialized).not.toContain(marker);
    }
  });

  it("does not leak a field added to the record later", () => {
    const future = { ...PARTNER_SOURCE, futureSensitiveField: "LEAK-FUTURE" } as unknown as PartnerSelfSource;
    expect(JSON.stringify(toPartnerSelfDto(future))).not.toContain("LEAK-FUTURE");
  });

  it("reports certification and activation as booleans, not timestamps plus admin ids", () => {
    const dto = toPartnerSelfDto(PARTNER_SOURCE);
    expect(dto.certified).toBe(true);
    expect(dto.active).toBe(true);
  });

  it("is not active when the state says otherwise, even with an activation timestamp", () => {
    const suspended = { ...PARTNER_SOURCE, state: "suspended" as const };
    expect(toPartnerSelfDto(suspended).active).toBe(false);
  });
});

describe("route registration", () => {
  let routes: Registered[];
  beforeEach(() => {
    routes = build();
  });

  it("registers the frozen contract paths", () => {
    const paths = routes.map((r) => `${r.method.toUpperCase()} ${r.path}`);
    expect(paths).toContain("GET /api/research/capabilities");
    expect(paths).toContain("GET /api/research/products/:slug");
    expect(paths).toContain("GET /api/research/guides/:slug");
    expect(paths).toContain("POST /api/research/checkout");
    expect(paths).toContain("GET /api/research/partner/dashboard");
    expect(paths).toContain("GET /api/admin/research/commerce/queues");
  });

  // The coordinator owns route registration, so this module must never self-register.
  it("registers no route outside the api namespace it owns", () => {
    for (const r of routes) {
      expect(r.path.startsWith("/api/research/") || r.path.startsWith("/api/admin/research/")).toBe(true);
    }
  });

  it("puts a guard on every route", () => {
    for (const r of routes) expect(typeof r.guard).toBe("function");
  });

  it("marks member responses no-store", async () => {
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/capabilities").handler(reqWith({ id: "mem_1" }), res);
    expect(captured.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("handlers fail closed without an authenticated subject", () => {
  it("refuses the cart when the guard attached no member", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/cart").handler(reqWith(undefined), res);
    expect(captured.status).toBe(403);
    expect(captured.body).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("scopes the cart to the authenticated member, not a requested one", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    const req = reqWith({ id: "mem_real" }, { body: { memberId: "mem_victim" } } as Partial<Request>);
    await route(routes, "get", "/api/research/cart").handler(req, res);
    expect(captured.body).toMatchObject({ ok: true, cart: { owner: "mem_real" } });
  });
});

describe("partner routes resolve the partner from the member", () => {
  it("returns the caller's own partner record only", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/partner/me").handler(reqWith({ id: "mem_1" }), res);
    expect(captured.body).toMatchObject({ ok: true, partner: { partnerId: "prt_1" } });
  });

  // A member with no partner gets a 404, and critically there is no parameter through
  // which they could have asked for someone else's.
  it("refuses a member who owns no partner", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/partner/dashboard").handler(reqWith({ id: "mem_other" }), res);
    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({ ok: false, code: "partner_not_found" });
  });

  it("never passes a client-supplied partner id to the service", async () => {
    const seen: string[] = [];
    const routes = build(
      deps({
        partners: {
          findByMemberId: async () => PARTNER_SOURCE,
          dashboardFor: async (partner) => {
            seen.push(partner.partnerId);
            return { partnerId: partner.partnerId };
          },
          listLinks: async () => [],
          applyForMember: async () => ({ ok: true, partner: {} }),
        },
      }),
    );
    const { res } = fakeRes();
    const forged = reqWith({ id: "mem_1" }, {
      body: { partnerId: "prt_victim" },
      params: { partnerId: "prt_victim" },
      query: { partnerId: "prt_victim" },
    } as Partial<Request>);
    await route(routes, "get", "/api/research/partner/dashboard").handler(forged, res);
    expect(seen).toEqual(["prt_1"]);
    expect(seen).not.toContain("prt_victim");
  });
});

describe("guide denial", () => {
  it("denies an unpublished Guide instead of partially rendering it", async () => {
    const routes = build(
      deps({ guides: { listForMember: async () => [], getForMember: async () => ({ denied: "guide_not_published" }) } }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/guides/:slug").handler(
      reqWith({ id: "mem_1" }, { params: { slug: "bpc-157" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(403);
    expect(captured.body).toMatchObject({ ok: false, code: "guide_not_published" });
  });

  it("404s a Guide that does not exist", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/guides/:slug").handler(
      reqWith({ id: "mem_1" }, { params: { slug: "nope" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(404);
  });
});

describe("checkout relays the capability denial", () => {
  // Commerce is disabled today. The contract promises this exact code to the UI.
  it("returns commerce_disabled with a 503 rather than creating anything", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/research/checkout").handler(reqWith({ id: "mem_1" }), res);
    expect(captured.status).toBe(503);
    expect(captured.body).toMatchObject({ ok: false, code: "commerce_disabled" });
  });

  it("fails closed when a service returns an unrecognizable shape", async () => {
    const routes = build(deps({ checkout: { submit: async () => "not a result" as unknown } }));
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/research/checkout").handler(reqWith({ id: "mem_1" }), res);
    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({ ok: false });
  });
});

describe("order ownership", () => {
  // A foreign order and a missing order look identical, so a probe cannot use the
  // response to learn that someone else's order exists.
  it("404s a foreign order indistinguishably from a missing one", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/orders/:orderId").handler(
      reqWith({ id: "mem_1" }, { params: { orderId: "ord_of_someone_else" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({ ok: false, code: "order_not_found" });
  });
});

// ---------------------------------------------------------------------------
// The HTTP surface expansion (webhooks, refunds admin, subscription creation,
// partner portal, shipping quote)
// ---------------------------------------------------------------------------

describe("payment webhook route", () => {
  const PATH = "/api/research/webhooks/payment";

  function webhookReq(options: { raw?: Buffer; body?: unknown; signature?: string }): Request {
    return {
      params: {},
      query: {},
      body: options.body ?? {},
      rawBody: options.raw,
      get: (name: string) =>
        name.toLowerCase() === "stripe-signature" ? options.signature : undefined,
    } as unknown as Request;
  }

  it("is not registered behind the member guards (the signature is the gate)", () => {
    const routes = build();
    const r = route(routes, "post", PATH);
    expect(r.guard).not.toBe(guards.requireActiveMember);
    expect(r.guard).not.toBe(guards.requireMember);
    expect(r.guard).not.toBe(guards.requireAdmin);
  });

  it("hands the EXACT raw bytes and the signature header to the handler", async () => {
    const calls: Array<{ raw: string; signature: string | undefined }> = [];
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async (raw, signature) => {
            calls.push({ raw, signature });
            return { ok: true, applied: true, eventId: "evt_1" };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    const raw = Buffer.from(JSON.stringify({ id: "evt_1", type: "payment.captured", orderId: "ord_1" }));
    await route(routes, "post", PATH).handler(webhookReq({ raw, signature: "sig_x" }), res);
    expect(calls).toEqual([{ raw: raw.toString("utf8"), signature: "sig_x" }]);
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true, applied: true, eventId: "evt_1" });
  });

  it("refuses a request whose raw bytes were not captured, without calling the handler", async () => {
    let called = 0;
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => {
            called += 1;
            return { ok: true, applied: false, eventId: "x" };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(webhookReq({ body: { parsed: true } }), res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, code: "malformed" });
    expect(called).toBe(0);
  });

  it("acknowledges a replay idempotently with applied false", async () => {
    const routes = build(
      deps({ webhooks: { handlePayment: async () => ({ ok: true, applied: false, eventId: "evt_1" }) } }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(webhookReq({ raw: Buffer.from("{}"), signature: "s" }), res);
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true, applied: false, eventId: "evt_1" });
  });

  it("maps an invalid signature to a 400 that will not be retried into success", async () => {
    const routes = build(
      deps({ webhooks: { handlePayment: async () => ({ ok: false, code: "invalid_signature" }) } }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(webhookReq({ raw: Buffer.from("{}"), signature: "bad" }), res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("maps a not-ready capability to a retryable 503", async () => {
    const routes = build(
      deps({ webhooks: { handlePayment: async () => ({ ok: false, code: "capability_disabled" }) } }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(webhookReq({ raw: Buffer.from("{}"), signature: "s" }), res);
    expect(captured.status).toBe(503);
  });

  it("answers a handler crash with a 500 that leaks NOTHING about the failure", async () => {
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => {
            throw new Error("SECRET_sk_live_123 leaked in an error message");
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(webhookReq({ raw: Buffer.from("{}"), signature: "s" }), res);
    expect(captured.status).toBe(500);
    expect(JSON.stringify(captured.body)).not.toContain("SECRET");
    expect(JSON.stringify(captured.body)).not.toContain("sk_live");
    expect(captured.body).toEqual({ ok: false, code: "webhook_error" });
  });
});

describe("rawBodyOf", () => {
  it("prefers the app-level captured raw buffer", () => {
    const req = { rawBody: Buffer.from("captured"), body: Buffer.from("route-level") } as unknown as Request;
    expect(rawBodyOf(req)).toBe("captured");
  });
  it("falls back to a route-level raw buffer body", () => {
    const req = { body: Buffer.from("route-level") } as unknown as Request;
    expect(rawBodyOf(req)).toBe("route-level");
  });
  it("refuses when only a parsed object exists (never re-serializes)", () => {
    const req = { body: { id: "evt" } } as unknown as Request;
    expect(rawBodyOf(req)).toBeNull();
  });
});

describe("shipping quote route", () => {
  const PATH = "/api/research/shipping/quote";
  const GOOD_BODY = {
    destination: { line1: "1 Main St", city: "Austin", state: "tx", postalCode: "78701", country: "US" },
    service: "standard",
  };

  it("fails closed without an authenticated subject", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(reqWith(undefined, { body: GOOD_BODY } as Partial<Request>), res);
    expect(captured.status).toBe(403);
  });

  it("refuses a malformed address or unknown service at the wire", async () => {
    const routes = build();
    for (const body of [
      {},
      { ...GOOD_BODY, service: "teleport" },
      { destination: { ...GOOD_BODY.destination, state: "Texas" }, service: "standard" },
      { destination: { ...GOOD_BODY.destination, postalCode: "abc" }, service: "standard" },
      { destination: { ...GOOD_BODY.destination, country: "CA" }, service: "standard" },
    ]) {
      const { res, captured } = fakeRes();
      await route(routes, "post", PATH).handler(reqWith({ id: "mem_1" }, { body } as Partial<Request>), res);
      expect(captured.status).toBe(400);
      expect(captured.body).toMatchObject({ ok: false, code: "address_invalid" });
    }
  });

  it("quotes for the AUTHENTICATED member with a normalized state and an expiry", async () => {
    const seen: Array<{ memberId: string; state: string }> = [];
    const routes = build(
      deps({
        shippingQuotes: {
          quoteFor: async (memberId, req) => {
            seen.push({ memberId, state: req.destination.state });
            return { ok: true, quote: { amountCents: 1295 }, expiresAt: "2026-07-21T00:15:00Z" };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    const forged = reqWith({ id: "mem_real" }, { body: { ...GOOD_BODY, memberId: "mem_victim" } } as Partial<Request>);
    await route(routes, "post", PATH).handler(forged, res);
    expect(seen).toEqual([{ memberId: "mem_real", state: "TX" }]);
    expect(captured.body).toMatchObject({ ok: true, quote: { amountCents: 1295 }, expiresAt: "2026-07-21T00:15:00Z" });
  });

  it("relays a precise provider denial", async () => {
    const routes = build(
      deps({ shippingQuotes: { quoteFor: async () => ({ ok: false, code: "shipping_unavailable" }) } }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(reqWith({ id: "mem_1" }, { body: GOOD_BODY } as Partial<Request>), res);
    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ ok: false, code: "shipping_unavailable" });
  });
});

describe("subscription creation route", () => {
  const PATH = "/api/research/subscriptions";
  const GOOD = { sku: "P901", quantity: 1, frequencyDays: 30, priceVersion: "2026-07-20" };

  it("refuses a structurally invalid body at the wire", async () => {
    const routes = build();
    for (const body of [
      {},
      { ...GOOD, sku: "" },
      { ...GOOD, quantity: "2" },
      { ...GOOD, frequencyDays: "30" },
      { ...GOOD, priceVersion: 7 },
    ]) {
      const { res, captured } = fakeRes();
      await route(routes, "post", PATH).handler(reqWith({ id: "mem_1" }, { body } as Partial<Request>), res);
      expect(captured.status).toBe(400);
      expect(captured.body).toMatchObject({ ok: false, code: "subscription_action_invalid" });
    }
  });

  it("creates for the authenticated subject, ignoring any body identity", async () => {
    const seen: string[] = [];
    const routes = build(
      deps({
        subscriptions: {
          listForMember: async () => [],
          apply: async () => ({ ok: true }),
          create: async (memberId) => {
            seen.push(memberId);
            return { ok: true, subscription: { state: "pending" } };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(
      reqWith({ id: "mem_real" }, { body: { ...GOOD, memberId: "mem_victim" } } as Partial<Request>),
      res,
    );
    expect(seen).toEqual(["mem_real"]);
    expect(captured.body).toMatchObject({ ok: true, subscription: { state: "pending" } });
  });
});

describe("claim detail route", () => {
  it("returns the member's own claim", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/claims/:claimId").handler(
      reqWith({ id: "mem_1" }, { params: { claimId: "clm_owned" } } as Partial<Request>),
      res,
    );
    expect(captured.body).toMatchObject({ ok: true, claim: { claimId: "clm_owned" } });
  });

  it("404s a foreign claim indistinguishably from a missing one", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "get", "/api/research/claims/:claimId").handler(
      reqWith({ id: "mem_1" }, { params: { claimId: "clm_foreign" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(404);
  });
});

describe("admin claim routes", () => {
  it("lists open claims behind the admin guard", async () => {
    const routes = build(
      deps({
        claimsAdmin: {
          listOpen: async () => [{ claimId: "clm_1" }],
          review: async () => ({ ok: true }),
          refund: async () => ({ ok: true }),
          replacement: async () => ({ ok: true }),
        },
      }),
    );
    const r = route(routes, "get", "/api/admin/research/claims");
    expect(r.guard).toBe(guards.requireAdmin);
    const { res, captured } = fakeRes();
    await r.handler(reqWith(undefined), res);
    expect(captured.body).toMatchObject({ ok: true, claims: [{ claimId: "clm_1" }] });
  });

  it("refuses an unknown review decision at the wire", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/claims/:claimId/review").handler(
      reqWith(undefined, { params: { claimId: "clm_1" }, body: { decision: "vaporize" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(400);
  });

  it("attributes a review to the guard-attached admin, never the body", async () => {
    const seen: Array<{ claimId: string; adminId: string; decision: string }> = [];
    const routes = build(
      deps({
        claimsAdmin: {
          listOpen: async () => [],
          review: async (claimId, adminId, decision) => {
            seen.push({ claimId, adminId, decision });
            return { ok: true, claim: { claimId } };
          },
          refund: async () => ({ ok: true }),
          replacement: async () => ({ ok: true }),
        },
      }),
    );
    const { res } = fakeRes();
    const req = reqWith(undefined, {
      params: { claimId: "clm_1" },
      body: { decision: "approved", adminId: "attacker" },
    } as Partial<Request>);
    (req as unknown as { adminEmail: string }).adminEmail = "samuel@xenios.example";
    await route(routes, "post", "/api/admin/research/claims/:claimId/review").handler(req, res);
    expect(seen).toEqual([{ claimId: "clm_1", adminId: "samuel@xenios.example", decision: "approved" }]);
  });

  it("validates the refund amount and idempotency key at the wire", async () => {
    let called = 0;
    const routes = build(
      deps({
        claimsAdmin: {
          listOpen: async () => [],
          review: async () => ({ ok: true }),
          refund: async () => {
            called += 1;
            return { ok: true };
          },
          replacement: async () => ({ ok: true }),
        },
      }),
    );
    for (const body of [
      {},
      { amountCents: 12.5, idempotencyKey: "k1" },
      { amountCents: -5, idempotencyKey: "k1" },
      { amountCents: 0, idempotencyKey: "k1" },
      { amountCents: 500, idempotencyKey: "" },
      { amountCents: "500", idempotencyKey: "k1" },
    ]) {
      const { res, captured } = fakeRes();
      await route(routes, "post", "/api/admin/research/claims/:claimId/refund").handler(
        reqWith(undefined, { params: { claimId: "clm_1" }, body } as Partial<Request>),
        res,
      );
      expect(captured.status).toBe(400);
    }
    expect(called).toBe(0);

    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/claims/:claimId/refund").handler(
      reqWith(undefined, {
        params: { claimId: "clm_1" },
        body: { amountCents: 500, idempotencyKey: "k1" },
      } as Partial<Request>),
      res,
    );
    expect(called).toBe(1);
    expect(captured.body).toMatchObject({ ok: true });
  });

  it("relays a replacement resolution", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/claims/:claimId/replacement").handler(
      reqWith(undefined, { params: { claimId: "clm_1" } } as Partial<Request>),
      res,
    );
    expect(captured.body).toMatchObject({ ok: true });
  });
});

describe("partner apply route", () => {
  const PATH = "/api/research/partner/apply";
  const GOOD = { role: "affiliate", legalName: "A Person", contactEmail: "a@example.com" };

  it("refuses an unknown role or a malformed application at the wire", async () => {
    const routes = build();
    for (const body of [
      {},
      { ...GOOD, role: "upline" },
      { ...GOOD, legalName: " " },
      { ...GOOD, contactEmail: "not-an-email" },
    ]) {
      const { res, captured } = fakeRes();
      await route(routes, "post", PATH).handler(reqWith({ id: "mem_1" }, { body } as Partial<Request>), res);
      expect(captured.status).toBe(400);
    }
  });

  it("applies for the authenticated subject, ignoring any body identity", async () => {
    const seen: string[] = [];
    const routes = build(
      deps({
        partners: {
          findByMemberId: async () => null,
          dashboardFor: async (partner) => ({ partnerId: partner.partnerId }),
          listLinks: async () => [],
          applyForMember: async (memberId) => {
            seen.push(memberId);
            return { ok: true, partner: { partnerId: "prt_new" } };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(
      reqWith({ id: "mem_real" }, { body: { ...GOOD, memberId: "mem_victim" } } as Partial<Request>),
      res,
    );
    expect(seen).toEqual(["mem_real"]);
    expect(captured.body).toMatchObject({ ok: true, partner: { partnerId: "prt_new" } });
  });
});

describe("admin partner review route", () => {
  it("refuses an unknown decision at the wire", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/partners/:partnerId/review").handler(
      reqWith(undefined, { params: { partnerId: "prt_1" }, body: { decision: "promote" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(400);
  });

  it("relays the composed decision surface", async () => {
    const routes = build();
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/partners/:partnerId/review").handler(
      reqWith(undefined, { params: { partnerId: "prt_1" }, body: { decision: "certify" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ ok: false, code: "capability_disabled" });
  });
});

describe("fulfillment webhook route", () => {
  const PATH = "/api/research/webhooks/fulfillment";

  function fulfillmentReq(options: { raw?: Buffer; body?: unknown; signature?: string }): Request {
    return {
      params: {},
      query: {},
      body: options.body ?? {},
      rawBody: options.raw,
      get: (name: string) =>
        name.toLowerCase() === "x-webhook-signature" ? options.signature : undefined,
    } as unknown as Request;
  }

  it("is not registered behind the member guards (the signature is the gate)", () => {
    const routes = build();
    const r = route(routes, "post", PATH);
    expect(r.guard).not.toBe(guards.requireActiveMember);
    expect(r.guard).not.toBe(guards.requireMember);
    expect(r.guard).not.toBe(guards.requireAdmin);
  });

  it("hands the EXACT raw bytes and the x-webhook-signature header to the handler", async () => {
    const calls: Array<{ raw: string; signature: string | undefined }> = [];
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => ({ ok: true, applied: false, eventId: "x" }),
          handleFulfillment: async (raw, signature) => {
            calls.push({ raw, signature });
            return { ok: true, applied: true, eventId: "ff_evt_1" };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    const raw = Buffer.from(
      JSON.stringify({ eventId: "ff_evt_1", fulfillmentOrderId: "ord_1", status: "delivered" }),
    );
    await route(routes, "post", PATH).handler(fulfillmentReq({ raw, signature: "sig_ff" }), res);
    expect(calls).toEqual([{ raw: raw.toString("utf8"), signature: "sig_ff" }]);
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true, applied: true, eventId: "ff_evt_1" });
  });

  it("refuses a request whose raw bytes were not captured, without calling the handler", async () => {
    let called = 0;
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => ({ ok: true, applied: false, eventId: "x" }),
          handleFulfillment: async () => {
            called += 1;
            return { ok: true, applied: false, eventId: "x" };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(fulfillmentReq({ body: { parsed: true } }), res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, code: "malformed" });
    expect(called).toBe(0);
  });

  it("maps a not-ready fulfillment capability to a retryable 503", async () => {
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => ({ ok: true, applied: false, eventId: "x" }),
          handleFulfillment: async () => ({ ok: false, code: "capability_disabled" }),
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(fulfillmentReq({ raw: Buffer.from("{}"), signature: "s" }), res);
    expect(captured.status).toBe(503);
  });

  it("maps an invalid signature to a 400 that will not be retried into success", async () => {
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => ({ ok: true, applied: false, eventId: "x" }),
          handleFulfillment: async () => ({ ok: false, code: "invalid_signature" }),
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(fulfillmentReq({ raw: Buffer.from("{}"), signature: "bad" }), res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("answers a handler crash with a 500 that leaks NOTHING about the failure", async () => {
    const routes = build(
      deps({
        webhooks: {
          handlePayment: async () => ({ ok: true, applied: false, eventId: "x" }),
          handleFulfillment: async () => {
            throw new Error("SECRET_mitch_key_123 leaked in an error message");
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", PATH).handler(fulfillmentReq({ raw: Buffer.from("{}"), signature: "s" }), res);
    expect(captured.status).toBe(500);
    expect(JSON.stringify(captured.body)).not.toContain("SECRET");
    expect(captured.body).toEqual({ ok: false, code: "webhook_error" });
  });
});

describe("admin order lifecycle routes", () => {
  it("registers all three actions behind the admin guard", () => {
    const routes = build();
    for (const action of ["approve", "capture", "cancel"]) {
      const r = route(routes, "post", `/api/admin/research/orders/:orderId/${action}`);
      expect(r.guard).toBe(guards.requireAdmin);
    }
  });

  it("attributes approve and capture to the guard-attached admin, never the body", async () => {
    const seen: Array<{ action: string; orderId: string; adminId: string }> = [];
    const routes = build(
      deps({
        ordersAdmin: {
          approve: async (orderId, adminId) => {
            seen.push({ action: "approve", orderId, adminId });
            return { ok: true, order: { orderId } };
          },
          capture: async (orderId, adminId) => {
            seen.push({ action: "capture", orderId, adminId });
            return { ok: true, order: { orderId } };
          },
          cancel: async () => ({ ok: true, order: {} }),
        },
      }),
    );
    for (const action of ["approve", "capture"]) {
      const { res } = fakeRes();
      const req = reqWith(undefined, {
        params: { orderId: "ord_9" },
        body: { adminId: "attacker" },
      } as Partial<Request>);
      (req as unknown as { adminEmail: string }).adminEmail = "samuel@xenios.example";
      await route(routes, "post", `/api/admin/research/orders/:orderId/${action}`).handler(req, res);
    }
    expect(seen).toEqual([
      { action: "approve", orderId: "ord_9", adminId: "samuel@xenios.example" },
      { action: "capture", orderId: "ord_9", adminId: "samuel@xenios.example" },
    ]);
  });

  it("refuses a cancel without a reason at the wire, calling nothing", async () => {
    let called = 0;
    const routes = build(
      deps({
        ordersAdmin: {
          approve: async () => ({ ok: true, order: {} }),
          capture: async () => ({ ok: true, order: {} }),
          cancel: async () => {
            called += 1;
            return { ok: true, order: {} };
          },
        },
      }),
    );
    for (const body of [{}, { reason: "" }, { reason: "   " }, { reason: 7 }]) {
      const { res, captured } = fakeRes();
      await route(routes, "post", "/api/admin/research/orders/:orderId/cancel").handler(
        reqWith(undefined, { params: { orderId: "ord_9" }, body } as Partial<Request>),
        res,
      );
      expect(captured.status).toBe(400);
    }
    expect(called).toBe(0);
  });

  it("passes the trimmed cancel reason through and relays the result", async () => {
    const seen: string[] = [];
    const routes = build(
      deps({
        ordersAdmin: {
          approve: async () => ({ ok: true, order: {} }),
          capture: async () => ({ ok: true, order: {} }),
          cancel: async (orderId, _adminId, reason) => {
            seen.push(reason);
            return { ok: true, order: { orderId, state: "cancelled" } };
          },
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/orders/:orderId/cancel").handler(
      reqWith(undefined, { params: { orderId: "ord_9" }, body: { reason: "  review declined  " } } as Partial<Request>),
      res,
    );
    expect(seen).toEqual(["review declined"]);
    expect(captured.body).toMatchObject({ ok: true, order: { state: "cancelled" } });
  });

  it("relays a machine-coded denial from the service", async () => {
    const routes = build(
      deps({
        ordersAdmin: {
          approve: async () => ({ ok: false, code: "order_state_invalid", codes: ["order_state_invalid"] }),
          capture: async () => ({ ok: true, order: {} }),
          cancel: async () => ({ ok: true, order: {} }),
        },
      }),
    );
    const { res, captured } = fakeRes();
    await route(routes, "post", "/api/admin/research/orders/:orderId/approve").handler(
      reqWith(undefined, { params: { orderId: "ord_9" } } as Partial<Request>),
      res,
    );
    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({ ok: false, code: "order_state_invalid" });
  });
});

describe("adminIdOf", () => {
  it("reads the guard-attached admin email", () => {
    const req = { adminEmail: "samuel@xenios.example" } as unknown as Request;
    expect(adminIdOf(req)).toBe("samuel@xenios.example");
  });
  it("falls back without ever reading the body", () => {
    const req = { body: { adminEmail: "attacker@evil.example" } } as unknown as Request;
    expect(adminIdOf(req)).toBe("admin");
  });
});
