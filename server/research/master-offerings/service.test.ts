import { describe, expect, it } from "vitest";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { noMasterOfferingCommerce } from "./customer-projection";
import { offering } from "./test-fixtures";

describe("master offering catalog service", () => {
  it("returns one member-safe detail and preserves the page when commerce is absent", async () => {
    const product = offering();
    const service = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader([product]),
      noMasterOfferingCommerce,
    );
    const detail = await service.detail(product.slug);
    expect(detail?.slug).toBe(product.slug);
    expect(detail?.variants[0].action.kind).toBe("request_access");
  });

  it("fails closed for invalid, missing, admin-only, and ambiguous slugs", async () => {
    const product = offering();
    const service = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader([
        product,
        { ...product, id: "duplicate", canonicalKey: "duplicate" },
        offering({ id: "held", slug: "held", canonicalKey: "held", visibility: "admin_only" }),
      ]),
      noMasterOfferingCommerce,
    );
    await expect(service.detail("../escape")).resolves.toBeNull();
    await expect(service.detail("missing")).resolves.toBeNull();
    await expect(service.detail("held")).resolves.toBeNull();
    await expect(service.detail(product.slug)).resolves.toBeNull();
  });

  it("keeps shipping charges out of every customer product projection while retaining an included supply", async () => {
    const research = offering();
    const shipping = offering({
      id: "mo_shipping",
      slug: "fedex-standard-overnight",
      canonicalKey: "shipping|fedex",
      displayName: "FedEx Standard Overnight",
      family: "shipping_and_fulfillment",
      category: "Shipping & Fulfillment",
      subcategory: "Shipping Service",
    });
    const includedSupply = offering({
      id: "mo_supply",
      slug: "syringes-alcohol-swabs",
      canonicalKey: "shipping|supplies",
      displayName: "Syringes & Alcohol Swabs",
      family: "shipping_and_fulfillment",
      category: "Shipping & Fulfillment",
      subcategory: "Included Supply",
    });
    const service = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader([research, shipping, includedSupply]),
      noMasterOfferingCommerce,
    );

    const page = await service.list({ pageSize: 10 });
    expect(page.products.map((product) => product.slug)).toEqual([
      research.slug,
      includedSupply.slug,
    ]);
    await expect(service.count({})).resolves.toBe(2);
    await expect(service.detail(shipping.slug)).resolves.toBeNull();
    await expect(service.variant(shipping.slug, shipping.variants[0].id)).resolves.toBeNull();
    await expect(service.detail(includedSupply.slug)).resolves.not.toBeNull();
    const priceList = await service.priceList({ query: {}, audience: "member", generatedAt: "2026-09-30T00:00:00.000Z" });
    expect(priceList.ok).toBe(true);
    if (priceList.ok) {
      expect(JSON.stringify(priceList.document)).not.toContain("FedEx Standard Overnight");
    }
  });
});
