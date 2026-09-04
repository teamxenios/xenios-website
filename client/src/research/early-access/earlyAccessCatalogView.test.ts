import { describe, expect, it } from "vitest";

import {
  availabilityStateOf,
  toCardProduct,
  toCardProducts,
  type EarlyAccessCatalogRowView,
} from "./earlyAccessCatalogView";

/**
 * These rows are shaped as the SERVER actually sends them. The view used to
 * re-derive availability from `blockers` and `supplierReady`, two fields the
 * server does not send, which held every row in a real browser while this file
 * stayed green against its own invented shape. The projection is now the
 * server's to decide and the browser's to honour, and
 * `adapters/earlyAccessCatalog.contract.test.ts` pins the two together.
 */
function row(overrides: EarlyAccessCatalogRowView = {}): EarlyAccessCatalogRowView {
  return {
    productId: "prod-aod",
    variantId: "var-5mg",
    displayName: "AOD-9604",
    category: "Research materials",
    strength: "5 mg",
    priceCents: 5_600,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 50,
    ...overrides,
  };
}

describe("availability state", () => {
  it("is AVAILABLE when the server says so and marks the row purchasable", () => {
    expect(availabilityStateOf(row())).toBe("AVAILABLE");
  });

  it("honours a held row, which is the path a late regulatory hold takes", () => {
    // A nonwaivable hold recorded after founder release is applied server-side
    // and arrives as the state itself. The browser holds none of the ledgers
    // that decide this, so it honours the decision rather than recomputing it.
    expect(availabilityStateOf(row({ availability: "TEMPORARILY_HELD", purchasable: false }))).toBe(
      "TEMPORARILY_HELD",
    );
  });

  it("honours a row awaiting supply confirmation", () => {
    expect(availabilityStateOf(row({ availability: "AVAILABILITY_CONFIRMATION_REQUIRED" }))).toBe(
      "AVAILABILITY_CONFIRMATION_REQUIRED",
    );
  });

  it.each([
    ["availability missing entirely", { availability: undefined }],
    ["availability not a string", { availability: 1 }],
    ["availability lower case", { availability: "available" }],
    ["availability a state this browser does not know", { availability: "SOMETHING_NEW" }],
    ["purchasable undefined", { purchasable: undefined }],
    ["purchasable null", { purchasable: null }],
    ["purchasable false while the state claims available", { purchasable: false }],
    ["purchasable a truthy string", { purchasable: "yes" }],
    ["purchasable the number 1", { purchasable: 1 }],
  ] as ReadonlyArray<[string, EarlyAccessCatalogRowView]>)(
    "falls back to TEMPORARILY_HELD when %s",
    (_label, patch) => {
      // FAIL SAFE IN ONE DIRECTION. Absence of information never promotes a row
      // to orderable. Selling something that must not be sold is unrecoverable;
      // showing an orderable product as held is a delay someone reports.
      expect(availabilityStateOf(row(patch))).toBe("TEMPORARILY_HELD");
    },
  );

  it("never promotes an unknown shape to AVAILABLE", () => {
    expect(availabilityStateOf({})).toBe("TEMPORARILY_HELD");
    expect(availabilityStateOf({ availability: "available" })).toBe("TEMPORARILY_HELD");
    expect(availabilityStateOf({ purchasable: true })).toBe("TEMPORARILY_HELD");
  });
});

describe("row projection", () => {
  it("projects a complete row", () => {
    const product = toCardProduct(row());
    expect(product).not.toBeNull();
    expect(product?.name).toBe("AOD-9604");
    expect(product?.category).toBe("Research materials");
    expect(product?.strength).toBe("5 mg");
    expect(product?.unitPriceCents).toBe(5_600);
    expect(product?.availability).toBe("AVAILABLE");
    expect(product?.quantityLimit).toBe(50);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["number", 7],
    ["object", { private: "value" }],
    ["blank", "  "],
    ["control characters", "Research\nmaterials"],
    ["C1 control character", "Research\u0085materials"],
    ["zero-width format character", "\u200B"],
    ["bidirectional format mark", "Research\u200Ematerials"],
    ["overlong", "x".repeat(121)],
  ])("omits a %s category without dropping or changing the row", (_label, category) => {
    const product = toCardProduct(row({ category }));

    expect(product).not.toBeNull();
    expect(product?.category).toBeNull();
    expect(product?.unitPriceCents).toBe(5_600);
    expect(product?.availability).toBe("AVAILABLE");
    expect(product?.quantityLimit).toBe(50);
  });

  it.each([undefined, null, 0, 51, 2.5, "50"])(
    "drops a sellable row with malformed quantity authority %s",
    (quantityLimit) => {
      expect(toCardProduct(row({ quantityLimit }))).toBeNull();
    },
  );

  it("preserves a narrower server-projected authority ceiling", () => {
    expect(toCardProduct(row({ quantityLimit: 19 }))?.quantityLimit).toBe(19);
    expect(toCardProduct(row({ quantityLimit: 20 }))?.quantityLimit).toBe(20);
    expect(toCardProduct(row({ quantityLimit: 50 }))?.quantityLimit).toBe(50);
  });

  it.each([
    ["no product id", { productId: "" }],
    ["no variant id", { variantId: undefined }],
    ["no display name", { displayName: "" }],
    ["no strength", { strength: undefined }],
    ["a price that is a string", { priceCents: "5600" }],
    ["a fractional price", { priceCents: 5_600.5 }],
    ["a zero price", { priceCents: 0 }],
    ["a negative price", { priceCents: -5_600 }],
  ] as ReadonlyArray<[string, EarlyAccessCatalogRowView]>)("drops a row with %s", (_label, patch) => {
    // Dropped, not rendered with a placeholder. A card reading "unknown
    // strength" on a research product is worse than one fewer card, and a price
    // the server never approved must never reach a customer's eye.
    expect(toCardProduct(row(patch))).toBeNull();
  });

  it("counts dropped rows instead of silently shortening the catalogue", () => {
    // This is how 22 products quietly become 19. The caller is handed the number
    // so it can be surfaced rather than absorbed.
    const result = toCardProducts([row(), row({ priceCents: 0 }), row({ displayName: "" })]);
    expect(result.products).toHaveLength(1);
    expect(result.dropped).toBe(2);
  });

  it("keeps held and confirmation-required rows in the catalogue", () => {
    // Every approved row renders. The visible count is not forced to equal the
    // purchasable count.
    const result = toCardProducts([
      row(),
      row({ availability: "TEMPORARILY_HELD", purchasable: false, priceCents: null }),
      row({ availability: "AVAILABILITY_CONFIRMATION_REQUIRED" }),
    ]);
    expect(result.products).toHaveLength(3);
    expect(result.dropped).toBe(0);
    expect(result.products.map((p) => p.availability)).toEqual([
      "AVAILABLE",
      "TEMPORARILY_HELD",
      "AVAILABILITY_CONFIRMATION_REQUIRED",
    ]);
  });

  it("defaults a missing currency to USD rather than rendering an empty one", () => {
    expect(toCardProduct(row({ currency: "" }))?.currency).toBe("USD");
  });
});

describe("founder-held rows carry no price and must still render", () => {
  it("keeps a held row whose price is null, which is how Cagrilintide arrives", () => {
    // The server sends priceCents null on a founder-held unit so no amount sits
    // beside something nobody may buy. Dropping it would hide the product
    // entirely, and a customer cannot tell a hidden product from one that does
    // not exist.
    const product = toCardProduct(
      row({ priceCents: null, purchasable: false, availability: "TEMPORARILY_HELD" }),
    );
    expect(product).not.toBeNull();
    expect(product?.availability).toBe("TEMPORARILY_HELD");
    expect(product?.unitPriceCents).toBeNull();
    expect(product?.quantityLimit).toBe(50);
  });

  it("still drops a sellable row with no usable price", () => {
    // The relaxation is ONLY for held rows. A row that claims to be orderable
    // without a price the server approved must never reach a customer.
    for (const priceCents of [null, 0, -1, "5600", 56.5]) {
      expect(toCardProduct(row({ priceCents })), `kept sellable price ${priceCents}`).toBeNull();
    }
  });

  it("shows no price on a held row even if a malformed one is sent", () => {
    const product = toCardProduct(
      row({ priceCents: -99, purchasable: false, availability: "TEMPORARILY_HELD" }),
    );
    expect(product?.unitPriceCents).toBeNull();
  });

  it("counts a held null-price row as rendered, not dropped", () => {
    const result = toCardProducts([
      row(),
      row({
        variantId: "v2",
        priceCents: null,
        purchasable: false,
        availability: "TEMPORARILY_HELD",
      }),
    ]);
    expect(result.products).toHaveLength(2);
    expect(result.dropped).toBe(0);
  });
});
