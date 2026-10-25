import { describe, expect, it } from "vitest";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  CARE_MANDATED_CLASSES,
  classifyNeuroRow,
  countNeuroStates,
  isCareRoutedClass,
  isRowVerified,
  mayPresentAsOffer,
  missingVerificationInputs,
  NEURO_OPERATING_CLASSES,
  NEURO_VERIFICATION_INPUTS,
  resolveNeuroPresentation,
  UNVERIFIED,
  type EvidenceReference,
  type NeuroOperatingClass,
  type NeuroRecord,
  type NeuroVerification,
} from "./classification";

function evidence(documentId: string): EvidenceReference {
  return { documentId, recordedBy: "samuel.boadu", recordedAt: "2026-08-01" };
}

/** Every verification input satisfied. Only ever built explicitly, in a test. */
const FULLY_VERIFIED: NeuroVerification = Object.fromEntries(
  NEURO_VERIFICATION_INPUTS.map((input) => [input, evidence(`DOC-${input}`)]),
) as NeuroVerification;

function record(overrides: Partial<NeuroRecord> = {}): NeuroRecord {
  return {
    id: "NEU-TEST",
    item: "Test item",
    sourceClass: "Supplement",
    sourceRoute: "Authorized supplement",
    sourceLane: "Public wellness",
    operatingClass: "authorized_supplement",
    classificationRuleId: "NEU-RULE-06-SUPPLEMENT",
    discoverySource: "ScientificSean / Xenios master / official product sources as applicable",
    requiredProfessionalReview: "Label",
    publicBoundary:
      "Do not publish benefits, dosing, or personal recommendations without approved evidence and route",
    verification: UNVERIFIED,
    approvedCustomerAmountCents: null,
    supplierSkuCode: null,
    internalVariantSku: null,
    coaEvidence: "NOT_ON_FILE",
    unavailable: false,
    ...overrides,
  };
}

describe("closed unions", () => {
  it("holds exactly the eight operating classes, in order", () => {
    expect(NEURO_OPERATING_CLASSES).toEqual([
      "education",
      "consumer_wellness",
      "authorized_supplement",
      "research_material",
      "professional_assessment",
      "clinician_supervised_service",
      "prescription_required_pathway",
      "investigational_held",
    ]);
  });

  it("names the six row level verification inputs", () => {
    expect(NEURO_VERIFICATION_INPUTS).toEqual([
      "exact_product_or_service",
      "rights_to_offer",
      "prescriber_requirement",
      "source",
      "approved_customer_amount",
      "availability",
    ]);
  });

  it("mandates Care routing for the prescription and clinician supervised classes", () => {
    expect(CARE_MANDATED_CLASSES).toEqual([
      "prescription_required_pathway",
      "clinician_supervised_service",
    ]);
    for (const operatingClass of CARE_MANDATED_CLASSES) {
      expect(isCareRoutedClass(operatingClass)).toBe(true);
    }
  });
});

describe("verification", () => {
  it("starts every row with nothing established", () => {
    expect(isRowVerified(UNVERIFIED)).toBe(false);
    expect(missingVerificationInputs(UNVERIFIED)).toEqual([...NEURO_VERIFICATION_INPUTS]);
  });

  it("needs all six inputs, not five", () => {
    for (const input of NEURO_VERIFICATION_INPUTS) {
      const partial = { ...FULLY_VERIFIED, [input]: null } as NeuroVerification;
      expect(isRowVerified(partial)).toBe(false);
      expect(missingVerificationInputs(partial)).toEqual([input]);
    }
    expect(isRowVerified(FULLY_VERIFIED)).toBe(true);
  });

  it("rejects an evidence reference that is blank or undated", () => {
    const blank = {
      ...FULLY_VERIFIED,
      source: { documentId: "  ", recordedBy: "sam", recordedAt: "2026-08-01" },
    } as NeuroVerification;
    expect(isRowVerified(blank)).toBe(false);

    const undated = {
      ...FULLY_VERIFIED,
      source: { documentId: "DOC-1", recordedBy: "sam", recordedAt: "soon" },
    } as NeuroVerification;
    expect(isRowVerified(undated)).toBe(false);

    const anonymous = {
      ...FULLY_VERIFIED,
      source: { documentId: "DOC-1", recordedBy: "", recordedAt: "2026-08-01" },
    } as NeuroVerification;
    expect(isRowVerified(anonymous)).toBe(false);
  });
});

describe("classification rules", () => {
  const cases: readonly [string, string, string, NeuroOperatingClass, string][] = [
    // [class, route, lane, expected class, expected rule]
    [
      "Peptide / nootropic",
      "Qualified Research; potential future professional route",
      "Research / Investigational",
      "research_material",
      "NEU-RULE-05-RESEARCH",
    ],
    ["Supplement", "Authorized supplement", "Public wellness", "authorized_supplement", "NEU-RULE-06-SUPPLEMENT"],
    [
      "Prescription medication",
      "Licensed professional and lawful pharmacy",
      "Prescription required",
      "prescription_required_pathway",
      "NEU-RULE-02-PRESCRIPTION",
    ],
    [
      "Schedule II prescription",
      "Licensed professional; controlled-telemedicine rules",
      "Prescription required",
      "prescription_required_pathway",
      "NEU-RULE-02-PRESCRIPTION",
    ],
    ["Diagnostic", "Clinician-ordered service", "Care", "clinician_supervised_service", "NEU-RULE-03-CLINICIAN-SERVICE"],
    ["Lab panel", "Clinician-ordered and reviewed", "Care", "clinician_supervised_service", "NEU-RULE-03-CLINICIAN-SERVICE"],
    ["Assessment", "Professional assessment service", "Care / professional", "professional_assessment", "NEU-RULE-04-ASSESSMENT"],
    [
      "Peptide / sleep",
      "Qualified Research; official 2026 PCAC review",
      "Research / Held pending exact strategy",
      "investigational_held",
      "NEU-RULE-01-HELD",
    ],
    [
      "Poorly documented research compound",
      "Do not pursue without identity/toxicology",
      "Held",
      "investigational_held",
      "NEU-RULE-01-HELD",
    ],
    [
      "Cofactor / product class",
      "Supplement / Research / Care depending form",
      "Multi-rail",
      "investigational_held",
      "NEU-RULE-09-FAIL-CLOSED",
    ],
    [
      "Supplement / polysaccharide",
      "Education / supplement if sourced",
      "Public wellness",
      "education",
      "NEU-RULE-07-EDUCATION",
    ],
  ];

  for (const [sourceClass, sourceRoute, sourceLane, expected, ruleId] of cases) {
    it(`classifies ${sourceClass} on ${sourceLane} as ${expected}`, () => {
      const result = classifyNeuroRow({ sourceClass, sourceRoute, sourceLane });
      expect(result.operatingClass).toBe(expected);
      expect(result.ruleId).toBe(ruleId);
    });
  }

  it("holds beats everything, even a Care lane", () => {
    const result = classifyNeuroRow({
      sourceClass: "Injectable nutrient blend",
      sourceRoute: "Professional / pharmacy product review",
      sourceLane: "Care / held pending source",
    });
    expect(result.operatingClass).toBe("investigational_held");
  });

  it("does not reclassify a research row on a substring of the class name", () => {
    // "Research / prescription abroad" is a Qualified Research row whose open
    // question is jurisdiction. Jurisdiction is a verification input, not a
    // reason to move the row onto a prescription pathway.
    expect(
      classifyNeuroRow({
        sourceClass: "Research / prescription abroad",
        sourceRoute: "Qualified Research / jurisdiction review",
        sourceLane: "Research / athlete review",
      }).operatingClass,
    ).toBe("research_material");

    expect(
      classifyNeuroRow({
        sourceClass: "Supplement / prescription by country",
        sourceRoute: "Authorized supplement where lawful",
        sourceLane: "Public / jurisdiction review",
      }).operatingClass,
    ).toBe("authorized_supplement");
  });

  it("falls closed on anything it does not recognise", () => {
    expect(
      classifyNeuroRow({ sourceClass: "", sourceRoute: "", sourceLane: "" }).operatingClass,
    ).toBe("investigational_held");
    expect(
      classifyNeuroRow({
        sourceClass: "Something new",
        sourceRoute: "Some future route",
        sourceLane: "Some future lane",
      }).ruleId,
    ).toBe("NEU-RULE-09-FAIL-CLOSED");
  });
});

describe("THE GATE: an unverified row cannot present as an offer", () => {
  const offerable: readonly NeuroOperatingClass[] = [
    "consumer_wellness",
    "authorized_supplement",
    "research_material",
  ];

  for (const operatingClass of offerable) {
    it(`holds ${operatingClass} at display only while unverified, even with a price and a sku`, () => {
      const rec = record({
        operatingClass,
        verification: UNVERIFIED,
        // Everything commerce would want is present. It still does not matter.
        approvedCustomerAmountCents: 4999,
        supplierSkuCode: "SUP-1",
        internalVariantSku: "INT-1",
        coaEvidence: "ON_FILE",
      });
      const presentation = resolveNeuroPresentation(rec);

      expect(mayPresentAsOffer(rec)).toBe(false);
      expect(presentation.surface).toBe("research");
      expect(presentation.offerMode).toBe("DISPLAY_ONLY");
      expect(presentation.addToCart).toBe(false);
      expect(presentation.mayDisplayAmount).toBe(false);
      expect(presentation.label).toBe("Not currently available");
      expect(presentation.label).not.toContain("$");
      expect(presentation.reasons.join(" ")).toContain("has not been verified row by row");
    });

    it(`still refuses ${operatingClass} when five of six inputs are verified`, () => {
      const partial = { ...FULLY_VERIFIED, availability: null } as NeuroVerification;
      const rec = record({
        operatingClass,
        verification: partial,
        approvedCustomerAmountCents: 4999,
        supplierSkuCode: "SUP-1",
        coaEvidence: "ON_FILE",
      });
      expect(mayPresentAsOffer(rec)).toBe(false);
      expect(resolveNeuroPresentation(rec).offerMode).toBe("DISPLAY_ONLY");
    });
  }

  it("lets a fully verified, priced, identified supplement reach approval required purchase", () => {
    const rec = record({
      operatingClass: "authorized_supplement",
      verification: FULLY_VERIFIED,
      approvedCustomerAmountCents: 4999,
      supplierSkuCode: "SUP-1",
      coaEvidence: "NOT_APPLICABLE",
    });
    const presentation = resolveNeuroPresentation(rec);

    expect(mayPresentAsOffer(rec)).toBe(true);
    expect(presentation.offerMode).toBe("APPROVAL_REQUIRED_PURCHASE");
    // The private lane resolver pins the global commerce switch off, so a self
    // serve add to cart is structurally unreachable here.
    expect(presentation.addToCart).toBe(false);
  });

  it("a verified research material with no lab documentation cannot be bought directly", () => {
    const rec = record({
      operatingClass: "research_material",
      verification: FULLY_VERIFIED,
      approvedCustomerAmountCents: 12900,
      internalVariantSku: "XEN-RM-1",
      coaEvidence: "NOT_ON_FILE",
    });
    expect(resolveNeuroPresentation(rec).offerMode).toBe("APPROVAL_REQUIRED_PURCHASE");
    expect(resolveNeuroPresentation(rec).addToCart).toBe(false);
  });

  it("a verified row with no approved amount never shows an amount", () => {
    const rec = record({
      operatingClass: "authorized_supplement",
      verification: FULLY_VERIFIED,
      approvedCustomerAmountCents: null,
      supplierSkuCode: "SUP-1",
    });
    const presentation = resolveNeuroPresentation(rec);
    expect(presentation.offerMode).toBe("REQUEST_ACCESS_ONLY");
    expect(presentation.mayDisplayAmount).toBe(false);
    expect(presentation.label).not.toContain("$");
  });
});

describe("THE GATE: Care classes route to Care and never expose add to cart", () => {
  for (const operatingClass of [...CARE_MANDATED_CLASSES, "professional_assessment"] as const) {
    it(`routes ${operatingClass} to Care while unverified`, () => {
      const presentation = resolveNeuroPresentation(record({ operatingClass }));
      expect(presentation.surface).toBe("care");
      expect(presentation.careRoute).toBe(CARE_ROUTE_CONTRACTS.publicShell);
      expect(presentation.addToCart).toBe(false);
      expect(presentation.offerMode).toBeNull();
      expect(presentation.mayDisplayAmount).toBe(false);
    });

    it(`routes ${operatingClass} to Care even when fully verified, priced, and identified`, () => {
      const rec = record({
        operatingClass,
        verification: FULLY_VERIFIED,
        approvedCustomerAmountCents: 19900,
        supplierSkuCode: "SUP-9",
        internalVariantSku: "INT-9",
        coaEvidence: "ON_FILE",
      });
      const presentation = resolveNeuroPresentation(rec);

      expect(presentation.surface).toBe("care");
      expect(presentation.careRoute).toBe(CARE_ROUTE_CONTRACTS.publicShell);
      expect(presentation.addToCart).toBe(false);
      expect(presentation.offerMode).toBeNull();
      expect(mayPresentAsOffer(rec)).toBe(false);
    });
  }

  it("uses the existing Care route contract rather than a second convention", () => {
    expect(CARE_ROUTE_CONTRACTS.publicShell).toBe("/care");
    expect(resolveNeuroPresentation(record({ operatingClass: "prescription_required_pathway" })).careRoute).toBe(
      CARE_ROUTE_CONTRACTS.publicShell,
    );
  });
});

describe("held and education surfaces", () => {
  it("never presents a held row on any customer surface", () => {
    const rec = record({
      operatingClass: "investigational_held",
      verification: FULLY_VERIFIED,
      approvedCustomerAmountCents: 9900,
      supplierSkuCode: "SUP-2",
    });
    const presentation = resolveNeuroPresentation(rec);
    expect(presentation.surface).toBe("internal_only");
    expect(presentation.addToCart).toBe(false);
    expect(presentation.label).toBe("Not currently available");
    expect(mayPresentAsOffer(rec)).toBe(false);
  });

  it("presents education with no commerce control", () => {
    const presentation = resolveNeuroPresentation(
      record({ operatingClass: "education", verification: FULLY_VERIFIED }),
    );
    expect(presentation.surface).toBe("education");
    expect(presentation.addToCart).toBe(false);
    expect(presentation.offerMode).toBeNull();
  });
});

describe("counts", () => {
  it("reports the real state of a set of records", () => {
    const counts = countNeuroStates([
      record({ operatingClass: "research_material" }),
      record({ operatingClass: "prescription_required_pathway" }),
      record({ operatingClass: "investigational_held" }),
      record({
        operatingClass: "authorized_supplement",
        verification: FULLY_VERIFIED,
        approvedCustomerAmountCents: 4999,
        supplierSkuCode: "SUP-1",
        coaEvidence: "NOT_APPLICABLE",
      }),
    ]);

    expect(counts.total).toBe(4);
    expect(counts.verified).toBe(1);
    expect(counts.unverified).toBe(3);
    expect(counts.byOperatingClass.research_material).toBe(1);
    expect(counts.bySurface.care).toBe(1);
    expect(counts.bySurface.internal_only).toBe(1);
    expect(counts.presentableAsOffer).toBe(1);
    expect(counts.withAddToCart).toBe(0);
  });
});
