/**
 * XCA-W8 cross-lane assembly, Task 7: the import-to-resolution schema bridge.
 *
 * The founder decision artifact (snake_case rows, QNT-001 shaped) is
 * validated and planned by price-decision-import; the price the protected
 * approval flow would then create is consumed by the AuthoritativePriceResolver
 * as an AdminProductPrice. Nothing in the merged code exercises that bridge
 * end to end, so a silent rename or type drift between the two schemas would
 * only surface in production. This suite takes a QNT-001-shaped insert-plan
 * row with hypothetical resolved ids, hand-maps it into the AdminProductPrice
 * shape (and the CreateAdminPriceInput admin shape), asserts field-for-field
 * compatibility at runtime, and proves the REAL resolver resolves the mapped
 * row to exactly the decision's economics.
 */

import { describe, expect, it } from "vitest";
import type {
  AdminProductDetail,
  AdminProductPrice,
  CreateAdminPriceInput,
} from "@shared/research/product-admin";
import { PRICE_AUDIENCES } from "@shared/research/product-admin";
import {
  CUSTOMER_PRICE_AUDIENCES,
  isCustomerSafeAmountCents,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  authorizeAudienceFromServerIdentity,
  createAuthoritativePriceResolver,
  type PricingProductSource,
} from "./authoritative-price-resolver";
import {
  planImport,
  REQUIRED_DECISION_FIELDS,
  validateDecisionDocument,
  type PriceDecisionRow,
} from "./price-decision-import";

const AT = "2026-07-29T12:00:00+00:00";
/** The instant the protected flow would activate the price. */
const ACTIVATED_AT = "2026-07-29T13:00:00+00:00";
/** A later instant a member's detail page would price at. */
const RESOLVE_AT = "2026-07-29T14:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEW_PRICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** QNT-001 in its exact terms, with hypothetical resolved exact ids. */
function qntRawRow(): Record<string, unknown> {
  return {
    decision_id: "QNT-001",
    product_name: "Quantum",
    variant_selector: "1 vial",
    audience: "member",
    amount_cents: 180000,
    currency: "USD",
    decision_status: "APPROVED",
    production_action: "ACTIVATE_AFTER_EXACT_IDS_AND_READINESS",
    product_id: PRODUCT_ID,
    variant_id: VARIANT_ID,
    effective_at: null,
    expires_at: null,
    status: "active",
    approval_note: "Founder approved QNT-001 member price",
  };
}

function quantumDetail(): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    productCode: "QNT",
    slug: "quantum",
    displayName: "Quantum",
    canonicalName: "Quantum",
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
    content: {
      shortDescription: "Quantum fixture.",
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
    variants: [
      {
        id: VARIANT_ID,
        productId: PRODUCT_ID,
        sku: "QNT-1VIAL",
        catalogNumber: null,
        label: "1 vial",
        strength: null,
        size: null,
        format: "Vial",
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
    prices: [],
    media: [],
    history: [],
  };
}

function fixtureSource(product: AdminProductDetail): PricingProductSource {
  return {
    async readProductForPricing(productId) {
      return productId === product.id ? product : null;
    },
  };
}

/**
 * The hand map under test: from a validated insert-plan decision row to the
 * AdminProductPrice the protected approval flow would create and the resolver
 * would then consume. Every assignment is explicit so any rename in either
 * schema breaks precisely here.
 */
function mapDecisionToAdminPrice(row: PriceDecisionRow): AdminProductPrice {
  if (row.productId === null || row.variantId === null) {
    throw new Error("only an insert-plan row with exact ids may be mapped");
  }
  return {
    id: NEW_PRICE_ID,
    productId: row.productId,
    variantId: row.variantId,
    audience: row.audience,
    amountCents: row.amountCents,
    currency: row.currency,
    // A null effective_at means "takes effect on activation" (the import
    // module's documented window rule), so the created row carries the
    // activation instant.
    effectiveAt: row.effectiveAt ?? ACTIVATED_AT,
    expiresAt: row.expiresAt,
    status: "active",
    approvalNote: row.approvalNote,
    version: 1,
    createdBy: "release-manager",
    approvedBy: "founder",
    createdAt: ACTIVATED_AT,
    updatedAt: ACTIVATED_AT,
  };
}

/** The same map targeted at the admin create-price input shape. */
function mapDecisionToCreateInput(row: PriceDecisionRow): CreateAdminPriceInput {
  if (row.variantId === null) {
    throw new Error("only an insert-plan row with exact ids may be mapped");
  }
  return {
    variantId: row.variantId,
    audience: row.audience,
    amountCents: row.amountCents,
    currency: row.currency,
    effectiveAt: row.effectiveAt ?? ACTIVATED_AT,
    expiresAt: row.expiresAt,
    approvalNote: row.approvalNote,
  };
}

describe("import-to-resolution schema bridge (QNT-001 shaped)", () => {
  it("validates and plans the QNT-001-shaped row as a clean insert", async () => {
    const validation = validateDecisionDocument([qntRawRow()]);
    expect(validation.documentValid).toBe(true);
    expect(validation.rows[0]).toMatchObject({
      valid: true,
      classification: "READY_FOR_PLANNING",
    });
    const plan = await planImport({
      rows: validation.validRows,
      source: fixtureSource(quantumDetail()),
      evaluatedAt: AT,
    });
    expect(plan.rows).toEqual([
      {
        decisionId: "QNT-001",
        classification: "insert",
        reasons: [
          "no existing price row for this product, variant, audience, and currency; the protected flow would create one",
        ],
      },
    ]);
    expect(plan.executionPath).toBe("none");
  });

  it("maps field for field into the resolver's AdminProductPrice shape with no drift", () => {
    const validation = validateDecisionDocument([qntRawRow()]);
    const row = validation.validRows[0];
    const mapped = mapDecisionToAdminPrice(row);

    // Identity fields carry through exactly.
    expect(mapped.productId).toBe(PRODUCT_ID);
    expect(mapped.variantId).toBe(VARIANT_ID);

    // Audience: the decision audience list is the customer list, which must
    // remain a strict subset of the admin PRICE_AUDIENCES the price row
    // stores. compare_at exists only on the admin side.
    for (const audience of CUSTOMER_PRICE_AUDIENCES) {
      expect(PRICE_AUDIENCES).toContain(audience);
    }
    expect(CUSTOMER_PRICE_AUDIENCES).toContain(mapped.audience);
    expect(mapped.audience).toBe("member");

    // Economics: positive safe integer cents, allowlisted currency.
    expect(isCustomerSafeAmountCents(mapped.amountCents)).toBe(true);
    expect(mapped.amountCents).toBe(180000);
    expect(mapped.currency).toBe("USD");

    // Window: strict timestamps the resolver can parse; null expiry survives.
    expect(parseProductControlTimestamp(mapped.effectiveAt)).not.toBeNull();
    expect(mapped.expiresAt).toBeNull();

    // Resolver preconditions on the row itself.
    expect(mapped.status).toBe("active");
    expect(mapped.approvedBy).not.toBeNull();
    expect(Number.isInteger(mapped.version) && mapped.version > 0).toBe(true);

    // The admin create-input shape accepts the same decision without renames.
    const createInput = mapDecisionToCreateInput(row);
    expect(createInput).toEqual({
      variantId: VARIANT_ID,
      audience: "member",
      amountCents: 180000,
      currency: "USD",
      effectiveAt: ACTIVATED_AT,
      expiresAt: null,
      approvalNote: "Founder approved QNT-001 member price",
    });
  });

  it("pins the decision-row field list so a schema rename fails loudly here", () => {
    expect([...REQUIRED_DECISION_FIELDS].sort()).toEqual(
      [
        "decision_id",
        "product_name",
        "variant_selector",
        "audience",
        "amount_cents",
        "currency",
        "decision_status",
        "production_action",
        "product_id",
        "variant_id",
        "effective_at",
        "expires_at",
        "status",
        "approval_note",
      ].sort(),
    );
  });

  it("resolves the mapped row through the REAL resolver to the decision's exact economics", async () => {
    const validation = validateDecisionDocument([qntRawRow()]);
    const mapped = mapDecisionToAdminPrice(validation.validRows[0]);
    const product = quantumDetail();
    product.prices = [mapped];

    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const authorized = authorizeAudienceFromServerIdentity({
      audience: "member",
      sourceVersion: "member-tier-v1",
      evaluatedAt: RESOLVE_AT,
    });
    expect(authorized).not.toBeNull();

    const resolution = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: authorized!,
      currency: "USD",
      at: RESOLVE_AT,
    });
    expect(resolution.state).toBe("available");
    if (resolution.state !== "available") return;
    expect(resolution.price).toEqual({
      priceId: NEW_PRICE_ID,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      audience: "member",
      amountCents: 180000,
      currency: "USD",
      effectiveAt: ACTIVATED_AT,
      expiresAt: null,
      version: 1,
    });
  });

  it("does not resolve before the activation instant (the null effective_at rule holds)", async () => {
    const validation = validateDecisionDocument([qntRawRow()]);
    const mapped = mapDecisionToAdminPrice(validation.validRows[0]);
    const product = quantumDetail();
    product.prices = [mapped];
    const resolver = createAuthoritativePriceResolver(fixtureSource(product));
    const authorized = authorizeAudienceFromServerIdentity({
      audience: "member",
      sourceVersion: "member-tier-v1",
      evaluatedAt: AT,
    });
    const resolution = await resolver.resolveApprovedResearchPrice({
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      authenticatedAudience: authorized!,
      currency: "USD",
      at: AT,
    });
    expect(resolution).toEqual({ state: "unavailable", reason: "price_future" });
  });
});
