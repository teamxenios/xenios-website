import { describe, expect, it } from "vitest";
import type { ProductSummaryDto } from "@shared/research/commerce-api";
import type { ProductPlatformResponse } from "../../adapters/products-diagnostics";
import { toProductCards } from "./Products";

describe("Website 3 catalog integration", () => {
  it("combines the normalized platform taxonomy with canonical commerce pricing", () => {
    const commerce: ProductSummaryDto[] = [
      {
        sku: "SKU-1",
        slug: "alpha",
        displayName: "Alpha",
        lane: "research_material",
        availability: "documentation_review",
        purchasable: false,
        priceCents: null,
        goalMappings: [],
        guideState: "guide_in_development",
        relatedGuideSlugs: [],
      },
    ];
    const platform: ProductPlatformResponse = {
      ok: true,
      capabilities: {
        certificateAccess: false,
        biomarkerReportUpload: false,
      },
      families: [
        { family: "all_products", label: "All products", productCount: 1 },
        { family: "research_vials", label: "Research vials", productCount: 1 },
      ],
      products: [
        {
          productId: "product-1",
          slug: "alpha",
          displayName: "Alpha",
          family: "research_vials",
          templateClass: "research_material",
          searchAliases: ["A-1"],
          truthState: "documentation_pending",
          priceCents: 9900,
          purchasable: false,
        },
      ],
      supplements: [],
      storageAndOrganization: { accessories: [], boundary: "Boundary" },
      supportCategories: [],
      education: { topics: [], storageSources: [], boundary: "Boundary" },
    };

    const cards = toProductCards(platform, commerce);

    expect(cards).toEqual([
      expect.objectContaining({
        slug: "alpha",
        requiredInputRecordId: "product-1",
        family: "research_vials",
        familyLabel: "Research vials",
        statusLabel: "Documentation pending",
        priceLabel: null,
        aliases: ["A-1", "SKU-1"],
      }),
    ]);
    expect(cards[0].summary).toContain("server-authoritative ordering");
  });
});
