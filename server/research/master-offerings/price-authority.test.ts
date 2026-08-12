import { describe, expect, it, vi } from "vitest";
import type { PriceResolution } from "@shared/research/pricing";
import {
  createAuthoritativeApprovedPriceReader,
  createMasterOfferingPriceAuthority,
  noMasterOfferingPrices,
  priceOfferingVariants,
  type MasterOfferingApprovedPriceReader,
} from "./price-authority";
import type { MasterOfferingCommerceBindingReader } from "./product-control-adapter";
import { offering, variant } from "./test-fixtures";

const BINDING = {
  offeringVariantId: "mov_test_variant",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
};

function bindings(
  value: typeof BINDING | null,
): MasterOfferingCommerceBindingReader {
  return { readBinding: () => value };
}

function approved(overrides: Record<string, unknown> = {}): PriceResolution {
  return {
    state: "available",
    price: {
      priceId: "price_1",
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      audience: "member",
      amountCents: 9900,
      currency: "USD",
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      version: 3,
      ...overrides,
    },
  } as PriceResolution;
}

function prices(resolution: PriceResolution): MasterOfferingApprovedPriceReader {
  return { readApprovedPrice: () => resolution };
}

describe("master offering price authority", () => {
  it("defaults to price on request with no authority composed", async () => {
    const view = await noMasterOfferingPrices.priceFor(offering(), variant());
    expect(view.state).toBe("on_request");
  });

  it("shows an approved Product Control price for a bound variant", async () => {
    const authority = createMasterOfferingPriceAuthority({
      bindings: bindings(BINDING),
      prices: prices(approved()),
    });
    const view = await authority.priceFor(offering(), variant());
    expect(view).toEqual({
      state: "priced",
      amountCents: 9900,
      currency: "USD",
      display: "$99.00",
      priceId: "price_1",
      priceVersion: 3,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
    });
  });

  it("never prices a variant with no binding and never asks the authority", async () => {
    const reader = { readApprovedPrice: vi.fn() };
    const authority = createMasterOfferingPriceAuthority({
      bindings: bindings(null),
      prices: reader,
    });
    expect((await authority.priceFor(offering(), variant())).state).toBe(
      "on_request",
    );
    expect(reader.readApprovedPrice).not.toHaveBeenCalled();
  });

  it("refuses a binding that points at a different variant", async () => {
    const authority = createMasterOfferingPriceAuthority({
      bindings: bindings({ ...BINDING, offeringVariantId: "mov_other" }),
      prices: prices(approved()),
    });
    expect((await authority.priceFor(offering(), variant())).state).toBe(
      "on_request",
    );
  });

  it("shows no price for any non available authority verdict", async () => {
    const verdicts: PriceResolution[] = [
      { state: "unavailable", reason: "price_unapproved" },
      { state: "unavailable", reason: "price_expired" },
      { state: "unavailable", reason: "wrong_audience" },
      { state: "unavailable", reason: "member_ineligible" },
      { state: "ambiguous", reason: "price_ambiguous" },
    ];
    for (const verdict of verdicts) {
      const authority = createMasterOfferingPriceAuthority({
        bindings: bindings(BINDING),
        prices: prices(verdict),
      });
      expect((await authority.priceFor(offering(), variant())).state).toBe(
        "on_request",
      );
    }
  });

  it("refuses a zero or negative approved amount rather than rendering it", async () => {
    for (const amountCents of [0, -1]) {
      const authority = createMasterOfferingPriceAuthority({
        bindings: bindings(BINDING),
        prices: prices(approved({ amountCents })),
      });
      expect((await authority.priceFor(offering(), variant())).state).toBe(
        "on_request",
      );
    }
  });

  it("refuses a price that answers about a different Product Control identity", async () => {
    const authority = createMasterOfferingPriceAuthority({
      bindings: bindings(BINDING),
      prices: prices(approved({ variantId: "pc_variant_other" })),
    });
    expect((await authority.priceFor(offering(), variant())).state).toBe(
      "on_request",
    );
  });

  it("never prices an admin-only offering or variant", async () => {
    const authority = createMasterOfferingPriceAuthority({
      bindings: bindings(BINDING),
      prices: prices(approved()),
    });
    const adminOffering = await authority.priceFor(
      offering({ visibility: "admin_only" }),
      variant(),
    );
    const adminVariant = await authority.priceFor(
      offering(),
      variant({ visibility: "admin_only" }),
    );
    expect(adminOffering.state).toBe("on_request");
    expect(adminVariant.state).toBe("on_request");
  });

  it("fails closed instead of throwing when a reader throws", async () => {
    const authority = createMasterOfferingPriceAuthority({
      bindings: {
        readBinding: () => {
          throw new Error("product control unavailable");
        },
      },
      prices: prices(approved()),
    });
    expect((await authority.priceFor(offering(), variant())).state).toBe(
      "on_request",
    );
  });

  it("asks the authority once per variant within one request scope", async () => {
    const readApprovedPrice = vi.fn(() => approved());
    const authority = createMasterOfferingPriceAuthority({
      bindings: bindings(BINDING),
      prices: { readApprovedPrice },
    });
    await Promise.all([
      authority.priceFor(offering(), variant()),
      authority.priceFor(offering(), variant()),
      authority.priceFor(offering(), variant()),
    ]);
    expect(readApprovedPrice).toHaveBeenCalledTimes(1);
  });

  it("prices every variant of one offering", async () => {
    const product = offering({
      variants: [
        variant({ id: "mov_a" }),
        variant({ id: "mov_b", label: "5 mg vial" }),
      ],
    });
    const authority = createMasterOfferingPriceAuthority({
      bindings: {
        readBinding: ({ offeringVariantId }) =>
          offeringVariantId === "mov_a"
            ? { ...BINDING, offeringVariantId: "mov_a" }
            : null,
      },
      prices: prices(approved()),
    });
    const map = await priceOfferingVariants(authority, product);
    expect(map.get("mov_a")?.state).toBe("priced");
    expect(map.get("mov_b")?.state).toBe("on_request");
  });
});

describe("authoritative approved price reader adapter", () => {
  const audience = {
    audience: "member" as const,
    sourceVersion: "audience-v1",
    evaluatedAt: "2026-08-12T12:00:00.000Z",
  } as never;

  it("pins the pricing instant to the authorization instant", async () => {
    const resolveApprovedResearchPrice = vi.fn(async () => approved());
    const reader = createAuthoritativeApprovedPriceReader(
      { resolveApprovedResearchPrice },
      () => ({ authenticatedAudience: audience, currency: "USD" }),
    );
    await reader.readApprovedPrice({
      productId: "pc_product_1",
      variantId: "pc_variant_1",
    });
    expect(resolveApprovedResearchPrice).toHaveBeenCalledWith({
      productId: "pc_product_1",
      variantId: "pc_variant_1",
      authenticatedAudience: audience,
      currency: "USD",
      at: "2026-08-12T12:00:00.000Z",
    });
  });

  it("fails closed when the server has no pricing context", async () => {
    const resolveApprovedResearchPrice = vi.fn(async () => approved());
    const reader = createAuthoritativeApprovedPriceReader(
      { resolveApprovedResearchPrice },
      () => null,
    );
    expect(
      await reader.readApprovedPrice({
        productId: "pc_product_1",
        variantId: "pc_variant_1",
      }),
    ).toEqual({ state: "unavailable", reason: "price_missing" });
    expect(resolveApprovedResearchPrice).not.toHaveBeenCalled();
  });
});
