/**
 * The benchmark harness for the catalog-wide pricing read fan-out.
 *
 * It counts reads at the only unit that costs anything in production: calls to
 * the Product Control repository (`list` and `get`). Everything above that is
 * the real chain, not a stand-in:
 *
 *   MasterOfferingCatalogService
 *     -> priceOfferingVariants / createMasterOfferingPriceAuthority
 *     -> createAuthoritativeApprovedPriceReader
 *     -> AuthoritativePriceResolver
 *     -> CatalogPricingProductSource
 *     -> LiveProductControlReader
 *     -> the counting repository
 *
 * The measurement only means anything under a binding. With no binding the price
 * authority short-circuits before it reads anything, which is this deployment's
 * state today and the reason the defect is latent rather than visible. So the
 * binding reader here returns a real binding for every member variant.
 *
 * The "before" figures are produced by running the identical scenario with the
 * unwrapped source, in the same file, so the two numbers are comparable by
 * construction rather than by claim.
 */

import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductSummary,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { MasterOfferingPriceView } from "@shared/research/master-offerings/pricing-contract";
import { LiveProductControlReader } from "../catalog/product-control-reader";
import {
  authorizeAudienceFromServerIdentity,
  CatalogPricingProductSource,
  createAuthoritativePriceResolver,
  type PricingProductSource,
} from "../pricing/authoritative-price-resolver";
import { createRequestScopedPricingProductSource } from "../pricing/request-scoped-product-source";
import type {
  MasterOfferingCommerceIdentityBinding,
  NormalizedMasterOffering,
} from "./model";
import {
  createAuthoritativeApprovedPriceReader,
  createMasterOfferingPriceAuthority,
} from "./price-authority";
import type { MasterOfferingCommerceBindingReader } from "./product-control-adapter";
import { createRequestScopedBindingReader } from "./request-scoped-bindings";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";

const AT = "2026-07-26T22:00:00+00:00";

/**
 * How many published products Product Control holds.
 *
 * This is the multiplier, because one catalog read costs two `list` calls plus
 * two `get` calls per product. Twenty-four is the order of the catalog that
 * exists today, and it is what the page case uses.
 *
 * The export case uses a smaller catalog on purpose. Its unfixed run performs
 * five thousand full catalog reads, and `LiveProductControlReader` verifies each
 * read against a re-listing in a nested loop, so the unfixed export costs
 * O(rows * products^2). At twenty-four products that is eighteen seconds of CPU,
 * which starves every test vitest schedules alongside it. Eight products keeps
 * the same measurement honest and the suite quiet; the closed form is exact, so
 * the twenty-four product figure is derivable and is recorded in
 * `docs/research/CATALOG_PRICING_PERFORMANCE.md`.
 */
const PAGE_PRODUCT_CONTROL_SIZE = 24;
const EXPORT_PRODUCT_CONTROL_SIZE = 8;

/** One full Product Control read: two list calls, two get calls per product. */
function perCatalogRead(size: number): number {
  return 2 + 2 * size;
}

function summary(index: number): AdminProductSummary {
  return {
    id: `product-${index}`,
    productCode: `PRODUCT-${index}`,
    slug: `product-${index}`,
    displayName: `Product ${index}`,
    canonicalName: `Product ${index}`,
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
  };
}

function productVariant(index: number): AdminProductVariant {
  return {
    id: `variant-${index}`,
    productId: `product-${index}`,
    sku: `SKU-${index}`,
    catalogNumber: null,
    label: "10 mg vial",
    strength: null,
    size: null,
    format: null,
    presentation: null,
    shippingClass: null,
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 1,
    createdAt: AT,
    updatedAt: AT,
  };
}

function productPrice(index: number): AdminProductPrice {
  return {
    id: `price-${index}`,
    productId: `product-${index}`,
    variantId: `variant-${index}`,
    audience: "member",
    amountCents: 9900 + index,
    currency: "USD",
    effectiveAt: "2026-01-01T00:00:00+00:00",
    expiresAt: null,
    status: "active",
    approvalNote: null,
    version: 1,
    createdBy: "seed",
    approvedBy: "approver",
    createdAt: AT,
    updatedAt: AT,
  };
}

function detail(index: number): AdminProductDetail {
  return {
    ...summary(index),
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
    variants: [productVariant(index)],
    prices: [productPrice(index)],
    media: [],
    history: [],
  };
}

/** The repository seam, counted. This is the thing that costs a round trip. */
class CountingProductControlRepository {
  lists = 0;
  gets = 0;

  private readonly summaries: readonly AdminProductSummary[];
  private readonly details: ReadonlyMap<string, AdminProductDetail>;

  constructor(size: number) {
    const indexes = Array.from({ length: size }, (_unused, index) => index);
    this.summaries = indexes.map(summary);
    this.details = new Map(
      indexes.map((index) => [`product-${index}`, detail(index)] as const),
    );
  }

  get total(): number {
    return this.lists + this.gets;
  }

  // Shared instances on purpose. The reader only reads, and deep cloning on
  // every one of a quarter of a million calls would measure the harness rather
  // than the defect.
  async list(): Promise<AdminProductSummary[]> {
    this.lists += 1;
    return this.summaries.slice();
  }

  async get(id: string): Promise<AdminProductDetail | null> {
    this.gets += 1;
    return this.details.get(id) ?? null;
  }
}

/** One offering per card, `variantsPerOffering` member variants on each. */
function buildOfferings(
  offeringCount: number,
  variantsPerOffering: number,
): NormalizedMasterOffering[] {
  return Array.from({ length: offeringCount }, (_unused, index) => ({
    id: `mo_${index}`,
    slug: `offering-${index}`,
    canonicalKey: `research_vials|offering ${index}`,
    displayName: `Offering ${index}`,
    canonicalName: `Offering ${index}`,
    family: "research_vials" as const,
    category: "Peptides & Research",
    subcategory: null,
    brand: null,
    aliases: [],
    displayState: "available_now" as const,
    stateExplanation: "Available now.",
    copyState: "needs_review" as const,
    visibility: "member" as const,
    variants: Array.from(
      { length: variantsPerOffering },
      (_ignored, variantIndex) => ({
        id: `mov_${index}_${variantIndex}`,
        label: `${10 + variantIndex} mg vial`,
        displayState: "available_now" as const,
        visibility: "member" as const,
        sourceReferences: [],
      }),
    ),
    sourceReferences: [],
  }));
}

/**
 * A binding for every member variant, spread across the Product Control catalog.
 * This is the state the deployment does not have yet and the only state in which
 * the fan-out is observable.
 */
function bindingReaderFor(size: number): MasterOfferingCommerceBindingReader {
  let sequence = 0;
  const assigned = new Map<string, number>();
  return {
    readBinding(input): MasterOfferingCommerceIdentityBinding {
      let index = assigned.get(input.offeringVariantId);
      if (index === undefined) {
        index = sequence % size;
        sequence += 1;
        assigned.set(input.offeringVariantId, index);
      }
      return {
        offeringVariantId: input.offeringVariantId,
        productId: `product-${index}`,
        variantId: `variant-${index}`,
      };
    },
  };
}

function serviceOver(
  offerings: readonly NormalizedMasterOffering[],
  repository: CountingProductControlRepository,
  mode: "before" | "after",
  productControlSize: number,
): MasterOfferingCatalogService {
  const raw: PricingProductSource = new CatalogPricingProductSource(
    new LiveProductControlReader(repository),
  );
  const pricingSource =
    mode === "after" ? createRequestScopedPricingProductSource(raw) : raw;

  const rawBindings = bindingReaderFor(productControlSize);
  const bindings =
    mode === "after"
      ? createRequestScopedBindingReader(rawBindings)
      : rawBindings;

  const authenticatedAudience = authorizeAudienceFromServerIdentity({
    audience: "member",
    sourceVersion: "member-v1",
    evaluatedAt: AT,
  });
  if (authenticatedAudience === null) throw new Error("audience not authorized");

  const prices = createMasterOfferingPriceAuthority({
    bindings,
    prices: createAuthoritativeApprovedPriceReader(
      createAuthoritativePriceResolver(pricingSource),
      () => ({ authenticatedAudience, currency: "USD" }),
    ),
  });

  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader(offerings),
    async () => ({ binding: null, selection: null }),
    prices,
  );
}

function pricedDisplays(
  views: ReadonlyMap<string, MasterOfferingPriceView>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [variantId, view] of Array.from(views.entries())) {
    out[variantId] = view.state === "priced" ? view.display : "on_request";
  }
  return out;
}

describe("catalog v2 pricing read fan-out", () => {
  it("prices a page of 24 cards with one Product Control read, not one per variant", async () => {
    // 1,121 offerings is the real generated dataset size; one page is 24 cards.
    const offerings = buildOfferings(1121, 1);

    const size = PAGE_PRODUCT_CONTROL_SIZE;
    const beforeRepository = new CountingProductControlRepository(size);
    const before = await serviceOver(
      offerings,
      beforeRepository,
      "before",
      size,
    ).select({ page: 1, pageSize: 24 });

    const afterRepository = new CountingProductControlRepository(size);
    const after = await serviceOver(
      offerings,
      afterRepository,
      "after",
      size,
    ).select({ page: 1, pageSize: 24 });

    // The page is the same page, priced the same way. This is the property the
    // speed is not allowed to cost.
    expect(after.page).toEqual(before.page);
    expect(pricedDisplays(after.prices)).toEqual(pricedDisplays(before.prices));
    expect(
      Object.values(pricedDisplays(after.prices)).every((value) =>
        value.startsWith("$"),
      ),
    ).toBe(true);

    // Closed form for the unfixed path: one full catalog read per priced
    // variant, each read costing 2 list calls and 2 get calls per product.
    expect(before.prices.size).toBe(24);
    expect(beforeRepository.total).toBe(24 * perCatalogRead(size));
    expect(afterRepository.total).toBe(perCatalogRead(size));

    console.log(
      `[page of 24] Product Control repository reads before=${beforeRepository.total} ` +
        `after=${afterRepository.total} ` +
        `(${(beforeRepository.total / afterRepository.total).toFixed(1)}x)`,
    );
  });

  it("exports the 5,000 row price list with one Product Control read", async () => {
    // 5,000 member variants: the exact cap in MASTER_OFFERING_PRICE_LIST_MAX_ROWS.
    const offerings = buildOfferings(1000, 5);

    const size = EXPORT_PRODUCT_CONTROL_SIZE;
    const afterRepository = new CountingProductControlRepository(size);
    const afterStarted = Date.now();
    const after = await serviceOver(
      offerings,
      afterRepository,
      "after",
      size,
    ).priceList({ query: {}, audience: "member", generatedAt: AT });
    const afterMs = Date.now() - afterStarted;

    const beforeRepository = new CountingProductControlRepository(size);
    const beforeStarted = Date.now();
    const before = await serviceOver(
      offerings,
      beforeRepository,
      "before",
      size,
    ).priceList({ query: {}, audience: "member", generatedAt: AT });
    const beforeMs = Date.now() - beforeStarted;

    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    if (!before.ok || !after.ok) throw new Error("price list refused");
    expect(after.document).toEqual(before.document);

    expect(beforeRepository.total).toBe(5000 * perCatalogRead(size));
    expect(afterRepository.total).toBe(perCatalogRead(size));

    console.log(
      `[export of 5,000 rows] Product Control repository reads ` +
        `before=${beforeRepository.total} after=${afterRepository.total} ` +
        `(${(beforeRepository.total / afterRepository.total).toFixed(1)}x); ` +
        `wall clock before=${beforeMs}ms after=${afterMs}ms`,
    );
  }, 900_000);

  it("reads each binding once per request instead of once per asking authority", async () => {
    let reads = 0;
    const counted: MasterOfferingCommerceBindingReader = {
      readBinding(input) {
        reads += 1;
        return {
          offeringVariantId: input.offeringVariantId,
          productId: "product-0",
          variantId: "variant-0",
        };
      },
    };
    const scoped = createRequestScopedBindingReader(counted);
    const first = await scoped.readBinding({
      offeringId: "mo_0",
      offeringVariantId: "mov_0_0",
    });
    const second = await scoped.readBinding({
      offeringId: "mo_0",
      offeringVariantId: "mov_0_0",
    });
    expect(reads).toBe(1);
    expect(second).toEqual(first);

    // A different variant is a different question and is read.
    await scoped.readBinding({
      offeringId: "mo_0",
      offeringVariantId: "mov_0_1",
    });
    expect(reads).toBe(2);
  });
});
