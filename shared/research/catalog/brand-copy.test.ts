import { describe, expect, it } from "vitest";
import {
  BRAND_CATALOG,
  BRAND_CLASSIFICATIONS,
  BRANDS,
  brandProducts,
  countsByBrand,
  countsByClassification,
  humanSupplementListing,
} from "./brand-catalog";
import {
  BRAND_COPY,
  brandsMissingCopy,
  CLASSIFICATION_COPY,
  classificationsMissingCopy,
  findBrandCopy,
  findClassificationCopy,
  requireBrandCopy,
  requireClassificationCopy,
  type BrandCopy,
  type ClassificationCopy,
} from "./brand-copy";

/** Escapes, not literals: this directory forbids both characters in every file. */
const EN_DASH = "\u2013";
const EM_DASH = "\u2014";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function brandFields(copy: BrandCopy): Array<[string, string]> {
  return [
    ["positioning", copy.positioning],
    ["overview", copy.overview],
    ["whatWeHold", copy.whatWeHold],
  ];
}

function classificationFields(copy: ClassificationCopy): Array<[string, string]> {
  return [
    ["label", copy.label],
    ["line", copy.line],
  ];
}

function everyLine(): Array<[string, string, string]> {
  return [
    ...BRAND_COPY.flatMap((copy) =>
      brandFields(copy).map(([field, text]) => [copy.brand, field, text] as [string, string, string]),
    ),
    ...CLASSIFICATION_COPY.flatMap((copy) =>
      classificationFields(copy).map(
        ([field, text]) => [copy.classification, field, text] as [string, string, string],
      ),
    ),
  ];
}

/**
 * The patterns that would turn catalog description into a claim, a dose, or an
 * unsourced fact. Every one of these is something the master catalog does not give
 * us, so writing it would mean inventing it.
 */
const BANNED: ReadonlyArray<[string, RegExp]> = [
  ["an amount with a unit", /\b\d+(\.\d+)?\s?(mg|mcg|g|iu|ml|kg|oz)\b/i],
  ["a dose", /\bdos(e|es|age|ing)\b/i],
  ["a serving size", /\bserving/i],
  ["a treatment claim", /\btreat/i],
  ["a cure claim", /\bcure/i],
  ["a prevention claim", /\bprevent/i],
  ["a diagnosis", /\bdiagnos/i],
  ["a disease reference", /\bdisease/i],
  ["a proof claim", /\bclinically proven\b/i],
  ["a regulatory claim", /\bFDA\b/],
  ["a healing claim", /\bheal(s|ing|ed)?\b/i],
  ["a guarantee", /\bguarantee/i],
  ["an instruction to take something", /\btake (this|it|one|two)\b/i],
  ["an ingredient panel reference", /\bcontains \d/i],
];

/**
 * Marketing register. These are the words a brand uses about itself, and repeating
 * them would be borrowing someone else's positioning rather than writing our own.
 */
const MARKETING_REGISTER: ReadonlyArray<[string, RegExp]> = [
  ["a superlative", /\b(best|finest|world class|leading|number one|unrivalled|unrivaled)\b/i],
  ["a purity claim", /\b(purest|highest quality|premium quality|pharmaceutical grade)\b/i],
  ["a trust claim", /\b(trusted by|doctor recommended|physician formulated)\b/i],
  ["a gold standard claim", /\bgold standard\b/i],
  ["a hype word", /\b(revolutionary|breakthrough|cutting edge|game chang)/i],
  ["a purchase prompt", /\b(add to cart|buy now|shop now|order today)\b/i],
];

describe("coverage", () => {
  it("writes one blurb per brand, once each, and no more", () => {
    expect(BRAND_COPY).toHaveLength(BRANDS.length);
    expect(BRAND_COPY.map((copy) => copy.brand)).toEqual([...BRANDS]);
    expect(new Set(BRAND_COPY.map((copy) => copy.brand)).size).toBe(4);
    expect(brandsMissingCopy()).toEqual([]);
  });

  it("writes one line per classification, once each, and no more", () => {
    expect(CLASSIFICATION_COPY).toHaveLength(BRAND_CLASSIFICATIONS.length);
    expect(CLASSIFICATION_COPY.map((copy) => copy.classification)).toEqual([
      ...BRAND_CLASSIFICATIONS,
    ]);
    expect(classificationsMissingCopy()).toEqual([]);
  });

  it("writes four brand blurbs for 911 rows, not 911 product descriptions", () => {
    expect(BRAND_CATALOG).toHaveLength(911);
    expect(BRAND_COPY.length + CLASSIFICATION_COPY.length).toBe(10);
  });

  it("takes the company name from the catalog rather than retyping it", () => {
    for (const copy of BRAND_COPY) {
      const rows = brandProducts(copy.brand);
      expect(rows.length).toBeGreaterThan(0);
      expect(copy.companyName.length).toBeGreaterThan(0);
    }
    expect(findBrandCopy("superpower")?.companyName).toBe("Superpower");
  });

  it("looks copy up and refuses to invent a fallback", () => {
    expect(findBrandCopy("momentous")?.positioning).toContain("smallest");
    expect(findBrandCopy("not-a-brand")).toBeUndefined();
    expect(() => requireBrandCopy("not-a-brand" as never)).toThrow(/No approved copy/);
    expect(findClassificationCopy("pet_supplement")?.label).toBe("Pet products");
    expect(findClassificationCopy("not-a-classification")).toBeUndefined();
    expect(() => requireClassificationCopy("nope" as never)).toThrow(/No approved copy/);
  });
});

describe("shape", () => {
  it("keeps every positioning line to a single sentence", () => {
    for (const copy of BRAND_COPY) {
      expect(sentences(copy.positioning), copy.brand).toHaveLength(1);
      expect(copy.positioning.length, copy.brand).toBeLessThanOrEqual(140);
    }
  });

  it("keeps every overview to two or three sentences", () => {
    for (const copy of BRAND_COPY) {
      const count = sentences(copy.overview).length;
      expect(count, `${copy.brand} overview`).toBeGreaterThanOrEqual(2);
      expect(count, `${copy.brand} overview`).toBeLessThanOrEqual(3);
    }
  });

  it("keeps every whatWeHold line to one or two sentences", () => {
    for (const copy of BRAND_COPY) {
      const count = sentences(copy.whatWeHold).length;
      expect(count, `${copy.brand} whatWeHold`).toBeGreaterThanOrEqual(1);
      expect(count, `${copy.brand} whatWeHold`).toBeLessThanOrEqual(2);
    }
  });

  it("keeps every classification line to one or two sentences and a short label", () => {
    for (const copy of CLASSIFICATION_COPY) {
      const count = sentences(copy.line).length;
      expect(count, `${copy.classification} line`).toBeGreaterThanOrEqual(1);
      expect(count, `${copy.classification} line`).toBeLessThanOrEqual(2);
      expect(copy.label.length, copy.classification).toBeLessThanOrEqual(40);
      expect(sentences(copy.label), copy.classification).toHaveLength(1);
    }
  });

  it("keeps house style: no em or en dashes in any line", () => {
    for (const [owner, field, text] of everyLine()) {
      expect(text.includes(EM_DASH), `${owner} ${field} em dash`).toBe(false);
      expect(text.includes(EN_DASH), `${owner} ${field} en dash`).toBe(false);
    }
  });
});

describe("nothing is claimed and nothing is invented", () => {
  it("carries none of the banned patterns", () => {
    for (const [owner, field, text] of everyLine()) {
      for (const [label, pattern] of BANNED) {
        expect(pattern.test(text), `${owner} ${field} contains ${label}`).toBe(false);
      }
    }
  });

  it("borrows no brand's marketing register", () => {
    for (const [owner, field, text] of everyLine()) {
      for (const [label, pattern] of MARKETING_REGISTER) {
        expect(pattern.test(text), `${owner} ${field} contains ${label}`).toBe(false);
      }
    }
  });

  it("describes no individual product from any of the four catalogs", () => {
    const lines = everyLine().map(([, , text]) => text.toLowerCase());
    const named: string[] = [];
    for (const product of BRAND_CATALOG) {
      // Short names are ordinary English words, so only names long enough to be
      // unambiguous are checked. A blurb quoting a real product name is the failure.
      if (product.canonicalName.length < 8) continue;
      const needle = product.canonicalName.toLowerCase();
      if (lines.some((line) => line.includes(needle))) {
        named.push(product.canonicalName);
      }
    }
    expect(named).toEqual([]);
  });
});

describe("the copy cannot drift away from the catalog", () => {
  it("quotes the real row count for every brand", () => {
    const counts = countsByBrand();
    for (const copy of BRAND_COPY) {
      const total = String(counts[copy.brand]);
      const joined = `${copy.positioning} ${copy.overview} ${copy.whatWeHold}`;
      expect(joined, `${copy.brand} should state its own row count`).toContain(total);
    }
  });

  it("quotes the real human supplement split for Life Extension", () => {
    const copy = requireBrandCopy("life_extension");
    const humanRows = humanSupplementListing().filter(
      (product) => product.brand === "life_extension",
    );
    expect(humanRows).toHaveLength(374);
    expect(copy.overview).toContain("374");
    expect(copy.overview).toContain("384");
  });

  it("quotes the real non supplement counts Life Extension carries", () => {
    const counts = countsByClassification();
    expect(counts.pet_supplement).toBe(2);
    expect(counts.personal_care).toBe(4);
    expect(counts.food_beverage).toBe(4);
    const copy = requireBrandCopy("life_extension");
    expect(copy.overview).toContain("two pet mixes");
    expect(copy.overview).toContain("four personal care items");
  });

  it("says Superpower is a service and is not offered", () => {
    const copy = requireBrandCopy("superpower");
    const joined = `${copy.positioning} ${copy.overview} ${copy.whatWeHold}`.toLowerCase();
    expect(joined).toContain("service");
    expect(joined).toContain("not offered");
    expect(joined).toContain("clinician");
    expect(joined).not.toContain("purchase");
  });

  it("names the pet exclusion as code, not convention", () => {
    const copy = requireClassificationCopy("pet_supplement");
    expect(copy.line.toLowerCase()).toContain("by code");
  });

  it("points the human supplement listing at exactly one classification", () => {
    const copy = requireClassificationCopy("human_supplement");
    expect(copy.line.toLowerCase()).toContain("only classification");
    for (const product of humanSupplementListing()) {
      expect(product.classification).toBe("human_supplement");
    }
  });
});
