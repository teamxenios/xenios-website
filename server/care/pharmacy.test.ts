import { describe, expect, it } from "vitest";
import type {
  CareInstructionBinding,
  CarePharmacyAssignment,
  CarePrescription,
} from "@shared/care/pharmacy";
import { SUPPLY_FIELD_NAMES } from "@shared/care/pharmacy";
import { authorizeInstructionAccess, createPatientSupplyKitDraft } from "./pharmacy";

const rid = (value: string) => value as CarePrescription["id"];

const prescription: CarePrescription = {
  id: rid("care-rx-1"),
  patientId: "patient-1",
  clinicianId: "clinician-1",
  reviewId: rid("care-review-1"),
  status: "signed",
  formulationRef: "formulation-approved-ref",
  concentrationRef: "concentration-approved-ref",
  productName: null,
  dose: null,
  directions: null,
};

const pharmacy: CarePharmacyAssignment = {
  id: rid("care-pharmacy-1"),
  prescriptionId: prescription.id,
  patientId: "patient-1",
  pharmacyOrganizationId: "pharmacy-org-1",
  status: "accepted",
};

const instruction: CareInstructionBinding = {
  id: rid("care-instruction-1"),
  patientId: "patient-1",
  prescriptionId: prescription.id,
  pharmacyAssignmentId: pharmacy.id,
  formulationRef: "formulation-approved-ref",
  concentrationRef: "concentration-approved-ref",
  kind: "clinician_direction",
  version: 3,
  isCurrent: true,
};

const accessRequest = {
  patientId: "patient-1",
  prescriptionId: prescription.id,
  pharmacyAssignmentId: pharmacy.id,
  formulationRef: instruction.formulationRef,
  concentrationRef: instruction.concentrationRef,
  instructionVersion: 3,
};

describe("prescription and pharmacy gates", () => {
  it("requires signed prescription and an accepted exact pharmacy assignment", () => {
    expect(authorizeInstructionAccess(accessRequest, prescription, pharmacy, instruction)).toEqual({ allowed: true });
    expect(authorizeInstructionAccess(accessRequest, { ...prescription, status: "draft" }, pharmacy, instruction)).toEqual({
      allowed: false,
      reason: "prescription_unavailable",
    });
    expect(authorizeInstructionAccess(accessRequest, prescription, { ...pharmacy, status: "pending" }, instruction)).toEqual({
      allowed: false,
      reason: "pharmacy_unavailable",
    });
  });

  it("enforces patient ownership and exact formulation/concentration binding", () => {
    expect(authorizeInstructionAccess({ ...accessRequest, patientId: "patient-2" }, prescription, pharmacy, instruction)).toEqual({
      allowed: false,
      reason: "patient_mismatch",
    });
    expect(authorizeInstructionAccess({ ...accessRequest, concentrationRef: "other" }, prescription, pharmacy, instruction)).toEqual({
      allowed: false,
      reason: "binding_mismatch",
    });
  });

  it("rejects old instruction versions", () => {
    expect(authorizeInstructionAccess(accessRequest, prescription, pharmacy, { ...instruction, isCurrent: false })).toEqual({
      allowed: false,
      reason: "instruction_not_current",
    });
    expect(authorizeInstructionAccess({ ...accessRequest, instructionVersion: 2 }, prescription, pharmacy, instruction)).toEqual({
      allowed: false,
      reason: "binding_mismatch",
    });
  });
});

describe("patient-specific supply gate", () => {
  it("creates only an empty patient-bound draft after every upstream gate passes", () => {
    const kit = createPatientSupplyKitDraft({
      id: "care-kit-1",
      patientId: "patient-1",
      prescription,
      pharmacy,
      instruction,
    });
    expect(Object.keys(kit.fields).sort()).toEqual([...SUPPLY_FIELD_NAMES].sort());
    expect(Object.values(kit.fields).every((value) => value === null)).toBe(true);
    expect(JSON.stringify(kit).toLowerCase()).not.toContain("amazon");
    expect(kit).not.toHaveProperty("researchOrderId");
    expect(kit).not.toHaveProperty("researchInventoryId");
  });

  it("cannot create a supply kit for another patient or a pending pharmacy", () => {
    expect(() =>
      createPatientSupplyKitDraft({
        id: "care-kit-2",
        patientId: "patient-2",
        prescription,
        pharmacy,
        instruction,
      }),
    ).toThrow("supply_gate:patient_mismatch");
    expect(() =>
      createPatientSupplyKitDraft({
        id: "care-kit-3",
        patientId: "patient-1",
        prescription,
        pharmacy: { ...pharmacy, status: "pending" },
        instruction,
      }),
    ).toThrow("supply_gate:pharmacy_unavailable");
  });
});
