import { describe, expect, it } from "vitest";
import { EARLY_ACCESS_CATALOG_CATEGORIES } from "./catalog-category";
import { GUIDE_INTERESTS, GUIDE_TOPICS, catalogGuideResult, type GuideCard } from "./catalog-guide";

const cardsOf = (answers: unknown): readonly GuideCard[] => {
  const result = catalogGuideResult(answers);
  return result.fullCatalog ? [] : result.cards;
};

describe("catalog guide mapping", () => {
  it.each([
    [undefined], [null], ["clinical"], [[]], [{}],
    [{ audience: "pet" }], [{ style: "phone" }], [{ next: "buy" }],
    [{ interests: "clinical" }], [{ interests: ["weight loss"] }], [{ topics: ["sleep"] }],
    [{ goal: "energy" }], [{ interests: ["clinical"], symptoms: ["fatigue"] }],
    [{ interests: ["unsure"] }], [{ next: "full_catalog", interests: ["clinical"] }],
  ])("opens the full catalog for %j", (answers) => {
    expect(catalogGuideResult(answers)).toEqual({ fullCatalog: true });
  });

  it("maps each interest to exactly one of the four category views", () => {
    const seen = new Set<string>();
    for (const interest of GUIDE_INTERESTS.filter((value) => value !== "unsure")) {
      const categories = cardsOf({ interests: [interest] }).filter((card) => card.kind === "category");
      expect(categories).toHaveLength(1);
      const category = (categories[0] as Extract<GuideCard, { kind: "category" }>).category;
      expect(EARLY_ACCESS_CATALOG_CATEGORIES).toContain(category);
      seen.add(category);
    }
    expect([...seen].sort()).toEqual([...EARLY_ACCESS_CATALOG_CATEGORIES].sort());
  });

  it("never returns more than three cards, and never a product", () => {
    const all = { audience: "organization", interests: [...GUIDE_INTERESTS], topics: [...GUIDE_TOPICS], style: "talk", next: "help" };
    const cards = cardsOf(all);
    expect(cards.length).toBeLessThanOrEqual(3);
    for (const card of cards) expect(["category", "faq", "organization", "support"]).toContain(card.kind);
    expect(JSON.stringify(cards)).not.toMatch(/productId|variantId|slug|mo_|mov_/);
  });

  it("gives every card a reason", () => {
    for (const card of cardsOf({ interests: ["clinical", "laboratory"], topics: ["quality"] })) expect(card.reason.length).toBeGreaterThan(0);
  });

  it("does not depend on answer order or repeats", () => {
    expect(catalogGuideResult({ interests: ["laboratory", "clinical"] }))
      .toEqual(catalogGuideResult({ interests: ["clinical", "laboratory", "clinical"] }));
  });

  it("keeps laboratory research a research view, never a treatment", () => {
    const cards = cardsOf({ audience: "self", interests: ["laboratory"] });
    const view = cards.find((card) => card.kind === "category") as Extract<GuideCard, { kind: "category" }>;
    expect(view.category).toBe("research_peptides");
    expect(view.reason).toContain("Research Use Only are for laboratory research, not human or veterinary use");
    expect(JSON.stringify(cards)).not.toMatch(/treat|symptom|goal|dose|benefit/i);
  });

  it("routes organizations to the business page and help to support", () => {
    expect(cardsOf({ audience: "organization" })).toEqual([expect.objectContaining({ kind: "organization", href: "/research/organizations" })]);
    expect(cardsOf({ next: "help" })).toEqual([expect.objectContaining({ kind: "support", href: "/research/support" })]);
  });
});
