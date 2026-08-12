import { describe, expect, it } from "vitest";
import type { PriceResolution } from "@shared/research/pricing";
import { MASTER_OFFERING_PRICE_ON_REQUEST_LABEL } from "@shared/research/master-offerings/pricing-contract";
import { noMasterOfferingCommerce } from "./customer-projection";
import { createMasterOfferingPriceAuthority } from "./price-authority";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { cartSelection, offering, variant } from "./test-fixtures";

const PRODUCT = offering({
  variants: [
    variant({ id: "mov_a", label: "5 mg vial" }),
    variant({ id: "mov_b", label: "10 mg vial" }),
  ],
});

function approvedPrice(amountCents: number): PriceResolution {
  return {
    state: "available",
    price: {
      priceId: `price_${amountCents}`,
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      audience: "member",
      amountCents,
      currency: "USD",
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      version: 1,
    },
  } as PriceResolution;
}

function pricedService(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader([PRODUCT]),
    noMasterOfferingCommerce,
    createMasterOfferingPriceAuthority({
      bindings: {
        readBinding: ({ offeringVariantId }) =>
          offeringVariantId === "mov_a"
            ? {
                offeringVariantId: "mov_a",
                productId: "pc_product_1",
                variantId: "pc_variant_1",
              }
            : null,
      },
      prices: { readApprovedPrice: () => approvedPrice(9900) },
    }),
  );
}

describe("catalog pricing", () => {
  it("prices a card and its variants from Product Control only", async () => {
    const page = await pricedService().list({});
    const card = page.products[0];
    expect(card.priceSummary.state).toBe("single");
    expect(card.priceSummary.display).toBe("$99.00");
    expect(card.priceSummary.pricedVariantCount).toBe(1);
    expect(card.variants.map((entry) => entry.label)).toEqual([
      "5 mg vial",
      "10 mg vial",
    ]);
    expect(card.variants[0].price.state).toBe("priced");
    expect(card.variants[1].price.state).toBe("on_request");
  });

  it("prices the detail variants the same way the card summarizes them", async () => {
    const detail = await pricedService().detail(PRODUCT.slug);
    expect(detail?.variants[0].price).toEqual(
      (await pricedService().list({})).products[0].variants[0].price,
    );
  });

  it("says price on request everywhere when no price authority is composed", async () => {
    const bare = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader([PRODUCT]),
      noMasterOfferingCommerce,
    );
    const card = (await bare.list({})).products[0];
    expect(card.priceSummary.state).toBe("none");
    expect(card.priceSummary.display).toBe(
      MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
    );
    for (const entry of card.variants) {
      expect(entry.price.state).toBe("on_request");
    }
  });

  it("keeps a card action free even when the variant is fully purchasable", async () => {
    const service = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader([PRODUCT]),
      () => ({
        binding: {
          offeringVariantId: "mov_a",
          productId: "pc_product_1",
          variantId: "pc_variant_1",
        },
        selection: cartSelection(),
      }),
      createMasterOfferingPriceAuthority({
        bindings: {
          readBinding: () => ({
            offeringVariantId: "mov_a",
            productId: "pc_product_1",
            variantId: "pc_variant_1",
          }),
        },
        prices: { readApprovedPrice: () => approvedPrice(9900) },
      }),
    );
    const card = (await service.list({})).products[0];
    expect(JSON.stringify(card)).not.toContain("Add to Cart");
    for (const entry of card.variants) {
      expect(entry).not.toHaveProperty("action");
    }
    const detail = await service.detail(PRODUCT.slug);
    expect(detail?.variants[0].action.kind).toBe("add_to_cart");
  });

  it("shows a price without that price creating any purchase authority", async () => {
    // Priced, bound, and still not purchasable: Product Control returned no
    // selection, so the action stays a request. A price is display, not
    // authority.
    const detail = await pricedService().detail(PRODUCT.slug);
    expect(detail?.variants[0].price.state).toBe("priced");
    expect(detail?.variants[0].action.kind).toBe("request_access");
  });
});
