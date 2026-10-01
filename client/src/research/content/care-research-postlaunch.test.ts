import { readFileSync } from "node:fs";
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

  it("gives every canonical catalog product and variant a structured profile", () => {
    let representedVariants = 0;
    for (const product of masterOfferings.products) {
      const lane = product.displayState === "care_pathway"
        ? "future_clinical"
        : product.displayState === "request_access"
          ? "research_material"
          : "non_product_program";
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

      for (const variant of product.variants) {
        representedVariants += 1;
        const variantProfile = getProductEducationProfile({
          ...base,
          variantLabel: variant.label,
        });
        expect(variantProfile.whatItIs).toContain(product.displayName);
      }
    }

    // Canonical artifact coverage includes the separate shipping row. This is
    // not a claim that all 424 are customer merchandise or purchase-enabled.
    expect(masterOfferings.products).toHaveLength(424);
    expect(representedVariants).toBe(424);
    const offeringIds = new Set(masterOfferings.products.map((product) => product.id));
    const variantIds = new Set(masterOfferings.products.flatMap((product) =>
      product.variants.map((variant) => variant.id)));
    expect(offeringIds.size).toBe(424);
    expect(variantIds.size).toBe(424);

    for (const [offeringId, variantId] of [
      ["mo_c4698a34aaaf7aec47b2", "mov_14b4034bef7ef37d9fc8"],
      ["mo_2babbadce5172426bde2", "mov_f61758881da2b7bfa539"],
      ["mo_f40119d9a74b2af15be6", "mov_cb3642e564392fa86dda"],
      ["mo_c77c4659a519b58ac795", "mov_be54afb7419ed7240752"],
      ["mo_3eec45f31e19795343f1", "mov_c26ef47dfbbe46f7e090"],
      ["mo_a535d8a2951bc7c6c0a3", "mov_3c8ca424d78153fd931a"],
    ]) {
      const product = masterOfferings.products.find((row) => row.id === offeringId);
      expect(product?.variants.map((variant) => variant.id)).toEqual([variantId]);
    }
    expect(offeringIds.has("mo_2aaac3a06aa0dd6b2923")).toBe(false);
    expect(offeringIds.has("mo_1dd0658eb7bf15f91900")).toBe(false);
    expect(variantIds.has("mov_7c55d415a9574e9ebda7")).toBe(false);
    expect(variantIds.has("mov_256cb0423eb6d2a77f65")).toBe(false);
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
});
