import { describe, expect, it } from "vitest";
import type { AdminProductDetail, AdminProductVariant } from "@shared/research/product-admin";
import {
  PRODUCT_DISPLAY_MEMO_MS,
  ProductControlProductDisplay,
  STRENGTH_NOT_RECORDED,
  createProductionProductDisplayPort,
  productDisplayNameFor,
  variantStrengthFor,
} from "./product-display";

/**
 * The defect this file exists to prevent is a UUID printed where a product name
 * belongs, in an email a human reads to check a payment. So every test here is
 * about what the port REFUSES to say, not about the happy path.
 *
 * Fixtures are cast from the fields under test. `AdminProductDetail` carries
 * twenty-odd fields this port never reads, and spelling them out would hide the
 * three that matter.
 */

const PRODUCT_ID = "6f1b7c62-9d0a-4f3e-8a11-2c4d5e6f7a8b";
const VARIANT_ID = "b2c3d4e5-6f70-4182-9a3b-4c5d6e7f8091";

function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    sku: "XR-BPC-5",
    label: "5 mg vial",
    strength: "5 mg",
    size: null,
    format: null,
    presentation: "Single vial, 5 mg",
    ...overrides,
  } as unknown as AdminProductVariant;
}

function product(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: PRODUCT_ID,
    slug: "bpc-157",
    displayName: "BPC-157 Research Material",
    canonicalName: "BPC-157",
    variants: [variant()],
    ...overrides,
  } as unknown as AdminProductDetail;
}

function portOver(
  products: AdminProductDetail[],
  options: { now?: () => number; ttlMs?: number } = {},
): { port: ProductControlProductDisplay; reads: () => number } {
  let reads = 0;
  const port = new ProductControlProductDisplay({
    catalog: {
      async readCatalog() {
        reads += 1;
        return products;
      },
    },
    ...options,
  });
  return { port, reads: () => reads };
}

describe("product display name", () => {
  it("prefers the display name and falls back to the canonical name", () => {
    expect(productDisplayNameFor(product())).toBe("BPC-157 Research Material");
    expect(productDisplayNameFor(product({ displayName: "   " }))).toBe("BPC-157");
  });

  it("refuses a name that is really an identifier", () => {
    expect(
      productDisplayNameFor(product({ displayName: PRODUCT_ID, canonicalName: "" })),
    ).toBeNull();
    expect(
      productDisplayNameFor(
        product({ displayName: "", canonicalName: "9e1f0a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b" }),
      ),
    ).toBeNull();
  });

  it("refuses a name that is the slug repeated as a name", () => {
    expect(
      productDisplayNameFor(product({ displayName: "bpc-157", canonicalName: "", slug: "bpc-157" })),
    ).toBeNull();
  });
});

describe("variant strength", () => {
  it("takes the strength, then the presentation, then the size, then the label", () => {
    expect(variantStrengthFor(variant())).toBe("5 mg");
    expect(variantStrengthFor(variant({ strength: null }))).toBe("Single vial, 5 mg");
    expect(variantStrengthFor(variant({ strength: null, presentation: null, size: "10 mL" }))).toBe(
      "10 mL",
    );
    expect(
      variantStrengthFor(variant({ strength: null, presentation: null, size: null })),
    ).toBe("5 mg vial");
  });

  it("never returns an identifier, and says so instead", () => {
    expect(
      variantStrengthFor(
        variant({ strength: VARIANT_ID, presentation: PRODUCT_ID, size: null, label: "" }),
      ),
    ).toBe(STRENGTH_NOT_RECORDED);
    expect(
      variantStrengthFor(variant({ strength: null, presentation: null, size: null, label: "" })),
    ).toBe(STRENGTH_NOT_RECORDED);
  });
});

describe("ProductControlProductDisplay", () => {
  it("describes an exact unit from the authoritative catalogue", async () => {
    const { port } = portOver([product()]);
    await expect(port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID })).resolves.toEqual({
      displayName: "BPC-157 Research Material",
      strength: "5 mg",
    });
  });

  it("refuses an unknown product, an unknown variant, and a blank input", async () => {
    const { port } = portOver([product()]);
    await expect(
      port.describe({ productId: "00000000-0000-4000-8000-000000000000", variantId: VARIANT_ID }),
    ).resolves.toBeNull();
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toBeNull();
    await expect(port.describe({ productId: "", variantId: VARIANT_ID })).resolves.toBeNull();
  });

  it("refuses a variant that belongs to a different product", async () => {
    const { port } = portOver([
      product({ variants: [variant({ productId: "00000000-0000-4000-8000-000000000002" })] }),
    ]);
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID }),
    ).resolves.toBeNull();
  });

  it("refuses when the catalogue holds two records for one id", async () => {
    const { port } = portOver([product(), product({ displayName: "Something else" })]);
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID }),
    ).resolves.toBeNull();
  });

  it("refuses rather than throwing when the catalogue cannot be read", async () => {
    const port = new ProductControlProductDisplay({
      catalog: {
        async readCatalog(): Promise<AdminProductDetail[]> {
          throw new Error("catalogue unavailable");
        },
      },
    });
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID }),
    ).resolves.toBeNull();
  });

  it("shares one catalogue read across the lines of one email", async () => {
    let clock = 1_000;
    const { port, reads } = portOver([product()], { now: () => clock });
    await port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID });
    await port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID });
    expect(reads()).toBe(1);

    clock += PRODUCT_DISPLAY_MEMO_MS + 1;
    await port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID });
    expect(reads()).toBe(2);
  });

  // The Early Access composition root calls this at module load. The Product
  // Control repository's constructor reaches for the Supabase admin client and
  // throws without one, so an eager construction here would turn a missing
  // credential into a crash during registration rather than into one
  // unresolved line on one email. This test runs with no Supabase configured.
  it("does not touch the database at construction", async () => {
    const port = createProductionProductDisplayPort();
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID }),
    ).resolves.toBeNull();
  });

  it("never memoizes a failed read", async () => {
    let attempts = 0;
    const port = new ProductControlProductDisplay({
      catalog: {
        async readCatalog(): Promise<AdminProductDetail[]> {
          attempts += 1;
          if (attempts === 1) throw new Error("transient");
          return [product()];
        },
      },
      now: () => 1_000,
    });
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID }),
    ).resolves.toBeNull();
    await expect(
      port.describe({ productId: PRODUCT_ID, variantId: VARIANT_ID }),
    ).resolves.not.toBeNull();
    expect(attempts).toBe(2);
  });
});
