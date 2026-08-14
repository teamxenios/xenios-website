import { describe, expect, it } from "vitest";
import { krisProduct } from "./test-fixtures";
import {
  KRIS_LEGACY_ORDER_BINDINGS_ENV,
  createKrisLegacyOrderIdentityResolver,
} from "./legacy-order-bindings";

describe("Kris legacy single-order bindings", () => {
  it("resolves only the exact reviewed catalog row", () => {
    const product = krisProduct({ id: "kli_reviewed" });
    const resolve = createKrisLegacyOrderIdentityResolver({
      [KRIS_LEGACY_ORDER_BINDINGS_ENV]: JSON.stringify([
        {
          krisProductId: product.id,
          productId: "prod_release_1",
          variantId: "var_release_1",
        },
      ]),
    });
    expect(resolve(product)).toEqual({
      productId: "prod_release_1",
      variantId: "var_release_1",
    });
    expect(resolve(krisProduct({ id: "kli_other" }))).toBeNull();
  });

  it.each([
    undefined,
    "not-json",
    JSON.stringify({}),
    JSON.stringify([{ krisProductId: "kli_reviewed", productId: "prod" }]),
    JSON.stringify([
      { krisProductId: "kli_reviewed", productId: "prod", variantId: "var" },
      { krisProductId: "kli_reviewed", productId: "other", variantId: "other" },
    ]),
    JSON.stringify([
      { krisProductId: "kli_one", productId: "prod", variantId: "var" },
      { krisProductId: "kli_two", productId: "prod", variantId: "var" },
    ]),
    JSON.stringify([
      {
        krisProductId: "kli_reviewed",
        productId: "prod",
        variantId: "var",
        supplier: "private",
      },
    ]),
  ])("fails the entire packet closed for invalid input %#", (raw) => {
    const resolve = createKrisLegacyOrderIdentityResolver({
      [KRIS_LEGACY_ORDER_BINDINGS_ENV]: raw,
    });
    expect(resolve(krisProduct({ id: "kli_reviewed" }))).toBeNull();
  });
});
