import { describe, expect, it } from "vitest";

import { checkoutEarlyAccessCart } from "./checkout-service";
import { quoteEarlyAccessCart } from "./quote-service";
import { InMemoryEarlyAccessCartStore } from "./store";
import type { CartCatalogUnit, CartCustomer, CartReleaseDecision } from "./ports";
import {
  ORDER_CONTACT,
  SHIP_TO,
  StubAgreementGate,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  cleanUnit,
} from "../routes/route-fixtures";

/**
 * THE WORLD IS RE-READ AT COMMIT, NOT TRUSTED FROM THE QUOTE.
 *
 * A quote is a price held open for a while. Between issuing one and committing
 * it, a founder can revoke a release, Product Control can hold a unit, an
 * approved price can move, and a quantity ceiling can narrow. Until this
 * change, `EarlyAccessCartCheckoutDeps` carried no catalog and no release port
 * at all, so the checkout could not have re-read any of that even in principle:
 * it enforced expiry and then trusted every term of the stored quote.
 *
 * The window is the whole TTL, and the failure is silent. Nobody is told that
 * the order committed at terms Xenios has since withdrawn; it simply sells a
 * held unit, or charges the old price.
 *
 * Each test below moves exactly one fact after the quote and before the
 * confirm. The last one moves nothing, because a revalidation that refuses a
 * still-valid order would be a worse bug than the one it replaces.
 */

const CUSTOMER: CartCustomer = Object.freeze({
  customerRef: `eac_${"a".repeat(32)}`,
  aliases: Object.freeze([]),
});

/** A catalog and release pair whose answers can be changed mid-test. */
function mutableWorld() {
  const unit = cleanUnit({ quantityLimit: 20 } as never) as unknown as CartCatalogUnit;
  const state = {
    unit: { ...unit, purchasable: true } as CartCatalogUnit,
    decision: Object.freeze({
      released: true as const,
      priceCents: 19_900,
      currency: "USD" as const,
      promotion: Object.freeze({ promotionId: null, version: null, label: null, discountCents: 0 }),
    }) as CartReleaseDecision,
  };
  return {
    state,
    catalog: {
      async units(): Promise<readonly CartCatalogUnit[]> {
        return Object.freeze([state.unit]);
      },
    },
    releases: {
      async decide(): Promise<CartReleaseDecision> {
        return state.decision;
      },
    },
  };
}

function deps(store: InMemoryEarlyAccessCartStore, world: ReturnType<typeof mutableWorld>) {
  return {
    catalog: world.catalog as never,
    releases: world.releases as never,
    suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT) as never,
    shipping: {
      async serves() { return true; },
      async quote() { return { shippingCents: 0, currency: "USD" as const }; },
    } as never,
    agreements: new StubAgreementGate(true) as never,
    quotes: store,
    checkouts: store,
    audit: { record: async () => {} },
    now: () => Date.parse("2026-08-13T12:00:00.000Z"),
  };
}

const REQUEST = {
  items: [
    {
      productId: "prod-clean",
      variantId: "var-10mg",
      quantity: 2,
      expectedUnitPriceCents: 19_900,
      expectedCurrency: "USD" as const,
    },
  ],
  contact: ORDER_CONTACT,
  shipTo: SHIP_TO,
};

async function quoteThen(
  change: (world: ReturnType<typeof mutableWorld>) => void,
): Promise<{ committed: boolean; code?: string; orders: number }> {
  const store = new InMemoryEarlyAccessCartStore();
  const world = mutableWorld();
  const quoted = await quoteEarlyAccessCart(deps(store, world) as never, CUSTOMER, REQUEST as never);
  expect(quoted.ok).toBe(true);
  if (!quoted.ok) return { committed: false, orders: 0 };

  // The world moves between the quote and the confirm.
  change(world);

  const placed = await checkoutEarlyAccessCart(deps(store, world) as never, CUSTOMER, {
    quoteId: quoted.quote.quoteId,
    idempotencyKey: "xeac_reval00000000000001",
    expectedIntentHash: quoted.quote.intentHash,
  });
  return {
    committed: placed.ok,
    code: placed.ok ? undefined : placed.code,
    orders: store.allCheckouts().length,
  };
}

describe("Product Control is revalidated at commit", () => {
  it("refuses when the approved price moved after the quote", async () => {
    const result = await quoteThen((world) => {
      world.state.decision = Object.freeze({
        released: true as const,
        priceCents: 24_900,
        currency: "USD" as const,
        promotion: { promotionId: null, version: null, label: null, discountCents: 0 },
      }) as CartReleaseDecision;
    });
    expect(result.committed).toBe(false);
    expect(result.orders).toBe(0);
  });

  it("refuses when the unit was put on hold after the quote", async () => {
    const result = await quoteThen((world) => {
      world.state.unit = {
        ...world.state.unit,
        availability: "TEMPORARILY_HELD",
      } as CartCatalogUnit;
    });
    expect(result.committed).toBe(false);
    expect(result.orders).toBe(0);
  });

  it("refuses when the release was revoked after the quote", async () => {
    const result = await quoteThen((world) => {
      world.state.decision = Object.freeze({
        released: false as const,
        code: "RELEASE_REVOKED",
      }) as unknown as CartReleaseDecision;
    });
    expect(result.committed).toBe(false);
    expect(result.orders).toBe(0);
  });

  it("refuses when the quantity ceiling narrowed below the quoted quantity", async () => {
    const result = await quoteThen((world) => {
      world.state.unit = { ...world.state.unit, quantityLimit: 1 } as CartCatalogUnit;
    });
    expect(result.committed).toBe(false);
    expect(result.orders).toBe(0);
  });

  it("refuses when the exact variant disappeared from the catalog", async () => {
    const result = await quoteThen((world) => {
      world.state.unit = {
        ...world.state.unit,
        variantId: "var-something-else",
      } as CartCatalogUnit;
    });
    expect(result.committed).toBe(false);
    expect(result.orders).toBe(0);
  });

  it("still commits when nothing changed", async () => {
    const result = await quoteThen(() => {});
    expect(result.committed).toBe(true);
    expect(result.orders).toBe(1);
  });
});
