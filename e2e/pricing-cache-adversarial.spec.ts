// LANE H — adversarial verification of the bulk catalog pricing source.
//
// The source replaced a 3,306-query read whose failure mode is the one that
// matters most on a storefront: a transient upstream problem rewrote 417
// approved prices into "Price on request". The founder rule is explicit —
// only a TRULY unpriced product may say that.
//
// So these tests do not ask whether the cache caches. They ask whether any
// reachable upstream behaviour can still make the customer see a catalog with
// no prices in it.

import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { BulkCatalogPricingSource } from "../server/research/pricing/bulk-catalog-pricing-source";

function product(id: string): AdminProductDetail {
  return {
    id,
    status: "published",
    visibility: "public",
    variants: [],
    prices: [],
  } as unknown as AdminProductDetail;
}

/** A catalog the size of the real one, so a collapse is visible as a number. */
const FULL: readonly AdminProductDetail[] = Object.freeze(
  Array.from({ length: 417 }, (_, index) => product(`p_${index}`)),
);

class Upstream {
  public calls = 0;
  constructor(private behaviour: () => Promise<readonly AdminProductDetail[]>) {}
  set(next: () => Promise<readonly AdminProductDetail[]>) {
    this.behaviour = next;
  }
  listForPricing = async (): Promise<AdminProductDetail[]> => {
    this.calls += 1;
    return [...(await this.behaviour())];
  };
}

function clock(start = 1_000_000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("LANE H: the cache serves, and does not stampede", () => {
  it("reads once on cold and serves the snapshot warm", async () => {
    const upstream = new Upstream(async () => FULL);
    const source = new BulkCatalogPricingSource(upstream, {
      now: clock().now,
      ttlMs: 60_000,
    });

    expect((await source.readCatalogForPricing()).length).toBe(417);
    expect((await source.readCatalogForPricing()).length).toBe(417);
    expect(upstream.calls).toBe(1);
  });

  it("refreshes once the ttl has expired", async () => {
    const upstream = new Upstream(async () => FULL);
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream, {
      now: time.now,
      ttlMs: 60_000,
    });

    await source.readCatalogForPricing();
    time.advance(60_001);
    await source.readCatalogForPricing();
    expect(upstream.calls).toBe(2);
  });

  it.each([1, 5, 10, 25])(
    "collapses %i concurrent cold callers into a single upstream read",
    async (callers) => {
      const upstream = new Upstream(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return FULL;
      });
      const source = new BulkCatalogPricingSource(upstream, { now: clock().now });

      const results = await Promise.all(
        Array.from({ length: callers }, () => source.readCatalogForPricing()),
      );
      expect(results.every((result) => result.length === 417)).toBe(true);
      expect(upstream.calls).toBe(1);
    },
  );
});

describe("LANE H: a transient upstream failure must not erase prices", () => {
  it("serves the last verified snapshot when a refresh fails", async () => {
    const upstream = new Upstream(async () => FULL);
    const time = clock();
    const errors: string[] = [];
    const source = new BulkCatalogPricingSource(upstream, {
      now: time.now,
      ttlMs: 60_000,
      staleWhileErrorMs: 15 * 60_000,
      onError: (message) => errors.push(message),
    });

    await source.readCatalogForPricing();
    upstream.set(async () => {
      throw new Error("Cloudflare 522");
    });
    time.advance(60_001);

    expect((await source.readCatalogForPricing()).length).toBe(417);
    expect(errors.length).toBe(1);
  });

  it("raises honestly once the snapshot is older than the staleness ceiling", async () => {
    const upstream = new Upstream(async () => FULL);
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream, {
      now: time.now,
      ttlMs: 60_000,
      staleWhileErrorMs: 15 * 60_000,
      onError: () => {},
    });

    await source.readCatalogForPricing();
    upstream.set(async () => {
      throw new Error("still down");
    });
    time.advance(16 * 60_000);

    await expect(source.readCatalogForPricing()).rejects.toThrow();
  });

  it("raises on a cold upstream failure rather than publishing an empty catalog", async () => {
    const upstream = new Upstream(async () => {
      throw new Error("cold failure");
    });
    const source = new BulkCatalogPricingSource(upstream, {
      now: clock().now,
      onError: () => {},
    });

    await expect(source.readCatalogForPricing()).rejects.toThrow();
  });

  it("recovers to fresh data once upstream returns", async () => {
    const upstream = new Upstream(async () => FULL);
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream, {
      now: time.now,
      ttlMs: 60_000,
      onError: () => {},
    });

    await source.readCatalogForPricing();
    upstream.set(async () => {
      throw new Error("blip");
    });
    time.advance(60_001);
    await source.readCatalogForPricing();

    upstream.set(async () => [...FULL, product("p_new")]);
    time.advance(60_001);
    expect((await source.readCatalogForPricing()).length).toBe(418);
  });
});

describe("LANE H: an upstream that succeeds with nothing is not a truthful catalog", () => {
  // The founder rule: only a truly unpriced product may show "Price on
  // request". A read that RESOLVES with zero rows is not evidence that the
  // catalog is empty. An RLS change, a filtered query, a revoked grant or a
  // half-applied migration all produce exactly this, and none of them mean
  // that nothing is for sale. If an empty success can replace a good snapshot
  // then the 3,306-query collapse is reachable again through a quieter door,
  // and this time it is cached for the whole ttl.
  it("does not let an empty successful read replace a good snapshot", async () => {
    const upstream = new Upstream(async () => FULL);
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream, {
      now: time.now,
      ttlMs: 60_000,
      onError: () => {},
    });

    await source.readCatalogForPricing();
    expect(await source.readProductForPricing("p_1")).not.toBeNull();

    // Upstream now answers successfully with zero rows.
    upstream.set(async () => []);
    time.advance(60_001);

    const served = await source.readCatalogForPricing();
    const stillPriceable = await source.readProductForPricing("p_1");

    expect(served.length).toBeGreaterThan(0);
    expect(stillPriceable).not.toBeNull();
  });

  // OPEN POLICY QUESTION, deliberately not decided here. A refresh that
  // returns 2 rows where 417 stood is produced by the same causes as an
  // empty read, but "how small is too small" is a founder/lead judgement:
  // too strict a ratio would refuse a legitimate catalog reduction. This
  // test therefore PINS TODAY'S BEHAVIOUR rather than asserting a threshold
  // nobody has agreed, so the question stays visible instead of silent.
  it("currently accepts a catastrophically shrunken read (see handoff)", async () => {
    const upstream = new Upstream(async () => FULL);
    const time = clock();
    const source = new BulkCatalogPricingSource(upstream, {
      now: time.now,
      ttlMs: 60_000,
      onError: () => {},
    });

    await source.readCatalogForPricing();
    upstream.set(async () => [product("p_0"), product("p_1")]);
    time.advance(60_001);

    // 417 -> 2 is accepted today. If the lead adopts a shrink guard, flip
    // this to expect the held snapshot instead.
    expect((await source.readCatalogForPricing()).length).toBe(2);
  });
});

describe("LANE H: the cache carries no customer identity", () => {
  it("exposes only catalog content and age, never a viewer", async () => {
    const upstream = new Upstream(async () => FULL);
    const source = new BulkCatalogPricingSource(upstream, { now: clock().now });
    await source.readCatalogForPricing();

    const stats = JSON.stringify(source.stats()).toLowerCase();
    for (const term of ["email", "session", "member", "audience", "viewer", "buyer"]) {
      expect(stats).not.toContain(term);
    }
  });
});
