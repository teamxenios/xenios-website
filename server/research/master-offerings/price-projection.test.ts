import { describe, expect, it } from "vitest";
import {
  formatPriceCents,
  MASTER_OFFERING_PRICE_ON_REQUEST,
  MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
  type MasterOfferingPriceView,
} from "@shared/research/master-offerings/pricing-contract";
import {
  priceForVariant,
  projectMasterOfferingVariantSummaries,
  summarizeMasterOfferingPrices,
  summarizeOfferingPrices,
} from "./price-projection";
import { offering, variant } from "./test-fixtures";

function priced(
  amountCents: number,
  currency = "USD",
): MasterOfferingPriceView {
  return {
    state: "priced",
    amountCents,
    currency: currency as "USD",
    display: formatPriceCents(amountCents, currency as "USD") ?? "",
    priceId: `price_${amountCents}`,
    priceVersion: 1,
    effectiveAt: "2026-08-01T00:00:00.000Z",
    expiresAt: null,
  };
}

describe("price formatting", () => {
  it("formats positive cents with grouping and two decimals", () => {
    expect(formatPriceCents(9900, "USD")).toBe("$99.00");
    expect(formatPriceCents(5, "USD")).toBe("$0.05");
    expect(formatPriceCents(123456789, "USD")).toBe("$1,234,567.89");
  });

  it("refuses to format anything that is not a positive safe integer", () => {
    for (const amount of [0, -1, 1.5, Number.NaN, Number.MAX_VALUE]) {
      expect(formatPriceCents(amount, "USD")).toBeNull();
    }
  });
});

describe("price summary", () => {
  it("says price on request when nothing is approved", () => {
    const summary = summarizeMasterOfferingPrices([
      MASTER_OFFERING_PRICE_ON_REQUEST,
      MASTER_OFFERING_PRICE_ON_REQUEST,
    ]);
    expect(summary).toEqual({
      state: "none",
      variantCount: 2,
      pricedVariantCount: 0,
      currency: null,
      fromCents: null,
      toCents: null,
      display: MASTER_OFFERING_PRICE_ON_REQUEST_LABEL,
    });
  });

  it("collapses equal amounts to a single price", () => {
    const summary = summarizeMasterOfferingPrices([priced(9900), priced(9900)]);
    expect(summary.state).toBe("single");
    expect(summary.display).toBe("$99.00");
  });

  it("spans a range and counts how many variants are priced", () => {
    const summary = summarizeMasterOfferingPrices([
      priced(9900),
      priced(14900),
      MASTER_OFFERING_PRICE_ON_REQUEST,
    ]);
    expect(summary.state).toBe("range");
    expect(summary.display).toBe("$99.00 to $149.00");
    expect(summary.pricedVariantCount).toBe(2);
    expect(summary.variantCount).toBe(3);
  });

  it("never renders a zero or an empty amount as a price", () => {
    const broken = {
      ...priced(9900),
      amountCents: 0,
      display: "$0.00",
    } as MasterOfferingPriceView;
    const summary = summarizeMasterOfferingPrices([broken]);
    expect(summary.state).toBe("none");
    expect(summary.display).toBe(MASTER_OFFERING_PRICE_ON_REQUEST_LABEL);
  });

  it("defers to variant prices when currencies disagree", () => {
    const summary = summarizeMasterOfferingPrices([
      priced(9900, "USD"),
      { ...priced(9900), currency: "EUR" } as MasterOfferingPriceView,
    ]);
    expect(summary.state).toBe("mixed");
    expect(summary.currency).toBeNull();
  });
});

describe("variant summaries", () => {
  it("carries the strength, the truthful state, and the price, and no action", () => {
    const product = offering({
      variants: [
        variant({ id: "mov_a", label: "5 mg vial" }),
        variant({
          id: "mov_b",
          label: "10 mg vial",
          displayState: "coming_soon",
        }),
      ],
    });
    const summaries = projectMasterOfferingVariantSummaries(
      product,
      new Map([["mov_a", priced(9900)]]),
    );
    expect(summaries).toEqual([
      {
        id: "mov_a",
        label: "5 mg vial",
        displayState: "available_now",
        displayLabel: "Available Now",
        price: priced(9900),
      },
      {
        id: "mov_b",
        label: "10 mg vial",
        displayState: "coming_soon",
        displayLabel: "Coming Soon",
        price: MASTER_OFFERING_PRICE_ON_REQUEST,
      },
    ]);
    for (const summary of summaries) {
      expect(summary).not.toHaveProperty("action");
    }
  });

  it("treats a missing map entry as on request, never as an inherited price", () => {
    expect(priceForVariant(new Map(), variant())).toEqual(
      MASTER_OFFERING_PRICE_ON_REQUEST,
    );
    expect(summarizeOfferingPrices(offering(), new Map()).state).toBe("none");
  });
});
