import { describe, expect, it } from "vitest";
import {
  CARE_CONTIGUOUS_STATE_CODES,
  CARE_EXCLUDED_STATE_CODES,
  parseCareContiguousStateCode,
  projectCareJurisdictionCapability,
  resolveCareJurisdictionCapability,
  type CareJurisdictionCapabilityFact,
} from "./jurisdiction-capabilities";

const canonical = [
  "AL",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

const verified: CareJurisdictionCapabilityFact = {
  programKey: "care_program:glp_care",
  jurisdictionCode: "IL",
  credentialState: "verified",
  jurisdictionState: "verified",
  predecessorState: "verified",
};

describe("the exact 48-state Care model", () => {
  it("contains 48 unique canonical contiguous-state codes", () => {
    expect(CARE_CONTIGUOUS_STATE_CODES).toEqual(canonical);
    expect(CARE_CONTIGUOUS_STATE_CODES).toHaveLength(48);
    expect(new Set(CARE_CONTIGUOUS_STATE_CODES).size).toBe(48);
  });

  it("explicitly excludes Alaska and Hawaii", () => {
    expect(CARE_EXCLUDED_STATE_CODES).toEqual(["AK", "HI"]);
    expect(CARE_CONTIGUOUS_STATE_CODES).not.toContain("AK");
    expect(CARE_CONTIGUOUS_STATE_CODES).not.toContain("HI");
    expect(parseCareContiguousStateCode("AK")).toBeNull();
    expect(parseCareContiguousStateCode("HI")).toBeNull();
  });

  it("rejects aliases, case folding, districts, territories, and blanks", () => {
    expect(parseCareContiguousStateCode("IL")).toBe("IL");
    for (const value of [
      undefined,
      null,
      "",
      " IL",
      "il",
      "Illinois",
      "DC",
      "PR",
      "GU",
      "AA",
      "AE",
      "AP",
    ]) {
      expect(parseCareContiguousStateCode(value)).toBeNull();
    }
  });
});

describe("jurisdiction capability resolution", () => {
  it("fails closed for missing or ambiguous exact-state facts", () => {
    expect(
      resolveCareJurisdictionCapability(
        "care_program:glp_care",
        "IL",
        [],
      ),
    ).toMatchObject({ state: "blocked", reason: "missing_jurisdiction" });
    expect(
      resolveCareJurisdictionCapability("care_program:glp_care", "IL", [
        verified,
        { ...verified },
      ]),
    ).toMatchObject({ state: "blocked", reason: "ambiguous_jurisdiction" });
  });

  it("does not combine another program or jurisdiction", () => {
    const otherProgram: CareJurisdictionCapabilityFact = {
      ...verified,
      programKey: "care_program:quantum_ev",
    };
    const otherState: CareJurisdictionCapabilityFact = {
      ...verified,
      jurisdictionCode: "IN",
    };
    expect(
      resolveCareJurisdictionCapability("care_program:glp_care", "IL", [
        otherProgram,
        otherState,
      ]),
    ).toMatchObject({ state: "blocked", reason: "missing_jurisdiction" });
  });

  it("requires credential, jurisdiction, and predecessor evidence", () => {
    const cases = [
      ["credentialState", "credential_unverified"],
      ["jurisdictionState", "jurisdiction_unverified"],
      ["predecessorState", "predecessor_unverified"],
    ] as const;

    for (const [field, reason] of cases) {
      const fact = {
        ...verified,
        [field]: "missing",
      } as CareJurisdictionCapabilityFact;
      expect(
        resolveCareJurisdictionCapability(
          "care_program:glp_care",
          "IL",
          [fact],
        ),
      ).toMatchObject({ state: "blocked", reason });
    }

    expect(
      resolveCareJurisdictionCapability(
        "care_program:glp_care",
        "IL",
        [verified],
      ),
    ).toMatchObject({ state: "ready_for_internal_review" });
  });

  it("exposes no coverage, provider, or roster counts publicly", () => {
    const projection = projectCareJurisdictionCapability(
      resolveCareJurisdictionCapability(
        "care_program:glp_care",
        "IL",
        [verified],
      ),
    );
    expect(projection).toEqual({ status: "documentation_pending" });
    expect(Object.keys(projection)).toEqual(["status"]);
    expect(projection).not.toHaveProperty("count");
    expect(projection).not.toHaveProperty("providers");
    expect(projection).not.toHaveProperty("clinicians");
    expect(projection).not.toHaveProperty("jurisdictionCode");
    expect(projection).not.toHaveProperty("enabled");
  });
});
