import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { PricingProductSource } from "./authoritative-price-resolver";
import type { PriceDecisionRow } from "./price-decision-import";
import * as readinessModule from "./quantum-activation-readiness";
import {
  assessQuantumActivation,
  QUANTUM_MISSING_FACTS,
} from "./quantum-activation-readiness";

const AT = "2026-07-28T12:00:00+00:00";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";
const VARIANT_ID = "55555555-5555-4555-8555-555555555555";

function quantumDecision(
  overrides: Partial<PriceDecisionRow> = {},
): PriceDecisionRow {
  return {
    decisionId: "QNT-001",
    productName: "Quantum",
    variantSelector: "1 vial",
    audience: "member",
    amountCents: 180000,
    currency: "USD",
    decisionStatus: "APPROVED",
    productionAction: "ACTIVATE_AFTER_EXACT_IDS_AND_READINESS",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    effectiveAt: null,
    expiresAt: null,
    status: "active",
    approvalNote: "Founder approved QNT-001 member price",
    ...overrides,
  };
}

function oneVialVariant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: "SKU-QNT-1VIAL",
    catalogNumber: null,
    label: "1 vial",
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
    ...overrides,
  };
}

function memberPrice(
  overrides: Partial<AdminProductPrice> = {},
): AdminProductPrice {
  return {
    id: "price-existing",
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    audience: "member",
    amountCents: 170000,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    status: "active",
    approvalNote: "internal review note",
    version: 1,
    createdBy: "admin",
    approvedBy: "reviewer",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function quantumProduct(
  overrides: Partial<AdminProductDetail> = {},
): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "QNT-PLATFORM",
    slug: "quantum-foundational-platform",
    displayName: "Quantum Foundational Research Platform",
    canonicalName: "Quantum Foundational Research Platform",
    aliases: ["Quantum"],
    lane: "research_material",
    category: "quantum",
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
    variants: [oneVialVariant()],
    prices: [],
    media: [],
    history: [],
    ...overrides,
  };
}

function source(product: AdminProductDetail | null): PricingProductSource {
  return { readProductForPricing: vi.fn(async () => product) };
}

async function assess(
  decision: PriceDecisionRow,
  productSource: PricingProductSource | null,
) {
  return assessQuantumActivation({
    source: productSource,
    decision,
    evaluatedAt: AT,
  });
}

describe("assessQuantumActivation", () => {
  it("rejects an invalid evaluatedAt", async () => {
    await expect(
      assessQuantumActivation({
        source: null,
        decision: quantumDecision(),
        evaluatedAt: "soon",
      }),
    ).rejects.toThrow(RangeError);
  });

  it("blocks today's repo truth (QNT-001 with null ids) on exactly the two missing identity facts", async () => {
    const result = await assess(
      quantumDecision({ productId: null, variantId: null }),
      source(quantumProduct()),
    );
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toEqual(["canonical product row", "one-vial variant"]);
    expect(result.autoExecution).toBe(false);
  });

  it("never resolves the product by name alone: null product_id never reaches the reader", async () => {
    const reader = source(quantumProduct());
    const result = await assess(
      quantumDecision({ productId: null, variantId: null }),
      reader,
    );
    expect(result.verdict).toBe("BLOCKED");
    expect(reader.readProductForPricing).not.toHaveBeenCalled();
  });

  it("blocks when readers are unavailable even with exact ids", async () => {
    const result = await assess(quantumDecision(), null);
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toEqual(["canonical product row", "one-vial variant"]);
  });

  it("is eligible pending protected approval on a fully satisfied fixture, with the exact row preview", async () => {
    const result = await assess(quantumDecision(), source(quantumProduct()));
    expect(result.verdict).toBe("ELIGIBLE_PENDING_PROTECTED_APPROVAL");
    if (result.verdict !== "ELIGIBLE_PENDING_PROTECTED_APPROVAL") return;
    expect(result.autoExecution).toBe(false);
    expect(result.rowPreview).toEqual({
      decisionId: "QNT-001",
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      audience: "member",
      amountCents: 180000,
      currency: "USD",
      effectiveAt: null,
      expiresAt: null,
      approvalNote: "Founder approved QNT-001 member price",
      mutationPath: "release_manager_protected_approval",
    });
    expect(result.rowPreview.approvalNote).toContain("QNT-001");
  });

  it.each([
    [
      "a PROPOSED decision",
      quantumDecision({ decisionStatus: "PROPOSED", status: "inactive" }),
      "founder approval (decision_status APPROVED)",
    ],
    [
      "a different decision id",
      quantumDecision({
        decisionId: "SYN-999",
        approvalNote: "Founder approved QNT-001 member price",
      }),
      "decision identity QNT-001",
    ],
    [
      "a non-member audience",
      quantumDecision({ audience: "retail" }),
      "audience member",
    ],
    [
      "a wrong amount",
      quantumDecision({ amountCents: 170000 }),
      "amount 180000 cents",
    ],
    [
      "an approval note that does not reference QNT-001",
      quantumDecision({ approvalNote: "approved by the founder" }),
      "approval note referencing QNT-001",
    ],
  ])("blocks %s", async (_label, decision, expectedFact) => {
    const result = await assess(decision, source(quantumProduct()));
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toContain(expectedFact);
  });

  it("blocks a non-USD currency", async () => {
    const result = await assess(
      quantumDecision({
        currency: "EUR" as unknown as PriceDecisionRow["currency"],
      }),
      source(quantumProduct()),
    );
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toContain("currency USD");
  });

  it.each([
    [
      "an unpublished product",
      quantumProduct({ status: "draft" }),
      "product published",
    ],
    [
      "an inactive product",
      quantumProduct({ active: false }),
      "product active",
    ],
    [
      "a missing one-vial variant",
      quantumProduct({ variants: [] }),
      "one-vial variant",
    ],
    [
      "an unapproved variant",
      quantumProduct({ variants: [oneVialVariant({ status: "in_review" })] }),
      "variant approved",
    ],
    [
      "an inactive variant",
      quantumProduct({ variants: [oneVialVariant({ active: false })] }),
      "variant active",
    ],
    [
      "a member-ineligible variant",
      quantumProduct({ variants: [oneVialVariant({ memberEligible: false })] }),
      "member eligibility",
    ],
  ])("blocks %s", async (_label, product, expectedFact) => {
    const result = await assess(quantumDecision(), source(product));
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toContain(expectedFact);
  });

  it("blocks when a product row resolves under a different id", async () => {
    const result = await assess(
      quantumDecision(),
      source(quantumProduct({ id: "66666666-6666-4666-8666-666666666666" })),
    );
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toContain("canonical product row");
  });

  it("blocks on an overlapping active member USD price", async () => {
    const result = await assess(
      quantumDecision(),
      source(quantumProduct({ prices: [memberPrice()] })),
    );
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toEqual([
      "no overlapping approved member USD price",
    ]);
  });

  it("blocks on an approved-awaiting-activation overlapping member USD price", async () => {
    const result = await assess(
      quantumDecision(),
      source(
        quantumProduct({ prices: [memberPrice({ status: "approved" })] }),
      ),
    );
    expect(result.verdict).toBe("BLOCKED");
  });

  it("ignores an unapproved draft price and a non-member price", async () => {
    const result = await assess(
      quantumDecision(),
      source(
        quantumProduct({
          prices: [
            memberPrice({ status: "draft", approvedBy: null }),
            memberPrice({ id: "price-retail", audience: "retail" }),
          ],
        }),
      ),
    );
    expect(result.verdict).toBe("ELIGIBLE_PENDING_PROTECTED_APPROVAL");
  });

  it("ignores an approved member price whose window closed before the decision window", async () => {
    const result = await assess(
      quantumDecision({ effectiveAt: "2026-09-01T00:00:00+00:00" }),
      source(
        quantumProduct({
          prices: [
            memberPrice({
              effectiveAt: "2026-01-01T00:00:00+00:00",
              expiresAt: "2026-02-01T00:00:00+00:00",
            }),
          ],
        }),
      ),
    );
    expect(result.verdict).toBe("ELIGIBLE_PENDING_PROTECTED_APPROVAL");
  });

  it("blocks conservatively when a stored price window is unparseable", async () => {
    const result = await assess(
      quantumDecision(),
      source(
        quantumProduct({
          prices: [memberPrice({ effectiveAt: "corrupted" })],
        }),
      ),
    );
    expect(result.verdict).toBe("BLOCKED");
  });

  it("collects every missing fact at once on a fully failing fixture", async () => {
    const result = await assess(
      quantumDecision({
        decisionStatus: "PROPOSED",
        status: "inactive",
        decisionId: "SYN-000",
        audience: "retail",
        amountCents: 1,
        approvalNote: "no reference",
        productId: null,
        variantId: null,
      }),
      null,
    );
    expect(result.verdict).toBe("BLOCKED");
    if (result.verdict !== "BLOCKED") return;
    expect(result.missing).toEqual([
      "founder approval (decision_status APPROVED)",
      "decision identity QNT-001",
      "audience member",
      "amount 180000 cents",
      "approval note referencing QNT-001",
      "canonical product row",
      "one-vial variant",
    ]);
    // The missing list is always reported in the canonical check order.
    const order = result.missing.map((fact) =>
      QUANTUM_MISSING_FACTS.indexOf(fact),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("exports no execution path of any kind", () => {
    const exported = Object.entries(
      readinessModule as Record<string, unknown>,
    ).filter(([, value]) => typeof value === "function");
    expect(exported.length).toBeGreaterThan(0);
    for (const [name] of exported) {
      expect(name).not.toMatch(
        /execute|apply|commit|persist|write|mutate|activate(?!ion)|create|approve/i,
      );
    }
  });
});
