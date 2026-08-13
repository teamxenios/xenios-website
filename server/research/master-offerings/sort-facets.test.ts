import { describe, expect, it } from "vitest";
import {
  DEFAULT_MASTER_OFFERING_SORT,
  MASTER_OFFERING_DISPLAY_STATES,
  MASTER_OFFERING_FAMILIES,
  MASTER_OFFERING_SORTS,
  isMasterOfferingCategorySlug,
  isMasterOfferingSort,
  type MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import type { NormalizedMasterOffering } from "./model";
import {
  parseMasterOfferingCatalogQuery,
  parseMasterOfferingPriceListQuery,
} from "./routes";
import {
  masterOfferingCategorySlug,
  matchMasterOfferings,
  matchMasterOfferingsWithFacets,
  queryMasterOfferings,
} from "./search";
import { offering, variant } from "./test-fixtures";

/**
 * A small catalog whose family, state, and category axes are deliberately not
 * aligned with one another, because a facet bug only shows when the axes cross.
 */
const CATALOG: readonly NormalizedMasterOffering[] = [
  offering({
    id: "mo_a",
    slug: "research-vials-alpha",
    displayName: "Alpha",
    family: "research_vials",
    category: "Peptides & Research",
    displayState: "available_now",
    variants: [variant({ id: "mov_a" })],
  }),
  offering({
    id: "mo_b",
    slug: "research-vials-bravo",
    displayName: "Bravo",
    family: "research_vials",
    category: "Competitor Expansion Candidate",
    displayState: "planned",
    variants: [variant({ id: "mov_b", displayState: "planned" })],
  }),
  offering({
    id: "mo_c",
    slug: "supplements-charlie",
    displayName: "Charlie",
    family: "supplements",
    category: "Supplements",
    displayState: "planned",
    variants: [variant({ id: "mov_c", displayState: "planned" })],
  }),
  offering({
    id: "mo_d",
    slug: "diagnostics-delta",
    displayName: "Delta",
    family: "diagnostics",
    category: "AI, Tracking & Education",
    displayState: "request_access",
    variants: [variant({ id: "mov_d", displayState: "request_access" })],
  }),
  offering({
    id: "mo_hold",
    slug: "provider-network-held",
    displayName: "Held provider",
    family: "provider_network",
    category: "Care & Telemedicine",
    displayState: "planned",
    visibility: "admin_only",
    variants: [
      variant({ id: "mov_hold", visibility: "admin_only", displayState: "planned" }),
    ],
  }),
];

function ids(query: MasterOfferingCatalogQuery = {}): string[] {
  return matchMasterOfferings(CATALOG, query).map((product) => product.id);
}

function counts(
  buckets: readonly { value: string; count: number }[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const bucket of buckets) result[bucket.value] = bucket.count;
  return result;
}

function sum(buckets: readonly { count: number }[]): number {
  return buckets.reduce((total, bucket) => total + bucket.count, 0);
}

describe("catalog sort vocabulary", () => {
  it("is closed and rejects a column name", () => {
    expect([...MASTER_OFFERING_SORTS]).toEqual([
      "relevance",
      "name_asc",
      "name_desc",
      "availability",
    ]);
    expect(isMasterOfferingSort("name_asc")).toBe(true);
    for (const rejected of [
      "displayName",
      "slug",
      "price",
      "newest",
      "NAME_ASC",
      "name_asc ",
      "",
      null,
      undefined,
      1,
      ["name_asc"],
    ]) {
      expect(isMasterOfferingSort(rejected)).toBe(false);
    }
  });

  it("defaults to the ordering the catalog already shipped", () => {
    expect(DEFAULT_MASTER_OFFERING_SORT).toBe("relevance");
    // No sort key and the default sort key must be the same response, or every
    // caller that never asked for a sort would silently get a new order.
    expect(ids({})).toEqual(ids({ sort: "relevance" }));
    expect(ids({})).toEqual(["mo_a", "mo_b", "mo_c", "mo_d"]);
  });

  it("orders by name in both directions, as exact mirrors", () => {
    const ascending = ids({ sort: "name_asc" });
    const descending = ids({ sort: "name_desc" });
    expect(ascending).toEqual(["mo_a", "mo_b", "mo_c", "mo_d"]);
    expect(descending).toEqual([...ascending].reverse());
  });

  it("orders by availability using the display state rank", () => {
    expect(ids({ sort: "availability" })).toEqual([
      "mo_a", // available_now
      "mo_d", // request_access
      "mo_b", // planned, then alphabetical inside the state
      "mo_c",
    ]);
  });

  it("ranks a relevance query above the tie breaker", () => {
    // "Charlie" is an exact name match, so relevance lifts it over the
    // alphabetical order that would otherwise put Alpha first.
    expect(ids({ q: "charlie" })).toEqual(["mo_c"]);
    const scored = ids({ q: "a" });
    expect(scored[0]).toBe("mo_a");
  });

  it("falls back to the default when handed a sort outside the vocabulary", () => {
    // The route parser refuses this first. This is the second line: a
    // programmatic caller cannot reach an undefined comparator.
    const rogue = { sort: "toString" } as unknown as MasterOfferingCatalogQuery;
    expect(ids(rogue)).toEqual(ids({}));
  });

  it("echoes the applied sort on the page", () => {
    expect(queryMasterOfferings(CATALOG, {}).sort).toBe("relevance");
    expect(queryMasterOfferings(CATALOG, { sort: "name_desc" }).sort).toBe(
      "name_desc",
    );
  });
});

describe("paging stability under every sort", () => {
  it("shows each offering exactly once across pages, in every sort", () => {
    for (const sort of MASTER_OFFERING_SORTS) {
      const seen: string[] = [];
      for (let page = 1; page <= 4; page += 1) {
        const result = queryMasterOfferings(CATALOG, { sort, page, pageSize: 1 });
        expect(result.total).toBe(4);
        expect(result.totalPages).toBe(4);
        seen.push(...result.products.map((card) => card.id));
      }
      expect(new Set(seen).size).toBe(4);
      expect(seen).toEqual(ids({ sort }));
    }
  });

  it("keeps a total order when display names collide", () => {
    const twins = [
      offering({ id: "mo_x", slug: "same-name-x", displayName: "Same" }),
      offering({ id: "mo_y", slug: "same-name-y", displayName: "Same" }),
    ];
    for (const sort of MASTER_OFFERING_SORTS) {
      const forward = matchMasterOfferings(twins, { sort }).map((p) => p.id);
      const reversed = matchMasterOfferings([...twins].reverse(), { sort }).map(
        (p) => p.id,
      );
      // The same two offerings in the opposite input order must page the same
      // way, or page boundaries depend on how the reader happened to load them.
      expect(forward).toEqual(reversed);
    }
  });
});

describe("category filter", () => {
  it("slugs a category that the multi value encoding could not carry raw", () => {
    // The real workbook category contains a comma, which is the separator the
    // list parser splits on. That is why the wire value is a slug.
    expect(masterOfferingCategorySlug(CATALOG[3])).toBe("ai-tracking-education");
    expect(masterOfferingCategorySlug(CATALOG[0])).toBe("peptides-research");
  });

  it("filters on the published slug", () => {
    expect(ids({ categories: ["supplements"] })).toEqual(["mo_c"]);
    expect(ids({ categories: ["peptides-research", "supplements"] })).toEqual([
      "mo_a",
      "mo_c",
    ]);
  });

  it("answers an unknown but well formed slug with an empty page, not an error", () => {
    // The vocabulary is data owned, so a slug can go stale under a client. An
    // empty page is truthful; a 400 would punish a caller for the workbook
    // changing underneath it.
    expect(ids({ categories: ["a-category-that-never-existed"] })).toEqual([]);
  });

  it("counts both raw categories that fold onto one slug, and labels it stably", () => {
    // Two different workbook labels can slug identically. Neither of these
    // exists in the catalog today, but the behavior has to be defined rather
    // than discovered.
    const labels = ["Care & Telemedicine", "Care, Telemedicine"];
    const folded = [
      offering({ id: "mo_p", slug: "p", displayName: "P", category: labels[0] }),
      offering({ id: "mo_q", slug: "q", displayName: "Q", category: labels[1] }),
    ];
    expect(masterOfferingCategorySlug(folded[0])).toBe(
      masterOfferingCategorySlug(folded[1]),
    );
    const slug = masterOfferingCategorySlug(folded[0]);
    const { facets } = matchMasterOfferingsWithFacets(folded);
    const care = facets.categories.filter((bucket) => bucket.value === slug);
    expect(care).toHaveLength(1);
    // The count is exact because the filter uses the same slug, so the two are
    // selected together and never half counted.
    expect(care[0].count).toBe(2);
    // The label is the lexicographically first of the folded labels, so the
    // response does not depend on catalog order.
    expect(care[0].label).toBe(
      [...labels].sort((left, right) => left.localeCompare(right))[0],
    );
    expect(matchMasterOfferings(folded, { categories: [slug] })).toHaveLength(2);
  });
});

describe("facet counts", () => {
  it("counts the whole member catalog when nothing is filtered", () => {
    const { facets } = matchMasterOfferingsWithFacets(CATALOG);
    expect(sum(facets.families)).toBe(4);
    expect(sum(facets.states)).toBe(4);
    expect(sum(facets.categories)).toBe(4);
    expect(counts(facets.families).research_vials).toBe(2);
    expect(counts(facets.states).planned).toBe(2);
    expect(counts(facets.categories).supplements).toBe(1);
  });

  it("excludes a facet's own selection from its own counts", () => {
    const { matches, facets } = matchMasterOfferingsWithFacets(CATALOG, {
      families: ["supplements"],
    });
    expect(matches).toHaveLength(1);
    // The family counts still answer "what would I get if I switched", so the
    // other families keep their full counts.
    expect(counts(facets.families)).toMatchObject({
      supplements: 1,
      research_vials: 2,
      diagnostics: 1,
    });
    expect(sum(facets.families)).toBe(4);
    // Every other facet is scoped by the active family selection.
    expect(sum(facets.states)).toBe(1);
    expect(sum(facets.categories)).toBe(1);
    expect(counts(facets.states).planned).toBe(1);
  });

  it("applies every other active filter to each facet", () => {
    const { facets } = matchMasterOfferingsWithFacets(CATALOG, {
      families: ["research_vials"],
      states: ["planned"],
    });
    // Families ignore the family selection but honor the state one.
    expect(counts(facets.families)).toMatchObject({
      research_vials: 1,
      supplements: 1,
      diagnostics: 0,
    });
    // States ignore the state selection but honor the family one.
    expect(counts(facets.states)).toMatchObject({
      planned: 1,
      available_now: 1,
      request_access: 0,
    });
    // Categories honor both.
    expect(sum(facets.categories)).toBe(1);
  });

  it("treats the text query as a filter on every facet, not as a facet", () => {
    const { matches, facets } = matchMasterOfferingsWithFacets(CATALOG, {
      q: "charlie",
    });
    expect(matches).toHaveLength(1);
    expect(sum(facets.families)).toBe(1);
    expect(sum(facets.states)).toBe(1);
    expect(sum(facets.categories)).toBe(1);
  });

  it("publishes the full closed vocabularies, including the zero counts", () => {
    const { facets } = matchMasterOfferingsWithFacets(CATALOG, { q: "charlie" });
    expect(facets.families.map((bucket) => bucket.value)).toEqual([
      ...MASTER_OFFERING_FAMILIES,
    ]);
    expect(new Set(facets.states.map((bucket) => bucket.value))).toEqual(
      new Set(MASTER_OFFERING_DISPLAY_STATES),
    );
    // Strongest state first, the same rank the availability sort uses.
    expect(facets.states[0].value).toBe("available_now");
    expect(facets.states[facets.states.length - 1].value).toBe("unavailable");
  });

  it("publishes the whole member category vocabulary regardless of the query", () => {
    // This is what lets a client learn the category slugs from the server
    // rather than hardcoding a workbook's labels.
    const all = matchMasterOfferingsWithFacets(CATALOG).facets.categories;
    const narrowed = matchMasterOfferingsWithFacets(CATALOG, {
      q: "charlie",
    }).facets.categories;
    expect(narrowed.map((bucket) => bucket.value)).toEqual(
      all.map((bucket) => bucket.value),
    );
    expect(narrowed.map((bucket) => bucket.label)).toEqual([
      "AI, Tracking & Education",
      "Competitor Expansion Candidate",
      "Peptides & Research",
      "Supplements",
    ]);
  });

  it("never counts an admin hold in any facet", () => {
    const { matches, facets } = matchMasterOfferingsWithFacets(CATALOG);
    expect(matches.map((product) => product.id)).not.toContain("mo_hold");
    expect(counts(facets.families).provider_network).toBe(0);
    // The hold's category exists nowhere in the vocabulary, so its presence
    // cannot be inferred from a chip, a label, or a count.
    const heldSlug = masterOfferingCategorySlug(CATALOG[4]);
    expect(heldSlug).toBe("care-telemedicine");
    expect(facets.categories.map((bucket) => bucket.value)).not.toContain(heldSlug);
    expect(facets.categories.map((bucket) => bucket.label)).not.toContain(
      "Care & Telemedicine",
    );
    expect(sum(facets.families) + sum(facets.states) + sum(facets.categories)).toBe(
      12,
    );
  });

  it("counts every facet in a single traversal of the catalog", () => {
    // The claim this lane makes is that facets cost no extra scan. Counting
    // traversals states it exactly, with no stopwatch to go flaky under load.
    let traversals = 0;
    const counted = {
      [Symbol.iterator]() {
        traversals += 1;
        return CATALOG[Symbol.iterator]();
      },
    } as unknown as readonly NormalizedMasterOffering[];
    matchMasterOfferingsWithFacets(counted, {
      q: "a",
      families: ["research_vials"],
      states: ["planned"],
      categories: ["peptides-research"],
    });
    expect(traversals).toBe(1);
  });
});

describe("query parsing keeps the closed posture", () => {
  const parse = (query: Record<string, unknown>) =>
    parseMasterOfferingCatalogQuery({ query } as never);

  it("still refuses an unknown key", () => {
    expect(parse({ order: "name" })).toBeNull();
    expect(parse({ sortBy: "name_asc" })).toBeNull();
    expect(parse({ category: "supplements" })).toBeNull();
  });

  it("accepts a sort from the vocabulary and refuses anything else", () => {
    expect(parse({ sort: "availability" })).toEqual({ sort: "availability" });
    expect(parse({})).toEqual({});
    for (const rejected of [
      "displayName",
      "name_asc,name_desc",
      "NAME_ASC",
      "price desc",
      ["name_asc"],
    ]) {
      expect(parse({ sort: rejected })).toBeNull();
    }
  });

  it("accepts well formed category slugs and refuses malformed ones", () => {
    expect(parse({ categories: "supplements,peptides-research" })).toEqual({
      categories: ["supplements", "peptides-research"],
    });
    for (const rejected of [
      "Supplements",
      "peptides & research",
      "../../etc/passwd",
      "-leading-dash",
      "with_underscore",
      "a".repeat(65),
      "select%20*",
      "café",
    ]) {
      expect(parse({ categories: rejected })).toBeNull();
    }
  });

  it("caps how many category tokens one request may carry", () => {
    const many = Array.from({ length: 24 }, (_unused, index) => `c-${index}`);
    expect(parse({ categories: many.join(",") })).not.toBeNull();
    expect(parse({ categories: [...many, "c-24"].join(",") })).toBeNull();
  });

  it("lets the price list export take the filters but not the sort", () => {
    const withCategory = parseMasterOfferingPriceListQuery({
      query: { categories: "supplements", format: "csv" },
    } as never);
    expect(withCategory).toEqual({
      query: { categories: ["supplements"] },
      format: "csv",
    });
    // An export is an artifact people diff, so its row order is canonical.
    expect(
      parseMasterOfferingPriceListQuery({
        query: { sort: "name_asc", format: "csv" },
      } as never),
    ).toBeNull();
  });

  it("keeps the category slug guard aligned with what the server publishes", () => {
    for (const product of CATALOG) {
      expect(isMasterOfferingCategorySlug(masterOfferingCategorySlug(product))).toBe(
        true,
      );
    }
  });
});
