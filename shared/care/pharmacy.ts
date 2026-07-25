import type { CareRecordId } from "./contracts";

export interface CarePrescription {
  id: CareRecordId;
  patientId: string;
  clinicianId: string;
  reviewId: CareRecordId;
  status: "draft" | "signed" | "sent_to_pharmacy" | "cancelled" | "expired";
  formulationRef: string | null;
  concentrationRef: string | null;
  productName: null;
  dose: null;
  directions: null;
}

export interface CarePharmacyAssignment {
  id: CareRecordId;
  prescriptionId: CareRecordId;
  patientId: string;
  pharmacyOrganizationId: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

export const INSTRUCTION_KINDS = [
  "pharmacy_label",
  "pharmacy_patient_info",
  "clinician_direction",
  "manufacturer_material",
  "general_education",
  "device_instruction",
  "disposal",
  "emergency_notice",
] as const;

export type InstructionKind = (typeof INSTRUCTION_KINDS)[number];

export interface CareInstructionBinding {
  id: CareRecordId;
  patientId: string;
  prescriptionId: CareRecordId;
  pharmacyAssignmentId: CareRecordId;
  formulationRef: string;
  concentrationRef: string;
  kind: InstructionKind;
  version: number;
  isCurrent: boolean;
}

export const SUPPLY_FIELD_NAMES = [
  "prescription",
  "pharmacy",
  "supplier",
  "device",
  "syringe",
  "needle",
  "capacity",
  "preparation_items",
  "bandages",
  "sharps_container",
  "storage",
  "travel",
  "item_reference",
  "instructions",
  "replacement_cadence",
] as const;

export type SupplyFieldName = (typeof SUPPLY_FIELD_NAMES)[number];
export type EmptySupplyFields = Readonly<Record<SupplyFieldName, null>>;

export interface PatientSupplyKitDraft {
  id: CareRecordId;
  patientId: string;
  prescriptionId: CareRecordId;
  pharmacyAssignmentId: CareRecordId;
  instructionBindingId: CareRecordId;
  status: "unavailable" | "draft" | "approved" | "fulfilled";
  fields: EmptySupplyFields;
}
