/**
 * Proof that the Product Control resolver is the only thing that can put a
 * customer price on a surface, and that the superseded in-code price formulas
 * cannot reach one.
 *
 * SEN-0021 left two residuals after PR #184 centralized price resolution. This
 * file pins the second half of each: the formulas stay in the catalog module
 * for the founder decision that is still open, and no other production module
 * may select them.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  AdminProductContent,
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import {
  PEPTIDE_CATALOG,
  toCustomerProductProjection,
} from "@shared/research/catalog/peptide-catalog";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
} from "../pricing/authoritative-price-resolver";
import { recordedVariantStrengthDisputes } from "./variant-strength-dispute";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SOURCE_ROOTS = ["server", "shared", path.join("client", "src")];

/**
 * The superseded price paths SEN-0021 names. Each is a way to derive an amount
 * for a unit whose price is not yet founder-confirmed, so each must stay
 * unreachable from anything a customer can see.
 */
const SUPERSEDED_PRICE_PATHS = [
  // 1.80x wholesale
  "CUSTOMER_PRICE_MULTIPLIER_NUMERATOR",
  "CUSTOMER_PRICE_MULTIPLIER_DENOMINATOR",
  "computeCustomerAmountCents",
  "computedCustomerAmountCents",
  // 2.5x wholesale, $99 floor, round up to $5
  "MATRIX_PRICE_FLOOR_CENTS",
  "MATRIX_PRICE_MULTIPLIER_NUMERATOR",
  "MATRIX_PRICE_MULTIPLIER_DENOMINATOR",
  "MATRIX_PRICE_ROUNDING_STEP_CENTS",
  "computeMatrixAmountCents",
  "priorApprovedMatrixAmountCents",
  // the other competing columns for the same unit
  "legacyPublishedAmountCents",
  "signedSupplierMasterMemberAmountCents",
  "marketReferencePriceCents",
];

/** The one module allowed to hold them, because it is where the decision sits. */
const FORMULA_HOME = path.join(
  "shared",
  "research",
  "catalog",
  "peptide-catalog.ts",
);

function productionSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) walk(path.join(ROOT, root));
  return files;
}

describe("the superseded price formulas are unreachable", () => {
  const files = productionSourceFiles();

  it("scans a real, non-empty production source tree", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((file) => file.endsWith(FORMULA_HOME))).toBe(true);
  });

  it("keeps every superseded path inside the catalog module and nowhere else", () => {
    const offenders: Array<{ identifier: string; file: string }> = [];
    for (const file of files) {
      const relative = path.relative(ROOT, file);
      if (relative === FORMULA_HOME) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const identifier of SUPERSEDED_PRICE_PATHS) {
        if (text.includes(identifier)) offenders.push({ identifier, file: relative });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("publishes no money field at all on the peptide customer projection", () => {
    let checked = 0;
    for (const product of PEPTIDE_CATALOG) {
      const projection = toCustomerProductProjection(product);
      if (projection === null) continue;
      checked += 1;
      const serialized = JSON.stringify(projection).toLowerCase();
      for (const token of ["amount", "cents", "price", "cost", "wholesale", "margin"]) {
        expect(serialized).not.toContain(token);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The guard reaches the customer boundary
// ---------------------------------------------------------------------------

const AT = "2026-07-26T22:00:00.000Z";

function adminVariant(sku: string, id: string): AdminProductVariant {
  return {
    id,
    productId: "product-a",
    sku,
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
  };
}

function adminPrice(variantId: string, id: string): AdminProductPrice {
  return {
    id,
    productId: "product-a",
    variantId,
    audience: "member",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00Z",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved",
    version: 2,
    createdBy: "admin-a",
    approvedBy: "admin-b",
    createdAt: AT,
    updatedAt: AT,
  };
}

const EMPTY_CONTENT: AdminProductContent = {
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
};

function detailWith(variants: AdminProductVariant[]): AdminProductDetail {
  return {
    id: "product-a",
    productCode: "PEP-001",
    slug: "product-a",
    displayName: "Product A",
    canonicalName: "Product A",
    aliases: [],
    lane: "peptide",
    category: "Blend",
    classification: "research_only",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "verified",
    variantCount: variants.length,
    approvedVariantCount: variants.length,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: EMPTY_CONTENT,
    variants,
    prices: variants.map((item, index) => adminPrice(item.id, `price-${index}`)),
    media: [],
    history: [],
  };
}

describe("the guard holds at the customer price boundary", () => {
  const disputed = recordedVariantStrengthDisputes();
  const source = (detail: AdminProductDetail): PricingProductSource => ({
    readProductForPricing: async () => detail,
  });
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "member",
    sourceVersion: "member-tier-v1",
    evaluatedAt: AT,
  });

  it("never returns an available price for a contested variant", async () => {
    expect(authorized).not.toBeNull();
    for (const dispute of disputed) {
      const variant = adminVariant(dispute.sku, "variant-a");
      const resolver = createAuthoritativePriceResolver(
        source(detailWith([variant])),
      );
      const resolution = await resolver.resolveApprovedResearchPrice({
        productId: "product-a",
        variantId: "variant-a",
        authenticatedAudience: authorized!,
        currency: "USD",
        at: AT,
      });
      expect(resolution.state).not.toBe("available");
      expect(JSON.stringify(resolution)).not.toContain("14900");
    }
  });

  it("still returns the approved price for an uncontested variant", async () => {
    const variant = adminVariant("SKU-NOT-IN-CATALOG", "variant-a");
    const resolver = createAuthoritativePriceResolver(
      source(detailWith([variant])),
    );
    const resolution = await resolver.resolveApprovedResearchPrice({
      productId: "product-a",
      variantId: "variant-a",
      authenticatedAudience: authorized!,
      currency: "USD",
      at: AT,
    });
    expect(resolution).toMatchObject({
      state: "available",
      price: { amountCents: 14900, currency: "USD" },
    });
  });
});
