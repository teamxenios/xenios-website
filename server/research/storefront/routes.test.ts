import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_STOREFRONT_CATALOG_ROUTE,
  PUBLIC_STOREFRONT_DETAIL_ROUTE,
} from "@shared/research/storefront/contract";
import type {
  MasterOfferingCardView,
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
import {
  publicStorefrontCardCopyDigest,
  publicStorefrontDetailCopyDigest,
  type PublicStorefrontPublicationRecord,
  type PublicStorefrontPublicationSnapshot,
} from "./publication";

const NOW = "2026-08-28T14:00:00.000Z";
const VALID_UNTIL = "2026-08-28T14:00:10.000Z";
const CATALOG_REVISION_ID = "catalog-20260828-1";
const AUTHORITY_REVISION_ID = "authority-20260828-1";

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
  copyState: "approved",
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

function product(
  id: string,
  overrides: Partial<MasterOfferingDetailView> = {},
): MasterOfferingDetailView {
  const slug = `research-vials-${id}`;
  const variants = PRODUCT.variants.map((variant, index) => ({
    ...variant,
    id: `${id}-variant-${index + 1}`,
  }));
  return {
    ...PRODUCT,
    id,
    slug,
    displayName: `Product ${id}`,
    canonicalName: `Product ${id}`,
    variants,
    variantCount: variants.length,
    ...overrides,
  };
}

function publicationRecord(
  product: MasterOfferingDetailView,
  overrides: Partial<PublicStorefrontPublicationRecord> = {},
): PublicStorefrontPublicationRecord {
  return {
    offeringId: product.id,
    family: product.family,
    slug: product.slug,
    state: "published",
    publicationRevisionId: `publication-${product.id}`,
    copyRevisionId: `copy-${product.id}`,
    cardCopyDigest: publicStorefrontCardCopyDigest(product),
    detailCopyDigest: publicStorefrontDetailCopyDigest(product),
    publishedAt: "2026-08-28T13:58:00.000Z",
    effectiveAt: "2026-08-28T13:59:00.000Z",
    expiresAt: null,
    revokedAt: null,
    supersededAt: null,
    ...overrides,
  };
}

function publicationSnapshot(
  records: readonly PublicStorefrontPublicationRecord[] = [
    publicationRecord(PRODUCT),
  ],
  overrides: Partial<PublicStorefrontPublicationSnapshot> = {},
): PublicStorefrontPublicationSnapshot {
  return {
    schemaVersion: 1,
    authorityRevisionId: AUTHORITY_REVISION_ID,
    catalogRevisionId: CATALOG_REVISION_ID,
    readAt: NOW,
    validUntil: VALID_UNTIL,
    records,
    ...overrides,
  };
}

function authority(
  snapshot: unknown = publicationSnapshot(),
): PublicStorefrontApiDependencies["publicationAuthority"] {
  return { readCurrentSnapshot: () => snapshot };
}

function service(
  products: readonly MasterOfferingCardView[] = [PRODUCT],
  details: readonly MasterOfferingDetailView[] = [PRODUCT],
): PublicCatalogReadService {
  return {
    async readCandidates() {
      return {
        schemaVersion: 1,
        catalogRevisionId: CATALOG_REVISION_ID,
        products,
      };
    },
    async readDetail(input) {
      return (
        details.find(
          (product) =>
            product.id === input.offeringId &&
            product.family === input.family &&
            product.slug === input.slug,
        ) ?? null
      );
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
    publicationAuthority: overrides.publicationAuthority ?? authority(),
    now: overrides.now ?? (() => NOW),
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

  it("filters publication before totals, facets, sorting, and pagination", async () => {
    const draft = product("draft", {
      category: "Draft category",
      copyState: "draft",
    });
    const heldBase = product("held", {
      category: "Held category",
      copyState: "approved",
      displayState: "available_now",
    });
    const held: MasterOfferingDetailView = {
      ...heldBase,
      variants: [
        {
          ...heldBase.variants[0],
          price: {
            state: "priced",
            amountCents: 99_900,
            currency: "USD",
            display: "$999.00",
            basis: "exact_listed_unit",
            priceId: "price-held",
            priceVersion: 1,
            effectiveAt: "2026-08-28T13:00:00.000Z",
            expiresAt: null,
          },
          action: {
            kind: "add_to_cart",
            label: "Add to Cart",
            productId: "active-product",
            variantId: "active-variant",
            sku: "ACTIVE-SKU",
            amount: { amountCents: 99_900, currency: "USD" },
            evaluatedAt: "2026-08-28T13:59:00.000Z",
          },
        },
      ],
      priceSummary: {
        state: "single",
        variantCount: 1,
        pricedVariantCount: 1,
        currency: "USD",
        fromCents: 99_900,
        toCents: 99_900,
        display: "$999.00",
      },
    };
    const unpublished = product("unpublished", {
      category: "Unpublished category",
      copyState: "needs_review",
    });
    const unknown = product("unknown", {
      category: "Unknown category",
      copyState: "missing",
    });
    const records = [
      publicationRecord(PRODUCT),
      publicationRecord(draft, { state: "draft" }),
      publicationRecord(held, { state: "held" }),
      publicationRecord(unpublished, { state: "unpublished" }),
      publicationRecord(unknown, { state: "unknown" }),
    ];
    const response = await request(
      app({
        publicationAuthority: authority(publicationSnapshot(records)),
        serviceForVisitor: () =>
          service([PRODUCT, draft, held, unpublished, unknown]),
      }),
    ).get(`${PUBLIC_STOREFRONT_CATALOG_ROUTE}?pageSize=1&page=1`);

    expect(response.status).toBe(200);
    expect(response.body.catalog.total).toBe(1);
    expect(response.body.catalog.totalPages).toBe(1);
    expect(response.body.catalog.products.map((entry: { slug: string }) => entry.slug)).toEqual([
      PRODUCT.slug,
    ]);
    expect(
      response.body.catalog.facets.families.reduce(
        (sum: number, bucket: { count: number }) => sum + bucket.count,
        0,
      ),
    ).toBe(1);
    expect(
      response.body.catalog.facets.categories.map(
        (bucket: { label: string }) => bucket.label,
      ),
    ).toEqual([PRODUCT.category]);
    const serialized = JSON.stringify(response.body);
    for (const marker of [
      "Draft category",
      "Held category",
      "Unpublished category",
      "Unknown category",
      "ACTIVE-SKU",
      "$999.00",
    ]) {
      expect(serialized).not.toContain(marker);
    }

    const beyond = await request(
      app({
        publicationAuthority: authority(publicationSnapshot(records)),
        serviceForVisitor: () =>
          service([PRODUCT, draft, held, unpublished, unknown]),
      }),
    ).get(`${PUBLIC_STOREFRONT_CATALOG_ROUTE}?pageSize=1&page=2`);
    expect(beyond.status).toBe(200);
    expect(beyond.body.catalog.total).toBe(1);
    expect(beyond.body.catalog.products).toEqual([]);
  });

  it("never infers publication from catalog presence, activation, price, or workflow state", async () => {
    const active = product("looks-live", {
      copyState: "approved",
      displayState: "available_now",
      displayLabel: "Available now",
    });
    const response = await request(
      app({
        publicationAuthority: authority(
          publicationSnapshot([
            publicationRecord(active, { state: "held" }),
          ]),
        ),
        serviceForVisitor: () => service([active]),
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(response.status).toBe(200);
    expect(response.body.catalog.total).toBe(0);
    expect(response.body.catalog.products).toEqual([]);
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

  it("authorizes an exact current address before performing any detail lookup", async () => {
    for (const state of ["draft", "held", "unpublished", "unknown"] as const) {
      const readDetail = vi.fn();
      const serviceForVisitor = vi.fn(() => ({
        readCandidates: vi.fn(),
        readDetail,
      }));
      const response = await request(
        app({
          publicationAuthority: authority(
            publicationSnapshot([publicationRecord(PRODUCT, { state })]),
          ),
          serviceForVisitor,
        }),
      ).get(
        "/api/research/storefront/products/research_vials/research-vials-bpc-157",
      );
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        ok: false,
        code: "storefront_not_found",
      });
      expect(serviceForVisitor).not.toHaveBeenCalled();
      expect(readDetail).not.toHaveBeenCalled();
    }
  });

  it("rejects revoked, superseded, and expired publication evidence before detail", async () => {
    const evidence = [
      { revokedAt: "2026-08-28T13:59:30.000Z" },
      { supersededAt: "2026-08-28T13:59:30.000Z" },
      { expiresAt: "2026-08-28T13:59:59.000Z" },
    ];
    for (const override of evidence) {
      const serviceForVisitor = vi.fn(service);
      const response = await request(
        app({
          publicationAuthority: authority(
            publicationSnapshot([publicationRecord(PRODUCT, override)]),
          ),
          serviceForVisitor,
        }),
      ).get(
        "/api/research/storefront/products/research_vials/research-vials-bpc-157",
      );
      expect(response.status).toBe(404);
      expect(serviceForVisitor).not.toHaveBeenCalled();
    }
  });

  it("refuses malformed or stale authority as unavailable without touching the catalog", async () => {
    const malformedRecord = {
      ...publicationRecord(PRODUCT),
      cardCopyDigest: "not-a-digest",
    };
    const malformedService = vi.fn(service);
    const malformed = await request(
      app({
        publicationAuthority: authority(
          publicationSnapshot([malformedRecord as PublicStorefrontPublicationRecord]),
        ),
        serviceForVisitor: malformedService,
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(malformed.status).toBe(503);
    expect(malformed.body.code).toBe("storefront_unavailable");
    expect(malformedService).not.toHaveBeenCalled();

    const staleService = vi.fn(service);
    const stale = await request(
      app({
        publicationAuthority: authority(
          publicationSnapshot(undefined, {
            readAt: "2026-08-28T13:59:40.000Z",
            validUntil: "2026-08-28T13:59:50.000Z",
          }),
        ),
        serviceForVisitor: staleService,
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(stale.status).toBe(503);
    expect(staleService).not.toHaveBeenCalled();
  });

  it("rejects stale catalog revisions, aggregate-shaped source poisoning, and copy drift", async () => {
    const wrongRevision = await request(
      app({
        serviceForVisitor: () => ({
          readCandidates: () => ({
            schemaVersion: 1,
            catalogRevisionId: "catalog-stale",
            products: [PRODUCT],
          }),
          readDetail: () => PRODUCT,
        }),
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(wrongRevision.status).toBe(503);

    const poisoned = await request(
      app({
        serviceForVisitor: () => ({
          readCandidates: () => ({
            schemaVersion: 1,
            catalogRevisionId: CATALOG_REVISION_ID,
            products: [PRODUCT],
            total: 999,
            facets: { families: [{ value: "supplements", count: 999 }] },
          }),
          readDetail: () => PRODUCT,
        }),
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(poisoned.status).toBe(503);

    const drifted = await request(
      app({
        serviceForVisitor: () =>
          service([PRODUCT], [
            { ...PRODUCT, overview: "Unapproved post-publication edit." },
          ]),
      }),
    ).get(
      "/api/research/storefront/products/research_vials/research-vials-bpc-157",
    );
    expect(drifted.status).toBe(503);
    expect(drifted.body.code).toBe("storefront_unavailable");
  });

  it("fails closed on authority and catalog dependency failures", async () => {
    const serviceForVisitor = vi.fn(service);
    const authorityFailure = await request(
      app({
        publicationAuthority: {
          readCurrentSnapshot: () => {
            throw new Error("publication database offline");
          },
        },
        serviceForVisitor,
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(authorityFailure.status).toBe(503);
    expect(serviceForVisitor).not.toHaveBeenCalled();

    const sourceFailure = await request(
      app({
        serviceForVisitor: () => ({
          readCandidates: () => {
            throw new Error("catalog offline");
          },
          readDetail: () => PRODUCT,
        }),
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(sourceFailure.status).toBe(503);
  });

  it("re-authorizes after the source read and refuses a mid-request revocation", async () => {
    const snapshots = [
      publicationSnapshot(),
      publicationSnapshot([
        publicationRecord(PRODUCT, {
          revokedAt: "2026-08-28T14:00:00.000Z",
        }),
      ]),
    ];
    let read = 0;
    const response = await request(
      app({
        publicationAuthority: {
          readCurrentSnapshot: () => snapshots[Math.min(read++, 1)],
        },
      }),
    ).get(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "storefront_unavailable",
    });
    expect(read).toBe(2);
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

  it("cannot construct a mounted route table without the durable authority", () => {
    expect(() =>
      publicStorefrontRouteTable({
        serviceForVisitor: service,
      } as PublicStorefrontApiDependencies),
    ).toThrow(/durable publication dependencies required/);
  });

  it("answers OPTIONS with the read-only allowance, flag permitting", async () => {
    const on = await request(app()).options(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(on.status).toBe(204);
    expect(on.headers.allow).toBe("GET, HEAD, OPTIONS");
    const off = await request(app({}, {})).options(PUBLIC_STOREFRONT_CATALOG_ROUTE);
    expect(off.status).toBe(503);
  });
});
