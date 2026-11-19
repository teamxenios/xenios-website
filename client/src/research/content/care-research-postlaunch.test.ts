import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_EDUCATION_PRODUCTS,
  PRODUCT_EDUCATION_SOURCE,
  type ProductEducationChannel,
} from "./productEducation.generated";
import {
  EVIDENCE_LABELS,
  getProductEducationProfile,
  resolveProductEducationBinding,
} from "./productEducation";

type MemberSafeOffering = {
  id: string;
  family: string;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  displayState: string;
  variants: Array<{ id: string; label: string }>;
};

const masterOfferings = JSON.parse(
  readFileSync(
    new URL(
      "../../../../server/research/master-offerings/data/member-safe-master-offerings.generated.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { products: MemberSafeOffering[] };

const supplementSource = JSON.parse(readFileSync(new URL(
  "../../../../content/research-products/supplement-candidates/reviewed-60-manifest.json",
  import.meta.url,
), "utf8")) as { records: Array<{
  candidateKey: string; brand: string; officialVariantId: string;
  productName: string; package: string; listingState: string;
}> };

const LANE_BY_CHANNEL: Record<ProductEducationChannel, string> = {
  research: "research_material",
  clinical: "future_clinical",
  pending: "non_product_program",
  supplement: "supplement",
  nonclinical: "quantum",
};

describe("Care + Research product education reconciliation", () => {
  it("represents all 426 exact workbook rows once with approved aggregate counts", () => {
    const variants = PRODUCT_EDUCATION_PRODUCTS.flatMap((product) => product.variants);
    const refs = variants.map((variant) => variant.sourceRef);

    expect(PRODUCT_EDUCATION_SOURCE.sourceRowCount).toBe(426);
    expect(PRODUCT_EDUCATION_SOURCE.representedRowCount).toBe(426);
    expect(variants).toHaveLength(426);
    expect(new Set(refs).size).toBe(426);
    expect(new Set(PRODUCT_EDUCATION_PRODUCTS.map((product) => product.key)).size).toBe(
      PRODUCT_EDUCATION_PRODUCTS.length,
    );
    expect(PRODUCT_EDUCATION_SOURCE.channelCounts).toEqual({
      research: 127,
      clinical: 244,
      pending: 32,
      supplement: 20,
      nonclinical: 3,
    });
  });

  it("keeps the generated client registry customer-safe", () => {
    const serialized = JSON.stringify(PRODUCT_EDUCATION_PRODUCTS).toLowerCase();
    const prohibitedWorkbookTerms = [
      ["selected", "supplier"],
      ["wholesale", "cost"],
      ["wholesale", "quote"],
      ["wholesale", "basis"],
      ["gross", "profit"],
      ["gross", "margin"],
      ["increase", "percentage"],
      ["pricing", "method"],
      ["internal", "pricing"],
      ["benchmark", "source"],
      ["internal", "notes"],
      ["minimum", "order"],
    ].map((parts) => parts.join(" "));
    prohibitedWorkbookTerms.push(["m", "o", "q"].join(""));
    for (const term of prohibitedWorkbookTerms) expect(serialized).not.toContain(term);
    expect(serialized).not.toMatch(/amountCents|recommended premium retail/i);
    expect(serialized).not.toMatch(
      /founder approved premium|clinical approval required|classification hold|re-source required|msrp\/map hold/i,
    );
  });

  it("resolves every source binding within its own channel without a cross-lane merge", () => {
    for (const product of PRODUCT_EDUCATION_PRODUCTS) {
      const lookup = {
        canonicalName: product.displayName,
        displayName: product.displayName,
        aliases: [] as string[],
        lane: LANE_BY_CHANNEL[product.channel],
      };
      expect(resolveProductEducationBinding(lookup)?.key).toBe(product.key);
      const profile = getProductEducationProfile(lookup);
      expect(EVIDENCE_LABELS).toContain(profile.evidenceLabel);
      expect(profile.unknowns.length).toBeGreaterThan(0);
      expect(profile.doesNotProve.length).toBeGreaterThan(0);
      expect(profile.researchAvailability).toBeTruthy();
      expect(profile.careAvailability).toBeTruthy();
    }
  });

  it("gives every currently displayed product and variant a structured profile", () => {
    const foundation = masterOfferings.products.slice(0, 420);
    const additions = masterOfferings.products.slice(420);
    const admitted = supplementSource.records.filter(record => record.listingState === "request_only");
    expect(supplementSource.records).toHaveLength(60);
    expect(new Set(supplementSource.records.map(record => `${record.brand}|${record.officialVariantId}`)).size).toBe(60);
    expect(supplementSource.records.filter(record => record.listingState !== "request_only")
      .map(record => record.candidateKey).sort()).toEqual([
      "momentous-05", "momentous-18", "momentous-30", "pure-encapsulations-optiferin-c",
    ]);
    expect(admitted).toHaveLength(56);
    expect(foundation).toHaveLength(420);
    // The entire original product objects, not merely their count or names.
    expect(createHash("sha256").update(JSON.stringify(foundation)).digest("hex"))
      .toBe("7f485d1aeb321a868746b757bc2a1ebfff1578c6e45c3d29a2c63f5059db607b");
    expect(additions).toHaveLength(56);
    expect(additions.every(product => product.family === "supplements")).toBe(true);
    expect(additions.map(product => `${product.displayName}|${product.variants[0].label}`).sort())
      .toEqual(admitted.map(record => `${record.brand} ${record.productName}|${record.package}`).sort());
    expect(new Set(masterOfferings.products.map(product => product.id)).size).toBe(476);
    expect(new Set(masterOfferings.products.flatMap(product => product.variants.map(variant => variant.id))).size).toBe(476);
    let representedVariants = 0;
    for (const product of masterOfferings.products) {
      expect(product.variants).toHaveLength(1);
      const lane = product.family === "supplements" ? "supplement"
        : product.displayState === "care_pathway" ? "future_clinical"
        : product.displayState === "request_access" ? "research_material" : "non_product_program";
      const base = {
        canonicalName: product.canonicalName,
        displayName: product.displayName,
        aliases: product.aliases,
        lane,
      };
      const profile = getProductEducationProfile(base);
      expect(profile.whatItIs).toContain(product.displayName);
      expect(profile.unknowns.length).toBeGreaterThan(0);
      expect(profile.doesNotProve.length).toBeGreaterThan(0);
      if (product.family === "supplements") {
        expect(profile.key).toMatch(/^supplement:/);
        expect(profile.researchAvailability).toContain("exact approved supplement record");
        expect(profile.careAvailability).toContain("not a clinical recommendation");
        expect(profile.careAvailability).toContain("does not establish Care eligibility");
      }

      for (const variant of product.variants) {
        representedVariants += 1;
        const variantProfile = getProductEducationProfile({
          ...base,
          variantLabel: variant.label,
        });
        expect(variantProfile.whatItIs).toContain(product.displayName);
        expect(variantProfile.unknowns.length).toBeGreaterThan(0);
        expect(variantProfile.doesNotProve.length).toBeGreaterThan(0);
        if (product.family === "supplements") {
          expect(variantProfile.key).toMatch(/^supplement:/);
          expect(variantProfile.researchAvailability).toContain("exact approved supplement record");
          expect(variantProfile.careAvailability).toContain("not a clinical recommendation");
        }
      }
    }

    expect(masterOfferings.products).toHaveLength(420 + admitted.length);
    expect(representedVariants).toBe(476);
  });

  it("uses guide-grounded limitations for representative Research, blend, and clinical profiles", () => {
    const research = getProductEducationProfile({
      canonicalName: "BPC-157",
      displayName: "BPC-157",
      lane: "research_material",
    });
    expect(research.evidenceLabel).toBe("Preclinical / limited");
    expect(research.humanEvidence).toContain("do not establish a human treatment benefit");

    const blend = getProductEducationProfile({
      canonicalName: "BPC-157 + TB-500",
      displayName: "BPC-157 + TB-500",
      lane: "research_material",
    });
    expect(blend.unknowns.join(" ")).toContain("exact combination");

    const clinical = getProductEducationProfile({
      canonicalName: "Product-specific provider formulation",
      displayName: "Product-specific provider formulation",
      lane: "future_clinical",
    });
    expect(clinical.evidenceLabel).toBe("Product-specific / formulation-specific");
    expect(clinical.whyPeopleAreInterested).toContain("licensed clinical team");
    expect(clinical.careAvailability).toContain("licensed clinician");
  });

  it("names no bottle and, for a research row, no catalog form in the identity sentence", () => {
    // Every catalog product, in each lane the member page can pass.
    for (const product of PRODUCT_EDUCATION_PRODUCTS) {
      for (const lane of ["research", "research_material", "pending", "future_clinical", undefined]) {
        const text = getProductEducationProfile({
          canonicalName: product.displayName, displayName: product.displayName, lane,
        }).whatItIs;
        expect(text, product.key).not.toMatch(/bottle/i);
        if (lane === "research" || lane === "research_material") {
          expect(text, product.key).not.toMatch(/lyophili[sz]ed vial|form not stated/i);
        }
      }
    }
    // A row that is not on a research lane keeps a capsule form, worded without a container.
    expect(getProductEducationProfile({ canonicalName: "Tesofensine", displayName: "Tesofensine", lane: "pending" }).whatItIs)
      .toContain("· Capsules record");
  });
});
