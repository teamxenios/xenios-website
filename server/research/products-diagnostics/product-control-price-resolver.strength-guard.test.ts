import { describe, expect, it } from "vitest";
import type {
  AdminProductPrice,
  AdminProductVariant,
} from "@shared/research/product-admin";
import type { CartAudienceEligibility } from "@shared/research/cart-product-selection";
import { PEPTIDE_CATALOG } from "@shared/research/catalog/peptide-catalog";
import {
  decideProductControlPrice,
  resolveProductControlPrice,
  type ProductControlPriceRefusalCode,
  type ProductControlPriceResolutionInput,
} from "./product-control-price-resolver";
import { recordedVariantStrengthDisputes } from "./variant-strength-dispute";

const AT = "2026-07-26T22:00:00.000Z";
const DISPUTED = recordedVariantStrengthDisputes();

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
    effectiveAt: "2026-07-01T00:00:00Z",
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

/**
 * A catalog product that has a disputed variant AND at least one sibling whose
 * presentation is uncontested. That pairing is what proves the guard is scoped
 * to the exact contested unit rather than to the product.
 */
function disputedWithUndisputedSibling() {
  const disputedSkus = new Set(DISPUTED.map((dispute) => dispute.sku));
  for (const product of PEPTIDE_CATALOG) {
    const disputed = product.variants.find((item) => disputedSkus.has(item.sku));
    const sibling = product.variants.find(
      (item) => !disputedSkus.has(item.sku),
    );
    if (disputed !== undefined && sibling !== undefined) {
      return { product, disputed, sibling };
    }
  }
  return null;
}

describe("the variant strength guard", () => {
  it("has real contested variants to guard", () => {
    expect(DISPUTED.length).toBeGreaterThan(0);
  });

  it("refuses an otherwise perfect approved price for every disputed variant", () => {
    for (const dispute of DISPUTED) {
      const decision = decideProductControlPrice(
        input({ variant: variant({ sku: dispute.sku }) }),
      );
      expect(decision).toEqual({
        ok: false,
        code: "variant_strength_disputed",
        strengthDispute: dispute,
      });
      expect(decision).not.toHaveProperty("price");
    }
  });

  it("refuses the same variant through the projected resolution, with the reason intact", () => {
    const dispute = DISPUTED[0];
    const result = resolveProductControlPrice(
      input({ variant: variant({ sku: dispute.sku }) }),
    );
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      code: "variant_unapproved",
      strengthDispute: dispute,
    });
    expect(result).not.toHaveProperty("price");
  });

  it("refuses when the catalog SKU arrives on catalogNumber instead", () => {
    const dispute = DISPUTED[0];
    expect(
      decideProductControlPrice(
        input({
          variant: variant({ sku: "SKU-A", catalogNumber: dispute.sku }),
        }),
      ),
    ).toMatchObject({ ok: false, code: "variant_strength_disputed" });
  });

  it("refuses a Product Control record whose strength drifts from the founder-locked one", () => {
    const pair = disputedWithUndisputedSibling();
    expect(pair).not.toBeNull();
    const target = pair!.sibling;
    const decision = decideProductControlPrice(
      input({
        variant: variant({ sku: target.sku, strength: "999 mg" }),
      }),
    );
    expect(decision).toMatchObject({
      ok: false,
      code: "variant_strength_disputed",
    });
    expect(decision).toMatchObject({
      strengthDispute: {
        source: "product_control_drift",
        founderLocked: { presentation: target.strength },
        contested: { presentation: "999 mg" },
      },
    });
  });

  it("still prices an undisputed sibling of a disputed variant normally", () => {
    const pair = disputedWithUndisputedSibling();
    expect(pair).not.toBeNull();
    const { disputed, sibling } = pair!;

    expect(
      decideProductControlPrice(
        input({ variant: variant({ sku: disputed.sku }) }),
      ),
    ).toMatchObject({ ok: false, code: "variant_strength_disputed" });

    const allowed = decideProductControlPrice(
      input({
        variant: variant({ sku: sibling.sku, strength: sibling.strength }),
      }),
    );
    expect(allowed.ok).toBe(true);
    expect(allowed).toMatchObject({ ok: true, price: { amountCents: 14900 } });
  });

  it("leaves a variant outside the peptide catalog completely unaffected", () => {
    expect(decideProductControlPrice(input())).toMatchObject({ ok: true });
    expect(resolveProductControlPrice(input())).toMatchObject({ ok: true });
  });

  it("refuses ahead of price selection, so no price row can rescue the variant", () => {
    const dispute = DISPUTED[0];
    for (const prices of [
      [],
      [price()],
      [price({ id: "a" }), price({ id: "b", version: 3 })],
    ]) {
      expect(
        decideProductControlPrice(
          input({ variant: variant({ sku: dispute.sku }), prices }),
        ),
      ).toMatchObject({ ok: false, code: "variant_strength_disputed" });
    }
  });
});

describe("the full refusal taxonomy", () => {
  const cases: Array<[ProductControlPriceRefusalCode, ProductControlPriceResolutionInput]> = [
    ["invalid_context", input({ currency: "usd" })],
    [
      "audience_unauthorized",
      input({ audienceEligibility: audience({ state: "unauthorized" }) }),
    ],
    ["price_missing", input({ prices: [] })],
    [
      "price_currency_mismatch",
      input({ prices: [price({ currency: "EUR" })] }),
    ],
    ["price_inactive", input({ prices: [price({ status: "approved" })] })],
    ["price_unapproved", input({ prices: [price({ approvedBy: null })] })],
    [
      "price_not_effective",
      input({ prices: [price({ effectiveAt: "2026-07-26T22:00:01Z" })] }),
    ],
    [
      "price_expired",
      input({
        prices: [price({ effectiveAt: "2026-07-01T00:00:00Z", expiresAt: AT })],
      }),
    ],
    [
      "price_ambiguous",
      input({ prices: [price({ id: "a" }), price({ id: "b", version: 3 })] }),
    ],
  ];

  it("reports each required state and fails closed on every one", () => {
    for (const [code, value] of cases) {
      const decision = decideProductControlPrice(value);
      expect(decision).toEqual({ ok: false, code, strengthDispute: null });
      expect(decision).not.toHaveProperty("price");
      expect(resolveProductControlPrice(value).ok).toBe(false);
    }
  });

  it("projects every full code onto a code that is still a refusal", () => {
    for (const [, value] of cases) {
      const projected = resolveProductControlPrice(value);
      expect(projected.ok).toBe(false);
    }
    const disputed = resolveProductControlPrice(
      input({ variant: variant({ sku: DISPUTED[0].sku }) }),
    );
    expect(disputed.ok).toBe(false);
  });

  it("covers the states the guard brief requires, under this codebase's names", () => {
    const required: Record<string, ProductControlPriceRefusalCode> = {
      variant_strength_disputed: "variant_strength_disputed",
      price_missing: "price_missing",
      price_ambiguous: "price_ambiguous",
      price_inactive: "price_inactive",
      price_not_effective: "price_not_effective",
      price_expired: "price_expired",
      audience_not_authorized: "audience_unauthorized",
      currency_mismatch: "price_currency_mismatch",
    };
    const reached = new Set<ProductControlPriceRefusalCode>();
    for (const [, value] of cases) {
      const decision = decideProductControlPrice(value);
      if (!decision.ok) reached.add(decision.code);
    }
    const guarded = decideProductControlPrice(
      input({ variant: variant({ sku: DISPUTED[0].sku }) }),
    );
    if (!guarded.ok) reached.add(guarded.code);
    for (const code of Object.values(required)) {
      expect(reached.has(code)).toBe(true);
    }
  });
});

describe("no path can emit a zero or negative customer price", () => {
  const unsafeAmounts = [
    0, -1, -14900, 0.5, -0.5, 149.5, Number.NaN, Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1,
  ];

  it("refuses every unsafe amount and never reports the amount back", () => {
    for (const amountCents of unsafeAmounts) {
      for (const decision of [
        decideProductControlPrice(input({ prices: [price({ amountCents })] })),
        resolveProductControlPrice(input({ prices: [price({ amountCents })] })),
      ]) {
        expect(decision.ok).toBe(false);
        expect(decision).not.toHaveProperty("price");
        expect(JSON.stringify(decision)).not.toContain(String(amountCents));
      }
    }
  });

  it("emits a positive safe integer on every path that succeeds", () => {
    const amounts = [1, 99, 100, 14900, 99999, Number.MAX_SAFE_INTEGER];
    const statuses = ["active", "approved", "draft"] as const;
    const windows: Array<[string, string | null]> = [
      ["2026-07-01T00:00:00Z", null],
      [AT, "2026-08-01T00:00:00Z"],
      ["2026-08-01T00:00:00Z", null],
      ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"],
    ];
    let succeeded = 0;
    for (const amountCents of amounts) {
      for (const status of statuses) {
        for (const [effectiveAt, expiresAt] of windows) {
          for (const approvedBy of ["admin-b", null]) {
            const decision = decideProductControlPrice(
              input({
                prices: [
                  price({ amountCents, status, effectiveAt, expiresAt, approvedBy }),
                ],
              }),
            );
            if (!decision.ok) continue;
            succeeded += 1;
            expect(Number.isSafeInteger(decision.price.amountCents)).toBe(true);
            expect(decision.price.amountCents).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(succeeded).toBeGreaterThan(0);
  });
});
