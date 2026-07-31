import { describe, expect, it } from "vitest";
import {
  CARE_LAB_PREDECESSOR_STATES,
  CARE_LAB_WORKFLOW_STATES,
  isCareLabTransitionAllowed,
  projectCareLabReadiness,
  resolveCareLabReadiness,
  type CareLabReadinessFact,
} from "./labs";

const verified: CareLabReadinessFact = {
  programKey: "care_program:quantum_ev",
  jurisdictionCode: "TX",
  credentialState: "verified",
  jurisdictionState: "verified",
  predecessorState: "complete",
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
    const evidenceCases = [
      ["credentialState", "credential_unverified"],
      ["jurisdictionState", "jurisdiction_unverified"],
      ["referenceState", "reference_unverified"],
    ] as const;

    for (const [field, reason] of evidenceCases) {
      const fact = {
        ...verified,
        [field]: "missing",
      } as CareLabReadinessFact;
      expect(
        resolveCareLabReadiness("care_program:quantum_ev", "TX", [fact]),
      ).toMatchObject({ state: "blocked", reason });
    }

    expect(CARE_LAB_PREDECESSOR_STATES).toEqual([
      "missing",
      "pending",
      "complete",
      "cancelled",
    ]);
    for (const predecessorState of ["missing", "pending", "cancelled"] as const) {
      expect(
        resolveCareLabReadiness("care_program:quantum_ev", "TX", [
          { ...verified, predecessorState },
        ]),
      ).toMatchObject({ state: "blocked", reason: "predecessor_unverified" });
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

  it("fails closed for blocked or runtime-invalid workflow states", () => {
    expect(
      resolveCareLabReadiness("care_program:quantum_ev", "TX", [
        { ...verified, workflowState: "blocked" },
      ]),
    ).toMatchObject({ state: "blocked", reason: "workflow_blocked" });
    expect(
      resolveCareLabReadiness("care_program:quantum_ev", "TX", [
        {
          ...verified,
          workflowState: "hostile:enabled",
        } as unknown as CareLabReadinessFact,
      ]),
    ).toMatchObject({ state: "blocked", reason: "invalid_workflow_state" });
    expect(
      projectCareLabReadiness({
        programKey: "care_program:quantum_ev",
        jurisdictionCode: "TX",
        state: "hostile:enabled",
        reason: "documentation_pending",
      } as never),
    ).toEqual({ status: "unavailable" });
  });

  it("uses a closed, forward-only transition graph", () => {
    expect(CARE_LAB_WORKFLOW_STATES).toEqual([
      "blocked",
      "documentation_pending",
      "reference_review_pending",
      "ready_for_internal_review",
      "closed",
    ]);
    expect(
      isCareLabTransitionAllowed(
        "documentation_pending",
        "reference_review_pending",
      ),
    ).toBe(true);
    expect(
      isCareLabTransitionAllowed(
        "reference_review_pending",
        "ready_for_internal_review",
      ),
    ).toBe(true);
    expect(
      isCareLabTransitionAllowed("ready_for_internal_review", "closed"),
    ).toBe(true);
    for (const transition of [
      ["blocked", "ready_for_internal_review"],
      ["reference_review_pending", "closed"],
      ["closed", "reference_review_pending"],
      ["hostile:missing", "reference_review_pending"],
      ["reference_review_pending", "enabled"],
    ] as const) {
      expect(isCareLabTransitionAllowed(...transition)).toBe(false);
    }
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
    expect(projection).toEqual({ status: "documentation_pending" });
    expect(Object.keys(projection)).toEqual(["status"]);
    expect(projection).not.toHaveProperty("count");
    expect(projection).not.toHaveProperty("provider");
    expect(projection).not.toHaveProperty("orders");
    expect(projection).not.toHaveProperty("results");
    expect(projection).not.toHaveProperty("ranges");
    expect(projection).not.toHaveProperty("interpretation");
    expect(projection).not.toHaveProperty("message");
    expect(projection).not.toHaveProperty("enabled");
  });
});
