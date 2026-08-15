/**
 * Sort and facet proofs against the real generated catalog.
 *
 * The synthetic 1,121 shaped catalog in catalog-completeness.test.ts proves the
 * shape at scale and always runs. This file proves the same properties against
 * the actual workbook output, where names collide, categories cross families,
 * and the display states are distributed the way the real business is rather
 * than the way a fixture generator is.
 *
 * The generated dataset is not committed, so this suite skips when it is
 * absent. Generate it with:
 *   python scripts/research/export-master-offerings.py <workbook>
 *   npx tsx scripts/research/build-master-offerings.ts \
 *     .local/research/master-offerings/private-intake.json
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MASTER_OFFERING_SORTS,
  isMasterOfferingCategorySlug,
  type MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import { loadMasterOfferingDataset } from "./dataset-reader";
import type { NormalizedMasterOffering } from "./model";
import {
  masterOfferingCategorySlug,
  matchMasterOfferings,
  matchMasterOfferingsWithFacets,
  queryMasterOfferings,
  warmMasterOfferingSearch,
} from "./search";
import { offering, variant } from "./test-fixtures";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";

// The same resolution the server uses, so this suite exercises the dataset the
// deployment would actually serve. It was written against the gitignored
// .local build, which meant it skipped on any machine that had not run the
// pipeline. The committed artifact removed that condition, and the .local path
// stays last so a local rebuild can still be pointed at deliberately.
const DATASET_PATH = [
  process.env.XENIOS_MASTER_OFFERINGS_DATASET,
  path.resolve(process.cwd(), MASTER_OFFERINGS_COMMITTED_DATASET_PATH),
  path.resolve(
    process.cwd(),
    ".local/research/master-offerings/generated/member-safe-master-offerings.generated.json",
  ),
].find((candidate) => typeof candidate === "string" && fs.existsSync(candidate)) ?? "";

/**
 * The counts the catalog ingestion contract verified independently against the
 * MASTER CATALOG workbook: 420 selected rows, each exactly one offering.
 */
const MEMBER_OFFERINGS = 420;
const ADMIN_HOLDS = 11;

const available = fs.existsSync(DATASET_PATH);
const withRealCatalog = available ? describe : describe.skip;

function loadCatalog(): readonly NormalizedMasterOffering[] {
  const raw = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8")) as unknown;
  const products = loadMasterOfferingDataset(raw).products;
  warmMasterOfferingSearch(products);
  return products;
}

/**
 * The real catalog plus eleven admin-only offerings shaped like the holds the
 * builder drops. The generated file contains no hold at all, so injecting them
 * is the only way to prove the counter refuses one rather than merely never
 * meeting one.
 */
function withInjectedHolds(
  products: readonly NormalizedMasterOffering[],
): readonly NormalizedMasterOffering[] {
  const holds = Array.from({ length: ADMIN_HOLDS }, (_unused, index) =>
    offering({
      id: `mo_injected_hold_${index}`,
      slug: `injected-hold-${index}`,
      displayName: `Injected hold ${index}`,
      family: "provider_network",
      category: "Confidential Provider Roster",
      visibility: "admin_only",
      displayState: "planned",
      variants: [
        variant({
          id: `mov_injected_hold_${index}`,
          visibility: "admin_only",
          displayState: "planned",
        }),
      ],
    }),
  );
  return [...products, ...holds];
}

function sum(buckets: readonly { count: number }[]): number {
  return buckets.reduce((total, bucket) => total + bucket.count, 0);
}

withRealCatalog("the real generated catalog", () => {
  const CATALOG = available ? loadCatalog() : [];

  it("is the catalog the ingestion contract verified", () => {
    expect(CATALOG).toHaveLength(MEMBER_OFFERINGS);
    expect(matchMasterOfferings(CATALOG)).toHaveLength(MEMBER_OFFERINGS);
  });

  it("pages the whole catalog exactly once under every sort", () => {
    for (const sort of MASTER_OFFERING_SORTS) {
      for (const pageSize of [24, 100]) {
        const seen = new Set<string>();
        let duplicates = 0;
        const first = queryMasterOfferings(CATALOG, { sort, page: 1, pageSize });
        expect(first.total).toBe(MEMBER_OFFERINGS);
        expect(first.totalPages).toBe(Math.ceil(MEMBER_OFFERINGS / pageSize));
        expect(first.sort).toBe(sort);
        for (let page = 1; page <= first.totalPages; page += 1) {
          const current = queryMasterOfferings(CATALOG, { sort, page, pageSize });
          expect(current.products.length).toBeLessThanOrEqual(pageSize);
          for (const card of current.products) {
            if (seen.has(card.id)) duplicates += 1;
            seen.add(card.id);
          }
        }
        // Both halves of the paging bug, stated separately: nothing repeated,
        // nothing dropped.
        expect(duplicates).toBe(0);
        expect(seen.size).toBe(MEMBER_OFFERINGS);
      }
    }
  });

  it("pages a filtered, searched catalog exactly once under every sort", () => {
    const query: MasterOfferingCatalogQuery = {
      q: "capsule",
      states: ["care_pathway"],
    };
    for (const sort of MASTER_OFFERING_SORTS) {
      const total = matchMasterOfferings(CATALOG, query).length;
      expect(total).toBeGreaterThan(24);
      const seen = new Set<string>();
      const pageSize = 7;
      const pages = Math.ceil(total / pageSize);
      for (let page = 1; page <= pages; page += 1) {
        for (const card of queryMasterOfferings(CATALOG, {
          ...query,
          sort,
          page,
          pageSize,
        }).products) {
          expect(seen.has(card.id)).toBe(false);
          seen.add(card.id);
        }
      }
      expect(seen.size).toBe(total);
    }
  });

  it("sorts by availability with the strongest states first", () => {
    // The display-only launch carries three states, and the shared rank orders
    // them approval_required, then request_access, then care_pathway. When
    // Product Control data opens real availability, available_now rows will
    // take the front and this pin moves with them deliberately.
    const ordered = matchMasterOfferings(CATALOG, { sort: "availability" });
    expect(ordered[0].displayState).toBe("approval_required");
    expect(ordered[ordered.length - 1].displayState).toBe("care_pathway");
    const firstCare = ordered.findIndex(
      (product) => product.displayState === "care_pathway",
    );
    // Every state that outranks care_pathway comes before every care row.
    expect(
      ordered.slice(firstCare).every((p) => p.displayState === "care_pathway"),
    ).toBe(true);
  });

  it("mirrors the name sorts exactly", () => {
    const ascending = matchMasterOfferings(CATALOG, { sort: "name_asc" }).map(
      (product) => product.id,
    );
    const descending = matchMasterOfferings(CATALOG, { sort: "name_desc" }).map(
      (product) => product.id,
    );
    expect(descending).toEqual([...ascending].reverse());
  });

  it("leaves the shipped ordering untouched by default", () => {
    const shipped = [...CATALOG]
      .filter((product) => product.visibility === "member")
      .sort((left, right) =>
        `${left.displayName}|${left.slug}`.localeCompare(
          `${right.displayName}|${right.slug}`,
        ),
      )
      .map((product) => product.id);
    expect(matchMasterOfferings(CATALOG).map((product) => product.id)).toEqual(
      shipped,
    );
  });

  it("publishes a category vocabulary the parser accepts", () => {
    const { facets } = matchMasterOfferingsWithFacets(CATALOG);
    expect(facets.categories.length).toBeGreaterThan(1);
    for (const bucket of facets.categories) {
      // Whatever the server publishes, the server must accept back. A chip the
      // route would answer with a 400 is a self inconsistent API.
      expect(isMasterOfferingCategorySlug(bucket.value)).toBe(true);
      expect(bucket.label.trim()).not.toBe("");
    }
    // The real workbook categories that carry separators and a leading digit
    // survive the round trip, which is the reason the wire value is a slug.
    const ampersandCategory = facets.categories.find((bucket) =>
      bucket.label.includes("&"),
    );
    expect(ampersandCategory?.value).toBe("research-peptides-materials");
    const digitCategory = facets.categories.find((bucket) =>
      bucket.label.startsWith("503A"),
    );
    expect(digitCategory?.value).toBe("503a-clinical-formulations");
  });

  it("sums every facet to the size of the catalog it describes", () => {
    const unfiltered = matchMasterOfferingsWithFacets(CATALOG);
    expect(sum(unfiltered.facets.families)).toBe(MEMBER_OFFERINGS);
    expect(sum(unfiltered.facets.states)).toBe(MEMBER_OFFERINGS);
    expect(sum(unfiltered.facets.categories)).toBe(MEMBER_OFFERINGS);

    const filtered = matchMasterOfferingsWithFacets(CATALOG, {
      families: ["supplements"],
    });
    // The family facet ignores its own selection, so it still describes the
    // whole catalog; the others are scoped to the selection.
    expect(sum(filtered.facets.families)).toBe(MEMBER_OFFERINGS);
    expect(sum(filtered.facets.states)).toBe(filtered.matches.length);
    expect(sum(filtered.facets.categories)).toBe(filtered.matches.length);

    const searched = matchMasterOfferingsWithFacets(CATALOG, { q: "peptide" });
    expect(searched.matches.length).toBeGreaterThan(0);
    expect(sum(searched.facets.families)).toBe(searched.matches.length);
    expect(sum(searched.facets.states)).toBe(searched.matches.length);
    expect(sum(searched.facets.categories)).toBe(searched.matches.length);
  });

  it("agrees with the filter it advertises, bucket by bucket", () => {
    const { facets } = matchMasterOfferingsWithFacets(CATALOG);
    for (const bucket of facets.families) {
      expect(matchMasterOfferings(CATALOG, { families: [bucket.value] })).toHaveLength(
        bucket.count,
      );
    }
    for (const bucket of facets.states) {
      expect(matchMasterOfferings(CATALOG, { states: [bucket.value] })).toHaveLength(
        bucket.count,
      );
    }
    for (const bucket of facets.categories) {
      expect(
        matchMasterOfferings(CATALOG, { categories: [bucket.value] }),
      ).toHaveLength(bucket.count);
    }
  });

  it("keeps eleven injected holds out of every page, filter, and count", () => {
    const withHolds = withInjectedHolds(CATALOG);
    expect(withHolds).toHaveLength(MEMBER_OFFERINGS + ADMIN_HOLDS);

    const { matches, facets } = matchMasterOfferingsWithFacets(withHolds);
    expect(matches).toHaveLength(MEMBER_OFFERINGS);
    expect(sum(facets.families)).toBe(MEMBER_OFFERINGS);
    expect(sum(facets.states)).toBe(MEMBER_OFFERINGS);
    expect(sum(facets.categories)).toBe(MEMBER_OFFERINGS);

    const heldSlug = masterOfferingCategorySlug(withHolds[MEMBER_OFFERINGS]);
    expect(facets.categories.map((bucket) => bucket.value)).not.toContain(heldSlug);
    expect(facets.families.find((bucket) => bucket.value === "provider_network")
      ?.count).toBe(0);

    // Asking for the hold's own family or category returns nothing, so a probe
    // cannot distinguish "held" from "does not exist".
    expect(
      matchMasterOfferings(withHolds, { families: ["provider_network"] }),
    ).toHaveLength(0);
    expect(matchMasterOfferings(withHolds, { categories: [heldSlug] })).toHaveLength(
      0,
    );
    for (const sort of MASTER_OFFERING_SORTS) {
      const ids = matchMasterOfferings(withHolds, { sort }).map((p) => p.id);
      expect(ids.some((id) => id.startsWith("mo_injected_hold_"))).toBe(false);
    }
  });

  it("counts every facet in one traversal of eleven hundred offerings", () => {
    let traversals = 0;
    const counted = {
      [Symbol.iterator]() {
        traversals += 1;
        return CATALOG[Symbol.iterator]();
      },
    } as unknown as readonly NormalizedMasterOffering[];
    matchMasterOfferingsWithFacets(counted, {
      q: "vitamin",
      families: ["supplements"],
      states: ["planned"],
    });
    expect(traversals).toBe(1);
  });
});

describe.skipIf(available)("the real generated catalog", () => {
  it("is not generated on this machine", () => {
    // A visible skip rather than a silent one, so nobody reads a green run as
    // proof the real catalog was exercised.
    expect(available).toBe(false);
  });
});
