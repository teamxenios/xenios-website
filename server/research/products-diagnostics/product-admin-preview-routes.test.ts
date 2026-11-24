import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { ProductAdminService } from "./product-admin";
import { registerProductAdminApi } from "./product-admin-routes";
import { createCatalogContentPreview } from "./catalog-content-preview";

const P = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222";
const product = { id: P, variants: [{ id: V, productId: P }] } as AdminProductDetail;
const read = vi.fn<ReturnType<typeof createCatalogContentPreview>>();
beforeEach(() => {
  read.mockReset();
  read.mockImplementation(createCatalogContentPreview({
    bindings: () => ({ index: new Map(), problem: null }),
    catalog: () => { throw new Error("Missing mapping must not read public content"); },
    project: () => { throw new Error("Missing mapping must not project public content"); },
  }));
});
function fixture(injectPreview = true, publicationPilot?: { productId: string; variantId: string }) {
  const routes = new Map<string, Array<(req: any, res: any, next: () => unknown) => unknown>>();
  const guard = vi.fn((req, res, next) => req.syntheticAllowed === true ? next() : res.status(401).json({ ok: false }));
  const get = vi.fn(async () => product);
  const app = Object.fromEntries(["get", "post", "put"].map(method => [method, (path: string, ...handlers: any[]) => routes.set(`${method} ${path}`, handlers)]));
  registerProductAdminApi(app as unknown as Express, { requireAdmin: guard, service: { get } as unknown as ProductAdminService,
    publicationPilot,
    ...(injectPreview ? { readCatalogContentPreview: read } : {}),
  });
  const handlers = routes.get("get /api/admin/research/products/:productId")!;
  expect(handlers[0]).toBe(guard);
  async function request(allowed: boolean, query: Record<string, unknown> = {}) {
    const req = { syntheticAllowed: allowed, params: { productId: P }, query };
    const res = { code: 200, headers: {} as Record<string, string>, value: null as any,
      set(key: string, value: string) { this.headers[key] = value; return this; },
      status(code: number) { this.code = code; return this; }, json(value: unknown) { this.value = value; return this; } };
    const next = (i: number): unknown => handlers[i]?.(req, res, () => next(i + 1));
    await next(0); return res;
  }
  return { get, guard, request };
}
describe("existing protected product GET preview seam", () => {
  it("offers the editor only for the server-selected pair behind the existing guard", async () => {
    const f = fixture(true, { productId: P, variantId: V });
    const query = { previewVariantId: V, publicationEditorVariantId: V };
    expect((await f.request(false, query)).value).not.toHaveProperty("publicationEditorVariantId");
    expect((await f.request(true, {})).value).not.toHaveProperty("publicationEditorVariantId");
    expect((await fixture().request(true, query)).value).not.toHaveProperty("publicationEditorVariantId");
    expect((await f.request(true, { ...query, previewVariantId: P })).value).not.toHaveProperty("publicationEditorVariantId");
    expect((await fixture(true, { productId: V, variantId: V }).request(true, query)).value).not.toHaveProperty("publicationEditorVariantId");
    const response = await f.request(true, query);
    expect(response.value.catalogPreview.state).toBe("binding_missing");
    expect(response.value.publicationEditorVariantId).toBe(V);
  });
  it("fails closed without an injected reader and never invokes the preview port", async () => {
    const f = fixture(false), result = await f.request(true, { previewVariantId: V });
    expect(result.code).toBe(200); expect(result.value.catalogPreview.state).toBe("catalog_unavailable");
    expect(result.value.catalogPreview.content).toBeNull(); expect(read).not.toHaveBeenCalled();
  });
  it("runs the supplied canonical guard before either existing product or preview read", async () => {
    const f = fixture(), result = await f.request(false, { previewVariantId: V });
    expect(result.code).toBe(401); expect(f.get).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("leaves ordinary product GET unchanged when no preview query is present", async () => {
    const f = fixture(), result = await f.request(true);
    expect(f.get).toHaveBeenCalledTimes(1); expect(f.get).toHaveBeenCalledWith(P); expect(read).not.toHaveBeenCalled();
    expect(result.value.product).toBe(product); expect(result.value.catalogPreview).toBeUndefined();
    expect(result.headers["Cache-Control"]).toBe("no-store"); expect(result.headers["Referrer-Policy"]).toBe("no-referrer");
  });
  it("passes an explicit selection only after the protected service product was read", async () => {
    const f = fixture(), result = await f.request(true, { previewVariantId: V });
    expect(read).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledWith(product, V); expect(result.value.catalogPreview.state).toBe("binding_missing");
  });
  it("reaches actual reviewed content for one exact mapped pair, not only denial fixtures", async () => {
    read.mockImplementationOnce(createCatalogContentPreview({
      bindings: () => ({ index: new Map([["mo_a|mov_b", { offeringVariantId: "mov_b", productId: P, variantId: V }]]), problem: null }),
      catalog: () => [{ id: "mo_a", visibility: "member", displayName: "Synthetic approved listing", displayState: "held",
        variants: [{ id: "mov_b", visibility: "member", label: "Synthetic source label", displayState: "held" }] }] as any,
      project: () => ({ label: "Strength unconfirmed", reviewMessage: "Synthetic details remain under review.",
        reviewedContent: { summary: "Synthetic reviewed summary.", overview: "Synthetic reviewed overview." } }),
    }));
    const f = fixture(), result = await f.request(true, { previewVariantId: V });
    expect(result.value.catalogPreview.state).toBe("preview_available");
    expect(result.value.catalogPreview.identity.offeringVariantId).toBe("mov_b");
    expect(result.value.catalogPreview.identity.variantLabel).toBe("Strength unconfirmed");
    expect(result.value.catalogPreview.content.summary).toBe("Synthetic reviewed summary.");
  });
  it("does not treat an array-shaped query as a valid exact variant", async () => {
    const f = fixture(), result = await f.request(true, { previewVariantId: [V] });
    expect(result.value.catalogPreview.state).toBe("invalid_selection"); expect(result.value.catalogPreview.content).toBeNull();
  });
  it("returns a typed retryable catalog-unavailable preview inside the existing HTTP200 wrapper", async () => {
    read.mockImplementationOnce(createCatalogContentPreview({
      bindings: () => ({ index: new Map(), problem: "SYNTHETIC_BINDING_UNAVAILABLE" }),
      catalog: () => { throw new Error("Unavailable binding must not read catalog"); },
      project: () => { throw new Error("Unavailable binding must not project content"); },
    }));
    const f = fixture(), result = await f.request(true, { previewVariantId: V });
    expect(result.code).toBe(200); expect(result.value.ok).toBe(true); expect(result.value.catalogPreview.state).toBe("catalog_unavailable");
    expect(result.value.catalogPreview.productId).toBe(P); expect(result.value.catalogPreview.variantId).toBe(V);
  });
  it("stops before preview and sanitizes a product-service failure", async () => {
    const f = fixture(); f.get.mockRejectedValueOnce(new Error("PRIVATE_SERVICE_SENTINEL"));
    const result = await f.request(true, { previewVariantId: V }); expect(result.code).toBe(503);
    expect(read).not.toHaveBeenCalled(); expect(JSON.stringify(result.value)).not.toContain("PRIVATE_SERVICE_SENTINEL");
  });
});
