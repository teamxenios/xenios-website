import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { FULL_CATALOG_VISIBILITY_ENV_VAR } from "../catalog-display/visibility";
import {
  createMasterOfferingCatalogDependencies,
  type MasterOfferingCompositionInput,
} from "./composition";
import {
  MASTER_OFFERING_CATALOG_BASE_PATH,
  MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
  MASTER_OFFERING_CATALOG_LIST_ROUTE,
  MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
  createMasterOfferingCatalogApiHandlers,
} from "./routes";
import { InMemoryMasterOfferingCatalogReader } from "./service";
import { offering, variant } from "./test-fixtures";
import { cartSelection } from "./testing/cart-selection.test-support";
import {
  MASTER_OFFERINGS_ENABLED_ENV_VAR,
  MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR,
  MASTER_OFFERINGS_MANUAL_PURCHASE_ENV_VAR,
} from "./visibility-policy";

const FOUNDER = "founder@example.com";
const EVALUATED_AT = "2026-08-13T12:00:00.000Z";

const PRODUCT = offering({
  variants: [variant({ id: "mov_a", label: "5 mg vial" })],
});

const BINDING = {
  offeringVariantId: "mov_a",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
};

/** A Product Control product with one approved, active, in-window price. */
function pricedProduct(): AdminProductDetail {
  return {
    id: "pc_product_1",
    status: "published",
    visibility: "public",
    active: true,
    variants: [
      {
        id: "pc_variant_1",
        productId: "pc_product_1",
        status: "approved",
        active: true,
        memberEligible: true,
        sku: "XEN-BPC-5",
      },
    ],
    prices: [
      {
        id: "price_1",
        productId: "pc_product_1",
        variantId: "pc_variant_1",
        audience: "member",
        amountCents: 9900,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        status: "active",
        approvalNote: null,
        version: 1,
        createdBy: "ops",
        approvedBy: "founder",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  } as unknown as AdminProductDetail;
}

function input(
  overrides: Partial<MasterOfferingCompositionInput> = {},
): MasterOfferingCompositionInput {
  return {
    bindings: { readBinding: () => BINDING },
    selections: { select: async () => ({ ok: false, code: "price_missing" }) },
    pricingSource: { readProductForPricing: async () => pricedProduct() },
    identityFor: () => ({
      audience: "member",
      sourceVersion: "audience-v1",
      evaluatedAt: EVALUATED_AT,
      currency: "USD",
    }),
    catalogReader: new InMemoryMasterOfferingCatalogReader([PRODUCT]),
    now: () => EVALUATED_AT,
    ...overrides,
  };
}

function app(
  overrides: Partial<MasterOfferingCompositionInput> = {},
  env: Record<string, string | undefined> = {},
): Express {
  const dependencies = createMasterOfferingCatalogDependencies(
    {
      ...input(overrides),
      env: {
        [MASTER_OFFERINGS_ENABLED_ENV_VAR]: "true",
        [MASTER_OFFERINGS_FOUNDER_ADMIN_ONLY_ENV_VAR]: "true",
        [FULL_CATALOG_VISIBILITY_ENV_VAR]: FOUNDER,
        ...env,
      },
    },
    () => ({ audience: "member" as const, email: FOUNDER }),
  );
  const handlers = createMasterOfferingCatalogApiHandlers(dependencies);
  const application = express();
  application.get(
    MASTER_OFFERING_CATALOG_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.list,
  );
  application.get(
    MASTER_OFFERING_CATALOG_DETAIL_ROUTE,
    handlers.privateHeaders,
    handlers.detail,
  );
  application.get(
    MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE,
    handlers.privateHeaders,
    handlers.priceList,
  );
  application.use(MASTER_OFFERING_CATALOG_BASE_PATH, handlers.error);
  return application;
}

const DETAIL_PATH =
  "/api/research/catalog-display/v2/products/research_vials/research-vials-bpc-157";

describe("composition", () => {
  it("serves a priced catalog end to end through the real adapters", async () => {
    const response = await request(app()).get(DETAIL_PATH);
    expect(response.status).toBe(200);
    const [entry] = response.body.product.variants;
    // The price came from the authoritative resolver via a real binding.
    expect(entry.price).toMatchObject({
      state: "priced",
      amountCents: 9900,
      currency: "USD",
      display: "$99.00",
    });
    // Product Control declined the selection, so it is still not purchasable.
    expect(entry.action.kind).toBe("request_access");
  });

  it("shows Add to Cart only when Product Control actually authorizes it", async () => {
    const response = await request(
      app({
        selections: {
          select: async () => ({
            ok: true,
            selection: await cartSelection({
              productId: "pc_product_1",
              variantId: "pc_variant_1",
              sku: "XEN-BPC-5",
              evaluatedAt: EVALUATED_AT,
            }),
          }),
        } as never,
      }),
    ).get(DETAIL_PATH);
    expect(response.body.product.variants[0].action.kind).toBe("add_to_cart");
  });

  it("builds a fresh service per request so a price memo cannot go stale", async () => {
    const readProductForPricing = vi.fn(async () => pricedProduct());
    const application = app({ pricingSource: { readProductForPricing } });
    await request(application).get(DETAIL_PATH);
    const afterFirst = readProductForPricing.mock.calls.length;
    await request(application).get(DETAIL_PATH);
    // A process-lifetime service would have answered the second request from
    // the first request's memo and never re-read the authority.
    expect(readProductForPricing.mock.calls.length).toBeGreaterThan(afterFirst);
  });

  it("reads the price and the selection at one instant", async () => {
    const select = vi.fn(async () => ({ ok: false as const, code: "price_missing" as const }));
    await request(app({ selections: { select } })).get(DETAIL_PATH);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ evaluatedAt: EVALUATED_AT, currency: "USD" }),
      // The session's audience fact travels beside the request and shares its
      // instant, so a selection can never be authorized at one moment and
      // priced at another.
      expect.objectContaining({
        audienceEligibility: expect.objectContaining({
          audience: "member",
          state: "authorized",
          evaluatedAt: EVALUATED_AT,
        }),
      }),
    );
  });

  it("shows no price when the session supplies no identity", async () => {
    const response = await request(app({ identityFor: () => null })).get(
      DETAIL_PATH,
    );
    expect(response.status).toBe(200);
    expect(response.body.product.variants[0].price.state).toBe("on_request");
    expect(response.body.product.variants[0].action.kind).toBe("request_access");
  });

  it("shows no price when the authorization fact is malformed", async () => {
    const response = await request(
      app({
        identityFor: () => ({
          audience: "member",
          sourceVersion: "   ",
          evaluatedAt: EVALUATED_AT,
          currency: "USD",
        }),
      }),
    ).get(DETAIL_PATH);
    expect(response.body.product.variants[0].price.state).toBe("on_request");
  });

  it("answers unavailable, never empty, when no dataset is configured", async () => {
    const response = await request(
      app(
        {
          catalogReader: undefined,
          // Genuinely nothing anywhere. The repository ships a committed
          // artifact now, so probing the real filesystem would find one and
          // this test would stop testing what it says it tests.
          datasetProbe: { exists: () => false },
        },
        { XENIOS_MASTER_OFFERINGS_DATASET: undefined },
      ),
    ).get(MASTER_OFFERING_CATALOG_LIST_ROUTE);
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      code: "master_offerings_unavailable",
    });
  });

  it("carries the manual purchase capability from the environment", async () => {
    const off = await request(app()).get(DETAIL_PATH);
    expect(off.body.product.variants[0].action.kind).toBe("request_access");
    const on = await request(
      app({}, { [MASTER_OFFERINGS_MANUAL_PURCHASE_ENV_VAR]: "true" }),
    ).get(DETAIL_PATH);
    expect(on.body.product.variants[0].action.kind).toBe(
      "request_early_access_purchase",
    );
  });

  it("prices the export through the same authority as the catalog", async () => {
    const response = await request(app()).get(
      `${MASTER_OFFERING_CATALOG_PRICE_LIST_ROUTE}?format=json`,
    );
    expect(response.status).toBe(200);
    expect(response.body.rows[0].price).toBe("$99.00");
    expect(response.body.pricedRowCount).toBe(1);
  });
});
