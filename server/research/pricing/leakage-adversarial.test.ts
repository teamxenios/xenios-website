/**
 * XCA-W8 cross-lane assembly, Task 6: adversarial internal-field leakage.
 *
 * The canon rule: supplier cost, margin, and any internal note must never
 * cross the customer boundary. The merged modules each promise explicit field
 * picks; this suite attacks the COMPOSED chain with a malicious price port
 * and a malicious variant lookup that both return valid data PLUS internal
 * keys (supplierCost, margin, internalNote, and friends), then asserts none
 * of those keys survive into the CartPriceSnapshot, the checkout quote, the
 * OrderLinePriceSnapshot, or the DB column mapping.
 */

import { describe, expect, it } from "vitest";
import type { CustomerPrice } from "@shared/research/pricing";
import {
  authorizeAudienceFromServerIdentity,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";
import {
  bindCartPrice,
  type CartPriceBindingDeps,
  type VariantIdentity,
} from "./cart-price-binding";
import { recomputeCheckout } from "./checkout-recompute";
import {
  snapshotOrderLinesFromQuote,
  toOrderLinePriceColumns,
} from "./order-price-snapshot";

const AT = "2026-07-29T12:00:00+00:00";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRICE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SKU = "XCA-LEAK-SKU-A";
const AMOUNT = 12900;
const VERSION = 3;

/** The substrings that must never appear in any customer-facing artifact. */
const FORBIDDEN = [
  "supplierCost",
  "margin",
  "internalNote",
  "wholesaleSource",
  "approvalNote",
  "approvedBy",
  "acme-supplier",
] as const;

const LEAKY_PRICE_EXTRAS = {
  supplierCost: 4200,
  margin: 0.62,
  internalNote: "wholesale source: acme-supplier, do not disclose",
  approvalNote: "approved against acme-supplier quote",
  approvedBy: "reviewer@internal",
};

const LEAKY_VARIANT_EXTRAS = {
  supplierCost: 4100,
  wholesaleSource: "acme-supplier",
  internalNote: "unit economics attached",
};

function leakyDeps(): CartPriceBindingDeps {
  return {
    variants: {
      async findVariantBySku(sku) {
        if (sku !== SKU) return null;
        const identity = {
          productId: PRODUCT_ID,
          variantId: VARIANT_ID,
          sku: SKU,
          displayName: "Leak Research Standard vial",
          ...LEAKY_VARIANT_EXTRAS,
        };
        return identity as VariantIdentity;
      },
    },
    priceResolver: {
      async resolveApprovedResearchPrice(input) {
        if (
          input.productId !== PRODUCT_ID ||
          input.variantId !== VARIANT_ID
        ) {
          return { state: "unavailable", reason: "price_missing" };
        }
        const price = {
          priceId: PRICE_ID,
          productId: PRODUCT_ID,
          variantId: VARIANT_ID,
          audience: input.authenticatedAudience.audience,
          amountCents: AMOUNT,
          currency: "USD",
          effectiveAt: "2026-07-01T00:00:00+00:00",
          expiresAt: null,
          version: VERSION,
          ...LEAKY_PRICE_EXTRAS,
        };
        return { state: "available", price: price as CustomerPrice };
      },
    },
  };
}

function audience(): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "retail",
    sourceVersion: "session-v1",
    evaluatedAt: AT,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

function expectClean(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of FORBIDDEN) {
    expect(
      serialized.includes(forbidden),
      `${label} leaked "${forbidden}"`,
    ).toBe(false);
  }
}

const CART_SNAPSHOT_KEYS = [
  "audience",
  "currency",
  "displayName",
  "effectiveAt",
  "expiresAt",
  "lineTotalCents",
  "priceId",
  "priceVersion",
  "pricedAt",
  "productId",
  "quantity",
  "sku",
  "unitAmountCents",
  "variantId",
] as const;

describe("internal-field leakage across the composed chain", () => {
  it("strips every internal key at the cart binding", async () => {
    const bound = await bindCartPrice(
      { sku: SKU, quantity: 2, authenticatedAudience: audience(), currency: "USD", at: AT },
      leakyDeps(),
    );
    expect(bound.state).toBe("bound");
    if (bound.state !== "bound") return;
    expect(Object.keys(bound.snapshot).sort()).toEqual([...CART_SNAPSHOT_KEYS]);
    expectClean(bound.snapshot, "CartPriceSnapshot");
    // The legitimate economics still came through intact.
    expect(bound.snapshot.priceId).toBe(PRICE_ID);
    expect(bound.snapshot.unitAmountCents).toBe(AMOUNT);
    expect(bound.snapshot.priceVersion).toBe(VERSION);
  });

  it("keeps the checkout quote, order snapshots, and DB columns clean end to end", async () => {
    const deps = leakyDeps();
    const authorized = audience();
    const recompute = await recomputeCheckout(
      {
        serverLines: [{ sku: SKU, quantity: 2 }],
        presented: {
          lines: [
            {
              sku: SKU,
              quantity: 2,
              unitAmountCents: AMOUNT,
              lineTotalCents: AMOUNT * 2,
              priceVersion: VERSION,
            },
          ],
          subtotalCents: AMOUNT * 2,
          currency: "USD",
        },
        authenticatedAudience: authorized,
        currency: "USD",
        at: AT,
      },
      deps,
    );
    expect(recompute.state).toBe("quoted");
    if (recompute.state !== "quoted") return;
    const quote = recompute.quote;
    expectClean(quote, "CheckoutPriceQuote");
    for (const line of quote.lines) {
      expect(Object.keys(line).sort()).toEqual([...CART_SNAPSHOT_KEYS]);
    }

    const snapshotResult = snapshotOrderLinesFromQuote(quote);
    expect(snapshotResult.state).toBe("complete");
    if (snapshotResult.state !== "complete") return;
    const orderLine = snapshotResult.lines[0];
    expectClean(snapshotResult.lines, "OrderLinePriceSnapshot");
    expect(Object.keys(orderLine).sort()).toEqual(
      [...CART_SNAPSHOT_KEYS.filter((key) => key !== "pricedAt"), "agreedAt"].sort(),
    );

    const mapping = toOrderLinePriceColumns(orderLine);
    expect(mapping.state).toBe("mapped");
    if (mapping.state !== "mapped") return;
    expectClean(mapping.columns, "OrderLinePriceColumns");
    expect(Object.keys(mapping.columns).sort()).toEqual([
      "audience",
      "currency",
      "price_id",
      "price_version",
      "priced_at",
      "unit_amount_cents",
    ]);
    expect(mapping.columns).toEqual({
      price_id: PRICE_ID,
      price_version: VERSION,
      audience: "retail",
      unit_amount_cents: AMOUNT,
      currency: "USD",
      priced_at: AT,
    });
  });

  it("keeps the quote hash independent of stripped internal keys", async () => {
    // Two ports, one clean and one leaky, otherwise identical: the emitted
    // quotes must be byte-identical, hash included. If an internal key ever
    // reached the canonical payload, the hashes would diverge.
    const cleanDeps: CartPriceBindingDeps = {
      variants: {
        async findVariantBySku(sku) {
          return sku === SKU
            ? {
                productId: PRODUCT_ID,
                variantId: VARIANT_ID,
                sku: SKU,
                displayName: "Leak Research Standard vial",
              }
            : null;
        },
      },
      priceResolver: {
        async resolveApprovedResearchPrice(input) {
          if (input.productId !== PRODUCT_ID) {
            return { state: "unavailable", reason: "price_missing" };
          }
          return {
            state: "available",
            price: {
              priceId: PRICE_ID,
              productId: PRODUCT_ID,
              variantId: VARIANT_ID,
              audience: input.authenticatedAudience.audience,
              amountCents: AMOUNT,
              currency: "USD",
              effectiveAt: "2026-07-01T00:00:00+00:00",
              expiresAt: null,
              version: VERSION,
            },
          };
        },
      },
    };
    const input = (deps: CartPriceBindingDeps) =>
      recomputeCheckout(
        {
          serverLines: [{ sku: SKU, quantity: 2 }],
          presented: {
            lines: [
              {
                sku: SKU,
                quantity: 2,
                unitAmountCents: AMOUNT,
                lineTotalCents: AMOUNT * 2,
                priceVersion: VERSION,
              },
            ],
            subtotalCents: AMOUNT * 2,
            currency: "USD",
          },
          authenticatedAudience: audience(),
          currency: "USD",
          at: AT,
        },
        deps,
      );
    const clean = await input(cleanDeps);
    const leaky = await input(leakyDeps());
    expect(clean.state).toBe("quoted");
    expect(leaky.state).toBe("quoted");
    if (clean.state !== "quoted" || leaky.state !== "quoted") return;
    expect(leaky.quote.quoteHash).toBe(clean.quote.quoteHash);
    expect(JSON.stringify(leaky.quote)).toBe(JSON.stringify(clean.quote));
  });
});
