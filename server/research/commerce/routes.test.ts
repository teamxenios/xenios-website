import { describe, expect, it, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { registerCommerceApi, subjectOf, toPartnerSelfDto, type CommerceDependencies, type PartnerSelfSource } from "./routes";

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
    subscriptions: { listForMember: async () => [], apply: async () => ({ ok: true }) },
    claims: { submitClaim: async () => ({ ok: true, claim: {} }), listForMember: async () => [] },
    storeCredit: { forMember: async (memberId) => ({ owner: memberId }) },
    partners: {
      findByMemberId: async (memberId) => (memberId === "mem_1" ? PARTNER_SOURCE : null),
      dashboardFor: async (partnerId) => ({ partnerId }),
      listLinks: async () => [],
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
          dashboardFor: async (partnerId) => {
            seen.push(partnerId);
            return { partnerId };
          },
          listLinks: async () => [],
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
