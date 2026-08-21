/**
 * Chunking for PostgREST `.in()` id lists.
 *
 * MEASURED, NOT THEORETICAL (browser-perf proof, 2026-08-21): at 217 published
 * products a single `.in()` querystring is ~7.7KB, and a proxy with the common
 * 8KB request-line default answers **414 and kills the whole catalog** — the
 * local Kong sidecar did exactly that. Production is within ~10 products of
 * its own limit, so one bigger `.in()` is a cliff waiting for the next
 * catalog addition.
 *
 * So every bulk read that filters by an id set runs one query per chunk and
 * concatenates. 100 ids ≈ 3.7KB of querystring — half the smallest common
 * limit — and per-entity row ordering is unaffected because every row of one
 * entity lives in exactly the chunk that carries that entity's id.
 */

export const IN_FILTER_CHUNK_SIZE = 100;

export function chunkIds(
  ids: readonly string[],
  size: number = IN_FILTER_CHUNK_SIZE,
): readonly (readonly string[])[] {
  if (ids.length <= size) return [ids];
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size));
  }
  return chunks;
}

/** Run one bulk read per chunk, sequentially-safe via Promise.all, flattened. */
export async function readInChunks<T>(
  ids: readonly string[],
  read: (chunk: readonly string[]) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.all(chunkIds(ids).map((chunk) => read(chunk)));
  return results.flat();
}
