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
});
