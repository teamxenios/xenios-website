import { describe, expect, it } from "vitest";
import {
  MASTER_OFFERING_DISPLAY_LABELS,
  MASTER_OFFERING_FAMILIES,
  type MasterOfferingFamily,
} from "@shared/research/master-offerings/contract";
import {
  MASTER_OFFERING_CATALOG_DISCLOSURE,
  MASTER_OFFERING_RESEARCH_DISCLOSURE,
  projectMasterOfferingCard,
  projectMasterOfferingDetail,
} from "./customer-projection";
import { offering, variant } from "./test-fixtures";

const PRIVATE_KEYS = [
  "supplierOrOwner",
  "sourceSku",
  "sourceReferences",
  "canonicalKey",
  "updatedWholesaleCost",
  "updatedSellPrice",
  "recommendedLaunchSellPrice",
  "updatedGrossMargin",
] as const;

function everyKey(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) everyKey(entry, output);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      output.push(key);
      everyKey(child, output);
    }
  }
  return output;
}

describe("master offering customer projection", () => {
  it("projects an explicit safe shape with no source, supplier, or planning-money fields", () => {
    const detail = projectMasterOfferingDetail(offering());
    const keys = everyKey(JSON.parse(JSON.stringify(detail)));
    for (const privateKey of PRIVATE_KEYS) {
      expect(keys).not.toContain(privateKey);
    }
    expect(detail.variants[0].action.kind).toBe("request_access");
  });

  it("refuses an admin-only product rather than trusting the caller to hide it", () => {
    expect(() => projectMasterOfferingCard(offering({ visibility: "admin_only" }))).toThrow(
      /Refused to project admin-only offering/,
    );
  });

  it("renders research boundary disclosures on research families", () => {
    const detail = projectMasterOfferingDetail(offering({ family: "research_vials" }));
    expect(detail.disclosures).toHaveLength(2);
    expect(detail.disclosures.join(" ")).toContain("nonclinical catalog navigation");
    expect(detail.disclosures.join(" ")).toContain("Product Control remains the purchase authority");
  });
});

// The research families of the shared catalog taxonomy: the three legacy
// families and the three master-catalog workbook families. Stated here
// independently of the projector, so the test is a second statement of the
// rule rather than a copy of it.
const RESEARCH_FAMILIES = [
  "research_vials",
  "blends",
  "laboratory_supplies",
  "research_capsules",
  "research_peptides_materials",
  "research_supplies",
] as const satisfies readonly MasterOfferingFamily[];

const NONRESEARCH_FAMILIES = MASTER_OFFERING_FAMILIES.filter(
  (family) => !(RESEARCH_FAMILIES as readonly string[]).includes(family),
);

function occurrences(values: readonly string[], value: string): number {
  return values.filter((entry) => entry === value).length;
}

describe("member detail research boundary notice", () => {
  it("classifies every family in the shared catalog taxonomy", () => {
    expect(RESEARCH_FAMILIES).toHaveLength(6);
    expect(new Set(RESEARCH_FAMILIES).size).toBe(RESEARCH_FAMILIES.length);
    for (const family of RESEARCH_FAMILIES) {
      expect(MASTER_OFFERING_FAMILIES).toContain(family);
    }
    expect(NONRESEARCH_FAMILIES.length + RESEARCH_FAMILIES.length).toBe(
      MASTER_OFFERING_FAMILIES.length,
    );
    // The two controls in the mounted acceptance cases are nonresearch.
    expect(NONRESEARCH_FAMILIES).toEqual(
      expect.arrayContaining(["clinical_formulations_503a", "supplements"]),
    );
  });

  it("keeps the exact notice and purchase-authority wording", () => {
    expect(MASTER_OFFERING_RESEARCH_DISCLOSURE).toBe(
      "Research listings are presented for nonclinical catalog navigation. They are not treatment recommendations or instructions for human use.",
    );
    expect(MASTER_OFFERING_CATALOG_DISCLOSURE).toBe(
      "Catalog visibility does not establish availability, clinical suitability, or purchase eligibility. Product Control remains the purchase authority.",
    );
  });

  it.each(RESEARCH_FAMILIES)(
    "shows the research notice once, before the catalog disclosure, on %s",
    (family) => {
      const detail = projectMasterOfferingDetail(offering({ family }));
      expect(detail.disclosures).toEqual([
        MASTER_OFFERING_RESEARCH_DISCLOSURE,
        MASTER_OFFERING_CATALOG_DISCLOSURE,
      ]);
    },
  );

  it.each(NONRESEARCH_FAMILIES)(
    "shows only the catalog disclosure on the nonresearch family %s",
    (family) => {
      const detail = projectMasterOfferingDetail(offering({ family }));
      expect(detail.disclosures).toEqual([MASTER_OFFERING_CATALOG_DISCLOSURE]);
    },
  );

  it.each(MASTER_OFFERING_FAMILIES)(
    "adds only a null overview and the disclosure list to the card on %s",
    (family) => {
      // Price, action, copy, media and state are the card projection's own,
      // carried into detail unchanged. The detail layer adds nothing but a
      // null overview and the disclosure list, so the family rule above can
      // reach nothing else.
      const source = offering({ family });
      const { disclosures, overview, ...card } = projectMasterOfferingDetail(source);
      expect(overview).toBeNull();
      expect(card).toEqual(projectMasterOfferingCard(source));
      expect(occurrences(disclosures, MASTER_OFFERING_CATALOG_DISCLOSURE)).toBe(1);
    },
  );

  it("keeps the classification-pending explanation on the newly covered research families", () => {
    const pending =
      "Visible while classification and documentation are completed. Register interest and the team follows up when it activates.";
    for (const family of [
      "research_peptides_materials",
      "research_capsules",
      "research_supplies",
    ] as const) {
      const detail = projectMasterOfferingDetail(
        offering({
          family,
          displayState: "approval_required",
          stateExplanation: pending,
          variants: [variant({ displayState: "approval_required" })],
        }),
      );
      expect(detail.stateExplanation, family).toBe(pending);
      expect(detail.displayState, family).toBe("approval_required");
      expect(detail.displayLabel, family).toBe(MASTER_OFFERING_DISPLAY_LABELS.approval_required);
      expect(occurrences(detail.disclosures, MASTER_OFFERING_RESEARCH_DISCLOSURE), family).toBe(1);
      expect(occurrences(detail.disclosures, MASTER_OFFERING_CATALOG_DISCLOSURE), family).toBe(1);
    }
  });

  it("keeps the research-use explanation on a request-access research listing", () => {
    // The notice does not depend on display state: a request-access research
    // supply carries its own research-use explanation and the notice.
    const researchUse =
      "Research use only. Request access and the team confirms availability for this exact item.";
    const detail = projectMasterOfferingDetail(
      offering({
        family: "research_supplies",
        displayState: "request_access",
        stateExplanation: researchUse,
        variants: [variant({ displayState: "request_access" })],
      }),
    );
    expect(detail.stateExplanation).toBe(researchUse);
    expect(detail.displayState).toBe("request_access");
    expect(detail.displayLabel).toBe(MASTER_OFFERING_DISPLAY_LABELS.request_access);
    expect(detail.variants[0].action.kind).toBe("request_access");
    expect(detail.disclosures).toEqual([
      MASTER_OFFERING_RESEARCH_DISCLOSURE,
      MASTER_OFFERING_CATALOG_DISCLOSURE,
    ]);
  });
});
