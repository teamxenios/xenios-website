// How many reads does one Early Access catalog projection cost?
//
// WHY THIS FILE EXISTS. The founder reports the live catalog taking 30-60
// seconds to appear on a phone, and asks whether /research/early-access uses
// the new ~3-query bulk/cached pricing path. It does not. The bulk + cache +
// stale-while-revalidate work landed on the PRICING reader
// (CatalogPricingProductSource / catalog-price-projection). The Early Access
// catalog composes a DIFFERENT reader — ProductControlDeclaredFactsReader —
// which was never converted, and nothing on that path is cached.
//
// The cost is not visible by reading one function, because the fan-out is
// spread over three files:
//
//   declared-facts-source.ts   readDeclaredFacts -> per PRODUCT
//                              readProductFacts  -> per VARIANT
//                              readVariantFacts  -> inventory + holds
//                                                   + supplier confirmation
//   member-catalog-service.ts  inventoryFactsForVariant
//                              -> 1 select from research_inventory_lots
//                                 PER VARIANT
//                              -> then 1 rpc(research_lot_is_allocatable)
//                                 PER LOT
//
// So the real shape is roughly:
//     variants x 1 select  +  total_lots x 1 rpc  +  per-variant holds/supplier
// which over ~420 variants is thousands of round trips.
//
// These tests COUNT the calls through fakes, so the fan-out is a measured
// number in CI rather than an argument. They are written to be green against
// today's implementation and to go RED the moment someone converts the reader
// to bulk — which is the intended review moment, not a regression. The comment
// on each assertion says what the number should become.
//
// This file deliberately does NOT change the reader. member-catalog-service.ts
// is inside another session's lease; this lane only makes the cost legible.

import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import {
  ProductControlDeclaredFactsReader,
  type VariantInventoryFactsReader,
} from "./declared-facts-source";

/** A reader that answers instantly and counts how often it was asked. */
function countingInventory(): VariantInventoryFactsReader & {
  calls: () => number;
  variantsSeen: () => readonly string[];
} {
  let calls = 0;
  const seen: string[] = [];
  return {
    calls: () => calls,
    variantsSeen: () => seen,
    async readVariantInventoryFacts({ productId, variant, evaluatedAt }) {
      calls += 1;
      seen.push(variant.id);
      const sourceVersion = "counting_fake";
      return {
        inventory: {
          productId,
          variantId: variant.id,
          state: "unavailable",
          reason: "not_currently_available",
          sourceVersion,
          evaluatedAt,
        },
        lotCoa: {
          productId,
          variantId: variant.id,
          state: "required",
          sourceVersion,
          evaluatedAt,
        },
      };
    },
  };
}

function product(index: number, variantCount: number): AdminProductDetail {
  return {
    id: `prod-${index}`,
    slug: `product-${index}`,
    displayName: `Product ${index}`,
    canonicalName: `product-${index}`,
    variants: Array.from({ length: variantCount }, (_unused, v) => ({
      id: `prod-${index}-var-${v}`,
      sku: `SKU-${index}-${v}`,
      strength: "10 mg",
      presentation: "vial",
    })),
  } as unknown as AdminProductDetail;
}

function catalog(products: number, variantsEach: number): AdminProductDetail[] {
  return Array.from({ length: products }, (_unused, i) =>
    product(i, variantsEach),
  );
}

async function project(products: AdminProductDetail[]) {
  const inventory = countingInventory();
  const reader = new ProductControlDeclaredFactsReader({
    inventory,
    currency: "USD",
  } as never);
  await reader.readDeclaredFacts({
    products,
    now: new Date("2026-08-21T12:00:00.000Z"),
  });
  return inventory;
}

describe("the Early Access catalog projection reads once per VARIANT", () => {
  it("asks the inventory reader exactly once per variant, not once per catalog", async () => {
    // WHEN THIS GOES RED: someone converted the reader to a bulk read. That is
    // the fix. Change the expectation to the new constant (ideally 1) rather
    // than restoring the fan-out.
    const inventory = await project(catalog(10, 3));
    expect(inventory.calls()).toBe(30);
  });

  it("scales linearly with variant count — the defining property of an N+1", async () => {
    const small = await project(catalog(5, 2));
    const large = await project(catalog(50, 2));
    expect(small.calls()).toBe(10);
    expect(large.calls()).toBe(100);
    // Ten times the catalog, ten times the reads. A bulk reader would keep
    // these two numbers equal (and small) instead.
    expect(large.calls() / small.calls()).toBe(10);
  });

  it("costs one inventory read per variant at production catalog scale", async () => {
    // The live Early Access catalog carries roughly 420 orderable variants.
    // Each of these is a Supabase round trip in production, and each one then
    // fans out again to one research_lot_is_allocatable RPC PER LOT inside
    // inventoryFactsForVariant — so this number is the FLOOR of the real cost,
    // not the total.
    const inventory = await project(catalog(140, 3));
    expect(inventory.calls()).toBe(420);
    expect(new Set(inventory.variantsSeen()).size).toBe(420);
  });

  it("reads nothing at all for an empty catalog", async () => {
    const inventory = await project([]);
    expect(inventory.calls()).toBe(0);
  });
});

describe("the projection holds no cache of its own", () => {
  it("re-reads every variant on a second projection", async () => {
    // Two identical projections a second apart cost twice as much. There is no
    // snapshot, no stale-while-revalidate, and no memo anywhere on this path —
    // so every customer who opens the catalog pays the full fan-out again.
    //
    // WHEN THIS GOES RED: a cache was added. Good. Re-express it as "the second
    // projection costs 0 additional reads within the TTL", and add a test that
    // a successful EMPTY upstream read does not replace a healthy snapshot —
    // that specific poisoning bug was already fixed once on the pricing lane
    // (15f436b) and must not be reintroduced here.
    const inventory = countingInventory();
    const reader = new ProductControlDeclaredFactsReader({
      inventory,
      currency: "USD",
    } as never);
    const products = catalog(10, 2);
    const at = { products, now: new Date("2026-08-21T12:00:00.000Z") };
    await reader.readDeclaredFacts(at);
    const afterFirst = inventory.calls();
    await reader.readDeclaredFacts(at);
    expect(afterFirst).toBe(20);
    expect(inventory.calls()).toBe(40);
  });
});
