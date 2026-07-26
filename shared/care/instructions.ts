import type { CareRecordId } from "./contracts";

export const CARE_INSTRUCTION_SOURCE_KINDS = [
  "pharmacy_label",
  "pharmacy_information",
  "clinician_direction",
  "manufacturer_material",
  "general_education",
] as const;
export type CareInstructionSourceKind =
  (typeof CARE_INSTRUCTION_SOURCE_KINDS)[number];

export const CARE_PATIENT_INSTRUCTION_SOURCE_KINDS = [
  "pharmacy_label",
  "pharmacy_information",
  "clinician_direction",
  "manufacturer_material",
] as const;

export const CARE_INSTRUCTION_STATUSES = [
  "draft",
  "released",
  "superseded",
  "withdrawn",
] as const;
export type CareInstructionStatus = (typeof CARE_INSTRUCTION_STATUSES)[number];

export const CARE_SUPPLY_KIT_STATUSES = [
  "draft",
  "verified",
  "released",
  "superseded",
  "withdrawn",
] as const;
export type CareSupplyKitStatus = (typeof CARE_SUPPLY_KIT_STATUSES)[number];

export const CARE_INSTRUCTION_REQUIRED_INPUT_LABELS = {
  pharmacyLabel: "PHARMACY LABEL SOURCE REQUIRED",
  pharmacyInformation: "PHARMACY INFORMATION SOURCE REQUIRED",
  clinicianDirection: "CLINICIAN DIRECTION SOURCE REQUIRED",
  manufacturerMaterial: "MANUFACTURER MATERIAL REQUIRED",
  patientInstructions: "PATIENT INSTRUCTION CONTENT REQUIRED",
  instructionReview: "PATIENT INSTRUCTION REVIEW REQUIRED",
  device: "PRODUCT-SPECIFIC DEVICE RECORD REQUIRED",
  supplier: "VERIFIED SUPPLY SOURCE REQUIRED",
  replacementCadence: "SUPPLY REPLACEMENT CADENCE REQUIRED",
  careActivation: "CARE ACTIVATION APPROVAL REQUIRED",
} as const;

export interface CareInstructionSource {
  id: CareRecordId;
  kind: CareInstructionSourceKind;
  prescriptionId: CareRecordId | null;
  patientId: CareRecordId | null;
  version: number;
  contentHash: string;
  verified: boolean;
  supersededAt: string | null;
}

export interface CarePatientInstruction {
  id: CareRecordId;
  patientId: CareRecordId;
  prescriptionId: CareRecordId;
  status: CareInstructionStatus;
  sourceIds: readonly CareRecordId[];
  version: number;
  acknowledgedVersion: number | null;
  supersedesInstructionId: CareRecordId | null;
}

export interface CareSupplyKit {
  id: CareRecordId;
  patientId: CareRecordId;
  prescriptionId: CareRecordId;
  status: CareSupplyKitStatus;
  productSpecificDevice: string | null;
  verifiedSupplierReference: string | null;
  replacementCadence: string | null;
  version: number;
  supersedesSupplyKitId: CareRecordId | null;
}
