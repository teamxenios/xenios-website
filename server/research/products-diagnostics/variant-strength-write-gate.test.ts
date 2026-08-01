/**
 * The write side of the strength dispute.
 *
 * PR #205 gated the READ path: a disputed variant cannot have a price SERVED.
 * Nothing gated CREATE or APPROVE, so the bad row could still be written and the
 * read guard had to catch it forever. These tests pin the other half: the row
 * never exists, the refusal names WHY, and an identity that cannot be resolved
 * refuses rather than passing.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
  CreateAdminPriceInput,
} from "@shared/research/product-admin";
import { PEPTIDE_CATALOG } from "@shared/research/catalog/peptide-catalog";
import {
  ProductAdminService,
  type ProductAdminIdempotency,
  type ProductAdminRepository,
  type ProductReleaseGate,
} from "./product-admin";
import { ProductAdminStrengthDisputeError } from "./product-admin-errors";
import { registerProductAdminApi } from "./product-admin-routes";
import { recordedVariantStrengthDisputes } from "./variant-strength-dispute";
import {
  screenPriceForApproval,
  screenVariantEdit,
  screenVariantForPriceWrite,
} from "./variant-strength-write-gate";

const AT = "2026-08-01T12:00:00Z";
const DISPUTED = recordedVariantStrengthDisputes();

/** A catalog variant with no recorded dispute, so it is legitimately priceable. */
function undisputedCatalogVariant() {
  const disputedSkus = new Set(DISPUTED.map((dispute) => dispute.sku));
  for (const product of PEPTIDE_CATALOG) {
    for (const variant of product.variants) {
      if (!disputedSkus.has(variant.sku)) return variant;
    }
  }
  throw new Error("the catalog has no undisputed variant to test with");
}

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: "variant-1",
    productId: "product-1",
    sku: "SKU-OUTSIDE-CATALOG-1",
    catalogNumber: null,
    label: "One vial",
    strength: null,
    size: null,
    format: null,
    presentation: "One vial",
    shippingClass: "standard",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-1",
    productId: "product-1",
    variantId: "variant-1",
    audience: "member",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00Z",
    expiresAt: null,
    status: "draft",
    approvalNote: null,
    version: 1,
    createdBy: "admin-a",
    approvedBy: null,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function detail(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: "product-1",
    productCode: "P-1",
    slug: "product-1",
    displayName: "Product 1",
    canonicalName: "Product 1",
    aliases: [],
    lane: "research_material",
    category: "research",
    classification: "research_material",
    status: "draft",
    active: true,
    visibility: "hidden",
    availability: "documentation_review",
    commerceApproval: "blocked_pending_written_approval",
    qualityDocumentState: "missing",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: null,
    content: {
      shortDescription: null,
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

function idempotency(): ProductAdminIdempotency {
  const settled = new Map<string, unknown>();
  return {
    async run<T>(scope: string, key: string, action: () => Promise<T>) {
      const id = `${scope}:${key}`;
      if (settled.has(id)) return settled.get(id) as T;
      const value = await action();
      settled.set(id, value);
      return value;
    },
  };
}

const releaseGate: ProductReleaseGate = {
  evaluate: async () => ({
    displayReady: true,
    commerceReady: false,
    blockingKeys: [],
  }),
};

function service(record: AdminProductDetail | null) {
  const repo = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => record),
    create: vi.fn(),
    duplicate: vi.fn(),
    update: vi.fn(),
    setLifecycle: vi.fn(),
    createVariant: vi.fn(),
    updateVariant: vi.fn(),
    createPrice: vi.fn(async () => record ?? detail()),
    approvePrice: vi.fn(async () => record ?? detail()),
    createMediaUpload: vi.fn(),
    confirmMediaUpload: vi.fn(),
    updateMedia: vi.fn(),
  } as unknown as ProductAdminRepository & {
    createPrice: ReturnType<typeof vi.fn>;
    approvePrice: ReturnType<typeof vi.fn>;
  };
  return {
    repo,
    service: new ProductAdminService(repo, releaseGate, idempotency(), () => AT),
  };
}

const priceInput: CreateAdminPriceInput = {
  variantId: "variant-1",
  audience: "member",
  amountCents: 14900,
  currency: "USD",
  effectiveAt: "2026-08-01T00:00:00Z",
};

async function refusalFrom(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ProductAdminStrengthDisputeError;
  }
  throw new Error("the write was allowed through when it should have been refused");
}

describe("a disputed variant cannot receive a price row at all", () => {
  it("has real contested variants to guard", () => {
    expect(DISPUTED.length).toBeGreaterThan(0);
  });

  it("refuses createPrice for every recorded dispute, with the reason attached", async () => {
    for (const dispute of DISPUTED) {
      const record = detail({
        variants: [variant({ sku: dispute.sku })],
      });
      const { service: subject, repo } = service(record);
      const error = await refusalFrom(
        subject.createPrice("product-1", priceInput, "admin@example.invalid", `k-${dispute.sku}`),
      );
      expect(error).toBeInstanceOf(ProductAdminStrengthDisputeError);
      expect(error.code).toBe("variant_strength_disputed");
      expect(error.reason).toContain(dispute.sku);
      expect(error.reason).toContain(dispute.founderLocked.presentation);
      expect(error.reason).toContain(dispute.contested.presentation);
      expect(error.reason).toContain(dispute.founderLocked.provenance);
      expect(error.reason).toContain(dispute.contested.provenance);
      expect(error.message).toBe(error.reason);
      expect(repo.createPrice).not.toHaveBeenCalled();
    }
  });

  it("refuses approvePrice for a disputed variant, with the reason attached", async () => {
    const dispute = DISPUTED[0];
    const record = detail({ variants: [variant({ sku: dispute.sku })] });
    const { service: subject, repo } = service(record);
    const error = await refusalFrom(
      subject.approvePrice("product-1", "price-1", "admin@example.invalid", "approve-1"),
    );
    expect(error.code).toBe("variant_strength_disputed");
    expect(error.reason).toContain(dispute.founderLocked.presentation);
    expect(error.reason).toContain(dispute.contested.presentation);
    expect(repo.approvePrice).not.toHaveBeenCalled();
  });

  it("refuses a Product Control record whose strength drifts from the founder-locked one", async () => {
    const target = undisputedCatalogVariant();
    const record = detail({
      variants: [variant({ sku: target.sku, strength: "999 mg" })],
    });
    const { service: subject, repo } = service(record);
    const error = await refusalFrom(
      subject.createPrice("product-1", priceInput, "admin@example.invalid", "drift-1"),
    );
    expect(error.code).toBe("variant_strength_disputed");
    expect(error.reason).toContain("999 mg");
    expect(error.reason).toContain(target.strength);
    expect(repo.createPrice).not.toHaveBeenCalled();
  });

  it("never reports an amount, a cost, or a margin on a refusal", async () => {
    const dispute = DISPUTED[0];
    const { service: subject } = service(
      detail({ variants: [variant({ sku: dispute.sku })] }),
    );
    const error = await refusalFrom(
      subject.createPrice(
        "product-1",
        { ...priceInput, amountCents: 1234567 },
        "admin@example.invalid",
        "amount-1",
      ),
    );
    expect(error.reason).not.toContain("1234567");
    expect(error.reason).not.toContain("$");
    for (const token of ["cost", "margin", "wholesale", "multiplier", "cents"]) {
      expect(error.reason.toLowerCase()).not.toContain(token);
    }
  });
});

describe("an undisputed variant is still priceable", () => {
  it("creates and approves a price for a variant outside the peptide catalog", async () => {
    const { service: subject, repo } = service(detail());
    await expect(
      subject.createPrice("product-1", priceInput, "admin@example.invalid", "ok-1"),
    ).resolves.toBeDefined();
    expect(repo.createPrice).toHaveBeenCalledTimes(1);
    await expect(
      subject.approvePrice("product-1", "price-1", "admin@example.invalid", "ok-2"),
    ).resolves.toBeDefined();
    expect(repo.approvePrice).toHaveBeenCalledTimes(1);
  });

  it("creates and approves a price for a catalog variant recorded at its founder-locked strength", async () => {
    const target = undisputedCatalogVariant();
    const record = detail({
      variants: [variant({ sku: target.sku, strength: target.strength })],
    });
    const { service: subject, repo } = service(record);
    await expect(
      subject.createPrice("product-1", priceInput, "admin@example.invalid", "ok-3"),
    ).resolves.toBeDefined();
    expect(repo.createPrice).toHaveBeenCalledWith(
      "product-1",
      expect.objectContaining({ variantId: "variant-1" }),
      "admin@example.invalid",
      AT,
    );
    await expect(
      subject.approvePrice("product-1", "price-1", "admin@example.invalid", "ok-4"),
    ).resolves.toBeDefined();
    expect(repo.approvePrice).toHaveBeenCalledTimes(1);
  });
});

describe("an unidentifiable variant fails closed", () => {
  const unresolvable: Array<[string, AdminProductDetail | null, string]> = [
    ["the product record cannot be read", null, "variant-1"],
    [
      "no variant of this product carries the requested id",
      detail({ variants: [variant({ id: "variant-other" })] }),
      "variant-1",
    ],
    [
      "two variants claim the same id",
      detail({ variants: [variant(), variant({ sku: "SKU-DUP" })] }),
      "variant-1",
    ],
    [
      "the variant belongs to a different product",
      detail({ variants: [variant({ productId: "product-2" })] }),
      "variant-1",
    ],
    [
      "the variant records no SKU",
      detail({ variants: [variant({ sku: "   " })] }),
      "variant-1",
    ],
  ];

  it.each(unresolvable)("refuses createPrice when %s", async (_label, record, variantId) => {
    const { service: subject, repo } = service(record);
    const error = await refusalFrom(
      subject.createPrice(
        "product-1",
        { ...priceInput, variantId },
        "admin@example.invalid",
        `closed-${_label}`,
      ),
    );
    expect(error).toBeInstanceOf(ProductAdminStrengthDisputeError);
    expect(error.code).toBe("variant_identity_unresolved");
    expect(error.reason).toContain("cannot be proven undisputed");
    expect(repo.createPrice).not.toHaveBeenCalled();
  });

  it("refuses approvePrice when the price id belongs to no price of this product", async () => {
    const { service: subject, repo } = service(detail({ prices: [] }));
    const error = await refusalFrom(
      subject.approvePrice("product-1", "price-1", "admin@example.invalid", "closed-a"),
    );
    expect(error.code).toBe("variant_identity_unresolved");
    expect(repo.approvePrice).not.toHaveBeenCalled();
  });

  it("refuses approvePrice when the price points at a variant that is not on the product", async () => {
    const { service: subject, repo } = service(
      detail({ prices: [price({ variantId: "variant-ghost" })] }),
    );
    const error = await refusalFrom(
      subject.approvePrice("product-1", "price-1", "admin@example.invalid", "closed-b"),
    );
    expect(error.code).toBe("variant_identity_unresolved");
    expect(repo.approvePrice).not.toHaveBeenCalled();
  });

  it("refuses approvePrice when the product record cannot be read", async () => {
    const { service: subject, repo } = service(null);
    const error = await refusalFrom(
      subject.approvePrice("product-1", "price-1", "admin@example.invalid", "closed-c"),
    );
    expect(error.code).toBe("variant_identity_unresolved");
    expect(repo.approvePrice).not.toHaveBeenCalled();
  });

  it("screens directly the same way, so the gate is not an artifact of the service", () => {
    expect(screenVariantForPriceWrite(null, "variant-1")?.code).toBe(
      "variant_identity_unresolved",
    );
    expect(screenVariantForPriceWrite(detail(), "  ")?.code).toBe(
      "variant_identity_unresolved",
    );
    expect(screenPriceForApproval(detail(), "  ")?.code).toBe(
      "variant_identity_unresolved",
    );
    expect(screenVariantForPriceWrite(detail(), "variant-1")).toBeNull();
  });
});

describe("the refusal reaches the operator through the API", () => {
  it("answers 409 and carries the dispute reason in the body", async () => {
    const dispute = DISPUTED[0];
    const app = express();
    app.use(express.json());
    registerProductAdminApi(app, {
      service: {
        createPrice: vi.fn(async () => {
          throw new ProductAdminStrengthDisputeError(
            "variant_strength_disputed",
            `Variant ${dispute.sku} has a contested strength. ` +
              `The founder-locked catalog records "${dispute.founderLocked.presentation}".`,
          );
        }),
      } as unknown as ProductAdminService,
      requireAdmin(req, _res, next) {
        (req as typeof req & { adminEmail?: string }).adminEmail =
          "admin@example.invalid";
        next();
      },
    });
    const response = await request(app)
      .post("/api/admin/research/products/product-1/prices")
      .set("Idempotency-Key", "price-1")
      .send({});
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      ok: false,
      code: "variant_strength_disputed",
    });
    expect(String(response.body.reason)).toContain(dispute.sku);
    expect(String(response.body.reason)).toContain(
      dispute.founderLocked.presentation,
    );
    expect(String(response.body.message)).toContain(dispute.sku);
  });
});

describe("the two exploits an adversarial review used to defeat the price gate", () => {
  // The price gate alone was a check-at-write-time over a MUTABLE key. Both of
  // these were driven end to end through the real service and SUCCEEDED before
  // screenVariantEdit existed. Neither writes a price row, so neither the price
  // gate nor the SQL price trigger ever re-fires.

  it("EXPLOIT A: cannot walk a priced clean variant ONTO a disputed SKU", () => {
    const dispute = DISPUTED[0];
    const clean = undisputedCatalogVariant();
    const record = detail({
      variants: [variant({ id: "variant-1", sku: clean.sku, strength: clean.strength })],
    });

    // The original attack: price and approve on the clean SKU (allowed, correct),
    // then rename the variant onto the disputed SKU.
    expect(screenVariantForPriceWrite(record, "variant-1")).toBeNull();

    const refusal = screenVariantEdit(record, "variant-1", { sku: dispute.sku });
    expect(refusal).not.toBeNull();
    expect(refusal!.code).toBe("variant_strength_disputed");
    expect(refusal!.reason).toContain(dispute.sku);
  });

  it("EXPLOIT B: cannot rename a disputed variant to escape the guard", () => {
    const dispute = DISPUTED[0];
    const record = detail({
      variants: [variant({ id: "variant-1", sku: dispute.sku })],
    });

    // The gate correctly refuses the price today.
    const priceRefusal = screenVariantForPriceWrite(record, "variant-1");
    expect(priceRefusal).not.toBeNull();
    expect(priceRefusal!.code).toBe("variant_strength_disputed");

    // The evasion was a single rename: findVariantStrengthDispute then returns
    // null for the renamed unit while the contested physical strength stands,
    // blinding BOTH the write gate and the read resolver. Renaming is not
    // resolving, so the identity triple is frozen while the dispute stands.
    const renamed = screenVariantEdit(record, "variant-1", {
      sku: "R360-RENAMED-TO-ESCAPE-VIAL",
    });
    expect(renamed).not.toBeNull();
    expect(renamed!.code).toBe("variant_strength_disputed");
    expect(renamed!.reason).toContain("renaming the unit is not resolving the dispute");
  });

  it("also freezes the strength and catalogue number, not just the SKU", () => {
    const dispute = DISPUTED[0];
    const record = detail({ variants: [variant({ id: "variant-1", sku: dispute.sku })] });
    for (const update of [
      { strength: "1 mg" },
      { catalogNumber: "CN-REWRITTEN" },
      { sku: "R360-OTHER-VIAL", strength: "1 mg" },
    ]) {
      const refusal = screenVariantEdit(record, "variant-1", update);
      expect(refusal).not.toBeNull();
      expect(refusal!.code).toBe("variant_strength_disputed");
    }
  });

  it("does NOT refuse an edit that leaves the identity triple alone", () => {
    // A lifecycle or labelling change cannot alter the dispute answer, so it
    // must still pass. This is the assertion that keeps the gate from becoming
    // an unusable blanket refusal on a disputed variant.
    const dispute = DISPUTED[0];
    const record = detail({ variants: [variant({ id: "variant-1", sku: dispute.sku })] });
    expect(screenVariantEdit(record, "variant-1", {})).toBeNull();
  });

  it("does NOT refuse an ordinary rename of an undisputed variant", () => {
    const clean = undisputedCatalogVariant();
    const record = detail({
      variants: [variant({ id: "variant-1", sku: clean.sku, strength: clean.strength })],
    });
    expect(
      screenVariantEdit(record, "variant-1", { sku: "SKU-OUTSIDE-CATALOG-RENAMED" }),
    ).toBeNull();
  });

  it("fails closed when the edit targets a variant it cannot resolve", () => {
    const record = detail({ variants: [variant({ id: "variant-1" })] });
    for (const [id, update] of [
      ["", { sku: "X" }],
      ["variant-missing", { sku: "X" }],
    ] as const) {
      const refusal = screenVariantEdit(record, id, update);
      expect(refusal).not.toBeNull();
      expect(refusal!.code).toBe("variant_identity_unresolved");
    }
    expect(screenVariantEdit(null, "variant-1", { sku: "X" })!.code).toBe(
      "variant_identity_unresolved",
    );
  });
});
