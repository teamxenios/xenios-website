import { describe, expect, it } from "vitest";
import type {
  MemberCatalogCard,
  MemberCatalogVariant,
  MemberProductDetail,
} from "@shared/research/member-catalog";
import {
  cardAccessPresentation,
  formatEligibleCardPrice,
  formatEligibleVariantPrice,
  isExactCardEligible,
  isExactVariantEligible,
  isPeptideCatalogCard,
  variantAccessPresentation,
  variantIdentityLabel,
} from "./peptide-presentation";

const AT = "2026-08-02T23:00:00.000Z";

function card(overrides: Partial<MemberCatalogCard> = {}): MemberCatalogCard {
  return {
    id: "product-a",
    slug: "product-a",
    displayName: "Alpha Peptide",
    aliases: ["A peptide"],
    lane: "research_material",
    category: "Peptides",
    classification: "Research peptide / material",
    summary: "Approved Research catalog summary.",
    displayState: "available",
    media: {
      mediaId: "media-a",
      productId: "product-a",
      href: "https://media.xeniostechnology.com/media-a",
      altText: "Alpha Peptide vial",
      filename: "alpha.webp",
      sourceVersion: "media-v1",
      policy: "xenios_public_media_v1",
      expiresAt: null,
    },
    price: {
      id: "price-a",
      amountCents: 14900,
      currency: "USD",
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      version: 1,
    },
    readiness: {
      ready: true,
      verifiedInputCount: 2,
      inputVersions: [
        { id: "identity", version: 1 },
        { id: "documentation", version: 2 },
      ],
      domainVersions: [{ domain: "products", version: 3 }],
    },
    selection: {
      productId: "product-a",
      variantId: "variant-a",
      sku: "SKU-A",
      audience: "member",
      audienceEligibility: {
        audience: "member",
        state: "authorized",
        sourceVersion: "audience-v1",
        evaluatedAt: AT,
      },
      price: {
        id: "price-a",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        version: 1,
      },
      media: {
        id: "media-a",
        kind: "primary_image",
        altText: "Alpha Peptide vial",
      },
      canonicalReadiness: {
        ready: true,
        verifiedInputCount: 2,
        inputVersions: [
          { id: "documentation", version: 2 },
          { id: "identity", version: 1 },
        ],
        domainVersions: [{ domain: "products", version: 3 }],
      },
      inventoryEligibility: {
        productId: "product-a",
        variantId: "variant-a",
        state: "eligible",
        sourceVersion: "inventory-v1",
        evaluatedAt: AT,
      },
      evaluatedAt: AT,
    },
    variantCount: 1,
    updatedAt: AT,
    ...overrides,
  };
}

function variant(overrides: Partial<MemberCatalogVariant> = {}): MemberCatalogVariant {
  const source = card();
  return {
    id: "variant-a",
    productId: "product-a",
    sku: "SKU-A",
    label: "10 mg vial",
    strength: "10 mg",
    size: "1 vial",
    format: "Lyophilized material",
    presentation: "Vial",
    shippingClass: "standard",
    price: source.price,
    availability: "available",
    lotCoaState: "verified",
    selection: source.selection,
    selectionFailure: null,
    ...overrides,
  };
}

function detail(overrides: Partial<MemberProductDetail> = {}): MemberProductDetail {
  return {
    ...card(),
    audience: "member",
    currency: "USD",
    evaluatedAt: AT,
    canonicalName: "Alpha Peptide",
    overview: "Approved overview.",
    specifications: "Approved specifications.",
    researchInformation: "Approved research information.",
    storageInformation: "Approved storage information.",
    shippingInformation: null,
    returnInformation: null,
    disclaimers: null,
    reviewDate: null,
    variants: [variant()],
    relatedProducts: [],
    researchOnlyBoundary: true,
    ...overrides,
  };
}

describe("peptide presentation fail-closed gates", () => {
  it("recognizes Research materials and peptide-specific Care pathways", () => {
    expect(isPeptideCatalogCard(card())).toBe(true);
    expect(
      isPeptideCatalogCard(
        card({ lane: "future_clinical", category: "Peptides", displayState: "catalog_only" }),
      ),
    ).toBe(true);
    expect(
      isPeptideCatalogCard(
        card({ lane: "future_clinical", category: "Care", classification: "Care pathway" }),
      ),
    ).toBe(false);
  });

  it("shows price only after exact server identities reconcile", () => {
    const eligible = card();
    expect(isExactCardEligible(eligible)).toBe(true);
    expect(formatEligibleCardPrice(eligible)).toBe("$149.00");

    const attacks: MemberCatalogCard[] = [
      card({ selection: null }),
      card({ selection: { ...eligible.selection!, productId: "other-product" } }),
      card({ selection: { ...eligible.selection!, variantId: "other-variant" } }),
      card({ selection: { ...eligible.selection!, sku: "" } }),
      card({ selection: { ...eligible.selection!, price: { ...eligible.selection!.price, version: 2 } } }),
      card({ selection: { ...eligible.selection!, media: { ...eligible.selection!.media, id: "other-media" } } }),
      card({ selection: { ...eligible.selection!, canonicalReadiness: { ...eligible.selection!.canonicalReadiness, verifiedInputCount: 1 } } }),
      card({ selection: { ...eligible.selection!, inventoryEligibility: { ...eligible.selection!.inventoryEligibility, state: "unavailable" as never } } }),
      card({ displayState: "pricing_pending" }),
    ];

    for (const attack of attacks) {
      expect(isExactCardEligible(attack)).toBe(false);
      expect(formatEligibleCardPrice(attack)).toBeNull();
    }
    expect(cardAccessPresentation(attacks[0]).state).toBe("held");
  });

  it("maps every truthful held state without inventing eligibility", () => {
    expect(cardAccessPresentation(card({ displayState: "documentation_pending" })).state).toBe(
      "pending_documentation",
    );
    expect(cardAccessPresentation(card({ displayState: "pricing_pending" })).state).toBe(
      "request_access",
    );
    expect(cardAccessPresentation(card({ displayState: "unavailable" })).state).toBe(
      "unavailable",
    );
    expect(cardAccessPresentation(card({ displayState: "catalog_only" })).state).toBe(
      "coming_soon",
    );
    expect(
      cardAccessPresentation(
        card({ lane: "future_clinical", category: "Peptides", displayState: "catalog_only" }),
      ).state,
    ).toBe("care_only");
  });

  it("requires the exact variant, SKU, price, documentation, and inventory", () => {
    const product = detail();
    const exact = variant();
    expect(isExactVariantEligible(product, exact)).toBe(true);
    expect(formatEligibleVariantPrice(product, exact)).toBe("$149.00");

    for (const held of [
      variant({ id: "other-variant" }),
      variant({ sku: "OTHER-SKU" }),
      variant({ lotCoaState: "required" }),
      variant({ availability: "unavailable" }),
      variant({ selection: null, selectionFailure: "readiness_incomplete" }),
    ]) {
      expect(isExactVariantEligible(product, held)).toBe(false);
      expect(formatEligibleVariantPrice(product, held)).toBeNull();
    }
    expect(variantAccessPresentation(product, variant({ lotCoaState: "required" })).state).toBe(
      "pending_documentation",
    );
    expect(
      variantAccessPresentation(
        product,
        variant({ selection: null, selectionFailure: "price_unapproved" }),
      ).state,
    ).toBe("request_access");
  });

  it("builds an exact, non-duplicated variant label", () => {
    expect(variantIdentityLabel(variant())).toBe(
      "10 mg vial · 10 mg · 1 vial · Vial · Lyophilized material · SKU SKU-A",
    );
  });
});
