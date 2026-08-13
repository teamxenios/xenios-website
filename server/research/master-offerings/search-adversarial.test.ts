import { describe, expect, it } from "vitest";
import { noMasterOfferingCommerce } from "./customer-projection";
import { matchMasterOfferings, scoreMasterOffering } from "./search";
import {
  InMemoryMasterOfferingCatalogReader,
  MasterOfferingCatalogService,
} from "./service";
import { offering, variant } from "./test-fixtures";

/**
 * Search takes free text from a browser. These are the inputs that break a
 * naive implementation: a query used as a regex, a query long enough to make
 * matching quadratic, a homoglyph that should still match, and a punctuation
 * form the buyer actually types.
 */

const CATALOG = [
  offering({
    id: "mo_bpc",
    slug: "bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    aliases: ["BPC 157", "Body Protection Compound"],
    variants: [variant({ id: "mov_bpc", label: "5 mg vial" })],
  }),
  offering({
    id: "mo_nad",
    slug: "nad-plus",
    displayName: "NAD+",
    canonicalName: "NAD+",
    aliases: ["NAD plus"],
    family: "supplements",
    variants: [variant({ id: "mov_nad", label: "100 mg vial" })],
  }),
  offering({
    id: "mo_ta1",
    slug: "thymosin-alpha-1",
    displayName: "Thymosin α-1",
    canonicalName: "Thymosin alpha 1",
    aliases: ["TA-1"],
    variants: [variant({ id: "mov_ta1", label: "10 mg vial" })],
  }),
];

function service(): MasterOfferingCatalogService {
  return new MasterOfferingCatalogService(
    new InMemoryMasterOfferingCatalogReader(CATALOG),
    noMasterOfferingCommerce,
  );
}

describe("adversarial: search input", () => {
  it("treats a regular expression as text, not as a pattern", async () => {
    const catalog = service();
    for (const hostile of [
      ".*",
      "^BPC",
      "BPC.*157",
      "(a+)+$",
      "[",
      "\\",
      "b{1,10}",
      "(?:)",
    ]) {
      const page = await catalog.list({ q: hostile });
      // The normalizer strips every non-alphanumeric, so a metacharacter can
      // never reach a matcher. It either matches literally or matches nothing,
      // and it never throws.
      expect(page.ok).toBe(true);
      expect(page.total).toBeLessThanOrEqual(CATALOG.length);
    }
  });

  it("does not blow up on a catastrophic-backtracking shape", async () => {
    const started = Date.now();
    const page = await service().list({ q: `${"a".repeat(120)}!`.slice(0, 160) });
    expect(page.total).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("matches the punctuation forms a buyer actually types", async () => {
    const catalog = service();
    // bpc157 is the one that used to match nothing: it normalizes to a single
    // token that is not a substring of "bpc 157".
    for (const query of ["BPC-157", "BPC 157", "bpc157", "  BPC   157  "]) {
      expect((await catalog.list({ q: query })).total).toBeGreaterThanOrEqual(1);
    }
    for (const query of ["NAD+", "NAD plus", "nad"]) {
      const page = await catalog.list({ q: query });
      expect(page.products.some((card) => card.id === "mo_nad")).toBe(true);
    }
  });

  it("folds the Greek alpha a supplier writes and a buyer does not", async () => {
    const catalog = service();
    for (const query of ["Thymosin alpha 1", "thymosin α-1", "TA-1"]) {
      const page = await catalog.list({ q: query });
      expect(page.products.some((card) => card.id === "mo_ta1")).toBe(true);
    }
  });

  it("normalizes compatibility forms so a pasted query still matches", async () => {
    // Full-width characters and a non-breaking space survive a copy and paste
    // out of a spreadsheet or a PDF.
    const page = await service().list({ q: "ＢＰＣ 157" });
    expect(page.products.some((card) => card.id === "mo_bpc")).toBe(true);
  });

  it("returns everything for a query that normalizes to nothing", async () => {
    const catalog = service();
    for (const query of ["   ", "!!!", "---", "@@@"]) {
      expect((await catalog.list({ q: query })).total).toBe(CATALOG.length);
    }
  });

  it("requires every token, so a longer query narrows rather than widens", async () => {
    const catalog = service();
    expect((await catalog.list({ q: "bpc" })).total).toBe(1);
    expect((await catalog.list({ q: "bpc 157" })).total).toBe(1);
    expect((await catalog.list({ q: "bpc 157 unicorn" })).total).toBe(0);
  });

  it("treats a separator-free spelling of the exact name as exact", () => {
    expect(scoreMasterOffering(CATALOG[0], "bpc157")).toBe(
      scoreMasterOffering(CATALOG[0], "BPC-157"),
    );
    expect(scoreMasterOffering(CATALOG[1], "nadplus")).toBe(
      scoreMasterOffering(CATALOG[1], "NAD+"),
    );
  });

  it("ranks an exact name above an incidental token match", async () => {
    const exact = scoreMasterOffering(CATALOG[0], "BPC-157");
    const partial = scoreMasterOffering(CATALOG[0], "vial");
    expect(exact).not.toBeNull();
    expect(partial).not.toBeNull();
    expect(exact as number).toBeGreaterThan(partial as number);
  });

  it("is deterministic and order independent for equal scores", () => {
    const forward = matchMasterOfferings(CATALOG, { q: "vial" }).map((p) => p.id);
    const reversed = matchMasterOfferings([...CATALOG].reverse(), {
      q: "vial",
    }).map((p) => p.id);
    expect(forward).toEqual(reversed);
  });

  it("keeps filters and search independent of one another", async () => {
    const catalog = service();
    expect(
      (await catalog.list({ q: "vial", families: ["supplements"] })).total,
    ).toBe(1);
    expect(
      (await catalog.list({ q: "bpc", families: ["supplements"] })).total,
    ).toBe(0);
    expect(
      (await catalog.list({ states: ["coming_soon"] })).total,
    ).toBe(0);
  });
});
