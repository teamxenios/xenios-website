import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { MemberRow } from "../../member-auth";
import type { VariantInventoryFactsReader } from "../../catalog/member-catalog-service";
import { memberAudience } from "../../catalog/member-catalog-service";
import {
  EARLY_ACCESS_CUSTOMER_AUDIENCE_SOURCE,
  MEMBER_ROW_AUDIENCE_SOURCE,
  ProductControlDeclaredFactsReader,
  REVIEW_AUDIENCE_SOURCE,
  EarlyAccessDeclaredFactsError,
  coaEvidenceFor,
  resolveEarlyAccessOfferState,
} from "./declared-facts-source";
import { assessEarlyAccessEligibility } from "./eligibility";
import type { SupplierConfirmationLiveReader } from "./declared-facts-source";
import {
  InMemorySupplierConfirmationStore,
  createSupplierConfirmation,
  type CreateSupplierConfirmationInput,
} from "../ops/supplier-confirmation";
import { projectEarlyAccessCatalog } from "./early-access-catalog";
import { resolveEarlyAccessSettlementCurrency } from "./product-control-source";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const EVALUATED_AT = NOW.toISOString();
const CURRENCY = resolveEarlyAccessSettlementCurrency();

const PRODUCT_ID = "prod-declared-0001";
const VARIANT_ID = "var-declared-0001";
const SKU = "DECLARED-0001";

function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: SKU,
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
    id: "price-declared-0001",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
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
    productCode: "DECLARED0001",
    slug: "declared-facts-item",
    displayName: "Declared Facts Item",
    canonicalName: "Declared Facts Item",
    aliases: [],
    lane: "research_material",
    category: "Research materials",
    classification: "Research catalog item",
    status: "published",
    active: true,
    visibility: "public",
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

function member(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "member-0001",
    status: "active",
    billing_state: "current",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  } as MemberRow;
}

/** An inventory reader with one allocatable lot for the exact unit. */
const READY_INVENTORY: VariantInventoryFactsReader = {
  async readVariantInventoryFacts({ productId, variant: unit, evaluatedAt }) {
    return {
      inventory: {
        productId,
        variantId: unit.id,
        state: "eligible",
        reason: null,
        sourceVersion: "lot-fingerprint-ready",
        evaluatedAt,
      },
      lotCoa: {
        productId,
        variantId: unit.id,
        state: "verified",
        sourceVersion: "lot-fingerprint-ready",
        evaluatedAt,
      },
    };
  },
};

/** An inventory reader for a unit with no allocatable lot. */
const EMPTY_INVENTORY: VariantInventoryFactsReader = {
  async readVariantInventoryFacts({ productId, variant: unit, evaluatedAt }) {
    return {
      inventory: {
        productId,
        variantId: unit.id,
        state: "unavailable",
        reason: "not_currently_available",
        sourceVersion: "lot-fingerprint-empty",
        evaluatedAt,
      },
      lotCoa: {
        productId,
        variantId: unit.id,
        state: "required",
        sourceVersion: "lot-fingerprint-empty",
        evaluatedAt,
      },
    };
  },
};

const BROKEN_INVENTORY: VariantInventoryFactsReader = {
  async readVariantInventoryFacts() {
    throw new Error("member_catalog_inventory_unavailable");
  },
};

function reader(inventory: VariantInventoryFactsReader, audience = MEMBER_ROW_AUDIENCE_SOURCE) {
  return new ProductControlDeclaredFactsReader({
    inventory,
    audience,
    currency: CURRENCY,
  });
}

async function factsFor(
  inventory: VariantInventoryFactsReader,
  context: { member?: MemberRow | null; reviewActor?: string | null } = {},
  detail: AdminProductDetail = product(),
  audience = MEMBER_ROW_AUDIENCE_SOURCE,
) {
  const declared = await reader(inventory, audience).readDeclaredFacts({
    products: [detail],
    now: NOW,
    context,
  });
  return declared[0];
}

describe("the audience comes from the member catalog's own derivation", () => {
  it("uses memberAudience verbatim, so one member row rolls both surfaces together", async () => {
    const row = member();
    const facts = await factsFor(READY_INVENTORY, { member: row });
    expect(facts.audience).toEqual(memberAudience(row, EVALUATED_AT));
  });

  it("resolves no audience when the request carries no authenticated member", async () => {
    expect((await factsFor(READY_INVENTORY, {})).audience).toBeNull();
    expect((await factsFor(READY_INVENTORY, { member: null })).audience).toBeNull();
  });

  it("ignores a review actor entirely on the customer source", async () => {
    // Two locks: the customer source reads only the member row, so a review
    // actor that somehow reached this context authorizes nothing.
    const facts = await factsFor(READY_INVENTORY, { reviewActor: "founder@example.com" });
    expect(facts.audience).toBeNull();
  });

  it("ignores a member row entirely on the review source", async () => {
    const facts = await factsFor(
      READY_INVENTORY,
      { member: member() },
      product(),
      REVIEW_AUDIENCE_SOURCE,
    );
    expect(facts.audience).toBeNull();
  });

  it("authorizes a review only for a named human", async () => {
    expect(REVIEW_AUDIENCE_SOURCE.authorize({ reviewActor: "  " }, EVALUATED_AT)).toBeNull();
    expect(REVIEW_AUDIENCE_SOURCE.authorize({}, EVALUATED_AT)).toBeNull();
    expect(
      REVIEW_AUDIENCE_SOURCE.authorize({ reviewActor: "founder@example.com" }, EVALUATED_AT),
    ).toEqual({
      // The review asks what a PRIVATE_EARLY_ACCESS customer could be sold,
      // because that is the only audience Early Access sells to.
      audience: "private_early_access",
      state: "authorized",
      sourceVersion: "founder_review:founder@example.com",
      evaluatedAt: EVALUATED_AT,
    });
  });
});

describe("fulfilment and documentation come from the inventory lots", () => {
  it("carries the allocatable-lot answer through unchanged", async () => {
    const facts = await factsFor(READY_INVENTORY, { member: member() });
    expect(facts.variantFacts[0].fulfillment).toEqual({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      state: "eligible",
      reason: null,
      sourceVersion: "lot-fingerprint-ready",
      evaluatedAt: EVALUATED_AT,
    });
    expect(facts.variantFacts[0].documentation).toEqual({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      state: "verified",
      sourceVersion: "lot-fingerprint-ready",
      evaluatedAt: EVALUATED_AT,
    });
  });

  it("reports a unit with no allocatable lot as unavailable, not as unknown", async () => {
    const facts = await factsFor(EMPTY_INVENTORY, { member: member() });
    expect(facts.variantFacts[0].fulfillment?.state).toBe("unavailable");
    expect(facts.variantFacts[0].documentation?.state).toBe("required");
  });

  it("throws when the inventory read fails, so a broken read never reads as no stock", async () => {
    await expect(factsFor(BROKEN_INVENTORY, { member: member() })).rejects.toBeInstanceOf(
      EarlyAccessDeclaredFactsError,
    );
  });
});

describe("supplier comes from the founder's recorded per-lane owner", () => {
  it("assigns the recorded owner for a lane that has one", async () => {
    const facts = await factsFor(READY_INVENTORY, { member: member() });
    expect(facts.variantFacts[0].supplier?.fulfillmentOwner).toBe("mitch");
    expect(facts.variantFacts[0].supplier?.sourceVersion).toContain("research_material");
  });

  it("assigns nobody for a lane with no recorded owner", async () => {
    const facts = await factsFor(
      READY_INVENTORY,
      { member: member() },
      product({ lane: "future_clinical" }),
    );
    expect(facts.variantFacts[0].supplier).toBeNull();
  });

  it("changes the provenance when the lane changes, so a release goes stale", async () => {
    const first = await factsFor(READY_INVENTORY, { member: member() });
    const second = await factsFor(
      READY_INVENTORY,
      { member: member() },
      product({ lane: "supplement" }),
    );
    expect(first.variantFacts[0].supplier?.sourceVersion).not.toBe(
      second.variantFacts[0].supplier?.sourceVersion,
    );
  });
});

describe("the two facts with no source stay absent", () => {
  it("never invents a quantity limit or a variant-bound image", async () => {
    const facts = await factsFor(READY_INVENTORY, { member: member() });
    expect(facts.variantFacts[0].quantityLimit).toBeNull();
    expect(facts.variantFacts[0].image).toBeNull();
  });
});

describe("the offer state comes from the shared private-lane state machine", () => {
  it("never resolves direct purchase, whatever the evidence", () => {
    expect(
      resolveEarlyAccessOfferState({
        product: product(),
        variant: variant(),
        approvedAmountCents: 24_900,
        coaEvidence: "ON_FILE",
        regulatoryHold: false,
      }),
    ).toBe("APPROVAL_REQUIRED_PURCHASE");
  });

  it("resolves unavailable for a compound on a recorded regulatory hold", () => {
    expect(
      resolveEarlyAccessOfferState({
        product: product(),
        variant: variant(),
        approvedAmountCents: 24_900,
        coaEvidence: "ON_FILE",
        regulatoryHold: true,
      }),
    ).toBe("UNAVAILABLE");
  });

  it("resolves unavailable for a lane the state machine does not serve", () => {
    expect(
      resolveEarlyAccessOfferState({
        product: product({ lane: "future_clinical" }),
        variant: variant(),
        approvedAmountCents: 24_900,
        coaEvidence: "ON_FILE",
        regulatoryHold: false,
      }),
    ).toBe("UNAVAILABLE");
  });

  it("weakens to request access when no approved amount exists", () => {
    expect(
      resolveEarlyAccessOfferState({
        product: product(),
        variant: variant(),
        approvedAmountCents: null,
        coaEvidence: "ON_FILE",
        regulatoryHold: false,
      }),
    ).toBe("REQUEST_ACCESS_ONLY");
  });

  it("needs both a verified lot certificate and an approved quality document", () => {
    expect(coaEvidenceFor("approved", "verified")).toBe("ON_FILE");
    expect(coaEvidenceFor("missing", "verified")).toBe("PENDING_LAB_DOCUMENTATION");
    expect(coaEvidenceFor("approved", "required")).toBe("NOT_ON_FILE");
    expect(coaEvidenceFor("approved", "not_applicable")).toBe("NOT_APPLICABLE");
    expect(coaEvidenceFor("approved", null)).toBe("PENDING_LAB_DOCUMENTATION");
  });
});

describe("the disputes come from the founder-locked second record", () => {
  it("leaves identity unknown for a SKU no second record carries", async () => {
    const facts = await factsFor(READY_INVENTORY, { member: member() });
    expect(facts.variantFacts[0].identityDispute).toBe("unknown");
    expect(facts.variantFacts[0].strengthDispute).toBe("unknown");
  });

  it("clears both when a second record names the same unit and presentation", async () => {
    const corroborated = product({
      canonicalName: "PT-141 (Bremelanotide)",
      slug: "pt-141-bremelanotide",
      variants: [
        variant({ sku: "R360-PT141-10MG-VIAL", strength: "10 mg" }),
      ],
      prices: [],
    });
    const facts = await factsFor(READY_INVENTORY, { member: member() }, corroborated);
    expect(facts.variantFacts[0].identityDispute).toBe("cleared");
    expect(facts.variantFacts[0].strengthDispute).toBe("cleared");
  });

  it("opens the identity dispute when the two records name different products", async () => {
    const contradicted = product({
      canonicalName: "Something Else",
      slug: "pt-141-bremelanotide",
      variants: [variant({ sku: "R360-PT141-10MG-VIAL", strength: "10 mg" })],
      prices: [],
    });
    const facts = await factsFor(READY_INVENTORY, { member: member() }, contradicted);
    expect(facts.variantFacts[0].identityDispute).toBe("open");
  });
});

describe("a unit with every real fact in place", () => {
  it("projects eligible, and the same unit with one fact removed does not", async () => {
    const corroborated = product({
      canonicalName: "PT-141 (Bremelanotide)",
      slug: "pt-141-bremelanotide",
      variants: [variant({ sku: "R360-PT141-10MG-VIAL", strength: "10 mg" })],
      // The founder-approved amount for the audience Early Access sells to.
      prices: [price({ audience: "private_early_access" })],
    });
    const facts = await factsFor(
      READY_INVENTORY,
      { earlyAccessCustomer: { customerRef: "cus-ea-0001" } },
      corroborated,
      EARLY_ACCESS_CUSTOMER_AUDIENCE_SOURCE,
    );
    const eligibility = assessEarlyAccessEligibility(
      {
        product: corroborated,
        audience: facts.audience,
        currency: CURRENCY,
        variantFacts: [
          // The two unsourced facts supplied, because a founder release is what
          // supplies them; everything else is the real derivation.
          {
            ...facts.variantFacts[0],
            quantityLimit: { variantId: VARIANT_ID, maxUnitsPerOrder: 3 },
          },
        ],
      },
      corroborated.variants[0],
      NOW,
    );
    expect(eligibility).toEqual({ eligible: true });
  });

  it("holds the same unit the moment the inventory read reports no lot", async () => {
    const corroborated = product({
      canonicalName: "PT-141 (Bremelanotide)",
      slug: "pt-141-bremelanotide",
      variants: [variant({ sku: "R360-PT141-10MG-VIAL", strength: "10 mg" })],
    });
    const facts = await factsFor(EMPTY_INVENTORY, { member: member() }, corroborated);
    const projection = projectEarlyAccessCatalog({
      products: [
        {
          product: corroborated,
          audience: facts.audience,
          currency: CURRENCY,
          variantFacts: [
            {
              ...facts.variantFacts[0],
              quantityLimit: { variantId: VARIANT_ID, maxUnitsPerOrder: 3 },
            },
          ],
        },
      ],
      now: NOW,
    });
    expect(projection.rows[0].purchasable).toBe(false);
    expect(projection.rows[0].blockers).toContain("FULFILLMENT_UNAVAILABLE");
  });
});

describe("the review-only canonical source is not reachable from production", () => {
  it("is imported by nothing in the request path", () => {
    // A static file reachable from the live wiring is a static file being
    // served as a live catalog, which is the failure this lane exists to stop.
    const importers = [
      "server/research/early-access/register.ts",
      "server/research/early-access/catalog/product-control-source.ts",
      "server/research/early-access/catalog/declared-facts-source.ts",
      "server/research/early-access/release/release-routes.ts",
      "server/research/early-access/release/first-release-review.ts",
      "server/index.ts",
    ];
    for (const path of importers) {
      const source = readFileSync(resolve(__dirname, "../../../..", path), "utf8");
      expect(source).not.toContain("first-release-canonical-source");
    }
  });
});

describe("SUPPLIER_CONFIRMED_ON_DEMAND projects fulfillment for a lot-less unit", () => {
  async function liveStore(overrides: Partial<CreateSupplierConfirmationInput> = {}) {
    const store = new InMemorySupplierConfirmationStore();
    const created = createSupplierConfirmation({
      confirmationId: "supconf-facts-0001",
      supplierOrg: "Apex Research Supply",
      supplierContact: "Mitch (recorded)",
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      sku: SKU,
      supplierSku: "APX-0001",
      strength: "10 mg",
      presentation: "Single vial, 10 mg",
      maxQuantity: 12,
      fulfillmentLocation: "Houston TX",
      fulfillmentMethod: "courier_handoff",
      targetHandoffHours: 72,
      shippingRequirements: "Insulated mailer",
      coldChainState: "ambient_ok",
      documentationState: "supplier_states_coa_available",
      confirmedAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-05T00:00:00.000Z",
      confirmedBy: "Samuel Boadu",
      evidenceRef: "telegram:supplier-thread/8841",
      ...overrides,
    });
    if (!created.ok) throw new Error(`fixture invalid: ${created.code}`);
    await store.insert(created.value);
    return store;
  }

  function readerWith(
    inventory: VariantInventoryFactsReader,
    supplierConfirmations: SupplierConfirmationLiveReader,
  ) {
    return new ProductControlDeclaredFactsReader({
      inventory,
      audience: MEMBER_ROW_AUDIENCE_SOURCE,
      currency: CURRENCY,
      supplierConfirmations,
    });
  }

  it("turns FULFILLMENT off held for a live confirmation, with the confirmation's provenance", async () => {
    const declared = await readerWith(EMPTY_INVENTORY, await liveStore()).readDeclaredFacts({
      products: [product()],
      now: NOW,
      context: { member: member() },
    });
    const facts = declared[0].variantFacts[0];
    expect(facts.fulfillment?.state).toBe("eligible");
    expect(facts.fulfillment?.reason).toBeNull();
    expect(facts.fulfillment?.sourceVersion).toContain("SUPPLIER_CONFIRMED_ON_DEMAND");
    // Documentation is deliberately NOT projected from the confirmation: the
    // COA gate keeps reading lot evidence, and a supplier's self-declared
    // state does not satisfy it.
    expect(facts.documentation?.state).toBe("required");
  });

  it("keeps the lot's own provenance when allocatable inventory already makes the unit eligible", async () => {
    const declared = await readerWith(READY_INVENTORY, await liveStore()).readDeclaredFacts({
      products: [product()],
      now: NOW,
      context: { member: member() },
    });
    const facts = declared[0].variantFacts[0];
    expect(facts.fulfillment?.state).toBe("eligible");
    expect(facts.fulfillment?.sourceVersion).toBe("lot-fingerprint-ready");
  });

  it("returns the unit to held the instant the confirmation expires, with no process running", async () => {
    const expired = await liveStore({ expiresAt: "2026-08-04T11:59:59.000Z" });
    const declared = await readerWith(EMPTY_INVENTORY, expired).readDeclaredFacts({
      products: [product()],
      now: NOW,
      context: { member: member() },
    });
    const facts = declared[0].variantFacts[0];
    expect(facts.fulfillment?.state).toBe("unavailable");
    expect(facts.fulfillment?.sourceVersion).toBe("lot-fingerprint-empty");
  });

  it("raises when the confirmation read breaks, because could-not-check is not unavailable", async () => {
    const broken: SupplierConfirmationLiveReader = {
      async liveForUnit() {
        throw new Error("supplier_confirmation_store_unavailable");
      },
    };
    await expect(
      readerWith(EMPTY_INVENTORY, broken).readDeclaredFacts({
        products: [product()],
        now: NOW,
        context: { member: member() },
      }),
    ).rejects.toBeInstanceOf(EarlyAccessDeclaredFactsError);
  });
});
