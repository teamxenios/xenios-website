import { describe, expect, it } from "vitest";
import {
  MasterCatalogNormalizeError,
  normalizeMasterCatalog,
  type RawMasterCatalogRow,
} from "./normalize-catalog";

function row(overrides: Partial<Record<string, unknown>> = {}): RawMasterCatalogRow {
  return {
    sheetRow: 5,
    "Group ID": "G-001",
    Family: "Research Peptides & Materials",
    Channel: "RUO Research",
    Product: "BPC-157",
    "Normalized Specification": "BPC-157 5 mg",
    "Dosage Form": "Lyophilized Vial",
    ...overrides,
  };
}

describe("the master-catalog normalizer", () => {
  it("maps a row to the contract vocabulary with visibility separate from purchasability", () => {
    const catalog = normalizeMasterCatalog([row()]);
    expect(catalog.sourceRowCount).toBe(1);
    const offering = catalog.products[0];
    expect(offering.family).toBe("research_peptides_materials");
    expect(offering.displayState).toBe("request_access");
    expect(offering.visibility).toBe("member");
    expect(offering.copyState).toBe("draft");
    expect(offering.variants).toHaveLength(1);
    expect(offering.variants[0].label).toBe("BPC-157 5 mg");
    expect(offering.id).toMatch(/^mo_[0-9a-f]{20}$/);
  });

  it("maps every channel to its decided display state", () => {
    const cases: ReadonlyArray<[string, string]> = [
      ["Clinical / Provider Only", "care_pathway"],
      ["Supplier Catalog / Classification Pending", "approval_required"],
      ["RUO Research", "request_access"],
      ["Supplement", "request_access"],
      ["Nonclinical / Topical", "request_access"],
    ];
    for (const [channel, state] of cases) {
      const catalog = normalizeMasterCatalog([row({ Channel: channel })]);
      expect(catalog.products[0].displayState).toBe(state);
    }
  });

  it("refuses an unknown family rather than defaulting", () => {
    expect(() => normalizeMasterCatalog([row({ Family: "Gray Market Imports" })])).toThrow(
      MasterCatalogNormalizeError,
    );
  });

  it("refuses an unknown channel rather than defaulting", () => {
    expect(() => normalizeMasterCatalog([row({ Channel: "Direct Retail" })])).toThrow(
      MasterCatalogNormalizeError,
    );
  });

  it("refuses a duplicate identity rather than guessing", () => {
    expect(() => normalizeMasterCatalog([row(), row()])).toThrow(
      MasterCatalogNormalizeError,
    );
  });

  it("keeps two strengths of one product distinct", () => {
    const catalog = normalizeMasterCatalog([
      row(),
      row({ "Group ID": "G-002", "Normalized Specification": "BPC-157 10 mg", sheetRow: 6 }),
    ]);
    expect(catalog.products).toHaveLength(2);
    expect(new Set(catalog.products.map((p) => p.slug)).size).toBe(2);
  });

  it("carries no price of any kind", () => {
    const catalog = normalizeMasterCatalog([
      row({ "Suggested Sell Price": 88, "Buy Cost / Unit": 12 }),
    ]);
    // Offerings are made of names, states, and identities; a NUMBER anywhere
    // in one is the shape of a leaked amount, so the walk refuses them all,
    // and no key may so much as mention a price or a cost.
    const walk = (node: unknown, trail: string): void => {
      expect(typeof node, `${trail} carries a number`).not.toBe("number");
      if (Array.isArray(node)) {
        node.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      } else if (node && typeof node === "object") {
        for (const [key, entry] of Object.entries(node)) {
          expect(key.toLowerCase()).not.toMatch(/price|cost|margin|quote/);
          walk(entry, `${trail}.${key}`);
        }
      }
    };
    walk(catalog.products, "$");
  });

  it("cleans the reviewed hold label only after hashing the untouched source identity", () => {
    const source = row({
      "Group ID": "GRP-0422",
      Product: "CJC-1295 + Ipamorelin",
      "Normalized Specification": "CJC-1295 WITH DAC + IPAMORELIN 5 mg total (split pending)",
    });
    const raw = normalizeMasterCatalog([source]).products[0];
    const presentation = normalizeMasterCatalog([source], new Map([
      ["GRP-0422", "CJC-1295 WITH DAC + IPAMORELIN 5 mg total"],
    ])).products[0];
    expect(presentation.id).toBe(raw.id);
    expect(presentation.variants[0].id).toBe(raw.variants[0].id);
    expect(presentation.id).toBe("mo_2babbadce5172426bde2");
    expect(presentation.variants[0].id).toBe("mov_f61758881da2b7bfa539");
    expect(presentation.variants[0].label).toBe("CJC-1295 WITH DAC + IPAMORELIN 5 mg total");
    expect(presentation.aliases.join(" ")).not.toContain("split pending");
    expect(presentation.family).toBe(raw.family);
    expect(presentation.displayState).toBe(raw.displayState);
    expect(JSON.stringify(presentation)).not.toContain("GRP-0422");
  });

  it("preserves the reviewed colon label and raw identity for retained GRP-0080", () => {
    const source = row({
      "Group ID": "GRP-0080",
      Family: "503A Clinical Formulations",
      Channel: "Clinical / Provider Only",
      Product: "LIBIDO CREAM (SCREAM CREAM)",
      "Normalized Specification": "LIBIDO CREAM (SCREAM CREAM) \u2014 Testosterone Cypionate 0.1% / Sildenafil Citrate 0.1% / Glycerin / Versabase Cream",
    });
    const product = normalizeMasterCatalog([source]).products[0];
    expect(product.id).toBe("mo_3d043e2a35ceaa045986");
    expect(product.variants[0].id).toBe("mov_06beec21c59fe7842f18");
    expect(product.variants[0].label).toBe(
      "LIBIDO CREAM (SCREAM CREAM): Testosterone Cypionate 0.1% / Sildenafil Citrate 0.1% / Glycerin / Versabase Cream",
    );
    expect(product.aliases).toContain(product.variants[0].label);
    expect(JSON.stringify([product.variants[0].label, ...product.aliases])).not.toContain("\u2014");
    expect(product.displayState).toBe("care_pathway");
  });

  it("does not apply a reviewed label to a different identity that reuses the source row number", () => {
    const product = normalizeMasterCatalog([row({
      "Group ID": "GRP-0080",
      Product: "Different source item",
      "Normalized Specification": "Different exact source specification",
    })]).products[0];
    expect(product.id).not.toBe("mo_3d043e2a35ceaa045986");
    expect(product.variants[0].label).toBe("Different exact source specification");
  });
});
