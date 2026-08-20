import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_STOREFRONT_CATALOG_ROUTE,
  PUBLIC_STOREFRONT_DETAIL_ROUTE,
} from "@shared/research/storefront/contract";
import type {
  MasterOfferingCatalogPage,
  MasterOfferingDetailView,
} from "@shared/research/master-offerings/contract";
import {
  publicStorefrontErrorHandler,
  publicStorefrontRouteTable,
} from "./mount";
import {
  PUBLIC_STOREFRONT_ENABLED_ENV_VAR,
  type PublicCatalogReadService,
  type PublicStorefrontApiDependencies,
} from "./routes";

/**
 * A structural stand-in for the catalog read the composition root supplies.
 *
 * Deliberately NOT the real MasterOfferingCatalogService: the repository pins
 * a boundary that the catalog lane is imported only by the composition root
 * (master-offerings/catalog-boundaries.test.ts), and this surface depends on
 * a shape rather than on that lane precisely so it stays on the right side of
 * it. Testing through the shape is also what proves the seam is honestly
 * structural — if these routes ever reached for a lane internal, this fake
 * would stop satisfying them.
 */
const PRODUCT: MasterOfferingDetailView = {
  id: "mo_p1",
  slug: "research-vials-bpc-157",
  displayName: "BPC-157",
  canonicalName: "BPC-157",
  family: "research_vials",
  familyLabel: "Research Vials",
  category: "Peptides & Research",
  subcategory: "Single peptide",
  brand: null,
  displayState: "available_now",
  displayLabel: "Available now",
  stateExplanation: "Test state explanation.",
  copyState: "needs_review",
  variantCount: 1,
  variants: [
    {
      id: "mov_v1",
      label: "10 mg vial",
      displayState: "available_now",
      displayLabel: "Available now",
      price: { state: "on_request" },
      action: { kind: "request_access", label: "Request Access", href: "/research/apply" },
    },
  ],
  priceSummary: {
    state: "none",
    variantCount: 1,
    pricedVariantCount: 0,
    currency: null,
    fromCents: null,
    toCents: null,
    display: "Price on request",
  },
  overview: null,
  disclosures: ["Research use only."],
};

function service(): PublicCatalogReadService {
  return {
    async list(query) {
      const matches =
        (query.q === undefined || /bpc/i.test(query.q)) &&
        (query.families === undefined ||
          query.families.includes("research_vials"));
      const products = matches ? [PRODUCT] : [];
      const page: MasterOfferingCatalogPage = {
        ok: true,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 24,
        total: products.length,
        totalPages: products.length,
        sort: query.sort ?? "relevance",
        products,
        facets: { families: [], states: [], categories: [] },
      };
      return page;
    },
    async detail(slug) {
      return slug === PRODUCT.slug ? PRODUCT : null;
    },
  };
}

function app(
  overrides: Partial<PublicStorefrontApiDependencies> = {},
  env: Record<string, string | undefined> = {
    [PUBLIC_STOREFRONT_ENABLED_ENV_VAR]: "true",
  },
): Express {
  const application = express();
  const dependencies: PublicStorefrontApiDependencies = {
    serviceForVisitor: overrides.serviceForVisitor ?? service,
    env,
  };
  for (const route of publicStorefrontRouteTable(dependencies)) {
    application[route.method](route.path, ...route.handlers);
  }
  application.use(
    PUBLIC_STOREFRONT_CATALOG_ROUTE,
    publicStorefrontErrorHandler(dependencies),
  );
  return application;
}

function expectPublicPrivate(headers: Record<string, string | undefined>): void {
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
}

describe("public storefront routes", () => {
  it("pins the final route shapes", () => {
    expect(PUBLIC_STOREFRONT_CATALOG_ROUTE).toBe(
      "/api/research/storefront/catalog",
    );
    expect(PUBLIC_STOREFRONT_DETAIL_ROUTE).toBe(
      "/api/research/storefront/products/:family/:slug",
    );
  });

  it("fails closed without the exact flag, before touching the service", async () => {
    const serviceForVisitor = vi.fn();
    for (const value of [undefined, "", "TRUE", "1", "yes", " true"]) {
      const response = await request(
        app({ serviceForVisitor }, { [PUBLIC_STOREFRONT_ENABLED_ENV_VAR]: value }),
      ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ ok: false, code: "storefront_closed" });
      expectPublicPrivate(response.headers);
    }
    expect(serviceForVisitor).not.toHaveBeenCalled();
  });

  it("serves the projected catalog with no auth and no member internals", async () => {
    const response = await request(app()).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    const catalog = response.body.catalog;
    expect(catalog.total).toBe(1);
    expect(catalog.products).toHaveLength(1);
    const product = catalog.products[0];
    expect(product.slug).toBe("research-vials-bpc-157");
    expect(product.displayName).toBe("BPC-157");
    expect(typeof product.action).toBe("string");
    expect(product.variants[0].price).toEqual({ state: "on_request" });
    const serialized = JSON.stringify(response.body);
    for (const secret of ['"sku"', '"href"', '"priceId"', '"audience"', '"launchScope"']) {
      expect(serialized).not.toContain(secret);
    }
    expectPublicPrivate(response.headers);
  });

  it("refuses unknown query keys and the member-only states filter", async () => {
    const surface = app();
    for (const query of ["states=available_now", "breadth=full", "audience=admin"]) {
      const response = await request(surface).get(
        `${PUBLIC_STOREFRONT_CATALOG_ROUTE}?${query}`,
      );
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("storefront_invalid_request");
    }
  });

  it("accepts the public filter surface", async () => {
    const response = await request(app()).get(
      `${PUBLIC_STOREFRONT_CATALOG_ROUTE}?q=bpc&families=research_vials&sort=name_asc&page=1&pageSize=24`,
    );
    expect(response.status).toBe(200);
    expect(response.body.catalog.total).toBe(1);
  });

  it("serves the projected detail and refuses bad addresses", async () => {
    const surface = app();
    const ok = await request(surface).get(
      "/api/research/storefront/products/research_vials/research-vials-bpc-157",
    );
    expect(ok.status).toBe(200);
    expect(ok.body.product.displayName).toBe("BPC-157");
    expect(Array.isArray(ok.body.product.disclosures)).toBe(true);

    const badFamily = await request(surface).get(
      "/api/research/storefront/products/not_a_family/research-vials-bpc-157",
    );
    expect(badFamily.status).toBe(400);

    const wrongFamily = await request(surface).get(
      "/api/research/storefront/products/blends/research-vials-bpc-157",
    );
    expect(wrongFamily.status).toBe(404);
    expect(wrongFamily.body.code).toBe("storefront_not_found");

    const missing = await request(surface).get(
      "/api/research/storefront/products/research_vials/never-heard-of-it",
    );
    expect(missing.status).toBe(404);
  });

  it("answers an honest 503 when the composition throws", async () => {
    const response = await request(
      app({
        serviceForVisitor: () => {
          throw new Error("dataset offline");
        },
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("storefront_unavailable");
  });

  it("answers OPTIONS with the read-only allowance, flag permitting", async () => {
    const on = await request(app()).options(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(on.status).toBe(204);
    expect(on.headers.allow).toBe("GET, HEAD, OPTIONS");
    const off = await request(app({}, {})).options(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(off.status).toBe(503);
  });
});
