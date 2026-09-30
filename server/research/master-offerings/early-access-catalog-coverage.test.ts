// EARLY ACCESS PRICE COVERAGE ACROSS THE ENTIRE COMPOSED CATALOG.
//
// Not the first page. Every page, walked to exhaustion, through the REAL
// shipped dataset artifact, the REAL production binding reader (composite key
// and all), the real composition, and the real assisted-order projection.
//
// Two earlier customer-fatal defects lived exactly here and both survived
// first-page testing: the binding map was keyed `offeringId|offeringVariantId`
// while the seam looked up a bare variant id, so all 417 lookups missed; and a
// page clamp left 320 of 420 rows unreachable. A coverage proof that stops at
// page 1 would have passed while the catalog was broken.
//
// MEASURED AGAINST PRODUCTION, 2026-08-20, so the price double below is
// faithful rather than permissive: the set of (productId, variantId) pairs
// holding an active, in-window, member-audience price on a published product
// and an approved variant is EXACTLY the set of pairs in the committed binding
// artifact — both sides md5 062a30f0d3d0a0571e78837b5b92d4f6 over the sorted
// `productId|variantId` lines, 417 pairs, zero of them non-positive
// (min $1.00, max $2,250.00). So "bound" and "priced" really are the same set
// in production, and pricing exactly the bound pairs here reproduces it.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAssistedOrderMasterCatalogCallbacks,
  type AssistedOrderMasterCatalogService,
} from "../assisted-order/production-catalog";
import { MasterOfferingCatalogService } from "./service";
import type { AssistedOrderCatalogItem } from "@shared/research/assisted-order/contract";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { createMasterOfferingCatalogDependencies } from "./composition";
import { createMasterOfferingCatalogReaderFromEnv } from "./dataset-reader";
import {
  earlyAccessRetailPricingViewer,
  pricingViewerForCustomerViewer,
  EARLY_ACCESS_RETAIL_PRICE_AUDIENCE,
} from "./early-access-retail-pricing";
import { pricingIdentityFromViewer } from "./member-pricing-viewer";
import {
  bindingsByOfferingVariantId,
  createProductionBindingReader,
  loadBindingIndex,
} from "./production-bindings";

/** The committed dataset has 420 rows; a shipping charge is not merchandise. */
const SHIPPED_VARIANTS = 420;
const TOTAL_VARIANTS = SHIPPED_VARIANTS - 1;
const BOUND_VARIANTS = 417;
const PRICE_ON_REQUEST_VARIANTS = 2;
/** Reviewed GRP-0364 source identity in the committed member-safe artifact. */
const SHIPPING_CHARGE_OFFERING_ID = "mo_003b0c272099eeb1f114";
const UNBOUND_PRODUCT_NAMES = [
  "BAM15",
  "Syringes & Alcohol Swabs",
];

/** The production price-set fingerprint these coverage numbers were measured against. */
const PRODUCTION_PRICED_PAIRS_MD5 = "062a30f0d3d0a0571e78837b5b92d4f6";

/** A plain, positive price, so a $0 anywhere in the walk is unambiguously a bug. */
const PRICE_CENTS = 6500;

/**
 * The 2026-08-25 composition counted all 420 artifact rows. The customer
 * projection now removes the GRP-0364 shipping charge and withholds Care
 * retail prices from Research. Product Control still has 417 bound prices.
 *
 *   TOTAL             419   one shipping charge excluded from 420 source rows
 *   RESEARCH PRICED   175   417 authority prices minus 242 Care prices
 *   CARE WITHHELD     242   priced in Product Control, hidden in Research
 *   QUOTE ONLY          2   BAM15, Syringes & Swabs
 *   RUO                153   research use only
 *   PROVIDER REQUEST   242   503A / provider pathway, never direct
 *   AVAILABILITY         1   otherwise held row
 *   ACTIVATION          44   visible rows lacking direct launch authority
 *   PRICING REQUEST      1   the one generally orderable row lacking a price
 *   DIRECT REQUEST     131   rows the shared pathway authority admits
 */
const MEASURED_TOTAL_VARIANTS = 419;
const MEASURED_RESEARCH_PRICED = 175;
const MEASURED_CARE_WITHHELD = 242;
const MEASURED_QUOTE_ONLY = 2;
const MEASURED_RUO = 153;
const MEASURED_PROVIDER_REQUEST = 242;
const MEASURED_AVAILABILITY_REVIEW = 1;
const MEASURED_REQUEST_ACTIVATION = 44;
const MEASURED_REQUEST_PRICING = 1;
const MEASURED_DIRECT_ORDER_REQUEST = 131;
/** The 503A channel specifically, which is the complete provider-request set. */
const MEASURED_503A = 242;

/**
 * Named rows, with their REAL production prices read from
 * research_product_prices on 2026-08-20, so at least part of this walk is
 * checked against the actual money a customer will be shown rather than
 * against a placeholder.
 */
const REAL_PRICES: Record<string, number> = {
  // Kisspeptin 10 mg -> $65.00, the row the founder called out by name.
  "55b1eadd-514f-407f-b390-d202f11117ed": 6500,
  // Kisspeptin 5 mg -> $112.50
  "d08bb43f-7e10-4fde-9dbf-8d04a64637a6": 11250,
  // Retatrutide 50 mg -> $1,075.00, a high-value row, to prove the projection
  // does not truncate or mis-scale large amounts.
  "2fe736d6-b165-4390-b542-8df06ea96046": 107500,
};

const bindingIndex = loadBindingIndex().index;
const byVariant = bindingsByOfferingVariantId(bindingIndex);
const reverseBindings = new Map(
  Array.from(bindingIndex.values()).map((binding) => [
    `${binding.productId}\u0000${binding.variantId}`,
    binding.offeringVariantId,
  ]),
);
const pricedPairs = new Set(
  Array.from(bindingIndex.values()).map(
    (binding) => `${binding.productId}\u0000${binding.variantId}`,
  ),
);

function productForPricing(productId: string): AdminProductDetail | null {
  const variants = Array.from(bindingIndex.values()).filter(
    (binding) => binding.productId === productId,
  );
  if (variants.length === 0) return null;
  return {
    id: productId,
    status: "published",
    visibility: "public",
    active: true,
    variants: variants.map((binding) => ({
      id: binding.variantId,
      productId,
      status: "approved",
      active: true,
      memberEligible: true,
      sku: binding.productControlSku ?? "SKU",
    })),
    prices: variants
      .filter((binding) =>
        pricedPairs.has(`${productId}\u0000${binding.variantId}`),
      )
      .map((binding) => ({
        id: `price_${binding.variantId}`,
        productId,
        variantId: binding.variantId,
        // LITERAL on purpose. A fixture built from the constant under test is
        // self-consistent under EVERY value of it, including one with no
        // production rows at all.
        audience: "member",
        amountCents: REAL_PRICES[binding.variantId] ?? PRICE_CENTS,
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
      })),
  } as unknown as AdminProductDetail;
}

/** Parsed once: twelve tests each re-reading the dataset is the difference
 *  between a 2-second file and one that times out under a loaded suite. */
let sharedReader: ReturnType<typeof createMasterOfferingCatalogReaderFromEnv> | null = null;

function catalogDependencies() {
  const catalogReader = (sharedReader ??= createMasterOfferingCatalogReaderFromEnv());
  if (catalogReader === null) {
    throw new Error(
      "The committed master-offerings dataset was not found; coverage cannot be measured.",
    );
  }
  return createMasterOfferingCatalogDependencies(
    {
      // The REAL production reader, composite key included.
      bindings: createProductionBindingReader(),
      selections: {
        select: async () => ({ ok: false, code: "product_commerce_unapproved" as const }),
      },
      pricingSource: {
        readProductForPricing: async (productId: string) =>
          productForPricing(productId),
      },
      identityFor: (viewer) => pricingIdentityFromViewer(viewer),
      catalogReader,
      env: {},
    },
    () => null,
  );
}

function callbacks() {
  const dependencies = catalogDependencies();
  return createAssistedOrderMasterCatalogCallbacks({
    serviceFor: (viewer) =>
      dependencies.serviceForViewer(
        pricingViewerForCustomerViewer(viewer) as never,
      ) as unknown as AssistedOrderMasterCatalogService,
    bindingFor: (offeringVariantId) => {
      const binding = byVariant.get(offeringVariantId);
      return binding
        ? { productId: binding.productId, variantId: binding.variantId }
        : null;
    },
    // The REVERSE map, built exactly as server/index.ts builds it. Stubbing
    // this to null makes every bound row unresolvable at submit, which is a
    // convincing-looking failure that says nothing about the product.
    offeringVariantFor: (identity) =>
      reverseBindings.get(
        `${identity.productId}\u0000${identity.variantId}`,
      ) ?? null,
    catalogVersion: "catalog-coverage",
  });
}

/** An anonymous Early Access session, exactly as the resolvers build one. */
const EARLY_ACCESS_VIEWER = {
  actorType: "early_access_session",
  earlyAccessSessionHash: "a".repeat(64),
  pricingViewer: undefined,
} as never;

/** Walk EVERY page to exhaustion, never just the first. */
async function walkWholeCatalog(
  viewer: unknown,
): Promise<{ items: AssistedOrderCatalogItem[]; reportedTotal: number; pages: number }> {
  const list = callbacks().list;
  const items: AssistedOrderCatalogItem[] = [];
  let page = 1;
  let reportedTotal = 0;
  for (;;) {
    const result = await list(viewer as never, { page, pageSize: 100 });
    reportedTotal = result.total;
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) break;
    page += 1;
    if (page > 50) throw new Error("The catalog walk did not terminate.");
  }
  return { items, reportedTotal, pages: page };
}

async function walkAuthorityPrices(): Promise<{
  priced: number;
  carePriced: number;
  onRequest: number;
}> {
  const service = await catalogDependencies().serviceForViewer(
    pricingViewerForCustomerViewer(EARLY_ACCESS_VIEWER) as never,
  ) as MasterOfferingCatalogService;
  let priced = 0;
  let carePriced = 0;
  let onRequest = 0;
  for (let page = 1; ; page += 1) {
    const selection = await service.select({ page, pageSize: 100 });
    for (const offering of selection.offerings) {
      for (const variant of offering.variants.filter((item) => item.visibility === "member")) {
        const price = selection.prices.get(variant.id);
        expect(price, `no price state for ${variant.id}`).toBeDefined();
        if (price?.state === "priced") {
          expect(price.amountCents).toBeGreaterThan(0);
          priced += 1;
          if (offering.family === "clinical_formulations_503a") carePriced += 1;
        } else {
          onRequest += 1;
        }
      }
    }
    if (page >= selection.page.totalPages) break;
  }
  return { priced, carePriced, onRequest };
}

describe("Early Access price coverage across the whole catalog", () => {
  it("preserves the source row but excludes the shipping charge from the customer catalog", async () => {
    const reader = (sharedReader ??= createMasterOfferingCatalogReaderFromEnv());
    expect(reader).not.toBeNull();
    const source = await reader!.readCatalog();
    expect(source).toHaveLength(SHIPPED_VARIANTS);
    expect(source.filter((product) => product.id === SHIPPING_CHARGE_OFFERING_ID).map((product) => product.displayName)).toEqual(["FedEx Standard Overnight"]);
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    expect(items).toHaveLength(TOTAL_VARIANTS);
    expect(items.some((item) => item.productName === "FedEx Standard Overnight")).toBe(false);
    expect(items.some((item) => item.productName === "Syringes & Alcohol Swabs")).toBe(true);
  });

  it("reaches every customer product in the dataset, not just the first page", async () => {
    const walk = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    expect(walk.reportedTotal).toBe(TOTAL_VARIANTS);
    expect(walk.items).toHaveLength(TOTAL_VARIANTS);
    expect(walk.pages).toBeGreaterThan(1);
    // No duplicate row smuggled in by paging.
    expect(new Set(walk.items.map((item) => item.variantId)).size).toBe(
      TOTAL_VARIANTS,
    );
  });

  it("retains 417 Product Control prices while withholding Care prices in Research", async () => {
    expect(await walkAuthorityPrices()).toEqual({
      priced: BOUND_VARIANTS,
      carePriced: MEASURED_CARE_WITHHELD,
      onRequest: PRICE_ON_REQUEST_VARIANTS,
    });
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const priced = items.filter((item) => item.unitPriceCents !== null);
    const careWithheld = items.filter((item) => item.workflowMode === "provider_request");
    const onRequest = items.filter((item) => item.unitPriceCents === null && item.workflowMode !== "provider_request");

    expect(priced).toHaveLength(MEASURED_RESEARCH_PRICED);
    expect(careWithheld).toHaveLength(MEASURED_CARE_WITHHELD);
    expect(careWithheld.every((item) => item.unitPriceCents === null && item.priceVersion === null)).toBe(true);
    expect(onRequest).toHaveLength(PRICE_ON_REQUEST_VARIANTS);
    expect(onRequest.map((item) => item.productName).sort()).toEqual(
      [...UNBOUND_PRODUCT_NAMES].sort(),
    );
  });

  it("never shows a zero or negative price anywhere in the catalog", async () => {
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    for (const item of items) {
      if (item.unitPriceCents !== null) {
        expect(item.unitPriceCents).toBeGreaterThan(0);
      }
    }
  });

  it("keeps a price and an ordering pathway as SEPARATE decisions", async () => {
    // Product Control price and purchase authority are separate. Research
    // presentation now hides the Care amount even though authority retains it.
    // A held row can stay priced without becoming directly orderable.
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    for (const item of items) {
      if (item.unitPriceCents === null) {
        // An unpriced row may never present itself as directly orderable.
        expect(item.workflowMode).not.toBe("direct_order_request");
        expect(item.priceVersion).toBeNull();
      } else {
        expect(item.priceVersion).not.toBeNull();
      }
    }
    // Not one 503A Care row became directly orderable by gaining a price.
    // Anchored on the channel the Care rows actually carry, and asserted to be
    // a populated channel first, so this can never pass by matching nothing.
    const care = items.filter(
      (item) => item.channel === "503A Clinical Formulations",
    );
    expect(care.length).toBe(MEASURED_503A);
    expect(
      care.filter((item) => item.workflowMode === "direct_order_request"),
    ).toHaveLength(0);
    expect(care.every((item) => item.unitPriceCents === null && item.priceVersion === null)).toBe(true);
  });

  it("prices against the audience production actually holds rows on", () => {
    // THE value the whole repair turns on, and the one thing no other test in
    // this file could catch: production holds 417 active price rows and every
    // one is audience "member", with zero on retail, private_early_access,
    // professional or wholesale. Point the authority at any of those and the
    // live catalog silently returns to "Price on request" — while every other
    // assertion here stays green, because they would all build their fixtures
    // from the same wrong constant. Checked against a literal from the
    // measurement, deliberately not against the constant itself.
    expect(EARLY_ACCESS_RETAIL_PRICE_AUDIENCE).toBe("member");
    expect(MEASURED_RESEARCH_PRICED + MEASURED_CARE_WITHHELD + MEASURED_QUOTE_ONLY).toBe(MEASURED_TOTAL_VARIANTS);
  });

  it("matches that measured composition when actually walked", async () => {
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const count = (predicate: (item: AssistedOrderCatalogItem) => boolean) =>
      items.filter(predicate).length;
    expect({
      priced: count((item) => item.unitPriceCents !== null),
      unpriced: count((item) => item.unitPriceCents === null),
      researchUseOnly: count((item) => item.researchUseOnly),
      providerRequest: count((item) => item.workflowMode === "provider_request"),
      availabilityReview: count((item) => item.workflowMode === "availability_review"),
      requestActivation: count((item) => item.workflowMode === "request_activation"),
      requestPricing: count((item) => item.workflowMode === "request_pricing"),
      directOrderRequest: count((item) => item.workflowMode === "direct_order_request"),
    }).toEqual({
      priced: MEASURED_RESEARCH_PRICED,
      unpriced: MEASURED_CARE_WITHHELD + MEASURED_QUOTE_ONLY,
      researchUseOnly: MEASURED_RUO,
      providerRequest: MEASURED_PROVIDER_REQUEST,
      availabilityReview: MEASURED_AVAILABILITY_REVIEW,
      requestActivation: MEASURED_REQUEST_ACTIVATION,
      requestPricing: MEASURED_REQUEST_PRICING,
      directOrderRequest: MEASURED_DIRECT_ORDER_REQUEST,
    });
  });

  it("shows an anonymous visitor the SAME rows it showed before pricing existed", async () => {
    // The authority must change prices and nothing else. A viewer with no
    // grant at all must see an identical item set, in identical order.
    const withGrant = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const withoutGrant = await walkWholeCatalog({
      actorType: "early_access_session",
      earlyAccessSessionHash: null,
      pricingViewer: undefined,
    });
    expect(withoutGrant.items.map((item) => item.variantId)).toEqual(
      withGrant.items.map((item) => item.variantId),
    );
    // ...and that ungranted viewer still sees no price at all, which is the
    // state production is in right now.
    expect(
      withoutGrant.items.filter((item) => item.unitPriceCents !== null),
    ).toHaveLength(0);
  });

  it("shows the founder-named rows at their real production prices", async () => {
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const kisspeptin10 = items.find(
      (item) => item.variantId === "55b1eadd-514f-407f-b390-d202f11117ed",
    );
    expect(kisspeptin10?.productName).toBe("Kisspeptin");
    expect(kisspeptin10?.unitPriceCents).toBe(6500);

    const retatrutide50 = items.find(
      (item) => item.variantId === "2fe736d6-b165-4390-b542-8df06ea96046",
    );
    expect(retatrutide50?.unitPriceCents).toBe(107500);

    // BAM15 has NO active price row in production, so it must stay on request
    // and must never be presented as directly orderable.
    const bam15 = items.find((item) => item.productName === "BAM15");
    expect(bam15).toBeTruthy();
    expect(bam15?.unitPriceCents).toBeNull();
    expect(bam15?.workflowMode).toBe("request_pricing");
  });

  it("re-resolves EVERY row at submit time to exactly what the catalog showed", async () => {
    // CONCERN A, closed by exhaustion rather than by sampling. The list path and
    // the submit path are different code: list() pages once, resolve() walks
    // pages looking for one variant. A row the catalog prices but the submit
    // path cannot find is a customer filling in a whole order and being refused
    // at the end — the exact shape of an earlier defect where a page clamp left
    // 320 of 420 rows unreachable.
    //
    // So every one of the 419 customer rows is resolved individually and compared on the
    // authoritative fingerprint, which covers productId, variantId, price,
    // priceVersion, catalogVersion and workflowMode together.
    const cb = callbacks();
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    expect(items).toHaveLength(TOTAL_VARIANTS);

    const unresolved: string[] = [];
    const disagreed: string[] = [];
    for (const listed of items) {
      const resolved = await cb.resolve(
        EARLY_ACCESS_VIEWER,
        listed.productId,
        listed.variantId,
      );
      if (resolved === null) {
        unresolved.push(`${listed.productName} (${listed.variantId})`);
        continue;
      }
      if (cb.fingerprint(resolved) !== cb.fingerprint(listed)) {
        disagreed.push(
          `${listed.productName}: listed ${listed.unitPriceCents} / resolved ${resolved.unitPriceCents}`,
        );
      }
    }
    expect(unresolved).toEqual([]);
    expect(disagreed).toEqual([]);
    // 419 resolves, each paging the real dataset. Deliberately the most
    // expensive test in the lane, and it timed out at the 5s default under a
    // loaded suite. A generous explicit budget is the honest fix: quietly
    // sampling fewer rows would give back the very coverage it exists for.
  }, 120_000);

  it("resolves the specific rows the founder named, at every position in the catalog", async () => {
    // The same property stated positionally, so a regression names WHERE it
    // broke instead of only that something did.
    const cb = callbacks();
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);

    const positions: Array<[string, number]> = [
      ["first page", 0],
      ["page-1 boundary", 99],
      ["beyond the old first-100 boundary", 100],
      ["middle page", Math.floor(TOTAL_VARIANTS / 2)],
      ["last page", TOTAL_VARIANTS - 1],
    ];
    for (const [where, index] of positions) {
      const listed = items[index];
      expect(listed, `no catalog row at ${where}`).toBeTruthy();
      const resolved = await cb.resolve(
        EARLY_ACCESS_VIEWER,
        listed.productId,
        listed.variantId,
      );
      expect(resolved, `${where} did not resolve at submit`).toBeTruthy();
      expect(resolved!.unitPriceCents, `${where} price disagreed`).toBe(
        listed.unitPriceCents,
      );
    }

    // Kisspeptin 10 mg: priced, and the price survives the submit re-read.
    const kiss = items.find(
      (item) => item.variantId === "55b1eadd-514f-407f-b390-d202f11117ed",
    )!;
    const kissResolved = await cb.resolve(
      EARLY_ACCESS_VIEWER,
      kiss.productId,
      kiss.variantId,
    );
    expect(kissResolved?.unitPriceCents).toBe(6500);

    // BAM15: unpriced, and it must still RESOLVE. A row the catalog shows and
    // the submit path cannot read back takes the whole basket down with it.
    const bam = items.find((item) => item.productName === "BAM15")!;
    const bamResolved = await cb.resolve(
      EARLY_ACCESS_VIEWER,
      bam.productId,
      bam.variantId,
    );
    expect(bamResolved).toBeTruthy();
    expect(bamResolved?.unitPriceCents).toBeNull();
    expect(bamResolved?.workflowMode).toBe("request_pricing");
  });

  it("leaks no procurement economics on any page of the whole catalog", async () => {
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const wire = JSON.stringify(items).toLowerCase();
    expect(wire).toContain(String(PRICE_CENTS));
    for (const forbidden of [
      "wholesale",
      "supplierprice",
      "supplier_price",
      "margin",
      "markup",
      "multiplier",
      "benchmark",
      "grossprofit",
      "grossmargin",
      "originalsellprice",
    ]) {
      expect(wire).not.toContain(forbidden);
    }
  });

  it("still matches the production price set that was measured against it", () => {
    // Comparing the artifact's size to a constant proves nothing about
    // production. This compares the artifact's CONTENT to a fingerprint taken
    // FROM production on 2026-08-20:
    //
    //   md5(string_agg(product_id || '|' || variant_id, chr(10) order by ...))
    //   over active, in-window, member-audience prices on published products
    //   and approved variants  ->  062a30f0...92d4f6 across 417 rows.
    //
    // It cannot notice production drifting on its own — no offline test can —
    // which is why the failure message points at re-measuring rather than at
    // editing the constant.
    const digest = createHash("md5")
      .update(
        Array.from(bindingIndex.values())
          .map((binding) => binding.productId + "|" + binding.variantId)
          .sort()
          .join("\n"),
      )
      .digest("hex");
    expect(bindingIndex.size).toBe(BOUND_VARIANTS);
    expect(
      digest,
      "the binding artifact changed: re-measure the production price set before trusting any coverage number in this file",
    ).toBe(PRODUCTION_PRICED_PAIRS_MD5);
    expect(earlyAccessRetailPricingViewer().pricingGrant?.audience).toBe(
      EARLY_ACCESS_RETAIL_PRICE_AUDIENCE,
    );
  });
});
