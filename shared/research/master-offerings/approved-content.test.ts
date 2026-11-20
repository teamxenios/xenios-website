import { describe, expect, it } from "vitest";
import { reviewedBrowseSummary, type ReviewedProductContent } from "./approved-content";

describe("reviewed browse summary selection", () => {
  const full = "Complete synthetic explanation.\nMaterial synthetic warning remains in this fallback.";
  const content: ReviewedProductContent = Object.freeze({
    summary: full, overview: "Unchanged complete synthetic overview.",
    cautions: "Unchanged synthetic cautions.",
  });

  it("returns complete authored browse text without changing the full description or qualifier", () => {
    const browseSummary = "Synthetic laboratory material; effects in people are unestablished. Nonclinical use only.";
    const source = Object.freeze({ ...content, browseSummary });
    const before = JSON.stringify(source);
    expect(reviewedBrowseSummary(source)).toBe(browseSummary);
    expect(source.summary).toBe(full);
    expect(source.overview).toBe(content.overview);
    expect(source.cautions).toBe(content.cautions);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps the exact full fallback for an absent field and returns no invented copy for absent content", () => {
    expect(reviewedBrowseSummary(content)).toBe(full);
    expect(reviewedBrowseSummary(undefined)).toBeUndefined();
  });

  it("refuses malformed or padded short text rather than clipping or deleting the material fallback", () => {
    for (const browseSummary of [undefined, null, false, 42, {}, [], "", "   ", " padded", "padded ", "\u00a0padded\u00a0"]) {
      expect(reviewedBrowseSummary({ ...content, browseSummary } as unknown as ReviewedProductContent),
        JSON.stringify(browseSummary)).toBe(full);
    }
    for (const code of [0, 9, 10, 13, 31, 127, 128, 133, 159]) {
      const browseSummary = "Synthetic" + String.fromCharCode(code) + "text";
      expect(reviewedBrowseSummary({ ...content, browseSummary }), String(code)).toBe(full);
    }
  });

  it("accepts the full boundary text and falls back in full when the short-text budget is exceeded", () => {
    const boundary = "x".repeat(480);
    expect(reviewedBrowseSummary({ ...content, browseSummary: boundary })).toBe(boundary);
    expect(reviewedBrowseSummary({ ...content, browseSummary: boundary + "x" })).toBe(full);
    // Unicode text is retained verbatim; a UTF-16 budget failure still never clips a surrogate pair.
    const unicode = "Synthetic é — 🧪 warning.";
    expect(reviewedBrowseSummary({ ...content, browseSummary: unicode })).toBe(unicode);
    expect(reviewedBrowseSummary({ ...content, browseSummary: "🧪".repeat(241) })).toBe(full);
  });
});
