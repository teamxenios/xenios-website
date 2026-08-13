import { describe, expect, it, vi } from "vitest";

/**
 * The search memo, asserted deterministically.
 *
 * The first version of this guard measured wall-clock time and failed at
 * 2041ms against a 2000ms budget under full-suite parallel load. A timing
 * threshold tight enough to catch the regression is also tight enough to fail
 * on a busy machine, which makes it worse than no test: it trains people to
 * rerun until green.
 *
 * Counting normalizer calls instead is exact. Without the memo, every search
 * normalizes every offering, so the count grows with the catalog on every
 * query. With it, the catalog is normalized once and each later query
 * normalizes only itself.
 */

const calls = { normalizeOfferingText: 0 };

vi.mock("./normalize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./normalize")>();
  return {
    ...actual,
    normalizeOfferingText: (value: unknown) => {
      calls.normalizeOfferingText += 1;
      return actual.normalizeOfferingText(value);
    },
  };
});

const { MASTER_OFFERING_FAMILIES } = await import(
  "@shared/research/master-offerings/contract"
);
const { matchMasterOfferings, warmMasterOfferingSearch } = await import("./search");
const { offering, variant } = await import("./test-fixtures");

const CATALOG_SIZE = 400;

const CATALOG = Array.from({ length: CATALOG_SIZE }, (_unused, index) =>
  offering({
    id: `mo_${index}`,
    slug: `offering-${index}`,
    displayName: `Offering ${String(index).padStart(4, "0")}`,
    canonicalName: `Offering ${index}`,
    family: MASTER_OFFERING_FAMILIES[index % MASTER_OFFERING_FAMILIES.length],
    variants: [variant({ id: `mov_${index}`, label: "5 mg vial" })],
  }),
);

describe("search memoization", () => {
  it("normalizes the catalog once, then only the query", () => {
    calls.normalizeOfferingText = 0;
    warmMasterOfferingSearch(CATALOG);
    const warmCost = calls.normalizeOfferingText;
    // One normalize per offering to build its haystack, plus one inside the
    // possessive-aware tokenizer for each.
    expect(warmCost).toBeGreaterThanOrEqual(CATALOG_SIZE);

    calls.normalizeOfferingText = 0;
    for (let round = 0; round < 20; round += 1) {
      matchMasterOfferings(CATALOG, { q: `offering ${round}` });
    }
    const searchCost = calls.normalizeOfferingText;

    // Twenty searches over four hundred offerings would be at least eight
    // thousand normalizer calls without the memo. With it, the work is per
    // query and independent of catalog size.
    expect(searchCost).toBeLessThan(CATALOG_SIZE);
    expect(searchCost / 20).toBeLessThan(10);
  });

  it("does not grow the per-query cost as the catalog grows", () => {
    const small = CATALOG.slice(0, 50);
    warmMasterOfferingSearch(small);
    warmMasterOfferingSearch(CATALOG);

    calls.normalizeOfferingText = 0;
    matchMasterOfferings(small, { q: "offering 0001" });
    const smallCost = calls.normalizeOfferingText;

    calls.normalizeOfferingText = 0;
    matchMasterOfferings(CATALOG, { q: "offering 0001" });
    const largeCost = calls.normalizeOfferingText;

    // Eight times the catalog, the same query cost. That is the property the
    // memo exists for, stated without a stopwatch.
    expect(largeCost).toBe(smallCost);
  });

  it("re-normalizes an offering that was never warmed", () => {
    const fresh = offering({ id: "mo_fresh", slug: "fresh", displayName: "Fresh" });
    calls.normalizeOfferingText = 0;
    matchMasterOfferings([fresh], { q: "fresh" });
    const first = calls.normalizeOfferingText;
    calls.normalizeOfferingText = 0;
    matchMasterOfferings([fresh], { q: "fresh" });
    // The first pass pays for the haystack; the second does not. A memo that
    // never hit would show the same cost twice.
    expect(calls.normalizeOfferingText).toBeLessThan(first);
  });
});
