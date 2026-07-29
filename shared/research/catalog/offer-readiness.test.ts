import { describe, expect, it } from "vitest";
import {
  COA_EVIDENCE_STATES,
  describeOfferMode,
  explainOfferMode,
  hasNamedIdentity,
  isApprovedAmount,
  isSelfServePurchase,
  mayDisplayAmount,
  OFFER_AVAILABILITY_MODES,
  OFFER_LANES,
  OFFER_READINESS_STATES,
  resolveOfferMode,
  resolvePrivateLaneOfferMode,
  unresolved,
  type CoaEvidenceState,
  type OfferEvidence,
  type OfferLane,
} from "./offer-readiness";

const base: OfferEvidence = {
  lane: "supplement",
  approvedMemberAmountCents: 5299,
  supplierSkuCode: "R227",
  internalVariantSku: null,
  coaEvidence: "NOT_APPLICABLE",
  unavailable: false,
  directPurchaseEnabled: false,
};

function evidence(overrides: Partial<OfferEvidence> = {}): OfferEvidence {
  return { ...base, ...overrides };
}

describe("closed unions", () => {
  it("holds exactly the five offer modes", () => {
    expect(OFFER_AVAILABILITY_MODES).toEqual([
      "DIRECT_PRIVATE_PURCHASE",
      "APPROVAL_REQUIRED_PURCHASE",
      "REQUEST_ACCESS_ONLY",
      "DISPLAY_ONLY",
      "UNAVAILABLE",
    ]);
  });

  it("gives every mode a customer facing sentence, and never a price", () => {
    for (const mode of OFFER_AVAILABILITY_MODES) {
      const label = describeOfferMode(mode);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/\$/);
      expect(label).not.toMatch(/\b0\b/);
    }
  });

  it("uses the approved wording for the three private lane outcomes", () => {
    expect(describeOfferMode("APPROVAL_REQUIRED_PURCHASE")).toBe("Available by approval");
    expect(describeOfferMode("REQUEST_ACCESS_ONLY")).toBe("Request access");
    expect(describeOfferMode("DISPLAY_ONLY")).toBe("Not currently available");
    expect(describeOfferMode("UNAVAILABLE")).toBe("Not currently available");
  });

  it("marks only direct purchase as self serve", () => {
    for (const mode of OFFER_AVAILABILITY_MODES) {
      expect(isSelfServePurchase(mode)).toBe(mode === "DIRECT_PRIVATE_PURCHASE");
    }
  });

  it("shows an amount only where an amount was approved", () => {
    expect(mayDisplayAmount("DIRECT_PRIVATE_PURCHASE")).toBe(true);
    expect(mayDisplayAmount("APPROVAL_REQUIRED_PURCHASE")).toBe(true);
    expect(mayDisplayAmount("REQUEST_ACCESS_ONLY")).toBe(false);
    expect(mayDisplayAmount("DISPLAY_ONLY")).toBe(false);
    expect(mayDisplayAmount("UNAVAILABLE")).toBe(false);
  });

  it("keeps the readiness and lab evidence unions closed", () => {
    expect(OFFER_READINESS_STATES).toContain("NEEDS_FINAL_APPROVAL");
    expect(COA_EVIDENCE_STATES).toContain("PENDING_LAB_DOCUMENTATION");
    expect(new Set(OFFER_READINESS_STATES).size).toBe(OFFER_READINESS_STATES.length);
    expect(new Set(COA_EVIDENCE_STATES).size).toBe(COA_EVIDENCE_STATES.length);
  });
});

describe("amount and identity guards", () => {
  it("accepts only positive safe integers as an approved amount", () => {
    expect(isApprovedAmount(5299)).toBe(true);
    expect(isApprovedAmount(0)).toBe(false);
    expect(isApprovedAmount(-1)).toBe(false);
    expect(isApprovedAmount(52.99)).toBe(false);
    expect(isApprovedAmount(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(isApprovedAmount(null)).toBe(false);
  });

  it("requires a supplier code for a resale lane and rejects blank strings", () => {
    expect(hasNamedIdentity(evidence({ supplierSkuCode: "R227" }))).toBe(true);
    expect(hasNamedIdentity(evidence({ supplierSkuCode: "   " }))).toBe(false);
    expect(hasNamedIdentity(evidence({ supplierSkuCode: null }))).toBe(false);
  });

  it("does not let an internally minted sku stand in for a missing supplier code", () => {
    const resale = evidence({ supplierSkuCode: null, internalVariantSku: "N001-01" });
    expect(hasNamedIdentity(resale)).toBe(false);
    expect(resolveOfferMode(resale)).toBe("REQUEST_ACCESS_ONLY");
  });

  it("accepts an internal variant sku for a first party lane", () => {
    const firstParty = evidence({
      lane: "quantum",
      supplierSkuCode: null,
      internalVariantSku: "Q001-01",
    });
    expect(hasNamedIdentity(firstParty)).toBe(true);
  });
});

describe("resolveOfferMode fails closed in every direction", () => {
  it("lets an explicit unavailable flag beat a fully evidenced record", () => {
    const strongest = evidence({
      lane: "supplement",
      coaEvidence: "ON_FILE",
      directPurchaseEnabled: true,
      unavailable: true,
    });
    expect(resolveOfferMode(strongest)).toBe("UNAVAILABLE");
  });

  it("drops a priced, identified record to approval when direct checkout is off", () => {
    expect(resolveOfferMode(evidence({ directPurchaseEnabled: false }))).toBe(
      "APPROVAL_REQUIRED_PURCHASE",
    );
  });

  it("drops an unpriced but identified record to request access", () => {
    expect(resolveOfferMode(evidence({ approvedMemberAmountCents: null }))).toBe(
      "REQUEST_ACCESS_ONLY",
    );
    expect(resolveOfferMode(evidence({ approvedMemberAmountCents: 0 }))).toBe(
      "REQUEST_ACCESS_ONLY",
    );
  });

  it("drops an unpriced and unidentified record to display only", () => {
    const bare = evidence({
      approvedMemberAmountCents: null,
      supplierSkuCode: null,
      internalVariantSku: null,
    });
    expect(resolveOfferMode(bare)).toBe("DISPLAY_ONLY");
  });

  it("blocks a research material from direct purchase without lab documentation", () => {
    for (const coaEvidence of COA_EVIDENCE_STATES) {
      const mode = resolveOfferMode(
        evidence({
          lane: "research_material",
          supplierSkuCode: null,
          internalVariantSku: "P001-01",
          coaEvidence,
          directPurchaseEnabled: true,
        }),
      );
      expect(mode).toBe(
        coaEvidence === "ON_FILE" ? "DIRECT_PRIVATE_PURCHASE" : "APPROVAL_REQUIRED_PURCHASE",
      );
    }
  });

  it("blocks direct purchase whenever lab documentation is pending, in every lane", () => {
    for (const lane of OFFER_LANES) {
      const mode = resolveOfferMode(
        evidence({
          lane,
          supplierSkuCode: lane === "supplement" ? "R227" : null,
          internalVariantSku: lane === "supplement" ? null : "X001-01",
          coaEvidence: "PENDING_LAB_DOCUMENTATION",
          directPurchaseEnabled: true,
        }),
      );
      expect(mode).not.toBe("DIRECT_PRIVATE_PURCHASE");
    }
  });
});

describe("no input combination reaches direct purchase without price and lab evidence", () => {
  // Exhaustive sweep of every combination of the inputs that matter.
  const lanes: OfferLane[] = [...OFFER_LANES];
  const amounts: Array<number | null> = [null, 0, -500, 180000];
  const supplierCodes: Array<string | null> = [null, "", "R227"];
  const internalSkus: Array<string | null> = [null, "", "Q001-01"];
  const coaStates: CoaEvidenceState[] = [...COA_EVIDENCE_STATES];
  const flags = [false, true];

  it("holds across the full cartesian product", () => {
    let direct = 0;
    let total = 0;
    for (const lane of lanes) {
      for (const approvedMemberAmountCents of amounts) {
        for (const supplierSkuCode of supplierCodes) {
          for (const internalVariantSku of internalSkus) {
            for (const coaEvidence of coaStates) {
              for (const unavailable of flags) {
                for (const directPurchaseEnabled of flags) {
                  total += 1;
                  const input: OfferEvidence = {
                    lane,
                    approvedMemberAmountCents,
                    supplierSkuCode,
                    internalVariantSku,
                    coaEvidence,
                    unavailable,
                    directPurchaseEnabled,
                  };
                  const mode = resolveOfferMode(input);
                  expect(OFFER_AVAILABILITY_MODES).toContain(mode);
                  if (mode === "DIRECT_PRIVATE_PURCHASE") {
                    direct += 1;
                    // The two invariants the brief pins.
                    expect(isApprovedAmount(approvedMemberAmountCents)).toBe(true);
                    expect(coaEvidence).not.toBe("PENDING_LAB_DOCUMENTATION");
                    // Plus the three the module promises.
                    expect(coaEvidence).not.toBe("NOT_ON_FILE");
                    expect(directPurchaseEnabled).toBe(true);
                    expect(unavailable).toBe(false);
                    expect(hasNamedIdentity(input)).toBe(true);
                    if (lane === "research_material") {
                      expect(coaEvidence).toBe("ON_FILE");
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(total).toBeGreaterThan(500);
    // The mode is reachable in principle, which is what makes the guard meaningful.
    expect(direct).toBeGreaterThan(0);
  });

  it("is unreachable through the private lane entry point, whatever the evidence", () => {
    for (const lane of lanes) {
      for (const approvedMemberAmountCents of amounts) {
        for (const supplierSkuCode of supplierCodes) {
          for (const internalVariantSku of internalSkus) {
            for (const coaEvidence of coaStates) {
              for (const unavailable of flags) {
                const mode = resolvePrivateLaneOfferMode({
                  lane,
                  approvedMemberAmountCents,
                  supplierSkuCode,
                  internalVariantSku,
                  coaEvidence,
                  unavailable,
                });
                expect(mode).not.toBe("DIRECT_PRIVATE_PURCHASE");
              }
            }
          }
        }
      }
    }
  });
});

describe("explanations and unresolved fields", () => {
  it("names the blocking reasons in plain language", () => {
    const reasons = explainOfferMode(
      evidence({
        approvedMemberAmountCents: null,
        supplierSkuCode: null,
        coaEvidence: "PENDING_LAB_DOCUMENTATION",
      }),
    );
    expect(reasons.join(" ")).toContain("No founder approved customer amount");
    expect(reasons.join(" ")).toContain("supplier item code");
    expect(reasons.join(" ")).toContain("Lab documentation is pending");
  });

  it("returns no blocking reasons for a fully evidenced direct record", () => {
    const reasons = explainOfferMode(
      evidence({ coaEvidence: "ON_FILE", directPurchaseEnabled: true }),
    );
    expect(reasons).toEqual([]);
  });

  it("builds an unresolved field that can only ever be null", () => {
    const field = unresolved("supplier specification sheet", "certificate of analysis");
    expect(field.value).toBeNull();
    expect(field.missingInputs).toHaveLength(2);
  });
});
