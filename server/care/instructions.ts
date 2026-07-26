import {
  CARE_PATIENT_INSTRUCTION_SOURCE_KINDS,
  CARE_INSTRUCTION_REQUIRED_INPUT_LABELS,
  type CareInstructionSource,
  type CareInstructionReadinessFacts,
  type CareInstructionRequiredInputLabel,
  type CarePatientInstruction,
  type CareSupplyKit,
} from "@shared/care/instructions";

export function evaluateCareInstructionReadiness(
  facts: CareInstructionReadinessFacts,
) {
  const requiredInputs: CareInstructionRequiredInputLabel[] = [];
  const checks: readonly [
    keyof CareInstructionReadinessFacts,
    CareInstructionRequiredInputLabel,
  ][] = [
    ["pharmacyLabelVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.pharmacyLabel],
    ["pharmacyInformationVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.pharmacyInformation],
    ["clinicianDirectionVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.clinicianDirection],
    ["manufacturerMaterialVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.manufacturerMaterial],
    ["patientInstructionContentVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.patientInstructions],
    ["patientInstructionReviewed", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.instructionReview],
    ["productSpecificDeviceVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.device],
    ["supplySourceVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.supplier],
    ["replacementCadenceVerified", CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.replacementCadence],
  ];
  for (const [key, label] of checks) if (!facts[key]) requiredInputs.push(label);
  const operationalReady = facts.prescriptionSigned && requiredInputs.length === 0;
  if (!facts.publicActivationApproved) {
    requiredInputs.push(CARE_INSTRUCTION_REQUIRED_INPUT_LABELS.careActivation);
  }
  return {
    softwareReady: true as const,
    operationalReady,
    publicReady: operationalReady && facts.publicActivationApproved,
    requiredInputs,
  };
}

export type CareInstructionReleaseGate =
  | { allowed: true; instruction: CarePatientInstruction }
  | {
      allowed: false;
      reason:
        | "signed_prescription_required"
        | "assigned_human_clinician_required"
        | "verified_patient_sources_required"
        | "general_education_not_patient_instruction"
        | "instruction_not_draft";
    };

export function releaseCarePatientInstruction(input: {
  instruction: CarePatientInstruction;
  sources: readonly CareInstructionSource[];
  prescriptionSigned: boolean;
  assignedClinicianUserId: string;
  actor: { subjectId: string; kind: "human_clinician" | "automation" | "ai" };
}): CareInstructionReleaseGate {
  if (!input.prescriptionSigned) {
    return { allowed: false, reason: "signed_prescription_required" };
  }
  if (
    input.actor.kind !== "human_clinician" ||
    input.actor.subjectId !== input.assignedClinicianUserId
  ) {
    return { allowed: false, reason: "assigned_human_clinician_required" };
  }
  if (input.instruction.status !== "draft") {
    return { allowed: false, reason: "instruction_not_draft" };
  }
  if (input.sources.some((source) => source.kind === "general_education")) {
    return { allowed: false, reason: "general_education_not_patient_instruction" };
  }
  const requiredSourceIds = new Set(input.instruction.sourceIds);
  const sourcesValid =
    requiredSourceIds.size > 0 &&
    input.sources.length === requiredSourceIds.size &&
    input.sources.every(
      (source) =>
        requiredSourceIds.has(source.id) &&
        CARE_PATIENT_INSTRUCTION_SOURCE_KINDS.includes(
          source.kind as (typeof CARE_PATIENT_INSTRUCTION_SOURCE_KINDS)[number],
        ) &&
        source.patientId === input.instruction.patientId &&
        source.prescriptionId === input.instruction.prescriptionId &&
        source.verified &&
        source.supersededAt === null,
    );
  if (!sourcesValid) {
    return { allowed: false, reason: "verified_patient_sources_required" };
  }
  return {
    allowed: true,
    instruction: {
      ...input.instruction,
      status: "released",
      version: input.instruction.version + 1,
    },
  };
}

export type CareSupplyReleaseGate =
  | { allowed: true; supplyKit: CareSupplyKit }
  | {
      allowed: false;
      reason:
        | "signed_prescription_required"
        | "verified_patient_instruction_required"
        | "product_specific_device_required"
        | "verified_supplier_required"
        | "replacement_cadence_required"
        | "supply_kit_not_verified";
    };

export function releaseCareSupplyKit(input: {
  supplyKit: CareSupplyKit;
  prescriptionSigned: boolean;
  instructionReleased: boolean;
}): CareSupplyReleaseGate {
  if (!input.prescriptionSigned) {
    return { allowed: false, reason: "signed_prescription_required" };
  }
  if (!input.instructionReleased) {
    return { allowed: false, reason: "verified_patient_instruction_required" };
  }
  if (!input.supplyKit.productSpecificDevice?.trim()) {
    return { allowed: false, reason: "product_specific_device_required" };
  }
  if (!input.supplyKit.verifiedSupplierReference?.trim()) {
    return { allowed: false, reason: "verified_supplier_required" };
  }
  if (!input.supplyKit.replacementCadence?.trim()) {
    return { allowed: false, reason: "replacement_cadence_required" };
  }
  if (input.supplyKit.status !== "verified") {
    return { allowed: false, reason: "supply_kit_not_verified" };
  }
  return {
    allowed: true,
    supplyKit: {
      ...input.supplyKit,
      status: "released",
      version: input.supplyKit.version + 1,
    },
  };
}
