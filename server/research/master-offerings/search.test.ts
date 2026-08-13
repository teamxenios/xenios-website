import { describe, expect, it } from "vitest";
import { queryMasterOfferings, scoreMasterOffering } from "./search";
import { offering, variant } from "./test-fixtures";

describe("master offering search", () => {
  const bpc = offering();
  const nad = offering({
    id: "mo_nad",
    slug: "research-vials-nad-plus",
    canonicalKey: "research_vials|nad plus",
    displayName: "NAD+",
    canonicalName: "NAD+",
    aliases: ["NAD plus", "nicotinamide adenine dinucleotide"],
    variants: [variant({ id: "mov_nad", label: "500 mg vial", displayState: "planned" })],
    displayState: "planned",
  });
  const creatine = offering({
    id: "mo_creatine",
    slug: "supplements-momentous-creatine",
    canonicalKey: "supplements|momentous|creatine",
    displayName: "Creatine",
    canonicalName: "Creatine",
    family: "supplements",
    category: "Supplements",
    brand: "Momentous",
    aliases: ["Creatine monohydrate"],
    variants: [variant({ id: "mov_creatine", label: "90 servings", displayState: "planned" })],
    displayState: "planned",
  });

  it("tolerates punctuation and plus-sign differences", () => {
    expect(scoreMasterOffering(bpc, "BPC 157")).not.toBeNull();
    expect(scoreMasterOffering(bpc, "BPC-157")).not.toBeNull();
    expect(scoreMasterOffering(nad, "NAD plus")).not.toBeNull();
    expect(scoreMasterOffering(nad, "NAD+")).not.toBeNull();
  });

  it("searches names, aliases, brands, variants, categories, and families", () => {
    const products = [bpc, nad, creatine];
    expect(queryMasterOfferings(products, { q: "Momentous" }).products.map((p) => p.slug)).toEqual([creatine.slug]);
    expect(queryMasterOfferings(products, { q: "90 servings" }).products.map((p) => p.slug)).toEqual([creatine.slug]);
    expect(queryMasterOfferings(products, { q: "nicotinamide" }).products.map((p) => p.slug)).toEqual([nad.slug]);
  });

  it("applies closed family and state filters and caps page size", () => {
    const result = queryMasterOfferings([bpc, nad, creatine], {
      families: ["supplements"],
      states: ["planned"],
      pageSize: 1000,
    });
    expect(result.pageSize).toBe(100);
    expect(result.total).toBe(1);
    expect(result.products[0].slug).toBe(creatine.slug);
  });

  it("returns a stable empty page when a requested page is beyond the result set", () => {
    const result = queryMasterOfferings([bpc], { page: 9, pageSize: 1 });
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.products).toEqual([]);
  });
});
