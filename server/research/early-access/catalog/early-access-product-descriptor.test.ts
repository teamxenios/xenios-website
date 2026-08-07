import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS,
  EARLY_ACCESS_WITHHELD_DESCRIPTION,
  earlyAccessDescription,
  projectEarlyAccessCatalog,
} from "./early-access-catalog";
import {
  EARLY_ACCESS_RESEARCH_USE_SENTENCE,
  earlyAccessProductDescriptor,
} from "./early-access-product-descriptor";
import { canonicalReviewProducts } from "../release/first-release-canonical-source";
import type { AdminProductDetail, AdminProductVariant } from "@shared/research/product-admin";

/**
 * THE PRODUCT DESCRIPTION, AND THE LINE IT MAY NOT CROSS.
 *
 * The founder found 22 cards reading "Product information for this item is
 * still being confirmed." The cause was that Product Control holds no
 * `shortDescription` row for any production product, so the projection fell
 * to its withheld sentence every time.
 *
 * These tests hold both halves of the repair: every unit now says something
 * true and specific, and nothing it says is a claim. The second half is the
 * one that matters most, because the repository's own product records mark
 * every one of these compounds "No Member-Facing Copy" or "Restricted.
 * Draft only, not approved for publication".
 */

/**
 * Vocabulary that would turn a catalogue entry into a promise or a protocol.
 *
 * Matched on WORD boundaries, with the ordinary inflections, rather than as
 * substrings. Substring matching reads "sexual health peptide" as a healing
 * claim, and a screen that cries wolf on a classification label is a screen
 * someone eventually switches off. The production gate
 * (EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS) is deliberately the opposite:
 * it matches substrings, because "reconstitut" must catch every form.
 */
const PROHIBITED_CLAIM_TERMS = [
  "treat",
  "cure",
  "heal",
  "prevent",
  "diagnose",
  "diagnosis",
  "diagnostic",
  "therapy",
  "therapeutic",
  "patient",
  "efficacy",
  "benefit",
  "improve",
  "enhance",
  "boost",
  "increase",
  "reduce",
  "reverse",
  "recovery",
  "performance",
  "wellness",
  "supplement",
  "daily",
  "protocol",
  "cycle",
  "stack",
] as const;

/** Phrases, matched as written. */
const PROHIBITED_CLAIM_PHRASES = [
  "clinically proven",
  "safe and effective",
  "burn fat",
  "weight loss",
  "anti-aging",
] as const;

function carriesClaim(text: string): string | null {
  const lowered = text.toLowerCase();
  for (const phrase of PROHIBITED_CLAIM_PHRASES) {
    if (lowered.includes(phrase)) return phrase;
  }
  for (const term of PROHIBITED_CLAIM_TERMS) {
    if (new RegExp(`\\b${term}(s|es|ed|ing)?\\b`).test(lowered)) return term;
  }
  return null;
}

function detail(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: "prod-1",
    productCode: "PEX-001",
    slug: "bpc-157",
    displayName: "BPC-157 Research Material",
    canonicalName: "BPC-157 (pentadecapeptide BPC-157)",
    aliases: ["BPC157", "Body protection compound-157"],
    classification: "repair_peptide",
    content: { shortDescription: null },
    ...overrides,
  } as unknown as AdminProductDetail;
}

function variant(overrides: Partial<AdminProductVariant> = {}): AdminProductVariant {
  return {
    id: "var-1",
    sku: "PEX-001-5MG",
    strength: "5 mg",
    presentation: "Single vial, 5 mg",
    ...overrides,
  } as unknown as AdminProductVariant;
}

describe("the composed descriptor says what the record says, and no more", () => {
  it("names the molecule, its classification, this unit, and the other names on file", () => {
    const text = earlyAccessProductDescriptor(detail(), variant());
    expect(text).toBe(
      "BPC-157 (pentadecapeptide BPC-157), a repair peptide. Supplied as a single vial, 5 mg, " +
        "for laboratory research. Also recorded as BPC157, Body protection compound-157. " +
        "Research use only: not for human or veterinary use.",
    );
  });

  it("does not repeat the strength when the presentation already carries it", () => {
    // "a 5 mg Single vial, 5 mg" was the first draft of this sentence.
    const text = earlyAccessProductDescriptor(detail(), variant());
    expect(text).not.toMatch(/5 mg[^.]*5 mg/);
  });

  it("falls back to the bare strength when no presentation is recorded", () => {
    const text = earlyAccessProductDescriptor(
      detail(),
      variant({ presentation: null } as Partial<AdminProductVariant>),
    );
    expect(text).toContain("Supplied as a 5 mg vial, for laboratory research.");
  });

  it("drops an alias that only repeats a name the card already shows", () => {
    // Three of the production records list the product's own name as an
    // alias, which would render "Also recorded as Cagrilintide" on the
    // Cagrilintide card.
    const text = earlyAccessProductDescriptor(
      detail({
        displayName: "Cagrilintide",
        canonicalName: "Cagrilintide Research Material",
        aliases: ["Cagrilintide", "Cagrilintide Research Material"],
        classification: "metabolic_peptide",
      }),
      variant({ strength: "10 mg", presentation: "Single vial, 10 mg" }),
    );
    expect(text).toBe(
      "Cagrilintide, a metabolic peptide. Supplied as a single vial, 10 mg, for laboratory " +
        "research. Research use only: not for human or veterinary use.",
    );
    expect(text).not.toContain("Also recorded as");
  });

  it("leaks no internal classification token when the classification is unknown", () => {
    const text = earlyAccessProductDescriptor(
      detail({ classification: "some_new_internal_token" }),
      variant(),
    );
    expect(text).not.toContain("some_new_internal_token");
    expect(text).not.toMatch(/[a-z]+_[a-z]+/);
    expect(text).toContain("BPC-157 (pentadecapeptide BPC-157). Supplied as a single vial");
  });

  it("drops an alias carrying protocol vocabulary, and keeps the rest of the sentence", () => {
    // One canonical record really does list "KLOW Peptide Stack". "Stack" is
    // how a forum describes combining compounds in a regimen, and the record
    // holding it is not a reason to print it on a card.
    const text = earlyAccessProductDescriptor(
      detail({
        displayName: "KLOW Research Blend",
        canonicalName: "KLOW",
        aliases: ["KLOW Peptide Stack", "KPV"],
        classification: "blend",
      }),
      variant(),
    );
    expect(text).not.toContain("Stack");
    expect(text).toContain("Also recorded as KPV.");
  });

  it("says nothing at all when the record carries no name", () => {
    // "" is a real answer: the caller falls back to the withheld sentence.
    expect(
      earlyAccessProductDescriptor(
        detail({ displayName: "", canonicalName: "" }),
        variant(),
      ),
    ).toBe("");
  });
});

describe("the authority chain: a person outranks the record", () => {
  it("uses Product Control's approved copy when a named human wrote it", () => {
    const text = earlyAccessDescription(
      detail({ content: { shortDescription: "Approved copy written by the founder." } } as Partial<AdminProductDetail>),
      variant(),
    );
    expect(text).toBe("Approved copy written by the founder.");
  });

  it("composes from the record when Product Control holds nothing", () => {
    const text = earlyAccessDescription(detail(), variant());
    expect(text).toContain("BPC-157 (pentadecapeptide BPC-157), a repair peptide.");
    expect(text).not.toBe(EARLY_ACCESS_WITHHELD_DESCRIPTION);
  });

  it("withholds when even the record cannot be read", () => {
    expect(
      earlyAccessDescription(detail({ displayName: "", canonicalName: "" }), variant()),
    ).toBe(EARLY_ACCESS_WITHHELD_DESCRIPTION);
  });

  it("still screens the COMPOSED text, not only the authored text", () => {
    // Defence in depth: if a canonical name ever carried an instruction term,
    // the descriptor is withheld rather than shipped.
    const text = earlyAccessDescription(
      detail({ canonicalName: "Something subcutaneous", displayName: "Something subcutaneous" }),
      variant(),
    );
    expect(text).toBe(EARLY_ACCESS_WITHHELD_DESCRIPTION);
  });

  it("still withholds authored copy that carries an instruction term", () => {
    const text = earlyAccessDescription(
      detail({ content: { shortDescription: "Reconstitute before use." } } as Partial<AdminProductDetail>),
      variant(),
    );
    expect(text).toBe(EARLY_ACCESS_WITHHELD_DESCRIPTION);
  });
});

describe("every canonical product describes itself, and none of them make a claim", () => {
  const projected = projectEarlyAccessCatalog({
    products: canonicalReviewProducts().map((product) => ({
      product,
      audience: null,
      currency: "USD",
      variantFacts: [],
    })) as never,
    now: new Date(Date.UTC(2026, 7, 6)),
  });

  it("leaves no row on the withheld placeholder", () => {
    expect(projected.rows.length).toBeGreaterThan(20);
    const withheld = projected.rows.filter(
      (row) => row.description === EARLY_ACCESS_WITHHELD_DESCRIPTION,
    );
    expect(withheld.map((row) => `${row.displayName} ${row.strength ?? ""}`)).toEqual([]);
  });

  it("gives every row its own product-specific sentence, never one shared string", () => {
    // Generic filler would show up here as one description repeated across
    // unrelated compounds.
    const byProduct = new Map<string, string>();
    for (const row of projected.rows) byProduct.set(row.productId, row.description);
    expect(new Set(byProduct.values()).size).toBe(byProduct.size);
    for (const row of projected.rows) {
      const molecule = row.canonicalName.replace(/\s+Research (Material|Blend)$/i, "").trim();
      expect(row.description, `${row.displayName} does not name itself`).toContain(
        molecule.split(" (")[0],
      );
    }
  });

  it("carries the Research Use Only position on every row", () => {
    for (const row of projected.rows) {
      expect(row.description).toContain(EARLY_ACCESS_RESEARCH_USE_SENTENCE);
    }
  });

  it("carries NO dosing, administration, therapeutic, disease or benefit language", () => {
    for (const row of projected.rows) {
      const lowered = row.description.toLowerCase();
      for (const term of EARLY_ACCESS_FORBIDDEN_DESCRIPTION_TERMS) {
        expect(lowered, `${row.displayName} contains "${term}"`).not.toContain(term);
      }
      expect(
        carriesClaim(row.description),
        `${row.displayName} carries a claim term`,
      ).toBeNull();
      // No numbers that could read as an amount to use, beyond the strength
      // and any figure already inside the canonical name.
      expect(row.description).not.toMatch(/\bper\s+(day|week|kg)\b/i);
    }
  });

  it("stays short enough to read on a card", () => {
    for (const row of projected.rows) {
      expect(row.description.length, `${row.displayName} is long`).toBeLessThanOrEqual(320);
    }
  });
});
