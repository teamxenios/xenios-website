import { describe, expect, it } from "vitest";
import type {
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { CartAudienceEligibility } from "@shared/research/cart-product-selection";
import {
  parseProductControlTimestamp,
  parseProductControlTimestampMicros,
  resolveProductControlPrice,
  type ProductControlPriceResolutionInput,
} from "./product-control-price-resolver";

const AT = "2026-07-26T22:00:00.000Z";

function variant(
  overrides: Partial<AdminProductVariant> = {},
): AdminProductVariant {
  return {
    id: "variant-a",
    productId: "product-a",
    sku: "SKU-A",
    catalogNumber: null,
    label: "One vial",
    strength: null,
    size: null,
    format: null,
    presentation: "One vial",
    shippingClass: "standard",
    memberEligible: true,
    status: "approved",
    active: true,
    sortOrder: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function price(overrides: Partial<AdminProductPrice> = {}): AdminProductPrice {
  return {
    id: "price-a",
    productId: "product-a",
    variantId: "variant-a",
    audience: "member",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.123456+00:00",
    expiresAt: null,
    status: "active",
    approvalNote: "Approved",
    version: 2,
    createdBy: "admin-a",
    approvedBy: "admin-b",
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function audience(
  overrides: Partial<CartAudienceEligibility> = {},
): CartAudienceEligibility {
  return {
    audience: "member",
    state: "authorized",
    sourceVersion: "member-tier-v1",
    evaluatedAt: AT,
    ...overrides,
  };
}

function input(
  overrides: Partial<ProductControlPriceResolutionInput> = {},
): ProductControlPriceResolutionInput {
  return {
    productId: "product-a",
    variant: variant(),
    prices: [price()],
    audienceEligibility: audience(),
    currency: "USD",
    evaluatedAt: AT,
    ...overrides,
  };
}

describe("canonical Product Control price resolver", () => {
  it("selects exactly one approved current row and preserves parsed instants", () => {
    const value = price({
      expiresAt: "2026-08-01T01:02:03.654321+00:00",
    });
    const result = resolveProductControlPrice(
      input({
        prices: [value],
        evaluatedAt: "2026-07-27T00:00:00+02:00",
        audienceEligibility: audience({
          evaluatedAt: "2026-07-26T18:00:00-04:00",
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      price: value,
      effectiveAt: Date.parse(value.effectiveAt),
      expiresAt: Date.parse(value.expiresAt!),
    });
  });

  it("is order-independent and rejects more than one current exact row", () => {
    const stale = price({
      id: "stale",
      effectiveAt: "2025-01-01T00:00:00Z",
      expiresAt: "2025-02-01T00:00:00Z",
    });
    const current = price();
    expect(
      resolveProductControlPrice(input({ prices: [stale, current] })),
    ).toMatchObject({ ok: true, price: current });
    expect(
      resolveProductControlPrice(input({ prices: [current, stale] })),
    ).toMatchObject({ ok: true, price: current });

    const duplicate = price({ id: "price-b", version: 3 });
    expect(
      resolveProductControlPrice(input({ prices: [current, duplicate] })),
    ).toEqual({ ok: false, code: "price_ambiguous" });
    expect(
      resolveProductControlPrice(input({ prices: [duplicate, current] })),
    ).toEqual({ ok: false, code: "price_ambiguous" });
  });

  it("requires exact variant identity, lifecycle, SKU, and member eligibility", () => {
    const cases: Array<
      [Partial<AdminProductVariant>, string]
    > = [
      [{ productId: "product-b" }, "variant_product_mismatch"],
      [{ status: "draft" }, "variant_unapproved"],
      [{ active: false }, "variant_inactive"],
      [{ memberEligible: false }, "member_variant_ineligible"],
      [{ sku: " " }, "variant_sku_missing"],
    ];
    for (const [overrides, code] of cases) {
      expect(
        resolveProductControlPrice(input({ variant: variant(overrides) })),
      ).toEqual({ ok: false, code });
    }
  });

  it("requires a current server-authorized purchase audience", () => {
    expect(
      resolveProductControlPrice(
        input({ audienceEligibility: audience({ state: "unauthorized" }) }),
      ),
    ).toEqual({ ok: false, code: "audience_unauthorized" });
    expect(
      resolveProductControlPrice(
        input({
          audienceEligibility: audience({ sourceVersion: " " }),
        }),
      ),
    ).toEqual({ ok: false, code: "audience_unauthorized" });
    expect(
      resolveProductControlPrice(
        input({
          audienceEligibility: audience({
            evaluatedAt: "2026-07-26T22:00:01Z",
          }),
        }),
      ),
    ).toEqual({ ok: false, code: "audience_unauthorized" });
    expect(
      resolveProductControlPrice(
        input({
          audienceEligibility: audience({
            audience: "compare_at",
          } as never),
        }),
      ),
    ).toEqual({ ok: false, code: "invalid_context" });
  });

  it("allows only canonical USD and exact row currency", () => {
    expect(resolveProductControlPrice(input({ currency: "usd" }))).toEqual({
      ok: false,
      code: "invalid_context",
    });
    expect(resolveProductControlPrice(input({ currency: "EUR" }))).toEqual({
      ok: false,
      code: "price_currency_mismatch",
    });
    expect(
      resolveProductControlPrice(
        input({ prices: [price({ currency: "EUR" })] }),
      ),
    ).toEqual({ ok: false, code: "price_currency_mismatch" });
  });

  it("rejects absent identity and unapproved price state", () => {
    expect(resolveProductControlPrice(input({ prices: [] }))).toEqual({
      ok: false,
      code: "price_missing",
    });
    expect(
      resolveProductControlPrice(
        input({ prices: [price({ audience: "retail" })] }),
      ),
    ).toEqual({ ok: false, code: "price_missing" });
    for (const value of [
      price({ status: "approved" }),
      price({ approvedBy: null }),
      price({ approvedBy: " " }),
    ]) {
      expect(resolveProductControlPrice(input({ prices: [value] }))).toEqual({
        ok: false,
        code: "price_unapproved",
      });
    }
  });

  it("redacts zero and negative active prices as missing", () => {
    for (const amountCents of [0, -1]) {
      const result = resolveProductControlPrice(
        input({ prices: [price({ amountCents })] }),
      );
      expect(result).toEqual({ ok: false, code: "price_missing" });
      expect(result).not.toHaveProperty("price");
      expect(result).not.toHaveProperty("amountCents");
    }
  });

  it("rejects malformed, fractional, and unsafe rows as unapproved", () => {
    const malformed = [
      price({ id: " " }),
      price({ amountCents: 149.5 }),
      price({ amountCents: Number.MAX_SAFE_INTEGER + 1 }),
      price({ version: 0 }),
      price({ version: 1.5 }),
      price({ effectiveAt: "2026-02-30T00:00:00Z" }),
      price({ expiresAt: "not-a-time" }),
      price({
        effectiveAt: "2026-08-01T00:00:00Z",
        expiresAt: "2026-07-01T00:00:00Z",
      }),
    ];
    for (const value of malformed) {
      expect(resolveProductControlPrice(input({ prices: [value] }))).toEqual({
        ok: false,
        code: "price_unapproved",
      });
    }
  });

  it("enforces inclusive effective and exclusive expiry boundaries", () => {
    expect(
      resolveProductControlPrice(
        input({ prices: [price({ effectiveAt: AT })] }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      resolveProductControlPrice(
        input({ prices: [price({ effectiveAt: "2026-07-26T22:00:01Z" })] }),
      ),
    ).toEqual({ ok: false, code: "price_stale" });
    expect(
      resolveProductControlPrice(
        input({
          prices: [
            price({
              effectiveAt: "2026-07-01T00:00:00Z",
              expiresAt: AT,
            }),
          ],
        }),
      ),
    ).toEqual({ ok: false, code: "price_stale" });
  });
});

describe("Product Control timestamps", () => {
  it("accepts PostgreSQL precision and equivalent offsets", () => {
    expect(parseProductControlTimestamp("2026-07-26T22:00:00+00:00")).toBe(
      Date.parse(AT),
    );
    expect(
      parseProductControlTimestamp("2026-07-26T22:00:00.123456+00:00"),
    ).toBe(Date.parse("2026-07-26T22:00:00.123Z"));
    expect(parseProductControlTimestamp("2026-07-27T00:00:00+02:00")).toBe(
      Date.parse(AT),
    );
    expect(
      parseProductControlTimestampMicros(
        "2026-07-26T22:00:00.123456+00:00",
      ),
    ).toBe(Date.parse("2026-07-26T22:00:00.123Z") * 1000 + 456);
  });

  it("rejects impossible dates, offsets, and unsupported precision", () => {
    for (const value of [
      "2026-02-30T00:00:00Z",
      "2026-07-26T24:00:00Z",
      "2026-07-26T22:00:00+24:00",
      "2026-07-26T22:00:00+00:60",
      "2026-07-26T22:00:00.1234567Z",
      "2026-07-26 22:00:00Z",
    ]) {
      expect(parseProductControlTimestamp(value)).toBeNull();
      expect(parseProductControlTimestampMicros(value)).toBeNull();
    }
  });
});
