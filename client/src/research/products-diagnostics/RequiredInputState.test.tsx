import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import type { RequiredInput } from "@shared/research/required-inputs";
import {
  Website3RequiredInputNotice,
  Website3RequiredInputValue,
} from "./RequiredInputState";
import {
  ProductCatalogExperience,
  ProductDetailExperience,
  type ProductCardView,
  type ProductDetailView,
} from "./ProductCatalogExperience";
import {
  DiagnosticsMemberHome,
  type BiomarkerStateView,
  type SuperpowerOfferView,
} from "./DiagnosticsExperience";
import { SupplementComingSoon } from "./CareAndSupplementsExperience";

beforeAll(() => {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: new URL("https://xeniostechnology.com/admin/research/products"),
  });
});

function canonical(
  state: RequiredInput["currentState"],
  recordId = "product-1",
): RequiredInput {
  return {
    id: "input-1",
    key: "pricing.retail_price",
    domain: "pricing",
    label: "RETAIL PRICE REQUIRED",
    description: "Enter the approved retail price.",
    whyRequired: "Commerce cannot use an assumed price.",
    recordType: "product_variant",
    recordId,
    fieldPath: "price.retail",
    currentState: state,
    blockingLevel: "blocks_transaction",
    responsibleRole: "product_admin",
    verificationMethod: "Independent price approval.",
    evidenceRequired: ["Approved price sheet"],
    entryMode: "direct",
    valueSensitivity: "ordinary",
    enteredValue: null,
    externalReferenceName: null,
    enteredBy: null,
    enteredAt: null,
    verifiedBy: null,
    verifiedAt: null,
    rejectionReason: null,
    publicLaunchImpact: "Commerce remains unavailable.",
    nextAction: "Enter the approved price and effective date.",
    adminEntryHref: "/admin/research/products/product-1",
    version: 1,
    auditHistory: [],
  };
}

describe("Website 3 required-input presentation", () => {
  it("puts the exact first-principles label in the missing value location", () => {
    const html = renderToStaticMarkup(
      <Website3RequiredInputValue
        value={null}
        slot="retailPrice"
        items={[canonical("missing")]}
        recordId="product-1"
      />,
    );

    expect(html).toContain("RETAIL PRICE REQUIRED");
    expect(html).toContain("Enter the approved price and effective date.");
    expect(html).not.toContain("pricing.retail_price");
  });

  it("uses the real value instead of a required label once available", () => {
    const html = renderToStaticMarkup(
      <Website3RequiredInputValue
        value="$149.00"
        slot="retailPrice"
        items={[canonical("verified")]}
        recordId="product-1"
      />,
    );

    expect(html).toContain("$149.00");
    expect(html).not.toContain("RETAIL PRICE REQUIRED");
  });

  it.each(["rejected", "expired"] as const)(
    "suppresses a stale stored value when the canonical input is %s",
    (state) => {
      const html = renderToStaticMarkup(
        <Website3RequiredInputValue
          value="$149.00"
          slot="retailPrice"
          items={[canonical(state)]}
          recordId="product-1"
        />,
      );

      expect(html).toContain("RETAIL PRICE REQUIRED");
      expect(html).not.toContain("$149.00");
    },
  );

  it("fails closed when a verified canonical input has no stored value", () => {
    const html = renderToStaticMarkup(
      <Website3RequiredInputValue
        value={null}
        slot="retailPrice"
        items={[canonical("verified")]}
        recordId="product-1"
      />,
    );

    expect(html).toContain("RETAIL PRICE REQUIRED");
  });

  it("hides a resolved canonical notice", () => {
    expect(
      renderToStaticMarkup(
        <Website3RequiredInputNotice
          slot="retailPrice"
          items={[canonical("verified")]}
          recordId="product-1"
        />,
      ),
    ).toBe("");
  });

  it("restores the exact blocking notice after rejection or expiry", () => {
    for (const state of ["rejected", "expired"] as const) {
      const html = renderToStaticMarkup(
        <Website3RequiredInputNotice
          slot="retailPrice"
          items={[canonical(state)]}
          recordId="product-1"
        />,
      );
      expect(html).toContain("RETAIL PRICE REQUIRED");
      expect(html).toContain(state);
    }
  });

  it("allows long administrator actions to wrap inside a 320px card", () => {
    const html = renderToStaticMarkup(
      <Website3RequiredInputNotice
        slot="coaFile"
        items={[]}
      />,
    );

    expect(html).toContain("max-width:100%");
    expect(html).toContain("white-space:normal");
    expect(html).toContain("height:auto");
  });

  it("keeps internal required-input labels out of the ordinary member catalog", () => {
    const product: ProductCardView = {
      slug: "research-product",
      displayName: "Research product",
      family: "research_vials",
      familyLabel: "Research vials",
      statusLabel: "Under review",
      summary: "A truthful product summary.",
      priceLabel: null,
    };
    const publicHtml = renderToStaticMarkup(
      <ProductCatalogExperience products={[product]} />,
    );
    const internalHtml = renderToStaticMarkup(
      <ProductCatalogExperience products={[product]} requiredInputs={[]} />,
    );

    expect(publicHtml).toContain("Pricing not confirmed");
    expect(publicHtml).not.toContain("RETAIL PRICE REQUIRED");
    expect(internalHtml).toContain("RETAIL PRICE REQUIRED");
    expect(internalHtml).not.toContain("pricing.retail_price");
  });

  it("isolates product-scoped price states across catalog and detail regardless of row order", () => {
    const productA: ProductCardView = {
      slug: "product-a",
      requiredInputRecordId: "product-a-id",
      displayName: "Product A",
      family: "research_vials",
      familyLabel: "Research vials",
      statusLabel: "Available",
      summary: "Product A summary.",
      priceLabel: "$149.00",
    };
    const productB: ProductCardView = {
      ...productA,
      slug: "product-b",
      requiredInputRecordId: "product-b-id",
      displayName: "Product B",
      priceLabel: "$199.00",
    };
    const productADetail: ProductDetailView = {
      ...productA,
      templateClass: "research_material",
      specifications: [],
      researchInformation: [],
      storageAndHandling: null,
      shippingAndReturns: null,
      documentation: [],
      relatedProducts: [],
    };
    const productBDetail: ProductDetailView = {
      ...productADetail,
      ...productB,
    };
    const rows = [
      canonical("verified", "product-a-id"),
      canonical("missing", "product-b-id"),
    ];

    for (const orderedRows of [rows, [...rows].reverse()]) {
      const catalogHtml = renderToStaticMarkup(
        <ProductCatalogExperience
          products={[productA, productB]}
          requiredInputs={orderedRows}
        />,
      );
      const productACard =
        catalogHtml.match(
          /data-testid="website3-product-product-a"[\s\S]*?<\/li>/,
        )?.[0] ?? "";
      const productBCard =
        catalogHtml.match(
          /data-testid="website3-product-product-b"[\s\S]*?<\/li>/,
        )?.[0] ?? "";

      expect(productACard).toContain("$149.00");
      expect(productACard).not.toContain("RETAIL PRICE REQUIRED");
      expect(productBCard).toContain("RETAIL PRICE REQUIRED");
      expect(productBCard).not.toContain("$199.00");

      const productADetailHtml = renderToStaticMarkup(
        <ProductDetailExperience
          product={productADetail}
          requiredInputs={orderedRows}
        />,
      );
      const productBDetailHtml = renderToStaticMarkup(
        <ProductDetailExperience
          product={productBDetail}
          requiredInputs={orderedRows}
        />,
      );

      expect(productADetailHtml).toContain("$149.00");
      expect(productADetailHtml).not.toContain("RETAIL PRICE REQUIRED");
      expect(productBDetailHtml).toContain("RETAIL PRICE REQUIRED");
      expect(productBDetailHtml).not.toContain("$199.00");
    }
  });

  it("places exact partner and review inputs in the internal diagnostics surface", () => {
    const offer: SuperpowerOfferView = {
      label: "Superpower",
      summary: "Partner diagnostics remain gated.",
      status: "coming_soon",
      availability: "Partner configuration pending",
      collectionMethod: null,
      priceLabel: null,
      priceEffectiveDate: null,
      lastVerificationDate: null,
      disclosure: "No active partner offer is represented.",
      affiliateUrl: null,
      researchBoundary: "Diagnostics does not validate Research products.",
    };
    const biomarker: BiomarkerStateView = {
      state: "Coming soon",
      updatedAt: null,
    };
    const html = renderToStaticMarkup(
      <DiagnosticsMemberHome
        offer={offer}
        biomarker={biomarker}
        requiredInputs={[]}
      />,
    );

    expect(html).toContain("SUPERPOWER RELATIONSHIP CONFIRMATION REQUIRED");
    expect(html).toContain("SUPERPOWER AFFILIATE URL REQUIRED");
    expect(html).toContain("DIAGNOSTIC PARTNER CONFIGURATION REQUIRED");
    expect(html).toContain("QUALIFIED REVIEW WORKFLOW REQUIRED");
  });

  it("places exact product-data inputs in the internal supplement surface", () => {
    const html = renderToStaticMarkup(
      <SupplementComingSoon
        supplements={[
          {
            category: "foundational",
            label: "Foundational supplements",
            status: "Coming soon",
            description: "Product records are under review.",
          },
        ]}
        requiredInputs={[]}
      />,
    );

    expect(html).toContain("VERIFIED SUPPLEMENT PRODUCT DATA REQUIRED");
    expect(html).toContain("APPROVED PRODUCT IMAGE REQUIRED");
    expect(html).toContain("STORAGE INFORMATION REQUIRED");
  });
});
