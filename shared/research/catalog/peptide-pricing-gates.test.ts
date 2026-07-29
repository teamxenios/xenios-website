import { describe, expect, it } from "vitest";
import {
  blockingPriceEvidenceGates,
  canActivatePricing,
  CLEARED_GATE_STATE,
  findPricingGate,
  gateIsClear,
  PEPTIDE_PRICING_GATE_COUNT,
  PEPTIDE_PRICING_GATES,
  PRICE_EVIDENCE_GATE_IDS,
  PRICING_GATE_SEVERITIES,
  PRICING_GATE_STATES,
  pricingGatesBySeverity,
  withGatesCleared,
  type PricingGate,
} from "./peptide-pricing-gates";

// Built from code points so this file does not itself carry the forbidden characters.
const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

/**
 * The five price-evidence gates transcribed a second time, straight from the
 * workbook's Compliance Gates sheet. Every assertion about them resolves back to
 * this table, so an edit to the module cannot pass by changing the value and its
 * test together.
 */
const PRICE_EVIDENCE_TRANSCRIPTION: ReadonlyArray<
  [string, string, string, string, string]
> = [
  [
    "exact_product_identity_presentation",
    "Exact product identity / presentation",
    "FAIL",
    "CRITICAL",
    "11 material strength or pack conflicts across 15 current SKUs",
  ],
  [
    "lot_matched_coa_files",
    "Lot-matched COA files",
    "FAIL",
    "CRITICAL",
    "0 of 65 referenced attachments received or verified",
  ],
  [
    "purity_mass_sterility_endotoxin",
    "Purity, mass, sterility, endotoxin",
    "UNKNOWN",
    "CRITICAL",
    "Not present in current implementation",
  ],
  [
    "lot_and_expiry",
    "Lot and expiry",
    "FAIL",
    "CRITICAL",
    "No lot or expiry record on file",
  ],
  [
    "new_supplier_unit_cost",
    "New supplier unit cost",
    "FAIL",
    "HIGH",
    "User reports cheaper sourcing, but no exact per-SKU quote supplied",
  ],
];

const allIds = (gates: readonly PricingGate[]) => gates.map((gate) => gate.id);

describe("the gate record", () => {
  it("holds every gate the sheet records, with unique ids", () => {
    expect(PEPTIDE_PRICING_GATES).toHaveLength(PEPTIDE_PRICING_GATE_COUNT);
    expect(new Set(allIds(PEPTIDE_PRICING_GATES)).size).toBe(PEPTIDE_PRICING_GATE_COUNT);
  });

  it("uses only the closed vocabularies", () => {
    for (const gate of PEPTIDE_PRICING_GATES) {
      expect(PRICING_GATE_STATES, gate.id).toContain(gate.currentState);
      expect(PRICING_GATE_SEVERITIES, gate.id).toContain(gate.severity);
    }
  });

  it("names accountable humans and a source on every gate", () => {
    for (const gate of PEPTIDE_PRICING_GATES) {
      expect(gate.owner.length, gate.id).toBeGreaterThan(0);
      expect(gate.owner, gate.id).not.toBe("the system");
      expect(gate.source.length, gate.id).toBeGreaterThan(0);
      expect(gate.measuredEvidence.length, gate.id).toBeGreaterThan(0);
      expect(gate.requiredBeforeActivation.length, gate.id).toBeGreaterThan(0);
    }
  });

  it("has no cleared gate today", () => {
    for (const gate of PEPTIDE_PRICING_GATES) {
      expect(gate.currentState, gate.id).not.toBe(CLEARED_GATE_STATE);
      expect(gateIsClear(gate), gate.id).toBe(false);
    }
  });

  it("transcribes the five price-evidence gates exactly as the sheet states them", () => {
    expect(PRICE_EVIDENCE_GATE_IDS).toEqual(
      PRICE_EVIDENCE_TRANSCRIPTION.map(([id]) => id),
    );
    for (const [id, name, state, severity, evidence] of PRICE_EVIDENCE_TRANSCRIPTION) {
      const gate = findPricingGate(id);
      expect(gate, id).not.toBeNull();
      expect(gate!.gate, id).toBe(name);
      expect(gate!.currentState, id).toBe(state);
      expect(gate!.severity, id).toBe(severity);
      expect(gate!.measuredEvidence, id).toBe(evidence);
    }
  });

  it("splits eight critical and four high gates", () => {
    expect(pricingGatesBySeverity("CRITICAL")).toHaveLength(8);
    expect(pricingGatesBySeverity("HIGH")).toHaveLength(4);
  });

  it("returns null for an unknown gate rather than guessing", () => {
    expect(findPricingGate("not_a_gate")).toBeNull();
  });
});

describe("canActivatePricing", () => {
  it("blocks activation today, on every recorded gate", () => {
    const verdict = canActivatePricing();
    expect(verdict.allowed).toBe(false);
    expect(verdict.blockingGates).toHaveLength(PEPTIDE_PRICING_GATE_COUNT);
    expect(verdict.blockingCriticalGateIds).toHaveLength(8);
    expect(verdict.blockingHighGateIds).toHaveLength(4);
    expect(verdict.summary).toContain("blocked by 12 gate(s)");
    expect(verdict.summary).toContain("Lot-matched COA files");
  });

  it("refuses an empty gate list, because no evidence is not a clearance", () => {
    const verdict = canActivatePricing([]);
    expect(verdict.allowed).toBe(false);
    expect(verdict.summary).toContain("no compliance gates were presented");
  });

  it("still blocks when every critical gate is cleared but a high gate is not", () => {
    const criticalIds = pricingGatesBySeverity("CRITICAL").map((gate) => gate.id);
    const verdict = canActivatePricing(withGatesCleared(criticalIds));
    expect(verdict.allowed).toBe(false);
    expect(verdict.blockingCriticalGateIds).toEqual([]);
    expect(verdict.blockingHighGateIds).toHaveLength(4);
  });

  it("blocks while any single critical gate is still failing", () => {
    for (const critical of pricingGatesBySeverity("CRITICAL")) {
      const others = allIds(PEPTIDE_PRICING_GATES).filter((id) => id !== critical.id);
      const verdict = canActivatePricing(withGatesCleared(others));
      expect(verdict.allowed, critical.id).toBe(false);
      expect(verdict.blockingGateIds, critical.id).toEqual([critical.id]);
    }
  });

  it("allows activation only when every gate is cleared", () => {
    const verdict = canActivatePricing(withGatesCleared(allIds(PEPTIDE_PRICING_GATES)));
    expect(verdict.allowed).toBe(true);
    expect(verdict.blockingGates).toEqual([]);
    expect(verdict.summary).toBe("Every recorded compliance gate is cleared.");
  });

  it("is pure: modelling a cleared gate never edits the record", () => {
    const before = JSON.stringify(PEPTIDE_PRICING_GATES);
    canActivatePricing(withGatesCleared(allIds(PEPTIDE_PRICING_GATES)));
    expect(JSON.stringify(PEPTIDE_PRICING_GATES)).toBe(before);
    expect(canActivatePricing().allowed).toBe(false);
  });

  it("reports the five price-evidence gates as blocking today", () => {
    expect(allIds(blockingPriceEvidenceGates())).toEqual([...PRICE_EVIDENCE_GATE_IDS]);
    expect(blockingPriceEvidenceGates(withGatesCleared([...PRICE_EVIDENCE_GATE_IDS]))).toEqual(
      [],
    );
  });
});

describe("house style", () => {
  it("stores no em or en dash in any gate field", () => {
    const everyString = JSON.stringify(PEPTIDE_PRICING_GATES);
    expect(everyString).not.toContain(EM_DASH);
    expect(everyString).not.toContain(EN_DASH);
  });
});
