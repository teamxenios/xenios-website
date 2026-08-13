import { describe, expect, it } from "vitest";
import { KRIS_CHANNELS, KRIS_FAMILIES } from "@shared/research/kris-launch-a/contract";
import {
  KRIS_MAX_PAGE_SIZE,
  matchKrisCatalog,
  normalizeKrisText,
  resolveKrisSort,
  scoreKrisProduct,
  selectKrisCatalog,
} from "./search";
import type { KrisProductRecord } from "./dataset-reader";
import { krisProduct } from "./test-fixtures";

const BPC = krisProduct({
  id: "kli_bpc",
  slug: "research-peptides-and-materials-bpc-157",
  displayName: "BPC-157",
  specification: "BPC-157 5MG",
  family: "research_peptides_and_materials",
  channel: "ruo_research",
});
const NAD = krisProduct({
  id: "kli_nad",
  slug: "research-peptides-and-materials-nad-plus",
  displayName: "NAD+",
  specification: "NAD+ 500MG",
  family: "research_peptides_and_materials",
  channel: "ruo_research",
});
const TABLET = krisProduct({
  id: "kli_anastrozole",
  slug: "clinical-formulations-503a-anastrozole-tablet",
  displayName: "Anastrozole Tablet",
  specification: "ANASTROZOLE TABLET 1MG",
  family: "clinical_formulations_503a",
  channel: "clinical_provider_only",
});
const SYRINGES = krisProduct({
  id: "kli_syringes",
  slug: "shipping-and-fulfillment-syringes-and-alcohol-swabs",
  displayName: "Syringes & Alcohol Swabs",
  specification: "Syringes & Alcohol Swabs",
  family: "shipping_and_fulfillment",
  channel: "clinical_provider_only",
  suppliedNote: "Price pending.",
});

const CATALOG: readonly KrisProductRecord[] = [BPC, NAD, TABLET, SYRINGES];

const AMOUNTS: Record<string, number | null> = {
  kli_bpc: 4500,
  kli_nad: 12000,
  kli_anastrozole: 165,
  kli_syringes: null,
};
const priceAmountOf = (id: string): number | null => AMOUNTS[id] ?? null;

describe("text matching", () => {
  it("folds punctuation the way a buyer types it", () => {
    expect(normalizeKrisText("BPC-157")).toBe("bpc 157");
    expect(normalizeKrisText("NAD+")).toBe("nad plus");
    expect(normalizeKrisText("Syringes & Alcohol Swabs")).toBe(
      "syringes and alcohol swabs",
    );
  });

  it("finds a code however it is spaced or punctuated", () => {
    for (const query of ["BPC-157", "bpc 157", "bpc157"]) {
      expect(scoreKrisProduct(BPC, query)).toBeGreaterThan(0);
    }
    expect(scoreKrisProduct(TABLET, "bpc157")).toBeNull();
  });

  it("scores an exact name above a specification hit", () => {
    const exact = scoreKrisProduct(TABLET, "Anastrozole Tablet") ?? 0;
    const inSpec = scoreKrisProduct(TABLET, "1mg") ?? 0;
    expect(exact).toBeGreaterThan(inSpec);
  });

  it("requires every token, so an unrelated word excludes the product", () => {
    expect(scoreKrisProduct(BPC, "bpc tablet")).toBeNull();
  });

  it("matches nothing on a query no product carries", () => {
    expect(matchKrisCatalog(CATALOG, { q: "zzzz" }).matches).toHaveLength(0);
  });
});

describe("filters and facets", () => {
  it("filters by family and by channel", () => {
    expect(
      matchKrisCatalog(CATALOG, { families: ["clinical_formulations_503a"] }).matches,
    ).toEqual([TABLET]);
    expect(
      matchKrisCatalog(CATALOG, { channels: ["ruo_research"] }).matches.map((p) => p.id),
    ).toEqual(["kli_bpc", "kli_nad"]);
  });

  it("publishes every family and channel, including the empty ones", () => {
    const { facets } = matchKrisCatalog(CATALOG);
    expect(facets.families.map((bucket) => bucket.value)).toEqual([...KRIS_FAMILIES]);
    expect(facets.channels.map((bucket) => bucket.value)).toEqual([...KRIS_CHANNELS]);
    expect(facets.families.find((b) => b.value === "supplements")?.count).toBe(0);
  });

  it("counts each facet excluding its OWN selection and applying the others", () => {
    const { facets } = matchKrisCatalog(CATALOG, { channels: ["ruo_research"] });
    // The channel facet answers "what would I get if I switched", so the
    // unselected channels still carry their counts.
    expect(facets.channels.find((b) => b.value === "clinical_provider_only")?.count).toBe(
      2,
    );
    // The family facet stays scoped to the selected channel.
    expect(
      facets.families.find((b) => b.value === "research_peptides_and_materials")?.count,
    ).toBe(2);
    expect(facets.families.find((b) => b.value === "clinical_formulations_503a")?.count).toBe(
      0,
    );
  });

  it("keeps the text query out of the facets entirely", () => {
    const { facets } = matchKrisCatalog(CATALOG, { q: "bpc" });
    const total = facets.families.reduce((sum, bucket) => sum + bucket.count, 0);
    expect(total).toBe(1);
  });
});

describe("sorting", () => {
  it("defaults to relevance, and an unknown sort falls back to it", () => {
    expect(resolveKrisSort({})).toBe("relevance");
    expect(resolveKrisSort({ sort: "sideways" as never })).toBe("relevance");
  });

  it("orders by name in both directions", () => {
    const asc = matchKrisCatalog(CATALOG, { sort: "name_asc" }).matches.map(
      (p) => p.displayName,
    );
    const desc = matchKrisCatalog(CATALOG, { sort: "name_desc" }).matches.map(
      (p) => p.displayName,
    );
    expect(asc).toEqual(["Anastrozole Tablet", "BPC-157", "NAD+", "Syringes & Alcohol Swabs"]);
    expect(desc).toEqual(asc.slice().reverse());
  });

  it("puts a pending price LAST in both price directions", () => {
    // Not cheapest and not dearest. An absent price is not a position on the
    // scale, so it leaves the scale, identically whichever way the member looks.
    const asc = matchKrisCatalog(CATALOG, { sort: "price_asc" }, priceAmountOf).matches;
    const desc = matchKrisCatalog(CATALOG, { sort: "price_desc" }, priceAmountOf).matches;
    expect(asc.map((p) => p.id)).toEqual([
      "kli_anastrozole",
      "kli_bpc",
      "kli_nad",
      "kli_syringes",
    ]);
    expect(desc.map((p) => p.id)).toEqual([
      "kli_nad",
      "kli_bpc",
      "kli_anastrozole",
      "kli_syringes",
    ]);
  });

  it("reads no price at all unless a price sort asked for one", () => {
    let reads = 0;
    matchKrisCatalog(CATALOG, { sort: "name_asc" }, (id) => {
      reads += 1;
      return AMOUNTS[id] ?? null;
    });
    expect(reads).toBe(0);
  });

  it("is a TOTAL order under every sort, so no two rows can swap", () => {
    // Two products identical in everything the comparators read except their
    // unique id and slug. If the tie breaker were not total, their relative
    // order would depend on input order, which is exactly what makes paging
    // repeat or skip rows.
    const twins = [
      krisProduct({ id: "kli_twin_b", slug: "twin-b", displayName: "Twin", specification: "TWIN" }),
      krisProduct({ id: "kli_twin_a", slug: "twin-a", displayName: "Twin", specification: "TWIN" }),
    ];
    for (const sort of ["relevance", "name_asc", "name_desc", "price_asc", "price_desc"] as const) {
      const forward = matchKrisCatalog(twins, { sort }, () => 100).matches.map((p) => p.id);
      const backward = matchKrisCatalog(
        twins.slice().reverse(),
        { sort },
        () => 100,
      ).matches.map((p) => p.id);
      expect(forward).toEqual(backward);
    }
  });
});

describe("paging", () => {
  const many = Array.from({ length: 57 }, (_, index) =>
    krisProduct({
      id: `kli_page${String(index).padStart(3, "0")}`,
      slug: `page-item-${index}`,
      displayName: `Item ${String(index).padStart(3, "0")}`,
    }),
  );

  it("defaults to 24 per page and clamps an oversized request", () => {
    expect(selectKrisCatalog(many).pageSize).toBe(24);
    expect(selectKrisCatalog(many, { pageSize: 5_000 }).pageSize).toBe(
      KRIS_MAX_PAGE_SIZE,
    );
  });

  it("reports total and totalPages for the whole match set, not the page", () => {
    const selection = selectKrisCatalog(many, { pageSize: 10, page: 2 });
    expect(selection.total).toBe(57);
    expect(selection.totalPages).toBe(6);
    expect(selection.products).toHaveLength(10);
  });

  it("returns an empty page past the end rather than wrapping", () => {
    expect(selectKrisCatalog(many, { pageSize: 10, page: 99 }).products).toHaveLength(0);
  });

  it("pages through everything exactly once under every sort", () => {
    for (const sort of ["relevance", "name_asc", "name_desc", "price_asc", "price_desc"] as const) {
      const seen: string[] = [];
      for (let page = 1; page <= 6; page += 1) {
        const selection = selectKrisCatalog(
          many,
          { sort, page, pageSize: 10 },
          (id) => id.charCodeAt(id.length - 1) * 7,
        );
        seen.push(...selection.products.map((product) => product.id));
      }
      expect(seen).toHaveLength(57);
      expect(new Set(seen).size).toBe(57);
    }
  });
});
