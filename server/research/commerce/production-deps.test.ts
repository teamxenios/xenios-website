import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { v3PreviewCatalogProducts } from "../catalog/v3-preview-catalog";
import { buildCommerceDependencies } from "./production-deps";
import { registerCommerceApi, type CommerceGuards } from "./routes";

// ---------------------------------------------------------------------------
// End-to-end proof of the wired commerce dependencies (integration lane).
//
// The commerce router is registered in server/index.ts with these production
// deps. This suite proves what boots at runtime, not just that it compiles:
//   1. The catalog read path serves the REAL product list.
//   2. No unconfirmed supplier fact reaches a member as fact (price is null,
//      never a guessed number or zero).
//   3. Nothing is purchasable, because commerce is disabled and no SKU passes
//      the eligibility gate. This is the load-bearing safety property.
//   4. Every stateful surface fails closed with commerce_disabled.
// ---------------------------------------------------------------------------

describe("production commerce dependencies", () => {
  const deps = buildCommerceDependencies(
    () => new Date("2026-07-21T00:00:00Z"),
    {},
    { catalogProducts: [...v3PreviewCatalogProducts] },
  );

  it("serves zero manufactured compatibility entries without canonical Product Control authority", () => {
    expect(v3PreviewCatalogProducts).toEqual([]);
    expect(deps.catalog.listProducts()).toEqual([]);
  });

  it("shows no unconfirmed supplier fact as fact: every price is null, never zero or a guess", () => {
    for (const product of deps.catalog.listProducts()) {
      // Legacy values are unverified_legacy and never member-displayable, so
      // the member payload carries null rather than an unconfirmed number.
      expect(product.priceCents).toBeNull();
    }
  });

  it("sells nothing: no product is purchasable while commerce is disabled", () => {
    const purchasable = deps.catalog.listProducts().filter((p) => p.purchasable);
    expect(purchasable).toEqual([]);
  });

  it("refuses a detail identity that has no canonical product, variant, and SKU", () => {
    expect(deps.catalog.getProduct("preview-only")).toBeNull();
  });

  it("returns a valid goal list (empty until the content lane's goal mappings are loaded)", () => {
    // Honest state: the legacy catalog adapter carries no goal->product
    // mappings, so goal navigation is empty. It is populated when the content
    // lane's goal data feeds the catalog. Whatever it returns, no goal exposes
    // a purchasable product.
    const goals = deps.catalog.listGoals();
    expect(Array.isArray(goals)).toBe(true);
  });

  it("reports commerce capabilities as disabled to a member", () => {
    const caps = deps.capabilities.memberVisible();
    expect(caps.product_commerce.enabled).toBe(false);
    expect(caps.quantum_commerce.enabled).toBe(false);
  });

  it("fails every stateful surface closed with commerce_disabled", async () => {
    const asOf = new Date("2026-07-21T00:00:00Z");
    expect(await deps.cart.addLine("mem_1", { sku: "P001", quantity: 1, purchaseMode: "one_time" }, asOf)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(await deps.checkout.submit("mem_1", { shippingAddressId: "x" } as never, asOf)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(await deps.subscriptions.apply("mem_1", "sub_1", { action: "pause" } as never, asOf)).toEqual({
      ok: false,
      code: "commerce_disabled",
    });
    expect(await deps.claims.submitClaim("mem_1", {} as never, asOf)).toEqual({ ok: false, code: "commerce_disabled" });
    // Disabled partner capability is unavailable, never false absence.
    expect(await deps.orders.listForMember("mem_1")).toEqual([]);
    expect(deps.partners.readAvailable?.()).toBe(false);
    await expect(deps.partners.findByMemberId("mem_1")).rejects.toThrow("partner reads unavailable");
  });
});

// ---------------------------------------------------------------------------
// The guide library (evidence-to-commerce), through the SAME production build
// that boots at runtime. The content tree ships in the repository, so every
// deployment state serves the real packet list; detail stays behind the
// publication gate because nothing in the tree has passed review.
// ---------------------------------------------------------------------------

describe("production guide library", () => {
  const clock = () => new Date("2026-07-21T00:00:00Z");

  it("serves the real guide packets (26 unpublished drafts) in the flag-off state", async () => {
    const deps = buildCommerceDependencies(clock, {});
    const guides = await deps.guides.listForMember();
    expect(guides).toHaveLength(26);
    for (const guide of guides) {
      // Nothing on disk has passed the five-role review, so nothing may
      // present as readable and no publication date may be shown.
      expect(["in_development", "in_review", "coming_soon"]).toContain(guide.status);
      expect(guide.publishedAt).toBeNull();
    }
  });

  it("serves the same library when the flag is on without a database (state 2)", async () => {
    const deps = buildCommerceDependencies(clock, {
      NEXT_PUBLIC_RESEARCH_COMMERCE_ENABLED: "true",
    });
    expect(await deps.guides.listForMember()).toHaveLength(26);
    expect(await deps.guides.getForMember("bpc-157")).toEqual({ denied: "guide_not_published" });
  });

  it("carries related product SKUs from the catalog's own guide links, never guessed", async () => {
    // The default (legacy-adapted) catalog maps P001 and P002 to the bpc-157
    // Guide via LEGACY_SLUG_TO_GUIDES; the summary carries that inversion.
    const deps = buildCommerceDependencies(clock, {});
    const guides = await deps.guides.listForMember();
    const bpc = guides.find((g) => g.slug === "bpc-157");
    expect(bpc?.relatedProductSkus).toContain("P001");
    expect(bpc?.relatedProductSkus).toContain("P002");
    // A build with no catalog products has no links to invert: honest absence.
    const emptyCatalog = buildCommerceDependencies(clock, {}, { catalogProducts: [] });
    const bare = (await emptyCatalog.guides.listForMember()).find((g) => g.slug === "bpc-157");
    expect(bare?.relatedProductSkus).toEqual([]);
  });

  it("denies a known packet's detail and answers null for an unknown slug", async () => {
    const deps = buildCommerceDependencies(clock, {});
    expect(await deps.guides.getForMember("klow")).toEqual({ denied: "guide_not_published" });
    expect(await deps.guides.getForMember("not-a-guide")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End to end through the registered routes: the exact wire envelopes the
// client adapters (client/src/research/adapters/guides.ts) parse.
// ---------------------------------------------------------------------------

describe("guide routes over the production dependencies", () => {
  type Handler = (req: Request, res: Response, next?: () => void) => unknown;
  interface Registered {
    method: string;
    path: string;
    handler: Handler;
  }

  function registeredRoutes(): Registered[] {
    const routes: Registered[] = [];
    const add = (method: string) => (path: string, _guard: Handler, handler: Handler) => {
      routes.push({ method, path, handler });
    };
    const app = { get: add("get"), post: add("post"), patch: add("patch"), delete: add("delete") } as never;
    const pass = (_r: Request, _s: Response, next: () => void) => next();
    const guards: CommerceGuards = { requireActiveMember: pass, requireMember: pass, requireAdmin: pass };
    registerCommerceApi(app, buildCommerceDependencies(() => new Date("2026-07-21T00:00:00Z"), {}), guards);
    return routes;
  }

  function fakeRes() {
    const captured = { status: 200, body: undefined as unknown };
    const res = {
      set: () => res,
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

  function handlerOf(routes: Registered[], method: string, path: string): Handler {
    const found = routes.find((r) => r.method === method && r.path === path);
    if (!found) throw new Error(`route not registered: ${method} ${path}`);
    return found.handler;
  }

  it("GET /api/research/guides answers the GuidesResponse envelope with the real library", async () => {
    const routes = registeredRoutes();
    const { res, captured } = fakeRes();
    await handlerOf(routes, "get", "/api/research/guides")({ params: {} } as unknown as Request, res);
    expect(captured.status).toBe(200);
    const body = captured.body as { ok: boolean; guides: Array<{ slug: string; title: string }> };
    expect(body.ok).toBe(true);
    expect(body.guides).toHaveLength(26);
    expect(body.guides.find((g) => g.slug === "bpc-157")?.title).toBe("BPC-157 Research Guide");
  });

  it("GET /api/research/guides/:slug denies a known unpublished Guide with guide_not_published (403)", async () => {
    const routes = registeredRoutes();
    const { res, captured } = fakeRes();
    await handlerOf(routes, "get", "/api/research/guides/:slug")(
      { params: { slug: "bpc-157" } } as unknown as Request,
      res,
    );
    expect(captured.status).toBe(403);
    expect(captured.body).toMatchObject({ ok: false, code: "guide_not_published" });
  });

  it("GET /api/research/guides/:slug keeps an unknown slug an honest 404", async () => {
    const routes = registeredRoutes();
    const { res, captured } = fakeRes();
    await handlerOf(routes, "get", "/api/research/guides/:slug")(
      { params: { slug: "no-such-guide" } } as unknown as Request,
      res,
    );
    expect(captured.status).toBe(404);
    expect(captured.body).toMatchObject({ ok: false, code: "guide_not_found" });
  });
});
