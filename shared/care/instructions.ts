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
  sourceReference: string;
  content: string;
  verified: boolean;
  supersededAt: string | null;
  createdAt: string;
}

export interface CarePatientInstruction {
  id: CareRecordId;
  patientId: CareRecordId;
  prescriptionId: CareRecordId;
  status: CareInstructionStatus;
  sourceChainCurrent: boolean;
  sourceIds: readonly CareRecordId[];
  instructionContent: string;
  version: number;
  acknowledgedVersion: number | null;
  supersedesInstructionId: CareRecordId | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CareSupplyKit {
  id: CareRecordId;
  patientId: CareRecordId;
  prescriptionId: CareRecordId;
  status: CareSupplyKitStatus;
  productSpecificDevice: string | null;
  verifiedSupplierReference: string | null;
  supplySourceVerificationState: CareSupplySourceVerificationState;
  supplySourceVerifiedAt: string | null;
  replacementEligible: boolean;
  replacementCadence: string | null;
  version: number;
  supersedesSupplyKitId: CareRecordId | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CARE_SUPPLY_SOURCE_VERIFICATION_STATES = [
  "missing",
  "entered",
  "under_review",
  "verified",
  "rejected",
  "expired",
  "superseded",
] as const;
export type CareSupplySourceVerificationState =
  (typeof CARE_SUPPLY_SOURCE_VERIFICATION_STATES)[number];

export interface CareSupplySource {
  id: CareRecordId;
  legalName: string | null;
  relationshipReference: string | null;
  supportReference: string | null;
  verificationState: CareSupplySourceVerificationState;
  verifiedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const CARE_SUPPLY_REPLACEMENT_STATUSES = [
  "requested",
  "approved",
  "fulfilled",
  "declined",
  "cancelled",
] as const;
export type CareSupplyReplacementStatus =
  (typeof CARE_SUPPLY_REPLACEMENT_STATUSES)[number];

export interface CareSupplyReplacement {
  id: CareRecordId;
  supplyKitId: CareRecordId;
  patientId: CareRecordId;
  status: CareSupplyReplacementStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CareInstructionReadinessFacts {
  prescriptionSigned: boolean;
  pharmacyLabelVerified: boolean;
  pharmacyInformationVerified: boolean;
  clinicianDirectionVerified: boolean;
  manufacturerMaterialVerified: boolean;
  patientInstructionContentVerified: boolean;
  patientInstructionReviewed: boolean;
  productSpecificDeviceVerified: boolean;
  supplySourceVerified: boolean;
  replacementCadenceVerified: boolean;
  publicActivationApproved: boolean;
}

export type CareInstructionRequiredInputLabel =
  (typeof CARE_INSTRUCTION_REQUIRED_INPUT_LABELS)[keyof typeof CARE_INSTRUCTION_REQUIRED_INPUT_LABELS];
