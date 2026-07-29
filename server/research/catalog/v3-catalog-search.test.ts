import { describe, expect, it } from "vitest";
import {
  compareV3PreviewProfiles,
  readV3PreviewDetail,
  searchV3PreviewCatalog,
} from "./v3-catalog-search";

describe("V3 preview search and comparison", () => {
  it("searches names, aliases, keywords, and categories", () => {
    expect(searchV3PreviewCatalog({ query: "bremelanotide" }).items).toHaveLength(
      1,
    );
    expect(searchV3PreviewCatalog({ query: "diagnostics" }).total).toBe(11);
    expect(searchV3PreviewCatalog({ query: "daily foundation" }).total).toBe(
      15,
    );
  });

  it("filters by kind, category, and truthful availability", () => {
    expect(
      searchV3PreviewCatalog({
        kind: "pathway_profile",
        category: "Research pathways",
        availability: "information_only",
      }).total,
    ).toBe(3);
    expect(
      searchV3PreviewCatalog({
        kind: "supplement_profile",
        availability: "coming_soon",
      }).total,
    ).toBe(15);
  });

  it("sorts without mutating the canonical catalog order", () => {
    const descending = searchV3PreviewCatalog({
      sort: "name_descending",
    }).items;
    const ascending = searchV3PreviewCatalog({
      sort: "name_ascending",
    }).items;
    expect(descending[0].displayName.localeCompare(descending[1].displayName)).toBe(
      1,
    );
    expect(ascending[0].displayName.localeCompare(ascending[1].displayName)).toBe(
      -1,
    );
    expect(searchV3PreviewCatalog().items[0].sortOrder).toBe(0);
  });

  it("compares at most four unique exact profiles in requested order", () => {
    const compared = compareV3PreviewProfiles([
      "omega-3",
      "daily-multi",
      "omega-3",
      "magnesium-complex",
      "electrolyte-complex",
      "creatine-monohydrate",
    ]);
    expect(compared.map((item) => item.slug)).toEqual([
      "omega-3",
      "daily-multi",
      "magnesium-complex",
      "electrolyte-complex",
    ]);
  });

  it("returns exact detail or null without fabricating a fallback", () => {
    expect(readV3PreviewDetail("biomarker-center")?.displayName).toBe(
      "Biomarker Center",
    );
    expect(readV3PreviewDetail("not-a-profile")).toBeNull();
  });
});
