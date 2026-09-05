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
  reviewedFormulationHolds: ReadonlySet<string> = new Set(),
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
    reviewedFormulationHolds,
  });
}

describe("assisted-order production catalog mapping", () => {
  it("carries exact Master Offering provenance across a different Product Control identity", async () => {
    const source = callbacks([offering()], new Map([["var_1", priced(5000)]]));
    const page = await source.list(viewer, { page: 1, pageSize: 24 });
    const resolved = await source.resolve(viewer, "pc-prod-1", "pc-var-1");
    const expected = {
      family: "research_peptides_materials",
      slug: "bpc-157",
      variantId: "var_1",
    };
    expect(page.items[0].sourceSelection).toEqual(expected);
    expect(resolved?.sourceSelection).toEqual(expected);
    expect(resolved?.variantId).toBe("pc-var-1");
    expect(resolved?.unitPriceCents).toBe(5000);
    // Provenance is not a substitute for the order's canonical identity.
    expect(await source.resolve(viewer, "off_1", "var_1")).toBeNull();
  });

  it("retains source provenance without upgrading unbound or Care purchase authority", async () => {
    const unbound = await callbacks([offering()], new Map([["var_1", priced(5000)]]), false)
      .list(viewer, { page: 1, pageSize: 24 });
    expect(unbound.items[0].sourceSelection?.variantId).toBe("var_1");
    expect(unbound.items[0].variantId).toBe("unbound:var_1");
    expect(unbound.items[0].unitPriceCents).toBeNull();
    expect(unbound.items[0].workflowMode).toBe("request_pricing");

    const care = await callbacks(
      [offering({ family: "clinical_formulations_503a", displayState: "care_pathway" })],
      new Map([["var_1", priced(5000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(care.items[0].sourceSelection?.family).toBe("clinical_formulations_503a");
    expect(care.items[0].workflowMode).toBe("provider_request");
  });

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

  it("uses canonical provider-family authority even without a care display state", async () => {
    const page = await callbacks(
      [offering({ family: "provider_network" } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(9000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });

    expect(page.items[0].workflowMode).toBe("provider_request");
    expect(page.items[0].actionLabel).toBe("Continue through Care");
  });

  it("never misroutes a non-merchandise shipping row into Care or ordering", async () => {
    const page = await callbacks(
      [offering({
        family: "shipping_and_fulfillment",
        displayState: "care_pathway",
        variants: [{
          id: "var_1",
          label: "Standard overnight",
          displayState: "care_pathway",
          visibility: "member",
          sourceReferences: [],
        }],
      } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(5000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });

    expect(page.items[0].workflowMode).toBe("availability_review");
    expect(page.items[0].workflowMode).not.toBe("provider_request");
    expect(page.items[0].workflowMode).not.toBe("direct_order_request");
  });

  it("keeps a classification-pending variant as an activation request", async () => {
    const page = await callbacks(
      [offering({ displayState: "approval_required", variants: [{ id: "var_1", label: "10 mg", displayState: "approval_required", visibility: "member", sourceReferences: [] }] } as Partial<NormalizedMasterOffering>)],
      new Map(),
    ).list(viewer, { page: 1, pageSize: 24 });
    expect(page.items[0].workflowMode).toBe("request_activation");
    expect(page.items[0].actionLabel).toBe("Request Order");
  });

  it("keeps canonical temporarily-unavailable variants held, priced or unpriced", async () => {
    const held = offering({
      displayState: "temporarily_unavailable",
      variants: [{
        id: "var_1",
        label: "10 mg",
        displayState: "temporarily_unavailable",
        visibility: "member",
        sourceReferences: [],
      }],
    } as Partial<NormalizedMasterOffering>);

    for (const prices of [new Map([["var_1", priced(5000)]]), new Map()]) {
      const page = await callbacks([held], prices).list(viewer, {
        page: 1,
        pageSize: 24,
      });
      expect(page.items[0].workflowMode).toBe("availability_review");
      expect(page.items[0].workflowMode).not.toBe("direct_order_request");
      expect(page.items[0].workflowMode).not.toBe("request_pricing");
    }
  });

  it("holds a formulation whose source label explicitly declares a pending split", async () => {
    const page = await callbacks(
      [offering({
        variants: [{
          id: "var_1",
          label: "CJC-1295 + Ipamorelin (split pending)",
          displayState: "request_access",
          visibility: "member",
          sourceReferences: [],
        }],
      } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(5000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });

    expect(page.items[0].workflowMode).toBe("availability_review");
    expect(page.items[0].workflowMode).not.toBe("direct_order_request");
  });

  it("never grants peptide-direct authority to a priced research capsule", async () => {
    const page = await callbacks(
      [offering({ family: "research_capsules" } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(5000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });

    expect(page.items[0].workflowMode).toBe("request_activation");
    expect(page.items[0].actionLabel).toBe("Request Order");
    expect(page.items[0].workflowMode).not.toBe("direct_order_request");
  });

  it("uses the canonical pathway authority for an eligible priced supplement", async () => {
    const page = await callbacks(
      [offering({ family: "supplements" } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(5000)]]),
    ).list(viewer, { page: 1, pageSize: 24 });

    expect(page.items[0].workflowMode).toBe("direct_order_request");
    expect(page.items[0].unitPriceCents).toBe(5000);
  });

  it("honors a founder-reviewed hold after customer-facing copy removes the internal marker", async () => {
    const canonicalSpecification = "CJC-1295 WITH DAC + IPAMORELIN 5 mg total";
    const page = await callbacks(
      [offering({
        variants: [{
          id: "var_1",
          label: canonicalSpecification,
          displayState: "request_access",
          visibility: "member",
          sourceReferences: [],
        }],
      } as Partial<NormalizedMasterOffering>)],
      new Map([["var_1", priced(5000)]]),
      true,
      Number.POSITIVE_INFINITY,
      new Set([canonicalSpecification.toUpperCase()]),
    ).list(viewer, { page: 1, pageSize: 24 });

    expect(page.items[0].workflowMode).toBe("availability_review");
    expect(page.items[0].workflowMode).not.toBe("direct_order_request");
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

  it("composes Family with search and Action, and clearing Family restores all rows", async () => {
    const rightDirect = offering({
      id: "off_right_direct",
      displayName: "Alpha Direct",
      canonicalName: "Alpha Direct",
      variants: [{
        id: "var_right_direct",
        label: "10 mg",
        displayState: "request_access",
        visibility: "member",
        sourceReferences: [],
      }],
    } as Partial<NormalizedMasterOffering>);
    const rightPending = offering({
      id: "off_right_pending",
      displayName: "Beta Pending",
      canonicalName: "Beta Pending",
      displayState: "approval_required",
      variants: [{
        id: "var_right_pending",
        label: "10 mg",
        displayState: "approval_required",
        visibility: "member",
        sourceReferences: [],
      }],
    } as Partial<NormalizedMasterOffering>);
    const wrongFamily = offering({
      id: "off_wrong_family_pair",
      displayName: "Alpha Capsule",
      canonicalName: "Alpha Capsule",
      family: "research_capsules",
      displayState: "approval_required",
      variants: [{
        id: "var_wrong_family_pair",
        label: "10 mg",
        displayState: "approval_required",
        visibility: "member",
        sourceReferences: [],
      }],
    } as Partial<NormalizedMasterOffering>);
    const all = [rightDirect, rightPending, wrongFamily];
    const built = callbacks(
      all,
      new Map(all.map((entry) => [entry.variants[0].id, priced(5000)])),
    );

    const familyOnly = await built.list(viewer, {
      family: "research_peptides_materials",
      page: 1,
      pageSize: 24,
    });
    expect(familyOnly.items.map((item) => item.productName)).toEqual([
      "Alpha Direct",
      "Beta Pending",
    ]);

    const searchAndFamily = await built.list(viewer, {
      search: "Alpha",
      family: "research_peptides_materials",
      page: 1,
      pageSize: 24,
    });
    expect(searchAndFamily.items.map((item) => item.productName)).toEqual([
      "Alpha Direct",
    ]);

    const familyAndAction = await built.list(viewer, {
      family: "research_peptides_materials",
      actionGroup: "request_order",
      page: 1,
      pageSize: 24,
    });
    expect(familyAndAction.items.map((item) => item.productName)).toEqual([
      "Beta Pending",
    ]);

    const cleared = await built.list(viewer, { page: 1, pageSize: 24 });
    expect(cleared.items.map((item) => item.productName)).toEqual([
      "Alpha Direct",
      "Beta Pending",
      "Alpha Capsule",
    ]);
  });

  it("applies a supported Channel filter before pagination", async () => {
    const peptides = offering({
      id: "off_peptides",
      displayName: "Peptide Row",
      category: "Peptides",
      variants: [{
        id: "var_peptides",
        label: "10 mg",
        displayState: "request_access",
        visibility: "member",
        sourceReferences: [],
      }],
    } as Partial<NormalizedMasterOffering>);
    const wellness = offering({
      id: "off_wellness",
      displayName: "Wellness Row",
      category: "Wellness",
      variants: [{
        id: "var_wellness",
        label: "60 count",
        displayState: "request_access",
        visibility: "member",
        sourceReferences: [],
      }],
    } as Partial<NormalizedMasterOffering>);
    const built = callbacks(
      [peptides, wellness],
      new Map([
        ["var_peptides", priced(5000)],
        ["var_wellness", priced(5000)],
      ]),
    );

    const page = await built.list(viewer, {
      channel: "Wellness",
      page: 1,
      pageSize: 1,
    });

    expect(page.total).toBe(1);
    expect(page.items.map((item) => item.productName)).toEqual(["Wellness Row"]);
  });

  it("fails closed if the canonical topology stops being one variant per offering", async () => {
    const multiVariant = offering({
      variants: [
        {
          id: "var_1",
          label: "10 mg",
          displayState: "request_access",
          visibility: "member",
          sourceReferences: [],
        },
        {
          id: "var_2",
          label: "20 mg",
          displayState: "request_access",
          visibility: "member",
          sourceReferences: [],
        },
      ],
    } as Partial<NormalizedMasterOffering>);

    await expect(
      callbacks([multiVariant], new Map()).list(viewer, { page: 1, pageSize: 24 }),
    ).rejects.toThrow("requires one variant per offering");
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
    const targetPriceRequest = offering({
      id: "off_target_price_request",
      slug: "target-price-request",
      canonicalKey: "target-price-request",
      displayName: "Target Price Request",
      canonicalName: "Target Price Request",
      variants: [{
        id: "var_target_price_request",
        label: "10 mg",
        displayState: "request_access",
        visibility: "member",
        sourceReferences: [],
      }],
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
      targetPriceRequest,
      wrongFamilyPending,
      wrongSearchPending,
    ];
    const prices = new Map(
      all
        .filter((entry) => entry.id !== targetPriceRequest.id)
        .map((entry) => [entry.variants[0].id, priced(5000)]),
    );

    const page = await callbacks(all, prices, true, 100).list(viewer, {
      search: "Target",
      family: "research_peptides_materials",
      actionGroup: "request_order",
      page: 1,
      pageSize: 24,
    });

    // The only match sits after the canonical source's 100-row clamp. Search
    // excludes Unrelated, Family excludes capsules, and Action excludes the
    // 105 direct rows after authoritative projection.
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.productName)).toEqual([
      "Target Pending",
      "Target Price Request",
    ]);
    expect(page.items.map((item) => item.workflowMode)).toEqual([
      "request_activation",
      "request_pricing",
    ]);
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

  it("rejects a swapped synthetic product id for a real unbound variant", async () => {
    const built = callbacks([offering()], new Map(), false);
    const page = await built.list(viewer, { page: 1, pageSize: 24 });
    const listed = page.items[0];

    expect(
      await built.resolve(viewer, "unbound:off_attacker", listed.variantId),
    ).toBeNull();
  });

  it("keeps a priced-but-unbound synthetic row request-only when re-resolved", async () => {
    const built = callbacks(
      [offering()],
      new Map([["var_1", priced(5000)]]),
      false,
    );
    const listed = (await built.list(viewer, { page: 1, pageSize: 24 })).items[0];

    const resolved = await built.resolve(viewer, listed.productId, listed.variantId);

    expect(resolved).not.toBeNull();
    expect(resolved?.unitPriceCents).toBeNull();
    expect(resolved?.priceVersion).toBeNull();
    expect(resolved?.workflowMode).toBe("request_pricing");
  });

  it("rejects a stale synthetic identity once the variant gains a reviewed binding", async () => {
    const offerings = [offering()];
    const prices = new Map([["var_1", priced(5000)]]);
    let bound = false;
    const service = {
      select: async () => ({
        offerings,
        prices,
        page: { page: 1, pageSize: 24, total: 1 },
      }),
    } as AssistedOrderMasterCatalogService;
    const built = createAssistedOrderMasterCatalogCallbacks({
      serviceFor: () => service,
      bindingFor: () => bound
        ? { productId: "pc-prod-1", variantId: "pc-var-1" }
        : null,
      offeringVariantFor: () => "var_1",
      catalogVersion: "catalog-test-v1",
    });
    const listed = (await built.list(viewer, { page: 1, pageSize: 24 })).items[0];
    bound = true;

    expect(await built.resolve(viewer, listed.productId, listed.variantId)).toBeNull();
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
