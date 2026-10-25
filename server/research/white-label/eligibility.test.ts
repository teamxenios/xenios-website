import { describe, expect, it } from "vitest";

import {
  PEPTIDE_CATALOG,
  allVariantsWithProduct,
  isPurchaseMode,
} from "@shared/research/catalog/peptide-catalog";
import {
  WHITE_LABEL_INELIGIBILITY_REASONS,
  WHITE_LABEL_INELIGIBILITY_SENTENCES,
} from "@shared/research/white-label/contracts";
import { recordedVariantStrengthDisputes } from "../products-diagnostics/variant-strength-dispute";
import {
  REPOSITORY_SUPPLIER_REGISTRY,
  evaluateWhiteLabelEligibility,
  isGlpClass,
  summarizeWhiteLabelEligibility,
  supplierRegistryFromSkus,
  whiteLabelEligibilityForSku,
  type WhiteLabelEligibilityContext,
} from "./eligibility";

const ALL_SKUS = allVariantsWithProduct(PEPTIDE_CATALOG).map((e) => e.variant.sku);

/** A context that answers yes to every gate the operations layer owns. */
function everythingKnown(): WhiteLabelEligibilityContext {
  return {
    suppliers: supplierRegistryFromSkus(ALL_SKUS),
    hasPartnerQuote: () => true,
  };
}

describe("the answer this repository can actually give", () => {
  const decisions = evaluateWhiteLabelEligibility({
    suppliers: REPOSITORY_SUPPLIER_REGISTRY,
  });
  const summary = summarizeWhiteLabelEligibility(decisions);

  it("considers every variant in the catalog", () => {
    expect(summary.variantsConsidered).toBe(70);
    expect(summary.variantsConsidered).toBe(ALL_SKUS.length);
  });

  it("finds ZERO variants eligible for white-label activation", () => {
    expect(summary.eligible).toBe(0);
    expect(summary.eligibleSkus).toEqual([]);
  });

  it("routes all sixteen GLP-class variants to CLINICAL_PROVIDER_ONLY", () => {
    expect(summary.clinicalProviderOnly).toBe(16);
    for (const decision of decisions) {
      if (decision.routing !== "CLINICAL_PROVIDER_ONLY") continue;
      expect(decision.reasons).toEqual(["glp_class_clinical_provider_only"]);
      expect(decision.eligible).toBe(false);
    }
  });

  it("blocks every remaining variant on the unknown supplier of record", () => {
    expect(summary.notEligible).toBe(54);
    expect(summary.reasonCounts.supplier_of_record_unknown).toBe(54);
  });

  it("reports the other blockers at their real counts, not rounded up", () => {
    // 39 of the 54 non-GLP variants have neither a wholesale cost nor a quote.
    expect(summary.reasonCounts.no_price_basis).toBe(39);
    // 42 non-GLP variants sit in a mode that is not a purchase mode.
    expect(summary.reasonCounts.purchase_mode_excludes_partner_use).toBe(42);
    // The twelve disputes the catalog already records.
    expect(summary.reasonCounts.variant_strength_disputed).toBe(12);
    expect(summary.reasonCounts.variant_strength_disputed).toBe(
      recordedVariantStrengthDisputes().length,
    );
    // Identity and quality visibility hold everywhere. Nothing is failing on those.
    expect(summary.reasonCounts.canonical_identity_missing).toBe(0);
    expect(summary.reasonCounts.quality_status_not_visible).toBe(0);
    expect(summary.reasonCounts.variant_not_in_catalog).toBe(0);
  });
});

describe("the nearest misses, once the supplier seam is supplied", () => {
  it("clears exactly three variants when a named supplier exists for every SKU", () => {
    const summary = summarizeWhiteLabelEligibility(
      evaluateWhiteLabelEligibility({ suppliers: supplierRegistryFromSkus(ALL_SKUS) }),
    );
    expect(summary.eligible).toBe(3);
    expect(summary.eligibleSkus).toEqual([
      "R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL",
      "R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL",
      "R360-PT141-10MG-VIAL",
    ]);
  });

  it("a partner quote is a price basis, but it cannot clear any other condition", () => {
    const summary = summarizeWhiteLabelEligibility(
      evaluateWhiteLabelEligibility(everythingKnown()),
    );
    expect(summary.reasonCounts.no_price_basis).toBe(0);
    // Still refused: mode and dispute are untouched by a price.
    expect(summary.reasonCounts.purchase_mode_excludes_partner_use).toBe(42);
    expect(summary.reasonCounts.variant_strength_disputed).toBe(12);
    expect(summary.eligible).toBe(3);
  });
});

describe("each condition refuses on its own", () => {
  const eligibleSku = "R360-PT141-10MG-VIAL";

  it("is eligible when every condition holds", () => {
    const decision = whiteLabelEligibilityForSku(eligibleSku, everythingKnown());
    expect(decision.routing).toBe("ELIGIBLE");
    expect(decision.eligible).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("refuses when no supplier of record is known", () => {
    const decision = whiteLabelEligibilityForSku(eligibleSku, {
      suppliers: REPOSITORY_SUPPLIER_REGISTRY,
      hasPartnerQuote: () => true,
    });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("supplier_of_record_unknown");
  });

  it("refuses a variant with neither a cost basis nor a quote", () => {
    // R360-BPC157-10MG-VIAL is an expansion size with no cost basis of our own.
    const decision = whiteLabelEligibilityForSku("R360-BPC157-10MG-VIAL", {
      suppliers: supplierRegistryFromSkus(ALL_SKUS),
    });
    expect(decision.reasons).toContain("no_price_basis");
  });

  it("refuses a variant whose purchase mode does not permit partner use", () => {
    // Sourced cost, but held at REQUEST_ACCESS_ONLY by the PCAC review rule.
    const decision = whiteLabelEligibilityForSku("R360-MOTSC-10MG-VIAL", everythingKnown());
    expect(decision.reasons).toContain("purchase_mode_excludes_partner_use");
    const variant = allVariantsWithProduct(PEPTIDE_CATALOG).find(
      (e) => e.variant.sku === "R360-MOTSC-10MG-VIAL",
    );
    expect(isPurchaseMode(variant!.variant.availability)).toBe(false);
  });

  it("refuses a strength-disputed variant using the merged PR #205 guard, not a copy", () => {
    const disputed = recordedVariantStrengthDisputes()[0];
    const decision = whiteLabelEligibilityForSku(disputed.sku, everythingKnown());
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain("variant_strength_disputed");
  });

  it("refuses an unknown SKU rather than answering null", () => {
    const decision = whiteLabelEligibilityForSku("R360-NOT-A-SKU-VIAL", everythingKnown());
    expect(decision.routing).toBe("NOT_ELIGIBLE");
    expect(decision.reasons).toEqual(["variant_not_in_catalog"]);
  });
});

describe("the GLP exclusion is absolute", () => {
  it("routes every regulatory-hold product to a clinical provider", () => {
    for (const product of PEPTIDE_CATALOG) {
      if (product.tier !== "regulatory_hold") continue;
      expect(isGlpClass(product)).toBe(true);
      for (const variant of product.variants) {
        const decision = whiteLabelEligibilityForSku(variant.sku, everythingKnown());
        expect(decision.routing).toBe("CLINICAL_PROVIDER_ONLY");
        expect(decision.eligible).toBe(false);
      }
    }
  });

  it("catches a GLP molecule recorded outside the hold tier", () => {
    const semaglutide = PEPTIDE_CATALOG.find((p) => p.canonicalName === "Semaglutide");
    expect(semaglutide).toBeDefined();
    const smuggled = { ...semaglutide!, tier: "workbook" as const };
    expect(isGlpClass(smuggled)).toBe(true);
  });

  it("never routes a non-GLP variant to a clinical provider", () => {
    for (const decision of evaluateWhiteLabelEligibility(everythingKnown())) {
      if (decision.routing !== "CLINICAL_PROVIDER_ONLY") continue;
      const product = PEPTIDE_CATALOG.find(
        (p) => p.internalProductCode === decision.productCode,
      );
      expect(isGlpClass(product!)).toBe(true);
    }
  });
});

describe("an eligibility decision carries no money and no supplier", () => {
  it("emits no amount, no cost, and no supplier identity on any decision", () => {
    const serialized = JSON.stringify(
      evaluateWhiteLabelEligibility(everythingKnown()),
    ).toLowerCase();
    for (const token of [
      "amountcents",
      "costcents",
      "wholesale",
      "multiplier",
      "margin",
      "suppliername",
      "supplierid",
      "marketreference",
    ]) {
      expect(serialized, `decision payload leaked "${token}"`).not.toContain(token);
    }
  });

  it("emits exactly the eight decision fields and no other", () => {
    // A number in this payload could only arrive through a NEW field, so pinning the
    // field set is a stronger guard than pattern matching digits: the SKUs themselves
    // legitimately contain 1000, 1500, and 5000.
    for (const decision of evaluateWhiteLabelEligibility(everythingKnown())) {
      expect(Object.keys(decision).sort()).toEqual([
        "displayName",
        "eligible",
        "explanations",
        "productCode",
        "reasons",
        "routing",
        "sku",
        "slug",
      ]);
    }
  });

  it("keeps the reason vocabulary and its sentences in step", () => {
    for (const reason of WHITE_LABEL_INELIGIBILITY_REASONS) {
      expect(WHITE_LABEL_INELIGIBILITY_SENTENCES[reason]).toBeTruthy();
    }
    expect(Object.keys(WHITE_LABEL_INELIGIBILITY_SENTENCES).sort()).toEqual(
      [...WHITE_LABEL_INELIGIBILITY_REASONS].sort(),
    );
  });

  it("freezes each decision so a caller cannot edit one and change the next read", () => {
    const decision = whiteLabelEligibilityForSku("R360-PT141-10MG-VIAL", everythingKnown());
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasons)).toBe(true);
  });
});
