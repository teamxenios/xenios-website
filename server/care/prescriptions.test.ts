import { describe, expect, it } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CarePharmacyOrder,
  CarePrescription,
} from "@shared/care/prescriptions";
import {
  evaluateCarePrescriptionReadiness,
  signCarePrescription,
  transitionCarePharmacyOrder,
} from "./prescriptions";

const id = (value: string) => value as CareRecordId;
const prescription: CarePrescription = {
  id: id("prescription-1"),
  patientId: id("patient-1"),
  appointmentId: id("appointment-1"),
  clinicianReviewId: id("review-1"),
  prescribingClinicianUserId: "clinician-1",
  status: "draft",
  formulation: null,
  concentration: null,
  route: null,
  quantity: null,
  directions: null,
  refills: null,
  verifiedContentSourceId: null,
  version: 0,
  signedAt: null,
  supersedesPrescriptionId: null,
  createdAt: "2026-07-25T20:00:00Z",
  updatedAt: "2026-07-25T20:00:00Z",
};

const order: CarePharmacyOrder = {
  id: id("order-1"),
  patientId: id("patient-1"),
  prescriptionId: id("prescription-1"),
  assignedPharmacyId: id("pharmacy-1"),
  patientStateCode: "IL",
  status: "accepted",
  clarificationOpen: false,
  trackingReferencePresent: false,
  version: 2,
  createdAt: "2026-07-25T20:00:00Z",
  updatedAt: "2026-07-25T20:00:00Z",
};

describe("Care PR 4 prescription boundary", () => {
  it("does not sign until exact patient-specific content has a verified source", () => {
    expect(
      signCarePrescription({
        prescription,
        actor: { subjectId: "clinician-1", kind: "human_clinician" },
        reviewApproved: true,
        contentVerified: false,
        signedAt: "2026-07-25T20:00:00Z",
      }),
    ).toEqual({ allowed: false, reason: "verified_content_required" });
  });

  it("rejects AI, automation, and unassigned clinician signatures", () => {
    for (const actor of [
      { subjectId: "clinician-1", kind: "ai" as const },
      { subjectId: "clinician-1", kind: "automation" as const },
      { subjectId: "clinician-2", kind: "human_clinician" as const },
    ]) {
      expect(
        signCarePrescription({
          prescription,
          actor,
          reviewApproved: true,
          contentVerified: true,
          signedAt: "2026-07-25T20:00:00Z",
        }).allowed,
      ).toBe(false);
    }
  });

  it("signs only a complete verified draft after human review approval", () => {
    const result = signCarePrescription({
      prescription: {
        ...prescription,
        formulation: "verified formulation",
        concentration: "verified concentration",
        route: "verified route",
        quantity: "verified quantity",
        directions: "verified patient-specific directions",
        refills: 0,
        verifiedContentSourceId: id("verified-source-1"),
      },
      actor: { subjectId: "clinician-1", kind: "human_clinician" },
      reviewApproved: true,
      contentVerified: true,
      signedAt: "2026-07-25T20:00:00Z",
    });
    expect(result).toMatchObject({
      allowed: true,
      prescription: { status: "signed", version: 1 },
    });
  });
});

describe("Care PR 4 pharmacy boundary", () => {
  const actor = {
    pharmacyId: "pharmacy-1",
    hasPharmacyRole: true,
    stateCoverageVerified: true,
  };

  it("rejects wrong pharmacy, missing role, and missing state coverage", () => {
    expect(
      transitionCarePharmacyOrder({
        order,
        next: "dispensed",
        actor: { ...actor, pharmacyId: "pharmacy-2" },
      }),
    ).toEqual({ allowed: false, reason: "assigned_pharmacy_required" });
    expect(
      transitionCarePharmacyOrder({
        order,
        next: "dispensed",
        actor: { ...actor, hasPharmacyRole: false },
      }),
    ).toEqual({ allowed: false, reason: "pharmacy_role_required" });
    expect(
      transitionCarePharmacyOrder({
        order,
        next: "dispensed",
        actor: { ...actor, stateCoverageVerified: false },
      }),
    ).toEqual({
      allowed: false,
      reason: "pharmacy_state_coverage_required",
    });
  });

  it("blocks dispensing while clarification is open", () => {
    expect(
      transitionCarePharmacyOrder({
        order: { ...order, clarificationOpen: true },
        next: "dispensed",
        actor,
      }),
    ).toEqual({ allowed: false, reason: "clarification_open" });
  });

  it("requires a tracking reference before shipment", () => {
    expect(
      transitionCarePharmacyOrder({
        order: { ...order, status: "dispensed" },
        next: "shipped",
        actor,
      }),
    ).toEqual({ allowed: false, reason: "tracking_reference_required" });
  });
});

describe("Care PR 4 exact required inputs", () => {
  it("distinguishes software completion from missing real pharmacy facts", () => {
    const result = evaluateCarePrescriptionReadiness({
      medicalGroupVerified: true,
      clinicianCoverageVerified: true,
      patientSpecificContentVerified: false,
      pharmacyPartnerVerified: false,
      pharmacyIdentityVerified: false,
      pharmacyLicenseVerified: false,
      pharmacyStateCoverageVerified: false,
      pharmacyAgreementVerified: false,
      pharmacyIntegrationVerified: false,
      pharmacySupportVerified: false,
      publicActivationApproved: false,
    });
    expect(result.softwareReady).toBe(true);
    expect(result.operationalReady).toBe(false);
    expect(result.publicReady).toBe(false);
    expect(result.requiredInputs).toContain(
      "PATIENT-SPECIFIC PRESCRIPTION CONTENT REQUIRED",
    );
    expect(result.requiredInputs).toContain("PHARMACY PARTNER REQUIRED");
    expect(result.requiredInputs).toContain(
      "PHARMACY LICENSE VERIFICATION REQUIRED",
    );
    expect(result.requiredInputs).toContain(
      "CARE ACTIVATION APPROVAL REQUIRED",
    );
  });
});
