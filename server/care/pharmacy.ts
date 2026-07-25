import type {
  CareInstructionBinding,
  CarePharmacyAssignment,
  CarePrescription,
  EmptySupplyFields,
  PatientSupplyKitDraft,
} from "@shared/care/pharmacy";
import { SUPPLY_FIELD_NAMES } from "@shared/care/pharmacy";
import type { CareRecordId } from "@shared/care/contracts";

export interface InstructionAccessRequest {
  patientId: string;
  prescriptionId: CareRecordId;
  pharmacyAssignmentId: CareRecordId;
  formulationRef: string;
  concentrationRef: string;
  instructionVersion: number;
}

export type InstructionAccessResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "patient_mismatch"
        | "prescription_unavailable"
        | "pharmacy_unavailable"
        | "binding_mismatch"
        | "instruction_not_current";
    };

export function authorizeInstructionAccess(
  request: InstructionAccessRequest,
  prescription: CarePrescription | null,
  pharmacy: CarePharmacyAssignment | null,
  instruction: CareInstructionBinding | null,
): InstructionAccessResult {
  if (
    !prescription ||
    (prescription.status !== "signed" && prescription.status !== "sent_to_pharmacy")
  ) {
    return { allowed: false, reason: "prescription_unavailable" };
  }
  if (prescription.patientId !== request.patientId) return { allowed: false, reason: "patient_mismatch" };
  if (!pharmacy || pharmacy.status !== "accepted") return { allowed: false, reason: "pharmacy_unavailable" };
  if (pharmacy.patientId !== request.patientId) return { allowed: false, reason: "patient_mismatch" };
  if (
    pharmacy.id !== request.pharmacyAssignmentId ||
    pharmacy.prescriptionId !== request.prescriptionId ||
    prescription.id !== request.prescriptionId ||
    prescription.formulationRef !== request.formulationRef ||
    prescription.concentrationRef !== request.concentrationRef ||
    !instruction ||
    instruction.patientId !== request.patientId ||
    instruction.prescriptionId !== request.prescriptionId ||
    instruction.pharmacyAssignmentId !== request.pharmacyAssignmentId ||
    instruction.formulationRef !== request.formulationRef ||
    instruction.concentrationRef !== request.concentrationRef ||
    instruction.version !== request.instructionVersion
  ) {
    return { allowed: false, reason: "binding_mismatch" };
  }
  if (!instruction.isCurrent) return { allowed: false, reason: "instruction_not_current" };
  return { allowed: true };
}

function emptySupplyFields(): EmptySupplyFields {
  return Object.fromEntries(SUPPLY_FIELD_NAMES.map((name) => [name, null])) as unknown as EmptySupplyFields;
}

export function createPatientSupplyKitDraft(input: {
  id: string;
  patientId: string;
  prescription: CarePrescription;
  pharmacy: CarePharmacyAssignment;
  instruction: CareInstructionBinding;
}): PatientSupplyKitDraft {
  const access = authorizeInstructionAccess(
    {
      patientId: input.patientId,
      prescriptionId: input.prescription.id,
      pharmacyAssignmentId: input.pharmacy.id,
      formulationRef: input.instruction.formulationRef,
      concentrationRef: input.instruction.concentrationRef,
      instructionVersion: input.instruction.version,
    },
    input.prescription,
    input.pharmacy,
    input.instruction,
  );
  if (!access.allowed) throw new Error(`supply_gate:${access.reason}`);
  return {
    id: input.id as CareRecordId,
    patientId: input.patientId,
    prescriptionId: input.prescription.id,
    pharmacyAssignmentId: input.pharmacy.id,
    instructionBindingId: input.instruction.id,
    status: "draft",
    fields: emptySupplyFields(),
  };
}
