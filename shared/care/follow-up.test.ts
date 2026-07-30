import { describe, expect, it } from "vitest";
import {
  CARE_FOLLOW_UP_STATES,
  isCareFollowUpTransitionAllowed,
  projectCareFollowUpReadiness,
  resolveCareFollowUpReadiness,
  type CareFollowUpReadinessFact,
} from "./follow-up";

const verified: CareFollowUpReadinessFact = {
  programKey: "care_program:glp_care",
  jurisdictionCode: "IL",
  credentialState: "verified",
  jurisdictionState: "verified",
  predecessorState: "complete",
  workflowState: "ready_for_internal_review",
};

describe("Care follow-up contracts", () => {
  it("fails closed for invalid, missing, and ambiguous contexts", () => {
    expect(resolveCareFollowUpReadiness("glp_care", "IL", [])).toMatchObject({
      state: "blocked",
      reason: "invalid_program",
    });
    expect(
      resolveCareFollowUpReadiness("care_program:glp_care", "AK", []),
    ).toMatchObject({ state: "blocked", reason: "invalid_jurisdiction" });
    expect(
      resolveCareFollowUpReadiness("care_program:glp_care", "IL", []),
    ).toMatchObject({ state: "blocked", reason: "missing_context" });
    expect(
      resolveCareFollowUpReadiness("care_program:glp_care", "IL", [
        verified,
        { ...verified },
      ]),
    ).toMatchObject({ state: "blocked", reason: "ambiguous_context" });
  });

  it("requires exact credentials, jurisdiction, and completed predecessor", () => {
    expect(
      resolveCareFollowUpReadiness("care_program:glp_care", "IL", [
        { ...verified, credentialState: "expired" },
      ]),
    ).toMatchObject({ state: "blocked", reason: "credential_unverified" });
    expect(
      resolveCareFollowUpReadiness("care_program:glp_care", "IL", [
        { ...verified, jurisdictionState: "pending" },
      ]),
    ).toMatchObject({ state: "blocked", reason: "jurisdiction_unverified" });
    for (const predecessorState of ["missing", "pending", "cancelled"] as const) {
      expect(
        resolveCareFollowUpReadiness("care_program:glp_care", "IL", [
          { ...verified, predecessorState },
        ]),
      ).toMatchObject({ state: "blocked", reason: "predecessor_unverified" });
    }
  });

  it("does not combine another program or jurisdiction context", () => {
    expect(
      resolveCareFollowUpReadiness("care_program:glp_care", "IL", [
        { ...verified, programKey: "care_program:quantum_ev" },
        { ...verified, jurisdictionCode: "IN" },
      ]),
    ).toMatchObject({ state: "blocked", reason: "missing_context" });
  });

  it("uses a closed, forward-only, non-activating transition graph", () => {
    expect(CARE_FOLLOW_UP_STATES).toEqual([
      "blocked",
      "documentation_pending",
      "review_pending",
      "ready_for_internal_review",
      "closed",
    ]);
    expect(
      isCareFollowUpTransitionAllowed(
        "documentation_pending",
        "review_pending",
      ),
    ).toBe(true);
    expect(
      isCareFollowUpTransitionAllowed(
        "review_pending",
        "ready_for_internal_review",
      ),
    ).toBe(true);
    expect(
      isCareFollowUpTransitionAllowed("ready_for_internal_review", "closed"),
    ).toBe(true);
    for (const transition of [
      ["blocked", "ready_for_internal_review"],
      ["review_pending", "closed"],
      ["closed", "review_pending"],
      ["missing", "review_pending"],
      ["review_pending", "enabled"],
    ] as const) {
      expect(isCareFollowUpTransitionAllowed(...transition)).toBe(false);
    }
  });

  it("projects readiness without counts or operational facts", () => {
    const decision = resolveCareFollowUpReadiness(
      "care_program:glp_care",
      "IL",
      [verified],
    );
    expect(decision).toMatchObject({
      state: "ready_for_internal_review",
      reason: "ready_for_internal_review",
    });

    const projection = projectCareFollowUpReadiness(decision);
    expect(projection).toEqual({
      status: "documentation_pending",
      message: "Care follow-up documentation is pending.",
    });
    expect(projection).not.toHaveProperty("count");
    expect(projection).not.toHaveProperty("patient");
    expect(projection).not.toHaveProperty("provider");
    expect(projection).not.toHaveProperty("contact");
    expect(projection).not.toHaveProperty("enabled");
  });
});
