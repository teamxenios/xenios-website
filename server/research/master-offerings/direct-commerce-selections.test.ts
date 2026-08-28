import { describe, expect, it, vi } from "vitest";
import { PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS } from "@shared/research/product-admin";
import type {
  CartProductSelectionRequest,
  CartProductSelectionSource,
} from "@shared/research/cart-product-selection";
import type {
  DomainReadiness,
  RequiredInput,
} from "@shared/research/required-inputs";
import {
  MASTER_OFFERINGS_COMMERCE_REFUSAL,
  RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE_ENV_VAR,
  createProductControlSelectionAuthority as createProductControlSelectionAuthorityWithActivation,
  masterOfferingSelectionAuthorityFromEnv,
  masterOfferingsDirectCommerceEnabled,
  refusedMasterOfferingSelections,
} from "./direct-commerce-selections";
import {
  canonicalProductVariantActivationFingerprint,
  type ProductVariantActivationLedgerRecord,
  type ProductVariantActivationLedgerRepository,
} from "../product-activation/authority-repository";

const AT = "2026-08-19T12:00:00.000Z";

const request: CartProductSelectionRequest = {
  productId: "product-a",
  variantId: "variant-a",
  audience: "member",
  currency: "USD",
  evaluatedAt: AT,
};

function activationRow(
  overrides: Partial<Omit<ProductVariantActivationLedgerRecord, "evidenceFingerprint">> = {},
): ProductVariantActivationLedgerRecord {
  const unsigned = {
    schemaVersion: 1 as const,
    ledgerRevision: 12,
    productId: "product-a",
    variantId: "variant-a",
    sku: "SKU-A",
    productState: "live" as const,
    variantState: "live" as const,
    approvalId: "11111111-1111-4111-8111-111111111111",
    approvedByActorId: "22222222-2222-4222-8222-222222222222",
    approvedByRole: "founder" as const,
    approvedAt: "2026-08-10T00:00:00.000Z",
    reviewedAt: "2026-08-11T00:00:00.000Z",
    validFrom: "2026-08-12T00:00:00.000Z",
    validThrough: "2026-09-19T00:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
  return {
    ...unsigned,
    evidenceFingerprint: canonicalProductVariantActivationFingerprint(unsigned),
  };
}

function liveActivationRepository(
  rows: readonly ProductVariantActivationLedgerRecord[] = [activationRow()],
): ProductVariantActivationLedgerRepository {
  return { readCurrentCandidates: vi.fn(async () => rows) };
}

function createProductControlSelectionAuthority(
  facts: Parameters<typeof createProductControlSelectionAuthorityWithActivation>[0],
  activation: ProductVariantActivationLedgerRepository = liveActivationRepository(),
) {
  return createProductControlSelectionAuthorityWithActivation(facts, activation);
}

function readiness(domain: string): DomainReadiness {
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

function requiredInputs(productId = "product-a"): RequiredInput[] {
  return PRODUCT_DISPLAY_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
    id: `input-${index}`,
    key: binding.key,
    domain: binding.domain,
    label: "Verified input",
    description: "Verified input",
    whyRequired: "Required by canonical readiness.",
    recordType: binding.recordType,
    recordId: productId,
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
    enteredAt: AT,
    verifiedBy: "reviewer",
    verifiedAt: AT,
    rejectionReason: null,
    publicLaunchImpact: "Blocks release.",
    nextAction: "Review.",
    adminEntryHref: "/internal",
    version: index + 1,
    auditHistory: [],
  }));
}

function source(): CartProductSelectionSource {
  return {
    products: [
      {
        id: "product-a",
        productCode: "PRODUCT-A",
        slug: "product-a",
        displayName: "Product A",
        canonicalName: "Product A",
        aliases: [],
        lane: "research_material",
        category: "Research",
        classification: "Research",
        status: "published",
        active: true,
        visibility: "members_only",
        availability: "in_stock",
        commerceApproval: "approved",
        qualityDocumentState: "approved",
        variantCount: 1,
        approvedVariantCount: 1,
        missingInputCount: 0,
        updatedAt: AT,
        publishedAt: AT,
      },
    ],
    variants: [
      {
        id: "variant-a",
        productId: "product-a",
        sku: "SKU-A",
        catalogNumber: "CAT-A",
        label: "Variant A",
        strength: null,
        size: null,
        format: null,
        presentation: null,
        shippingClass: "standard",
        memberEligible: true,
        status: "approved",
        active: true,
        sortOrder: 0,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    prices: [
      {
        id: "price-a",
        productId: "product-a",
        variantId: "variant-a",
        audience: "member",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        status: "active",
        approvalNote: "Approved",
        version: 2,
        createdBy: "admin",
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    media: [
      {
        id: "media-a",
        productId: "product-a",
        kind: "primary_image",
        state: "approved",
        storageKey: "private/product-a.webp",
        filename: "product-a.webp",
        contentType: "image/webp",
        sizeBytes: 100,
        altText: "Product A",
        sortOrder: 0,
        approvedBy: "reviewer",
        createdAt: AT,
        updatedAt: AT,
      },
    ],
    requiredInputs: requiredInputs(),
    readiness: [readiness("product_content"), readiness("products")],
    audienceEligibility: {
      audience: "member",
      state: "authorized",
      sourceVersion: "account-tier-v1",
      evaluatedAt: AT,
    },
    inventoryEligibility: {
      productId: "product-a",
      variantId: "variant-a",
      state: "eligible",
      reason: null,
      sourceVersion: "inventory-v1",
      evaluatedAt: AT,
    },
  };
}

describe("the direct-commerce flag", () => {
  it("enables only on the exact string \"true\"", () => {
    expect(masterOfferingsDirectCommerceEnabled({})).toBe(false);
    for (const value of [undefined, "", "false", "TRUE", "True", "1", "yes", " true"]) {
      expect(
        masterOfferingsDirectCommerceEnabled({
          [RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE_ENV_VAR]: value,
        }),
      ).toBe(false);
    }
    expect(
      masterOfferingsDirectCommerceEnabled({
        [RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE_ENV_VAR]: "true",
      }),
    ).toBe(true);
  });

  it("answers the identical hard-wired refusal while the flag is off", async () => {
    const real = { select: vi.fn() };
    const gated = masterOfferingSelectionAuthorityFromEnv({}, real);
    expect(await gated.select(request)).toEqual({
      ok: false,
      code: "product_commerce_unapproved",
    });
    expect(await gated.select(request)).toEqual(
      MASTER_OFFERINGS_COMMERCE_REFUSAL,
    );
    // The real authority is not even consulted: off means off, not "ask and
    // then discard".
    expect(real.select).not.toHaveBeenCalled();
    expect(await refusedMasterOfferingSelections.select(request)).toEqual(
      MASTER_OFFERINGS_COMMERCE_REFUSAL,
    );
  });

  it("delegates to the real authority, unmodified, when the flag is exactly on", async () => {
    const real = createProductControlSelectionAuthority({
      readSelectionSource: () => source(),
    });
    const gated = masterOfferingSelectionAuthorityFromEnv(
      { [RESEARCH_MASTER_OFFERINGS_DIRECT_COMMERCE_ENV_VAR]: "true" },
      real,
    );
    const result = await gated.select(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selection.sku).toBe("SKU-A");
      expect(result.selection.price.amountCents).toBe(14900);
    }
  });
});

describe("the real selection authority fails closed on every seam", () => {
  it("keeps the protected one-argument composition fail-closed until a durable adapter is wired", async () => {
    const authority = createProductControlSelectionAuthorityWithActivation({
      readSelectionSource: () => source(),
    });
    expect(await authority.select(request)).toEqual({
      ok: false,
      code: "activation_authority_missing",
    });
  });

  it("looks up the durable ledger on every request and observes revocation immediately", async () => {
    let rows: readonly ProductVariantActivationLedgerRecord[] = [activationRow()];
    const repository: ProductVariantActivationLedgerRepository = {
      readCurrentCandidates: vi.fn(async () => rows),
    };
    const authority = createProductControlSelectionAuthority(
      { readSelectionSource: () => source() },
      repository,
    );
    expect((await authority.select(request)).ok).toBe(true);
    rows = [activationRow({ revokedAt: "2026-08-19T11:59:59.000Z" })];
    expect(await authority.select(request)).toEqual({
      ok: false,
      code: "activation_authority_not_live",
    });
    expect(repository.readCurrentCandidates).toHaveBeenCalledTimes(2);
  });

  it("refuses missing, retired, stale, duplicate, and fingerprint-conflicting ledger evidence", async () => {
    const cases: Array<{
      label: string;
      rows: readonly ProductVariantActivationLedgerRecord[];
      code: string;
    }> = [
      { label: "missing", rows: [], code: "activation_authority_missing" },
      {
        label: "retired",
        rows: [activationRow({ variantState: "retired" })],
        code: "activation_authority_not_live",
      },
      {
        label: "stale",
        rows: [activationRow({ validThrough: AT })],
        code: "activation_authority_not_live",
      },
      {
        label: "duplicate",
        rows: [activationRow(), activationRow({ ledgerRevision: 13 })],
        code: "activation_authority_not_live",
      },
      {
        label: "fingerprint conflict",
        rows: [{ ...activationRow(), evidenceFingerprint: `sha256:${"0".repeat(64)}` }],
        code: "activation_authority_not_live",
      },
    ];
    for (const testCase of cases) {
      const authority = createProductControlSelectionAuthority(
        { readSelectionSource: () => source() },
        liveActivationRepository(testCase.rows),
      );
      expect(await authority.select(request), testCase.label).toEqual({
        ok: false,
        code: testCase.code,
      });
    }
  });

  it("refuses when the facts reader answers null", async () => {
    const authority = createProductControlSelectionAuthority({
      readSelectionSource: () => null,
    });
    expect(await authority.select(request)).toEqual(
      MASTER_OFFERINGS_COMMERCE_REFUSAL,
    );
  });

  it("refuses when the facts reader throws or rejects", async () => {
    const throwing = createProductControlSelectionAuthority({
      readSelectionSource: () => {
        throw new Error("facts unavailable");
      },
    });
    expect(await throwing.select(request)).toEqual(
      MASTER_OFFERINGS_COMMERCE_REFUSAL,
    );
    const rejecting = createProductControlSelectionAuthority({
      readSelectionSource: () => Promise.reject(new Error("facts unavailable")),
    });
    expect(await rejecting.select(request)).toEqual(
      MASTER_OFFERINGS_COMMERCE_REFUSAL,
    );
  });

  it("seats the session's audience fact only into an empty seat, then validates it", async () => {
    const unauthorized = source();
    unauthorized.audienceEligibility = null;
    const authority = createProductControlSelectionAuthority({
      readSelectionSource: () => unauthorized,
    });
    // No session facts: the evaluation refuses on the missing seam rather
    // than assuming anyone is authorized.
    expect(await authority.select(request)).toEqual({
      ok: false,
      code: "audience_eligibility_missing",
    });
    // With the composition's session fact, the same evaluation authorizes.
    const session = {
      audienceEligibility: {
        audience: "member" as const,
        state: "authorized" as const,
        sourceVersion: "member-grant-v1",
        evaluatedAt: AT,
      },
    };
    const seated = await authority.select(request, session);
    expect(seated.ok).toBe(true);
    // A wrong-instant session fact is still refused by the evaluation itself.
    expect(
      await authority.select(request, {
        audienceEligibility: {
          ...session.audienceEligibility,
          evaluatedAt: "2026-08-18T12:00:00.000Z",
        },
      }),
    ).toEqual({ ok: false, code: "audience_unauthorized" });
    // A reader that DID read an audience fact keeps its own: the session fact
    // never overrides a read one.
    const readerOwned = createProductControlSelectionAuthority({
      readSelectionSource: () => source(),
    });
    const kept = await readerOwned.select(request, {
      audienceEligibility: {
        ...session.audienceEligibility,
        state: "unauthorized" as const,
      },
    });
    expect(kept.ok).toBe(true);
  });

  it("relays selectCartProduct's own refusal codes rather than rewriting them", async () => {
    const unapproved = source();
    unapproved.products = [
      { ...unapproved.products[0], commerceApproval: "pending" },
    ];
    const authority = createProductControlSelectionAuthority({
      readSelectionSource: () => unapproved,
    });
    expect(await authority.select(request)).toEqual({
      ok: false,
      code: "product_commerce_unapproved",
    });

    const unpriced = source();
    unpriced.prices = [];
    const unpricedAuthority = createProductControlSelectionAuthority({
      readSelectionSource: () => unpriced,
    });
    expect(await unpricedAuthority.select(request)).toEqual({
      ok: false,
      code: "price_missing",
    });
  });
});
