/**
 * The 414 guard: no `.in()` id list may approach a proxy's 8KB request-line
 * default. Measured 2026-08-21 (browser-perf proof): 217 UUID-sized ids ≈
 * 7.7KB of querystring, and a default-configured Kong answered 414 — killing
 * the whole catalog, not one product. These tests pin the chunk bound and
 * that chunked reads reassemble to exactly the unchunked answer.
 */

import { describe, expect, it } from "vitest";
import { IN_FILTER_CHUNK_SIZE, chunkIds, readInChunks } from "./chunked-ids";

const UUID_LENGTH = 36;

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

describe("chunkIds", () => {
  it("keeps every chunk's querystring well under the smallest common proxy limit", () => {
    // 217 is the measured production-scale catalog that overran the limit.
    for (const chunk of chunkIds(ids(217))) {
      expect(chunk.length).toBeLessThanOrEqual(IN_FILTER_CHUNK_SIZE);
      // `in.(a,b,c)` — each id plus a separator. Half of 8KB leaves the rest
      // of the URL and headers all the room they could need.
      expect(chunk.length * (UUID_LENGTH + 1)).toBeLessThanOrEqual(4096);
    }
  });

  it("partitions without loss, duplication, or reordering", () => {
    const all = ids(217);
    expect(chunkIds(all).flat()).toEqual(all);
    expect(chunkIds([])).toEqual([[]]);
    expect(chunkIds(all, 217)).toEqual([all]);
  });

  it("reassembles chunked reads into exactly the unchunked answer", async () => {
    const all = ids(250);
    const rows = new Map(all.map((id, index) => [id, { id, index }]));
    const chunkSizes: number[] = [];
    const read = async (chunk: readonly string[]) => {
      chunkSizes.push(chunk.length);
      return chunk.map((id) => rows.get(id)!);
    };
    const chunked = await readInChunks(all, read);
    expect(chunked).toEqual(all.map((id) => rows.get(id)));
    expect(chunkSizes).toEqual([100, 100, 50]);
  });
});
