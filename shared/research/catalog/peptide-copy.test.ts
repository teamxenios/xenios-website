import { describe, expect, it } from "vitest";
import {
  findPeptideByCode,
  PEPTIDE_CATALOG,
  primaryVariant,
  productsInTier,
} from "./peptide-catalog";
import {
  CATALOG_STATUS_DISCLOSURE,
  copyCoversCatalog,
  copyForCode,
  copyForProduct,
  copyForSku,
  customerFacingCopyStrings,
  PEPTIDE_COPY,
  RESEARCH_CONTEXT_DISCLOSURE,
} from "./peptide-copy";

/**
 * The forbidden claim list, duplicated from peptide-catalog.test.ts on purpose.
 *
 * A single shared constant could be weakened in one edit and both checks would
 * relax together. Two independent copies mean a reviewer sees the denylist twice
 * in any diff that touches it.
 */
const FORBIDDEN_CLAIM_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["cure", /\bcure\w*/i],
  ["treat", /\btreat\w*/i],
  ["diagnose", /\bdiagnos\w*/i],
  ["prevent", /\bprevent\w*/i],
  ["prescription", /\bprescri\w*/i],
  ["dosage", /\bdosag\w*/i],
  ["dose", /\bdos(e|es|ing)\b/i],
  ["mg/kg", /mg\s*\/\s*kg/i],
  ["fda approved", /fda[\s-]?approv/i],
  ["purity", /\bpurit(y|ies)\b/i],
  ["sterile", /\bsteril\w*/i],
  ["endotoxin", /\bendotoxin\w*/i],
  ["guarantee", /\bguarantee\w*/i],
  ["proven", /\bproven\b/i],
];

/** Storage or handling conditions that no supplier document establishes for these items. */
const UNDOCUMENTED_STORAGE_PATTERNS: ReadonlyArray<[string, RegExp]> = [
  ["temperature", /-?\d+\s*(?:degrees|deg|°)\s*[cf]\b/i],
  ["refrigerate", /\brefrigerat\w*/i],
  ["freeze", /\bfreez\w*|\bfrozen\b/i],
  ["shelf life", /\bshelf\s*life\b/i],
  ["reconstitute", /\breconstitut\w*/i],
];

describe("copy coverage", () => {
  it("covers every workbook product exactly once, and nothing else", () => {
    expect(PEPTIDE_COPY).toHaveLength(15);
    expect(copyCoversCatalog()).toBe(true);
    const codes = PEPTIDE_COPY.map((entry) => entry.internalProductCode);
    expect(new Set(codes).size).toBe(15);
    expect(codes).toEqual(
      productsInTier("workbook").map((product) => product.internalProductCode),
    );
  });

  it("writes no copy for the expansion tier, which we do not carry yet", () => {
    for (const product of productsInTier("expansion")) {
      expect(copyForProduct(product), product.internalProductCode).toBeNull();
    }
  });

  it("writes no copy at all for a compound held on regulatory grounds", () => {
    for (const product of productsInTier("regulatory_hold")) {
      expect(copyForProduct(product), product.internalProductCode).toBeNull();
      for (const variant of product.variants) {
        expect(copyForSku(variant.sku), variant.sku).toBeNull();
      }
    }
    const serialized = JSON.stringify(PEPTIDE_COPY).toLowerCase();
    expect(serialized).not.toContain("semaglutide");
    expect(serialized).not.toContain("tirzepatide");
    expect(serialized).not.toContain("retatrutide");
    expect(serialized).not.toContain("glp");
  });

  it("pins each entry to its product through the primary sku", () => {
    for (const product of productsInTier("workbook")) {
      const entry = copyForCode(product.internalProductCode);
      expect(entry, product.internalProductCode).not.toBeNull();
      expect(entry!.primarySku).toBe(primaryVariant(product)!.sku);
    }
  });

  it("resolves the same copy from every variant of a product", () => {
    const nad = findPeptideByCode("PEP-009")!;
    expect(nad.variants).toHaveLength(2);
    for (const variant of nad.variants) {
      expect(copyForSku(variant.sku)?.internalProductCode).toBe("PEP-009");
    }
    expect(copyForSku("R360-NOTAPRODUCT-10MG-VIAL")).toBeNull();
    expect(copyForCode("PEP-018")).toBeNull();
  });
});

describe("copy shape", () => {
  it("gives each product a one-line positioning statement", () => {
    for (const entry of PEPTIDE_COPY) {
      expect(entry.positioning.length, entry.internalProductCode).toBeGreaterThan(20);
      expect(entry.positioning.length, entry.internalProductCode).toBeLessThan(120);
      expect(entry.positioning, entry.internalProductCode).not.toContain("\n");
      expect(entry.positioning.trim().endsWith("."), entry.internalProductCode).toBe(true);
    }
  });

  it("gives each product a two to three sentence overview", () => {
    for (const entry of PEPTIDE_COPY) {
      const sentences = entry.overview.split(". ").filter((part) => part.trim().length > 0);
      expect(sentences.length, entry.internalProductCode).toBeGreaterThanOrEqual(2);
      expect(sentences.length, entry.internalProductCode).toBeLessThanOrEqual(3);
    }
  });

  it("gives each product two or more research context entries and a storage note", () => {
    for (const entry of PEPTIDE_COPY) {
      expect(entry.researchContext.length, entry.internalProductCode).toBeGreaterThanOrEqual(2);
      expect(new Set(entry.researchContext).size).toBe(entry.researchContext.length);
      expect(entry.storageAndHandling.length, entry.internalProductCode).toBeGreaterThan(60);
    }
  });

  it("carries the two standing disclosures", () => {
    expect(RESEARCH_CONTEXT_DISCLOSURE).toMatch(/not a statement of what the compound does/i);
    expect(CATALOG_STATUS_DISCLOSURE).toMatch(/documentation gate/i);
    expect(customerFacingCopyStrings()).toContain(RESEARCH_CONTEXT_DISCLOSURE);
    expect(customerFacingCopyStrings()).toContain(CATALOG_STATUS_DISCLOSURE);
  });

  it("scans every customer-facing string, not a subset", () => {
    // 15 entries x (positioning + overview + storage) plus every research
    // context line, plus the two standing disclosures.
    const researchLines = PEPTIDE_COPY.reduce(
      (total, entry) => total + entry.researchContext.length,
      0,
    );
    expect(customerFacingCopyStrings()).toHaveLength(15 * 3 + researchLines + 2);
  });
});

describe("house style", () => {
  it("uses no em dash or en dash anywhere in the copy", () => {
    for (const value of customerFacingCopyStrings()) {
      expect(value, value).not.toContain("\u2014");
      expect(value, value).not.toContain("\u2013");
    }
  });

  it("uses no exclamation and no all-caps shouting", () => {
    for (const value of customerFacingCopyStrings()) {
      expect(value).not.toContain("!");
      expect(/\b[A-Z]{5,}\b/.test(value.replace(/\b(?:BPC|TB|GHK|KPV|DSIP|NAD|MOTS|SLU|LR|HCG|VIP|IU)\b/g, "")), value).toBe(
        false,
      );
    }
  });
});

describe("claim safety", () => {
  it("puts no forbidden claim word in any customer-facing copy string", () => {
    for (const value of customerFacingCopyStrings()) {
      for (const [label, pattern] of FORBIDDEN_CLAIM_PATTERNS) {
        expect(pattern.test(value), `"${label}" found in: ${value}`).toBe(false);
      }
    }
  });

  it("never says FDA anywhere in the copy, whatever the regulatory record says", () => {
    // PEP-007's workbook regulatory status is a fact on the product record. It
    // is not a selling point and never appears in a member-readable string.
    for (const value of customerFacingCopyStrings()) {
      expect(/fda/i.test(value), value).toBe(false);
    }
    expect(findPeptideByCode("PEP-007")?.regulatoryNote).toMatch(/FDA-approved/);
  });

  it("states no storage condition that no supplier document establishes", () => {
    for (const entry of PEPTIDE_COPY) {
      for (const [label, pattern] of UNDOCUMENTED_STORAGE_PATTERNS) {
        expect(
          pattern.test(entry.storageAndHandling),
          `"${label}" found in ${entry.internalProductCode} storage note`,
        ).toBe(false);
      }
      expect(entry.storageAndHandling).toMatch(/only after the supplier document/i);
    }
  });

  it("states no lot number, expiry, purity, sterility, or endotoxin value", () => {
    const serialized = JSON.stringify(customerFacingCopyStrings());
    expect(/\blot\s*(number|no\.?|#)/i.test(serialized)).toBe(false);
    expect(/\bexpir(y|es|ation)\b/i.test(serialized)).toBe(false);
    expect(/\bendotoxin/i.test(serialized)).toBe(false);
    expect(/\bsteril/i.test(serialized)).toBe(false);
    expect(/\bpurit(y|ies)\b/i.test(serialized)).toBe(false);
  });

  it("copies no third-party prose: no copy string appears in the catalog data verbatim", () => {
    // The market harvest supplied numbers and names only. If a sentence from the
    // catalog record ever showed up as marketing, this would catch the leak.
    const catalogSerialized = JSON.stringify(PEPTIDE_CATALOG);
    for (const entry of PEPTIDE_COPY) {
      expect(catalogSerialized.includes(entry.overview), entry.internalProductCode).toBe(
        false,
      );
      expect(catalogSerialized.includes(entry.positioning), entry.internalProductCode).toBe(
        false,
      );
    }
  });
});
