import express, { type Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS,
  type AdminProductDetail,
} from "@shared/research/product-admin";
import type {
  DomainReadiness,
  RequiredInput,
} from "@shared/research/required-inputs";
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
    productCode: "PC-PRODUCT-1",
    slug: "pc-product-1",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    visibility: "public",
    active: true,
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: EVALUATED_AT,
    publishedAt: EVALUATED_AT,
    content: {
      shortDescription: "Reviewed summary.",
      longDescription: null,
      overview: null,
      specifications: null,
      researchInformation: null,
      storageInformation: null,
      handlingInformation: null,
      shippingInformation: null,
      returnInformation: null,
      disclaimers: null,
      citations: [],
      reviewDate: null,
    },
    variants: [
      {
        id: "pc_variant_1",
        productId: "pc_product_1",
        label: "5 mg vial",
        status: "approved",
        active: true,
        memberEligible: true,
        sku: "XEN-BPC-5",
        catalogNumber: null,
        strength: "5 mg",
        size: null,
        format: "vial",
        presentation: null,
        shippingClass: "standard",
        sortOrder: 0,
        createdAt: EVALUATED_AT,
        updatedAt: EVALUATED_AT,
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
        createdBy: "private-ops-user",
        approvedBy: "private-founder-user",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    media: [
      {
        id: "media_1",
        productId: "pc_product_1",
        kind: "primary_image",
        state: "approved",
        storageKey: "private/bpc.webp",
        filename: "bpc.webp",
        contentType: "image/webp",
        sizeBytes: 100,
        altText: "BPC-157 vial",
        sortOrder: 0,
        approvedBy: "reviewer",
        createdAt: EVALUATED_AT,
        updatedAt: EVALUATED_AT,
      },
    ],
    history: [],
  };
}

function pricedProductWithTwoVariants(): AdminProductDetail {
  const value = pricedProduct();
  const secondVariant = {
    ...value.variants[0],
    id: "pc_variant_2",
    sku: "XEN-BPC-10",
    label: "10 mg vial",
    strength: "10 mg",
  };
  return {
    ...value,
    variantCount: 2,
    approvedVariantCount: 2,
    variants: [...value.variants, secondVariant],
    prices: [
      ...value.prices,
      {
        ...value.prices[0],
        id: "price_2",
        variantId: "pc_variant_2",
        amountCents: 17900,
      },
    ],
  };
}

function requiredInputs(): RequiredInput[] {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
    id: `input-${index}`,
    key: binding.key,
    domain: binding.domain,
    label: "Verified input",
    description: "Verified input",
    whyRequired: "Required by canonical readiness.",
    recordType: binding.recordType,
    recordId: "pc_product_1",
    fieldPath: "field",
    currentState: "verified",
    blockingLevel: "blocks_display",
    responsibleRole: "product_admin",
    verificationMethod: "review",
    evidenceRequired: [],
    entryMode: "direct",
    valueSensitivity: "ordinary",
    enteredValue: "verified",
    externalReferenceName: null,
    enteredBy: "admin",
    enteredAt: EVALUATED_AT,
    verifiedBy: "reviewer",
    verifiedAt: EVALUATED_AT,
    rejectionReason: null,
    publicLaunchImpact: "Blocks release.",
    nextAction: "Review.",
    adminEntryHref: "/internal",
    version: index + 1,
    auditHistory: [],
  }));
}

function domainReadiness(domain: string): DomainReadiness {
  return {
    domain,
    launchStatus: "public_enabled",
    softwareComplete: true,
    realInputsRequired: false,
    publicEnabled: true,
    manifestApproved: true,
    expectedInputCount: 2,
    actualInputCount: 2,
    blockingInputCount: 0,
    blockingKeys: [],
    version: 3,
  };
}

function readiness(): DomainReadiness[] {
  return [domainReadiness("product_content"), domainReadiness("products")];
}

function inventoryFacts(state: "eligible" | "unavailable" = "unavailable") {
  return {
    inventory: {
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      state,
      reason: state === "eligible" ? null : "not_currently_available",
      sourceVersion: "inventory-v1",
      evaluatedAt: EVALUATED_AT,
    },
    lotCoa: {
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      state:
        state === "eligible" ? ("verified" as const) : ("required" as const),
      sourceVersion: "lot-coa-v1",
      evaluatedAt: EVALUATED_AT,
    },
  };
}

function input(
  overrides: Partial<MasterOfferingCompositionInput> = {},
): MasterOfferingCompositionInput {
  return {
    bindings: { readBinding: () => BINDING },
    pricingSource: { readProductForPricing: async () => pricedProduct() },
    requiredInputs: {
      list: async () => requiredInputs(),
      readinessAll: async () => readiness(),
    },
    inventory: {
      readVariantInventoryFacts: async () => inventoryFacts(),
    },
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
        inventory: {
          readVariantInventoryFacts: async () => inventoryFacts("eligible"),
        },
      }),
    ).get(DETAIL_PATH);
    const entry = response.body.product.variants[0];
    expect(entry.action.kind).toBe("add_to_cart");
    expect(entry.action.amount).toEqual({
      amountCents: entry.price.amountCents,
      currency: entry.price.currency,
    });
    const serialized = JSON.stringify(response.body);
    for (const privateValue of [
      "private/bpc.webp",
      "bpc.webp",
      "private-ops-user",
      "private-founder-user",
      "inventory-v1",
      "lot-coa-v1",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("builds a fresh service per request so a price memo cannot go stale", async () => {
    const readProductForPricing = vi.fn(async () => pricedProduct());
    const application = app({ pricingSource: { readProductForPricing } });
    await request(application).get(DETAIL_PATH);
    const afterFirst = readProductForPricing.mock.calls.length;
    await request(application).get(DETAIL_PATH);
    // A process-lifetime service would have answered the second request from
    // the first request's memo and never re-read the authority.
    expect(afterFirst).toBe(1);
    expect(readProductForPricing).toHaveBeenCalledTimes(2);
  });

  it("reads the price and the selection at one instant", async () => {
    const readVariantInventoryFacts = vi.fn(async () =>
      inventoryFacts("eligible"),
    );
    const identityFor = vi.fn(async () => ({
      audience: "member" as const,
      sourceVersion: "audience-v1",
      evaluatedAt: EVALUATED_AT,
      currency: "USD",
    }));
    await request(
      app({ inventory: { readVariantInventoryFacts }, identityFor }),
    ).get(DETAIL_PATH);
    expect(identityFor).toHaveBeenCalledTimes(1);
    expect(readVariantInventoryFacts).toHaveBeenCalledWith(
      expect.objectContaining({ evaluatedAt: EVALUATED_AT }),
    );
  });

  it("memoizes one pending identity decision across concurrent variants", async () => {
    let releaseIdentity!: (
      value: Awaited<ReturnType<MasterOfferingCompositionInput["identityFor"]>>,
    ) => void;
    const pendingIdentity = new Promise<
      Awaited<ReturnType<MasterOfferingCompositionInput["identityFor"]>>
    >((resolve) => {
      releaseIdentity = resolve;
    });
    const identityFor = vi.fn(() => pendingIdentity);
    const multiOffering = offering({
      variants: [
        variant({ id: "mov_a", label: "5 mg vial" }),
        variant({ id: "mov_b", label: "10 mg vial" }),
      ],
    });
    const responsePromise = request(
      app({
        catalogReader: new InMemoryMasterOfferingCatalogReader([multiOffering]),
        bindings: {
          readBinding: ({ offeringVariantId }) => ({
            offeringVariantId,
            productId: "pc_product_1",
            variantId:
              offeringVariantId === "mov_a" ? "pc_variant_1" : "pc_variant_2",
          }),
        },
        pricingSource: {
          readProductForPricing: async () => pricedProductWithTwoVariants(),
        },
        inventory: {
          readVariantInventoryFacts: async ({
            productId,
            variant,
            evaluatedAt,
          }) => ({
            inventory: {
              productId,
              variantId: variant.id,
              state: "eligible",
              reason: null,
              sourceVersion: `inventory-${variant.id}`,
              evaluatedAt,
            },
            lotCoa: {
              productId,
              variantId: variant.id,
              state: "verified",
              sourceVersion: `lot-coa-${variant.id}`,
              evaluatedAt,
            },
          }),
        },
        identityFor,
      }),
    )
      .get(DETAIL_PATH)
      .then((response) => response);

    await vi.waitFor(() => expect(identityFor).toHaveBeenCalledTimes(1));
    releaseIdentity({
      audience: "member",
      sourceVersion: "audience-v1",
      evaluatedAt: EVALUATED_AT,
      currency: "USD",
    });
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(response.body.product.variants).toHaveLength(2);
    expect(
      response.body.product.variants.every(
        (entry: { action: { kind: string } }) =>
          entry.action.kind === "add_to_cart",
      ),
    ).toBe(true);
    expect(identityFor).toHaveBeenCalledTimes(1);
  });

  it("memoizes a synchronous identity failure and fails closed", async () => {
    const identityFor = vi.fn(() => {
      throw new Error("identity-unavailable");
    });
    const response = await request(app({ identityFor })).get(DETAIL_PATH);
    expect(response.status).toBe(200);
    expect(response.body.product.variants[0]).toMatchObject({
      price: { state: "on_request" },
      action: { kind: "request_access" },
    });
    expect(identityFor).toHaveBeenCalledTimes(1);
  });

  it("shows no price when the session supplies no identity", async () => {
    const response = await request(app({ identityFor: () => null })).get(
      DETAIL_PATH,
    );
    expect(response.status).toBe(200);
    expect(response.body.product.variants[0].price.state).toBe("on_request");
    expect(response.body.product.variants[0].action.kind).toBe(
      "request_access",
    );
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
