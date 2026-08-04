import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import { PEPTIDE_CATALOG } from "@shared/research/catalog/peptide-catalog";
import { recordedVariantStrengthDisputes } from "../../products-diagnostics/variant-strength-dispute";
import {
  EARLY_ACCESS_BLOCKERS,
  EARLY_ACCESS_PERMITTED_AUDIENCES,
  EARLY_ACCESS_PURCHASE_OFFER_MODES,
  assessEarlyAccessEligibility,
  earlyAccessStrengthDisputeState,
  resolveEarlyAccessPrice,
  type EarlyAccessProductRecord,
  type EarlyAccessVariantFacts,
} from "./eligibility";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const EVALUATED_AT = NOW.toISOString();

const PRODUCT_ID = "prod-ea-0001";
const VARIANT_ID = "var-ea-0001";

/**
 * A SKU deliberately outside the founder-locked peptide catalog, so a satisfied
 * fixture is not accidentally cleared or blocked by a real recorded dispute.
 */
const NEUTRAL_SKU = "EA-TEST-0001";

function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: NEUTRAL_SKU,
    catalogNumber: null,
    label: "Primary presentation",
    strength: "10 mg",
    size: "1 unit",
    format: "vial",
    presentation: "Single-use vial",
    shippingClass: "ambient",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-ea-0001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "private_early_access",
    amountCents: 24_900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    status: "active",
    approvalNote: null,
    version: 1,
    createdBy: "operations",
    approvedBy: "founder",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function product(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "EA0001",
    slug: "early-access-test-item",
    displayName: "Early Access Test Item",
    canonicalName: "Early Access Test Item",
    aliases: [],
    lane: "research_material",
    category: "Research materials",
    classification: "Research catalog item",
    status: "published",
    active: true,
    visibility: "members_only",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: "2026-07-01T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
    content: {
      shortDescription: "A research catalog item held for internal review.",
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
    variants: [variant()],
    prices: [price()],
    media: [],
    history: [],
    ...overrides,
  };
}

function facts(
  overrides: Partial<EarlyAccessVariantFacts> = {},
): EarlyAccessVariantFacts {
  return {
    variantId: VARIANT_ID,
    supplier: {
      variantId: VARIANT_ID,
      fulfillmentOwner: "xenios",
      sourceVersion: "supplier-v1",
    },
    fulfillment: {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: EVALUATED_AT,
    },
    documentation: {
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      state: "verified",
      sourceVersion: "coa-v1",
      evaluatedAt: EVALUATED_AT,
    },
    quantityLimit: { variantId: VARIANT_ID, maxUnitsPerOrder: 3 },
    offerState: "APPROVAL_REQUIRED_PURCHASE",
    identityDispute: "cleared",
    strengthDispute: "cleared",
    image: {
      variantId: VARIANT_ID,
      mediaId: "media-ea-0001",
      state: "approved",
      approvedBy: "operations",
      altText: "Product image",
    },
    ...overrides,
  };
}

/** A record with every Early Access condition satisfied. */
function satisfied(
  overrides: Partial<EarlyAccessProductRecord> = {},
): EarlyAccessProductRecord {
  return {
    product: product(),
    audience: {
      audience: "private_early_access",
      state: "authorized",
      sourceVersion: "early_access_customer:cus-ea-0001",
      evaluatedAt: EVALUATED_AT,
    },
    currency: "USD",
    variantFacts: [facts()],
    ...overrides,
  };
}

function blockersFor(record: EarlyAccessProductRecord): readonly string[] {
  const result = assessEarlyAccessEligibility(
    record,
    record.product.variants[0],
    NOW,
  );
  return result.eligible ? [] : result.blockers;
}

describe("assessEarlyAccessEligibility", () => {
  it("passes only when every condition holds", () => {
    expect(assessEarlyAccessEligibility(satisfied(), variant(), NOW)).toEqual({
      eligible: true,
    });
  });

  it("holds a Product Control record in the state the database actually creates", () => {
    // research_admin_create_product inserts draft, hidden, documentation_review,
    // blocked_pending_written_approval, quality_document_state missing, with no
    // variant, price, or media rows. A draft variant added to such a record is
    // blocked by every gate, and that is the truthful answer.
    const record: EarlyAccessProductRecord = {
      product: product({
        status: "draft",
        visibility: "hidden",
        availability: "documentation_review",
        commerceApproval: "blocked_pending_written_approval",
        qualityDocumentState: "missing",
        variants: [variant({ status: "draft", strength: null, presentation: null })],
        prices: [],
      }),
      audience: null,
      currency: "",
      variantFacts: [],
    };
    // Every blocker the record can emit. The four recorded-prohibition
    // blockers are absent because a hold is a positive record: a draft with
    // no facts has nobody asserting REGULATORY_HOLD, RECALL, STOP_SHIP, or
    // SUPPLIER_QUALITY_HOLD, and everything else already holds the unit.
    const HOLD_BLOCKERS = ["REGULATORY_HOLD", "RECALL", "STOP_SHIP", "SUPPLIER_QUALITY_HOLD"];
    expect(blockersFor(record)).toEqual(
      EARLY_ACCESS_BLOCKERS.filter((code) => !HOLD_BLOCKERS.includes(code)),
    );
  });

  it("never infers eligibility from absent facts", () => {
    // Every declared fact removed. Nothing about the unit changed, so nothing
    // about it may be assumed.
    expect(blockersFor(satisfied({ variantFacts: [] }))).toEqual([
      "SUPPLIER_NOT_ASSIGNED",
      "FULFILLMENT_UNAVAILABLE",
      "QUANTITY_LIMIT_MISSING",
      "DOCUMENTATION_NOT_SATISFIED",
      "IDENTITY_DISPUTE_UNRESOLVED",
      "STRENGTH_DISPUTE_UNRESOLVED",
      "OFFER_STATE_NOT_PURCHASABLE",
    ]);
  });

  it("treats two declarations for the same unit as no declaration", () => {
    const record = satisfied({ variantFacts: [facts(), facts()] });
    expect(blockersFor(record)).toContain("SUPPLIER_NOT_ASSIGNED");
    expect(blockersFor(record)).toContain("OFFER_STATE_NOT_PURCHASABLE");
  });

  it("reports blockers in the canonical order with no duplicates", () => {
    const record = satisfied({
      product: product({
        variants: [variant({ strength: "  ", presentation: null })],
      }),
    });
    const reported = blockersFor(record);
    expect(reported).toEqual([
      "STRENGTH_NOT_CONFIRMED",
      "PRESENTATION_NOT_CONFIRMED",
    ]);
    expect(new Set(reported).size).toBe(reported.length);
  });

  describe("identity", () => {
    it("blocks a blank canonical identity", () => {
      expect(
        blockersFor(satisfied({ product: product({ canonicalName: "   " }) })),
      ).toContain("IDENTITY_NOT_CONFIRMED");
    });

    it("blocks an unapproved or inactive variant", () => {
      expect(
        blockersFor(
          satisfied({ product: product({ variants: [variant({ status: "draft" })] }) }),
        ),
      ).toContain("IDENTITY_NOT_CONFIRMED");
      expect(
        blockersFor(
          satisfied({ product: product({ variants: [variant({ active: false })] }) }),
        ),
      ).toContain("IDENTITY_NOT_CONFIRMED");
    });

    it("blocks a variant whose sku is claimed twice inside the product", () => {
      const twin = variant({ id: "var-ea-0002" });
      expect(
        blockersFor(
          satisfied({ product: product({ variants: [variant(), twin] }) }),
        ),
      ).toContain("IDENTITY_NOT_CONFIRMED");
    });

    it("blocks a variant that points at another product", () => {
      expect(
        blockersFor(
          satisfied({
            product: product({ variants: [variant({ productId: "prod-other" })] }),
          }),
        ),
      ).toContain("IDENTITY_NOT_CONFIRMED");
    });
  });

  describe("strength and presentation", () => {
    it("blocks a missing strength", () => {
      expect(
        blockersFor(
          satisfied({ product: product({ variants: [variant({ strength: null })] }) }),
        ),
      ).toContain("STRENGTH_NOT_CONFIRMED");
    });

    it("blocks a missing presentation", () => {
      expect(
        blockersFor(
          satisfied({
            product: product({ variants: [variant({ presentation: null })] }),
          }),
        ),
      ).toContain("PRESENTATION_NOT_CONFIRMED");
    });
  });

  describe("price", () => {
    it("blocks when Product Control holds no price row", () => {
      expect(blockersFor(satisfied({ product: product({ prices: [] }) }))).toContain(
        "PRICE_NOT_APPROVED",
      );
    });

    it("blocks a price nobody approved", () => {
      expect(
        blockersFor(
          satisfied({ product: product({ prices: [price({ approvedBy: null })] }) }),
        ),
      ).toContain("PRICE_NOT_APPROVED");
    });

    it("blocks a draft price row", () => {
      expect(
        blockersFor(
          satisfied({ product: product({ prices: [price({ status: "draft" })] }) }),
        ),
      ).toContain("PRICE_NOT_APPROVED");
    });

    it("never accepts a zero or negative amount", () => {
      for (const amountCents of [0, -1]) {
        const record = satisfied({
          product: product({ prices: [price({ amountCents })] }),
        });
        expect(resolveEarlyAccessPrice(record, variant(), NOW).ok).toBe(false);
        expect(blockersFor(record)).toContain("PRICE_NOT_APPROVED");
      }
    });

    it("blocks an amount above the Early Access unit ceiling", () => {
      const record = satisfied({
        product: product({ prices: [price({ amountCents: 500_001 })] }),
      });
      expect(resolveEarlyAccessPrice(record, variant(), NOW)).toEqual({
        ok: false,
        code: "price_missing",
      });
    });

    it("blocks a currency Early Access does not settle in", () => {
      const record = satisfied({
        currency: "EUR",
        product: product({ prices: [price({ currency: "EUR" })] }),
      });
      expect(blockersFor(record)).toContain("PRICE_CURRENCY_MISSING");
      expect(blockersFor(record)).toContain("PRICE_NOT_APPROVED");
    });

    it("blocks a price that is not yet effective or already expired", () => {
      expect(
        blockersFor(
          satisfied({
            product: product({
              prices: [price({ effectiveAt: "2026-09-01T00:00:00.000Z" })],
            }),
          }),
        ),
      ).toContain("PRICE_NOT_APPROVED");
      expect(
        blockersFor(
          satisfied({
            product: product({
              prices: [price({ expiresAt: "2026-08-01T00:00:00.000Z" })],
            }),
          }),
        ),
      ).toContain("PRICE_NOT_APPROVED");
    });

    it("takes no amount from a caller", () => {
      // The only path to an amount is product.prices. A record dressed up with a
      // caller-supplied amount cannot introduce one.
      const record = {
        ...satisfied({ product: product({ prices: [] }) }),
        priceCents: 9_900,
        amountCents: 9_900,
      } as unknown as EarlyAccessProductRecord;
      expect(resolveEarlyAccessPrice(record, variant(), NOW).ok).toBe(false);
    });
  });

  describe("audience", () => {
    it("serves the private early access audience only", () => {
      expect(EARLY_ACCESS_PERMITTED_AUDIENCES).toEqual(["private_early_access"]);
      // "member" is in this list on purpose: a signed-in member who never
      // became an approved Early Access customer is refused exactly as a
      // password-only session is. Membership is not Early Access approval.
      for (const audience of ["retail", "member", "professional", "wholesale"] as const) {
        expect(
          blockersFor(
            satisfied({
              audience: {
                audience,
                state: "authorized",
                sourceVersion: "v1",
                evaluatedAt: EVALUATED_AT,
              },
            }),
          ),
        ).toContain("AUDIENCE_NOT_PERMITTED");
      }
    });

    it("blocks an absent, unauthorized, unsourced, or stale audience fact", () => {
      expect(blockersFor(satisfied({ audience: null }))).toContain(
        "AUDIENCE_NOT_PERMITTED",
      );
      for (const override of [
        { state: "unauthorized" as const },
        { sourceVersion: "  " },
        { evaluatedAt: "2026-08-04T11:00:00.000Z" },
      ]) {
        expect(
          blockersFor(
            satisfied({
              audience: {
                audience: "private_early_access",
                state: "authorized",
                sourceVersion: "early_access_customer:cus-ea-0001",
                evaluatedAt: EVALUATED_AT,
                ...override,
              },
            }),
          ),
        ).toContain("AUDIENCE_NOT_PERMITTED");
      }
    });

    it("refuses the member audience even on a member-eligible variant", () => {
      // The silent-substitution case: a real, authorized member audience is
      // still not Early Access approval, so it never projects an eligible row.
      expect(
        blockersFor(
          satisfied({
            audience: {
              audience: "member",
              state: "authorized",
              sourceVersion: "member-v1",
              evaluatedAt: EVALUATED_AT,
            },
          }),
        ),
      ).toContain("AUDIENCE_NOT_PERMITTED");
    });

    it("does not read member eligibility for the private early access audience", () => {
      // memberEligible scopes the MEMBER surface. The Early Access audience is
      // governed by the census (releases, blockers, offer state), not by a
      // member-commerce flag, so a non-member-eligible variant stays eligible
      // here when every real condition holds.
      expect(
        assessEarlyAccessEligibility(
          satisfied({
            product: product({ variants: [variant({ memberEligible: false })] }),
          }),
          variant({ memberEligible: false }),
          NOW,
        ),
      ).toEqual({ eligible: true });
    });
  });

  describe("supplier, fulfillment, quantity, documentation", () => {
    it("blocks an unassigned supplier", () => {
      expect(
        blockersFor(
          satisfied({
            variantFacts: [
              facts({
                supplier: {
                  variantId: VARIANT_ID,
                  fulfillmentOwner: "not_assigned",
                  sourceVersion: "supplier-v1",
                },
              }),
            ],
          }),
        ),
      ).toContain("SUPPLIER_NOT_ASSIGNED");
    });

    it("blocks an unrecorded supplier assignment", () => {
      expect(
        blockersFor(satisfied({ variantFacts: [facts({ supplier: null })] })),
      ).toContain("SUPPLIER_NOT_ASSIGNED");
    });

    it("blocks fulfillment that is unavailable, unsourced, or stale", () => {
      for (const override of [
        { state: "unavailable" as const },
        { state: "unknown" as const },
        { reason: "not_currently_available" },
        { sourceVersion: " " },
        { evaluatedAt: "2026-08-03T12:00:00.000Z" },
      ]) {
        expect(
          blockersFor(
            satisfied({
              variantFacts: [
                facts({
                  fulfillment: {
                    productId: PRODUCT_ID,
                    variantId: VARIANT_ID,
                    state: "eligible",
                    reason: null,
                    sourceVersion: "inventory-v1",
                    evaluatedAt: EVALUATED_AT,
                    ...override,
                  },
                }),
              ],
            }),
          ),
        ).toContain("FULFILLMENT_UNAVAILABLE");
      }
    });

    it("blocks a missing or out-of-range quantity limit", () => {
      expect(
        blockersFor(satisfied({ variantFacts: [facts({ quantityLimit: null })] })),
      ).toContain("QUANTITY_LIMIT_MISSING");
      for (const maxUnitsPerOrder of [0, 4, 1.5]) {
        expect(
          blockersFor(
            satisfied({
              variantFacts: [
                facts({ quantityLimit: { variantId: VARIANT_ID, maxUnitsPerOrder } }),
              ],
            }),
          ),
        ).toContain("QUANTITY_LIMIT_MISSING");
      }
    });

    it("blocks documentation that is required, unsourced, stale, or unapproved", () => {
      expect(
        blockersFor(satisfied({ variantFacts: [facts({ documentation: null })] })),
      ).toContain("DOCUMENTATION_NOT_SATISFIED");
      expect(
        blockersFor(
          satisfied({
            variantFacts: [
              facts({
                documentation: {
                  productId: PRODUCT_ID,
                  variantId: VARIANT_ID,
                  state: "required",
                  sourceVersion: "coa-v1",
                  evaluatedAt: EVALUATED_AT,
                },
              }),
            ],
          }),
        ),
      ).toContain("DOCUMENTATION_NOT_SATISFIED");
      expect(
        blockersFor(
          satisfied({ product: product({ qualityDocumentState: "pending" }) }),
        ),
      ).toContain("DOCUMENTATION_NOT_SATISFIED");
    });
  });

  describe("disputes", () => {
    it("blocks an unknown or open identity dispute", () => {
      for (const identityDispute of ["unknown", "open"] as const) {
        expect(
          blockersFor(satisfied({ variantFacts: [facts({ identityDispute })] })),
        ).toContain("IDENTITY_DISPUTE_UNRESOLVED");
      }
    });

    it("blocks an unknown or open strength dispute", () => {
      for (const strengthDispute of ["unknown", "open"] as const) {
        expect(
          blockersFor(satisfied({ variantFacts: [facts({ strengthDispute })] })),
        ).toContain("STRENGTH_DISPUTE_UNRESOLVED");
      }
    });

    it("lets a real recorded dispute override a cleared declaration", () => {
      // Real repository data: the signed supplier master contests these exact
      // SKUs. A record cannot declare that away.
      const recorded = recordedVariantStrengthDisputes();
      expect(recorded.length).toBeGreaterThan(0);
      for (const dispute of recorded) {
        const contested = variant({ sku: dispute.sku });
        expect(
          earlyAccessStrengthDisputeState(
            facts({ strengthDispute: "cleared" }),
            contested,
          ),
        ).toBe("open");
        expect(
          blockersFor(
            satisfied({
              product: product({
                variants: [contested],
                prices: [price()],
              }),
            }),
          ),
        ).toContain("STRENGTH_DISPUTE_UNRESOLVED");
      }
    });
  });

  describe("offer state", () => {
    it("permits only the two purchase modes", () => {
      expect(EARLY_ACCESS_PURCHASE_OFFER_MODES).toEqual([
        "DIRECT_PRIVATE_PURCHASE",
        "APPROVAL_REQUIRED_PURCHASE",
      ]);
      for (const offerState of [
        "REQUEST_ACCESS_ONLY",
        "DISPLAY_ONLY",
        "UNAVAILABLE",
      ] as const) {
        expect(
          blockersFor(satisfied({ variantFacts: [facts({ offerState })] })),
        ).toContain("OFFER_STATE_NOT_PURCHASABLE");
      }
    });

    it("blocks an undeclared offer state", () => {
      expect(
        blockersFor(satisfied({ variantFacts: [facts({ offerState: null })] })),
      ).toContain("OFFER_STATE_NOT_PURCHASABLE");
    });

    it("blocks a product Product Control has not cleared for commerce", () => {
      for (const override of [
        { commerceApproval: "blocked_pending_written_approval" as const },
        { availability: "documentation_review" as const },
        { availability: "out_of_stock" as const },
        { status: "draft" as const },
        { active: false },
        { visibility: "hidden" as const },
      ]) {
        expect(blockersFor(satisfied({ product: product(override) }))).toContain(
          "OFFER_STATE_NOT_PURCHASABLE",
        );
      }
    });
  });

  describe("the evaluation instant", () => {
    it("blocks every instant-bound condition when the clock reading is unusable", () => {
      const result = assessEarlyAccessEligibility(
        satisfied(),
        variant(),
        new Date(Number.NaN),
      );
      expect(result.eligible).toBe(false);
      if (result.eligible) return;
      expect(result.blockers).toEqual(
        expect.arrayContaining([
          "PRICE_NOT_APPROVED",
          "AUDIENCE_NOT_PERMITTED",
          "FULFILLMENT_UNAVAILABLE",
          "DOCUMENTATION_NOT_SATISFIED",
        ]),
      );
    });
  });

  describe("the repository's real catalog data", () => {
    it("holds every founder-locked unit, because none carries an approved price or lab documentation", () => {
      // The truthful census, computed from the data in this repository rather
      // than from a fixture. Twelve of the seventy catalog variants do reach a
      // purchase offer mode, so the census is not vacuous. Not one of them has a
      // confirmed price or a certificate of analysis on file, so every one is
      // held on the price and documentation gates.
      const variants = PEPTIDE_CATALOG.flatMap((item) => item.variants);
      expect(variants).toHaveLength(70);

      expect(
        variants.every(
          (item) => item.priceStatus === "draft_pending_formula_confirmation",
        ),
      ).toBe(true);
      expect(
        PEPTIDE_CATALOG.every(
          (item) => item.coaStatus === "PENDING_LAB_DOCUMENTATION",
        ),
      ).toBe(true);

      const reachingPurchaseMode = PEPTIDE_CATALOG.flatMap((item) =>
        item.variants.filter((candidate) =>
          (EARLY_ACCESS_PURCHASE_OFFER_MODES as readonly string[]).includes(
            candidate.availability,
          ),
        ),
      );
      expect(reachingPurchaseMode).toHaveLength(12);

      // Nine of those twelve are additionally contested by the signed supplier
      // master, which is a third independent hold on the same units.
      const contested = new Set(
        recordedVariantStrengthDisputes().map((dispute) => dispute.sku),
      );
      expect(contested.size).toBe(12);
      expect(
        reachingPurchaseMode.filter((item) => contested.has(item.sku)),
      ).toHaveLength(9);
    });
  });
});
