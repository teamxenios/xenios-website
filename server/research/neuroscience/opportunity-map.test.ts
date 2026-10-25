import { describe, expect, it } from "vitest";
import { CARE_ROUTE_CONTRACTS } from "@shared/care/contracts";
import {
  isRowVerified,
  mayPresentAsOffer,
  missingVerificationInputs,
  NEURO_VERIFICATION_INPUTS,
  resolveNeuroPresentation,
  type NeuroOperatingClass,
} from "@shared/research/neuroscience/classification";
import {
  classificationRuleHistogram,
  DISCOVERY_CATEGORIES,
  DISCOVERY_VENDORS,
  findNeuroRecord,
  NEURO_SOURCE_ROWS,
  NEUROSCIENCE_OPPORTUNITY_MAP,
  NEUROSCIENCE_SCOPE_STATEMENT,
  neuroRecordsByClass,
  neuroscienceCounts,
  offerableNeuroRecords,
  routeNeuroRecords,
  toNeuroRecord,
} from "./opportunity-map";

describe("the import is exactly what the workbook says", () => {
  it("holds all 120 rows from sheet 44 Neuroscience Map", () => {
    expect(NEURO_SOURCE_ROWS).toHaveLength(120);
    expect(NEUROSCIENCE_OPPORTUNITY_MAP).toHaveLength(120);
    expect(NEURO_SOURCE_ROWS[0]?.id).toBe("NEU-0001");
    expect(NEURO_SOURCE_ROWS[119]?.id).toBe("NEU-0120");
  });

  it("keeps the ids unique and in NEU-NNNN form", () => {
    const ids = NEUROSCIENCE_OPPORTUNITY_MAP.map((record) => record.id);
    expect(new Set(ids).size).toBe(120);
    for (const id of ids) expect(id).toMatch(/^NEU-\d{4}$/);
  });

  it("carries the workbook's status and boundary on every row", () => {
    for (const row of NEURO_SOURCE_ROWS) {
      expect(row.sourceStatus).toBe("Review");
      expect(row.publicBoundary).toContain("Do not publish benefits, dosing");
      expect(row.discoverySource).toContain("ScientificSean");
    }
    expect(NEUROSCIENCE_SCOPE_STATEMENT).toContain(
      "Listing does not mean recommendation, availability, legality, safety or approval",
    );
  });

  it("carries no dosing, administration, or claim language", () => {
    const banned =
      /\b(?:\d+\s*(?:mg|mcg|iu|ml)\b|dosage|reconstitut\w*|subcutaneous|intramuscular|cures?|guaranteed)\b/i;
    for (const row of NEURO_SOURCE_ROWS) {
      for (const value of Object.values(row)) {
        if (typeof value === "string") {
          expect(value).not.toMatch(banned);
          expect(value).not.toContain("—");
        }
      }
    }
  });

  it("transcribes the discovery provenance without copying any product content", () => {
    expect(DISCOVERY_CATEGORIES).toHaveLength(19);
    expect(DISCOVERY_VENDORS).toHaveLength(11);
    for (const category of DISCOVERY_CATEGORIES) {
      expect(category.observedListingCount).toBeGreaterThan(0);
      expect(category.action.length).toBeGreaterThan(0);
    }
    for (const vendor of DISCOVERY_VENDORS) {
      // A vendor appearing on a discovery source is not a Xenios relationship,
      // and nothing in the row may read as clearance or authorization.
      expect(vendor.relationship).not.toMatch(/approved|authorized|cleared|contracted/i);
      expect(vendor.action).not.toMatch(/\b(?:approved|authorized|cleared|contracted)\b/i);
      expect(vendor.observedListingCount).toBeGreaterThan(0);
    }
  });
});

describe("THE GATE: every imported row is unverified and cannot present as an offer", () => {
  it("imports all 120 rows with nothing verified", () => {
    for (const record of NEUROSCIENCE_OPPORTUNITY_MAP) {
      expect(isRowVerified(record.verification)).toBe(false);
      expect(missingVerificationInputs(record.verification)).toEqual([
        ...NEURO_VERIFICATION_INPUTS,
      ]);
    }
    const counts = neuroscienceCounts();
    expect(counts.verified).toBe(0);
    expect(counts.unverified).toBe(120);
  });

  it("presents none of the 120 rows as an offer", () => {
    expect(offerableNeuroRecords()).toHaveLength(0);
    for (const record of NEUROSCIENCE_OPPORTUNITY_MAP) {
      expect(mayPresentAsOffer(record)).toBe(false);
    }
    expect(neuroscienceCounts().presentableAsOffer).toBe(0);
  });

  it("shows no add to cart control anywhere in the map", () => {
    for (const { presentation } of routeNeuroRecords()) {
      expect(presentation.addToCart).toBe(false);
      expect(presentation.mayDisplayAmount).toBe(false);
    }
    expect(neuroscienceCounts().withAddToCart).toBe(0);
  });

  it("never carries a price, a supplier code, or a lab document it does not have", () => {
    for (const record of NEUROSCIENCE_OPPORTUNITY_MAP) {
      expect(record.approvedCustomerAmountCents).toBeNull();
      expect(record.supplierSkuCode).toBeNull();
      expect(record.internalVariantSku).toBeNull();
      expect(record.coaEvidence).toBe("NOT_ON_FILE");
    }
  });

  it("never renders a zero amount, and says not currently available instead", () => {
    for (const { presentation } of routeNeuroRecords()) {
      expect(presentation.label).not.toContain("$");
      expect(presentation.label).not.toMatch(/\b0\.00\b/);
    }
    const research = routeNeuroRecords().filter(({ presentation }) => presentation.surface === "research");
    for (const { presentation } of research) {
      expect(presentation.label).toBe("Not currently available");
    }
  });
});

describe("THE GATE: Care classes route to Care", () => {
  it("routes every prescription and clinician supervised row to Care with no cart", () => {
    const careClasses: readonly NeuroOperatingClass[] = [
      "prescription_required_pathway",
      "clinician_supervised_service",
    ];
    let routed = 0;
    for (const operatingClass of careClasses) {
      for (const record of neuroRecordsByClass(operatingClass)) {
        const presentation = resolveNeuroPresentation(record);
        expect(presentation.surface).toBe("care");
        expect(presentation.careRoute).toBe(CARE_ROUTE_CONTRACTS.publicShell);
        expect(presentation.addToCart).toBe(false);
        expect(presentation.offerMode).toBeNull();
        routed += 1;
      }
    }
    // 16 prescription rows plus 6 clinician supervised rows.
    expect(routed).toBe(22);
  });

  it("routes the two professional assessments to Care as well", () => {
    const assessments = neuroRecordsByClass("professional_assessment");
    expect(assessments).toHaveLength(2);
    for (const record of assessments) {
      expect(resolveNeuroPresentation(record).surface).toBe("care");
    }
  });
});

describe("classification, with the real counts", () => {
  it("puts every row in exactly one of the eight operating classes", () => {
    expect(neuroscienceCounts().byOperatingClass).toEqual({
      education: 1,
      consumer_wellness: 0,
      authorized_supplement: 32,
      research_material: 53,
      professional_assessment: 2,
      clinician_supervised_service: 6,
      prescription_required_pathway: 16,
      investigational_held: 10,
    });
  });

  it("routes the map across four surfaces", () => {
    expect(neuroscienceCounts().bySurface).toEqual({
      research: 85,
      care: 24,
      education: 1,
      internal_only: 10,
    });
  });

  it("records which rule decided each row", () => {
    expect(classificationRuleHistogram()).toEqual({
      "NEU-RULE-01-HELD": 5,
      "NEU-RULE-02-PRESCRIPTION": 16,
      "NEU-RULE-03-CLINICIAN-SERVICE": 6,
      "NEU-RULE-04-ASSESSMENT": 2,
      "NEU-RULE-05-RESEARCH": 53,
      "NEU-RULE-06-SUPPLEMENT": 32,
      "NEU-RULE-07-EDUCATION": 1,
      "NEU-RULE-09-FAIL-CLOSED": 5,
    });
  });

  it("holds the 5 rows the rules cannot place, rather than guessing", () => {
    const failClosed = NEUROSCIENCE_OPPORTUNITY_MAP.filter(
      (record) => record.classificationRuleId === "NEU-RULE-09-FAIL-CLOSED",
    );
    expect(failClosed).toHaveLength(5);
    for (const record of failClosed) {
      expect(record.operatingClass).toBe("investigational_held");
      expect(resolveNeuroPresentation(record).surface).toBe("internal_only");
    }
  });

  it("keeps the source columns beside the classification so a row can be audited", () => {
    const semax = findNeuroRecord("NEU-0001");
    expect(semax).toBeDefined();
    expect(semax?.item).toBe("Semax");
    expect(semax?.sourceClass).toBe("Peptide / nootropic");
    expect(semax?.sourceLane).toBe("Research / Investigational");
    expect(semax?.operatingClass).toBe("research_material");
    expect(semax?.classificationRuleId).toBe("NEU-RULE-05-RESEARCH");
  });

  it("projects a row without inventing commerce fields", () => {
    const row = NEURO_SOURCE_ROWS[0];
    expect(row).toBeDefined();
    const record = toNeuroRecord(row!);
    expect(record.verification).toEqual(
      Object.fromEntries(NEURO_VERIFICATION_INPUTS.map((input) => [input, null])),
    );
    expect(record.approvedCustomerAmountCents).toBeNull();
  });
});
