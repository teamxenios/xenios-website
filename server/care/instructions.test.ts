import { describe, expect, it } from "vitest";
import type { CareRecordId } from "@shared/care/contracts";
import type {
  CareInstructionSource,
  CareInstructionReadinessFacts,
  CarePatientInstruction,
  CareSupplyKit,
} from "@shared/care/instructions";
import {
  evaluateCareInstructionReadiness,
  releaseCarePatientInstruction,
  releaseCareSupplyKit,
} from "./instructions";

const id = (value: string) => value as CareRecordId;
const instruction: CarePatientInstruction = {
  id: id("instruction-1"),
  patientId: id("patient-1"),
  prescriptionId: id("prescription-1"),
  status: "draft",
  sourceIds: [id("source-1")],
  instructionContent: "verified patient-specific instruction",
  version: 0,
  acknowledgedVersion: null,
  supersedesInstructionId: null,
  releasedAt: null,
  createdAt: "2026-07-25T20:00:00Z",
  updatedAt: "2026-07-25T20:00:00Z",
};
const source: CareInstructionSource = {
  id: id("source-1"),
  kind: "clinician_direction",
  patientId: id("patient-1"),
  prescriptionId: id("prescription-1"),
  version: 1,
  contentHash: "sha256:verified",
  sourceReference: "verified-source-reference",
  content: "verified source content",
  verified: true,
  supersededAt: null,
  createdAt: "2026-07-25T20:00:00Z",
};
const kit: CareSupplyKit = {
  id: id("kit-1"),
  patientId: id("patient-1"),
  prescriptionId: id("prescription-1"),
  status: "draft",
  productSpecificDevice: null,
  verifiedSupplierReference: null,
  supplySourceVerificationState: "missing",
  supplySourceVerifiedAt: null,
  replacementCadence: null,
  version: 0,
  supersedesSupplyKitId: null,
  releasedAt: null,
  createdAt: "2026-07-25T20:00:00Z",
  updatedAt: "2026-07-25T20:00:00Z",
};

describe("Care PR5 patient-specific instruction boundary", () => {
  it("requires a signed prescription and exact verified patient-bound sources", () => {
    expect(releaseCarePatientInstruction({
      instruction, sources: [source], prescriptionSigned: false,
      assignedClinicianUserId: "clinician-1",
      actor: { subjectId: "clinician-1", kind: "human_clinician" },
    })).toEqual({ allowed: false, reason: "signed_prescription_required" });
    expect(releaseCarePatientInstruction({
      instruction, sources: [{ ...source, patientId: id("patient-2") }],
      prescriptionSigned: true, assignedClinicianUserId: "clinician-1",
      actor: { subjectId: "clinician-1", kind: "human_clinician" },
    })).toEqual({ allowed: false, reason: "verified_patient_sources_required" });
  });
  it("never treats general education as patient-specific direction", () => {
    expect(releaseCarePatientInstruction({
      instruction, sources: [{ ...source, kind: "general_education" }],
      prescriptionSigned: true, assignedClinicianUserId: "clinician-1",
      actor: { subjectId: "clinician-1", kind: "human_clinician" },
    })).toEqual({ allowed: false, reason: "general_education_not_patient_instruction" });
  });
  it("rejects AI, automation, and unassigned clinicians", () => {
    for (const actor of [
      { subjectId: "clinician-1", kind: "ai" as const },
      { subjectId: "clinician-1", kind: "automation" as const },
      { subjectId: "clinician-2", kind: "human_clinician" as const },
    ]) {
      expect(releaseCarePatientInstruction({
        instruction, sources: [source], prescriptionSigned: true,
        assignedClinicianUserId: "clinician-1", actor,
      }).allowed).toBe(false);
    }
  });
});

describe("Care PR5 supply boundary", () => {
  it("has no generic device, supplier, or cadence defaults", () => {
    expect(releaseCareSupplyKit({
      supplyKit: kit, prescriptionSigned: true, instructionReleased: true,
    })).toEqual({ allowed: false, reason: "product_specific_device_required" });
    expect(JSON.stringify(kit)).not.toMatch(/amazon|syringe|needle/i);
  });
  it("releases only a verified product-specific kit after instructions", () => {
    expect(releaseCareSupplyKit({
      supplyKit: {
        ...kit,
        status: "verified",
        productSpecificDevice: "verified product-specific device",
        verifiedSupplierReference: "stale supplier record",
        supplySourceVerificationState: "expired",
        replacementCadence: "verified replacement cadence",
      },
      prescriptionSigned: true,
      instructionReleased: true,
    })).toEqual({ allowed: false, reason: "verified_supplier_required" });
    expect(releaseCareSupplyKit({
      supplyKit: {
        ...kit,
        status: "verified",
        productSpecificDevice: "verified product-specific device",
        verifiedSupplierReference: "verified supplier record",
        supplySourceVerificationState: "verified",
        supplySourceVerifiedAt: "2026-07-25T20:00:00Z",
        replacementCadence: "verified replacement cadence",
      },
      prescriptionSigned: true,
      instructionReleased: true,
    })).toMatchObject({ allowed: true, supplyKit: { status: "released", version: 1 } });
  });
});

describe("Care PR5 readiness boundary", () => {
  const readyFacts: CareInstructionReadinessFacts = {
    prescriptionSigned: true,
    pharmacyLabelVerified: true,
    pharmacyInformationVerified: true,
    clinicianDirectionVerified: true,
    manufacturerMaterialVerified: true,
    patientInstructionContentVerified: true,
    patientInstructionReviewed: true,
    productSpecificDeviceVerified: true,
    supplySourceVerified: true,
    replacementCadenceVerified: true,
    publicActivationApproved: false,
  };

  it("distinguishes mechanically complete software from public clinical release", () => {
    expect(evaluateCareInstructionReadiness(readyFacts)).toMatchObject({
      softwareReady: true,
      operationalReady: true,
      publicReady: false,
      requiredInputs: ["CARE ACTIVATION APPROVAL REQUIRED"],
    });
  });

  it("names missing patient-specific content independently from its review", () => {
    const result = evaluateCareInstructionReadiness({
      ...readyFacts,
      patientInstructionContentVerified: false,
      patientInstructionReviewed: false,
    });
    expect(result.operationalReady).toBe(false);
    expect(result.requiredInputs).toEqual(expect.arrayContaining([
      "PATIENT INSTRUCTION CONTENT REQUIRED",
      "PATIENT INSTRUCTION REVIEW REQUIRED",
    ]));
  });
});
