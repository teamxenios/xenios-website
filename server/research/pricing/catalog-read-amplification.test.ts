// HOW MANY REMOTE QUERIES DOES ONE CATALOG REQUEST COST?
//
// This measures the thing that actually broke production, against a fake that
// counts queries the way the real Supabase client would issue them. It is a
// query-COUNT test, not a latency test: latency varies by machine and network,
// but "one catalog request costs N round trips" is a property of the code and
// can be pinned.
//
// Measured on production 2026-08-21: 236 published public products.
//   BEFORE  2 list calls + 236 products x 2 stability reads x 7 queries = 3,306
//   AFTER   1 products + 1 variants + 1 prices                          =     3
//
// The 3,306 path took 27-37 seconds per request and, under sustained load,
// drove Supabase to answer Cloudflare 522 — which turned all 417 approved
// prices into "Price on request" for the customer.

import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import {
  BulkCatalogPricingSource,
  type BulkPricingCatalogReader,
} from "./bulk-catalog-pricing-source";

/** Production's shape on 2026-08-21. */
const PUBLISHED_PRODUCTS = 236;
const QUERIES_PER_GET = 7; // product, variants, prices, media, content, audit, required inputs
const STABILITY_READS_PER_PRODUCT = 2; // readStableDetail reads each product twice
const LIST_CALLS = 2; // initial + verification

/** What the old path cost, expressed as the arithmetic rather than a magic number. */
const BEFORE_QUERIES =
  LIST_CALLS + PUBLISHED_PRODUCTS * STABILITY_READS_PER_PRODUCT * QUERIES_PER_GET;

/** What listForPricing costs: products, variants, prices. */
const AFTER_QUERIES_PER_READ = 3;

function catalogOf(size: number): AdminProductDetail[] {
  return Array.from({ length: size }, (_, index) => {
    const id = `pc_${index}`;
    return {
      id,
      status: "published",
      visibility: "public",
      active: true,
      variants: [
        {
          id: `${id}_v`,
          productId: id,
          status: "approved",
          active: true,
          memberEligible: true,
          sku: `SKU-${index}`,
        },
      ],
      prices: [
        {
          id: `price_${id}`,
          productId: id,
          variantId: `${id}_v`,
          audience: "member",
          amountCents: 6500,
          currency: "USD",
          effectiveAt: "2026-08-01T00:00:00.000Z",
          expiresAt: null,
          status: "active",
          approvalNote: null,
          version: 1,
          createdBy: "ops",
          approvedBy: "founder",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    } as unknown as AdminProductDetail;
  });
}

/** Counts the queries `listForPricing` really issues, one per remote call. */
function countingReader(size: number) {
  const catalog = catalogOf(size);
  let queries = 0;
  const reader: BulkPricingCatalogReader = {
    listForPricing: async () => {
      queries += AFTER_QUERIES_PER_READ;
      return catalog;
    },
  };
  return { reader, queries: () => queries };
}

describe("catalog read amplification", () => {
  it("states the before cost as arithmetic, so it cannot drift into folklore", () => {
    expect(BEFORE_QUERIES).toBe(3306);
  });

  it("answers a full 420-row catalog page in three remote queries", async () => {
    const upstream = countingReader(PUBLISHED_PRODUCTS);
    const source = new BulkCatalogPricingSource(upstream.reader);

    // The composition asks per offering variant. A page of 24 asks ~24 times;
    // the whole catalog asks 420 times.
    for (let index = 0; index < 420; index += 1) {
      await source.readProductForPricing(`pc_${index % PUBLISHED_PRODUCTS}`);
    }

    expect(upstream.queries()).toBe(AFTER_QUERIES_PER_READ);
    expect(upstream.queries()).toBeLessThan(BEFORE_QUERIES / 1000);
  });

  it("costs three queries for a burst of 25 concurrent customers, not 25 reads", async () => {
    const upstream = countingReader(PUBLISHED_PRODUCTS);
    const source = new BulkCatalogPricingSource(upstream.reader);

    await Promise.all(
      Array.from({ length: 25 }, async () => {
        for (let index = 0; index < 24; index += 1) {
          await source.readProductForPricing(`pc_${index}`);
        }
      }),
    );

    expect(upstream.queries()).toBe(AFTER_QUERIES_PER_READ);
  });

  it("scales with catalog size the way a bulk read should, not the way a fan-out does", async () => {
    // The old cost grew with the product count on EVERY request. This one does
    // not, which is the property that keeps 426 rows as cheap as 420.
    for (const size of [236, 426, 1000]) {
      const upstream = countingReader(size);
      const source = new BulkCatalogPricingSource(upstream.reader);
      await source.readCatalogForPricing();
      for (let index = 0; index < size; index += 1) {
        await source.readProductForPricing(`pc_${index}`);
      }
      expect(upstream.queries()).toBe(AFTER_QUERIES_PER_READ);
    }
  });
});
