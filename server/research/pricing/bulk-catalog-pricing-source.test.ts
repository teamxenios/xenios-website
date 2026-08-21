// The reliability contract for the Early Access catalog's pricing read.
//
// The live failure this encodes: 3,306 Supabase round trips per catalog
// request, Supabase answering Cloudflare 522 under sustained load, and 417
// approved prices silently becoming "Price on request" for the customer.

import { describe, expect, it, vi } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import {
  BulkCatalogPricingSource,
  type BulkPricingCatalogReader,
} from "./bulk-catalog-pricing-source";

function product(id: string, amountCents: number | null = 6500): AdminProductDetail {
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
        sku: `SKU-${id}`,
      },
    ],
    prices:
      amountCents === null
        ? []
        : [
            {
              id: `price_${id}`,
              productId: id,
              variantId: `${id}_v`,
              audience: "member",
              amountCents,
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
}

/** A reader that counts reads, so "one read" is measured, not asserted by hope. */
function countingReader(
  catalog: AdminProductDetail[] = [product("p1"), product("p2")],
) {
  let reads = 0;
  let failWith: Error | null = null;
  const reader: BulkPricingCatalogReader = {
    listForPricing: async () => {
      reads += 1;
      if (failWith) throw failWith;
      return catalog;
    },
  };
  return {
    reader,
    reads: () => reads,
    fail: (error: Error | null) => {
      failWith = error;
    },
    replace: (next: AdminProductDetail[]) => {
      catalog = next;
    },
  };
}

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("the bulk catalog pricing source", () => {
  it("answers many products from ONE upstream read", async () => {
    const upstream = countingReader();
    const source = new BulkCatalogPricingSource(upstream.reader);

    await source.readProductForPricing("p1");
    await source.readProductForPricing("p2");
    await source.readProductForPricing("p1");
    await source.readCatalogForPricing();

    // The defect was one FULL catalog read per product question.
    expect(upstream.reads()).toBe(1);
  });

  it("collapses a concurrent burst into a single read", async () => {
    const upstream = countingReader();
    const source = new BulkCatalogPricingSource(upstream.reader);

    await Promise.all(
      Array.from({ length: 25 }, () => source.readProductForPricing("p1")),
    );

    // 25 simultaneous customers on a cold cache must not become 25 reads.
    expect(upstream.reads()).toBe(1);
  });

  it("re-reads once the TTL has passed, so an approved price change lands", async () => {
    const upstream = countingReader();
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream.reader, {
      ttlMs: 60_000,
      now: time.now,
    });

    await source.readProductForPricing("p1");
    time.advance(59_000);
    await source.readProductForPricing("p1");
    expect(upstream.reads()).toBe(1);

    time.advance(2_000);
    upstream.replace([product("p1", 7500)]);
    const after = await source.readProductForPricing("p1");
    expect(upstream.reads()).toBe(2);
    expect(after?.prices[0].amountCents).toBe(7500);
  });

  it("KEEPS REAL PRICES when a refresh fails and a recent snapshot exists", async () => {
    // The exact live failure. Before this, an upstream blip rewrote 417
    // approved prices into "Price on request" — a false statement about
    // products whose prices had not changed at all.
    const upstream = countingReader();
    const time = clock();
    const onError = vi.fn();
    const source = new BulkCatalogPricingSource(upstream.reader, {
      ttlMs: 60_000,
      staleWhileErrorMs: 15 * 60_000,
      now: time.now,
      onError,
    });

    const fresh = await source.readProductForPricing("p1");
    expect(fresh?.prices[0].amountCents).toBe(6500);

    time.advance(61_000);
    upstream.fail(new Error("supabase 522"));

    const duringOutage = await source.readProductForPricing("p1");
    expect(duringOutage?.prices[0].amountCents).toBe(6500);
    expect((await source.readCatalogForPricing()).length).toBe(2);
    // Reported internally, never to the customer.
    expect(onError).toHaveBeenCalled();
  });

  it("stops standing behind a snapshot nobody has been able to re-verify", async () => {
    const upstream = countingReader();
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream.reader, {
      ttlMs: 60_000,
      staleWhileErrorMs: 10 * 60_000,
      now: time.now,
      onError: () => {},
    });

    await source.readProductForPricing("p1");
    upstream.fail(new Error("supabase 522"));
    time.advance(11 * 60_000);

    // Past the ceiling the honest answer is an error the caller can surface as
    // "temporarily unavailable", NOT a catalog in which nothing has a price.
    await expect(source.readProductForPricing("p1")).rejects.toThrow("supabase 522");
  });

  it("raises rather than inventing an unpriced catalog on a cold failure", async () => {
    const upstream = countingReader();
    upstream.fail(new Error("supabase 522"));
    const source = new BulkCatalogPricingSource(upstream.reader, {
      onError: () => {},
    });

    await expect(source.readCatalogForPricing()).rejects.toThrow("supabase 522");
  });

  it("recovers on its own once upstream comes back", async () => {
    const upstream = countingReader();
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream.reader, {
      ttlMs: 60_000,
      now: time.now,
      onError: () => {},
    });

    await source.readProductForPricing("p1");
    time.advance(61_000);
    upstream.fail(new Error("supabase 522"));
    await source.readProductForPricing("p1");

    upstream.fail(null);
    time.advance(61_000);
    upstream.replace([product("p1", 9900)]);
    const recovered = await source.readProductForPricing("p1");
    expect(recovered?.prices[0].amountCents).toBe(9900);
  });

  it("keeps a duplicated product id unpriceable", async () => {
    const upstream = countingReader([product("dup"), product("dup", 100)]);
    const source = new BulkCatalogPricingSource(upstream.reader);
    // Ambiguity must stay unanswerable rather than resolving to whichever row
    // happened to come back first.
    expect(await source.readProductForPricing("dup")).toBeNull();
  });

  it("holds nothing customer-scoped in the cache", async () => {
    const upstream = countingReader();
    const source = new BulkCatalogPricingSource(upstream.reader);
    const catalog = await source.readCatalogForPricing();
    const wire = JSON.stringify(catalog).toLowerCase();
    for (const forbidden of [
      "session",
      "cookie",
      "email",
      "memberid",
      "buyer",
      "wholesale",
      "margin",
      "markup",
    ]) {
      expect(wire).not.toContain(forbidden);
    }
    // The snapshot is the canonical catalog; the audience decision stays with
    // the resolver, per request.
    expect(source.stats().hasSnapshot).toBe(true);
  });
});
