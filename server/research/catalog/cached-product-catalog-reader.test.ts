/**
 * The cached catalog reader's safety properties, pinned the same way the
 * pricing cache's are (bulk-catalog-pricing-source.test.ts): a snapshot is
 * shared within the TTL, a failed refresh serves the recent snapshot, an
 * EMPTY successful read never replaces a non-empty snapshot, and none of it
 * lets staleness run forever.
 */

import { describe, expect, it } from "vitest";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { CachedProductCatalogReader } from "./cached-product-catalog-reader";

function detail(id: string): AdminProductDetail {
  return { id, slug: id } as unknown as AdminProductDetail;
}

function upstream(answers: Array<AdminProductDetail[] | Error>) {
  let calls = 0;
  return {
    calls: () => calls,
    reader: {
      async readCatalog() {
        const answer = answers[Math.min(calls, answers.length - 1)];
        calls += 1;
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
}

describe("CachedProductCatalogReader", () => {
  it("serves one upstream read to a burst within the TTL", async () => {
    const source = upstream([[detail("p1")]]);
    let clock = 0;
    const cached = new CachedProductCatalogReader(source.reader, {
      ttlMs: 60_000,
      now: () => clock,
      onError: () => {},
    });
    const results = await Promise.all([
      cached.readCatalog(),
      cached.readCatalog(),
      cached.readCatalog(),
    ]);
    clock = 59_999;
    await cached.readCatalog();
    expect(source.calls()).toBe(1);
    expect(results.every((catalog) => catalog.length === 1)).toBe(true);
  });

  it("serves the recent snapshot when a refresh fails, and reports", async () => {
    const source = upstream([[detail("p1")], new Error("upstream down")]);
    let clock = 0;
    const reported: string[] = [];
    const cached = new CachedProductCatalogReader(source.reader, {
      ttlMs: 60_000,
      staleWhileErrorMs: 15 * 60_000,
      now: () => clock,
      onError: (message) => reported.push(message),
    });
    await cached.readCatalog();
    clock = 61_000;
    const served = await cached.readCatalog();
    expect(served.map((product) => product.id)).toEqual(["p1"]);
    expect(reported.some((message) => message.includes("refresh failed"))).toBe(true);
  });

  it("raises when a refresh fails past the staleness ceiling", async () => {
    const source = upstream([[detail("p1")], new Error("upstream down")]);
    let clock = 0;
    const cached = new CachedProductCatalogReader(source.reader, {
      ttlMs: 60_000,
      staleWhileErrorMs: 120_000,
      now: () => clock,
      onError: () => {},
    });
    await cached.readCatalog();
    clock = 121_000;
    await expect(cached.readCatalog()).rejects.toThrow("upstream down");
  });

  it("KEEPS the real catalog when a successful read comes back empty", async () => {
    const source = upstream([[detail("p1")], []]);
    let clock = 0;
    const reported: string[] = [];
    const cached = new CachedProductCatalogReader(source.reader, {
      ttlMs: 60_000,
      now: () => clock,
      onError: (message) => reported.push(message),
    });
    await cached.readCatalog();
    clock = 61_000;
    const served = await cached.readCatalog();
    expect(served.map((product) => product.id)).toEqual(["p1"]);
    expect(reported.some((message) => message.includes("EMPTY catalog"))).toBe(true);
  });

  it("does not let an empty read masquerade as a fresh snapshot", async () => {
    const source = upstream([[detail("p1")], [], [detail("p1"), detail("p2")]]);
    let clock = 0;
    const cached = new CachedProductCatalogReader(source.reader, {
      ttlMs: 60_000,
      now: () => clock,
      onError: () => {},
    });
    await cached.readCatalog();
    clock = 61_000;
    await cached.readCatalog(); // empty; held snapshot kept, NOT re-stamped
    clock = 62_000;
    const served = await cached.readCatalog(); // still past TTL -> refresh again
    expect(source.calls()).toBe(3);
    expect(served.length).toBe(2);
  });

  it("accepts an empty catalog when there is nothing to protect", async () => {
    const source = upstream([[]]);
    const cached = new CachedProductCatalogReader(source.reader, {
      onError: () => {},
    });
    await expect(cached.readCatalog()).resolves.toEqual([]);
  });
});
