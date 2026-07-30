import { describe, expect, it } from "vitest";
import {
  projectCareLabReadiness,
  resolveCareLabReadiness,
  type CareLabReadinessFact,
} from "./labs";

const verified: CareLabReadinessFact = {
  programKey: "care_program:quantum_ev",
  jurisdictionCode: "TX",
  credentialState: "verified",
  jurisdictionState: "verified",
  predecessorState: "verified",
  referenceState: "verified",
  workflowState: "ready_for_internal_review",
};

describe("Care lab readiness contracts", () => {
  it("fails closed for invalid, missing, and ambiguous contexts", () => {
    expect(resolveCareLabReadiness("research:quantum", "TX", [])).toMatchObject({
      state: "blocked",
      reason: "invalid_program",
    });
    expect(
      resolveCareLabReadiness("care_program:quantum_ev", "HI", []),
    ).toMatchObject({ state: "blocked", reason: "invalid_jurisdiction" });
    expect(
      resolveCareLabReadiness("care_program:quantum_ev", "TX", []),
    ).toMatchObject({ state: "blocked", reason: "missing_context" });
    expect(
      resolveCareLabReadiness("care_program:quantum_ev", "TX", [
        verified,
        { ...verified },
      ]),
    ).toMatchObject({ state: "blocked", reason: "ambiguous_context" });
  });

  it("requires exact credential, jurisdiction, predecessor, and reference evidence", () => {
    const cases = [
      ["credentialState", "credential_unverified"],
      ["jurisdictionState", "jurisdiction_unverified"],
      ["predecessorState", "predecessor_unverified"],
      ["referenceState", "reference_unverified"],
    ] as const;

    for (const [field, reason] of cases) {
      const fact = {
        ...verified,
        [field]: "missing",
      } as CareLabReadinessFact;
      expect(
        resolveCareLabReadiness("care_program:quantum_ev", "TX", [fact]),
      ).toMatchObject({ state: "blocked", reason });
    }
  });

  it("never combines another program or jurisdiction context", () => {
    expect(
      resolveCareLabReadiness("care_program:quantum_ev", "TX", [
        { ...verified, programKey: "care_program:glp_care" },
        { ...verified, jurisdictionCode: "TN" },
      ]),
    ).toMatchObject({ state: "blocked", reason: "missing_context" });
  });

  it("keeps readiness non-activating and the public projection count-free", () => {
    const decision = resolveCareLabReadiness(
      "care_program:quantum_ev",
      "TX",
      [verified],
    );
    expect(decision).toMatchObject({
      state: "ready_for_internal_review",
      reason: "ready_for_internal_review",
    });

    const projection = projectCareLabReadiness(decision);
    expect(projection).toEqual({
      status: "documentation_pending",
      message: "Care laboratory documentation is pending.",
    });
    expect(projection).not.toHaveProperty("count");
    expect(projection).not.toHaveProperty("provider");
    expect(projection).not.toHaveProperty("orders");
    expect(projection).not.toHaveProperty("results");
    expect(projection).not.toHaveProperty("ranges");
    expect(projection).not.toHaveProperty("interpretation");
    expect(projection).not.toHaveProperty("enabled");
  });
});
