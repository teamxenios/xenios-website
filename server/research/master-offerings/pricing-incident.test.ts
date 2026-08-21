import { describe, expect, it } from "vitest";
import {
  createMasterOfferingPriceAuthority,
  type MasterOfferingPricingIncident,
} from "./price-authority";
import { offering, variant } from "./test-fixtures";

// ---------------------------------------------------------------------------
// "Price on request" answers two completely different questions with one
// sentence: "this product is quote-only" and "we could not work out its price".
// The first is a business fact. The second is our own failure wearing the
// first's clothes, and until now it was invisible.
//
// These tests pin the signal AND its silence: it must fire for the failures and
// stay quiet for a product that genuinely has no price, or it becomes noise
// nobody reads.
// ---------------------------------------------------------------------------

const OFFERING = offering({ family: "research_peptides_materials" });
const VARIANT = OFFERING.variants[0];

const binding = {
  offeringVariantId: VARIANT.id,
  productId: "pc_product_1",
  variantId: "pc_variant_1",
};

function authority(
  prices: { readApprovedPrice: () => Promise<unknown> },
  bindings?: { readBinding: () => Promise<unknown> },
) {
  const incidents: MasterOfferingPricingIncident[] = [];
  const authority = createMasterOfferingPriceAuthority({
    bindings: (bindings ?? { readBinding: async () => binding }) as never,
    prices: prices as never,
    onPricingIncident: (incident) => incidents.push(incident),
  });
  return { authority, incidents };
}

describe("a price that could not be determined is no longer silent", () => {
  it("reports an ambiguous price, the documented supersession trap", async () => {
    // Two concurrently-active in-window rows. The product HAS an approved
    // price. A hand-written UPDATE that misses the status column produces
    // exactly this, and the price vanishes from every customer surface.
    const { authority: a, incidents } = authority({
      readApprovedPrice: async () => ({ state: "ambiguous", reason: "price_ambiguous" }),
    });

    const view = await a.priceFor(OFFERING, VARIANT);

    expect(view.state).toBe("on_request");
    expect(incidents).toEqual([
      { reason: "price_ambiguous", offeringId: OFFERING.id, offeringVariantId: VARIANT.id },
    ]);
  });

  it("reports a transient reader fault, which otherwise reads as quote-only", async () => {
    // One upstream blip can turn every price on a catalogue page into "Price
    // on request" while the page looks perfectly healthy.
    const { authority: a, incidents } = authority({
      readApprovedPrice: async () => {
        throw new Error("upstream unavailable");
      },
    });

    const view = await a.priceFor(OFFERING, VARIANT);

    expect(view.state).toBe("on_request");
    expect(incidents.map((i) => i.reason)).toEqual(["reader_threw"]);
  });

  it("reports a resolver that answered about a different identity", async () => {
    const { authority: a, incidents } = authority({
      readApprovedPrice: async () => ({
        state: "available",
        price: {
          productId: "pc_someone_else",
          variantId: "pc_variant_1",
          amountCents: 9900,
          currency: "USD",
          priceId: "price_1",
          version: 1,
          effectiveAt: "2026-08-01T00:00:00.000Z",
          expiresAt: null,
        },
      }),
    });

    const view = await a.priceFor(OFFERING, VARIANT);

    expect(view.state).toBe("on_request");
    expect(incidents.map((i) => i.reason)).toEqual(["identity_mismatch"]);
  });

  it("stays SILENT for a product that genuinely has no price", async () => {
    // The signal is only worth having if it does not fire for the ordinary,
    // correct case. Two of the 426 rows are legitimately Price on request.
    const { authority: a, incidents } = authority({
      readApprovedPrice: async () => ({ state: "unavailable", reason: "price_missing" }),
    });

    const view = await a.priceFor(OFFERING, VARIANT);

    expect(view.state).toBe("on_request");
    expect(incidents).toEqual([]);
  });

  it("stays silent for an unbound variant, which is not a pricing failure", async () => {
    const { authority: a, incidents } = authority(
      { readApprovedPrice: async () => ({ state: "available" }) },
      { readBinding: async () => null },
    );

    expect((await a.priceFor(OFFERING, VARIANT)).state).toBe("on_request");
    expect(incidents).toEqual([]);
  });

  it("never lets a throwing observer take the catalogue down", async () => {
    const a = createMasterOfferingPriceAuthority({
      bindings: { readBinding: async () => binding } as never,
      prices: {
        readApprovedPrice: async () => ({ state: "ambiguous", reason: "price_ambiguous" }),
      } as never,
      onPricingIncident: () => {
        throw new Error("logging is broken");
      },
    });

    await expect(a.priceFor(OFFERING, VARIANT)).resolves.toMatchObject({ state: "on_request" });
  });

  it("works with no observer at all, so existing composition is unchanged", async () => {
    const a = createMasterOfferingPriceAuthority({
      bindings: { readBinding: async () => binding } as never,
      prices: {
        readApprovedPrice: async () => ({ state: "ambiguous", reason: "price_ambiguous" }),
      } as never,
    });

    await expect(a.priceFor(OFFERING, VARIANT)).resolves.toMatchObject({ state: "on_request" });
  });
});
