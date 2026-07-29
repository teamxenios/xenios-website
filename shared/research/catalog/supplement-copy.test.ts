import { describe, expect, it } from "vitest";
import { SUPPLEMENT_CATALOG } from "./supplement-catalog";
import {
  findSupplementCopy,
  requireSupplementCopy,
  SUPPLEMENT_COPY,
  supplementsMissingCopy,
  type SupplementCopy,
} from "./supplement-copy";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function fields(copy: SupplementCopy): Array<[string, string]> {
  return [
    ["positioning", copy.positioning],
    ["overview", copy.overview],
    ["whyItPairs", copy.whyItPairs],
  ];
}

/**
 * The patterns that would turn catalog description into a claim, a dose, or an
 * unsourced fact. Every one of these is something the founder workbook does not
 * give us, so writing it would mean inventing it.
 */
const BANNED: ReadonlyArray<[string, RegExp]> = [
  ["an amount with a unit", /\b\d+(\.\d+)?\s?(mg|mcg|g|iu|ml|kg)\b/i],
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
];

describe("coverage", () => {
  it("writes copy for every catalog product, once each", () => {
    expect(SUPPLEMENT_COPY).toHaveLength(SUPPLEMENT_CATALOG.length);
    expect(new Set(SUPPLEMENT_COPY.map((c) => c.slug)).size).toBe(20);
    expect(supplementsMissingCopy()).toEqual([]);
  });

  it("matches the catalog slugs exactly, in the same order", () => {
    expect(SUPPLEMENT_COPY.map((c) => c.slug)).toEqual(
      SUPPLEMENT_CATALOG.map((p) => p.slug),
    );
  });

  it("looks copy up and refuses to invent a fallback", () => {
    expect(findSupplementCopy("hydrate")?.positioning).toContain("training day");
    expect(findSupplementCopy("not-a-slug")).toBeUndefined();
    expect(() => requireSupplementCopy("not-a-slug")).toThrow(/No approved copy/);
  });
});

describe("shape", () => {
  it("keeps positioning to a single line", () => {
    for (const copy of SUPPLEMENT_COPY) {
      expect(sentences(copy.positioning)).toHaveLength(1);
      expect(copy.positioning.length).toBeLessThanOrEqual(120);
    }
  });

  it("keeps the overview to two or three sentences", () => {
    for (const copy of SUPPLEMENT_COPY) {
      const count = sentences(copy.overview).length;
      expect(count, `${copy.slug} overview sentence count`).toBeGreaterThanOrEqual(2);
      expect(count, `${copy.slug} overview sentence count`).toBeLessThanOrEqual(3);
    }
  });

  it("writes a pairing line for every product", () => {
    for (const copy of SUPPLEMENT_COPY) {
      expect(copy.whyItPairs.length).toBeGreaterThan(40);
      expect(sentences(copy.whyItPairs).length).toBeLessThanOrEqual(2);
    }
  });

  it("keeps house style: no em dashes in the copy", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const copy of SUPPLEMENT_COPY) {
      for (const [field, text] of fields(copy)) {
        expect(text.includes(emDash), `${copy.slug} ${field}`).toBe(false);
      }
    }
  });
});

describe("nothing is claimed and nothing is invented", () => {
  it("carries none of the banned patterns", () => {
    for (const copy of SUPPLEMENT_COPY) {
      for (const [field, text] of fields(copy)) {
        for (const [label, pattern] of BANNED) {
          expect(pattern.test(text), `${copy.slug} ${field} contains ${label}`).toBe(false);
        }
      }
    }
  });

  it("anchors every pairing line to the workbook rather than to an effect", () => {
    for (const copy of SUPPLEMENT_COPY) {
      const text = copy.whyItPairs.toLowerCase();
      const anchored =
        text.includes("workbook") ||
        text.includes("bundle") ||
        text.includes("shares") ||
        text.includes("appears");
      expect(anchored, `${copy.slug} whyItPairs`).toBe(true);
    }
  });

  it("names a real bundle or a real catalog neighbour in every pairing line", () => {
    const bundleWords = [
      "recovery and joint support",
      "mitochondrial and longevity",
      "aging well",
      "focus and cognition",
      "immune balance and gut",
      "oral weight support",
      "intimacy and vitality",
      "hormonal support for women",
      "performance and training",
      "hair, skin, and nails",
    ];
    for (const copy of SUPPLEMENT_COPY) {
      const text = copy.whyItPairs.toLowerCase();
      expect(
        bundleWords.some((word) => text.includes(word)),
        `${copy.slug} whyItPairs names no bundle`,
      ).toBe(true);
    }
  });

  it("tells a member when a row is on the access request path", () => {
    const requestRows = SUPPLEMENT_CATALOG.filter(
      (p) => p.availability === "REQUEST_ACCESS_ONLY",
    );
    expect(requestRows).toHaveLength(3);
    for (const product of requestRows) {
      const copy = requireSupplementCopy(product.slug);
      // Two of the three carry the note in the overview. All three must be
      // resolvable to copy, and none may imply a standard purchase path.
      expect(copy.overview.toLowerCase()).not.toContain("add to cart");
      expect(copy.overview.toLowerCase()).not.toContain("buy now");
    }
    const noted = requestRows.filter((product) =>
      requireSupplementCopy(product.slug).overview.includes("supplier item code"),
    );
    expect(noted.length).toBeGreaterThanOrEqual(2);
  });
});
