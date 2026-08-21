import { describe, expect, it } from "vitest";
import {
  createAssistedOrderMasterCatalogCallbacks,
  type AssistedOrderMasterCatalogService,
} from "./production-catalog";
import type { AssistedOrderViewer } from "./ports";
import type { NormalizedMasterOffering } from "../master-offerings/model";
import type { MasterOfferingPriceView } from "../../../shared/research/master-offerings/pricing-contract";
import { quantityIsAllowed } from "../../../shared/research/assisted-order/action-policy";
import { ASSISTED_ORDER_MAX_QUANTITY } from "../../../shared/research/assisted-order/contract";
import {
  EARLY_ACCESS_CART_DURABLE_MAX_QUANTITY,
  EARLY_ACCESS_MAX_QUANTITY,
  EARLY_ACCESS_POLICY_MAX_QUANTITY,
} from "../../../shared/research/early-access-quantity";

const viewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  capabilities: new Set(["assisted_orders:submit"]),
});

function offering(
  overrides: Partial<NormalizedMasterOffering> = {},
): NormalizedMasterOffering {
  return {
    id: "off_1",
    slug: "bpc-157",
    canonicalKey: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_peptides_materials",
    category: "Peptides",
    subcategory: null,
    brand: null,
    aliases: [],
    displayState: "request_access",
    stateExplanation: "Research use only.",
    copyState: "approved",
    visibility: "member",
    variants: [
      {
        id: "var_1",
        label: "10 mg",
        displayState: "request_access",
        visibility: "member",
        sourceReferences: [],
      },
    ],
    sourceReferences: [],
    ...overrides,
  } as NormalizedMasterOffering;
}

function priced(amountCents: number): MasterOfferingPriceView {
  return {
    state: "priced",
    amountCents,
    currency: "USD",
    display: `$${(amountCents / 100).toFixed(2)}`,
    basis: "exact_listed_unit",
    priceId: "price-1",
  } as MasterOfferingPriceView;
}

function callbacks(
  offerings: NormalizedMasterOffering[],
  prices: ReadonlyMap<string, MasterOfferingPriceView>,
  bound = true,
  // The real catalog search clamps pageSize to 100 and then slices. A double
  // that ignores paging cannot see the defect that clamp caused, which is
  // exactly why the submission-time re-read shipped able to find only the
  // alphabetically first hundred offerings.
  clampPageSize = Number.POSITIVE_INFINITY,
) {
  const service = {
    select: async (
      query: Parameters<AssistedOrderMasterCatalogService["select"]>[0] = {},
    ) => {
      const normalizedSearch = query.q?.trim().toLowerCase() ?? "";
      const matching = offerings.filter((entry) => {
        if (query.families && !query.families.includes(entry.family)) {
          return false;
        }
        if (normalizedSearch === "") return true;
        return [
          entry.displayName,
          entry.canonicalName,
          ...entry.variants.map((variant) => variant.label),
        ].some((value) => value.toLowerCase().includes(normalizedSearch));
      });
      const requested = query.pageSize ?? 24;
      const pageSize = Math.min(requested, clampPageSize);
      const page = query.page ?? 1;
      const start = (page - 1) * pageSize;
      const slice = matching.slice(start, start + pageSize);
      return {
        offerings: slice,
        prices,
        page: { ok: true, page, pageSize, total: matching.length, totalPages: Math.ceil(matching.length / pageSize), sort: "name", products: [], facets: {} },
      };
    },
  } as unknown as AssistedOrderMasterCatalogService;
  return createAssistedOrderMasterCatalogCallbacks({
    serviceFor: () => service,
    bindingFor: (offeringVariantId) =>
      bound ? { productId: "pc-prod-1", variantId: "pc-var-1" } : null,
    offeringVariantFor: (identity) =>
      bound && identity.productId === "pc-prod-1" && identity.variantId === "pc-var-1"
        ? "var_1"
        : null,
    catalogVersion: "catalog-test-v1",
  });
}

describe("assisted-order production catalog mapping", () => {
  it("projects a priced bound research variant as direct-eligible with the exact price", async () => {
    const page = await callbacks([offering()], new Map([["var_1", priced(5000)]])).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.productId).toBe("pc-prod-1");
    expect(item.variantId).toBe("pc-var-1");
    expect(item.unitPriceCents).toBe(5000);
    expect(item.priceVersion).toBe("price-1");
    expect(item.catalogVersion).toBe("catalog-test-v1");
    expect(item.workflowMode).toBe("direct_order_request");
    expect(item.researchUseOnly).toBe(true);
  });

  it("keeps a care-pathway variant visible as a provider request, never direct", async () => {
    const page = await callbacks(
      [offering({ family: "clinical_formulations_503a", displayState: "care_pathway", variants: [{ id: "var_1", label: "Rx", displayState: "care_pathway", visibility: "member", sourceReferences: [] }] } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(9000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].workflowMode).toBe("provider_request");
    expect(page.items[0].actionLabel).toBe("Continue through Care");
  });

  it("keeps a classification-pending variant as an activation request", async () => {
    const page = await callbacks(
      [offering({ displayState: "approval_required", variants: [{ id: "var_1", label: "10 mg", displayState: "approval_required", visibility: "member", sourceReferences: [] }] } as Partial<NormalizedMasterOffering>)],
      new Map(),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].workflowMode).toBe("request_activation");
    expect(page.items[0].actionLabel).toBe("Request Order");
  });

  it("keeps an unpriced variant visible as request pricing with a null price, never zero", async () => {
    const page = await callbacks([offering()], new Map()).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].unitPriceCents).toBeNull();
    expect(page.items[0].workflowMode).toBe("request_pricing");
  });

  it("strips price and direct eligibility from a variant without a commerce binding", async () => {
    const page = await callbacks([offering()], new Map([["var_1", priced(5000)]]), false).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].unitPriceCents).toBeNull();
    expect(page.items[0].workflowMode).toBe("request_pricing");
  });

  it("resolves the exact identity at submission time and misses unknown identities", async () => {
    const built = callbacks([offering()], new Map([["var_1", priced(5000)]]));
    const hit = await built.resolve(viewer, "pc-prod-1", "pc-var-1");
    expect(hit?.unitPriceCents).toBe(5000);
    const miss = await built.resolve(viewer, "pc-prod-1", "pc-var-unknown");
    expect(miss).toBeNull();
  });

  it("composes search, canonical Family, and derived Action across source pages", async () => {
    const direct = Array.from({ length: 105 }, (_, index) =>
      offering({
        id: `off_direct_${index}`,
        slug: `target-direct-${index}`,
        canonicalKey: `target-direct-${index}`,
        displayName: `Target Direct ${index}`,
        canonicalName: `Target Direct ${index}`,
        variants: [
          {
            id: `var_direct_${index}`,
            label: "10 mg",
            displayState: "request_access",
            visibility: "member",
            sourceReferences: [],
          },
        ],
      } as Partial<NormalizedMasterOffering>),
    );
    const targetPending = offering({
      id: "off_target_pending",
      slug: "target-pending",
      canonicalKey: "target-pending",
      displayName: "Target Pending",
      canonicalName: "Target Pending",
      displayState: "approval_required",
      variants: [
        {
          id: "var_target_pending",
          label: "10 mg",
          displayState: "approval_required",
          visibility: "member",
          sourceReferences: [],
        },
      ],
    } as Partial<NormalizedMasterOffering>);
    const wrongFamilyPending = offering({
      id: "off_wrong_family",
      slug: "target-wrong-family",
      canonicalKey: "target-wrong-family",
      displayName: "Target Wrong Family",
      canonicalName: "Target Wrong Family",
      family: "research_capsules",
      displayState: "approval_required",
      variants: [
        {
          id: "var_wrong_family",
          label: "10 mg",
          displayState: "approval_required",
          visibility: "member",
          sourceReferences: [],
        },
      ],
    } as Partial<NormalizedMasterOffering>);
    const wrongSearchPending = offering({
      id: "off_wrong_search",
      slug: "unrelated-pending",
      canonicalKey: "unrelated-pending",
      displayName: "Unrelated Pending",
      canonicalName: "Unrelated Pending",
      displayState: "approval_required",
      variants: [
        {
          id: "var_wrong_search",
          label: "10 mg",
          displayState: "approval_required",
          visibility: "member",
          sourceReferences: [],
        },
      ],
    } as Partial<NormalizedMasterOffering>);
    const all = [
      ...direct,
      targetPending,
      wrongFamilyPending,
      wrongSearchPending,
    ];
    const prices = new Map(
      all.map((entry) => [entry.variants[0].id, priced(5000)]),
    );

    const page = await callbacks(all, prices, true, 100).list(viewer, {
      search: "Target",
      family: "research_peptides_materials",
      workflowMode: "request_activation",
      page: 1,
      pageSize: 24,
    });

    // The only match sits after the canonical source's 100-row clamp. Search
    // excludes Unrelated, Family excludes capsules, and Action excludes the
    // 105 direct rows after authoritative projection.
    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.productName)).toEqual([
      "Target Pending",
    ]);
    expect(page.items[0].workflowMode).toBe("request_activation");
    expect(page.families).toContain("research_peptides_materials");
    expect(page.families).toContain("research_capsules");
  });

  it("does not turn an invalid Family token into an unfiltered response", async () => {
    const page = await callbacks(
      [offering()],
      new Map([["var_1", priced(5000)]]),
    ).list(viewer, {
      family: "Research Peptides" as never,
      page: 1,
      pageSize: 24,
    });

    expect(page.total).toBe(0);
    expect(page.items).toEqual([]);
  });
});

describe("the submission-time re-read against a clamping catalog", () => {
  /**
   * The catalog search clamps pageSize to 100 and then slices, so asking for
   * "everything" returns the alphabetically first hundred and looks complete.
   * This seam asked for a million rows, so 320 of the 420 production offerings
   * resolved to null at submission and the whole request died as an opaque
   * HTTP 500 — after the customer had entered contact details and accepted
   * every agreement, with nothing stored and no operator notified.
   *
   * Neither half was wrong on its own: the clamp has its own passing test, and
   * this file's double used to ignore paging entirely. Only the composition
   * was broken, which is why nothing caught it.
   */
  function manyOfferings(count: number): NormalizedMasterOffering[] {
    return Array.from({ length: count }, (_, index) => {
      const id = String(index).padStart(4, "0");
      return offering({
        id: `off_${id}`,
        slug: `product-${id}`,
        displayName: `Product ${id}`,
        variants: [
          { id: `var_${id}`, label: "10 mg", displayState: "request_access", visibility: "member", sourceReferences: [] },
        ],
      } as Partial<NormalizedMasterOffering>);
    });
  }

  function boundCallbacks(offerings: NormalizedMasterOffering[], target: string) {
    const prices = new Map(offerings.map((entry) => [entry.variants[0].id, priced(5000)]));
    return createAssistedOrderMasterCatalogCallbacks({
      serviceFor: () => ({
        select: async (query: { page?: number; pageSize?: number } = {}) => {
          const pageSize = Math.min(query.pageSize ?? 24, 100);
          const page = query.page ?? 1;
          const start = (page - 1) * pageSize;
          return {
            offerings: offerings.slice(start, start + pageSize),
            prices,
            page: { ok: true, page, pageSize, total: offerings.length, totalPages: Math.ceil(offerings.length / pageSize), sort: "name", products: [], facets: {} },
          };
        },
      }) as unknown as AssistedOrderMasterCatalogService,
      bindingFor: () => ({ productId: "pc-prod-1", variantId: "pc-var-1" }),
      offeringVariantFor: () => target,
      catalogVersion: "catalog-test-v1",
    });
  }

  it("finds an offering far past the clamp boundary", async () => {
    const offerings = manyOfferings(420);
    // Position 400 of 420: unreachable in a single clamped page.
    const target = offerings[399].variants[0].id;
    const built = boundCallbacks(offerings, target);
    const resolved = await built.resolve(viewer, "pc-prod-1", "pc-var-1");
    expect(resolved).not.toBeNull();
    expect(resolved?.unitPriceCents).toBe(5000);
  });

  it("still finds one inside the first page", async () => {
    const offerings = manyOfferings(420);
    const built = boundCallbacks(offerings, offerings[3].variants[0].id);
    expect(await built.resolve(viewer, "pc-prod-1", "pc-var-1")).not.toBeNull();
  });

  it("returns null for an identity the catalog genuinely does not carry, without spinning", async () => {
    const offerings = manyOfferings(420);
    const built = boundCallbacks(offerings, "var_does_not_exist");
    expect(await built.resolve(viewer, "pc-prod-1", "pc-var-1")).toBeNull();
  });
});

describe("a variant with no commerce binding", () => {
  /**
   * A row without a binding is deliberately still listed — "Price on request"
   * is a truthful state, and two of the founder's catalog rows are exactly
   * that. The list side mints it a synthetic identity; the submit side has to
   * be able to read that identity back. It could not, so the catalog invited a
   * customer to ask about the product and then refused the ENTIRE basket when
   * they did.
   */
  it("is listed with no price and an honest pathway", async () => {
    const page = await callbacks([offering()], new Map(), false).list(viewer, { page: 1, pageSize: 24 });
    const item = page.items[0];
    expect(item.unitPriceCents).toBeNull();
    expect(item.workflowMode).toBe("request_pricing");
    expect(item.productId.startsWith("unbound:")).toBe(true);
    expect(item.variantId.startsWith("unbound:")).toBe(true);
  });

  it("resolves back from its own synthetic identity at submission", async () => {
    const built = callbacks([offering()], new Map(), false);
    const page = await built.list(viewer, { page: 1, pageSize: 24 });
    const listed = page.items[0];

    const resolved = await built.resolve(viewer, listed.productId, listed.variantId);
    expect(resolved).not.toBeNull();
    expect(resolved?.productId).toBe(listed.productId);
    expect(resolved?.variantId).toBe(listed.variantId);
    // Still unpriced, still request-only. Resolving it must not invent a price.
    expect(resolved?.unitPriceCents).toBeNull();
    expect(resolved?.workflowMode).toBe("request_pricing");
  });

  it("does not resolve a synthetic identity the catalog never minted", async () => {
    const built = callbacks([offering()], new Map(), false);
    expect(await built.resolve(viewer, "unbound:off_x", "unbound:var_nope")).toBeNull();
  });
});

/**
 * The founder's per-variant ceiling, proven where it is actually decided.
 *
 * This band is not a UI courtesy. M71 copies it onto every stored line and
 * checks the quantity against that stored copy, so whatever the authority says
 * here is what the database will enforce for the life of that request. It read
 * `null` before 2026-08-20, which meant "no maximum": a request for ten thousand
 * vials of one variant was a legal request, bounded only by the contract's
 * 100_000 sanity ceiling, which exists to keep arithmetic safe rather than to
 * express a commercial rule.
 */
describe("the founder's per-variant quantity ceiling", () => {
  it("carries 100 on the authority row, not an absent maximum", async () => {
    const page = await callbacks([offering()], new Map([["var_1", priced(5000)]])).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].maximumQuantity).toBe(EARLY_ACCESS_POLICY_MAX_QUANTITY);
    expect(page.items[0].maximumQuantity).toBe(100);
    expect(page.items[0].minimumQuantity).toBe(1);
    expect(page.items[0].quantityIncrement).toBe(1);
  });

  it("accepts exactly one hundred and refuses one hundred and one", async () => {
    const page = await callbacks([offering()], new Map([["var_1", priced(5000)]])).list(viewer, { page: 1, pageSize: 24 });
    const item = page.items[0];
    expect(quantityIsAllowed(item, 100)).toBe(true);
    expect(quantityIsAllowed(item, 101)).toBe(false);
    expect(quantityIsAllowed(item, 1)).toBe(true);
    expect(quantityIsAllowed(item, 0)).toBe(false);
  });

  it("still carries the ceiling on a variant that cannot be ordered directly", async () => {
    // A Care row is not orderable through this lane at all, but if the pathway
    // ever changed, an absent band must not be what decides the quantity.
    const page = await callbacks(
      [offering({ family: "clinical_formulations_503a", displayState: "care_pathway", variants: [{ id: "var_1", label: "Rx", displayState: "care_pathway", visibility: "member", sourceReferences: [] }] } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(9000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].workflowMode).toBe("provider_request");
    expect(page.items[0].maximumQuantity).toBe(100);
  });

  it("keeps the contract's sanity ceiling far above the commercial ceiling", () => {
    // The two numbers answer different questions and must not be collapsed:
    // 100 is what a customer may buy, 100_000 is what the arithmetic can hold.
    expect(ASSISTED_ORDER_MAX_QUANTITY).toBeGreaterThan(EARLY_ACCESS_POLICY_MAX_QUANTITY);
  });

  it("records that the cart lane has NOT reached the policy ceiling yet", () => {
    // Deliberate, and pinned so it cannot drift silently: the cart's durable
    // band is a database constraint, and as of 2026-08-20 production still
    // carries the original 1..3 band with M65 and M66 both pending. Widening
    // the constant before the migration chain would let a customer fill a cart
    // and lose it at insert. When the chain is applied, this expectation is the
    // thing that fails and tells the next person to finish the move.
    expect(EARLY_ACCESS_CART_DURABLE_MAX_QUANTITY).toBe(50);
    expect(EARLY_ACCESS_MAX_QUANTITY).toBe(EARLY_ACCESS_CART_DURABLE_MAX_QUANTITY);
    expect(EARLY_ACCESS_CART_DURABLE_MAX_QUANTITY).toBeLessThan(EARLY_ACCESS_POLICY_MAX_QUANTITY);
  });
});
