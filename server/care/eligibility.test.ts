import { describe, expect, it } from "vitest";
import type { CareConsentStatus } from "@shared/care/consent";
import type { CareEligibilityContext } from "@shared/care/eligibility";
import type { CareRecordId } from "@shared/care/contracts";
import { evaluateCareEligibility, normalizeCareStateCode } from "./eligibility";

const patientId = "care_patient_1" as CareRecordId;
const now = new Date("2026-07-25T20:00:00.000Z");

function consent(
  kind: CareConsentStatus["kind"],
  satisfied = true,
): CareConsentStatus {
  return {
    kind,
    requiredDocument: satisfied
      ? {
          id: `${kind}_document` as CareRecordId,
          kind,
          version: "approved-v1",
          contentHash: "sha256:approved",
          status: "approved",
          approvedAt: "2026-07-25T18:00:00.000Z",
          effectiveAt: "2026-07-25T18:00:00.000Z",
        }
      : null,
    activeEvent: satisfied
      ? {
          id: `${kind}_event` as CareRecordId,
          patientId,
          documentId: `${kind}_document` as CareRecordId,
          kind,
          documentVersion: "approved-v1",
          action: "granted",
          occurredAt: "2026-07-25T19:00:00.000Z",
        }
      : null,
    satisfied,
    reason: satisfied ? "active" : "document_unavailable",
  };
}

function readyContext(
  overrides: Partial<CareEligibilityContext> = {},
): CareEligibilityContext {
  return {
    patientId,
    capabilityEnabled: true,
    location: {
      id: "location_1" as CareRecordId,
      patientId,
      stateCode: "IL",
      source: "patient_attestation",
      attestedAt: "2026-07-25T18:00:00.000Z",
      supersedesLocationId: null,
    },
    identity: {
      patientId,
      state: "verified",
      verifiedAt: "2026-07-25T18:30:00.000Z",
    },
    coverage: {
      stateCode: "IL",
      supportedStateActive: true,
      serviceCoverageActive: true,
      waitlistEnabled: true,
      activeClinicianCount: 1,
    },
    telehealthConsent: consent("telehealth"),
    privacyConsent: consent("privacy_notice"),
    ...overrides,
  };
}

describe("Care PR 2 eligibility foundation", () => {
  it("normalizes only two-letter state codes", () => {
    expect(normalizeCareStateCode(" il ")).toBe("IL");
    expect(normalizeCareStateCode("Illinois")).toBeNull();
    expect(normalizeCareStateCode("1L")).toBeNull();
  });

  it("fails closed when Care or location is unavailable", () => {
    expect(
      evaluateCareEligibility(readyContext({ capabilityEnabled: false }), now)
        .reason,
    ).toBe("care_disabled");
    expect(
      evaluateCareEligibility(readyContext({ location: null }), now).reason,
    ).toBe("location_required");
  });

  it("never infers support or waitlist availability from an absent registry row", () => {
    const decision = evaluateCareEligibility(
      readyContext({ coverage: null }),
      now,
    );
    expect(decision).toMatchObject({
      outcome: "unavailable",
      reason: "unsupported_state",
      careEligibilityCleared: false,
    });
  });

  it("offers an unsupported-state waitlist only when explicitly configured", () => {
    const decision = evaluateCareEligibility(
      readyContext({
        coverage: {
          ...readyContext().coverage!,
          supportedStateActive: false,
          serviceCoverageActive: false,
          waitlistEnabled: true,
          activeClinicianCount: 0,
        },
      }),
      now,
    );
    expect(decision).toMatchObject({
      outcome: "waitlist_available",
      reason: "unsupported_state",
      careEligibilityCleared: false,
    });
  });

  it("distinguishes service and clinician coverage without claiming eligibility", () => {
    const serviceUnavailable = evaluateCareEligibility(
      readyContext({
        coverage: {
          ...readyContext().coverage!,
          serviceCoverageActive: false,
        },
      }),
      now,
    );
    const clinicianUnavailable = evaluateCareEligibility(
      readyContext({
        coverage: {
          ...readyContext().coverage!,
          activeClinicianCount: 0,
        },
      }),
      now,
    );
    expect(serviceUnavailable.reason).toBe("service_unavailable");
    expect(clinicianUnavailable.reason).toBe(
      "clinician_coverage_unavailable",
    );
    expect(serviceUnavailable.careEligibilityCleared).toBe(false);
    expect(clinicianUnavailable.careEligibilityCleared).toBe(false);
  });

  it("does not offer a waitlist unless the registry explicitly enables it", () => {
    const decision = evaluateCareEligibility(
      readyContext({
        coverage: {
          ...readyContext().coverage!,
          serviceCoverageActive: false,
          waitlistEnabled: false,
        },
      }),
      now,
    );
    expect(decision.outcome).toBe("unavailable");
  });

  it("requires verified identity and both current consent versions", () => {
    expect(
      evaluateCareEligibility(
        readyContext({
          identity: {
            patientId,
            state: "pending",
            verifiedAt: null,
          },
        }),
        now,
      ).reason,
    ).toBe("identity_unverified");
    expect(
      evaluateCareEligibility(
        readyContext({ telehealthConsent: consent("telehealth", false) }),
        now,
      ).reason,
    ).toBe("telehealth_consent_required");
    expect(
      evaluateCareEligibility(
        readyContext({
          privacyConsent: consent("privacy_notice", false),
        }),
        now,
      ).reason,
    ).toBe("privacy_notice_required");
    expect(
      evaluateCareEligibility(
        readyContext({
          telehealthConsent: {
            ...consent("telehealth"),
            activeEvent: {
              ...consent("telehealth").activeEvent!,
              patientId: "other-patient" as CareRecordId,
            },
          },
        }),
        now,
      ).reason,
    ).toBe("telehealth_consent_required");
  });

  it("permits only intake preparation and never automatic Care clearance", () => {
    const decision = evaluateCareEligibility(readyContext(), now);
    expect(decision).toMatchObject({
      outcome: "intake_available",
      reason: "intake_foundation_ready",
      careEligibilityCleared: false,
      auditRequired: true,
    });
    expect(JSON.stringify(decision)).not.toContain('"eligible":true');
    expect(JSON.stringify(decision)).not.toContain('"cleared":true');
  });
});
