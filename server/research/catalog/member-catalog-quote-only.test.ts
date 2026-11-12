import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { catalogPriceFields } from "@shared/research/early-access/quote-only";
import type { MemberCatalog, MemberProductDetail } from "@shared/research/member-catalog";
import type { MemberRow } from "../member-auth";
import { registerMemberCatalogApi } from "./member-catalog-routes";
import type { MemberCatalogService } from "./member-catalog-service";

/**
 * QUOTE-ONLY AT THE MEMBER CATALOG ROUTES.
 *
 * An ordinary signed-in member is a customer, not staff. Under the quote-only
 * release the two member catalog routes answer with no member price and no
 * cart selection (a selection carries the same price). The service still
 * prices on the server; only the answer changes, at the route. Without the
 * option the routes answer exactly as before. Synthetic values only.
 */

const LIST = "/api/research/member/products";
const DETAIL = "/api/research/member/products/product-a";
const AT = "2026-07-26T22:00:00.000Z";

const MEMBER: MemberRow = {
  id: "member-1", application_id: "application-1", auth_user_id: "auth-1",
  email: "member@example.invalid", first_name: "Member", status: "active", created_at: "2026-07-27T12:00:00.000Z",
};

const price = { id: "price-a", amountCents: 14900, currency: "USD", effectiveAt: "2026-07-01T00:00:00.123Z", expiresAt: null, version: 2 };
const readiness = {
  ready: true, verifiedInputCount: 1,
  inputVersions: [{ id: "input-a", version: 1 }], domainVersions: [{ domain: "products", version: 1 }],
};
const media = {
  mediaId: "media-a", productId: "product-a", href: "https://media.xeniostechnology.com/media-a",
  altText: "Product A package", filename: "product-a.webp", sourceVersion: "media-v1",
  policy: "xenios_public_media_v1", expiresAt: null,
};
const selection = {
  productId: "product-a", variantId: "variant-a", sku: "SKU-A", audience: "member",
  audienceEligibility: { audience: "member", state: "authorized", sourceVersion: "member-v1", evaluatedAt: AT },
  price,
  media: { id: "media-a", kind: "primary_image", altText: "Product A package" },
  canonicalReadiness: readiness,
  inventoryEligibility: { productId: "product-a", variantId: "variant-a", state: "eligible", sourceVersion: "inventory-v1", evaluatedAt: AT },
  evaluatedAt: AT,
};
const card = {
  id: "product-a", slug: "product-a", displayName: "Product A", aliases: ["A-1"], lane: "research_material",
  category: "Research", classification: "Research material", summary: "Reviewed summary.",
  displayState: "available", media, price, readiness, selection, variantCount: 1, updatedAt: AT,
};
const CATALOG = {
  audience: "member", currency: "USD", evaluatedAt: AT, items: [card], categories: ["Research"], lanes: ["research_material"],
} as unknown as MemberCatalog;
const PRODUCT = {
  ...card, audience: "member", currency: "USD", evaluatedAt: AT, canonicalName: "Product A",
  overview: "Reviewed overview.", specifications: "Reviewed specifications.", researchInformation: null,
  storageInformation: null, shippingInformation: null, returnInformation: null, disclaimers: "Research use only.",
  reviewDate: "2026-07-20",
  variants: [{
    id: "variant-a", productId: "product-a", sku: "SKU-A", label: "Standard", strength: "10 mg", size: null,
    format: "Vial", presentation: "Single unit", shippingClass: "standard", price,
    availability: "available", lotCoaState: "verified", selection, selectionFailure: null,
  }],
  relatedProducts: [], researchOnlyBoundary: true,
} as unknown as MemberProductDetail;

type Options = Parameters<typeof registerMemberCatalogApi>[3];

function appWith(options: Options | "omit", overrides: Partial<Pick<MemberCatalogService, "list" | "detail">> = {}, member: MemberRow | null = MEMBER) {
  const app = express();
  const service = {
    list: async () => CATALOG,
    detail: async () => PRODUCT,
    ...overrides,
  } as unknown as MemberCatalogService;
  const guard = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (member) (req as express.Request & { researchMember: MemberRow }).researchMember = member;
    next();
  };
  if (options === "omit") registerMemberCatalogApi(app, service, guard);
  else registerMemberCatalogApi(app, service, guard, options);
  return app;
}

describe("the member catalog routes under quote-only", () => {
  it("answer the list with no member price and no cart selection", async () => {
    const response = await request(appWith({ quoteOnly: true })).get(LIST);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.catalog.items).toHaveLength(1);
    expect(catalogPriceFields(response.body)).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain("14900");
    expect(response.body.catalog.items[0]).toMatchObject({
      id: "product-a", displayName: "Product A", summary: "Reviewed summary.",
      displayState: "catalog_only", price: null, selection: null,
    });
  });

  it("answer the detail with no member price on the product or any variant", async () => {
    const response = await request(appWith({ quoteOnly: true })).get(DETAIL);

    expect(response.status).toBe(200);
    expect(catalogPriceFields(response.body)).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain("14900");
    expect(response.body.product).toMatchObject({ displayState: "catalog_only", price: null, selection: null });
    expect(response.body.product.variants[0]).toMatchObject({
      sku: "SKU-A", strength: "10 mg", availability: "available", price: null, selection: null, selectionFailure: "price_missing",
    });
  });

  it("keep the private headers", async () => {
    const response = await request(appWith({ quoteOnly: true })).get(LIST);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("still answer a missing product, an unavailable catalog and an inactive member as before", async () => {
    const missing = await request(appWith({ quoteOnly: true }, { detail: async () => null })).get(DETAIL);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ ok: false, code: "product_not_found" });

    const failing = async () => { throw new Error("synthetic outage"); };
    const down = await request(appWith({ quoteOnly: true }, { list: failing as never })).get(LIST);
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ ok: false, code: "member_catalog_unavailable" });

    const inactive = await request(appWith({ quoteOnly: true }, {}, null)).get(LIST);
    expect(inactive.status).toBe(403);
    expect(inactive.body).toEqual({ ok: false, code: "membership_inactive" });
  });
});

describe("the member catalog routes without quote-only", () => {
  it("answer exactly as before, with the member price, when the option is absent or false", async () => {
    for (const options of ["omit", {}, { quoteOnly: false }] as const) {
      const list = await request(appWith(options)).get(LIST);
      expect(list.body.catalog.items[0]).toMatchObject({ displayState: "available", price: { amountCents: 14900 } });
      expect(list.body.catalog.items[0].selection.price.amountCents).toBe(14900);

      const detail = await request(appWith(options)).get(DETAIL);
      expect(detail.body.product.variants[0]).toMatchObject({ price: { amountCents: 14900 }, selectionFailure: null });
    }
  });
});

describe("the production wiring", () => {
  it("passes the cutover constant to the member catalog routes in server/index.ts", () => {
    // server/index.ts cannot be booted in a unit test, so this is a source pin:
    // the weakest kind of check, and the only one this wiring can have here.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "../../index.ts"), "utf8");
    const start = source.search(/registerMemberCatalogApi\(\s*app,/);
    expect(start).toBeGreaterThan(-1);
    const call = source.slice(start, source.indexOf(");", start));
    expect(call).toContain("requireActiveMember");
    expect(call).toContain("{ quoteOnly: EARLY_ACCESS_QUOTE_ONLY_RELEASE }");
  });
});
