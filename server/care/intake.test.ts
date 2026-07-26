import { describe, expect, it } from "vitest";
import type { CareConsentStatus } from "@shared/care/consent";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CareIntakeDefinition,
  CareIntakeStartContext,
} from "@shared/care/intake";
import {
  authorizeCareIntakeStart,
  createCareClinicalIntake,
  validateCareIntakeResponses,
} from "./intake";

const patientId = "patient-1" as CareRecordId;

function consent(
  kind: CareConsentStatus["kind"],
  satisfied = true,
): CareConsentStatus {
  const documentId = `${kind}-document` as CareRecordId;
  return {
    kind,
    requiredDocument: {
      id: documentId,
      kind,
      version: "approved-v1",
      contentHash: "sha256:approved",
      status: "approved",
      approvedAt: "2026-07-25T18:00:00.000Z",
      effectiveAt: "2026-07-25T18:00:00.000Z",
    },
    activeEvent: satisfied
      ? {
          id: `${kind}-event` as CareRecordId,
          patientId,
          documentId,
          kind,
          documentVersion: "approved-v1",
          action: "granted",
          occurredAt: "2026-07-25T19:00:00.000Z",
        }
      : null,
    satisfied,
    reason: satisfied ? "active" : "not_granted",
  };
}

const definition: CareIntakeDefinition = {
  id: "definition-1" as CareRecordId,
  version: "partner-approved-v1",
  status: "approved",
  schemaHash: "sha256:approved-definition",
  fields: [
    { key: "approved_text", kind: "text", required: true, options: [] },
    {
      key: "approved_choice",
      kind: "single_select",
      required: false,
      options: ["a", "b"],
    },
  ],
  approvedAt: "2026-07-25T18:00:00.000Z",
};

function context(
  overrides: Partial<CareIntakeStartContext> = {},
): CareIntakeStartContext {
  return {
    eligibility: {
      patientId,
      outcome: "intake_available",
      reason: "intake_foundation_ready",
      stateCode: "IL",
      careEligibilityCleared: false,
      evaluatedAt: "2026-07-25T20:00:00.000Z",
      auditRequired: true,
    },
    definition,
    telehealthConsent: consent("telehealth"),
    privacyConsent: consent("privacy_notice"),
    ...overrides,
  };
}

describe("Care PR 2 intake foundation", () => {
  it("requires a partner-approved definition and exact active consent events", () => {
    expect(
      authorizeCareIntakeStart(context({ definition: null })),
    ).toEqual({ allowed: false, reason: "definition_unavailable" });
    expect(
      authorizeCareIntakeStart(
        context({ telehealthConsent: consent("telehealth", false) }),
      ),
    ).toEqual({
      allowed: false,
      reason: "telehealth_consent_mismatch",
    });
  });

  it("creates only a consent-bound empty draft without medical questions", () => {
    const intake = createCareClinicalIntake({
      id: "intake-1",
      patientId,
      context: context(),
      createdAt: new Date("2026-07-25T20:00:00.000Z"),
    });
    expect(intake).toMatchObject({
      patientId,
      definitionVersion: "partner-approved-v1",
      status: "draft",
      version: 0,
      submittedAt: null,
    });
    expect(intake).not.toHaveProperty("responses");
  });

  it("accepts only keys and values declared by the approved definition", () => {
    expect(
      validateCareIntakeResponses(
        definition,
        { approved_text: "value", approved_choice: "a" },
        true,
      ),
    ).toEqual({ valid: true });
    expect(
      validateCareIntakeResponses(
        definition,
        { unapproved_question: "value" },
        false,
      ),
    ).toEqual({
      valid: false,
      code: "unknown_field",
      field: "unapproved_question",
    });
    expect(
      validateCareIntakeResponses(
        definition,
        { approved_choice: "not-an-option" },
        false,
      ),
    ).toEqual({
      valid: false,
      code: "invalid_value",
      field: "approved_choice",
    });
  });

  it("requires all approved required fields only at submission", () => {
    expect(
      validateCareIntakeResponses(definition, {}, false),
    ).toEqual({ valid: true });
    expect(
      validateCareIntakeResponses(definition, {}, true),
    ).toEqual({
      valid: false,
      code: "required_field_missing",
      field: "approved_text",
    });
  });
});
