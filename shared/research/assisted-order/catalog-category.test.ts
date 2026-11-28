import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMasterOfferingFamily } from "../master-offerings/contract";
import {
  EARLY_ACCESS_CATALOG_CATEGORIES, EARLY_ACCESS_CATEGORY_FAMILY, TOPICAL_CATALOG_FORMS,
  catalogCategoryFromSearch, catalogQueryForCategory, isAssistedOrderCatalogPresentation, isTopicalCatalogForm,
} from "./catalog-category";

describe("category links", () => {
  it.each(EARLY_ACCESS_CATALOG_CATEGORIES)("accepts ?category=%s alone", (category) => {
    expect(catalogCategoryFromSearch(`?category=${category}`)).toBe(category);
    expect(catalogCategoryFromSearch(`category=${category}`)).toBe(category);
  });
  it.each([
    "", "?", "?category=", "?category=Supplements", "?category=supplements%20", "?category=%20supplements",
    "?category=topical", "?category=peptides", "?category=clinical_formulations_503a",
    "?category=supplements&category=supplements", "?category=supplements&category=topicals",
    "?category=supplements&utm_source=home", "?ref=x&category=supplements", "?family=supplements",
    "?Category=supplements",
    "?family=supplements&slug=x&variant=v&qty=1&intent=request_quote",
  ])("returns null for %j, so the ordinary catalog opens", (search) => {
    expect(catalogCategoryFromSearch(search)).toBeNull();
  });
  it("maps three categories to one real family each and topicals to the topical presentation", () => {
    for (const family of Object.values(EARLY_ACCESS_CATEGORY_FAMILY)) expect(isMasterOfferingFamily(family)).toBe(true);
    expect(catalogQueryForCategory("clinical")).toEqual({ family: "clinical_formulations_503a" });
    expect(catalogQueryForCategory("research_peptides")).toEqual({ family: "research_peptides_materials" });
    expect(catalogQueryForCategory("supplements")).toEqual({ family: "supplements" });
    expect(catalogQueryForCategory("topicals")).toEqual({ presentation: "topicals" });
    expect(isAssistedOrderCatalogPresentation("topicals")).toBe(true);
    expect(isAssistedOrderCatalogPresentation("Topicals")).toBe(false);
    expect(isAssistedOrderCatalogPresentation("creams")).toBe(false);
  });
  it("treats only the exact topical form values as topical", () => {
    for (const form of TOPICAL_CATALOG_FORMS) expect(isTopicalCatalogForm(form)).toBe(true);
    for (const form of ["Solution", "topical cream", "Topical Cream ", "Capsule", "Lyophilized Vial", "", null, undefined]) {
      expect(isTopicalCatalogForm(form)).toBe(false);
    }
  });
});

describe("topical membership in the shipped catalog dataset", () => {
  type Row = { id: string; family: string; subcategory: string | null; variants: { id: string }[] };
  const dataset = JSON.parse(readFileSync(new URL(
    "../../../server/research/master-offerings/data/member-safe-master-offerings.generated.json", import.meta.url), "utf8")) as { products: Row[] };
  const topical = dataset.products.filter((row) => isTopicalCatalogForm(row.subcategory));

  // The exact membership a ?category=topicals link opens, before any viewer or hold scoping.
  // A change to the dataset's forms must change this list on purpose.
  const TOPICAL_IDS = [
    "mo_0be4f713aeab92ee8a18",
    "mo_2b828a36cdb0c41766b3",
    "mo_3ce7a55d619cc3921800",
    "mo_3d043e2a35ceaa045986",
    "mo_493b3d5a7aeeaa81df5b",
    "mo_510176c449623185709c",
    "mo_52375140d27fb5ea05e5",
    "mo_597123caca97b0680a1d",
    "mo_6f038acdd134b7f91ef4",
    "mo_7b02c6c157d0dd81f9cd",
    "mo_85333819f0419b09c591",
    "mo_899dabe026510b4a5d8c",
    "mo_8c30b8e7afa6f5aa08f7",
    "mo_90738c1f17934a557b28",
    "mo_95b724aa9a1b0cebaf02",
    "mo_9c4e4a0e5ad273733807",
    "mo_a0d07fd81da710a95e3b",
    "mo_a1fcb7f19d45389c0881",
    "mo_a795e8418c3d6a7a78b7",
    "mo_aa9e5754187361b07ce3",
    "mo_b1a47ddceb680dead7d1",
    "mo_b2c16be50b550aae5a41",
    "mo_b7dcd84743d97b069cf5",
    "mo_b95ade79821018d8cd22",
    "mo_c100778b39a735f70686",
    "mo_c50b5f1d259a7f6dea01",
    "mo_c9c3aa9e5613ca970ef4",
    "mo_cd193eb5a09726090ad9",
    "mo_ddfac143bec7ba76663c",
    "mo_ec8335d4636f1efe50b4",
    "mo_f3107dd5a39ed82eb00e",
  ];
  it("is the 31 rows whose form says topical, across two families", () => {
    expect(topical.map((row) => row.id).sort()).toEqual(TOPICAL_IDS);
    expect(topical).toHaveLength(31);
    const byFamily = Object.fromEntries(["clinical_formulations_503a", "topicals_regenerative"].map((family) =>
      [family, topical.filter((row) => row.family === family).length]));
    expect(byFamily).toEqual({ clinical_formulations_503a: 28, topicals_regenerative: 3 });
    expect(topical.every((row) => row.family === "clinical_formulations_503a" || row.family === "topicals_regenerative")).toBe(true);
  });
  it("leaves out every Solution row, whatever its name says", () => {
    const solutions = dataset.products.filter((row) => row.subcategory === "Solution");
    expect(solutions.length).toBeGreaterThan(0);
    expect(solutions.some((row) => isTopicalCatalogForm(row.subcategory))).toBe(false);
  });
});
