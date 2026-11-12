import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import type { AdminProductDetail } from "@shared/research/product-admin";
import { catalogPriceFields } from "@shared/research/early-access/quote-only";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import type { MemberRow } from "../member-auth";
import { createMasterOfferingCatalogDependencies } from "./composition";
import {
  masterOfferingViewerForMember,
  pricingIdentityFromViewer,
  quoteOnlyCatalogViewer,
} from "./member-pricing-viewer";
import {
  MASTER_OFFERING_CATALOG_BASE_PATH,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  createMasterOfferingCatalogApiHandlers,
} from "./routes";
import { masterOfferingCatalogRouteTable } from "./mount";
import { InMemoryMasterOfferingCatalogReader } from "./service";
import { offering, variant } from "./test-fixtures";
import {
  MASTER_OFFERINGS_ENABLED_ENV_VAR,
  MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR,
} from "./visibility-policy";

/**
 * QUOTE-ONLY ON THE FULL MEMBER CATALOG (the three v2 catalog routes).
 *
 * These routes price for whoever the visibility policy lets in. Today that is
 * the admin and an allowlist, and one environment value opens them to every
 * member. Under the quote-only release an ordinary member is a customer, so
 * the routes must show a member no price whatever that value is: on the list,
 * on a product, and in the price-list download.
 *
 * The prices come from a pricing grant carried on the viewer. This file drives
 * the real composition and the real handlers, with the production hook that
 * turns a grant into a pricing identity, and shows that a member viewer
 * without the grant gets "Price on request" everywhere while the admin keeps
 * real prices. Synthetic values only.
 */

const ADMIN_EMAIL = "admin@example.invalid";
const MEMBER_EMAIL = "member@example.invalid";
const EVALUATED_AT = "2026-08-13T12:00:00.000Z";

const DETAIL_PATH = "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157";
const LIST_PATH = "/api/research/catalog-display/v2/catalog";
const PRICE_LIST_JSON = "/api/research/catalog-display/v2/price-list?format=json";
const PRICE_LIST_CSV = "/api/research/catalog-display/v2/price-list";

function memberRow(email: string): MemberRow {
  return {
    id: "member-1", application_id: "application-1", auth_user_id: "auth-1", email,
    first_name: "Member", status: "active", created_at: "2026-07-27T12:00:00.000Z",
  };
}

/** A Product Control product with one approved, active, in-window member price. */
function pricedProduct(): AdminProductDetail {
  return {
    id: "pc_product_1", status: "published", visibility: "public", active: true,
    variants: [{ id: "pc_variant_1", productId: "pc_product_1", status: "approved", active: true, memberEligible: true, sku: "XEN-BPC-5" }],
    prices: [{
      id: "price_1", productId: "pc_product_1", variantId: "pc_variant_1", audience: "member", amountCents: 9900,
      currency: "USD", effectiveAt: "2026-08-01T00:00:00.000Z", expiresAt: null, status: "active", approvalNote: null,
      version: 1, createdBy: "ops", approvedBy: "founder", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    }],
  } as unknown as AdminProductDetail;
}

type Scope = "all_members" | "allowlisted_member";

/**
 * The real composition and handlers. `quoteOnly` decides whether the viewer
 * passes through `quoteOnlyCatalogViewer`, exactly as server/index.ts does.
 */
function app(options: { email: string; quoteOnly: boolean; scope?: Scope }): Express {
  const scope = options.scope ?? "all_members";
  const dependencies = createMasterOfferingCatalogDependencies(
    {
      bindings: { readBinding: () => ({ offeringVariantId: "mov_a", productId: "pc_product_1", variantId: "pc_variant_1" }) },
      selections: { select: async () => ({ ok: false, code: "price_missing" }) },
      pricingSource: { readProductForPricing: async () => pricedProduct() },
      // The production hook: a pricing identity exists only for a viewer that carries a grant.
      identityFor: (viewer) => {
        const identity = pricingIdentityFromViewer(viewer);
        return identity === null ? null : { ...identity, evaluatedAt: EVALUATED_AT };
      },
      catalogReader: new InMemoryMasterOfferingCatalogReader([
        offering({ variants: [variant({ id: "mov_a", label: "5 mg vial" })] }),
      ]),
      now: () => EVALUATED_AT,
      env: {
        [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
        [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: scope === "all_members" ? "false" : "true",
        [FULL_CATALOG_VISIBILITY_ENV_VAR]: scope === "allowlisted_member" ? options.email : "",
      },
    },
    () => {
      const viewer = masterOfferingViewerForMember(memberRow(options.email), ADMIN_EMAIL);
      return options.quoteOnly ? quoteOnlyCatalogViewer(viewer) : viewer;
    },
  );
  const handlers = createMasterOfferingCatalogApiHandlers(dependencies);
  const application = express();
  application.get(MASTER_OFFERING_CATALOG_LIST_ROUTE, handlers.privateHeaders, handlers.list);
  application.get(MASTER_OFFERING_CATALOG_DETAIL_ROUTE, handlers.privateHeaders, handlers.detail);
  application.get(MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE, handlers.privateHeaders, handlers.priceList);
  application.use(MASTER_OFFERING_CATALOG_BASE_PATH, handlers.error);
  return application;
}

/** Every sign of the member price in an answer: a price field, the amount, or its display. */
function priceSigns(body: unknown, text: string): string[] {
  const signs = [...catalogPriceFields(body)];
  const raw = `${text}${JSON.stringify(body ?? "")}`;
  if (raw.includes("9900")) signs.push("the amount 9900");
  if (/\$\s?99/.test(raw)) signs.push("the display $99");
  if (/"state":"priced"/.test(raw)) signs.push('a "priced" state');
  return signs;
}

async function readAll(application: Express) {
  const list = await request(application).get(LIST_PATH);
  const detail = await request(application).get(DETAIL_PATH);
  const json = await request(application).get(PRICE_LIST_JSON);
  const csv = await request(application).get(PRICE_LIST_CSV);
  return { list, detail, json, csv };
}

describe("the full member catalog without quote-only", () => {
  it("shows a member the member price on the list, the product and both price-list downloads", async () => {
    const { list, detail, json, csv } = await readAll(app({ email: MEMBER_EMAIL, quoteOnly: false }));

    for (const response of [list, detail, json, csv]) expect(response.status).toBe(200);
    expect(detail.body.product.variants[0].price).toMatchObject({ state: "priced", amountCents: 9900, display: "$99.00" });
    expect(priceSigns(list.body, list.text).length).toBeGreaterThan(0);
    expect(json.body.pricedRowCount).toBe(1);
    expect(csv.text).toContain("$99.00");
  });
});

describe("the full member catalog under quote-only", () => {
  it("shows an ordinary member no price on any of the three routes, with the routes open to all members", async () => {
    const { list, detail, json, csv } = await readAll(app({ email: MEMBER_EMAIL, quoteOnly: true }));

    for (const response of [list, detail, json, csv]) expect(response.status).toBe(200);
    expect(priceSigns(list.body, list.text)).toEqual([]);
    expect(priceSigns(detail.body, detail.text)).toEqual([]);
    expect(priceSigns(json.body, json.text)).toEqual([]);
    expect(priceSigns(null, csv.text)).toEqual([]);

    // The product and its variant are still there, at "Price on request".
    expect(detail.body.product.variants).toHaveLength(1);
    expect(detail.body.product.variants[0].price.state).not.toBe("priced");
    expect(json.body.rowCount).toBe(1);
    expect(json.body.pricedRowCount).toBe(0);
    expect(csv.text).toContain("Price on request");
  });

  it("shows an allowlisted member no price either: the allowlist admits, it does not make staff", async () => {
    const { list, detail, json, csv } = await readAll(
      app({ email: MEMBER_EMAIL, quoteOnly: true, scope: "allowlisted_member" }),
    );

    for (const response of [list, detail, json, csv]) expect(response.status).toBe(200);
    for (const response of [list, detail, json]) expect(priceSigns(response.body, response.text)).toEqual([]);
    expect(priceSigns(null, csv.text)).toEqual([]);
  });

  it("still shows the admin real prices", async () => {
    const { detail, json, csv } = await readAll(app({ email: ADMIN_EMAIL, quoteOnly: true }));

    expect(detail.body.product.variants[0].price).toMatchObject({ state: "priced", amountCents: 9900 });
    expect(json.body.pricedRowCount).toBe(1);
    expect(csv.text).toContain("$99.00");
  });
});

describe("the full-catalog route table", () => {
  it("has exactly the three data routes this file calls, so a fourth cannot be added unswept", () => {
    const table = masterOfferingCatalogRouteTable({
      authorizeViewer: () => null,
      serviceForViewer: () => {
        throw new Error("not called");
      },
    } as never);
    const data = table.filter((route) => route.method !== "options").map((route) => `${route.method} ${route.path}`).sort();
    expect(data).toEqual([
      `get ${MASTER_OFFERING_CATALOG_LIST_ROUTE}`,
      `get ${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}`,
      `get ${MASTER_OFFERING_CATALOG_DETAIL_ROUTE}`,
    ].sort());
    // Every other entry is a preflight for one of those three paths.
    const paths = new Set([MASTER_OFFERING_CATALOG_LIST_ROUTE, MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE, MASTER_OFFERING_CATALOG_DETAIL_ROUTE]);
    for (const route of table.filter((entry) => entry.method === "options")) {
      expect(paths.has(route.path as never)).toBe(true);
    }
  });
});

describe("quoteOnlyCatalogViewer", () => {
  it("withholds the pricing grant from a member and keeps who they are", () => {
    const viewer = masterOfferingViewerForMember(memberRow(MEMBER_EMAIL), ADMIN_EMAIL);
    expect(pricingIdentityFromViewer(viewer)).not.toBeNull();

    const withheld = quoteOnlyCatalogViewer(viewer);

    expect(withheld.audience).toBe("member");
    expect(withheld.email).toBe(MEMBER_EMAIL);
    expect("pricingGrant" in withheld).toBe(false);
    expect(pricingIdentityFromViewer(withheld)).toBeNull();
    // The viewer it was given is not changed.
    expect(viewer.pricingGrant).toBeDefined();
  });

  it("returns an admin viewer exactly as it was", () => {
    const viewer = masterOfferingViewerForMember(memberRow(ADMIN_EMAIL), ADMIN_EMAIL);
    expect(viewer.audience).toBe("admin");
    expect(quoteOnlyCatalogViewer(viewer)).toBe(viewer);
  });
});

describe("the production wiring", () => {
  // server/index.ts cannot be booted in a unit test, so these are source pins:
  // the weakest kind of check, and the only one this wiring can have here.
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "../../index.ts"), "utf8");

  it("passes the v2 catalog viewer through quoteOnlyCatalogViewer under the cutover constant", () => {
    const start = source.indexOf("const authorizeMasterOfferingViewer");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("};", start));
    expect(body).toContain("EARLY_ACCESS_QUOTE_ONLY_RELEASE ? quoteOnlyCatalogViewer(viewer) : viewer");
  });

  it("applies it to the v2 catalog viewer only, so the request flow still prices on the server", () => {
    expect(source.match(/quoteOnlyCatalogViewer\(/g)?.length).toBe(1);
  });
});
