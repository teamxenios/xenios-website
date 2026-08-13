import { describe, expect, it } from "vitest";
import { MASTER_OFFERING_FAMILIES } from "@shared/research/master-offerings/contract";
import { noMasterOfferingCommerce } from "./customer-projection";
import type { NormalizedMasterOffering } from "./model";
import { matchMasterOfferings } from "./search";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { offering, variant } from "./test-fixtures";

/**
 * The frozen catalog foundation independently verified 1,121 member-safe
 * offerings, 1,181 member-safe variants, and 11 admin-only holds. This builds a
 * catalog of exactly that shape so the display lane can prove it shows every
 * member-safe offering and none of the holds, at that scale rather than on a
 * two-row fixture.
 */
const MEMBER_OFFERINGS = 1121;
const MEMBER_VARIANTS = 1181;
const ADMIN_HOLDS = 11;

function buildFoundationShapedCatalog(): readonly NormalizedMasterOffering[] {
  const extraVariants = MEMBER_VARIANTS - MEMBER_OFFERINGS;
  const products: NormalizedMasterOffering[] = [];
  for (let index = 0; index < MEMBER_OFFERINGS; index += 1) {
    const family = MASTER_OFFERING_FAMILIES[index % MASTER_OFFERING_FAMILIES.length];
    const variants = [variant({ id: `mov_${index}_a`, label: "5 mg vial" })];
    if (index < extraVariants) {
      variants.push(variant({ id: `mov_${index}_b`, label: "10 mg vial" }));
    }
    products.push(
      offering({
        id: `mo_${index}`,
        slug: `offering-${index}`,
        displayName: `Offering ${String(index).padStart(4, "0")}`,
        canonicalName: `Offering ${index}`,
        family,
        variants,
      }),
    );
  }
  for (let index = 0; index < ADMIN_HOLDS; index += 1) {
    products.push(
      offering({
        id: `mo_hold_${index}`,
        slug: `hold-${index}`,
        displayName: `Held offering ${index}`,
        visibility: "admin_only",
        variants: [
          variant({ id: `mov_hold_${index}`, visibility: "admin_only" }),
        ],
      }),
    );
  }
  return products;
}

const CATALOG = buildFoundationShapedCatalog();

function service(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader(CATALOG),
    noMasterOfferingCommerce,
  );
}

describe("every member-safe offering is viewable", () => {
  it("counts exactly the member-safe offerings and no admin-only hold", async () => {
    expect(CATALOG).toHaveLength(MEMBER_OFFERINGS + ADMIN_HOLDS);
    expect(matchMasterOfferings(CATALOG)).toHaveLength(MEMBER_OFFERINGS);
    expect(
      matchMasterOfferings(CATALOG).reduce(
        (total, product) => total + product.variants.length,
        0,
      ),
    ).toBe(MEMBER_VARIANTS);
    expect(await service().count({})).toBe(MEMBER_OFFERINGS);
  });

  it("returns every member-safe offering exactly once across all pages", async () => {
    const catalog = service();
    const pageSize = 100;
    const seen = new Set<string>();
    const first = await catalog.list({ page: 1, pageSize });
    expect(first.total).toBe(MEMBER_OFFERINGS);
    expect(first.totalPages).toBe(Math.ceil(MEMBER_OFFERINGS / pageSize));
    for (let page = 1; page <= first.totalPages; page += 1) {
      const current = await catalog.list({ page, pageSize });
      for (const card of current.products) {
        expect(seen.has(card.id)).toBe(false);
        seen.add(card.id);
      }
    }
    expect(seen.size).toBe(MEMBER_OFFERINGS);
  });

  it("never leaks an admin-only hold into a page, a filter, or an export", async () => {
    const catalog = service();
    const exported = await catalog.priceList({
      query: {},
      audience: "member",
      generatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.document.rowCount).toBe(MEMBER_VARIANTS);
    const ids = exported.document.rows.map((row) => row.offeringId).join(" ");
    expect(ids).not.toContain("mo_hold_");
    const held = await catalog.detail("hold-0");
    expect(held).toBeNull();
  });

  it("keeps every family reachable through the family filter", async () => {
    const catalog = service();
    let total = 0;
    for (const family of MASTER_OFFERING_FAMILIES) {
      total += await catalog.count({ families: [family] });
    }
    expect(total).toBe(MEMBER_OFFERINGS);
  });

  // The search memo is asserted deterministically in search-memo.test.ts by
  // counting normalizer calls. A wall-clock budget here failed at 2041ms
  // against a 2000ms limit under full-suite load, which is a test that trains
  // people to rerun rather than one that catches a regression.

  it("refuses an export larger than the ceiling instead of truncating it", async () => {
    const result = await service().priceList({
      query: {},
      audience: "member",
      generatedAt: "2026-08-12T00:00:00.000Z",
      maxRows: 10,
    });
    expect(result).toEqual({
      ok: false,
      code: "too_large",
      rowCount: MEMBER_VARIANTS,
      maxRows: 10,
    });
  });
});
