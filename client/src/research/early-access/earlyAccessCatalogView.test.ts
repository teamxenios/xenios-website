import { describe, expect, it } from "vitest";

import {
  availabilityStateOf,
  toCardProduct,
  toCardProducts,
  type EarlyAccessCatalogRowView,
} from "./earlyAccessCatalogView";

function row(overrides: EarlyAccessCatalogRowView = {}): EarlyAccessCatalogRowView {
  return {
    productId: "prod-aod",
    variantId: "var-5mg",
    displayName: "AOD-9604",
    strength: "5 mg",
    priceCents: 5_600,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability: "available",
    purchasable: true,
    blockers: [],
    supplierReady: true,
    ...overrides,
  };
}

describe("availability state", () => {
  it("is AVAILABLE only when nothing blocks it and supply is confirmed", () => {
    expect(availabilityStateOf(row())).toBe("AVAILABLE");
  });

  it("holds the row for ANY blocker, which is the path a late regulatory hold takes", () => {
    // A nonwaivable hold recorded after founder release arrives as a blocker on
    // the current projection. It must hold the row immediately, regardless of
    // what the release once said.
    expect(availabilityStateOf(row({ blockers: ["regulatory_hold"] }))).toBe("TEMPORARILY_HELD");
    expect(availabilityStateOf(row({ blockers: ["strength_dispute"] }))).toBe("TEMPORARILY_HELD");
    // Even with everything else looking perfectly sellable.
    expect(
      availabilityStateOf(
        row({ blockers: ["regulatory_hold"], purchasable: true, supplierReady: true }),
      ),
    ).toBe("TEMPORARILY_HELD");
  });

  it("requires confirmation when the row is sellable but supply is not confirmed", () => {
    expect(availabilityStateOf(row({ supplierReady: false }))).toBe(
      "AVAILABILITY_CONFIRMATION_REQUIRED",
    );
    expect(availabilityStateOf(row({ availability: "unavailable" }))).toBe(
      "AVAILABILITY_CONFIRMATION_REQUIRED",
    );
  });

  it.each([
    ["blockers missing entirely", { blockers: undefined }],
    ["blockers not an array", { blockers: "none" }],
    ["purchasable undefined", { purchasable: undefined }],
    ["purchasable null", { purchasable: null }],
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
    expect(availabilityStateOf({ supplierReady: true })).toBe("TEMPORARILY_HELD");
  });
});

describe("row projection", () => {
  it("projects a complete row", () => {
    const product = toCardProduct(row());
    expect(product).not.toBeNull();
    expect(product?.name).toBe("AOD-9604");
    expect(product?.strength).toBe("5 mg");
    expect(product?.unitPriceCents).toBe(5_600);
    expect(product?.availability).toBe("AVAILABLE");
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
      row({ blockers: ["regulatory_hold"] }),
      row({ supplierReady: false }),
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
