import { describe, expect, it } from "vitest";
import {
  CARE_PROGRAM_KEYS,
  parseCareProgramKey,
  projectCareProgramReadiness,
  resolveCareProgramReadiness,
  type CareProgramReadinessFact,
} from "./programs";

const verified: CareProgramReadinessFact = {
  programKey: "care_program:glp_care",
  definitionState: "verified",
  credentialState: "verified",
  jurisdictionState: "verified",
  predecessorState: "verified",
};

describe("Care program identities", () => {
  it("keeps exactly two unique opaque Care identities", () => {
    expect(CARE_PROGRAM_KEYS).toEqual([
      "care_program:glp_care",
      "care_program:quantum_ev",
    ]);
    expect(new Set(CARE_PROGRAM_KEYS).size).toBe(2);
    for (const key of CARE_PROGRAM_KEYS) {
      expect(key).not.toMatch(/research|product|variant|sku|catalog|price|order/i);
    }
  });

  it("does not normalize aliases, case, blanks, or Research identities", () => {
    expect(parseCareProgramKey("care_program:glp_care")).toBe(
      "care_program:glp_care",
    );
    for (const value of [
      undefined,
      null,
      "",
      " care_program:glp_care",
      "CARE_PROGRAM:GLP_CARE",
      "glp_care",
      "quantum",
      "research:quantum",
      "SKU-1",
    ]) {
      expect(parseCareProgramKey(value)).toBeNull();
    }
  });
});

describe("Care program readiness", () => {
  it("fails closed for invalid, missing, and duplicate program facts", () => {
    expect(resolveCareProgramReadiness("unknown", [])).toMatchObject({
      state: "blocked",
      reason: "invalid_program",
    });
    expect(
      resolveCareProgramReadiness("care_program:glp_care", []),
    ).toMatchObject({ state: "blocked", reason: "missing_program" });
    expect(
      resolveCareProgramReadiness("care_program:glp_care", [
        verified,
        { ...verified },
      ]),
    ).toMatchObject({ state: "blocked", reason: "ambiguous_program" });
  });

  it("requires every exact evidence lane to be verified", () => {
    const cases: Array<
      [
        keyof Pick<
          CareProgramReadinessFact,
          | "definitionState"
          | "credentialState"
          | "jurisdictionState"
          | "predecessorState"
        >,
        string,
      ]
    > = [
      ["definitionState", "program_definition_unverified"],
      ["credentialState", "credential_unverified"],
      ["jurisdictionState", "jurisdiction_unverified"],
      ["predecessorState", "predecessor_unverified"],
    ];

    for (const [field, reason] of cases) {
      const fact = {
        ...verified,
        [field]: "missing",
      } as CareProgramReadinessFact;
      expect(
        resolveCareProgramReadiness("care_program:glp_care", [fact]),
      ).toMatchObject({ state: "blocked", reason });
    }

    expect(
      resolveCareProgramReadiness("care_program:glp_care", [verified]),
    ).toMatchObject({
      state: "ready_for_internal_review",
      reason: "ready_for_internal_review",
    });
  });

  it("projects only count-free, non-activating public states", () => {
    const ready = projectCareProgramReadiness(
      resolveCareProgramReadiness("care_program:glp_care", [verified]),
    );
    const invalid = projectCareProgramReadiness(
      resolveCareProgramReadiness("research:glp", [verified]),
    );

    expect(ready).toEqual({ status: "documentation_pending" });
    expect(invalid).toEqual({ status: "unavailable" });

    for (const projection of [ready, invalid]) {
      expect(Object.keys(projection)).toEqual(["status"]);
      expect(projection).not.toHaveProperty("count");
      expect(projection).not.toHaveProperty("clinicians");
      expect(projection).not.toHaveProperty("provider");
      expect(projection).not.toHaveProperty("programKey");
      expect(projection).not.toHaveProperty("price");
      expect(projection).not.toHaveProperty("enabled");
      expect(JSON.stringify(projection)).not.toMatch(/available now|approved/i);
    }
  });
});
