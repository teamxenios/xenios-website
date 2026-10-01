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
// HISTORICAL PRODUCTION EVIDENCE, 2026-08-20: 417 active, in-window,
// member-audience Product Control price pairs had md5
// 062a30f0d3d0a0571e78837b5b92d4f6 over sorted productId|variantId lines.
// That historical set is NOT a current production read-back or new price approval.
// HL-11 retains 415 exact pairs and archives two superseded pairs without
// transferring their authority to the six new canonical identities. The price
// double below exercises only the retained pairs. All new identities remain
// unbound and unpriced even when the reviewed source records intended cents.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAssistedOrderMasterCatalogCallbacks,
  authorityFor,
  type AssistedOrderMasterCatalogService,
} from "../assisted-order/production-catalog";
import { MasterOfferingCatalogService } from "./service";
import { reviewedHeldVariantIds } from "./reviewed-holds";
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
  MASTER_OFFERING_COMMITTED_BINDINGS_PATH,
} from "./production-bindings";

/** 426 source rows reconcile to 424 identities; shipping is not merchandise. */
const SHIPPED_VARIANTS = 424;
const TOTAL_VARIANTS = SHIPPED_VARIANTS - 1;
const BOUND_VARIANTS = 415;
const PRICE_ON_REQUEST_VARIANTS = 2;
const BINDING_PENDING_VARIANTS = 6;
const HELD_VARIANT_ID = "mov_f61758881da2b7bfa539";
const NEW_SOURCE_GROUPS = [
  "GRP-0421", "GRP-0422", "GRP-0423", "GRP-0424", "GRP-0425", "GRP-0426",
];
/** Reviewed GRP-0364 source identity in the committed member-safe artifact. */
const SHIPPING_CHARGE_OFFERING_ID = "mo_003b0c272099eeb1f114";
const UNBOUND_PRODUCT_NAMES = [
  "BAM15",
  "Syringes & Alcohol Swabs",
];

/** Historical evidence and its reviewed LOCAL subset are distinct fingerprints. */
const HISTORICAL_PRICED_PAIRS_MD5 = "062a30f0d3d0a0571e78837b5b92d4f6";
const RETAINED_PRICED_PAIRS_MD5 = "86fdd019d3153e75920090136579b184";

/** A plain, positive price, so a $0 anywhere in the walk is unambiguously a bug. */
const PRICE_CENTS = 6500;

/**
 * Candidate expectations, checked through the real reader below, not a new
 * production measurement. Policy delta from the predecessor:
 * - remove two superseded priced/pending identities (175 -> 173 visible prices);
 * - retain all 242 canonical Care prices, withheld only in Research;
 * - add six new identities without borrowing bindings or approving prices;
 * - preserve the two genuine quote-only rows and the separate shipping row.
 *
 *   CUSTOMER TOTAL    423   424 canonical identities minus shipping
 *   RESEARCH PRICED   173   415 retained authority prices minus 242 Care prices
 *   CARE WITHHELD     242   priced in Product Control, hidden in Research
 *   QUOTE ONLY          2   BAM15, Syringes & Swabs
 *   BINDING PENDING     6   new identities, no Product Control/price release
 *
 * The action census below must also pass after candidate generation; these
 * are test expectations, not observed results before the real-reader run.
 */
const EXPECTED_TOTAL_VARIANTS = 423;
const EXPECTED_RESEARCH_PRICED = 173;
const EXPECTED_CARE_WITHHELD = 242;
const EXPECTED_QUOTE_ONLY = 2;
const EXPECTED_BINDING_PENDING = 6;
const EXPECTED_RUO = 157;
const EXPECTED_PROVIDER_REQUEST = 242;
const EXPECTED_AVAILABILITY_REVIEW = 2;
const EXPECTED_REQUEST_ACTIVATION = 42;
const EXPECTED_REQUEST_PRICING = 6;
const EXPECTED_DIRECT_ORDER_REQUEST = 131;
/** The 503A channel specifically, which is the complete provider-request set. */
const EXPECTED_503A = 242;

/**
 * Historical named-row fixture from research_product_prices on 2026-08-20.
 * These unchanged cents exercise amount projection, not current production
 * truth or new approval. The remaining retained pairs use a positive double.
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

type BindingArtifact = {
  unbound: Array<{
    offeringId: string;
    offeringVariantId: string;
    sourceGroupId: string;
    reasonCode: "quote_only" | "binding_pending" | "shipping_service";
  }>;
  supersededBindings: Array<{
    binding: { productId: string; variantId: string; offeringVariantId: string };
  }>;
};
const bindingArtifact = JSON.parse(
  readFileSync(MASTER_OFFERING_COMMITTED_BINDINGS_PATH, "utf8"),
) as BindingArtifact;
const unboundByVariant = new Map(
  bindingArtifact.unbound.map((entry) => [entry.offeringVariantId, entry]),
);
function unboundReason(item: AssistedOrderCatalogItem) {
  return unboundByVariant.get(item.sourceSelection?.variantId ?? "")?.reasonCode;
}

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
    reviewedFormulationHoldVariantIds: reviewedHeldVariantIds(),
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
  quoteOnly: number;
  bindingPending: number;
}> {
  const service = await catalogDependencies().serviceForViewer(
    pricingViewerForCustomerViewer(EARLY_ACCESS_VIEWER) as never,
  ) as MasterOfferingCatalogService;
  let priced = 0;
  let carePriced = 0;
  let quoteOnly = 0;
  let bindingPending = 0;
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
          const reason = unboundByVariant.get(variant.id)?.reasonCode;
          expect(reason, `unexpected missing authority price: ${variant.id}`)
            .toMatch(/^(quote_only|binding_pending)$/);
          if (reason === "quote_only") quoteOnly += 1;
          if (reason === "binding_pending") bindingPending += 1;
        }
      }
    }
    if (page >= selection.page.totalPages) break;
  }
  return { priced, carePriced, quoteOnly, bindingPending };
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

  it("keeps authority prices, Care presentation holds, quote-only and unreleased identities separate", async () => {
    expect(await walkAuthorityPrices()).toEqual({
      priced: BOUND_VARIANTS,
      carePriced: EXPECTED_CARE_WITHHELD,
      quoteOnly: PRICE_ON_REQUEST_VARIANTS,
      bindingPending: BINDING_PENDING_VARIANTS,
    });
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const priced = items.filter((item) => item.unitPriceCents !== null);
    const careWithheld = items.filter((item) => item.workflowMode === "provider_request");
    const quoteOnly = items.filter((item) => unboundReason(item) === "quote_only");
    const bindingPending = items.filter((item) => unboundReason(item) === "binding_pending");

    expect(priced).toHaveLength(EXPECTED_RESEARCH_PRICED);
    expect(careWithheld).toHaveLength(EXPECTED_CARE_WITHHELD);
    expect(quoteOnly).toHaveLength(EXPECTED_QUOTE_ONLY);
    expect(bindingPending).toHaveLength(EXPECTED_BINDING_PENDING);
    expect(quoteOnly.map((item) => item.productName).sort()).toEqual(
      [...UNBOUND_PRODUCT_NAMES].sort(),
    );
    for (const item of [...careWithheld, ...quoteOnly, ...bindingPending]) {
      expect(item.unitPriceCents).toBeNull();
      expect(item.priceVersion).toBeNull();
      expect(item.workflowMode).not.toBe("direct_order_request");
    }
    // Every row is in exactly one reviewed bucket, not "all null means missing".
    const accounted = [...priced, ...careWithheld, ...quoteOnly, ...bindingPending];
    expect(accounted).toHaveLength(TOTAL_VARIANTS);
    expect(new Set(accounted.map((item) => item.variantId)).size).toBe(TOTAL_VARIANTS);
    expect(accounted.map((item) => item.variantId).sort()).toEqual(
      items.map((item) => item.variantId).sort(),
    );
  });

  it("preserves all six unreleased source identities and refuses borrowed or forged submit identities", async () => {
    const pending = bindingArtifact.unbound.filter((entry) => entry.reasonCode === "binding_pending");
    expect(pending.map((entry) => entry.sourceGroupId).sort()).toEqual(NEW_SOURCE_GROUPS);
    const cb = callbacks();
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    for (const entry of pending) {
      const listed = items.find((item) => item.sourceSelection?.variantId === entry.offeringVariantId);
      expect(listed, entry.sourceGroupId).toBeDefined();
      expect(listed!.productId).toBe(`unbound:${entry.offeringId}`);
      expect(listed!.variantId).toBe(`unbound:${entry.offeringVariantId}`);
      expect(listed!.unitPriceCents).toBeNull();
      expect(listed!.priceVersion).toBeNull();
      expect(listed!.workflowMode).not.toBe("direct_order_request");
      const resolved = await cb.resolve(EARLY_ACCESS_VIEWER, listed!.productId, listed!.variantId);
      expect(resolved).not.toBeNull();
      expect(cb.fingerprint(resolved!)).toBe(cb.fingerprint(listed!));
      expect(await cb.resolve(EARLY_ACCESS_VIEWER, "unbound:mo_forged", listed!.variantId)).toBeNull();
    }
    // Old paid-price identities are archived evidence, never aliases that
    // silently resolve to the newly reconciled Hexarelin/Oxytocin identities.
    expect(bindingArtifact.supersededBindings).toHaveLength(2);
    for (const { binding } of bindingArtifact.supersededBindings) {
      expect(await cb.resolve(EARLY_ACCESS_VIEWER, binding.productId, binding.variantId)).toBeNull();
    }
  });

  it("keeps the GRP-0422 hold on its raw identity after display wording changes", async () => {
    const holds = reviewedHeldVariantIds();
    expect(holds.has(HELD_VARIANT_ID)).toBe(true);
    const { items } = await walkWholeCatalog(EARLY_ACCESS_VIEWER);
    const held = items.find((item) => item.sourceSelection?.variantId === HELD_VARIANT_ID);
    expect(held).toBeDefined();
    expect(held!.specification).not.toMatch(/split pending/i);
    expect(held!.workflowMode).toBe("availability_review");
    const cb = callbacks();
    const reread = await cb.resolve(EARLY_ACCESS_VIEWER, held!.productId, held!.variantId);
    expect(reread?.workflowMode).toBe("availability_review");
    expect(cb.fingerprint(reread!)).toBe(cb.fingerprint(held!));

    const reader = (sharedReader ??= createMasterOfferingCatalogReaderFromEnv());
    const source = (await reader!.readCatalog()).find(
      (offering) => offering.variants.some((variant) => variant.id === HELD_VARIANT_ID),
    )!;
    expect(source).toBeDefined();
    const variant = source.variants.find((item) => item.id === HELD_VARIANT_ID)!;
    // Even a perfect price and binding cannot undo the reviewed raw-ID hold.
    // Empty text holds and neutral renamed copy isolate the identity contract.
    const renamed = { ...source, displayName: "Renamed research material", displayState: "request_access" as const };
    const renamedVariant = { ...variant, label: "Reviewed formulation", displayState: "request_access" as const };
    const authority = authorityFor(
      renamed, renamedVariant,
      {
        state: "priced", amountCents: PRICE_CENTS, currency: "USD", display: "$65.00",
        basis: "exact_listed_unit", priceId: "synthetic-price", priceVersion: 1,
        effectiveAt: "2026-08-01T00:00:00.000Z", expiresAt: null,
      },
      { productId: "00000000-0000-4000-8000-000000000001", variantId: "00000000-0000-4000-8000-000000000002" },
      "identity-hold-regression", new Set<string>(), holds,
    );
    expect(authority.held).toBe(true);
    expect(authority.directEligible).toBe(false);
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
    expect(care.length).toBe(EXPECTED_503A);
    expect(
      care.filter((item) => item.workflowMode === "direct_order_request"),
    ).toHaveLength(0);
    expect(care.every((item) => item.unitPriceCents === null && item.priceVersion === null)).toBe(true);
  });

  it("retains the literal member audience documented by the historical price fixture", () => {
    // The historical 417-row read-back used audience "member", not retail,
    // private_early_access, professional or wholesale. The fixture literal
    // prevents changing the constant and its test double in lockstep.
    // This local test does not refresh that historical hosted measurement.
    expect(EARLY_ACCESS_RETAIL_PRICE_AUDIENCE).toBe("member");
    expect(EXPECTED_RESEARCH_PRICED + EXPECTED_CARE_WITHHELD + EXPECTED_QUOTE_ONLY + EXPECTED_BINDING_PENDING).toBe(EXPECTED_TOTAL_VARIANTS);
  });

  it("matches the reviewed candidate composition when actually walked", async () => {
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
      priced: EXPECTED_RESEARCH_PRICED,
      unpriced: EXPECTED_CARE_WITHHELD + EXPECTED_QUOTE_ONLY + EXPECTED_BINDING_PENDING,
      researchUseOnly: EXPECTED_RUO,
      providerRequest: EXPECTED_PROVIDER_REQUEST,
      availabilityReview: EXPECTED_AVAILABILITY_REVIEW,
      requestActivation: EXPECTED_REQUEST_ACTIVATION,
      requestPricing: EXPECTED_REQUEST_PRICING,
      directOrderRequest: EXPECTED_DIRECT_ORDER_REQUEST,
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
    // The ungranted local viewer sees no price; no current hosted-state claim.
    expect(
      withoutGrant.items.filter((item) => item.unitPriceCents !== null),
    ).toHaveLength(0);
  });

  it("preserves the named 2026-08-20 price fixture without treating it as new approval", async () => {
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

    // BAM15 is one of the two genuine quote-only rows in this reviewed
    // fixture, distinct from the six unreleased identity/price rows.
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
    // So every one of the 423 customer rows is resolved individually and compared on the
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
    // 423 resolves, each paging the real dataset. Deliberately the most
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

  it("pins the retained local subset without relabeling the historical production fingerprint", () => {
    const pairLines = Array.from(bindingIndex.values())
      .map((binding) => binding.productId + "|" + binding.variantId);
    const digestOf = (pairs: string[]) => createHash("md5")
      .update([...pairs].sort().join("\n")).digest("hex");
    expect(bindingIndex.size).toBe(BOUND_VARIANTS);
    expect(digestOf(pairLines)).toBe(RETAINED_PRICED_PAIRS_MD5);
    const archived = bindingArtifact.supersededBindings.map(
      ({ binding }) => binding.productId + "|" + binding.variantId,
    );
    expect(new Set([...pairLines, ...archived]).size).toBe(417);
    expect(digestOf([...pairLines, ...archived])).toBe(HISTORICAL_PRICED_PAIRS_MD5);
    expect(earlyAccessRetailPricingViewer().pricingGrant?.audience).toBe(
      EARLY_ACCESS_RETAIL_PRICE_AUDIENCE,
    );
  });
});
