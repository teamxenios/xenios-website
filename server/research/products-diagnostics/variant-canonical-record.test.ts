import { describe, expect, it } from "vitest";
import {
  PEPTIDE_CATALOG,
  primaryVariant,
  productsInTier,
} from "@shared/research/catalog/peptide-catalog";
import {
  corroborateVariantIdentity,
  presentationContestKind,
  presentationMassesMg,
  readVariantCanonicalRecord,
  variantRegulatoryHoldReason,
} from "./variant-canonical-record";
import { recordedVariantStrengthDisputes } from "./variant-strength-dispute";

const WORKBOOK = productsInTier("workbook");

function catalogUnit(productCode: string) {
  const product = PEPTIDE_CATALOG.find(
    (candidate) => candidate.internalProductCode === productCode,
  );
  if (product === undefined) throw new Error(`no catalog product ${productCode}`);
  const variant = primaryVariant(product) ?? product.variants[0];
  return { product, variant };
}

describe("identity corroboration", () => {
  it("corroborates a unit two independent records name the same way", () => {
    const { product, variant } = catalogUnit("PEP-006");
    expect(
      corroborateVariantIdentity(
        { canonicalName: product.canonicalName, slug: product.slug },
        { sku: variant.sku },
      ),
    ).toBe("corroborated");
  });

  it("contradicts a unit whose Product Control record names a different product", () => {
    const { product, variant } = catalogUnit("PEP-006");
    expect(
      corroborateVariantIdentity(
        { canonicalName: "Something else entirely", slug: product.slug },
        { sku: variant.sku },
      ),
    ).toBe("contradicted");
    expect(
      corroborateVariantIdentity(
        { canonicalName: product.canonicalName, slug: "a-different-slug" },
        { sku: variant.sku },
      ),
    ).toBe("contradicted");
  });

  it("reports a SKU no second record carries as unrecorded, never as corroborated", () => {
    // One record cannot corroborate itself. This is the assertion that stops a
    // freshly imported unit from reading as cross-checked.
    expect(
      corroborateVariantIdentity(
        { canonicalName: "Imported Item", slug: "imported-item" },
        { sku: "NOT-IN-ANY-CATALOG-0001" },
      ),
    ).toBe("unrecorded");
  });

  it("joins on the catalog number when the SKU column carries an import code", () => {
    const { product, variant } = catalogUnit("PEP-006");
    expect(
      corroborateVariantIdentity(
        { canonicalName: product.canonicalName, slug: product.slug },
        { sku: "SUPPLIER-INTERNAL-0001", catalogNumber: variant.sku },
      ),
    ).toBe("corroborated");
  });
});

describe("regulatory hold", () => {
  it("reports a reason for every variant of a held compound", () => {
    const held = productsInTier("regulatory_hold");
    expect(held.length).toBeGreaterThan(0);
    for (const product of held) {
      for (const variant of product.variants) {
        expect(variantRegulatoryHoldReason({ sku: variant.sku })).not.toBeNull();
      }
    }
  });

  it("reports no reason for a workbook compound", () => {
    for (const product of WORKBOOK) {
      for (const variant of product.variants) {
        expect(variantRegulatoryHoldReason({ sku: variant.sku })).toBeNull();
      }
    }
  });

  it("reports no reason for a unit no canonical record carries", () => {
    expect(variantRegulatoryHoldReason({ sku: "NOT-IN-ANY-CATALOG-0001" })).toBeNull();
  });
});

describe("presentation masses", () => {
  it("reads only a number bound to a mass unit", () => {
    expect(presentationMassesMg("10 mg")).toEqual([10]);
    expect(presentationMassesMg("250 mcg")).toEqual([0.25]);
    expect(presentationMassesMg("1 g")).toEqual([1000]);
    // A capsule count is not a mass, and counting it would invent a component.
    expect(presentationMassesMg("10 mg per capsule, 30 capsules")).toEqual([10]);
  });

  it("drops a parenthesised total so an annotation is not a component", () => {
    expect(presentationMassesMg("50 mg / 10 mg / 10 mg (70 mg total)")).toEqual([
      10, 10, 50,
    ]);
  });

  it("reports nothing comparable when no mass is stated", () => {
    expect(presentationMassesMg("60 capsules")).toBeNull();
    expect(presentationMassesMg("")).toBeNull();
  });
});

describe("what a contested presentation is a contest about", () => {
  const disputes = recordedVariantStrengthDisputes();

  it("splits every recorded dispute into a formula contest or a strength one", () => {
    const byKind = { formula: [] as string[], strength: [] as string[] };
    for (const dispute of disputes) {
      byKind[presentationContestKind(dispute)].push(dispute.productCode);
    }
    // A blend whose two records state different total masses is a contest about
    // what is in the vial. PEP-002's two records state the SAME masses in a
    // different order, so it is a contest about wording, not composition.
    expect(byKind.formula.sort()).toEqual(["PEP-001", "PEP-003", "PEP-015"]);
    expect(byKind.strength.sort()).toEqual([
      "PEP-002",
      "PEP-007",
      "PEP-008",
      "PEP-009",
      "PEP-010",
      "PEP-011",
      "PEP-012",
      "PEP-013",
      "PEP-014",
    ]);
    expect(byKind.formula.length + byKind.strength.length).toBe(disputes.length);
  });
});

describe("the whole canonical record", () => {
  it("corroborates the presentation when both records state the same one", () => {
    const { product, variant } = catalogUnit("PEP-006");
    const record = readVariantCanonicalRecord(
      { canonicalName: product.canonicalName, slug: product.slug },
      { sku: variant.sku, strength: variant.strength },
    );
    expect(record.identity).toBe("corroborated");
    expect(record.strengthDispute).toBeNull();
    expect(record.contestKind).toBeNull();
    expect(record.presentationCorroborated).toBe(true);
    expect(record.regulatoryHoldReason).toBeNull();
  });

  it("refuses to corroborate a presentation nothing else records", () => {
    const record = readVariantCanonicalRecord(
      { canonicalName: "Imported Item", slug: "imported-item" },
      { sku: "NOT-IN-ANY-CATALOG-0001", strength: "10 mg" },
    );
    expect(record.identity).toBe("unrecorded");
    expect(record.presentationCorroborated).toBe(false);
  });

  it("refuses to corroborate a presentation the two records disagree about", () => {
    const { product, variant } = catalogUnit("PEP-006");
    const record = readVariantCanonicalRecord(
      { canonicalName: product.canonicalName, slug: product.slug },
      { sku: variant.sku, strength: "999 mg" },
    );
    expect(record.strengthDispute).not.toBeNull();
    expect(record.presentationCorroborated).toBe(false);
  });

  it("carries no amount of any kind out of the peptide catalog", () => {
    // The catalog holds wholesale costs, draft computations, a superseded
    // published price, and a competitor's shelf price. None of them may reach a
    // pricing path, so none may leave this module.
    const { product, variant } = catalogUnit("PEP-006");
    const record = readVariantCanonicalRecord(
      { canonicalName: product.canonicalName, slug: product.slug },
      { sku: variant.sku, strength: variant.strength },
    );
    const serialized = JSON.stringify(record);
    for (const amount of [
      variant.wholesaleSourceCostCents,
      variant.computedCustomerAmountCents,
      variant.priorApprovedMatrixAmountCents,
      variant.legacyPublishedAmountCents,
      variant.marketReferencePriceCents,
    ]) {
      if (amount === null) continue;
      expect(serialized).not.toContain(String(amount));
    }
  });
});
